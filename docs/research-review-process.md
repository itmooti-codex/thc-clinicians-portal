# Research Review Process — Mandatory Confirmation Step

**CRITICAL: NEVER act on research findings without explicit user confirmation.** Research data may contain stale fields, unused statuses, legacy objects, or outdated automation patterns that no longer reflect how the business operates. Every assumption derived from research MUST be validated before it influences app design or feature planning.

## Why This Step Exists

The Awesomate Admin app was built with assumptions from research data that turned out to be wrong — unused fields were wired into collection views, legacy status values were styled into chips, and models with no active records were given full CRUD pages. The research script collects data from APIs, but APIs don't know business intent.

**The research review is the bridge between raw data and informed building.**

---

## When to Run the Research Review

After the research script completes and `research/knowledge-base.md` is generated, but BEFORE:
- Selecting features from the Feature Selection Guide
- Configuring `app-config.ts` model definitions
- Building any feature or page
- Proposing a feature set to the user

```
Discovery Questionnaire → Research Script → RESEARCH REVIEW → Feature Selection → Scaffold → Build
                                             ^^^^^^^^^^^^^^^^
                                             YOU ARE HERE
```

---

## How the Review Works

### Step 1: Present Findings as Questions

Read `research/knowledge-base.md` and each relevant `research/raw/*.json` file. For each review category below, present findings as **specific, answerable questions** — not statements. The user confirms, corrects, or rejects each finding.

### Step 2: Record Confirmed Facts

After the user responds, generate `research/confirmed-findings.md` — a validated version of the knowledge base with only confirmed facts. This file drives all subsequent planning.

### Step 3: Flag Unresolved Items

Any finding the user is unsure about goes into a "needs investigation" section. These items must be resolved before the affected feature is built — but they don't block unrelated features.

---

## Review Categories

Each category maps to one or more research collectors. Categories are modular — add new ones for new use cases without changing the review process.

### Category 1: Active Models & Record Volumes

**Source:** `object-discovery.json`, `record-counts.json`
**Risk:** Building pages for models with zero records, or missing models the client actually uses.

**Questions to ask:**
- "The research found these models with records: [list with counts]. Are all of these actively used?"
- "These models have zero records: [list]. Should we ignore them, or are any of them new and expected to grow?"
- "Is [highest-count model] your primary working model, or is it archival?"

**What to confirm:**
- [ ] Primary contact model name and purpose
- [ ] Which models should have collection (list) pages
- [ ] Which models are inactive/legacy and should be excluded

---

### Category 2: Key Fields & Display Priority

**Source:** `field-metadata.json`, `sample-data` files
**Risk:** Displaying obsolete fields, missing critical fields, wrong field labels.

**Questions to ask:**
- "For [model], the Ontraport listFields are: [field list]. Do these reflect what you want to see in the app's list view?"
- "The research found these fields populated in most records: [list]. Are these still the primary fields you work with?"
- "Are there any important fields NOT in this list that should be prominent?"
- "Any fields in this list that are outdated or no longer used?"

**What to confirm:**
- [ ] Fields for collection list display (what shows on each card/row)
- [ ] Fields for record detail hero header (name, status, key identifier)
- [ ] Search fields (which fields to search across)
- [ ] Fields that should be hidden or excluded

---

### Category 3: Status Fields & Values

**Source:** `field-distributions.json`, `field-metadata.json`
**Risk:** Styling chips for statuses nobody uses, missing active statuses that were added after the schema was built.

**Questions to ask:**
- "For [model]'s [status field], the research found these values in use: [value: count pairs]. Are all of these current?"
- "These status values exist in the field definition but have zero records: [list]. Are they deprecated, or just not used yet?"
- "Do the colors from Ontraport match what you expect? [show color table]"
- "Is this the RIGHT field to use for the main status display, or is there a better one?"

**What to confirm:**
- [ ] Active status values and their meaning
- [ ] Deprecated/unused values to exclude from filters
- [ ] Color assignments (from Ontraport or custom)
- [ ] Which field is the primary status/stage indicator

---

### Category 4: Pipeline & Stage Mapping

**Source:** `field-distributions.json`, `field-metadata.json`, `sample-data`
**Risk:** Building a pipeline with wrong stages, wrong model, or wrong flow direction.

**Questions to ask:**
- "Does this business use a pipeline or deal flow? If so, which model and field drives it?"
- "The research found these stage values on [field]: [list with counts]. Is this the correct order from start to finish?"
- "Are there stages that should be hidden or grouped? (e.g., multiple 'closed' variants)"
- "Is there an amount/value field associated with these stages for forecasting?"

**What to confirm:**
- [ ] Pipeline model and stage field (may be on Contact, not a separate Deal model)
- [ ] Stage order (left-to-right in Kanban)
- [ ] Which stages are active, which are terminal (won/lost/completed)
- [ ] Amount field for weighted forecast (if applicable)

---

### Category 5: Automation & Communication Patterns

**Source:** `automation-logs.json`
**Risk:** Building communication features the client doesn't use, or missing channels they rely on.

**Questions to ask:**
- "The research found these automation types in the last 90 days: [type: count]. Do these reflect your current workflows?"
- "Communication channels detected: [Email: X, SMS: Y, Phone: Z]. Are all of these active channels?"
- "Any automations that are running but shouldn't be? (legacy sequences, test automations)"
- "Are there communication workflows that happen outside Ontraport that the app should surface?"

**What to confirm:**
- [ ] Active communication channels (email, SMS, phone, other)
- [ ] Whether conversation thread feature is useful (requires activity log data)
- [ ] Whether call logging feature is useful (requires phone usage)
- [ ] Any automation patterns the app should trigger or display

---

### Category 6: Groups & Segmentation

**Source:** `groups.json`
**Risk:** Building filter presets based on groups nobody uses.

**Questions to ask:**
- "The research found [N] Ontraport Groups. Here are the ones with the most records: [list]. Are these your active segments?"
- "Should any of these groups become saved filter presets in the app?"
- "Are there segments you work with that AREN'T captured as Ontraport Groups?"

**What to confirm:**
- [ ] Which groups map to useful filter presets
- [ ] Custom segments to add as app filters
- [ ] Groups that are legacy and should be ignored

---

### Category 7: Sync Gaps

**Source:** `sync-gap-analysis.json`
**Risk:** Planning features that depend on fields not yet synced to VitalStats.

**Questions to ask:**
- "These Ontraport objects are NOT synced to VitalStats: [list]. Do any of them need to be accessible in the app?"
- "These fields on [model] exist in Ontraport but not in VitalStats: [list]. Are any of them needed?"
- "Note: Unsynced fields can only be read/written via Ontraport REST API proxy — they won't have real-time subscriptions or SDK queries."

**What to confirm:**
- [ ] Objects/fields that MUST be synced before the app can use them
- [ ] Objects/fields that can stay unsynced (Ontraport REST is fine)
- [ ] Objects/fields that are irrelevant to this app

---

### Category 8: Website & Business Context

**Source:** `website-snapshot.json`, `business-profile.json`
**Risk:** Wrong terminology, wrong branding, wrong understanding of the business.

**Questions to ask:**
- "Based on the website, the business appears to [description]. Is this accurate?"
- "The website mentions these services: [list]. Are these the services this app should reference?"
- "The Buddzee system prompt will describe your business as: [proposed description]. Does this sound right?"
- "Are there any brand terms, acronyms, or industry jargon the app should use consistently?"

**What to confirm:**
- [ ] Business description for Buddzee system prompt
- [ ] Service/product terminology
- [ ] Any brand language guidelines or terms to avoid

---

### Category 9: User Access & Roles

**Source:** Discovery questionnaire answers (2.8-2.10), `confirmed-findings.md`
**Risk:** Building role-based features for an app where all users are equal, or missing role restrictions that the business requires.
**When to include:** Always — every app needs auth.

**Questions to ask:**
- "You said [login method]. Just to confirm — [describe what that means]. Is that right?"
- "You mentioned [N] roles. Can you walk me through what each role should see differently?"
- "Should admin users be able to create/edit/delete other user accounts in the app?"
- "Are there any pages or data that should be completely hidden from certain roles?"

**What to confirm:**
- [ ] Login method matches business reality
- [ ] Roles defined with clear access differences (or confirmed no roles needed)
- [ ] Data access level appropriate for the use case
- [ ] Admin user management requirements documented

---

## Adding Custom Review Categories

The review process is designed to be extensible. To add a new category for a specific use case:

### Template for New Categories

```markdown
### Category N: [Category Name]

**Source:** `[raw-data-file].json` or collector name
**Risk:** [What goes wrong if this data is assumed correct without validation]
**When to include:** [When this category is relevant — e.g., "Only when the app has X feature"]

**Questions to ask:**
- "[Specific question about the data]"
- "[Follow-up question with concrete examples from the data]"

**What to confirm:**
- [ ] [Specific fact to validate]
- [ ] [Another specific fact]
```

### How to Add a New Collector + Review Category

1. **Add the collector** to `scripts/research.cjs` — it should output a JSON file to `research/raw/`
2. **Add the review category** to this document following the template above
3. **Update `docs/research-phase.md`** to list the new collector in the Data Collectors table
4. **Update the review checklist** at the bottom of this document

The review categories are independent — adding a new one doesn't affect existing categories. Each category can be skipped if its source data wasn't collected (e.g., `--skip-ontraport` skips Categories 5-6).

---

## Confirmed Findings Output

After the review, generate `research/confirmed-findings.md` in the target app directory:

```markdown
# Confirmed Research Findings — [Client Name]

_Reviewed on [date] with [user name/role]._

## Active Models
| Model | Purpose | Collection Page | Record Count |
|-------|---------|----------------|--------------|
| Contact | Primary patient records | Yes | 2,450 |
| Task | Staff task assignments | Yes | 890 |
| Purchase | Prescription orders | No (read-only in detail views) | 12,300 |

## Primary Contact Configuration
- **Model:** PhyxContact (internal) / Contact (public)
- **Display fields:** first_name, last_name, status, sms_number
- **Search fields:** first_name, last_name, email, sms_number
- **Status field:** `status` — Active (green), Inactive (grey), VIP (purple)
- **Excluded fields:** legacy_id, old_status, migration_flag

## Pipeline Configuration
- **Model:** Contact
- **Stage field:** `deal_stage`
- **Stages (in order):** New Lead → Qualified → Proposal Sent → Won | Lost
- **Amount field:** `deal_value`
- **Notes:** "Lost" is terminal; "Won" triggers automated onboarding sequence

## Active Communication Channels
- Email: Yes (primary channel)
- SMS: Yes (appointment reminders)
- Phone: Yes (intake calls)
- Notes: No internal notes system

## Feature Recommendations (confirmed)
- [x] Collections — Contact + Task
- [x] Pipeline — on Contact.deal_stage
- [x] Call Logging — intake calls are key workflow
- [x] Conversation Threads — multi-channel communication
- [ ] Messaging (Email/SMS) — deferred, they use Ontraport directly for now
- [x] Buddzee AI Chat — approved for exploration
- [ ] Dashboard Builder — deferred to phase 2

## Sync Gaps (action required)
- `appointment_date` field needs VitalStats sync before collection filters work
- `Purchase` object is synced but missing `pharmacy_notes` field

## Needs Investigation
- Group "VIP Patients" has 0 records — check if this is a new segment or deprecated
- `referral_source` field has 15 distinct values but only 3 in the dropdown — check if free-text
```

---

## Integration with the Build Process

### In the Discovery Questionnaire

The research review is Step 3 in the discovery workflow:

```
1. Ask Sections 1-2 (Business Context + Data Models)
2. Run research script
3. ★ RESEARCH REVIEW — present findings, get confirmation ★
4. Feature selection (informed by confirmed findings)
5. Complete Sections 4-6 (Integrations, Branding, Deployment)
6. Generate discovery report
7. SDK test suite
8. Scaffold
```

### In Claude's Instructions

When building a new app, Claude MUST:
1. **Never reference research data without the "confirmed" qualifier** — say "the research suggests X — can you confirm?" rather than "the data shows X, so I'll build Y"
2. **Never skip the review** — even if the user says "just use the defaults," present the key findings for confirmation
3. **Present one category at a time** — don't dump all 9 categories in a single message
4. **Accept corrections gracefully** — if the user says a finding is wrong, update the confirmed findings and adjust feature recommendations
5. **Flag uncertainty** — if a finding could go either way, put it in "Needs Investigation" rather than guessing

### Review Checklist (for tracking)

After completing the review, all of these should be confirmed:

- [ ] Active models identified and purposes documented
- [ ] Primary contact model configured (internal name, public name, key fields)
- [ ] Status fields validated (active values, colors, deprecated values excluded)
- [ ] Pipeline configuration confirmed (if applicable)
- [ ] Communication channels verified
- [ ] Groups reviewed for filter presets
- [ ] Sync gaps assessed and action items listed
- [ ] Business description validated for Buddzee system prompt
- [ ] Login method and role requirements confirmed
- [ ] Feature recommendations reviewed and approved
- [ ] Confirmed findings saved to `research/confirmed-findings.md`
