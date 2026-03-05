# Feature Selection Guide

Use this guide when planning a new app to decide which features to enable. Features are organized into 4 tiers with clear dependencies. Every feature has a unique flag key used by the feature flag system, the scaffolding script, and `<FeatureGate>` components.

---

## Quick Start

1. Pick a **design preset** (`modern-ai`, `clinical`, or `classic`)
2. Pick a **tier bundle** (Starter is always included)
3. Check the **dependency matrix** to ensure prerequisites are met
4. Use the **recommended bundles** if you're unsure
5. Pass your choices to the scaffolding script: `--design-preset modern-ai --features "starter,standard" --enable "ai-chat"`

---

## Design Presets

Choose the visual style before selecting features. This sets dark/light default, corner radius, spacing, typography weight, and component styling. Colors and fonts can be overridden independently.

| Preset | Default Mode | Corners | Spacing | Typography | Inspired by |
|--------|-------------|---------|---------|------------|-------------|
| **modern-ai** | Dark | Rounded (12px), pill chips | Generous | Inter, weight 600, sentence case | Claude, HeyGen, OpenRouter |
| **clinical** | Light | Sharp (0px) | Dense | Montserrat, weight 700, UPPERCASE | PHYX Admin |
| **classic** | System | Moderate (8px) | Standard | Inter, weight 600, sentence case | Traditional SaaS |

**Scaffolding:** `--design-preset modern-ai` (default if omitted)

**Default colors per preset:**
- `modern-ai` — Primary: `#a78bfa` (muted purple), Secondary: `#64748b` (slate)
- `clinical` — Primary: `#000000` (black), Secondary: `#666666` (grey)
- `classic` — Primary: `#1976d2` (blue), Secondary: `#9c27b0` (purple)

Override with `--primary-color "#your-color"` — preset defaults only apply when no explicit color is given.

---

## Tier Overview

| Tier | What It Adds | When to Include |
|------|-------------|-----------------|
| **Starter** | Core CRM infrastructure — lists, detail views, search, settings | Always (cannot be disabled) |
| **Standard** | Communication & productivity — pipeline, tasks, calls, messaging, tags | Most apps that manage contacts + sales/service workflows |
| **Premium** | AI + dashboards + mobile-native — Buddzee chat, metrics, voice, push | Apps where users need AI assistance, analytics, or native mobile |
| **Enterprise** | Advanced AI + automation — voice conversation, automation engine, n8n | Power users, complex workflows, full Phyx Admin parity |

---

## Complete Feature Catalog

### Starter Tier (always enabled)

These features form the foundation. They cannot be disabled and are included in every app.

| # | Feature | Flag Key | Effort | Dependencies | Files | Feature Doc |
|---|---------|----------|--------|-------------|-------|-------------|
| 1 | **Feature Flag System** | _(foundation — no flag)_ | auto | None | 6 | `feature-flags.md` |
| 2 | **Buddzee Brand Identity** | _(foundation — no flag)_ | auto | None | 3 | `buddzee-ai-assistant.md` |
| 3 | **Collections System** | `collections` | config | None | 12 | `collections-system.md` |
| 4 | **Record Detail Views** | `record-detail` | config | Collections | 8 | `record-detail-views.md` |
| 5 | **Advanced Search & Filters** | `search-filters` | config | Collections | 4 | `search-filters.md` |
| 6 | **Bulk Actions** | `bulk-actions` | auto | Collections | 2 | `bulk-actions.md` |
| 7 | **Settings System** | `settings` | config | None | 6 | `settings-system.md` |

**Effort levels:**
- **auto** — Works immediately when the flag is enabled. No per-app configuration needed.
- **config** — Requires editing `app-config.ts` to specify model names, fields, and options for this app.
- **custom** — Requires writing client-specific code (e.g., custom AI tools, domain logic).

---

### Standard Tier

Communication and productivity features. Recommended for any app that manages contacts with sales or service workflows.

| # | Feature | Flag Key | Effort | Dependencies | Files | Feature Doc |
|---|---------|----------|--------|-------------|-------|-------------|
| 8 | **Deal Pipeline / Kanban** | `pipeline-management` | config | Collections | 7 | `deal-pipeline.md` |
| 9 | **Tasks System** | `tasks-system` | config | None (standalone) | 11 | `tasks-system.md` |
| 10 | **Call Logging** | `call-logging` | config | Record Detail | 6 | `call-logging.md` |
| 11 | **Conversation Threads** | `conversation-threads` | config | Record Detail | 5 | `conversation-threads.md` |
| 12 | **Ontraport Messaging** | `messaging` | config | Record Detail, Settings | 8 | `ontraport-messaging.md` |
| 13 | **Tag Management** | `tag-management` | config | Collections | 4 | `tag-management.md` |

**Configuration required:**
- **Pipeline:** Stage field name, stage values, amount field, health thresholds in `app-config.ts`
- **Tasks:** Task model name, status field, type field, outcome options in `app-config.ts`
- **Call Logging:** Phone field, outcome button labels in `app-config.ts`
- **Messaging:** Ontraport API credentials in Settings, email/phone field names in `app-config.ts`
- **Tags:** Ontraport object ID for tag API in `app-config.ts`

---

### Premium Tier

AI, dashboards, analytics, and mobile-native features. For power users and apps that need intelligent assistance.

| # | Feature | Flag Key | Effort | Dependencies | Files | Feature Doc |
|---|---------|----------|--------|-------------|-------|-------------|
| 14 | **Buddzee AI Chat** | `ai-chat` | config | Settings (for API key) | 20+ | `unified-buddzee-ai.md` |
| 15 | **Dynamic Metrics** | `dynamic-metrics` | config | AI Chat | 4 | `dynamic-metrics.md` |
| 16 | **Dashboard Builder** | `dashboard-system` | config | None (AI Chat optional) | 15 | `buddzee-dashboard-builder.md` |
| 17 | **Voice & Vision Assistant** | `voice-vision` | auto | AI Chat | 5 | `voice-vision-assistant.md` |
| 18 | **OneSignal Push Notifications** | `push-notifications` | config | None (mobile only) | 4 | `onesignal-notifications.md` |
| 19 | **Biometric Lock** | `biometric-lock` | auto | None (mobile only) | 3 | `biometric-lock.md` |
| 20 | **Google Analytics** | `google-analytics` | config | AI Chat, Settings | 4 | `google-analytics.md` |

**Configuration required:**
- **AI Chat:** OpenRouter API key in Settings, system prompt domain context in `app-config.ts`, tool registry selection
- **Dynamic Metrics:** Works with AI Chat — no additional config. Uses VitalSync calc queries.
- **Dashboard Builder:** Default widget definitions in `app-config.ts`
- **Push Notifications:** OneSignal App ID + REST API key in environment variables
- **Google Analytics:** GA4 property ID + service account credentials in Settings

---

### Enterprise Tier

Advanced AI, automation, and full Phyx Admin feature parity. For complex workflows and power-user scenarios.

| # | Feature | Flag Key | Effort | Dependencies | Files | Feature Doc |
|---|---------|----------|--------|-------------|-------|-------------|
| 21 | **Voice Conversation (Deepgram)** | `voice-conversation` | config | AI Chat | 6 | `buddzee-voice-conversation.md` |
| 22 | **Automation Engine** | `automation-engine` | custom | AI Chat, Dashboard | 8 | `automation-engine.md` |
| 23 | **n8n Workflow Browser** | `n8n-browser` | config | Settings (n8n creds) | 5 | `n8n-workflow-browser.md` |
| 24 | **Frustration Detection** | `frustration-detection` | config | AI Chat, Push Notifications | 3 | `frustration-detection.md` |
| 25 | **Feature Request Collection** | `feature-request-collection` | config | AI Chat | 3 | `feature-request-collection.md` |

**Configuration required:**
- **Voice Conversation:** Deepgram API key in environment variables, Express proxy route
- **Automation Engine:** Custom automation rules, trigger definitions, n8n webhook URLs
- **n8n Workflow Browser:** n8n instance URL + API key in Settings
- **Frustration Detection:** n8n webhook URL for admin alerts, push notification setup
- **Feature Request Collection:** GitHub repo + n8n webhook for issue creation

---

## Dependency Matrix

Visual tree showing which features depend on which. You cannot enable a feature without its dependencies.

```
Feature Flag System ─────────────────────────────────── (foundation, always on)
Buddzee Brand Identity ──────────────────────────────── (foundation, always on)
│
├── Collections System
│   ├── Record Detail Views
│   │   ├── Call Logging
│   │   ├── Conversation Threads
│   │   └── Ontraport Messaging ──── Settings System
│   ├── Advanced Search & Filters
│   ├── Bulk Actions
│   ├── Tag Management
│   └── Deal Pipeline / Kanban
│
├── Tasks System (standalone — no dependencies)
│
├── Settings System (standalone — stores integration credentials)
│   └── Used by: Messaging, AI Chat, GA4, n8n Browser
│
├── Dashboard Builder (standalone, enhanced by AI Chat)
│
└── Buddzee AI Chat ──────────── Settings System (for OpenRouter key)
    ├── Dynamic Metrics
    ├── Voice & Vision Assistant
    ├── Voice Conversation (Deepgram)
    ├── Google Analytics ──────── Settings System
    ├── Automation Engine ─────── Dashboard Builder
    ├── Frustration Detection ─── Push Notifications
    ├── Feature Request Collection
    └── n8n Workflow Browser ──── Settings System
```

**Reading the tree:** An indented feature requires its parent. For example, "Call Logging" requires "Record Detail Views" which requires "Collections System".

---

## Recommended Bundles

Use these as starting points. Enable the tier bundle, then add/remove individual features.

### Basic CRM
> For simple contact management with search and detail views.

```
Tiers: Starter
Additional: Tag Management
```

**Enables:** Collections, Record Detail, Search, Settings, Bulk Actions, Tags
**Use case:** Simple contact lookup tools, read-heavy dashboards

---

### Sales CRM
> For sales teams managing deals, tasks, and customer communication.

```
Tiers: Starter + Standard
Additional: AI Chat, Dashboard Builder
```

**Enables:** Everything in Starter + Pipeline, Tasks, Call Logging, Messaging, Conversations, Tags + AI Chat + Dashboards
**Use case:** Sales admin apps, deal tracking, outbound calling

---

### Healthcare / Service Admin
> For clinical or service staff managing patients/clients with AI assistance. (Phyx Admin pattern)

```
Tiers: Starter + Standard + Premium
Additional: Voice Conversation, Automation Engine
```

**Enables:** Full Standard + AI Chat, Metrics, Dashboards, Voice, Push, Biometric + Deepgram voice + Automations
**Use case:** Healthcare admin, service delivery management

---

### Support Portal
> For support teams handling tickets and conversations with AI.

```
Tiers: Starter + Standard (minus Pipeline)
Additional: AI Chat, Dashboard Builder, Frustration Detection
```

**Enables:** Collections, Tasks, Conversations, Messaging, Tags + AI Chat + Dashboards + Frustration alerts
**Use case:** Customer support, help desk, ticket management

---

### Full Power
> Every feature enabled. Maximum capability, Phyx Admin parity.

```
Tiers: Starter + Standard + Premium + Enterprise
```

**Enables:** All 25 features
**Use case:** When in doubt, start here and disable what you don't need

---

## Flag Key Quick Reference

All flag keys in one place for use with the scaffolding script and `<FeatureGate>` component.

```
# Starter (no flags — always on)
collections
record-detail
search-filters
bulk-actions
settings

# Standard
pipeline-management
tasks-system
call-logging
conversation-threads
messaging
tag-management

# Premium
ai-chat
dynamic-metrics
dashboard-system
voice-vision
push-notifications
biometric-lock
google-analytics

# Enterprise
voice-conversation
automation-engine
n8n-browser
frustration-detection
feature-request-collection
```

---

## Scaffolding Script Usage

```bash
# Enable a tier bundle
./scripts/new-full-app.sh --features "starter,standard"

# Enable individual features on top
./scripts/new-full-app.sh --features "starter" --enable "ai-chat,dashboard-system"

# Enable a bundle but exclude specific features
./scripts/new-full-app.sh --features "starter,standard" --disable "pipeline-management"

# Use a recommended bundle preset
./scripts/new-full-app.sh --features "sales-crm"
# (Expands to: starter + standard + ai-chat + dashboard-system)
```

The script sets `enabled: true` in `seed-features.ts` for the selected features and `enabled: false` for everything else. Features can be toggled at runtime via the database without code changes.

---

## Adding a New Feature

When a new reusable feature is built:

1. Choose a unique `flag-key` (hyphens, lowercase)
2. Add it to `seed-features.ts` with tier assignment
3. Add `VITE_FEATURE_FLAG_KEY` to `.env.example` (commented out)
4. Wrap UI entry points in `<FeatureGate feature="flag-key">`
5. Add backend route middleware check if applicable
6. Document in `docs/features/flag-key.md` using the template in `docs/features/README.md`
7. Add to this guide in the appropriate tier
8. Update the dependency matrix if it has prerequisites
