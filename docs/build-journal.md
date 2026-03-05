# Build Journal — Session Continuity & Efficiency Guide

Building a full-featured app is a multi-session process. No single Claude Code conversation should attempt the entire build — context will run out, decisions will be lost, and efficiency drops as the conversation grows. This document defines:

1. **The Build Journal** — a persistent state file that survives session boundaries
2. **7 Build Phases** — natural session boundaries, each completable independently
3. **Efficiency rules** — how to minimize token waste during each phase

---

## The Build Journal

Every new app gets a `BUILD-JOURNAL.md` file in its project root. This file is the single source of truth for build state. Claude reads it at the start of every session and updates it after every significant step.

### What goes in the Build Journal

- **Current phase** and step within that phase
- **Every decision made** — model names, field choices, feature selections, auth method, design preferences
- **What's been built** — which files exist, which features are configured, which tests pass
- **Errors encountered** — what went wrong, root cause, fix applied
- **What's next** — the immediate next step and any blockers
- **Open questions** — unresolved items that need user input

### Rules for Claude

1. **Start of every session**: Read `BUILD-JOURNAL.md` FIRST, before doing anything else
2. **After every significant step**: Update the journal immediately — don't batch updates
3. **Before ending a session**: Write a "Resume Point" entry with exact instructions for the next session
4. **Never rely on conversation memory** for decisions — if it's not in the journal, re-ask
5. **Never duplicate CLAUDE.md content** in the journal — the journal is for THIS build's state, not general instructions
6. **When you fix a non-trivial error**, log it in the "Errors & Fixes" section. If the error is NOT specific to this one client's data (i.e., it could happen on the next build too), report it to the QA-Issues system:
   - API: POST to the qa-issues API (`~/Projects/qa-issues/`, port 4000)
   - Fields: `title`, `description` (include error message + fix), `issue_type: 'bug'`, `scope: 'universal'` (or `'app_specific'`), `app_name`, `priority`, `affected_screens: 'Build Phase X'`
   - The QA system's AI triage will deduplicate against known issues automatically
   - Check existing issues first via `GET /api/issues?scope=universal&search=<keyword>` to avoid duplicates

### Journal Template

The scaffolding script (`new-full-app.sh`) creates this file automatically. Here's the template:

```markdown
# Build Journal — [App Name]

_Created: [date] | Last updated: [date]_

## Current Status
**Phase:** [1-7] — [Phase Name]
**Step:** [Current step description]
**Blockers:** [None / description]

## Decisions Log

### Business Context
- Client: [name]
- Industry: [industry]
- Primary users: [role]
- Primary goal: [goal]

### Authentication
- Login method: [magic-link / password / ontraport-contact / sso]
- Roles: [None / list of roles with descriptions]
- Data access: [open / role-filtered / user-scoped]
- Admin manages users: [Yes / No]

### Data Layer
- VitalSync slug: [slug]
- Primary model: [internal] / [public]
- Key fields: [list]
- Status field: [field] — values: [list]
- Pipeline: [Yes/No] — model: [model], field: [field], stages: [list]
- Tasks: [Yes/No] — model: [model], field: [field]
- Additional models: [list]

### Features
- Bundle: [tier name]
- Enabled: [list]
- Disabled: [list]
- Deferred: [list with reasons]

### Design
- Preset: [modern-ai/clinical/classic]
- Primary color: [hex]
- Secondary color: [hex]
- Fonts: [heading] / [body]

### Deployment
- Domain: [domain]
- Port: [port] / API: [port]
- Repo: [org/repo]

## Completed Steps
- [ ] Phase 1: Discovery — questionnaire complete
- [ ] Phase 1: Research — script run, knowledge-base.md generated
- [ ] Phase 1: Research Review — confirmed-findings.md generated
- [ ] Phase 1: Feature selection — bundle confirmed
- [ ] Phase 2: Scaffold — new-full-app.sh run
- [ ] Phase 2: Schema — schema.xml placed, parse-schema run
- [ ] Phase 2: SDK Test — critical tests pass
- [ ] Phase 3: POC — app boots, login works, contacts display
- [ ] Phase 4: [feature group] — configured and verified
- [ ] Phase 5: Web Deploy — live at public URL, user verified
- [ ] Phase 6: iOS Build — TestFlight distributed (if needed)
- [ ] Phase 7: Android Build — distributed (if needed)

## Errors & Fixes
_Log every non-trivial error encountered during this build. After fixing, consider whether it should be reported to the QA-Issues system for cross-project tracking._

| Phase | Error | Root Cause | Fix | Reported to QA? |
|-------|-------|-----------|-----|-----------------|

## Resume Point
_Updated: [timestamp]_

**What just happened:** [Brief summary of what was completed in this session]

**Next step:** [Exact instruction for what to do next]

**Context needed:** [Any files to read, decisions to reference, or state to check]

## Open Questions
- [Any unresolved items that need user input before proceeding]
```

---

## The 7 Build Phases

Each phase is designed to be completable in one Claude Code session. Phase boundaries are natural stopping points where all progress is captured in persistent files.

**Philosophy: POC first, features later, web before mobile.** Get a working app in front of the user as fast as possible, then iterate.

```
Phase 1: Discovery & Research          (1 session)
Phase 2: Scaffold & Validate           (1 session)
Phase 3: POC — Get It Running          (1 session)   ← working app with real data
Phase 4: Feature Configuration         (N sessions)  ← one session per feature group
Phase 5: Web Deploy                    (1 session)   ← HARD GATE before mobile
Phase 6: iOS Build                     (1 session)   ← optional, after Phase 5
Phase 7: Android Build                 (1 session)   ← optional, after Phase 5
```

---

### Phase 1: Discovery & Research (1 session)

**Goal:** Understand the business, confirm data assumptions, select features.

**Steps:**
1. Ask Discovery Questionnaire Sections 1-2 (business context + data models + auth strategy)
2. Run research script with VitalSync credentials
3. Run Research Review — present findings, get confirmation (one category at a time)
4. Generate `research/confirmed-findings.md`
5. Present feature recommendations using Feature Selection Guide
6. Complete Sections 4-6 (integrations, branding, deployment)
7. Generate `discovery-report.json`

**Outputs (persistent files):**
- `research/knowledge-base.md`
- `research/confirmed-findings.md`
- `discovery-report.json`
- `BUILD-JOURNAL.md` — initialized with all decisions

**Efficiency tips:**
- Don't read feature doc files during this phase — you're gathering requirements, not building
- Use the Feature Selection Guide summary tables, not the full feature docs
- Ask all Section 1 questions in a single message, not one at a time

**-> Next phase:** Phase 2: Scaffold & Validate. Run `new-full-app.sh` with the discovery report values.

---

### Phase 2: Scaffold & Validate (1 short session)

**Goal:** Create the project, validate SDK connectivity, generate types.

**Steps:**
1. Read `BUILD-JOURNAL.md` to restore context
2. Run `new-full-app.sh` with discovery report values
3. Place `schema.xml` in the new project
4. Run `npm run parse-schema` to generate TypeScript types
5. Run `npm run test-sdk` to validate VitalSync connectivity
6. Fix any SDK test failures (usually field name mismatches)
7. Update `BUILD-JOURNAL.md`

**Outputs (persistent files):**
- Scaffolded project directory with all template files
- `src/types/index.ts` — generated TypeScript types
- `schema/schema-reference.json` — parsed schema reference
- SDK test results (pass/fail)

**Efficiency tips:**
- This phase is mostly running scripts — low token usage
- If SDK tests fail, fix the issue immediately rather than deferring — and log the error in the journal
- Don't start configuring features — that's Phase 3

**-> Next phase:** Phase 3: POC. Configure the minimum to get the app booting with real data.

---

### Phase 3: POC — Get It Running (1 session)

**Goal:** Minimum config to boot the app, authenticate, and see real data. Nothing more.

**Steps:**
1. Read `BUILD-JOURNAL.md` to restore context
2. Read `confirmed-findings.md` for primary contact fields
3. Edit `src/config/app-config.ts` — **ONLY these blocks:**
   - `client` (name, slug, prefix)
   - `auth` (login method, roles if any)
   - `contact` (model name, publicName, collection fields for list view, detail fields for record view)
   - `navigation` (just the pages needed for POC — usually Home + Contacts)
4. `npm run dev` — verify app boots without errors
5. Test: login flow works, contacts load in collection view, detail view shows fields
6. Update `BUILD-JOURNAL.md` — mark POC working, list what needs Phase 4 wiring

**DO NOT configure in this phase:** pipeline, tasks, call logging, messaging, AI, dashboards, or any feature-specific config. Those are Phase 4.

**Outputs (persistent files):**
- Configured `src/config/app-config.ts` (minimal — client + auth + contact + nav)
- Working dev server showing real data

**Efficiency tips:**
- Read `confirmed-findings.md` instead of raw research files — it has the validated field list
- Use MCP tools for any schema questions (faster than reading schema.xml)
- Don't customize component code — only edit `app-config.ts`
- The goal is speed: get a working POC in one session

**-> Next phase:** Phase 4: Feature Configuration. Read `BUILD-JOURNAL.md` for which feature groups are enabled and start with the most important group.

---

### Phase 4: Feature Configuration (1 session per feature group)

**Goal:** Configure and verify each enabled feature group, one at a time.

This phase may span multiple sessions. Each session handles one feature group. The order doesn't matter — features are independent once the base config (Phase 3) is done.

**Feature groups (each is one session):**

| Group | Features | Key files to configure |
|-------|----------|----------------------|
| **Communication** | Call Logging, Conversations, Messaging | Call outcome options, phone field, message templates |
| **Productivity** | Pipeline, Tasks, Tag Management | Stage config, task types, tag categories |
| **AI & Insights** | Buddzee Chat, Dynamic Metrics, Dashboards | OpenRouter key, system prompt, default dashboards |
| **Voice & Vision** | Voice/Vision Assistant, Voice Conversation | Deepgram key, action registry |
| **Automation** | Automation Engine, n8n Browser, Frustration Detection | n8n webhooks, alert configs |
| **Mobile** | Push Notifications, Biometric Lock | OneSignal config, lock screen settings |
| **Analytics** | Google Analytics, Feature Requests | GA4 credentials, GitHub config |

**Steps per group:**
1. Read `BUILD-JOURNAL.md` to restore context
2. Read the feature doc for the group (e.g., `docs/features/call-logging.md`)
3. Configure feature-specific settings in `app-config.ts` or feature configs
4. Build any n8n workflows needed (use n8n-builder project)
5. Test the feature — verify it works end-to-end
6. Update `BUILD-JOURNAL.md` — mark features as complete

**Efficiency tips:**
- Only read the feature doc for the group you're working on — don't load all feature docs
- Use the Task tool with subagents for independent sub-tasks (e.g., build n8n workflow while configuring the frontend)
- If a feature needs custom components beyond what the template provides, note it in the journal and build it — but keep changes minimal

**-> Next phase:** Once all desired feature groups are configured and verified, proceed to Phase 5: Web Deploy.

---

### Phase 5: Web Deploy (1 session) — HARD GATE

**Goal:** Deploy the web app to production and verify it's live. **This is a HARD GATE — do not proceed to Phase 6 or 7 until the web app is live and the user confirms it's working.**

**Steps:**
1. Read `BUILD-JOURNAL.md` to restore context
2. Create GitHub repo, push code
3. Follow `docs/deployment-procedure.md`:
   - Create Cloudflare Tunnel
   - Configure DNS
   - Set GitHub secrets
   - Push to trigger deploy
4. Verify: public URL loads, login works, data displays correctly
5. **User confirms: "the web app is working"** — this unlocks Phases 6 and 7
6. Update `BUILD-JOURNAL.md` — mark web deploy complete

**Efficiency tips:**
- Read `docs/deployment-procedure.md` — it has the exact API calls and commands
- Use the deploy checklist, don't improvise

**-> Next phase (if mobile needed):** Phase 6: iOS Build or Phase 7: Android Build. These are independent — do either or both, in any order. If no mobile needed, the build is complete.

---

### Phase 6: iOS Build (1 session) — OPTIONAL

**Goal:** Build and distribute the iOS app via TestFlight.

**Prerequisites:** Phase 5 must be complete — web app live and user-verified.

**Steps:**
1. Read `BUILD-JOURNAL.md` to restore context
2. Read `docs/mobile-app-workflow.md` for Xcode setup and iOS gotchas
3. Configure Capacitor for iOS:
   - Update `mobile/capacitor.config.ts` (`server.url` = public URL from Phase 5)
   - Configure splash screen and app icon assets
   - Set Bundle ID and Apple Team ID
4. `npx cap sync ios`
5. Open in Xcode, resolve code signing
6. Build and upload to TestFlight
7. Verify on physical device — login, data display, push notifications
8. Update `BUILD-JOURNAL.md` — mark iOS build complete

**Efficiency tips:**
- Claude configures files; the user does the Xcode build and TestFlight upload
- iOS-specific gotchas are documented in `docs/mobile-app-workflow.md` (CapacitorCordova errors, sandbox errors, version pinning)
- Don't attempt Android in the same session

**-> Next phase (if Android needed):** Phase 7: Android Build. If not needed, the build is complete.

---

### Phase 7: Android Build (1 session) — OPTIONAL

**Goal:** Build and distribute the Android app.

**Prerequisites:** Phase 5 must be complete — web app live and user-verified.

**Steps:**
1. Read `BUILD-JOURNAL.md` to restore context
2. Read `docs/mobile-app-workflow.md` for Android Studio setup
3. Configure Capacitor for Android:
   - Update `mobile/capacitor.config.ts` (if not already done in Phase 6)
   - Configure splash screen and app icon assets
   - Set application ID
4. `npx cap sync android`
5. Open in Android Studio, resolve signing
6. Build and distribute (Play Store or APK)
7. Verify on physical device
8. Update `BUILD-JOURNAL.md` — mark Android build complete

**-> Build complete.**

---

## Efficiency Rules for All Phases

### 1. Read the Journal First
Every session starts by reading `BUILD-JOURNAL.md`. This restores all decisions and state without needing conversation history.

### 2. Don't Pre-load Docs
Only read documentation files when you need them for the CURRENT step. Loading all docs at session start wastes context on information you won't use yet.

### 3. One Phase Per Session
Don't try to do Discovery + Scaffold + Configure in one session. Each phase produces persistent artifacts that make the next session self-contained.

### 4. Update the Journal Continuously
After every decision, every completed step, every answer from the user — update the journal immediately. If the session ends unexpectedly, nothing is lost.

### 5. Use Subagents for Research
When you need to look up multiple files or search the codebase, use the Task tool with Explore agents. This keeps the research out of your main context window.

### 6. Don't Re-derive What's Already Decided
If `confirmed-findings.md` says the status field is `deal_stage` with values [New, Qualified, Won, Lost], use that directly. Don't re-read the research data, don't re-query via MCP, don't re-ask the user.

### 7. Feature Groups Are Independent Sessions
Phase 4 features can be done in any order, across separate sessions. Don't try to configure all features in one session — each group has its own docs to read and configs to set.

### 8. Log What You Built
When you create or modify a file, note it in the journal. When the next session reads the journal, it knows exactly what exists and what state it's in.

### 9. Log Errors to QA-Issues
When you fix a non-trivial, non-client-specific error, report it to the qa-issues system so future builds benefit. See Rule 6 under "Rules for Claude" above.

---

## Recovery from Context Loss

If a session runs out of context or gets interrupted:

1. **Start a new session** in the same project directory
2. **Read `BUILD-JOURNAL.md`** — it has the full state
3. **Read the Resume Point** — it tells you exactly what to do next
4. **Continue from where you left off** — no need to re-do completed steps
5. **Read `confirmed-findings.md`** if you need data layer decisions
6. **Read `discovery-report.json`** if you need integration/deployment config

The key insight: **everything that matters is in files, not in conversation history.** The conversation is just the mechanism for making progress — the files are the durable state.
