#!/usr/bin/env node
/**
 * parse-schema.js — Parse VitalStats schema.xml and generate type definitions + reference docs.
 *
 * Usage:  node scripts/parse-schema.js
 *
 * Reads:  schema/schema.xml
 * Writes: src/types/models.js   (JSDoc typedefs + MODELS metadata)
 *         schema/schema-reference.json  (full parsed schema for Claude)
 *         CLAUDE.md              (inserts/replaces schema summary between markers)
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// ─── Paths ───────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const SCHEMA_XML = path.join(ROOT, 'schema', 'schema.xml');
const MODELS_JS = path.join(ROOT, 'src', 'types', 'models.js');
const MODELS_TS = path.join(ROOT, 'src', 'types', 'index.ts');
const SCHEMA_JSON = path.join(ROOT, 'schema', 'schema-reference.json');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

const SCHEMA_START = '<!-- SCHEMA:START';
const SCHEMA_END = '<!-- SCHEMA:END -->';

// ─── Type mapping (XML type → JS/TS type) ────────────────────────────────────
const TYPE_MAP = {
  'integer': 'number',
  'float': 'number',
  'currency': 'number',
  'percent float as fraction (1 = 100%)': 'number',
  'boolean': 'boolean',
  'text': 'string',
  'longtext': 'string',
  'string': 'string',
  'email': 'string',
  'phone or sms as string': 'string',
  'physical address string': 'string',
  'url string': 'string',
  'image file url': 'string',
  'unix timestamp as integer': 'number',
  'IANA time zone string': 'string',
  'ISO 3166-1 alpha-2 code': 'string',
  'ISO 3166-2 code for Australian states and territories': 'string',
  'ISO 3166-2 code for US states': 'string',
  'ISO 3166-2 code for Canadian provinces and territories': 'string',
  'json': 'Record<string, unknown>',
  'geographic point': 'string',
  'latitude as float': 'number',
  'longitude as float': 'number',
  'enum': 'string', // overridden per-field with union
};

// Short type labels for CLAUDE.md compact format
const TYPE_SHORT = {
  'integer': 'int',
  'float': 'float',
  'currency': 'currency',
  'percent float as fraction (1 = 100%)': 'percent',
  'boolean': 'bool',
  'text': 'text',
  'longtext': 'longtext',
  'string': 'string',
  'email': 'email',
  'phone or sms as string': 'phone',
  'physical address string': 'address',
  'url string': 'url',
  'image file url': 'imageUrl',
  'unix timestamp as integer': 'ts',
  'IANA time zone string': 'tz',
  'ISO 3166-1 alpha-2 code': 'countryCode',
  'ISO 3166-2 code for Australian states and territories': 'stateCode',
  'ISO 3166-2 code for US states': 'stateCode',
  'ISO 3166-2 code for Canadian provinces and territories': 'stateCode',
  'json': 'json',
  'geographic point': 'geoPoint',
  'latitude as float': 'lat',
  'longitude as float': 'lng',
  'enum': 'enum',
};

// System fields to exclude from user-facing types
const SYSTEM_FIELDS = new Set(['_ts_', '_tsCreate_', '_tsUpdateCount_']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function getJsType(col) {
  var type = col['@_type'] || 'string';
  if (col['@_primaryKey'] === 'true') {
    return type === 'string' ? 'string' : 'number';
  }
  if (col['@_foreignKey'] === 'true') return 'number';
  return TYPE_MAP[type] || 'string';
}

function getEnumValues(col) {
  var enums = ensureArray(col.enum);
  return enums.map(function (e) {
    return typeof e === 'object' ? (e['@_value'] || e.value || String(e)) : String(e);
  }).filter(Boolean);
}

function mapRefTable(internalName) {
  // Strip common prefixes (Thc, Phyx, etc.) to get publicName
  // We'll resolve this properly using the table map
  return internalName;
}

// ─── Parse XML ───────────────────────────────────────────────────────────────

function parseSchema() {
  if (!fs.existsSync(SCHEMA_XML)) {
    console.error('Error: schema/schema.xml not found at', SCHEMA_XML);
    console.error('Place your VitalStats schema XML export at schema/schema.xml and re-run.');
    process.exit(1);
  }

  var xml = fs.readFileSync(SCHEMA_XML, 'utf8');

  var parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: function (name) {
      // Force these to always be arrays even if only 1 child
      return ['table', 'column', 'enum', 'group', 'index'].indexOf(name) !== -1;
    },
  });

  var doc = parser.parse(xml);
  var db = doc.database;
  if (!db) {
    console.error('Error: could not find <database> root element in schema XML.');
    process.exit(1);
  }

  var rawTables = ensureArray(db.table);

  // Build internal→public name map
  var nameMap = {};
  rawTables.forEach(function (t) {
    nameMap[t['@_name']] = t['@_publicName'] || t['@_name'];
  });

  var tables = {};

  rawTables.forEach(function (t) {
    var internalName = t['@_name'];
    var publicName = t['@_publicName'] || internalName;
    var description = '';
    if (t.description) {
      description = typeof t.description === 'string' ? t.description : (t.description['#text'] || '');
    }

    // Groups
    var rawGroups = [];
    if (t.groups && t.groups.group) {
      rawGroups = ensureArray(t.groups.group);
    }
    var groups = rawGroups.map(function (g) {
      return { id: parseInt(g['@_id'], 10), name: g['@_name'] || '' };
    });
    var groupMap = {};
    groups.forEach(function (g) { groupMap[g.id] = g.name; });

    // Columns
    var rawCols = ensureArray(t.column);
    var columns = [];

    rawCols.forEach(function (c) {
      var name = c['@_name'];
      if (!name) return;
      if (SYSTEM_FIELDS.has(name)) return;

      var type = c['@_type'] || 'string';
      var isPK = c['@_primaryKey'] === 'true';
      var isFK = c['@_foreignKey'] === 'true';
      var isRequired = c['@_required'] === 'true' || isPK;
      var groupId = c['@_groupId'] ? parseInt(c['@_groupId'], 10) : null;

      var enumValues = [];
      if (type === 'enum') {
        enumValues = getEnumValues(c);
      }

      var fk = null;
      if (isFK && c['@_referenceTable']) {
        fk = {
          table: nameMap[c['@_referenceTable']] || c['@_referenceTable'],
          sdkName: c['@_referenceTable'],
          column: c['@_referenceColumn'] || 'id',
        };
      }

      columns.push({
        name: name,
        type: type,
        jsType: getJsType(c),
        shortType: TYPE_SHORT[type] || type,
        required: isRequired,
        primaryKey: isPK,
        foreignKey: isFK,
        fk: fk,
        description: c['@_description'] || '',
        groupId: groupId,
        groupName: groupId != null ? (groupMap[groupId] || '') : '',
        enum: enumValues.length > 0 ? enumValues : null,
        min: c['@_min'] || null,
        max: c['@_max'] || null,
        precision: c['@_precision'] || null,
        default: c['@_default'] || null,
      });
    });

    tables[publicName] = {
      sdkName: internalName,
      publicName: publicName,
      description: description,
      groups: groups,
      columns: columns,
      fieldCount: columns.length,
    };
  });

  return tables;
}

// ─── Generate schema-reference.json ──────────────────────────────────────────

function writeSchemaJson(tables) {
  var output = { generatedAt: new Date().toISOString(), tables: tables };
  fs.writeFileSync(SCHEMA_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log('  Written: schema/schema-reference.json');
}

// ─── Generate JSDoc models.js ────────────────────────────────────────────────

function writeModelsJs(tables) {
  var lines = [];
  var appName = path.basename(ROOT);

  lines.push('// ' + appName + ' — Model Type Definitions (JSDoc)');
  lines.push('// Auto-generated by parse-schema.js from schema/schema.xml');
  lines.push('// Re-generate: npm run parse-schema');
  lines.push('//');
  lines.push('// Usage: reference these types in your JS files with:');
  lines.push('//   /** @type {Contact} */');
  lines.push('//   var contact = records[0];');
  lines.push('');

  var tableNames = Object.keys(tables);

  // JSDoc typedefs
  tableNames.forEach(function (name) {
    var t = tables[name];
    lines.push('/**');
    if (t.description) {
      lines.push(' * ' + t.description.replace(/\n/g, ' ').substring(0, 200));
    }
    lines.push(' * @typedef {Object} ' + name);

    t.columns.forEach(function (col) {
      var jsType = col.jsType;
      // Enum → union type
      if (col.enum && col.enum.length > 0) {
        jsType = col.enum.map(function (v) { return "'" + v.replace(/'/g, "\\'") + "'"; }).join('|');
      }
      // JSON special case for JSDoc
      if (col.type === 'json') {
        jsType = 'Object';
      }

      var optional = col.required ? '' : '[';
      var optionalEnd = col.required ? '' : ']';
      var comment = '';
      if (col.fk) comment = ' - FK → ' + col.fk.table;
      else if (col.shortType === 'ts') comment = ' - unix timestamp';
      else if (col.shortType === 'currency') comment = ' - currency';
      else if (col.shortType === 'percent') comment = ' - percent (1 = 100%)';
      else if (col.shortType === 'imageUrl') comment = ' - image URL';
      else if (col.description && col.description.length < 60) comment = ' - ' + col.description;

      lines.push(' * @property {' + jsType + '} ' + optional + col.name + optionalEnd + comment);
    });

    lines.push(' */');
    lines.push('');
  });

  // MODELS metadata
  lines.push('/**');
  lines.push(' * Model metadata for VitalSync SDK queries.');
  lines.push(' * Use MODELS.ModelName.sdkName with plugin.switchTo().');
  lines.push(' */');
  lines.push('var MODELS = {');

  tableNames.forEach(function (name, idx) {
    var t = tables[name];
    var fieldNames = t.columns.map(function (c) { return "'" + c.name + "'"; });
    lines.push('  ' + name + ': {');
    lines.push("    sdkName: '" + t.sdkName + "',");
    lines.push("    publicName: '" + t.publicName + "',");
    lines.push('    fields: [');

    // Wrap field names at ~100 chars per line
    var line = '      ';
    fieldNames.forEach(function (f, i) {
      var sep = i < fieldNames.length - 1 ? ', ' : '';
      if (line.length + f.length + sep.length > 100) {
        lines.push(line);
        line = '      ' + f + sep;
      } else {
        line += f + sep;
      }
    });
    if (line.trim()) lines.push(line);

    lines.push('    ],');

    // detailFields — all non-PK, non-system fields (useful for detail views)
    var detailFields = t.columns.filter(function (c) { return !c.primaryKey; }).map(function (c) { return "'" + c.name + "'"; });
    lines.push('    detailFields: [');
    var dLine = '      ';
    detailFields.forEach(function (f, i) {
      var sep = i < detailFields.length - 1 ? ', ' : '';
      if (dLine.length + f.length + sep.length > 100) {
        lines.push(dLine);
        dLine = '      ' + f + sep;
      } else {
        dLine += f + sep;
      }
    });
    if (dLine.trim()) lines.push(dLine);
    lines.push('    ],');

    lines.push('  },');
  });

  lines.push('};');
  lines.push('');

  fs.writeFileSync(MODELS_JS, lines.join('\n'), 'utf8');
  console.log('  Written: src/types/models.js');
}

// ─── Generate TypeScript index.ts ────────────────────────────────────────────

function writeModelsTs(tables) {
  var lines = [];
  var appName = path.basename(ROOT);

  lines.push('// ' + appName + ' — Model Type Definitions');
  lines.push('// Auto-generated by parse-schema.js from schema/schema.xml');
  lines.push('// Re-generate: npm run parse-schema');
  lines.push('');
  lines.push('// eslint-disable-next-line @typescript-eslint/no-explicit-any');
  lines.push('export type VitalSyncPlugin = any;');
  lines.push('// eslint-disable-next-line @typescript-eslint/no-explicit-any');
  lines.push('export type VitalSyncQuery = any;');
  lines.push('');

  var tableNames = Object.keys(tables);

  // TypeScript interfaces
  tableNames.forEach(function (name) {
    var t = tables[name];
    if (t.description) {
      lines.push('/** ' + t.description.replace(/\n/g, ' ').substring(0, 200) + ' */');
    }
    lines.push('export interface ' + name + ' {');

    t.columns.forEach(function (col) {
      var tsType = col.jsType;
      // Enum → union type
      if (col.enum && col.enum.length > 0) {
        tsType = col.enum.map(function (v) { return "'" + v.replace(/'/g, "\\'") + "'"; }).join(' | ');
      }

      var optional = col.required ? '' : '?';
      var comment = '';
      if (col.fk) comment = ' // FK → ' + col.fk.table;
      else if (col.shortType === 'ts') comment = ' // unix timestamp';
      else if (col.shortType === 'currency') comment = ' // currency';
      else if (col.shortType === 'percent') comment = ' // percent (1 = 100%)';

      lines.push('  ' + col.name + optional + ': ' + tsType + ';' + comment);
    });

    lines.push('}');
    lines.push('');
  });

  // MODELS metadata constant
  lines.push('export const MODELS = {');

  tableNames.forEach(function (name) {
    var t = tables[name];
    var fieldNames = t.columns.map(function (c) { return "'" + c.name + "'"; });
    lines.push('  ' + name + ': {');
    lines.push("    sdkName: '" + t.sdkName + "' as const,");
    lines.push("    publicName: '" + t.publicName + "' as const,");
    lines.push('    fields: [');

    var line = '      ';
    fieldNames.forEach(function (f, i) {
      var sep = i < fieldNames.length - 1 ? ', ' : '';
      if (line.length + f.length + sep.length > 100) {
        lines.push(line);
        line = '      ' + f + sep;
      } else {
        line += f + sep;
      }
    });
    if (line.trim()) lines.push(line);

    lines.push('    ] as const,');
    lines.push('  },');
  });

  lines.push('} as const;');
  lines.push('');

  fs.writeFileSync(MODELS_TS, lines.join('\n'), 'utf8');
  console.log('  Written: src/types/index.ts');
}

// ─── Generate CLAUDE.md schema section ───────────────────────────────────────

function buildSchemaMarkdown(tables) {
  var lines = [];
  var tableNames = Object.keys(tables);
  var totalCols = tableNames.reduce(function (sum, n) { return sum + tables[n].fieldCount; }, 0);

  lines.push(SCHEMA_START + ' — Auto-generated by parse-schema.js. Do not edit manually. -->');
  lines.push('## Schema Reference');
  lines.push('');
  lines.push(tableNames.length + ' tables, ' + totalCols + ' columns. Full details: `schema/schema-reference.json`');
  lines.push('');

  tableNames.forEach(function (name) {
    var t = tables[name];
    lines.push('### ' + name + ' (SDK: `' + t.sdkName + '`) — ' + t.fieldCount + ' fields');

    // Group columns by groupName
    var grouped = {};
    var ungrouped = [];
    t.columns.forEach(function (col) {
      if (col.groupName) {
        if (!grouped[col.groupName]) grouped[col.groupName] = [];
        grouped[col.groupName].push(col);
      } else {
        ungrouped.push(col);
      }
    });

    // Render grouped
    var groupNames = Object.keys(grouped);
    groupNames.forEach(function (gName) {
      var cols = grouped[gName];
      var compactFields = cols.map(function (col) {
        var suffix = '';
        if (col.primaryKey) suffix = '(PK)';
        else if (col.fk) suffix = '(FK→' + col.fk.table + ')';
        else if (col.enum) {
          if (col.enum.length <= 6) {
            suffix = '(enum:' + col.enum.join('|') + ')';
          } else {
            suffix = '(enum:' + col.enum.length + ' values)';
          }
        } else if (col.shortType !== 'text' && col.shortType !== 'string' && col.shortType !== 'int') {
          suffix = '(' + col.shortType + ')';
        }
        return col.name + suffix;
      });

      lines.push('**' + gName + ':** ' + compactFields.join(', '));
    });

    // Render ungrouped
    if (ungrouped.length > 0) {
      var compactFields = ungrouped.map(function (col) {
        var suffix = '';
        if (col.primaryKey) suffix = '(PK)';
        else if (col.fk) suffix = '(FK→' + col.fk.table + ')';
        else if (col.enum) {
          suffix = col.enum.length <= 6
            ? '(enum:' + col.enum.join('|') + ')'
            : '(enum:' + col.enum.length + ' values)';
        } else if (col.shortType !== 'text' && col.shortType !== 'string' && col.shortType !== 'int') {
          suffix = '(' + col.shortType + ')';
        }
        return col.name + suffix;
      });
      lines.push('**Other:** ' + compactFields.join(', '));
    }

    lines.push('');
  });

  lines.push(SCHEMA_END);
  return lines.join('\n');
}

function writeClaudeMd(tables) {
  var schemaBlock = buildSchemaMarkdown(tables);

  if (!fs.existsSync(CLAUDE_MD)) {
    // No CLAUDE.md yet — create one with just the schema section
    var content = '# Project Instructions\n\n' +
      'See the main VibeCodeApps CLAUDE.md for full documentation.\n\n' +
      schemaBlock + '\n';
    fs.writeFileSync(CLAUDE_MD, content, 'utf8');
    console.log('  Created: CLAUDE.md (with schema section)');
    return;
  }

  // CLAUDE.md exists — replace between markers
  var existing = fs.readFileSync(CLAUDE_MD, 'utf8');
  var startIdx = existing.indexOf(SCHEMA_START);
  var endIdx = existing.indexOf(SCHEMA_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing schema section
    var before = existing.substring(0, startIdx);
    var after = existing.substring(endIdx + SCHEMA_END.length);
    fs.writeFileSync(CLAUDE_MD, before + schemaBlock + after, 'utf8');
    console.log('  Updated: CLAUDE.md (replaced schema section)');
  } else {
    // No markers — append
    fs.writeFileSync(CLAUDE_MD, existing.trimEnd() + '\n\n' + schemaBlock + '\n', 'utf8');
    console.log('  Updated: CLAUDE.md (appended schema section)');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('parse-schema: Parsing schema/schema.xml...');
  var tables = parseSchema();
  var tableNames = Object.keys(tables);
  var totalCols = tableNames.reduce(function (sum, n) { return sum + tables[n].fieldCount; }, 0);
  console.log('  Found ' + tableNames.length + ' tables, ' + totalCols + ' columns');
  console.log('');

  // Auto-detect app type
  var isReact = fs.existsSync(path.join(ROOT, 'tsconfig.json')) ||
                fs.existsSync(path.join(ROOT, 'tsconfig.app.json'));

  // Write outputs
  writeSchemaJson(tables);

  if (isReact) {
    writeModelsTs(tables);
  } else {
    writeModelsJs(tables);
  }

  writeClaudeMd(tables);

  console.log('');
  console.log('Done! Schema parsed successfully.');
}

main();
