# Tasks System — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Full task management system with hub view, contact-scoped tasks, DataGrid Pro with bulk operations, Kanban board (status and timeline modes), task creation/completion dialogs, outcome logging, and Ontraport action API integration. Tasks live in VitalSync; actions (complete/cancel/reopen) go through Ontraport to trigger automations.

## Architecture

- **Data source:** VitalSync `Task` model via calc query (NOT `getTasks` — FK fields require calc syntax)
- **Actions:** Complete/cancel/reopen via Express → Ontraport Task Action API (triggers automations)
- **Field updates:** Subject, details, type etc. via VitalSync SDK mutation
- **Outcomes:** Logged to local MySQL `task_outcomes_log` table
- **Two views:** TaskHub (mobile-friendly grouped list) + ContactTasksContent (desktop DataGrid + Kanban)

```
VitalSync Task model ──── calcTasks query ──→ useTaskData hook
                                                ├─ TaskHub (mobile: time-bucketed groups)
                                                └─ ContactTasksContent (desktop: DataGrid + Kanban)
                                                     ├─ Bulk complete (DataGrid checkbox selection)
                                                     ├─ Drag-to-status (Kanban)
                                                     └─ Detail panel (drawer with inline editing)
Ontraport Task Actions ←── Express API ←── complete/cancel/reopen
MySQL task_outcomes_log ←── outcome logging
```

## File Inventory (11 files)

### Frontend Components (5 files)
- `src/components/tasks/TaskHub.tsx` — Mobile-friendly grouped task view with FAB
- `src/components/tasks/TaskCard.tsx` — Draggable task card with status/due date
- `src/components/tasks/TaskCreateSheet.tsx` — Full-screen create dialog with object type selector
- `src/components/tasks/TaskCompletionSheet.tsx` — Complete dialog with notes
- `src/components/tasks/ContactTasksContent.tsx` — Desktop task manager (DataGrid + Kanban)

### Frontend Hooks (1 file)
- `src/hooks/useTaskData.ts` — Fetch tasks, complete/cancel/reopen, field updates

### Frontend Types (1 file)
- `src/types/task.ts` — TaskRecord, STATUS_CONFIG, TASK_TYPES, TimeBucketKey

### Backend (2 files)
- `server/src/routes/tasks.ts` — Ontraport task action proxy + outcome option fetch
- `server/src/lib/seed-tasks.ts` — CREATE TABLE for task_outcomes_log

### Modified (2 files)
- `server/src/index.ts` — Mount task routes, seed table
- Router config — Add task hub route

## Dependencies

```json
{
  "@mui/x-data-grid-pro": "^6.x",
  "@mui/material": "^5.x"
}
```

## Environment Variables

```bash
ONTRAPORT_API_APPID=your-app-id
ONTRAPORT_API_KEY=your-api-key
```

## Database Tables

```sql
CREATE TABLE task_outcomes_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  outcome VARCHAR(128) NOT NULL,
  notes TEXT DEFAULT NULL,
  ai_suggested_outcome VARCHAR(128) DEFAULT NULL,
  ai_suggestion_accepted BOOLEAN DEFAULT NULL,
  automation_triggered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task (task_id)
);
```

## Implementation Steps

### 1. Define types

```typescript
export interface TaskRecord {
  id: string | number;
  subject: string;
  date_due?: number | string;
  date_complete?: number | string;
  status?: string;  // 'Open' | 'Completed' | 'Canceled'
  details?: string;
  type?: string;
  Contact_id?: string | number;
  assignee_id?: string | number;
  [key: string]: unknown;
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'Open':      { label: 'Open',      color: '#6366f1', bg: '#eef2ff' },
  'Completed': { label: 'Completed', color: '#10b981', bg: '#ecfdf5' },
  'Canceled':  { label: 'Canceled',  color: '#ef4444', bg: '#fef2f2' },
};

export const TASK_TYPES = [
  'Task', 'Quick Task', 'Call', 'Email', 'Follow-up',
  'Appointment Prep', 'Dispense', 'Review', 'Admin',
];

export type TimeBucketKey = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later';
```

### 2. Create useTaskData hook

**Key pattern — calc query with field() syntax:**
```typescript
// SDK query builder is broken for Task reads — use direct GraphQL
const FIELDS = ['id', 'subject', 'date_due', 'date_complete', 'status', 'details', 'type', 'Contact_id', 'assignee_id'];
const calcSelect = FIELDS.map(f => `${f}: field(arg: ["${f}"])`).join('\n');

const query = `{
  calcTasks(query: [${whereClause}], limit: 500) {
    ${calcSelect}
  }
}`;

const response = await fetch(`${VS_API_URL}`, {
  method: 'POST',
  headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
```

**Action functions:**
```typescript
const completeTask = async (taskId, outcome?, notes?) => {
  await apiFetch('/api/tasks/complete', {
    method: 'POST',
    body: JSON.stringify({ ids: [Number(taskId)], outcome, notes }),
  });
  // Optimistic update
  setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'Completed' } : t));
};

const cancelTask = async (taskId) => {
  await apiFetch('/api/tasks/cancel', { method: 'POST', body: JSON.stringify({ ids: [Number(taskId)] }) });
};

const reopenTask = async (taskId) => {
  await apiFetch('/api/tasks/reopen', { method: 'POST', body: JSON.stringify({ ids: [Number(taskId)] }) });
};
```

### 3. Create backend routes

**`server/src/routes/tasks.ts`:**
```typescript
const ONTRAPORT_API_BASE = 'https://api.ontraport.com/1';

/** POST /api/tasks/complete */
router.post('/complete', requireAuth, async (req, res) => {
  const { ids, outcome, notes } = req.body;
  const config = await getOntraportConfig();
  const headers = { 'Api-Appid': config.appId, 'Api-Key': config.apiKey, 'Content-Type': 'application/json' };

  await fetch(`${ONTRAPORT_API_BASE}/task/complete`, {
    method: 'PUT', headers,
    body: JSON.stringify({ object_type_id: 1, ids, data: { outcome: `:=${outcome}` } }),
  });

  // Log outcome locally
  for (const id of ids) {
    await pool.execute(
      'INSERT INTO task_outcomes_log (task_id, user_id, outcome, notes) VALUES (?, ?, ?, ?)',
      [id, req.user.id, outcome, notes]
    );
  }

  res.json({ success: true });
});

/** POST /api/tasks/cancel */
router.post('/cancel', requireAuth, async (req, res) => {
  const { ids } = req.body;
  // Similar pattern — PUT to /task/cancel
});

/** POST /api/tasks/reopen */
router.post('/reopen', requireAuth, async (req, res) => {
  const { ids } = req.body;
  // Similar pattern — PUT to /task/reopen
});

/** GET /api/tasks/outcome-options — Fetch Ontraport TaskOutcome objects */
router.get('/outcome-options', requireAuth, async (req, res) => {
  // GET /Objects?objectID=66&range=100
});
```

### 4. Create TaskHub (mobile view)

Groups tasks by time bucket: overdue, today, tomorrow, this_week, later, completed, canceled.

```typescript
function groupByTimeBucket(tasks: TaskRecord[]): TaskGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now).getTime() / 1000;
  const tomorrowStart = todayStart + 86400;
  const weekEnd = todayStart + 7 * 86400;

  // Bucket each task based on date_due vs now
  // Completed/canceled go to their own buckets regardless of date
}
```

### 5. Create ContactTasksContent (desktop view)

Two sub-views:
- **List:** DataGrid Pro with checkboxes, bulk complete, column visibility, sort persistence
- **Kanban:** Drag-and-drop columns by status or time bucket

**Grid state persistence:**
```typescript
// Save to localStorage
localStorage.setItem(`taskGrid_${contactId}_columns`, JSON.stringify(columnVisibility));
localStorage.setItem(`taskGrid_${contactId}_sort`, JSON.stringify(sortModel));
```

## Example Usage

```tsx
// Mobile task hub
<TaskHub
  onTaskTap={(task) => openTaskDetail(task)}
  onCreateTap={() => setCreateOpen(true)}
/>

// Desktop contact tasks
<ContactTasksContent
  contactId={contactId}
  contactName={contactName}
  onTaskTap={(task) => openTaskDetail(task)}
/>
```

## Gotchas & Lessons Learned

- **`calcTasks` with `field()` syntax is required** — `getTasks` causes "Request abandoned" errors when selecting FK fields like `Contact_id`.
- **Ontraport outcome prefix:** Outcome values require `:=` prefix (e.g., `data: { outcome: ':=Connected' }`).
- **Action APIs trigger automations** — completing a task in Ontraport may fire sequences, campaigns, emails.
- **Two query types:** Actions (complete/cancel/reopen) go through Ontraport API. Field updates (subject, details) go through VitalSync SDK mutation.
- **Optimistic updates** — update local state immediately, revert on API failure.
- **Grid state persistence** — save column visibility, sort model, and page size to localStorage per contact/view.
- **Bulk complete filter** — always filter out already-completed tasks before sending to API.
