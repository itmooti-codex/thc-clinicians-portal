# Schema XML Format

The VitalStats schema is exported as an XML file. This section documents how to parse and use it when building apps.

## File Location

The schema XML is placed at `../app-name/schema/schema.xml` during the new app workflow.

## Root Structure

```xml
<database type="mysql:8">
  <instructions>
    <instruction type="table naming structure"><![CDATA[...]]></instruction>
  </instructions>
  <table name="ThcContact" publicName="Contact">...</table>
  <table name="ThcOrder" publicName="Order">...</table>
  <!-- more tables -->
</database>
```

## Table Naming Convention

Table names are prefixed with `"Thc"` internally (e.g., `ThcContact`, `ThcOrder`). This prefix is **transparent to the user** — they refer to tables by their `publicName` attribute (e.g., `Contact`, `Order`).

**CRITICAL:** When using the VitalSync SDK's `.switchTo()` method, use the internal `name` attribute with the tenant prefix (e.g., `plugin.switchTo('ThcContact')`), NOT the `publicName`. The `publicName` is for UI labels and type names only.

## Table Element

```xml
<table name="ThcContact" publicName="Contact">
  <description>Optional description of the model</description>
  <groups description="meta data about groups">
    <group id="1" name="Contact Information"/>
    <group id="15" name="System Information"/>
  </groups>
  <indexes>
    <index name="sp_coordinate" column="coordinate" geospatial="true"/>
  </indexes>
  <column ... />
  <column ... />
</table>
```

**Attributes:**
- `name` — Internal prefixed table name (use for SQL/database reference only)
- `publicName` — User-facing model name (use for SDK calls, UI labels, TypeScript types)

**Child elements:**
- `<description>` — Optional text or CDATA describing the model's purpose
- `<groups>` — Column grouping metadata (useful for organizing form sections)
- `<indexes>` — Database indexes (mostly informational)
- `<column>` — Field definitions (see below)

## Column Element

```xml
<column
  name="email"
  type="email"
  description="The contact's email address"
  primaryKey="true|false"
  autoIncrement="true|false"
  autoGenerate="true|false"
  required="true|false"
  foreignKey="true|false"
  relationshipType="many-to-one"
  referenceTable="ThcUser"
  referenceColumn="id"
  onDelete="cascade"
  onUpdate="cascade"
  min="0"
  max="255"
  precision="2"
  default="0"
  sqlType="BIGINT"
  groupId="1"
/>
```

**Key attributes:**
- `name` — Field name (use in SDK `.select()`, `.where()`, `.set()`)
- `type` — Data type (see type list below)
- `description` — Human-readable description (use for UI tooltips/labels)
- `primaryKey` — Whether this is the primary key
- `foreignKey` — Whether this field references another table
- `referenceTable` — The table this FK points to (uses internal name with Thc prefix — map to publicName)
- `referenceColumn` — The column in the referenced table (always `id`)
- `relationshipType` — Always `many-to-one` (the FK column is on the "many" side)
- `groupId` — Links to a `<group>` element for UI organization
- `min`/`max` — Value constraints
- `precision` — Decimal precision for numeric types

## Data Types

All possible values for the `type` attribute:

| Type | Description | SDK/JS Handling |
|---|---|---|
| `integer` | Whole number | `number` |
| `float` | Decimal number | `number`, use `precision` for decimal places |
| `currency` | Money value | `number`, always 2 decimal precision, format with locale currency |
| `percent float as fraction (1 = 100%)` | Percentage stored as decimal | `number`, multiply by 100 for display |
| `boolean` | True/false | `boolean`, SDK may return `0`/`1` |
| `text` | Short text (varchar) | `string` |
| `longtext` | Large text (blob) | `string` |
| `string` | Fixed-length string | `string`, check `max` for length |
| `email` | Email address | `string`, validate as email |
| `phone or sms as string` | Phone number | `string`, format for display |
| `physical address string` | Street/postal address | `string` |
| `url string` | URL | `string`, render as link |
| `image file url` | Image URL | `string`, render as `<img>` or avatar |
| `unix timestamp as integer` | Date/time as unix epoch | `number`, convert with `new Date(val * 1000)` |
| `IANA time zone string` | Timezone identifier | `string` (e.g., `"Australia/Sydney"`) |
| `ISO 3166-1 alpha-2 code` | Country code | `string` (e.g., `"AU"`, `"US"`) |
| `ISO 3166-2 code...` | State/region code | `string` (e.g., `"FL"`, `"NSW"`) |
| `json` | JSON data | `Record<string, unknown>`, parse if string |
| `geographic point` | Lat/lng point | `string`, has SRID attribute |
| `latitude as float` | Latitude | `number` |
| `longitude as float` | Longitude | `number` |
| `enum` | Enumerated values | `string`, see `<enum>` children for allowed values |

## Enum Fields

Enum columns contain `<enum>` child elements listing all valid values:

```xml
<column name="status" type="enum">
  <enum value="Active"/>
  <enum value="Inactive"/>
  <enum value="Archived"/>
</column>
```

Use these values to:
- Generate TypeScript union types (React): `type Status = 'Active' | 'Inactive' | 'Archived'`
- Generate JSDoc union types (Ontraport): `@property {'Active'|'Inactive'|'Archived'} [status]`
- Populate `<Select>` dropdowns in forms
- Color-code status badges (MUI `<Chip>` for React, CSS classes for Ontraport)

## Foreign Keys & Relationships

FK columns link models together:

```xml
<column name="owner_id" type="integer" min="1"
  foreignKey="true" relationshipType="many-to-one"
  referenceTable="ThcUser" referenceColumn="id"
  onDelete="cascade" onUpdate="cascade"/>
```

**Usage patterns:**
- Map `referenceTable` (e.g., `ThcUser`) → `publicName` (e.g., `User`) to show relationship labels in the UI
- For data grids showing related data, perform a secondary query to resolve FK IDs to display names
- When building forms, FK fields should render as searchable select/autocomplete components

## Column Groups

Groups organize columns into logical sections — use these for form layouts:

```xml
<groups description="meta data about the groups">
  <group id="1" name="Contact Information"/>
  <group id="2" name="Lead Information"/>
  <group id="15" name="System Information"/>
</groups>
<column name="email" type="email" groupId="1"/>
<column name="lead_source" type="text" groupId="2"/>
```

When building edit/detail forms, render grouped columns together under their group name as section headers. For React apps, use MUI `<Accordion>` or `<Card>` components. For Ontraport apps, use `<details>` elements or collapsible `<div>` sections. System Information groups can be collapsed by default.

## Many-to-Many Relationships

Some models represent many-to-many associations (e.g., `ContactPatientFocusOption`). These join tables have:
- A `recordId` FK pointing to the source model
- An `optionId` FK pointing to `OntraportListFieldOption`
- The `OntraportListFieldOption` model stores the friendly display name for each option

When querying these, join through the association table to get display-friendly option names.

## System Fields

Every table includes these system fields — they are managed automatically and should generally be excluded from edit forms:

| Field | Purpose |
|---|---|
| `_ts_` | Last modified timestamp (internal sync) |
| `_tsCreate_` | Creation timestamp (internal sync) |
| `_tsUpdateCount_` | Update counter (internal sync) |
| `created_at` | User-facing creation timestamp |
| `last_modified_at` | User-facing last modified timestamp |

## Parsing the Schema for App Building

When building an app, parse the schema XML to:

1. **Identify relevant models** — Based on the app purpose, select which models (tables) are needed
2. **Generate types** — For React apps: TypeScript interfaces (see React Step 4). For Ontraport apps: JSDoc `@typedef` blocks (see Ontraport Step 4)
3. **Build VitalSync queries** — Use column names in `.select()` and `.where()` calls
4. **Create UI for data** — For React: MUI DataGrid column definitions. For Ontraport: HTML tables/cards with DOM manipulation. Column type mapping:
   - `type="enum"` → use `renderCell` with `<Chip>` for status columns
   - `type="currency"` → format with `Intl.NumberFormat`
   - `type="unix timestamp as integer"` → format with `Intl.DateTimeFormat`
   - `type="image file url"` → render as `<Avatar>`
   - FK columns → resolve to display name from related model
5. **Build edit forms** — Use column groups for form sections, enum values for selects, descriptions for helper text
6. **Handle relationships** — Use FK metadata to build related data views and linked navigation
