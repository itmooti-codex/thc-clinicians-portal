# Call Logging — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Dialog-based call logger with outcome buttons (Connected/Voicemail/No Answer/Busy), notes field, follow-up scheduler, MySQL storage, and fire-and-forget Ontraport sync (Note + Task creation). Includes a Buddzee AI tool (`log_call`) for voice/chat logging. Call logs merge into the contact timeline alongside VitalSync activity.

## Architecture

- **Frontend:** Dialog opens after native dialer call (1s delay), user selects outcome + optional notes/follow-up
- **Backend:** Saves to MySQL `call_logs` table immediately, then syncs to Ontraport Note + Task (fire-and-forget)
- **Timeline integration:** `callLogToHistoryEntry()` converts logs to timeline format with negative IDs to avoid collision
- **AI integration:** Buddzee `log_call` tool uses screen context for auto-fill

```
Native dialer → 1s delay → CallLogger dialog
  ├─ CallOutcomeButtons (4 outcomes)
  ├─ Notes textarea
  └─ FollowUpScheduler (toggle + datetime picker)
      ↓
POST /api/calls → MySQL insert → return success
                → fire-and-forget: Ontraport Note + Task (if follow-up)
```

## File Inventory (9 files)

### Frontend Components (3 files)
- `src/components/communication/CallLogger.tsx` — Main dialog with outcome, notes, follow-up
- `src/components/communication/CallOutcomeButtons.tsx` — 4 outcome buttons with icons/colors
- `src/components/communication/FollowUpScheduler.tsx` — Toggle + datetime-local picker

### Frontend Hooks (1 file)
- `src/hooks/useCallLogs.ts` — TanStack Query hook for fetching call history

### Backend (2 files)
- `server/src/routes/calls.ts` — POST /api/calls, GET /api/calls/:contactId
- `server/src/lib/seed-calls.ts` — CREATE TABLE for call_logs

### AI Tool (1 file)
- `server/src/lib/tools/log-call-tool.ts` — Buddzee `log_call` tool definition

### Modified (2 files)
- `server/src/index.ts` — Mount call routes, seed table
- Timeline component — Merge call logs with VitalSync activity

## Dependencies

```json
{
  "@tanstack/react-query": "^5.x",
  "@mui/material": "^5.x",
  "mysql2": "^3.x"
}
```

## Environment Variables

```bash
ONTRAPORT_API_APPID=your-app-id
ONTRAPORT_API_KEY=your-api-key
```

## Database Tables

```sql
CREATE TABLE call_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_id INT NOT NULL,
  contact_name VARCHAR(255) DEFAULT NULL,
  outcome ENUM('connected', 'voicemail', 'no_answer', 'busy') NOT NULL,
  duration_seconds INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  ai_summary TEXT DEFAULT NULL,
  follow_up_date TIMESTAMP NULL DEFAULT NULL,
  follow_up_task_id INT DEFAULT NULL,
  op_note_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact (contact_id),
  INDEX idx_user_date (user_id, created_at)
);
```

## Implementation Steps

### 1. Create seed file

```typescript
export async function seedCalls(pool: Pool): Promise<void> {
  await pool.execute(`CREATE TABLE IF NOT EXISTS call_logs (...)`);
}
```

### 2. Create backend routes

**`server/src/routes/calls.ts`:**
```typescript
/** POST /api/calls — Log a call */
router.post('/', requireAuth, async (req, res) => {
  const { contact_id, contact_name, outcome, notes, follow_up_date } = req.body;
  if (!contact_id || !outcome) { res.status(400).json({ error: 'contact_id and outcome required' }); return; }

  // 1. Insert into MySQL (immediate response)
  const [result] = await pool.execute(
    'INSERT INTO call_logs (user_id, contact_id, contact_name, outcome, notes, follow_up_date) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, contact_id, contact_name, outcome, notes || null, follow_up_date || null]
  );
  const insertId = (result as any).insertId;
  res.json({ success: true, id: insertId });

  // 2. Fire-and-forget: Ontraport Note + Task
  syncToOntraport(insertId, req.user.id, contact_id, contact_name, outcome, notes, follow_up_date).catch(console.error);
});

async function syncToOntraport(logId, userId, contactId, contactName, outcome, notes, followUpDate) {
  const config = await getOntraportConfig();
  if (!config) return;
  const headers = { 'Api-Appid': config.appId, 'Api-Key': config.apiKey, 'Content-Type': 'application/json' };

  // Create Note (object 12)
  const noteData = `Call Logged — ${OUTCOME_LABELS[outcome]}\nContact: ${contactName}\n\nNotes:\n${notes || '(none)'}`;
  const noteRes = await fetch(`${API_BASE}/Objects`, {
    method: 'POST', headers,
    body: JSON.stringify({ objectID: 12, contact_id: contactId, data: noteData }),
  });
  const noteJson = await noteRes.json();
  if (noteJson.data?.id) {
    await pool.execute('UPDATE call_logs SET op_note_id = ? WHERE id = ?', [noteJson.data.id, logId]);
  }

  // Create Task (object 50) if follow-up scheduled
  if (followUpDate) {
    const taskRes = await fetch(`${API_BASE}/Objects`, {
      method: 'POST', headers,
      body: JSON.stringify({
        objectID: 50, contact_id: contactId,
        subject: `Follow up: Call with ${contactName}`,
        due_date: Math.floor(new Date(followUpDate).getTime() / 1000),
        status: 0,
      }),
    });
    const taskJson = await taskRes.json();
    if (taskJson.data?.id) {
      await pool.execute('UPDATE call_logs SET follow_up_task_id = ? WHERE id = ?', [taskJson.data.id, logId]);
    }
  }
}

/** GET /api/calls/:contactId — Fetch call history */
router.get('/:contactId', requireAuth, async (req, res) => {
  const { contactId } = req.params;
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 30;

  const [rows] = await pool.execute(
    'SELECT * FROM call_logs WHERE contact_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [contactId, limit, offset]
  );
  res.json({ calls: rows });
});
```

### 3. Create frontend components

**CallOutcomeButtons:**
```typescript
const OUTCOMES = [
  { key: 'connected', label: 'Connected', icon: <PhoneIcon />, color: '#4caf50' },
  { key: 'voicemail', label: 'Voicemail', icon: <VoicemailIcon />, color: '#ff9800' },
  { key: 'no_answer', label: 'No Answer', icon: <PhoneMissedIcon />, color: '#9e9e9e' },
  { key: 'busy', label: 'Busy', icon: <PhoneDisabledIcon />, color: '#f44336' },
];
```

**FollowUpScheduler:**
```typescript
// Toggle switch + datetime-local input
<FormControlLabel control={<Switch checked={enabled} onChange={onToggle} />} label="Schedule follow-up" />
{enabled && <TextField type="datetime-local" value={date} onChange={onDateChange} />}
```

### 4. Create useCallLogs hook

```typescript
function useCallLogs(contactId: number | null) {
  return useQuery<CallLog[]>({
    queryKey: ['callLogs', contactId],
    queryFn: async () => {
      const res = await apiFetch(`/api/calls/${contactId}`);
      const json = await res.json();
      return json.calls ?? [];
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });
}
```

### 5. Create Buddzee AI tool

```typescript
{
  name: 'log_call',
  isClientSide: false,
  openaiTool: {
    type: 'function',
    function: {
      name: 'log_call',
      description: 'Log a phone call. Auto-fill contactId/contactName from screen context.',
      parameters: {
        type: 'object',
        properties: {
          contactId: { type: 'string' },
          contactName: { type: 'string' },
          outcome: { type: 'string', enum: ['connected', 'voicemail', 'no_answer', 'busy'] },
          notes: { type: 'string' },
          followUpDate: { type: 'string' },
        },
        required: ['contactId', 'outcome'],
      },
    },
  },
}
```

### 6. Timeline integration

```typescript
function callLogToHistoryEntry(call: CallLog): ContactHistoryEntry {
  return {
    ID: -(call.id),  // Negative to avoid collision with VitalSync IDs
    Subject: `Call — ${OUTCOME_LABELS[call.outcome]}`,
    Details: call.notes,
    Type: 'Call Logged',
    CreatedAt: Math.floor(new Date(call.created_at).getTime() / 1000),
  };
}
```

## Gotchas & Lessons Learned

- **Fire-and-forget Ontraport sync** — don't block the response. Insert to MySQL first, return success, then sync.
- **Negative IDs for timeline** — prevents collision with VitalSync ObjectLogEntry IDs when merging.
- **`tel:` link + 1s delay** — opens native dialer, then shows logger after user potentially connects.
- **Ontraport Note object ID = 12**, Task object ID = 50. These are fixed Ontraport system IDs.
- **Outcome is required** — validate on both frontend (button selection) and backend.
- **TanStack Query invalidation** — `queryClient.invalidateQueries({ queryKey: ['callLogs'] })` after logging.
