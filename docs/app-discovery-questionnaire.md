# App Discovery Questionnaire

**MANDATORY: Complete this questionnaire before building ANY new app.** Every question exists because a past app failed without this information. Do not skip sections.

Claude: Ask these questions interactively at the start of every "build me an app" conversation. The answers drive feature selection, scaffolding configuration, and the central `app-config.ts` file.

---

## How to Use This Questionnaire

1. **Ask Sections 1-2 first** — Business context and data models establish the foundation
2. **Run the research script** after getting VitalSync credentials (Section 2) — it pre-fills much of the data layer
3. **Run the Research Review** — present research findings as questions, get explicit confirmation before acting on any assumption. Read [Research Review Process](research-review-process.md) for the full process. **NEVER skip this step.**
4. **Present feature recommendations** based on confirmed findings using the [Feature Selection Guide](feature-selection-guide.md)
5. **Complete Sections 4-6** — Integrations, branding, deployment
6. **Generate the discovery report** — structured JSON that feeds into the scaffolding script
7. **Run the SDK test suite** — validate VitalSync connectivity before writing any feature code

---

## Section 1: Business Context

_These answers determine app complexity, terminology, and feature recommendations._

### 1.1 What does the client's business do?
**Why:** Determines UI language, domain terminology, Buddzee system prompt context.
**Default:** N/A (required)
**Example:** "PHYX is a compounding pharmacy that dispenses custom medications to patients referred by doctors."

> Answer: ___

### 1.2 Who are the primary users of this app?
**Why:** Controls UI complexity, mobile-first vs desktop-first, onboarding flow, role-based access.
**Default:** Admin staff, moderate tech comfort
**Options:** Admin staff / Sales team / Clinical staff / Managers / Clients/customers / Mixed

> Answer: ___

### 1.3 How many users will use this app?
**Why:** Drives auth complexity, role-based dashboards, push notification volume.
**Default:** 5-20
**Options:** 1-5 / 5-20 / 20-100 / 100+

> Answer: ___

### 1.4 What is the PRIMARY goal of this app?
**Why:** Determines which features to enable by default and which pages to show in navigation.
**Default:** Manage contacts
**Options:**
- **Manage contacts** — View, search, edit contact records. Core CRM.
- **Track sales** — Pipeline, deals, revenue forecasting.
- **Process tasks** — Task queue, assignment, completion tracking.
- **Communicate with clients** — Email, SMS, call logging.
- **Monitor metrics** — Dashboards, KPIs, analytics.
- **Multiple of the above** — Specify which.

> Answer: ___

### 1.5 What tools does the client use today?
**Why:** Identifies migration needs, integration points, and workflow expectations.
**Default:** Ontraport + spreadsheets
**Enables:** Integration settings for each tool mentioned.

> Answer: ___

---

## Section 2: Data & Models

_These answers configure VitalSync SDK connections and the central `app-config.ts` model definitions._

### 2.1 VitalSync account slug
**Why:** Required for SDK connection (`https://{slug}.vitalstats.app`).
**Default:** N/A (required)
**Enables:** All VitalSync features

> Slug: ___

### 2.2 VitalSync API key
**Why:** Required for SDK authentication.
**Default:** N/A (required)

> API Key: ___

### 2.3 Primary contact model
**Why:** The main entity this app manages. All apps have at least one contact/customer/patient model.
**Default:** Contact
**Needed:** Internal name (for SDK `switchTo()`), public name (for queries), key display fields.

> Internal name (e.g., PhyxContact, ThcContact, AwesomateContact): ___
> Public name (e.g., Contact): ___

### 2.4 Key fields on the primary contact
**Why:** Populates collection list display, search fields, record detail view, and filter options.
**Default:** first_name, last_name, email, sms_number, status

> Name fields: ___
> Email field: ___
> Phone field: ___
> Status/stage field (for chips + filters): ___
> Other important fields: ___

### 2.5 Does this app need a pipeline / Kanban view?
**Why:** Enables the Pipeline/Kanban feature. A pipeline can work on ANY model with a stage-like field — it doesn't need a separate Deal model. Common patterns: Contact with a `deal_stage` field, Lead with a `status` field, Opportunity with a `pipeline_stage` field.
**Default:** No
**If yes, provide:**
- Which model holds the pipeline data (may be the primary Contact model)
- Stage/status field name on that model
- Stage values in order (e.g., New Lead, Qualified, Proposal Sent, Won, Lost)
- Amount/value field name (optional — for revenue forecasting)

> Needs pipeline: Yes / No
> If yes — Model: ___ | Stage field: ___ | Stages (in order): ___ | Amount field (optional): ___

### 2.6 Does this app have task records?
**Why:** Enables the Tasks System feature.
**Default:** No
**If yes, provide:**
- Task model name (internal + public)
- Status field name
- Type field name (optional)

> Has tasks: Yes / No
> If yes — Model: ___ | Status field: ___ | Type field: ___

### 2.7 What other models exist?
**Why:** Determines secondary collection pages, related records in detail views, and available data for AI tools.
**Action:** Run `npm run test-sdk -- --slug {slug} --api-key {key} --all-models` to discover all models.

> Additional models: ___

### 2.8 How do users log in?
**Why:** Determines auth architecture, JWT payload, and which login UI to show.
**Default:** Magic link (email-based, no password)

| Method | How it works | Best for |
|--------|-------------|----------|
| **Magic link** (default) | User enters email → n8n sends login link → click to authenticate | Small teams, low-friction, no passwords to manage |
| **Username + password** | Admin creates accounts in DB → users log in with credentials | Internal tools with managed user accounts |
| **Ontraport contact validation** | Validates email against Ontraport contacts → magic link or password | Client-facing portals where contacts are the users |
| **SSO / OAuth** | Google, Apple, or Microsoft login | Enterprise apps (requires additional setup) |

> Login method: ___

### 2.9 Are there different user roles?
**Why:** Determines whether the app needs role-based navigation, data filtering, and feature gating. If all users see the same thing, skip this.
**Default:** No (all users are equal)
**If yes, provide:**
- Role names (e.g., Admin, Manager, Staff, Viewer)
- What each role can see/do differently
- Who manages user roles (admin panel? database? Ontraport field?)

> Has roles: Yes / No
> If yes — Roles: ___ | Admin can: ___ | Staff can: ___ | Viewer can: ___

### 2.10 Should certain data be restricted by role or user?
**Why:** Determines whether all users see all records or if data is filtered. Affects query architecture.
**Default:** No (all authenticated users see all data)
**Options:**
- **Open** — All users see all records (most common for internal tools)
- **Role-filtered** — Admins see all, staff see assigned records only
- **User-scoped** — Each user sees only their own records (client portals)

> Data access: Open / Role-filtered / User-scoped

---

## Section 3: Feature Selection

_Use the [Feature Selection Guide](feature-selection-guide.md) for full details on each feature._

### 3.1 Which tier bundle fits this app?

Based on the answers above, recommend ONE of these bundles:

| Bundle | Best for | Features included |
|--------|----------|-------------------|
| **Basic CRM** | Simple contact management | Starter + Tags |
| **Sales CRM** | Sales teams, deal tracking | Starter + Standard + AI Chat + Dashboards |
| **Healthcare Admin** | Clinical/service staff | Starter + Standard + Premium + Voice + Automations |
| **Support Portal** | Help desk, tickets | Starter + Standard (minus Pipeline) + AI Chat + Dashboards + Frustration Detection |
| **Full Power** | When in doubt | All features |

> Recommended bundle: ___
> User's choice: ___

### 3.2 Feature opt-in / opt-out

After selecting a bundle, review each feature:

**Standard tier features (if included):**
- [ ] Pipeline / Kanban (`pipeline-management`) — Requires deals (2.5)
- [ ] Tasks System (`tasks-system`) — Requires tasks (2.6)
- [ ] Call Logging (`call-logging`) — Need phone field
- [ ] Conversation Threads (`conversation-threads`)
- [ ] Messaging - Email & SMS (`messaging`) — Need Ontraport (4.1)
- [ ] Tag Management (`tag-management`) — Need Ontraport (4.1)

**Premium tier features (if included):**
- [ ] Buddzee AI Chat (`ai-chat`) — Need OpenRouter key (4.2)
- [ ] Dynamic Metrics (`dynamic-metrics`) — Needs AI Chat
- [ ] Dashboard Builder (`dashboard-system`)
- [ ] Voice & Vision (`voice-vision`) — Needs AI Chat
- [ ] Push Notifications (`push-notifications`) — Mobile only, need OneSignal
- [ ] Biometric Lock (`biometric-lock`) — Mobile only
- [ ] Google Analytics (`google-analytics`) — Need GA4 property

**Enterprise tier features (if included):**
- [ ] Voice Conversation (`voice-conversation`) — Need Deepgram key
- [ ] Automation Engine (`automation-engine`) — Needs AI Chat + Dashboard
- [ ] n8n Workflow Browser (`n8n-browser`) — Need n8n instance
- [ ] Frustration Detection (`frustration-detection`) — Needs AI Chat + Push
- [ ] Feature Request Collection (`feature-request-collection`) — Needs AI Chat

### 3.3 Mobile app needed?
**Why:** Determines whether to use `react-mobile-full` template vs `react-full` template, and enables Capacitor + mobile-specific features.
**Default:** Yes (most apps benefit from mobile access)

> Mobile app: Yes / No
> iOS: Yes / No
> Android: Yes / No

---

## Section 4: Integrations

_These answers determine which external services to configure._

### 4.1 Does the client have an Ontraport account?
**Why:** Required for tag management, email/SMS messaging, task actions, and REST API proxy.
**Default:** Yes
**If yes, provide:**
- Ontraport API App ID
- Ontraport API Key
- VitalStats DataSource ID (for REST proxy)

> Ontraport: Yes / No
> App ID: ___
> API Key: ___
> DataSource ID: ___

### 4.2 AI features — OpenRouter API key
**Why:** All Buddzee AI features (chat, voice, vision, metrics, automations) use OpenRouter for LLM access.
**Default:** Yes (use shared key if client doesn't have one)
**Enables:** All Premium/Enterprise Buddzee features

> OpenRouter key: ___
> Preferred model: ___ (default: anthropic/claude-sonnet-4.5)

### 4.3 n8n webhooks available?
**Why:** Background processing, AI agent workflows, automation triggers.
**Default:** Yes (shared n8n instance at automations.vitalstats.app)

> n8n available: Yes / No
> Webhook base URL: ___ (default: https://automations.vitalstats.app)

### 4.4 Google Analytics property?
**Why:** Enables GA4 integration with 5 Buddzee AI tools.
**Default:** No

> GA4 property ID: ___
> Service account JSON: ___

### 4.5 Push notifications — OneSignal?
**Why:** iOS/Android native push notifications. Mobile apps only.
**Default:** Set up later

> OneSignal App ID: ___
> OneSignal REST API Key: ___

### 4.6 Deepgram API key?
**Why:** Voice conversation feature (real-time STT + TTS).
**Default:** Use shared key

> Deepgram key: ___

---

## Section 5: Branding & Design

_These answers configure the MUI theme, visual identity, and overall design feel._

### 5.1 Design preset
**Why:** Sets the overall visual style of the app — dark/light default, corner style, spacing density, typography weight, and component chrome. This is the single biggest design decision. Individual colors and fonts can be overridden after choosing a preset.
**Default:** `modern-ai` (recommended)

| Preset | Look & Feel | Best for |
|--------|------------|----------|
| **modern-ai** | Dark-first, warm tones, rounded corners (12px), pill chips, generous spacing, minimal chrome. Inspired by Claude, HeyGen, OpenRouter. | Most new apps, AI-forward products, modern SaaS |
| **clinical** | Light-first, sharp corners (0px), uppercase headings, dense layout, high contrast. The original PHYX style. | Healthcare, clinical, data-heavy admin tools |
| **classic** | System-follows mode, moderate rounding (8px), subtle shadows, balanced spacing. Traditional SaaS look. | Corporate tools, conservative clients |

> Design preset: ___

### 5.2 Primary brand color
**Why:** Used for buttons, links, active states, primary actions.
**Default:** Preset-dependent (`modern-ai`: `#a78bfa` muted purple, `clinical`: `#000000` black, `classic`: `#1976d2` blue)
**Note:** If the client has brand guidelines, use their primary brand color. Otherwise the preset default works well.

> Primary color (hex): ___

### 5.3 Secondary brand color
**Why:** Used for secondary actions, highlights, accents.
**Default:** Preset-dependent (`modern-ai`: `#64748b` slate, `clinical`: `#666666` grey, `classic`: `#9c27b0` purple)

> Secondary color (hex): ___

### 5.4 Heading font
**Why:** Used for H1-H6, navigation labels, card titles, buttons.
**Default:** Preset-dependent (`modern-ai`: Inter, `clinical`: Montserrat, `classic`: Inter)
**Source:** Google Fonts

> Font name: ___
> Font URL weights (e.g., Montserrat:wght@600;700;800): ___

### 5.5 Body font
**Why:** Used for body text, form fields, data tables.
**Default:** Inter (all presets)
**Source:** Google Fonts

> Font name: ___
> Font URL weights (e.g., Inter:wght@400;500;600;700): ___

### 5.6 Client logo
**Why:** Displayed in header/sidebar, login screen, splash screen.
**Default:** Text-only header with client name

> Logo file/URL: ___

---

## Section 6: Deployment

_These answers configure Docker, Cloudflare Tunnel, GitHub Actions, and port allocation._

### 6.1 Public domain
**Why:** Cloudflare Tunnel CNAME, CORS origins, Universal Links.
**Default:** N/A (required for public access)
**Example:** `admin.client.com` or `app.client.awesomate.ai`

> Domain: ___

### 6.2 Deploy port
**Why:** Port allocation for Docker container on the deploy server.
**Action:** Check `~/Projects/PORT-REGISTRY.md` for next available port.
**Default:** Next available (3000, 3010, 3020, 3030, 3040, 3050...)

> App port: ___
> API port: ___ (default: app port + 1000, e.g., 4040)

### 6.3 GitHub repository
**Why:** CI/CD pipeline deploys from this repo.
**Default:** `itmooti/{app-name}`

> Repo: ___

### 6.4 Apple Developer Team ID
**Why:** Required for iOS builds, code signing, TestFlight distribution.
**Default:** N/A (skip if no iOS)

> Team ID: ___

### 6.5 Bundle ID (mobile apps)
**Why:** Unique identifier for App Store / Play Store.
**Default:** `com.{client}.{appname}`
**Example:** `com.phyx.nurseadmin`

> Bundle ID: ___

---

## Discovery Report Output

After completing all sections, generate a `discovery-report.json` with the following structure. This file is used by the scaffolding script (`new-full-app.sh --discovery ./discovery-report.json`).

```json
{
  "business": {
    "name": "Client Name",
    "industry": "Healthcare",
    "description": "Compounding pharmacy managing patient medications",
    "primaryGoal": "manage-contacts",
    "userCount": "5-20",
    "userRole": "Clinical staff"
  },
  "auth": {
    "method": "magic-link",
    "hasRoles": false,
    "roles": [],
    "dataAccess": "open",
    "adminManagesUsers": false
  },
  "vitalsync": {
    "slug": "clientslug",
    "apiKey": "api-key-here",
    "accountPrefix": "Client"
  },
  "contact": {
    "internalName": "ClientContact",
    "publicName": "Contact",
    "fields": {
      "firstName": "first_name",
      "lastName": "last_name",
      "email": "email",
      "phone": "sms_number",
      "status": "status"
    }
  },
  "models": {
    "deals": null,
    "tasks": null,
    "additional": ["Appointment", "Note", "Purchase"]
  },
  "features": {
    "tiers": ["starter", "standard"],
    "enabled": ["pipeline-management", "tasks-system", "ai-chat"],
    "disabled": ["biometric-lock"]
  },
  "integrations": {
    "ontraport": {
      "appId": "...",
      "apiKey": "...",
      "dataSourceId": "..."
    },
    "openRouter": { "apiKey": "..." },
    "n8n": { "webhookBaseUrl": "https://automations.vitalstats.app" },
    "oneSignal": null,
    "deepgram": null,
    "googleAnalytics": null
  },
  "branding": {
    "designPreset": "modern-ai",
    "primaryColor": "#a78bfa",
    "secondaryColor": "#64748b",
    "headingFont": "Inter",
    "headingFontUrl": "Inter:wght@400;500;600;700",
    "bodyFont": "Inter",
    "bodyFontUrl": "Inter:wght@400;500;600;700",
    "logoUrl": null
  },
  "deployment": {
    "domain": "admin.client.com",
    "appPort": 3040,
    "apiPort": 4040,
    "repo": "itmooti/client-admin",
    "appleTeamId": null,
    "bundleId": "com.client.admin",
    "mobile": { "ios": true, "android": false }
  }
}
```

---

## Post-Discovery Checklist

After completing the questionnaire:

- [ ] VitalSync credentials validated (`npm run test-sdk`)
- [ ] Schema XML exported and placed at `schema/schema.xml`
- [ ] Research script run (`npm run research`)
- [ ] **Research Review completed** — findings confirmed with user, `research/confirmed-findings.md` generated (see [Research Review Process](research-review-process.md))
- [ ] Feature bundle selected and reviewed (based on confirmed findings, not raw research)
- [ ] `discovery-report.json` generated
- [ ] Port registered in `~/Projects/PORT-REGISTRY.md`
- [ ] Ready to run `scripts/new-full-app.sh`
