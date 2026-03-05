# New Ontraport App Workflow

When the user wants to build an **Ontraport app**, follow this workflow:

## Step 1: Ask Setup Questions

Ask these questions (use AskUserQuestion tool):

1. **Client name** — Display name (e.g. "PHYX", "Acme Corp")
2. **Client slug** — VitalSync slug (e.g. "phyx", "acme")
3. **VitalSync API key** — API key for this tenant (can add later via Ontraport merge fields)
4. **VitalStats dataSourceId** — Base64 dataSource ID for Ontraport REST proxy (or "skip" if not available)
5. **App name** — What to call this app (e.g. "phyx-storefront", "acme-portal")
6. **Brand colors** — Primary color, secondary color (or "I'll provide later")
7. **Brand fonts** — Heading font, body font (default: Montserrat headings, Inter body)
8. **GitHub repo** — org/repo-name under itmooti-codex org (e.g. "itmooti-codex/phyx-storefront")
9. **App purpose** — Brief description of what the app should do on the Ontraport page
10. **Ontraport merge fields** — Which merge fields the app needs (e.g., Contact ID, payment gateway)

Note: No deploy target, host, port, or SSH user questions — Ontraport apps deploy to GitHub Pages.

## Step 2: Scaffold the App

Run the scaffold script with the answers:
```bash
./scripts/new-ontraport-app.sh \
  --name "Client Name" \
  --slug clientslug \
  --app-name app-name \
  --repo itmooti-codex/app-name \
  --primary-color "#000000" \
  --secondary-color "#666666"
```

This creates a new directory at `../app-name/` (sibling to VibeCodeApps) with a complete Ontraport app template.

## Step 3: Import the Data Model

Same as React workflow — ask the user to export their VitalStats schema XML and place it at:
```
../app-name/schema/schema.xml
```

Parse it using `docs/schema-format.md`.

> **MCP note:** The schema XML is used by `parse-schema.cjs` to generate JSDoc types. For ad-hoc field lookups during development, use the `vitalsync_describe_model` MCP tool instead — it returns live schema data including field names, types, enums, and correct query syntax.

## Step 4: Generate JSDoc Types

From the parsed XML schema, generate JSDoc type definitions in `src/types/models.js`.

Use the same type mapping rules as React apps, but output **JSDoc `@typedef`** instead of TypeScript interfaces:

```javascript
/**
 * @typedef {Object} Contact
 * @property {number} id
 * @property {string} [email]
 * @property {string} [first_name]
 * @property {number} [owner_id] - FK → User
 * @property {'Active'|'Inactive'|'Archived'} [status]
 * @property {number} [created_at] - unix timestamp
 */

/** Model metadata for VitalSync SDK queries */
var MODELS = {
  Contact: {
    sdkName: 'Contact',
    tableName: 'ThcContact',
    fields: ['id', 'email', 'first_name'],
  },
};
```

All the same key rules apply:
- Use `publicName` as the type name (NOT the `name` attribute with "Thc" prefix)
- Foreign key fields → `number`
- `required="true"` → non-optional; all others optional (mark with `[brackets]` in JSDoc)
- System fields can be excluded

## Step 5: Research Phase (Automated Business Intelligence)

Same as React workflow — run the research script to collect business intelligence:

```bash
node ../VibeCodeApps/scripts/research.cjs \
  --slug clientslug \
  --api-key "VITALSYNC_API_KEY" \
  --datasource-id "base64_datasource_id" \
  --target ../app-name
```

Read the generated `research/knowledge-base.md` and discuss findings with the user before building.

> **MCP note:** After research completes, MCP tools (`vitalsync_introspect_schema`, `vitalsync_query`, `vitalsync_calc_query`, `vitalsync_ontraport_read`) are available throughout development for live API queries. The research knowledge base provides business context; MCP tools provide technical execution. See `docs/research-phase.md` for the full MCP vs. research comparison.

## Step 6: Persona & Feature Discovery

Based on research findings, determine who this app is for and what it needs:
- Is this for the business's clients (customer portal, storefront) or internal use?
- Which models and segments matter most?
- What actions should users be able to take (view data, submit forms, make purchases)?
- Is real-time data needed (VitalSync subscriptions) or is static/page-load data sufficient?

**Review reusable features:** Read `docs/features/` and check each available feature against this app's use case and research findings. Proactively suggest any features that would be valuable — explain what each does and why it fits. Note that some features (e.g., OneSignal push) are mobile/React-only, but others like the AI Chat Agent can be adapted.

Present the persona, recommended features, and suggested layout to the user. Get approval on the feature set before building.

## Step 7: Build the App

Based on the app purpose, data model, and research knowledge base:

1. Write the main logic in `src/js/app.js`
2. Add any additional JS modules as new IIFE files in `src/js/` (each attaching to `window`)
3. Update `html/footer.html` to include any new `<script>` tags
4. Update `dev/index.html` to include corresponding `<script>` tags for local dev
5. Update `dev/mock-data.js` with mock values for any merge fields used
6. Style the app in `src/css/styles.css` using CSS custom properties
7. Build body HTML content in `html/body.html`

See `docs/vitalsync-sdk-patterns.md` for VitalSync query and DOM manipulation patterns in vanilla JS.

## Step 8: Set Up GitHub Pages & Deploy

1. Create a private GitHub repo: `gh repo create itmooti-codex/app-name --private --source=. --push`
2. Enable GitHub Pages in repo settings: Settings > Pages > Source: "GitHub Actions"
3. Push triggers auto-deploy to GitHub Pages
4. Verify files accessible at `https://itmooti-codex.github.io/app-name/js/app.js`

## Step 9: Configure Ontraport Page

1. **Header code**: Paste the content of `html/header.html` into Ontraport Site Settings > Header Code (or page-specific header). Replace any placeholder merge fields with actual Ontraport merge fields (e.g., `[Visitor//Contact ID]`)
2. **Body HTML**: Add HTML blocks to the Ontraport page using content from `html/body.html`
3. **Footer code**: Paste `html/footer.html` content into Ontraport Site Settings > Footer Code (or page-specific footer)
4. **Test**: Preview the Ontraport page and verify scripts load and the app functions
5. **Publish**: Publish the Ontraport page

---

# Ontraport-Specific Patterns

## Merge Fields

Ontraport renders merge fields server-side before the page reaches the browser. Common merge fields:
- `[Visitor//Contact ID]` — Logged-in visitor's contact ID
- `[Visitor//Unique ID]` — Visitor's unique identifier
- `[Contact//Field Name]` — Any contact field value
- `[product_uid]`, `[item_name]`, `[price]`, etc. — Dynamic list item fields

In header code, use merge fields to set `window.AppConfig` values:
```html
<script>
  window.AppConfig = {
    SLUG: 'clientslug',
    CONTACT_ID: '[Visitor//Contact ID]',
  };
</script>
```

## Dynamic Lists

VitalStats Dynamic Lists render server-side data into HTML. Configure with data attributes:
```html
<div
  data-dynamic-list="LIST_ID"
  data-entity="ENTITY_SLUG"
  data-entity-key="API_KEY"
  data-limit="10"
>
  <!-- Template repeated per record -->
  <div data-product-id="[product_uid]">
    <h3>[item_name]</h3>
    <p>$[price]</p>
  </div>
</div>
```

Load the Dynamic List SDK in the header:
```html
<script async src="https://static-au03.vitalstats.app/static/dynamic-list/v1/latest.js" crossorigin="anonymous"></script>
```

## Config Bridge Pattern

The config bridge connects Ontraport merge fields (server-side) to JavaScript (client-side):

1. **In Ontraport header code**: Set window globals from merge fields
2. **In `config.js`**: Read those globals and freeze the config object
3. **In `app.js`**: Access config via `window.AppConfig`

This separation means the same JS files work unchanged across different Ontraport pages — only the header code merge fields differ.

## Ontraport Page Structure

Code is deployed to three locations on an Ontraport page:

| Location | What Goes There | Example |
|---|---|---|
| **Header Code** | `<script>` config, CDN links, `<link>` styles, Google Fonts | SDK scripts, Tailwind CDN, AppConfig |
| **Body HTML** | Page content HTML blocks | App root container, dynamic lists |
| **Footer Code** | `<script>` tags loading app JS files | config.js, utils.js, vitalsync.js, app.js |

Header and footer code can be set **sitewide** (applies to all pages) or **per page**. Use sitewide for shared scripts and per-page for page-specific logic.

## Local Development Workflow

1. Run `npm run dev` — starts Vite dev server at `http://localhost:3000`
2. `dev/index.html` simulates the full Ontraport page (header + body + footer)
3. `dev/mock-data.js` provides mock values for merge fields
4. Edit `src/js/app.js` — browser hot-reloads automatically
5. When ready, push to main — GitHub Actions deploys to GitHub Pages
6. Update Ontraport page header/footer with the GitHub Pages URLs
