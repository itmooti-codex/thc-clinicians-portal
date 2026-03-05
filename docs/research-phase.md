# Research Phase — Business Intelligence Collection

The research phase automatically collects business intelligence from a client's VitalStats and Ontraport APIs before any features are planned. This ensures the app is built with a deep understanding of how the business operates.

**IMPORTANT: Research data must NEVER be acted on without explicit user confirmation.** After running the research script, the [Research Review Process](research-review-process.md) is MANDATORY. Research data may contain stale fields, unused statuses, legacy objects, or outdated automation patterns. Every assumption derived from research must be validated before it influences app design or feature planning.

## Research Script

```bash
node scripts/research.cjs \
  --slug clientslug \
  --api-key "VITALSYNC_API_KEY" \
  --datasource-id "base64_datasource_id" \
  --target ../app-name \
  [--skip-ontraport] \
  [--skip-website] \
  [--verbose]
```

Only 3 credentials needed — all from VitalStats (no direct Ontraport API keys required for reads).

## Data Collectors

| Collector | What It Collects | API |
|-----------|-----------------|-----|
| `business-profile` | Company name, logo, address, website, branding | Ontraport REST |
| `object-discovery` | All objects via `CustomObjects` + `getInfo` (counts, listFields, sums, widgets) | Ontraport REST |
| `groups` | All Ontraport Groups with filter criteria + SDK query equivalents | Ontraport REST |
| `field-metadata` | Field definitions, ID→alias mapping, **dropdown colors** (color + backgroundColor per option) | Ontraport REST |
| `record-counts` | Supplemental counts via GraphQL `calc` queries | VitalStats GraphQL |
| `sample-data` | 5 recent records from each active model | VitalStats GraphQL |
| `automation-logs` | AutomationLogEntry + ObjectLogEntry records, aggregated by type/channel | VitalStats GraphQL |
| `field-distributions` | Enum field value counts (which statuses are actually used) | VitalStats GraphQL |
| `sync-gap-analysis` | Ontraport objects/fields NOT synced to VitalStats schema | Cross-reference (no API) |
| `website-snapshot` | Business website pages — titles, headings, services, messaging | HTTP fetch |

## MCP Tools vs. Research Script

With the **VitalSync MCP server** installed per-project (`.mcp.json`), Claude has live access to schema introspection, GraphQL queries, and Ontraport REST during development. This changes how the research data is used:

- **MCP tools are for development-time schema discovery** — use `vitalsync_introspect_schema` and `vitalsync_describe_model` any time during coding to look up field names, types, enums, and query syntax. No need to consult `schema.xml` for basic field info.
- **The research script is for pre-development business intelligence** — it collects automation patterns, dropdown colors, field population stats, sync gaps, and website messaging that inform feature planning. Run once before building features.
- **They complement each other** — research script gives business context (what matters), MCP tools give technical details (how to query it).

### Collector ↔ MCP Tool Overlap

| Collector | MCP Tool Alternative | Still Need Script? |
|-----------|---------------------|-------------------|
| `business-profile` | `vitalsync_ontraport_read` | Yes — script synthesizes into knowledge-base |
| `object-discovery` | `vitalsync_ontraport_read` + `vitalsync_introspect_schema` | Yes — script collects listFields, sums, widget settings |
| `groups` | `vitalsync_ontraport_read` (object: `Groups`) | Yes — script converts to SDK query equivalents |
| `field-metadata` | `vitalsync_ontraport_read` (fieldeditor) + `vitalsync_describe_model` | Yes — script extracts dropdown colors (unique to fieldeditor) |
| `record-counts` | `vitalsync_calc_query` | Partially — MCP can do this ad-hoc |
| `sample-data` | `vitalsync_query` | Partially — MCP can fetch samples ad-hoc |
| `automation-logs` | `vitalsync_query` | Yes — script aggregates patterns across all objects |
| `field-distributions` | `vitalsync_calc_query` with filters | Partially — MCP can query individual fields ad-hoc |
| `sync-gap-analysis` | No MCP equivalent | Yes — requires cross-referencing schema.xml with Ontraport |
| `website-snapshot` | No MCP equivalent | Yes — HTTP fetch of business website |

**For existing apps** where the research phase has already run, use MCP tools directly for any schema questions during development. For **new apps**, always run the research script first — the knowledge base it produces is essential for feature planning.

### When schema.xml Is Still Needed

The XML schema is still required for:
- **Type generation** — `parse-schema.cjs` generates TypeScript types and `schema-reference.json` from `schema.xml`
- **Sync gap analysis** — collector 10 compares XML against Ontraport to find unsynced fields
- **Relationship details** — foreign keys, cascade rules, `relationshipType` (not available via GraphQL introspection)
- **Form layout column groups** — though Ontraport's `fieldeditor` endpoint also provides section groupings

For day-to-day development field lookups, MCP's `vitalsync_describe_model` is faster and always up-to-date.

## Research Output Structure

```
../app-name/research/
├── raw/                              # Gitignored — contains PII
│   ├── business-profile.json
│   ├── object-discovery.json
│   ├── record-counts.json
│   ├── sample-{model}.json
│   ├── automation-logs.json
│   ├── groups.json
│   ├── field-metadata.json
│   ├── field-distributions.json
│   ├── sync-gap-analysis.json
│   └── website-snapshot.json
├── knowledge-base.md                # Synthesized findings (committed, no PII)
└── research-config.json             # What was collected, timestamps
```

## Research Review (MANDATORY)

After the research script completes, the **Research Review Process** must be run before any features are planned or built. This is a structured confirmation step where findings are presented to the user as specific questions, not statements.

Read **`docs/research-review-process.md`** for the full process — 8 review categories, question templates, and the `confirmed-findings.md` output format.

```
Research Script → knowledge-base.md → RESEARCH REVIEW → confirmed-findings.md → Feature Planning
```

The review process is extensible — add new categories for new use cases by following the template in the review document.

## Knowledge Base Contents

The generated `research/knowledge-base.md` includes:
- **Business Profile** — company info, branding, website summary
- **Data Overview** — models ranked by record count, empty/unused models
- **Business Process Map** — automation patterns, communication channels (SMS/email/phone)
- **Segmentation** — Ontraport Groups organized by object type with SDK query equivalents
- **Field Importance** — listFields priorities, KPI fields (sums)
- **Status Field Colors** — exact hex color + backgroundColor for every dropdown option (replaces generic `getStatusColor()`)
- **Sync Gaps** — objects/fields in Ontraport but NOT in VitalStats (must be synced before the app can use them)
- **Field Distributions** — enum value counts showing which statuses are actually used

## GraphQL Query Patterns for Research

**AutomationLogEntry queries** use `object_type_id` to filter by Ontraport object (0=Contacts):
```graphql
query calcAutomationLogEntries($limit: IntScalar) {
  calcAutomationLogEntries(
    query: [{ where: { object_type_id: 0 } }]
    limit: $limit
    orderBy: [{ path: ["Timestamp"], type: desc }]
  ) {
    Timestamp: field(arg: ["_ts_"])
    Type: field(arg: ["type"])
    Description: field(arg: ["description"])
  }
}
```

**ObjectLogEntry queries** (communication/activity logs) — count first, then fetch:
```graphql
query calcObjectLogEntries($limit: IntScalar) {
  calcObjectLogEntries(
    query: [{ where: { object_type_id: 0 } }]
    limit: $limit
    orderBy: [{ path: ["Time"], type: desc }]
  ) {
    Timestamp: field(arg: ["_ts_"])
    Type: field(arg: ["type"])
    Status: field(arg: ["status"])
    Subject: field(arg: ["Message", "subject"])
  }
}
```

**Per-contact ObjectLogEntry query** (for app features, not research):
```graphql
query calcObjectLogEntries(
  $Contact_id: PhyxContactID!
  $limit: IntScalar
  $offset: IntScalar
) {
  calcObjectLogEntries(
    query: [{ where: { Contact_id: $Contact_id } }]
    limit: $limit
    offset: $offset
    orderBy: [{ path: ["Time"], type: desc }]
  ) {
    ID: field(arg: ["id"])
    Details: field(arg: ["details"])
    Subject: field(arg: ["Message", "subject"])
    MessageBody: field(arg: ["Message", "message_body"])
    Status: field(arg: ["status"])
    CreatedAt: field(arg: ["ObjectLogEntryItems", "created_at"])
  }
}
```

## Dropdown Field Color Extraction

The field-metadata collector fetches exact colors for every dropdown field option via `{ObjectName}/fieldeditor?field={fieldId}`. Each option includes:
- `label` — display text
- `color` — text hex color (e.g., `#43a047`)
- `backgroundColor` — background hex color (e.g., `#d9ecda`)

These map directly to MUI `<Chip sx={{ color, backgroundColor }}>` — no keyword-matching guesswork needed. The knowledge base outputs these as ready-to-use color tables.
