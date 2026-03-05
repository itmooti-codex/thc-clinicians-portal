# QA Issue Manager — Implementation Brief

> **For a fresh Claude Code session.** This document contains everything needed to build the QA Issue Manager app from scratch. Read this first, then execute phase by phase.

---

## What We're Building

A centralized QA management app that:
1. Ingests frustration detections + feature requests from ALL child apps (shared MySQL DB)
2. AI-deduplicates them into "known issues" (many reports → one issue)
3. Provides a Kanban interface for human triage and priority management
4. Sends push notifications to reporters when issues are resolved
5. Eventually enables Claude Code auto-fix (creates PRs, humans review)

## Current State

### Existing Database (shared MySQL on 10.65.65.15, database: `phyx_nurse_admin`)

**`admin_alerts`** — 9 frustration detections, all from phyx-nurse-admin:
```sql
-- Current schema (MISSING app_name — must be added)
CREATE TABLE admin_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL DEFAULT 'frustration',
  session_id INT NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(255) DEFAULT NULL,
  severity ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  context_snapshot JSON DEFAULT NULL,
  n8n_webhook_sent BOOLEAN DEFAULT FALSE,
  onesignal_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_type (session_id, alert_type),
  INDEX idx_created (created_at)
);
```

**`feature_requests`** — 4 records, all from phyx-nurse-admin:
```sql
CREATE TABLE feature_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(255) DEFAULT NULL,
  app_name VARCHAR(128) NOT NULL,  -- already has app_name!
  request_type ENUM('feature', 'bug', 'enhancement') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  user_verbatim TEXT DEFAULT NULL,
  user_impact TEXT DEFAULT NULL,
  frequency VARCHAR(64) DEFAULT NULL,
  priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  acceptance_criteria TEXT DEFAULT NULL,
  loom_url VARCHAR(512) DEFAULT NULL,
  related_screens VARCHAR(512) DEFAULT NULL,
  interview_transcript JSON DEFAULT NULL,
  n8n_webhook_sent BOOLEAN DEFAULT FALSE,
  github_url VARCHAR(512) DEFAULT NULL,
  status ENUM('new', 'reviewing', 'planned', 'in_progress', 'completed', 'declined') DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_type (request_type),
  INDEX idx_created (created_at)
);
```

### Known Child Apps
| App | Port | Repo | Status |
|-----|------|------|--------|
| phyx-nurse-admin | 3010 | itmooti/phyx-nurse-dashboard | Deployed, most mature |
| thc-portal | 3020 | itmooti/thc-portal | Deployed |
| bb-dashboard | 3030 | itmooti/bb-dashboard | Deployed |
| phyx-contact-lookup | 3000 | itmooti/phyx-contact-lookup | Deployed (simple React, no backend) |
| ptpm-app | — | — | Not yet deployed |

### Dev Server
- **Public IP**: `15.204.34.114` (OVH) — use for GitHub Actions SSH deploy
- **Private IP**: `10.65.65.15` — local network access
- **SSH**: `admin` user, key `~/.ssh/id_ed25519`
- **Projects dir**: `/srv/projects/`
- **DB**: Percona MySQL 8.4, Docker container `database-db-1`, port 3306
- **DB credentials**: `~/.claude/infrastructure.env` (`$DB_APP_USER`, `$DB_APP_PASSWORD`)
- **No local MySQL client** — run SQL via: `source ~/.claude/infrastructure.env && ssh ${SERVER_USER}@${SERVER_HOST} "docker exec $DB_CONTAINER mysql -u $DB_APP_USER -p'$DB_APP_PASSWORD' phyx_nurse_admin -e 'SQL'"`

---

## Architecture

- **App type**: Standalone React + Express (scaffolded from `templates/react-mobile-app/`, stripped of VitalSync/Capacitor/OneSignal)
- **Port**: 3040 (web), API on 4000 internal
- **Database**: shared `phyx_nurse_admin` with `qa_`-prefixed tables
- **No VitalSync SDK** — pure MySQL reads
- **No Capacitor/mobile** — desktop dev tool only
- **No Cloudflare Tunnel** — internal network access only
- **Drag-drop**: `@dnd-kit/core` + `@dnd-kit/sortable`
- **GitHub repo**: `itmooti/qa-issues`
- **Docker Compose**: 2 services (`app` nginx, `api` Express)

### Scaffold from Template

Copy `templates/react-mobile-app/` to `../qa-issues/`, then strip:
- Remove VitalSync SDK script tag from `index.html`
- Remove Capacitor: `ios/`, `android/`, `capacitor.config.ts`, mobile entry point
- Remove OneSignal: `onesignal-cordova-plugin`, notification store/components
- Remove VitalSync-specific hooks, stores, types
- Keep: React + MUI + TypeScript + Vite, Express backend, Docker, auth, deploy pipeline

### Key Reference Files (read these when building)
- `templates/react-mobile-app/server/src/index.ts` — Express setup, CORS, route mounting
- `templates/react-mobile-app/server/src/db.ts` — MySQL pool pattern (`mysql2/promise`)
- `../phyx-nurse-admin/server/src/seed.ts` — Table creation pattern
- `../phyx-nurse-admin/server/src/routes/auth.ts` — JWT auth pattern
- `docs/backend-patterns.md` — JWT, CORS, proxy config
- `docs/task-manager.jsx` — 907-line Kanban UI prototype (design language reference)
- `docs/deployment.md` — Docker + GitHub Actions deploy pattern

---

## Phase 1: Database + Backend

### Step 1a: Migration — Add `app_name` to `admin_alerts`

Run on production:
```sql
ALTER TABLE admin_alerts ADD COLUMN app_name VARCHAR(128) DEFAULT NULL;
ALTER TABLE admin_alerts ADD INDEX idx_app_name (app_name);
UPDATE admin_alerts SET app_name = 'phyx-nurse-admin';
```

Update frustration tool in template (`templates/react-mobile-app/server/src/lib/tools/frustration-tool.ts`) and in phyx-nurse-admin (`../phyx-nurse-admin/server/src/lib/tools/frustration-tool.ts`) to include `process.env.APP_NAME` in the INSERT statement.

### Step 1b: Create New Tables

```sql
-- The "known issue" aggregate — central concept
CREATE TABLE IF NOT EXISTS qa_issues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  issue_type ENUM('bug', 'feature', 'enhancement', 'ux_friction') NOT NULL,
  scope ENUM('app_specific', 'universal', 'buddzee_core') NOT NULL DEFAULT 'app_specific',
  app_name VARCHAR(128) DEFAULT NULL,
  affected_screens VARCHAR(512) DEFAULT NULL,
  status ENUM('new', 'triaged', 'in_progress', 'fix_ready', 'testing', 'resolved', 'wont_fix', 'duplicate') NOT NULL DEFAULT 'new',
  priority ENUM('p0_critical', 'p1_high', 'p2_medium', 'p3_low', 'p4_nice_to_have') NOT NULL DEFAULT 'p2_medium',
  assigned_to VARCHAR(255) DEFAULT NULL,
  ai_summary TEXT DEFAULT NULL,
  ai_suggested_fix TEXT DEFAULT NULL,
  ai_estimated_effort ENUM('trivial', 'small', 'medium', 'large', 'epic') DEFAULT NULL,
  ai_confidence DECIMAL(3,2) DEFAULT NULL,
  autofix_status ENUM('not_attempted', 'queued', 'in_progress', 'pr_created', 'pr_merged', 'failed') DEFAULT 'not_attempted',
  autofix_pr_url VARCHAR(512) DEFAULT NULL,
  autofix_branch VARCHAR(255) DEFAULT NULL,
  autofix_attempted_at TIMESTAMP NULL DEFAULT NULL,
  target_date DATE DEFAULT NULL,
  sprint_label VARCHAR(100) DEFAULT NULL,
  report_count INT NOT NULL DEFAULT 1,
  first_reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  resolution_notes TEXT DEFAULT NULL,
  loom_urls JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_priority (priority),
  INDEX idx_scope (scope),
  INDEX idx_app (app_name),
  INDEX idx_type (issue_type),
  FULLTEXT INDEX ft_search (title, description, ai_summary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Links raw reports (admin_alerts / feature_requests) → known issues
CREATE TABLE IF NOT EXISTS qa_issue_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issue_id INT NOT NULL,
  source_type ENUM('frustration', 'feature_request') NOT NULL,
  source_id INT NOT NULL,
  app_name VARCHAR(128) NOT NULL,
  user_id INT DEFAULT NULL,
  user_name VARCHAR(255) DEFAULT NULL,
  similarity_score DECIMAL(3,2) DEFAULT NULL,
  linked_by ENUM('ai_auto', 'human_manual') NOT NULL DEFAULT 'ai_auto',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES qa_issues(id) ON DELETE CASCADE,
  UNIQUE KEY uq_source (source_type, source_id),
  INDEX idx_issue (issue_id),
  INDEX idx_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Activity timeline / comments on issues
CREATE TABLE IF NOT EXISTS qa_issue_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issue_id INT NOT NULL,
  author VARCHAR(255) NOT NULL,
  comment_type ENUM('comment', 'status_change', 'priority_change', 'assignment', 'autofix_event', 'ai_analysis') NOT NULL DEFAULT 'comment',
  content TEXT NOT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES qa_issues(id) ON DELETE CASCADE,
  INDEX idx_issue_created (issue_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tracks reporters for "issue resolved" notifications
CREATE TABLE IF NOT EXISTS qa_reporter_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issue_id INT NOT NULL,
  app_name VARCHAR(128) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) DEFAULT NULL,
  notification_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES qa_issues(id) ON DELETE CASCADE,
  UNIQUE KEY uq_issue_user (issue_id, user_email),
  INDEX idx_pending (notification_sent, issue_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-app config (OneSignal creds, repo, color for UI)
CREATE TABLE IF NOT EXISTS qa_app_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  app_name VARCHAR(128) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  repo_full_name VARCHAR(255) NOT NULL,
  onesignal_app_id VARCHAR(255) DEFAULT NULL,
  onesignal_rest_api_key VARCHAR(255) DEFAULT NULL,
  color VARCHAR(7) DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed app config
INSERT INTO qa_app_config (app_name, display_name, repo_full_name, onesignal_app_id, color) VALUES
  ('phyx-nurse-admin', 'PHYX Nurse Admin', 'itmooti/phyx-nurse-dashboard', 'b11254db-d811-4c31-a1cf-05c2ea46f1a0', '#6366f1'),
  ('thc-portal', 'THC Portal', 'itmooti/thc-portal', NULL, '#10b981'),
  ('bb-dashboard', 'BB Dashboard', 'itmooti/bb-dashboard', NULL, '#f59e0b');

-- Tracks ingestion progress per source table
CREATE TABLE IF NOT EXISTS qa_sync_cursor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_table ENUM('admin_alerts', 'feature_requests') NOT NULL,
  last_synced_id INT NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_source (source_table)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO qa_sync_cursor (source_table, last_synced_id) VALUES
  ('admin_alerts', 0),
  ('feature_requests', 0);
```

### Step 1c: Express Backend Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | JWT auth |
| `/api/issues` | GET | List with filters, pagination, fulltext search |
| `/api/issues/:id` | GET | Detail + linked reports + comments |
| `/api/issues` | POST | Manual create |
| `/api/issues/:id` | PUT | Update status, priority, assignment, etc. |
| `/api/issues/:id/comments` | GET/POST | Activity timeline |
| `/api/issues/:id/link` | POST | Manually link a raw report |
| `/api/issues/:id/merge` | POST | Merge another issue into this one |
| `/api/inbox` | GET | Unprocessed raw reports from both tables |
| `/api/stats/overview` | GET | Counts by status, priority, app, scope |
| `/api/apps` | GET | List configured apps |
| `/api/apps/:name` | PUT | Update app config |

### Environment Variables

```env
# server/.env
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USER=app
DB_PASSWORD=<from ~/.claude/infrastructure.env → DB_APP_PASSWORD>
DB_NAME=phyx_nurse_admin
JWT_SECRET=<generate-32-char-random>
PORT=4000

# n8n webhooks (Phase 3+)
N8N_TRIAGE_WEBHOOK_URL=https://automations.vitalstats.app/webhook/qa-triage
N8N_AUTOFIX_WEBHOOK_URL=https://automations.vitalstats.app/webhook/qa-autofix
N8N_NOTIFICATION_WEBHOOK_URL=https://automations.vitalstats.app/webhook/qa-notification
```

```env
# .env (frontend, build-time)
VITE_API_URL=http://localhost:4000
```

---

## Phase 2: Frontend — Kanban Board + Issue Detail

### Design Language

Adapted from `docs/task-manager.jsx` (907-line prototype with working Kanban, list view, slide-out detail):

- **Background**: `#f7f7fa`
- **Cards**: white, `border-radius: 12px`, border `1.5px solid #f0f0f3`, hover shadow
- **Fonts**: DM Sans (body), Instrument Serif (headings/titles), JetBrains Mono (IDs, timestamps)
- **Primary accent**: `#6366f1` (indigo)

### Status Colors
| Status | Color | Background |
|--------|-------|------------|
| new | `#94a3b8` | `#f1f5f9` |
| triaged | `#6366f1` | `#eef2ff` |
| in_progress | `#f59e0b` | `#fffbeb` |
| fix_ready | `#3b82f6` | `#eff6ff` |
| testing | `#8b5cf6` | `#f5f3ff` |
| resolved | `#10b981` | `#ecfdf5` |
| wont_fix | `#ef4444` | `#fef2f2` |
| duplicate | `#64748b` | `#f8fafc` |

### Priority Colors
| Priority | Color |
|----------|-------|
| p0_critical | `#ef4444` (pulsing dot animation) |
| p1_high | `#f59e0b` |
| p2_medium | `#3b82f6` |
| p3_low | `#94a3b8` |
| p4_nice_to_have | `#d1d5db` |

### Scope Badges
| Scope | Style |
|-------|-------|
| app_specific | Solid chip, color from `qa_app_config.color` |
| universal | Indigo gradient chip |
| buddzee_core | Buddzee gradient `#ABC1FF` → `#5284FF` |

### Page Structure

```
src/
  pages/
    KanbanPage.tsx         — Primary view: drag-drop status board
    ListPage.tsx           — Table view with sorting/filtering
    InboxPage.tsx          — Unprocessed raw reports awaiting triage (Phase 3)
    DashboardPage.tsx      — Stats overview (Phase 6)
    SettingsPage.tsx       — App configs (Phase 4)

  components/
    layout/
      AppShell.tsx         — Top nav + sidebar
      Sidebar.tsx          — Navigation
    kanban/
      KanbanBoard.tsx      — Board container with @dnd-kit DndContext
      KanbanColumn.tsx     — Droppable status column
      KanbanCard.tsx       — Draggable issue card
    detail/
      IssueDetailPanel.tsx — Slide-out from right (460px)
      LinkedReports.tsx    — All frustrations + feature requests mapped to issue
      ActivityTimeline.tsx — Comments + status change history
    common/
      StatusBadge.tsx      — Status pill with dot + label
      PriorityBadge.tsx    — P0-P4 pill
      ScopeBadge.tsx       — app_specific / universal / buddzee_core
      AppChip.tsx          — App name with color from config
      SearchBar.tsx        — Full-text search input
      FilterBar.tsx        — App, scope, type, priority, assignee filters

  stores/
    useAuthStore.ts        — JWT auth (Zustand + persist)
    useIssueStore.ts       — Selected issue, filters, view mode

  hooks/
    useIssues.ts           — TanStack Query: list + mutate issues
    useIssueDetail.ts      — Single issue with linked reports + comments
    useInbox.ts            — Unlinked raw reports (Phase 3)

  types/
    index.ts               — QaIssue, QaIssueReport, QaIssueComment, etc.

  utils/
    formatters.ts          — Date, priority label, status label
    colors.ts              — Status/priority/scope color maps
```

### Kanban Board
- Columns: New → Triaged → In Progress → Fix Ready → Testing → Resolved
- Secondary view mode: group by priority (P0 → P4)
- `@dnd-kit/core` + `@dnd-kit/sortable` for accessible drag-drop
- Filter bar: app, scope, type, priority, assignee, search
- Cards show: title, type pill, priority dot, app chip, report count badge, due date

### Issue Detail Panel (slide-out from right, 460px)
- Adapted from `docs/task-manager.jsx` TaskDetail component
- Editable title (contentEditable, Instrument Serif font)
- Status, priority, scope, assignee, type dropdowns
- **Linked Reports** — collapsible list of admin_alerts + feature_requests
- **Report Count** badge showing frequency
- **AI Analysis** card — summary, suggested fix, effort, confidence (Phase 3)
- **Activity Timeline** — comments + system events (Phase 1)
- **Evidence** — Loom URLs (Phase 3)
- **Scheduling** — target date picker, sprint label

### Dependencies to Add
```
@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
@tanstack/react-query
zustand
```

---

## Phase 3: Auto-Ingestion + AI Triage

### Ingestion Service (`server/src/services/ingestion.ts`)

Runs every 60 seconds in Express backend:
1. Read `qa_sync_cursor` to get last-processed IDs
2. Poll `admin_alerts WHERE id > cursor` and `feature_requests WHERE id > cursor` (LIMIT 50)
3. Fetch all open `qa_issues` (title, description, app_name, scope, report_count)
4. For each new report → POST to n8n triage webhook
5. If AI returns a match (similarity >= 0.75): insert `qa_issue_reports` link, increment `report_count`, update `last_reported_at`
6. If no match: create new `qa_issues` row, insert link
7. Update `qa_sync_cursor`

### n8n Workflow: "QA Issue Triage"
- **Trigger**: Webhook `POST /webhook/qa-triage`
- **Input**: `{ sourceType, sourceId, appName, title, description, severity, existingIssues: [...] }`
- **Claude prompt**: Compare new report against existing issues, return JSON:
  ```json
  {
    "matchedIssueId": null,
    "similarity": 0.0,
    "matchReason": "...",
    "newIssue": {
      "title": "...",
      "description": "...",
      "issueType": "bug|feature|enhancement|ux_friction",
      "scope": "app_specific|universal|buddzee_core",
      "suggestedPriority": "p2_medium",
      "aiSummary": "Root cause analysis...",
      "aiSuggestedFix": "Approach to fix...",
      "aiEstimatedEffort": "small"
    }
  }
  ```
- **n8n credential**: OpenRouter ID `qFReBx2QAju9Hxcz`, model `anthropic/claude-sonnet-4.5`

### Inbox Page
- Shows reports where AI confidence < 0.75 (uncertain matches)
- Human clicks to link to existing issue or create new one

---

## Phase 4: Resolution Notifications

When issue status → "resolved":
1. Fetch `qa_reporter_notifications WHERE issue_id = ? AND notification_sent = FALSE`
2. Group by `app_name`, look up OneSignal creds from `qa_app_config`
3. Fire n8n webhook → OneSignal push per app + Gmail email
4. Mark `notification_sent = TRUE`

---

## Phase 5: Claude Code Auto-Fix

Progressive rollout:
- **5a**: Display AI suggested fix as copyable text in issue detail
- **5b**: "Copy prompt to clipboard" formatted for pasting into Claude Code
- **5c**: Full automated: n8n clones repo → creates branch `autofix/qa-{id}` → runs Claude Code CLI → pushes → creates PR → callbacks to QA app

Safety: only new branches, never main. Human must review + merge. Rate limited to 3 concurrent.

---

## Phase 6: Dashboard + Analytics

- Stats overview (by status, app, scope, priority)
- Trend chart (MUI X Charts — issues opened vs resolved over time)
- Top reported issues (by report_count)
- Recent activity feed
- Resolution velocity metric

---

## Implementation Order

| Phase | What | Priority |
|-------|------|----------|
| **1** | DB schema + Express backend + auth | **Do first** |
| **2** | Kanban UI + issue detail + CRUD | **Do second** |
| **3** | Auto-ingestion + AI triage + inbox | Do third |
| **4** | Resolution notifications | After 1+2 |
| **5** | Claude Code auto-fix | After 3 |
| **6** | Dashboard + analytics | After 1+2 |

**Start with Phases 1+2** — get a working Kanban board with manual CRUD. Then Phase 3 adds the intelligence.

---

## Verification Checklist

1. Run `seed.ts` → all `qa_*` tables created
2. Kanban loads, create issue manually, drag between columns
3. Slide-out detail panel opens, fields editable
4. Search and filters work
5. (Phase 3) Insert test `admin_alerts` row → appears in Kanban within 2 min
6. (Phase 4) Mark resolved → push notification sent to reporter
7. End-to-end: Buddzee detects frustration → QA Kanban shows it
