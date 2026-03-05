# Master Feature Rollout Plan — VibeCodeApps Platform

## Context

VibeCodeApps builds custom apps for individual businesses. Each business gets their own deployed app. The platform needs to support **progressive feature enablement** — a client starts with basics (contact lookup + notifications) and adds dashboards, goal tracking, AI insights, voice assistant, etc. as their business grows.

**All AI features are branded as Buddzee** — the platform's AI business assistant. See `docs/features/buddzee-ai-assistant.md` for the full brand identity, voice guidelines, and integration checklist.

This plan merges five feature sources into one unified roadmap:
- **Ontraport Feature Implementation Guide** — 25 features for a complete CRM mobile app (auth, collections, records, communication, pipeline, search, AI intelligence, offline)
- **9 existing Buddzee-powered production features** (OneSignal, Buddzee Chat, Buddzee Dynamic Metrics, Buddzee Automation Engine, etc.)
- **Buddzee Dashboard Builder** (dashboards, widgets, KPIs, Buddzee AI insights)
- **Buddzee Voice & Vision Assistant Phases 2-6** (additional actions, lifecycle engine, role dashboards)
- **Buddzee Infrastructure** (template scaffolding, RAG knowledge base, embeddable spin-offs)

The rollout is organized into **4 tiers**:
- **Foundation Tier (Milestones 0-3)** — For new CRM apps. Existing apps can skip to Milestone 4.
- **Intelligence Tier (Milestones 4-9)** — Progressive AI feature enablement for all apps.
- **Advanced Tier (Milestones 10-12)** — Optional, high-complexity features.
- **Infrastructure Tier (Milestones 13-15)** — Platform-level tooling and templates.

### Key Design Decisions

1. **Feature flags first** — every subsequent phase is gated behind flags. Non-negotiable for the per-client business model.
2. **Dynamic Metrics evolves, not replaced** — the existing 16-file system (`QueryConfig`, 7 aggregation types, `metric_definitions` table) becomes the foundation for the widget system.
3. **Goals are a specialized automation** — the existing Automation Engine's `create_automation` AI tool extends with a `goal_check` type rather than building a separate system.
4. **Voice/Vision Phase 6 dashboards merge with Buddzee dashboards** — one dashboard system, not two parallel implementations.
5. **OneSignal deep links extend naturally** — existing `{contactId, tab, subTab}` payload gains `dashboardId` + `widgetId` fields.
6. **Ontraport Groups replicated as VitalSync queries** — group filter definitions are fetched from Ontraport API but executed as VitalSync SDK `.where()` chains. This gives real-time subscriptions, faster queries, and works across ALL object types. See Milestone 1F for full detail.
7. **VitalSync-native data access** — all CRM data flows through VitalSync SDK (reads, subscriptions, mutations). Ontraport API is used directly only for operations VitalSync doesn't support (email/SMS sending, tag management, automation map triggers).
8. **Foundation milestones are app-type scoped** — Milestones 1-3 apply to new Ontraport-integrated CRM apps. Existing apps (phyx-nurse-admin, bb-dashboard) already have equivalent functionality and skip to Milestone 4.

---

## Existing Production Features

These features are already built and in production use across deployed apps:

| # | Feature | Files | Docs |
|---|---------|:-----:|------|
| 1 | OneSignal Push Notifications | 14 | `onesignal-notifications.md` |
| 2 | Buddzee AI Chat Agent (SSE + n8n) | 22 | `ai-chat-agent.md` |
| 3 | Buddzee Dynamic Metrics | 16 | `dynamic-metrics.md` |
| 4 | Buddzee Automation Engine | 10 | `automation-engine.md` |
| 5 | Voice & Vision Phase 1 (4 actions) | 20 | `voice-vision-assistant.md` |
| 6 | Buddzee Frustration Detection | — | `frustration-detection.md` |
| 7 | Buddzee Feature Request Collection | — | `feature-request-collection.md` |
| 8 | Social Feed / MemberFeed | — | `social-feed.md` |
| 9 | LMS Notifications & Courses | — | `lms-notifications-courses.md` |

### Production Features Pending Documentation

The following features are built in phyx-nurse-admin but not yet documented as reusable VibeCodeApps feature modules. They should be extracted into `docs/features/` for reuse across apps:

| Feature | Reference Location | Integration Notes |
|---------|-------------------|-------------------|
| Advanced Automation Engine (tool-registry + 8 tool modules) | `phyx-nurse-admin/server/src/lib/tool-registry.ts`, `server/src/routes/ai.ts` (54KB) | Reference implementation for Milestone 13 (Template Scaffolding). Includes buddzee-agent integration, OpenRouter dual-model, VitalSync mutation tools. |
| Newsletter Image Generation | `phyx-nurse-admin/server/src/lib/tools/newsletter-tools.ts` | Claude vision + NanoBanana, GitHub image storage, email preview cards. Industry-specific pattern. |
| Feature Request & Bug Report (advanced) | `phyx-nurse-admin/server/src/lib/tools/feature-request-tool.ts` | Enhanced version of documented feature with feedback dialog, thumbs up/down, webhook integration. |
| Patient Queue Management | `phyx-nurse-admin/src/hooks/usePatientQueue.ts` (12KB) | Queue filtering, sorting, prioritization, real-time VitalSync subscriptions. Healthcare-specific pattern. |
| Buddzee AI Chat Redesign (mobile-optimized) | `phyx-nurse-admin/src/features/ai/` | Post-login OneSignal subscription, Buddzee welcome screen, message actions (copy, retry, thumbs). Enhances existing AI Chat Agent feature doc. |
| Metric Drilldown | `phyx-nurse-admin/src/hooks/useMetricDrilldown.ts` | Detailed metric inspection with drill-down dialogs. Enhances existing Dynamic Metrics feature doc. |
| Deep Link Navigation | `phyx-nurse-admin/src/hooks/useDeepLinkListener.ts` | Notification → record navigation, cold-start handling via static `pendingDeepLink`. Enhances existing OneSignal feature doc. |

---

## Milestone 0: Feature Flag Architecture (Foundation)

**Delivers:** Runtime feature toggling per app. Start simple, grow with the client.

**Builds on:** Current ad-hoc `VITE_*` env vars for feature toggles.

### What to Build

**A. Feature Registry (`src/lib/feature-flags.ts`)**
```
Two-tier system:
1. Build-time flags — VITE_FEATURE_* env vars (controls whether code is bundled)
2. Runtime flags — Database table + Zustand store (controls whether features render)
```

**B. Database Table: `app_features`**
```sql
CREATE TABLE app_features (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feature_key VARCHAR(64) NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT FALSE,
  tier ENUM('basic','standard','premium') DEFAULT 'basic',
  config_json JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**C. Frontend Hook: `useFeature(key)`**
- Returns `{ enabled, config, tier }`
- Reads from Zustand store populated at app init via `GET /api/features`
- Components conditionally render based on flags

**D. Feature Manifest System**
- Each feature in `docs/features/` gets a companion `.manifest.json`
- Manifest lists: files, dependencies, env vars, DB tables, feature_key
- Scaffold scripts gain `--features` flag to pre-install features

### Feature Tiers (Example)

| Tier | Features Included |
|------|------------------|
| **Basic** | Contact lookup, push notifications, basic search |
| **Standard** | + AI Chat Agent, Dynamic Metrics, Social Feed, Automations |
| **Premium** | + Dashboards, Goal/KPI tracking, Voice Assistant, AI Insights, Lifecycle Engine |

### Key Files
- `src/lib/feature-flags.ts` — Feature registry, `useFeature()` hook, `FeatureGate` component
- `src/stores/featureStore.ts` — Zustand store for runtime flags
- `server/src/routes/features.ts` — `GET /api/features`, `PUT /api/features/:key`
- `server/src/lib/seed.ts` — Add `app_features` table + default rows
- `scripts/new-app.sh` / `scripts/new-mobile-app.sh` — Add `--features` flag

**Enables:** Every phase below is gated behind feature flags.

---

## Milestone 1: Core CRM Platform

**Delivers:** A complete, functional CRM mobile app — authentication, navigation, record browsing, record detail views, record creation/editing, and search/sort/filter with Ontraport Group replication. This is the foundation that everything else builds on.

**Builds on:** Milestone 0 (feature flags), VitalSync SDK (data layer), Capacitor (mobile), Express backend (API proxy), existing `backend-patterns.md` and `mobile-app-workflow.md` patterns.

**Scope:** New Ontraport-integrated CRM apps. Existing apps (phyx-nurse-admin) already have equivalent functionality.

### 1A: Authentication & Security

**Why:** Passwordless auth is the 2026 standard for mobile CRM. Reduces friction, eliminates password resets, more secure for field sales teams.

**What to Build:**

**Magic Link Authentication (Primary)**
- User opens app → Buddzee greeting + email input
- Enters email → "Send Magic Link" → receives email with one-tap link
- Link opens directly in app (Universal Links on iOS) → authenticated with 30-day JWT session
- Backend: `server/src/routes/auth.ts` — token generation + verification (see `backend-patterns.md` Magic Link Auth Pattern)
- Token store: In-memory Map with 15-minute expiry (single server) or Redis (multi-server)
- Contact lookup: VitalSync `calcContacts` GraphQL query to validate email exists
- Email delivery: n8n webhook → branded magic link email
- Security: One-time tokens (deleted after use), 32-byte crypto random, never reveal email existence

**Biometric Re-Authentication**
- For sensitive actions (bulk delete, export data): Face ID / Touch ID prompt
- Capacitor `@capacitor-community/biometric-auth` plugin
- Window bridge pattern: `window.__requestBiometric?.()` (no-op on web)

**Role-Based Access Control (RBAC)**
- On login, fetch user's Ontraport role/permissions via VitalStats REST proxy
- `usePermission('action.name')` hook returns boolean
- `<RequirePermission action="contacts.edit">` guard component
- Server-side enforcement on all API endpoints
- If you can't see it, it doesn't exist in your UI — no "access denied" dead ends

**Device Registration & Admin Monitoring**
- On first login, generate device fingerprint (Capacitor Device plugin: model, OS, UUID)
- POST device info to backend → store in `device_connections` table
- Admin can disable device → JWT invalidated on next API call → forced re-auth

**Key Files:**
```
server/src/routes/auth.ts           — login/verify/magic-link endpoints
server/src/middleware/requireAuth.ts — JWT verification middleware
src/stores/useAuthStore.ts          — Zustand auth state + localStorage persistence
public/.well-known/apple-app-site-association — Universal Links config
```

**Database:**
```sql
CREATE TABLE device_connections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  device_uuid VARCHAR(255) NOT NULL,
  device_model VARCHAR(128),
  os_version VARCHAR(64),
  is_active BOOLEAN DEFAULT TRUE,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_device (user_id, device_uuid)
);
```

### 1B: Navigation & App Shell

**What to Build:**

**Adaptive Bottom Navigation**
- Bottom tab bar with 4 tabs + center Buddzee FAB:
  - **Today** (dashboard) | **Contacts** | **[Buddzee]** | **Pipeline** | **Tasks**
- Tabs are configurable: user can swap which collections appear in the bottom bar
- Long-press any tab → quick-access popover with sub-sections
- Badge counts on tabs (unread tasks, new contacts today)
- Smooth animations between tab transitions (Framer Motion)

**Mobile-Specific:**
- Safe area insets for iOS notch/home indicator (see `mobile-app-workflow.md`)
- `pb: 'env(safe-area-inset-bottom, 0px)'` on bottom nav
- `pt: 'calc(env(safe-area-inset-top, 0px) + 16px)'` on header
- Haptic feedback on tab switch (Capacitor Haptics plugin)

**Theme System**
- Light / Dark / System (follows device preference via `useMediaQuery('(prefers-color-scheme: dark)')`)
- MUI `createTheme` with light/dark palettes
- Buddzee brand colors as accent throughout
- CSS custom properties for Buddzee brand colors

**Navigation Customization**
- Settings → Navigation → drag-to-reorder collections, toggle visibility
- "More" overflow menu for hidden collections
- Preferences sync to backend (survive device changes)
- `useNavStore.ts` with `{ order: string[], hidden: string[] }` — persisted to localStorage AND synced to `user_preferences` table

**Key Files:**
```
src/components/navigation/
  BottomNav.tsx          — 4 tabs + center Buddzee FAB
  NavConfigDialog.tsx    — Drag-to-reorder, show/hide collections
  QuickAccessPopover.tsx — Long-press sub-sections
src/stores/useNavStore.ts — Persisted nav preferences (Zustand + persist)
```

### 1C: Collections & Record Browsing

**What to Build:**

**Dynamic Collection List**
- **Pull-to-refresh** with VitalSync real-time subscription as backup
- **Infinite scroll** with virtualized list (only renders visible items — critical for 1000+ records)
- **Color-coded left border** per record status (customizable colors from Ontraport field definitions)
- **Avatar/initials circle** for contacts, icon for other object types
- **Two-line layout:** Primary field (name) + secondary field (email/company/stage)
- **Swipe actions:** Swipe right → call, swipe left → quick actions menu
- **Multi-select mode:** Tap avatar/icon to enter select mode, floating action bar appears at top
- **Empty state:** Buddzee illustration + "No records yet. Want me to help you add some?"

**Supported Object Types:**

| Object | VitalSync Model | Ontraport Object ID | Notes |
|--------|----------------|---------------------|-------|
| Contacts | `Contact` (prefixed per schema) | 0 | Primary CRM records |
| Deals | `Deal` | Custom | Sales pipeline items |
| Companies | `Company` | Custom | Business records |
| Tasks | `Task` | Custom | To-do items |
| Custom Objects | Dynamic | Custom | User-defined in Ontraport |

**Dynamic Object Discovery:**
- On app init, fetch available object types from VitalSync schema introspection
- Filter to objects the user has permission to access
- Display in collection navigator with appropriate icons

**Data Flow:**
1. `useCollectionData(objectType, filters, sort)` hook
2. Initial fetch: VitalSync SDK `.switchTo(model).query().select(fields).where(...).limit(100).fetchAllRecords()`
3. Real-time updates: VitalSync subscription on the same model
4. Pagination: `.offset(page * 100).limit(100)` on scroll-to-bottom
5. Color definitions: Loaded from schema XML field metadata (dropdown color maps)

**Key Files:**
```
src/components/collections/
  CollectionList.tsx        — Main list view with infinite scroll
  CollectionListItem.tsx    — Individual record row with swipe actions
  CollectionHeader.tsx      — Title, search icon, sort/filter controls
  SelectionActionBar.tsx    — Floating bar for multi-select bulk operations
  EmptyState.tsx            — Buddzee-branded empty state
src/hooks/useCollectionData.ts — VitalSync query + subscription + pagination
```

### 1D: Record Detail View

**What to Build:**

**Smart Record Detail (3-Tab + AI)**

**Tab 1: Overview**
- Hero section: Large name, company, avatar/photo, status badge
- Quick-action row: Call | SMS | Email | WhatsApp (auto-detect available channels)
- AI Summary card: Buddzee-generated 2-3 sentence summary — "John is an enterprise lead who's been engaged for 3 weeks. He has a pending proposal worth $15K and prefers email communication."
- Activity timeline: Unified feed of all interactions with relative timestamps ("2 hours ago")
- Engagement score: Visual indicator (0-100) with trend arrow

**Tab 2: Details**
- Editable field cards grouped by category (Personal, Business, Custom)
- Inline editing: tap field → edit in-place → auto-save with debounce
- Smart field types: phone auto-formatted, emails validated, dates with native picker, dropdowns with Ontraport enum values
- Field reordering: long-press → drag to reorder → saved to user preferences
- Field selection: toggle which fields show via settings gear icon

**Tab 3: Connected**
- Related records carousel: Deals, tasks, notes as horizontal scrollable cards
- Cross-record navigation: tap related record → push to its detail view
- Buddzee insights panel: "Based on similar contacts, this lead is 73% likely to convert."
- Widget management: choose which sections appear (tasks, deals, notes, automations, tags)

**AI Summary Generation:**
- On record open, check if cached summary exists (24h TTL)
- If not, POST to n8n webhook with contact data → Claude generates summary → cache in `ai_record_summaries` table
- Show with "Buddzee's Insight" header + Buddzee avatar

**Unified Activity Timeline**
- Data sources: Ontraport activity log (via VitalStats REST proxy), VitalSync object log entries, local call_logs, email/SMS history, task completions, automation events
- Single scrollable timeline with icon + color per type, expandable detail, "Load more" pagination (50 items)

**Key Files:**
```
src/components/records/
  RecordDetail.tsx           — 3-tab container with swipe navigation
  RecordOverview.tsx         — Hero + actions + AI summary + timeline
  RecordDetails.tsx          — Editable field cards with inline editing
  RecordConnected.tsx        — Related records + Buddzee insights
  ActivityTimeline.tsx       — Unified activity feed
  AiSummaryCard.tsx          — Buddzee-generated contact summary
  EngagementScore.tsx        — Visual score with trend
  RelatedRecordCarousel.tsx  — Horizontal scroll of related items
  InlineFieldEditor.tsx      — Smart field editing by type
src/hooks/useRecordDetail.ts — Fetch + subscribe to single record
src/hooks/useActivityLog.ts  — Fetch activity timeline via GraphQL
src/hooks/useRelatedRecords.ts — Fetch related objects
```

**Database:**
```sql
CREATE TABLE ai_record_summaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_id INT NOT NULL,
  object_type VARCHAR(64) NOT NULL,
  summary TEXT NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_record (record_id, object_type)
);
```

### 1E: Record Creation & Editing

**What to Build:**

**Quick Add (Default)**
- Floating "+" button → slide-up sheet with minimal fields
- For contacts: First Name, Last Name, Email, Phone (auto-formatted)
- For deals: Name, Stage (dropdown), Amount, Contact (search-link)
- **AI Auto-Fill:** Buddzee can populate fields from clipboard content, voice input, or camera scan (business card)
- Tapping "Save" creates record via VitalSync SDK mutation

**Full Creation Form**
- "More fields" expander below quick add
- All available fields organized by category
- Validation with real-time feedback (email format, phone format, required fields)
- Draft auto-save (resume if app crashes mid-entry)

**Inline Record Editing**
- From record detail, tap any field to edit in-place
- Auto-save with 1-second debounce (no explicit save button)
- Undo toast: "Updated email. [Undo]" for 5 seconds
- Optimistic updates — UI updates immediately, rolls back on error
- Debounced save with AbortController for rapid edits
- Undo stack in Zustand store (last 5 changes)

**VitalSync Mutation Pattern:**
```typescript
const mutation = plugin.switchTo('Contact').mutation();
mutation.createOne({
  first_name: 'John',
  last_name: 'Smith',
  email: 'john@example.com',
});
await mutation.execute(true).toPromise();
// Re-subscribe after mutation (mutations disrupt subscriptions)
```

**Key Files:**
```
src/components/records/
  QuickAddSheet.tsx       — Bottom sheet with minimal fields
  FullCreateForm.tsx      — Complete creation form with all fields
  FieldInput.tsx          — Smart input by field type
src/hooks/useRecordMutation.ts — VitalSync SDK create/update/delete with optimistic updates
```

### 1F: Search, Sort & Filter

**What to Build:**

**Universal Search**
- Global search bar at top of every collection (or accessible via pull-down)
- Cross-collection search: one search box searches contacts, deals, companies, tasks simultaneously
- Instant results with debounced query (300ms)
- Search suggestions: recent searches + Buddzee-suggested queries
- Voice search: tap mic icon → Buddzee converts to search query
- VitalSync SDK `.where('field', 'like', '%term%').orWhere(...)` for multi-field search

**Smart Sorting**
- Sort icon in collection header → popover with sortable fields
- Single tap ascending, second tap descending, third to clear
- AI-suggested sort: Buddzee suggests "Sort by last activity" when viewing a stale list
- Sort preference persisted per collection in nav store

**Ontraport Group Replication (Critical Architecture)**

Rather than querying Ontraport every time a user selects a group, we **replicate the group filter logic as VitalSync queries**:

1. **Sync group definitions** — Fetch from Ontraport API: `GET /rest/ontraport/Groups/?objectID={objectTypeId}`
2. **Store locally** — `group_cache` table with filter criteria as JSON
3. **Translate at runtime** — `groupQueryTranslator.ts` converts Ontraport filter operators to VitalSync SDK `.where()` chains
4. **Query VitalSync directly** — all filtered data comes from VitalSync, giving real-time subscriptions, faster queries, and consistent data access patterns
5. **Works across ALL objects** — Contacts (objectID=0), Deals, Companies, Tasks, Custom Objects — each gets its own group set fetched by objectID parameter
6. **User control** — users can toggle which groups appear, reorder them, and combine multiple groups

**Supported Ontraport Filter Operators → VitalSync Translation:**

| Ontraport Operator | VitalSync SDK | Example |
|-------------------|---------------|---------|
| `=` (equals) | `.where('field', '=', value)` | Status = Active |
| `!=` (not equals) | `.where('field', '!=', value)` | Stage != Lost |
| `LIKE` | `.where('field', 'like', '%value%')` | Company contains "Tech" |
| `>`, `<`, `>=`, `<=` | `.where('field', '>', value)` | Amount > 5000 |
| `BETWEEN` | `.where('field', '>=', min).andWhere('field', '<=', max)` | Date range |
| `IN` | Multiple `.orWhere()` chains | Tag in [VIP, Enterprise] |
| `NOT IN` | Negated `.where()` chains | Status not in [Cancelled] |
| `IS NULL` / `IS NOT NULL` | `.where('field', '=', null)` / `.where('field', '!=', null)` | Has/missing email |

**UX:**
- Group selector chip bar above the collection list
- Groups created in Ontraport desktop appear as tappable filter chips
- Active group highlighted with accent color
- Multiple groups can be combined (AND/OR toggle)
- Quick filters alongside: "Active", "This Week", "Assigned to Me"
- Groups cached on first load, refreshed on pull-to-refresh

**AI-Powered Natural Language Filter**
- Tap Buddzee icon or type in search: "Show me contacts from Sydney who haven't been contacted in 30 days"
- Same Dynamic Metrics architecture: English → QueryConfig → VitalSync SDK query
- Applied as temporary smart filter with "x" to clear

**Key Files:**
```
src/components/search/
  UniversalSearch.tsx        — Cross-collection search with debounce
  GroupFilterChips.tsx        — Ontraport group filter chip bar
  SortPopover.tsx            — Sort field selector
  NaturalLanguageFilter.tsx  — AI-powered filter via Buddzee
src/hooks/useOntraportGroups.ts — Fetch + cache group definitions from Ontraport API
src/utils/groupQueryTranslator.ts — Ontraport filter operators → VitalSync SDK .where() chains
```

**Database:**
```sql
CREATE TABLE group_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  object_type VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  filter_criteria JSON NOT NULL,
  last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_group (group_id, object_type)
);
```

**Feature flag:** `crm-platform`

---

## Milestone 2: Communication Hub

**Delivers:** Omnichannel communication — unified conversation threads, calling with AI intelligence, email/SMS with AI drafting and Ontraport templates. Users see ALL interactions with a contact in one place and can reply from any channel.

**Builds on:** Milestone 1 (record detail view, contact data), VitalStats REST proxy (Ontraport API access), Buddzee AI (drafting).

### 2A: Unified Communication Center

**Why:** The #1 complaint about mobile CRMs is channel fragmentation. Users expect a single conversation view across all channels.

**What to Build:**

- From any contact, tap "Messages" → single chronological thread showing ALL channels:
  - Emails (sent/received) — with subject line as header
  - SMS messages (sent/received)
  - Call logs (with duration, outcome, AI-generated summary)
  - Notes (manual entries)
  - WhatsApp messages (if integrated)
- Each message has a channel icon badge (email/SMS/phone/note)
- Reply directly from the thread — channel picker at the bottom
- **AI Thread Summary:** "Last contacted 3 days ago via email. Discussed pricing for Enterprise plan. Follow-up scheduled for Friday."

**Data Aggregation:**
1. Ontraport email history → VitalStats REST proxy
2. Ontraport SMS history → VitalStats REST proxy
3. Call logs → local `call_logs` MySQL table
4. Notes → VitalSync object log entries
5. Sort by timestamp, paginate with infinite scroll

**Key Files:**
```
src/components/communication/
  ConversationThread.tsx    — Unified timeline view
  MessageBubble.tsx         — Per-message display with channel badge
  ChannelPicker.tsx         — Bottom bar: Email | SMS | Call | Note
  ThreadSummaryCard.tsx     — AI-generated conversation summary
src/hooks/useConversationThread.ts — Merge data from multiple sources
```

### 2B: Calling with AI Call Intelligence

**What to Build:**

**Smart Calling**
- Tap phone icon → native dialer opens (Capacitor `@capacitor/call-number`)
- After call ends, app detects return → bottom sheet slides up:
  - Call outcome buttons: Connected | Voicemail | No Answer | Busy
  - Quick notes free-text input
  - Follow-up scheduler with date/time picker
  - Task auto-create option

**AI Call Intelligence (Beyond Ontraport)**
- Optional "Record with Buddzee" toggle (with consent notification)
- After call, Buddzee processes recording:
  - Call summary: 3-5 bullet points
  - Action items extracted: "John mentioned needing a proposal by Friday"
  - Sentiment analysis: Positive/Neutral/Negative
  - Auto-created tasks from each action item
- n8n workflow: audio → transcription (Whisper/Deepgram) → Claude analysis → structured response

**Key Files:**
```
src/components/communication/
  CallLogger.tsx           — Post-call logging sheet
  CallOutcomeButtons.tsx   — Quick outcome selection
  FollowUpScheduler.tsx    — Date/time picker for next contact
server/src/routes/calls.ts — Call log CRUD endpoints
```

**Database:**
```sql
CREATE TABLE call_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_id INT NOT NULL,
  contact_name VARCHAR(255),
  outcome ENUM('connected', 'voicemail', 'no_answer', 'busy') NOT NULL,
  duration_seconds INT DEFAULT NULL,
  notes TEXT,
  ai_summary TEXT DEFAULT NULL,
  follow_up_date TIMESTAMP DEFAULT NULL,
  follow_up_task_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact (contact_id),
  INDEX idx_user_date (user_id, created_at)
);
```

### 2C: Email with AI Drafting

**What to Build:**

**Smart Email Compose**
- To: Pre-filled with contact email
- Subject: Auto-suggested based on context
- Body: Rich text editor (bold, italic, lists, links)
- **Buddzee Draft:** "Write this for me" → Claude generates email based on contact context, user instruction, and writing style
- Template picker: slide-in panel with Ontraport email templates
- Schedule toggle: send now or pick date/time
- Attachments: camera, file picker, recent documents

**AI Draft Flow:**
1. User taps "Buddzee, draft this" with optional instruction
2. POST context + instruction to backend
3. Backend → n8n webhook → Claude generates draft
4. Draft streams back (SSE) in compose body
5. User reviews, edits, sends

**Email Template Browser**
- Searchable grid/list of saved Ontraport email templates
- Preview with merge fields resolved for current contact
- Fetch: `GET /rest/ontraport/Messages/?search=&objectID=0`
- Cache templates locally with 1-hour TTL

**Sending:**
- Individual: Ontraport API direct send (`POST /1/Messages/send`)
- Broadcast: Ontraport API bulk send with group/tag targeting

**Key Files:**
```
src/components/communication/
  EmailCompose.tsx         — Full compose UI
  AiDraftButton.tsx        — Buddzee draft trigger
  TemplatePicker.tsx       — Ontraport email template selector
  ScheduleSendToggle.tsx   — Send now / schedule picker
server/src/routes/email.ts — Send via Ontraport API, template fetching
```

### 2D: SMS with AI Drafting

**What to Build:**

- SMS-optimized compose with character counter (160/320/480 segments)
- Quick-reply suggestions based on conversation context
- Emoji picker
- Buddzee AI draft (shorter, conversational tone for SMS)
- Template picker (SMS templates from Ontraport)
- Schedule send
- Sending: Ontraport SMS API via VitalStats REST proxy

**Key Files:**
```
src/components/communication/
  SmsCompose.tsx           — SMS-optimized compose
  SmsCharCounter.tsx       — Segment counter
  QuickReplySuggestions.tsx — AI-suggested quick replies
server/src/routes/sms.ts   — Send via Ontraport API
```

**Feature flag:** `communication-hub`

---

## Milestone 3: Productivity & Pipeline

**Delivers:** Task management with AI-suggested outcomes that trigger Ontraport automations, visual Kanban pipeline, smart tagging, and bulk operations across records.

**Builds on:** Milestone 1 (collections, records), Milestone 2 (communication), VitalSync SDK (data), Ontraport API (automation triggers).

### 3A: Task Management with AI Outcomes

**What to Build:**

**Task Hub**
- Grouped by: Today / Overdue / Upcoming / Completed (collapsible sections)
- Task card: title, due date (with overdue indicator), assigned user avatar, linked contact chip, priority color
- Swipe right: Complete task (with haptic feedback)
- Swipe left: Reschedule / Reassign / Cancel
- Quick filters: "My Tasks" | "All Tasks" | "Overdue" | "By Process"

**Task Completion with Outcomes**
- Swipe to complete → if task has defined outcomes, show outcome picker sheet:
  - "Interested" | "Not Interested" | "Call Back Later" | "Wrong Number"
  - Selected outcome triggers the corresponding Ontraport automation step
- Buddzee suggests outcome based on recent activity: "Based on your last call notes ('they said they need to check with their boss'), I'd suggest 'Call Back Later'"

**Smart Task Creation**
- Quick add: Title + due date + optional contact link
- From template: Pick from Ontraport task templates
- Voice creation: "Buddzee, create a task to follow up with John Smith next Tuesday"
- AI auto-tasks: Buddzee proactively suggests tasks for stale deals, upcoming follow-ups, post-call action items

**Key Files:**
```
src/components/tasks/
  TaskHub.tsx              — Main task view with grouped sections
  TaskCard.tsx             — Individual task with swipe actions
  TaskCompletionSheet.tsx  — Outcome picker with AI suggestion
  TaskCreateSheet.tsx      — Quick add + template + voice
  TaskFilters.tsx          — Filter chip bar
src/hooks/useTaskData.ts   — VitalSync task queries + subscriptions
server/src/routes/tasks.ts — Task CRUD, outcomes → Ontraport API
```

**Database:**
```sql
CREATE TABLE task_outcomes_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  outcome VARCHAR(128) NOT NULL,
  ai_suggested_outcome VARCHAR(128),
  ai_suggestion_accepted BOOLEAN,
  automation_triggered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task (task_id)
);
```

### 3B: Deals & Pipeline Management

**What to Build:**

**Kanban Board View (Default)**
- Horizontal scrollable columns, one per sales stage
- Cards show: deal name, amount ($), contact name, days in stage, health indicator
- **Drag-and-drop** cards between stages (updates deal stage in Ontraport via VitalSync SDK mutation)
- Color-coded health: Green (on track), Yellow (aging), Red (at risk / overdue)
- Column totals: Sum of deal values per stage at column header
- Pipeline summary bar: Total pipeline value, weighted forecast, expected close this month

**List View (Toggle)**
- Sortable table: Deal, Stage, Amount, Contact, Expected Close, Days in Stage
- Row color coding by health status

**Deal Detail**
- Same 3-tab pattern as contact records
- Additional: Stage progression timeline (visual dots showing pipeline journey)
- Buddzee insight: "This deal has been in 'Proposal Sent' for 12 days. Similar deals that closed typically moved to 'Negotiation' within 7 days."

**Deal Health Calculation:**
- Green: Within average days for this stage
- Yellow: 1.5x average days in stage
- Red: 2x average days OR past expected close date
- Calculated client-side from deal data + historical averages stored in app config

**Key Files:**
```
src/components/pipeline/
  PipelineBoard.tsx        — Kanban board with @dnd-kit drag-and-drop
  PipelineColumn.tsx       — Stage column with total
  DealCard.tsx             — Individual deal card
  PipelineSummaryBar.tsx   — Pipeline metrics bar
  DealDetailView.tsx       — Deal-specific record detail
  StageTimeline.tsx        — Visual stage progression
src/hooks/usePipelineData.ts — Deals grouped by stage
src/hooks/useDealHealth.ts   — Calculate deal health indicators
```

### 3C: Tags & Organization

**What to Build:**
- Tag chips displayed on record detail view and in collection list items
- Tap "+" → searchable tag picker with recent/frequent tags at top
- Long-press tag to remove
- **AI auto-tag suggestion:** Buddzee suggests tags based on record data
- **Bulk tagging:** From multi-select mode, add/remove tags across selected records
- Fetch available tags: Ontraport API `GET /1/Tags`
- Add tag: Ontraport API `PUT /1/Contacts/tag` with `{ objectID, ids, add_list }`
- Remove tag: Ontraport API `PUT /1/Contacts/tag` with `{ objectID, ids, remove_list }`
- All via VitalStats REST proxy with `dataSourceId` header

### 3D: Bulk / Group Actions

**What to Build:**

**Contextual Bulk Action Bar**
- Enter multi-select by long-pressing a record or tapping "Select" icon
- Floating action bar: "3 contacts selected"
- Action icons: Email | SMS | Tag | Field Update | Automation | Task | Delete
- Each action opens a focused sheet
- **Confirmation dialog** for destructive actions (delete) with biometric auth option
- **Progress indicator** for bulk operations (progress bar with current/total)
- **Background execution option:** "Run in background — we'll notify you when done" → n8n workflow handles batch

**Key Files:**
```
src/components/bulk/
  BulkActionBar.tsx        — Floating bar with action icons
  BulkEmailSheet.tsx       — Compose or select template for group
  BulkSmsSheet.tsx         — SMS compose for group
  BulkTagSheet.tsx         — Add/remove tags
  BulkFieldUpdateSheet.tsx — Select field + new value
  BulkAutomationSheet.tsx  — Add/remove from automation maps
  BulkTaskSheet.tsx        — Create task for all selected
  BulkDeleteConfirm.tsx    — Destructive action confirmation
```

**Feature flag:** `pipeline-management`

---

## Milestone 4: Today Screen & Dashboard System

**Delivers:** AI-curated Today Screen as the default dashboard, plus multi-dashboard tabs, 6 chart types, period filtering, data processing pipeline. Merges the Ontraport Today Screen concept with the Buddzee Dashboard Builder.

**Builds on:** Dynamic Metrics (QueryConfig, aggregation types, metric_definitions table), MUI X Charts Pro (already in stack), TanStack Query (auto-refresh), VitalSync SDK (data fetching + time variables).

### What to Build

**A. Today Screen (Default Dashboard)**

**Top Section: Buddzee Greeting + Quick Actions**
- "Good morning, Andrew! Here's your day." (time-contextual greeting)
- Quick action chips: "Call overdue leads" | "Check pipeline" | "Draft follow-ups"

**Metrics Row: Dynamic, AI-Generated**
- Scrollable row of metric cards (3 visible on mobile, swipe for more)
- Each card: Value, title, sparkline trend, color accent
- Default: New Contacts Today | Pipeline Value | Revenue This Week | Overdue Tasks
- **Fully customizable** — users create new metrics by asking Buddzee (Milestone 8)

**Task Section: Today's Priorities**
- Top 5 tasks for today, ordered by priority, quick-complete with swipe
- Overdue tasks highlighted in red

**Activity Feed: AI-Curated**
- Buddzee curates and prioritizes (not just newest/hottest/latest):
  - "3 hot leads need attention" | "Deal 'Enterprise Plan' is aging" | "New contact: Sarah Johnson (referred by John Smith)"
- Each item tappable → navigates to relevant record
- Feed refreshes via VitalSync real-time subscription

**Buddzee Insight Card**
- One highlight insight per day, generated via n8n scheduled workflow → Claude analysis → cached in `daily_insights` table

**B. Dashboard Management**
- Multi-dashboard with tabs (MUI `Tabs`, scrollable variant)
- Create / rename / pin / unpin / soft-delete dashboards
- Per-dashboard date range context (stored as dashboard variable overrides)
- DB: `dashboards` table (id, user_id, name, configuration JSON, sort_order, is_pinned, deleted_at)

**C. Widget System**
- 6 widget types: **line, bar, area, gauge, number, table**
- Each widget is self-contained: fetches its own data, processes, renders
- Widget config stored as JSON (data source PUID, axes, aggregation, formatting, goals, refresh)
- DB: `widgets` table (id, dashboard_id, user_id, name, chart_type, configuration JSON, sort_order, col_span)
- Widgets wrap MUI X Charts Pro components (thin wrappers with consistent API)

**D. Period Management & Date Filtering**
- Global period picker in dashboard header (Today / 7D / 30D / MTD / YTD / Custom)
- MUI `ToggleButtonGroup` for presets + `DateRangePicker` for custom
- Injects `X_DAY_BEGIN` / `X_DAY_END` time variables into all widget queries
- Stored in dashboard Zustand slice

**E. Data Processing Pipeline**
- `src/utils/data-processing.ts` — pure functions
- `detectAxes()` — auto-detect date X axis + numeric Y axes
- `aggregate()` — roll up by day/week/month/quarter/year, 7 methods (sum, mean, median, min, max, first, last)
- `fillDateGaps()` — insert zero-value rows for missing dates
- `calculateTrendline()` — linear regression
- `formatValue()` — number formatting engine (currency/percent/compact via `Intl.NumberFormat`)

**F. Auto-Refresh & Drag-and-Drop**
- Per-widget `refetchInterval` via TanStack Query
- `@dnd-kit/core` + `@dnd-kit/sortable` for widget ordering

### Key Files to Create
```
src/
  features/dashboard/
    TodayScreen.tsx            — Default dashboard with greeting + metrics + tasks + feed
    BuddzeeGreeting.tsx        — Time-contextual greeting + quick actions
    AiActivityFeed.tsx         — Buddzee-curated activity items
    DailyInsightCard.tsx       — AI-generated daily insight
    DashboardTabs.tsx          — Tab bar with pin/unpin context menu
    DashboardHeader.tsx        — Period picker + refresh all + dashboard settings
    WidgetGrid.tsx             — Sortable grid container (@dnd-kit)
    PeriodPicker.tsx           — Preset toggles + custom date range
    widgets/
      ChartWidget.tsx          — Container card (header, chart, footer)
      WidgetHeader.tsx         — Name, refresh, settings, AI insight toggle
      LineChart.tsx            — MUI X Charts Pro wrapper
      BarChart.tsx             — MUI X Charts Pro wrapper
      AreaChart.tsx            — MUI X Charts Pro wrapper
      GaugeWidget.tsx          — MUI X Gauge with custom center label
      NumberWidget.tsx         — Big number + delta + sparkline
    dialogs/
      AddWidgetDialog.tsx      — Step wizard: data source → chart type → configure
      WidgetSettingsDialog.tsx  — Edit widget config
      DashboardManagerDialog.tsx — Create/rename/delete/reorder dashboards
    hooks/
      useDashboard.ts          — Dashboard CRUD + active dashboard state
      useWidgetData.ts         — Fetch + process pipeline per widget
      useDashboardData.ts      — Aggregate queries for all dashboard sections
    stores/
      dashboardStore.ts        — Zustand: dashboards[], activeDashboardId, dateRange
    utils/
      data-processing.ts       — Aggregation, gap-fill, trendline, axis detection
      formatting.ts            — Number formatting engine (Intl.NumberFormat)
      period-presets.ts        — Period offset calculations
    types.ts                   — Dashboard, Widget, WidgetConfig, ProcessedData interfaces
```

**Feature flag:** `dashboard-system`

---

## Milestone 5: Goal & KPI Tracking + Smart Notifications

**Delivers:** Goal targets on charts, forecasting badges, AI conversational goal setup ("notify me at 3pm if we miss target"), push notifications with deep links to dashboards. This is the killer feature.

**Builds on:** Milestone 4 (dashboards/widgets), Automation Engine (scheduled n8n workflows, condition evaluator, AI tools), OneSignal (deep linking), AI Chat Agent (conversational tool execution).

### What to Build

**A. KPI Definitions & Management**
- DB: `kpi_definitions` table (id, name, description, owner_user_id, parent_kpi_id, rollup_method, configuration JSON)
- DB: `kpi_widget_links` table (kpi_definition_id, widget_id)
- KPI config JSON: goalType (fixed/linear/seasonal), annualTarget, periodStart/End, seasonalWeights, forecast thresholds, conditional colors
- KPI Manager dialog for CRUD

**B. Goal Processing Engine**
- `src/utils/goal-processing.ts` — pure functions:
  - `generateDailyTargets()` — daily target vector from annual goal + distribution type
  - `calculateForecast()` — linear regression on actuals to predict end-of-period
  - `calculateVelocity()` — current rate vs required rate
  - `assessConfidence()` — safe (>90%) / risk (70-90%) / critical (<70%)
  - `getGoalForPeriod()` — slice daily targets for current dashboard date range
- Goal overlay on MUI X Charts via `referenceLinePlugin` (built-in)
- Gauge widget: value vs target with delta indicator
- Forecast badge on widget header ("On Track" / "At Risk" / "Critical")

**C. Goal Notification Automation (n8n + OneSignal)**

```
User in AI Chat: "Notify me at 3pm every day if we haven't hit $10K in sales"
  → AI Chat Agent calls existing create_automation tool (extended with goal_check type)
  → Creates automation_rule in DB:
      type: 'goal_check'
      schedule: '0 15 * * *' (3pm daily)
      condition: { metric: 'daily_revenue', operator: 'lt', threshold: 10000 }
      action: { type: 'push_notification', title: 'Sales Target Alert', deepLink: { dashboardId: 5 } }
  → Creates n8n scheduled workflow via existing n8n-client:
      Schedule Trigger (3pm) → VitalSync GraphQL query (with X_DAY_BEGIN time var)
      → Code node evaluates condition → OneSignal Push API → deep link payload
  → Activates workflow
```

**D. OneSignal Deep Link Extension**
- Extend push notification payload: add `dashboardId` and `widgetId` fields
- Extend `useDeepLinkListener` hook to handle dashboard navigation
- When user taps notification → app opens → navigates to specific dashboard

**E. New AI Chat Tool: `setup_goal_notification`**
- Added to the AI Chat Agent's tool registry
- Takes natural language goal description, parses into: metric, threshold, schedule, notification preferences
- Calls `create_automation` internally with `goal_check` type

### Key Files to Create/Modify
```
NEW:
  src/features/dashboard/kpi/
    KpiManager.tsx             — CRUD dialog for KPI definitions
    GoalOverlay.tsx            — Reference line integration for charts
    ForecastBadge.tsx          — On Track / At Risk / Critical chip
    GaugeGoalWidget.tsx        — Gauge with goal target + delta
  src/features/dashboard/utils/
    goal-processing.ts         — Daily targets, forecast, velocity, confidence
  server/src/lib/tools/goal-tools.ts  — setup_goal_notification AI tool

MODIFY:
  server/src/lib/tools/ (automation tools) — Add goal_check automation type
  server/src/routes/assistant.ts or chat.ts — Register new goal tool
  src/hooks/useDeepLinkListener.ts — Add dashboardId/widgetId navigation
  OneSignal notification payload — Add dashboard deep link fields
```

**Feature flag:** `goal-kpi-tracking`

---

## Milestone 6: AI-Powered Insights + Widget Library

**Delivers:** Per-widget AI analysis ("so what?"), dashboard summary, pre-built widget templates for quick setup.

**Builds on:** Milestone 4 (widgets), AI Chat Agent (n8n → Claude), n8n workflow builder.

### What to Build

**A. Per-Widget AI Insights**
- "Insight" button on each widget header
- Sends widget data (last N data points) + context to n8n webhook
- n8n AI agent (Claude) returns 3-sentence business analysis
- Displayed in collapsible panel below chart

**B. Dashboard Summary**
- "Summarize" button in dashboard header
- Collects summary stats from all widgets → n8n → Claude finds cross-metric patterns
- Returns 1-paragraph summary in dialog/banner

**C. Widget Library & Templates**
- `is_template` flag on widgets table
- Widget Library dialog: browse pre-configured templates with previews
- "Add to Dashboard" clones template into widget instance
- "Save to Library" saves current widget as template

### Key Files to Create
```
src/features/dashboard/
  ai/
    WidgetInsight.tsx          — Collapsible insight panel per widget
    DashboardSummary.tsx       — Summary dialog/banner
  library/
    WidgetLibrary.tsx          — Browse + add template widgets
    WidgetTemplateCard.tsx     — Preview card for library items

n8n workflows (via n8n-builder):
  widget-insight.json          — Per-widget analysis workflow
  dashboard-summary.json       — Cross-metric pattern analysis workflow
```

**Feature flag:** `ai-insights`, `widget-library`

---

## Milestone 7: Voice & Vision Phase 2 + Deepgram Conversation + Lead Capture

**Delivers:** 16 additional voice/camera actions beyond the 4 in Milestone 1, PLUS real-time voice-to-voice conversation with Buddzee via Deepgram Voice Agent API, PLUS multi-modal lead capture (QR codes, NFC). Users can have natural spoken dialogues where Buddzee listens, thinks, speaks back, and executes actions.

**Builds on:** Voice & Vision Phase 1 (action registry, AI processor, confirmation UI).

### 7A. Deepgram Voice Conversation Mode (NEW)

Real-time bidirectional voice via Deepgram's Voice Agent API — a single WebSocket handling STT (Nova-3) + LLM (Claude/Anthropic) + TTS (Aura-2).

**Full feature doc:** `docs/features/buddzee-voice-conversation.md`

**Key details:**
- **NPM:** `@deepgram/sdk` (backend + frontend)
- **Auth:** Backend generates short-lived JWT tokens; client never sees permanent API key
- **LLM:** Claude via Deepgram's Anthropic think provider — consistent Buddzee personality
- **Function calling:** Existing action registry maps directly to Deepgram function definitions
- **Cost:** ~$4.50/hr Deepgram + Claude tokens. ~$0.50 per 5-min conversation, ~$50/month for 100 conversations
- **Files:** 6 new + 4 modified per app

**New env vars:** `DEEPGRAM_API_KEY`, `DEEPGRAM_VOICE_MODEL`, `DEEPGRAM_STT_MODEL` (backend); `VITE_VOICE_CONVERSATION_ENABLED` (frontend)

### 7B. Extended Voice Actions (16 New Actions)

**High Priority (most client value):**
1. `create-quote` — Voice-driven quoting with line items
2. `draft-email` — AI-drafted emails from voice/text input
3. `create-appointment` — Schedule appointments via voice
4. `create-task` / `create-follow-up` — Task/reminder creation
5. `scan-receipt` — Photo → expense record with GST extraction

**Medium Priority:**
6. `log-interaction` — Log calls/meetings/visits
7. `voice-memo` — Quick capture, AI-summarized
8. `create-invoice` — Invoice from voice or from existing quote
9. `draft-sms` — Quick text message drafting

**Lower Priority (industry-specific):**
10. `scan-id-document` — Extract from driver's licence/ID
11. `document-site` — Photo + voice job site documentation
12. `dictate-report` — Form/report dictation
13. `scan-barcode` / `stock-check` / `log-material-usage` — Inventory actions
14. `generate-summary-email` — Meeting transcript → email

Each action is a self-contained module following the existing pattern in `server/src/lib/actions/`. No architectural changes needed.

### 7C. Multi-Modal Lead Capture (from Ontraport Feature 21)

**Camera Scan (Business Card):** Already covered by Voice/Vision `scan-business-card` action. Extended with option to add tags, assign to pipeline, or add to automation immediately after contact creation.

**QR Code Scan:**
- Scan QR code → if vCard data, extract contact info; if URL, open or extract metadata
- `@nicecode/capacitor-barcode-scanner` or `@capacitor-community/barcode-scanner`

**Manual Quick Entry:** Minimal form (Name + one contact method) for when camera isn't practical.

**Feature flag:** `assistant-actions-extended`, `voice-conversation`

---

## Milestone 8: Voice-Driven Dashboard Metrics + Role Defaults

**Delivers:** Users talk to the assistant and a metric appears on their dashboard. Role-based default dashboard configurations. This merges Voice/Vision Phase 6 with Buddzee dashboards.

**Builds on:** Milestone 4 (dashboards/widgets), Milestone 7 (voice assistant), Dynamic Metrics (English → QueryConfig → GraphQL).

### What to Build

**A. `add-dashboard-metric` Action**
- New voice assistant action: "Show me revenue this month broken down by week"
- Leverages existing Dynamic Metrics AI query generation (English → QueryConfig)
- Result is a widget added to the user's active dashboard
- Conversational refinement: "Make it a bar chart" → "Compare to last month" → "Set target of $50K"

**B. Role-Based Dashboard Defaults**
- Default metric/widget configs per role stored in `app_features` config_json
- On first login, user gets pre-populated dashboard based on their role
- Roles: Sales, Service Tech, Office Admin, Business Owner, Project Manager
- Each role gets 4-6 default widgets tuned to their KPIs
- Users can customize from there (add/remove/reorder)

**C. Dashboard Action Items Section**
- Section on dashboard showing lifecycle-driven action items (if Milestone 10 is built)
- Or simpler: shows overdue goals, automation alerts, pending tasks
- Quick-action buttons wire into voice assistant action registry

### Key Files to Create
```
server/src/lib/actions/add-dashboard-metric.ts  — New voice assistant action
src/features/dashboard/
  RoleDefaults.tsx             — First-login role selection + default dashboard setup
  ActionItemsSection.tsx       — Dashboard section for urgent items
  defaults/
    sales-defaults.ts          — Default widgets for Sales role
    admin-defaults.ts          — Default widgets for Office Admin role
    owner-defaults.ts          — Default widgets for Business Owner role
```

**Feature flag:** `voice-dashboard-metrics`, `role-dashboards`

---

## Milestone 9: AI Lead Scoring & Next-Best-Action

**Delivers:** Every contact gets a dynamic lead score (0-100) based on engagement signals, recency, and deal pipeline. Users see "Hot Leads" on their dashboard and get specific, personalized next-best-action recommendations.

**Builds on:** Milestone 1 (record detail), Milestone 4 (dashboard), AI Chat Agent, n8n workflows.

### What to Build

**A. Lead Scoring Engine**
- n8n workflow triggered on schedule (daily) or by Buddzee on demand
- Scoring factors: email opens, website visits, recency of contact, deal stage, tag history, communication frequency
- Score stored in VitalSync custom field or local `lead_scores` table
- Score recalculated on significant events (email open, deal stage change, new interaction)

**B. Lead Score UI**
- Lead score badge on every contact card in collection list (0-100 with color: red/yellow/green)
- Score breakdown on contact detail: "Score: 82/100 — High engagement (opened 5 emails), recent activity (called yesterday), deal in pipeline ($10K)"
- "Hot Leads" section on Today Screen — top 5 highest-scoring leads needing action

**C. Next-Best-Action Suggestions**
- Claude analysis of contact data + scoring factors → personalized recommendations
- "Call John today — he opened your proposal twice this morning"
- "Send a follow-up to Sarah — she hasn't responded in 5 days"
- Cached suggestions refreshed on score change

**Key Files:**
```
src/components/intelligence/
  LeadScoreBadge.tsx       — Circular score indicator
  LeadScoreBreakdown.tsx   — Factor-by-factor explanation
  HotLeadsList.tsx         — Priority leads on dashboard
  NextBestAction.tsx       — AI-suggested action cards
server/src/services/lead-scoring.ts — Score calculation engine
```

**Database:**
```sql
CREATE TABLE lead_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL UNIQUE,
  score INT NOT NULL DEFAULT 0,
  factors JSON NOT NULL,
  next_best_action TEXT,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_score (score DESC)
);
```

**Feature flag:** `lead-scoring`

---

## Milestone 10: Predictive Lifecycle Engine (Optional — High Complexity)

**Delivers:** The system knows where every contact is in their journey, what typically happens next, and tells the user what to do (with a personalized script).

**Builds on:** Milestone 9 (lead scoring), Milestone 5 (goals/KPIs), Automation Engine (n8n workflows), VitalSync SDK (field-change history queries).

### What to Build

**A. Lifecycle Snapshot Calculation**
- Query contact's full field-change history via VitalSync
- Build lifecycle position: current stage, time in stage, velocity trend, engagement signals, churn risk

**B. Cohort Pattern Analysis**
- Aggregate queries across all contacts in similar positions
- Find: what did they do next? What business actions correlated with success/failure?

**C. Next-Best-Action Generation**
- Claude with full lifecycle + cohort context generates personalized recommendations
- Talk tracks: suggested messages adapted to contact's history, tone, and channel

**D. n8n Pipelines**
- `lifecycle-trigger.json` — Webhook-triggered: single contact recalculation on field change
- `lifecycle-sweep.json` — Daily 6am: batch recalculation for stale/inactive contacts
- `lifecycle-refresh.json` — Manual: immediate single-contact refresh from app

**E. Frontend Components**
```
src/features/dashboard/lifecycle/
  LifecyclePromptCard.tsx      — "Next Step" prompt on contact detail
  LifecycleInsightBadge.tsx    — Compact badge for list views
  LifecycleDashboard.tsx       — Urgent actions, at-risk contacts, stuck pipeline
  lifecycle-types.ts           — Snapshot, CohortAnalysis, NextBestAction interfaces
  parse-lifecycle-fields.ts    — Parse ai_next_action JSON from contact record
```

**Feature flag:** `lifecycle-engine`

---

## Milestone 11: Offline-First with Smart Sync

**Delivers:** Full CRM functionality without internet. Records cached locally, mutations queued and synced on reconnect with conflict resolution.

**Builds on:** Milestone 1 (collections, records, mutations), Capacitor (network detection).

### What to Build

**A. Local Storage Strategy**
- IndexedDB via `idb` library for structured record storage
- Cache the user's most-accessed 500 records + all records from active pipeline + today's tasks
- Store queued mutations in a separate IndexedDB store

**B. Sync Queue**
```typescript
interface QueuedMutation {
  id: string;                    // UUID
  type: 'create' | 'update' | 'delete';
  model: string;                 // 'Contact', 'Deal', etc.
  recordId?: string;             // null for creates
  data: Record<string, unknown>; // Field values
  createdAt: number;             // Timestamp
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
}
```

**C. Conflict Resolution**
- Last-write-wins for field updates (server timestamp comparison)
- If conflict detected: "Your offline change to John's email conflicts with a change made by Sarah. Keep yours or theirs?"
- No conflict for creates (always succeed) or deletes (idempotent)

**D. Background Sync Service**
- Capacitor `@capacitor/network` plugin for connectivity detection
- On reconnect: process mutation queue sequentially
- Exponential backoff for failed syncs
- VitalSync SDK subscription re-establishment after reconnect

**UX:**
- Subtle banner when offline: "Working offline — changes will sync when connected"
- Read access: last-synced records available offline
- Write access: create contacts, log calls, add notes, complete tasks — all queued
- Settings → Sync: last sync time, pending changes count, sync errors

**Key Files:**
```
src/services/
  offlineStore.ts          — IndexedDB read/write
  syncQueue.ts             — Mutation queue management
  backgroundSync.ts        — Reconnect detection + queue processing
  conflictResolver.ts      — Conflict detection + resolution UI
src/hooks/useOfflineData.ts — Read from cache, fall back to SDK
src/hooks/useNetworkStatus.ts — Network state monitoring
```

**Feature flag:** `offline-mode`

---

## Milestone 12: 1Brain Knowledge Integration (Optional — Future)

**Delivers:** AI assistant knows the business's SOPs, policies, playbooks. Coaches users through processes, not just actions.

**Builds on:** All previous phases, especially AI Chat Agent and Lifecycle Engine.

### What to Build
- `server/src/services/onebrain.ts` — 1Brain API integration (search, getRelevantDocs, getRole)
- Role-based context injection into all Claude prompts
- SOP/policy retrieval for action-specific guidance
- Playbook-enhanced talk tracks in lifecycle prompts

**Feature flag:** `onebrain-integration`

---

## Milestone 13: Buddzee Template Scaffolding (Infrastructure)

**Delivers:** Every new app scaffolded from `templates/react-mobile-app/` starts with a working Buddzee AI chat endpoint — VitalSync tools, SSE streaming, session management, and a placeholder business domain ready to fill in.

**Builds on:** `buddzee-agent` shared library (VitalSync wrappers, tool definitions, prompt builder, agentic loop — all complete). Reference implementation: phyx-nurse-admin.

### What's Included in the Template

| Included (template scaffolding) | Excluded (add per-app) |
|---|---|
| `buddzee-agent` + `openai` dependencies | Metrics tools/tables |
| Placeholder `BusinessDomain` file | Frustration detection |
| Tool registry (buddzee-agent's 23 VitalSync tools) | Automation engine |
| AI chat route with SSE streaming | n8n workflow builder tools |
| Session + message DB tables | Newsletter/feature request tools |
| Auth middleware for AI routes | Image upload (multer/sharp) |
| OpenRouter client config | Client-side action tools |
| VitalSync schema context (live introspection) | App-specific query tools |

### New Template Files (6)

1. `server/src/db.ts` — MySQL connection pool (host.docker.internal, connectionLimit: 5)
2. `server/src/seed.ts` — Core AI tables: `ai_chat_sessions`, `ai_chat_messages`, `assistant_action_log`
3. `server/src/middleware/auth.ts` — JWT verification middleware (`requireAuth`, `AuthRequest` type)
4. `server/src/lib/app-domain.ts` — Placeholder `BusinessDomain` with `The Happy Clinic` substitution
5. `server/src/lib/tool-registry.ts` — Minimal registry importing buddzee-agent's `adaptAllTools()`
6. `server/src/routes/ai.ts` — AI chat route: `POST /api/ai/chat` (SSE), `GET/PATCH /api/ai/sessions`

### Modified Template Files (4)

7. `server/package.json` — Add `buddzee-agent` (file: reference) + `openai` ^6.19.0
8. `server/src/index.ts` — Mount `/api/ai`, call `seed()`, `express.json({ limit: '5mb' })`
9. `server/.env.example` — Add `OPENROUTER_API_KEY`, `AI_MODEL_*`, `DB_*` vars
10. `docker-compose.yml` — Add AI + DB env vars to `api` service

### Key Patterns

- **System prompt**: Uses `buddzeePreamble`, `dateTimeContext`, `userContext`, `domainContextSection`, `vitalsyncContextSection` from buddzee-agent
- **VitalSync schema**: Async `vitalsyncContextSection()` for live introspection (cached) — no local `schema-reference.json` needed
- **OpenRouter dual-model**: Claude primary + Gemini Flash fast, configurable via env vars
- **Session management**: Auto-creates sessions, saves messages to DB, `streamChat()` returns full text for persistence
- **Scaffold script**: No changes needed — existing `The Happy Clinic`, `thc`, `thc-clinicians-portal` placeholders cover all needs

**Feature flag:** N/A (template infrastructure, not a toggleable feature)

---

## Milestone 14: RAG Knowledge Base Self-Setup Skill

**Delivers:** Buddzee helps businesses set up their own searchable knowledge base — a self-bootstrapping RAG system where Buddzee watches a Google Drive folder, ingests documents into a vector database, and can search them at runtime.

**Builds on:** buddzee-agent (`BusinessDomain.knowledgeSources`, n8n workflow builder tools), n8n (Google Drive trigger, HTTP Request node), Pinecone (vector search).

### User Experience

1. Buddzee offers: "I can watch a Google Drive folder and make all your documents searchable for me. Want me to set that up?"
2. User gives prerequisites (Google Drive access, n8n configured)
3. Buddzee builds the n8n workflow: Google Drive trigger → document processor → chunk → embed → Pinecone upsert
4. Buddzee tests the pipeline
5. Buddzee asks user to add their first document
6. Buddzee processes it, then asks the user to verify search works
7. Going forward, Buddzee can search the knowledge base via `search_knowledge_base` tool

### What to Build

- **AI tool: `setup_knowledge_base`** — Builds an n8n workflow (Google Drive trigger → extract text → chunk → embed → Pinecone upsert). Uses existing n8n workflow builder tools.
- **AI tool: `search_knowledge_base`** — Queries Pinecone via n8n webhook (similarity search → return relevant chunks with source attribution)
- **Credential storage** — Pinecone API key stored in `app_settings` table (same encrypted KV pattern as n8n API key)
- **Auto-registration** — After setup, `knowledgeSources` in `BusinessDomain` auto-populated so Buddzee knows to use it

### Dependencies

- buddzee-agent Milestone 9 complete (BusinessDomain + knowledgeSources)
- Pinecone account/API key (or alternative vector DB)
- Google Drive OAuth credentials configured in n8n

**Feature flag:** `knowledge-base`

---

## Milestone 15: Embeddable Buddzee Spin-offs (Research Project)

**Delivers:** Branded, restricted-access versions of Buddzee that can be embedded on client websites via iframe. External users interact with Buddzee in a specific role with locked-down tool access.

**Builds on:** buddzee-agent (agentic loop, prompt builder, tool registry), BusinessDomain (scoped domain knowledge).

### Example Use Case

A cannabis clinic needs an application intake bot on their website:
- Buddzee asks eligibility questions
- Processes the application form
- Submits qualifying information into VitalSync
- Only has tools for: `ask_eligibility_question`, `submit_application`, `check_status`
- Cannot access: patient records, admin tools, internal data

### Key Requirements

1. **Embeddable** — iframe snippet that works on any website
2. **Branded** — client's logo, colors, name (could be "Buddzee" or custom name)
3. **Restricted tool access** — only specific tools for the specific procedure
4. **No auth required** — external users don't need an app login
5. **Rate limited** — prevent abuse (per-IP, per-session limits)
6. **Scoped system prompt** — only knows about the specific procedure
7. **Audit trail** — all interactions logged for compliance

### Architecture (Exploratory)

- Standalone Express endpoint: `POST /api/embed/:configId/chat`
- `embed_configs` DB table: name, system_prompt, allowed_tools[], branding, rate_limits
- iframe loads a lightweight chat widget (HTML/CSS/JS, no React)
- Same buddzee-agent agentic loop, but with filtered tool set

### Status

Research project — needs security spike before implementation.

**Feature flag:** `embeddable-buddzee`

---

## Milestones NOT Built (Deprioritized)

| Feature | Reason |
|---------|--------|
| Multi-tenant account architecture | Each business gets own app — not needed |
| Custom Chart Builder (AI code gen) | Security risk, MUI X Charts Pro covers 95% of needs |
| Voice & Vision Phase 4 (speaker diarization, offline) | Very advanced, defer until clear demand |
| Buddzee custom chart WebView sandbox | Replaced by chart configurator wizard approach |

---

## Implementation Summary

| Milestone | Feature Flag Key | Builds On | Est. Effort | Scope |
|-------|-----------------|-----------|-------------|-------|
| **0: Feature Flags** | (foundation) | Existing env vars | 2-3 days | All apps |
| **1: Core CRM Platform** | `crm-platform` | Milestone 0, VitalSync SDK, Capacitor | 2-3 weeks | New CRM apps |
| **2: Communication Hub** | `communication-hub` | Milestone 1, Ontraport API | 1-2 weeks | New CRM apps |
| **3: Productivity & Pipeline** | `pipeline-management` | Milestones 1-2, @dnd-kit | 1-2 weeks | New CRM apps |
| **4: Today Screen & Dashboards** | `dashboard-system` | Dynamic Metrics, MUI X Charts Pro | 1-2 weeks | All apps |
| **5: Goals & Smart Notifications** | `goal-kpi-tracking` | Milestone 4, Automation Engine, OneSignal, AI Chat | 1-2 weeks | All apps |
| **6: AI Insights & Widget Library** | `ai-insights`, `widget-library` | Milestone 4, n8n AI agent | 3-5 days | All apps |
| **7: Voice Phase 2 + Deepgram + Lead Capture** | `assistant-actions-extended`, `voice-conversation` | Voice/Vision Phase 1 | 1.5-2 weeks | All apps |
| **8: Voice Dashboards & Roles** | `voice-dashboard-metrics`, `role-dashboards` | Milestones 4+7, Dynamic Metrics | 3-5 days | All apps |
| **9: AI Lead Scoring** | `lead-scoring` | Milestone 1/4, n8n, AI Chat | 1 week | All apps |
| **10: Lifecycle Engine** | `lifecycle-engine` | Milestone 9, n8n, VitalSync | 2-3 weeks | All apps |
| **11: Offline-First** | `offline-mode` | Milestone 1, Capacitor, IndexedDB | 2-3 weeks | Mobile apps |
| **12: 1Brain** | `onebrain-integration` | All phases | TBD | All apps |
| **13: Buddzee Template Scaffolding** | (infrastructure) | buddzee-agent library | 2-3 days | Platform |
| **14: RAG Knowledge Base** | `knowledge-base` | Milestone 13, n8n, Pinecone | 1 week | All apps |
| **15: Embeddable Spin-offs** | `embeddable-buddzee` | buddzee-agent, BusinessDomain | TBD (research) | Platform |

---

## End-to-End Flow: "Notify me at 3pm if we miss target"

```
1. User opens AI Chat (existing feature)
2. Types: "I want to know at 3pm every day if we've hit our sales target"
3. AI Chat Agent calls setup_goal_notification tool:
   a. Parses: metric=daily_revenue, threshold=$10K, schedule=15:00 daily, direction=below
   b. Creates kpi_definition (if not exists) via DB
   c. Calls create_automation (existing tool, extended):
      - Type: goal_check
      - Schedule: cron '0 15 * * *'
      - Condition: { metric: 'daily_revenue', operator: 'lt', threshold: 10000 }
      - Action: { push_notification, title: 'Sales Target Alert', deepLink: { dashboardId } }
   d. Builds n8n scheduled workflow via n8n-client (existing):
      - Schedule Trigger (3pm) → HTTP Request (VitalSync GraphQL, X_DAY_BEGIN=0)
      - → Code node (evaluate: revenue < 10000?) → OneSignal REST API push
   e. Activates workflow
4. AI responds: "Done! You'll get a push notification every day at 3pm if daily revenue is below $10K."
5. At 3pm, n8n fires → checks VitalSync → revenue is $7,200 → sends push
6. User's phone: "Sales Target Alert — Daily revenue is $7,200 ($2,800 below target)"
7. User taps notification → app opens → navigates to Sales dashboard
```

## End-to-End Flow: "Add a contact from a business card"

```
1. User taps Buddzee FAB → Camera icon
2. Native camera opens → captures business card photo
3. "Buddzee is scanning..." → Claude vision API extracts: name, title, company, email, phone
4. Confirmation card shown with extracted fields (editable, color-coded by confidence)
5. User reviews, fixes phone number → taps "Save Contact"
6. VitalSync SDK mutation creates contact record
7. Option shown: "Add tags?" | "Assign to pipeline?" | "Add to automation?"
8. User selects "Hot Lead" tag → Ontraport API adds tag
9. Buddzee: "Contact saved! John Smith from Acme Corp added with 'Hot Lead' tag."
```

---

## Verification Plan

**Milestone 0:** Create feature flag for an existing feature (e.g., AI Chat), toggle it off, verify component doesn't render. Toggle on, verify it works.

**Milestone 1:** Create contact via magic link auth flow. Browse contacts collection with infinite scroll. Open contact detail, verify 3 tabs. Edit a field inline, verify auto-save. Search across collections. Select an Ontraport group filter, verify VitalSync query returns matching records. Toggle groups on/off in settings.

**Milestone 2:** Open contact conversation thread, verify emails + SMS + calls appear chronologically. Make a call, verify post-call logger appears. Compose email with Buddzee draft, verify AI generates contextual content. Send SMS, verify character counter and delivery.

**Milestone 3:** Complete task with outcome, verify Ontraport automation triggered. View pipeline Kanban, drag deal to new stage, verify field update. Tag a contact, verify via Ontraport API. Multi-select records, bulk tag, verify progress indicator.

**Milestone 4:** Create a dashboard with 3 widgets (line, bar, gauge), change period filter, verify all charts update. Drag to reorder, verify order persists. Verify Today Screen shows greeting, metrics, tasks, activity feed.

**Milestone 5:** Create a KPI via the manager, link to a widget, verify goal line appears. Use AI Chat to set up a 3pm notification, verify n8n workflow is created and activated. Trigger manually, verify push arrives with deep link.

**Milestone 6:** Click "Insight" on a widget, verify AI analysis appears. Save widget as template, browse library, add to different dashboard.

**Milestone 7:** Test each new action via voice/text — verify extraction, confirmation card, and VitalSync mutation. Test Deepgram conversation mode — verify bidirectional voice works. Scan QR code, verify contact creation.

**Milestone 8:** Say "Show me revenue this month" via voice assistant, verify widget appears on dashboard. Login as new user with "Sales" role, verify default dashboard loads.

**Milestone 9:** Verify lead score appears on contact cards. Open contact detail, verify score breakdown. Check Today Screen "Hot Leads" section. Verify next-best-action suggestions.

**Milestone 11:** Disconnect network, verify offline banner appears. Create a contact offline, verify it's queued. Reconnect, verify sync processes and contact appears in VitalSync.

**Milestone 13:** Scaffold a test app via `new-mobile-app.sh`, verify `npm install && npx tsc --noEmit` passes. Confirm placeholders are replaced. Verify AI chat route exists and buddzee-agent tools are registered.

**Milestone 14:** Trigger knowledge base setup via AI chat. Verify n8n workflow is created and activated. Add a test document to Google Drive, verify it appears in Pinecone. Search via Buddzee, verify relevant results returned.

**Milestone 15:** (Research spike) Deploy test embed config, load iframe on external page, verify chat works with restricted tools only. Verify rate limiting prevents abuse.

---

## Appendix A: Ontraport API Integration Patterns

### Authentication

```typescript
// VitalStats REST proxy (for reads — preferred)
const headers = {
  'Api-Key': process.env.VITALSYNC_API_KEY,
  'Content-Type': 'application/json',
  'dataSourceId': process.env.ONTRAPORT_DATASOURCE_ID, // CRITICAL — 403 without this
};
const url = `https://${process.env.VITALSYNC_SLUG}.vitalstats.app/api/v1/rest/ontraport/${object}/${method}`;

// Direct Ontraport API (for writes)
const headers = {
  'Api-Appid': process.env.ONTRAPORT_API_APPID,
  'Api-Key': process.env.ONTRAPORT_API_KEY,
  'Content-Type': 'application/json',
};
const url = `https://api.ontraport.com/1/${object}`;
```

### Common API Calls

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| Get contacts | GET | `/1/Contacts?search=term` | With pagination |
| Create contact | POST | `/1/Contacts` | Body: field values |
| Update contact | PUT | `/1/Contacts` | Body: { id, field: value } |
| Delete contact | DELETE | `/1/Contacts?id=123` | |
| Add tag | PUT | `/1/Contacts/tag` | Body: { objectID: 0, ids: [123], add_list: [456] } |
| Remove tag | PUT | `/1/Contacts/tag` | Body: { objectID: 0, ids: [123], remove_list: [456] } |
| Get tags | GET | `/1/Tags` | All available tags |
| Get groups | GET | `/1/Groups?objectID=0` | Groups for any object type |
| Send email | POST | `/1/Messages/send` | Individual email |
| Send SMS | POST | `/1/Messages/send` | With type=sms |
| Get templates | GET | `/1/Messages?search=` | Email/SMS templates |
| Get deals | GET | `/1/Deals` | Pipeline deals |
| Create task | POST | `/1/Tasks` | Task creation |
| Complete task | PUT | `/1/Tasks` | Update status |

### Environment Variables Required

```env
# VitalSync
VITALSYNC_SLUG=clientslug
VITALSYNC_API_KEY=vs-api-key-here
VITE_VITALSYNC_SLUG=clientslug
VITE_VITALSYNC_API_KEY=vs-api-key-here

# Ontraport (server-side only)
ONTRAPORT_API_APPID=2_abc123
ONTRAPORT_API_KEY=ontraport-api-key-here
ONTRAPORT_DATASOURCE_ID=base64-encoded-datasource-id

# Authentication
JWT_SECRET=secure-random-string-here

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=app
DB_PASSWORD=password
DB_NAME=appdb

# AI
ANTHROPIC_API_KEY=sk-ant-api-key-here
ASSISTANT_MODEL=claude-sonnet-4-5-20250929

# Push Notifications
ONESIGNAL_APP_ID=onesignal-uuid
ONESIGNAL_REST_API_KEY=onesignal-rest-key

# n8n
N8N_WEBHOOK_URL=https://automations.vitalstats.app/webhook/

# Deepgram (Milestone 7)
DEEPGRAM_API_KEY=dg-api-key-here
DEEPGRAM_VOICE_MODEL=aura-2-theia-en
DEEPGRAM_STT_MODEL=nova-3

# Feature Flags
VITE_ASSISTANT_ENABLED=true
VITE_ASSISTANT_VOICE_ENABLED=true
VITE_ASSISTANT_CAMERA_ENABLED=true
VITE_VOICE_CONVERSATION_ENABLED=true
VITE_API_BASE_URL=
```

---

## Appendix B: Data Flow Patterns

### Pattern 1: Read Data (VitalSync SDK)
```
User action → React hook → VitalSync SDK .switchTo(model).query()...fetchAllRecords()
  → .pipe(toMainInstance(true)).toPromise() → convert with getState() → React state
```

### Pattern 2: Write Data (VitalSync SDK Mutation)
```
User action → React hook → VitalSync SDK .switchTo(model).mutation().createOne/update/delete
  → .execute(true).toPromise() → cleanup subscription → re-subscribe
```

### Pattern 3: Read Ontraport Data (REST Proxy)
```
React → apiFetch('/api/ontraport/...') → Express backend
  → fetch('https://{slug}.vitalstats.app/api/v1/rest/ontraport/{Object}/{method}')
     headers: { Api-Key, dataSourceId } → response → React
```

### Pattern 4: Write Ontraport Data (Direct API)
```
React → apiFetch('/api/ontraport/...') → Express backend
  → fetch('https://api.ontraport.com/1/{Object}')
     headers: { Api-Appid, Api-Key } → response → React
```

### Pattern 5: AI Interaction (Buddzee Chat)
```
User message → POST /api/ai-chat/send → Express backend
  → POST n8n webhook (SSE) → n8n AI agent (Claude + tools)
  → SSE stream back → Express pipes to frontend → streaming message display
```

### Pattern 6: AI Action (Voice/Vision)
```
User voice/camera/text → POST /api/assistant/process → Express backend
  → Claude tool-use API (intent + extraction) → response
  → Frontend shows confirmation card → user confirms
  → VitalSync SDK mutation (client-side) → POST /api/assistant/confirm (logging)
```

### Pattern 7: Real-time Subscription (VitalSync)
```
Server startup → SubscriptionManager.initialize()
  → WebSocket to wss://{slug}.vitalstats.app/api/v1/graphql
  → GQL_START subscription → GQL_DATA events
  → Condition evaluation → fire n8n webhook → action
```

---

## Appendix C: Competitive Differentiators vs Ontraport Mobile

| Feature | Ontraport Mobile | Our App |
|---------|:----------------:|:-------:|
| AI Chat Agent | No | Buddzee full conversational AI |
| Voice CRM | No | Voice commands + transcription + conversation mode |
| Camera Lead Capture | No | Business card scan + QR + OCR |
| AI Email/SMS Drafting | No | Buddzee writes drafts |
| Natural Language Metrics | No | "Show me revenue by source" |
| Natural Language Automations | No | "Alert me when..." |
| AI Lead Scoring | No | Predictive 0-100 scores |
| Next-Best-Action | No | AI recommendations |
| Unified Conversation View | No | All channels in one thread |
| AI Call Intelligence | No | Call summaries + action items |
| Offline Mode | No | Full offline with smart sync |
| Push Notifications | No | AI-routed intelligent push |
| Visual Pipeline Board | Limited | Full Kanban drag-and-drop |
| Customizable Dashboard | Fixed metrics | AI-generated custom metrics |
| Frustration Detection | No | Silent monitoring + proactive help |
| Feature Request AI | Basic form | BA interview + structured output |
| Ontraport Group Replication | Native (server) | VitalSync-native (real-time + offline capable) |
