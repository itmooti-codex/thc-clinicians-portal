# n8n Workflow Browser — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

In-app n8n workflow management UI that matches n8n's native interface style. Shows live workflow list fetched from the n8n REST API with search, tag filtering, status filtering, sort options, and activate/deactivate toggle. Includes 6 Buddzee AI tools for programmatic workflow CRUD. Works alongside the Buddzee Automation Engine (which creates n8n workflows automatically).

## Architecture

- **Backend client:** Express wrapper around n8n REST API with auto-pagination
- **Frontend tab:** Part of Automations view (Tab 2: "n8n Workflows")
- **AI tools:** 6 Buddzee tools for creating/managing workflows via natural language
- **Settings integration:** n8n URL + API key from Settings → Integrations (or env vars)

```
AutomationsView (Tab 2) → GET /api/automations/n8n-workflows
  ├─ n8nClient.listWorkflows() → n8n REST API → workflow list
  ├─ n8nClient.listTags() → n8n REST API → tag list
  └─ Search/filter/sort (client-side)

Buddzee AI → n8n tools → n8nClient → n8n REST API → CRUD workflows
```

## File Inventory (3 files)

### Frontend (1 file)
- `src/components/automations/AutomationsView.tsx` — Tab 2: n8n Workflows (within Automations page)

### Backend (2 files)
- `server/src/lib/n8n-client.ts` — n8n REST API client wrapper
- `server/src/lib/tools/n8n-tools.ts` — 6 Buddzee AI tools for workflow management

## Dependencies

```json
{
  "@mui/material": "^5.x"
}
```

## Environment Variables

```bash
# Set in .env OR configure in Settings UI
N8N_API_URL=https://automations.vitalstats.app
N8N_API_KEY=your-n8n-api-key
```

## Implementation Steps

### 1. Create n8n REST API client

**`server/src/lib/n8n-client.ts`:**
```typescript
import { getN8nConfig } from './settings';

interface N8nTag { id: string; name: string; }
interface N8nWorkflowSummary {
  id: string; name: string; active: boolean;
  createdAt?: string; updatedAt?: string; tags?: N8nTag[];
}

async function n8nFetch(path: string, opts?: RequestInit) {
  const config = await getN8nConfig();
  if (!config) throw new Error('n8n not configured');
  return fetch(`${config.apiUrl}/api/v1${path}`, {
    ...opts,
    headers: { 'X-N8N-API-KEY': config.apiKey, 'Content-Type': 'application/json', ...opts?.headers },
  });
}

export async function listWorkflows(opts?: { fetchAll?: boolean }): Promise<N8nWorkflowSummary[]> {
  const all: N8nWorkflowSummary[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '250' });
    if (cursor) params.set('cursor', cursor);

    const res = await n8nFetch(`/workflows?${params}`);
    const data = await res.json();
    all.push(...(data.data || []));
    cursor = data.nextCursor;
  } while (cursor && opts?.fetchAll !== false);

  return all;
}

export async function listTags(): Promise<N8nTag[]> {
  const res = await n8nFetch('/tags?limit=100');
  const data = await res.json();
  return data.data || [];
}

export async function getWorkflow(id: string) {
  const res = await n8nFetch(`/workflows/${id}`);
  return res.json();
}

export async function activateWorkflow(id: string) {
  return n8nFetch(`/workflows/${id}/activate`, { method: 'POST' });
}

export async function deactivateWorkflow(id: string) {
  return n8nFetch(`/workflows/${id}/deactivate`, { method: 'POST' });
}

export async function updateWorkflow(id: string, updates: Partial<N8nWorkflow>) {
  // n8n PUT requires ALL fields — GET first, merge, PUT back
  const current = await getWorkflow(id);
  const wasActive = current.active;
  if (wasActive) await deactivateWorkflow(id);  // Must deactivate before update

  const res = await n8nFetch(`/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...current, ...updates }),
  });

  if (wasActive) await activateWorkflow(id);  // Re-activate if it was active
  return res.json();
}

export function getWorkflowUrl(workflowId: string): string {
  // Returns n8n editor URL for "Open in n8n" links
  return `${config.apiUrl}/workflow/${workflowId}`;
}
```

### 2. Create backend API endpoint

```typescript
/** GET /api/automations/n8n-workflows */
router.get('/n8n-workflows', requireAuth, async (req, res) => {
  try {
    const config = await getN8nConfig();
    if (!config) { res.json({ configured: false, workflows: [], tags: [] }); return; }

    const [workflows, tags] = await Promise.all([listWorkflows({ fetchAll: true }), listTags()]);
    res.json({ configured: true, workflows, tags });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});
```

### 3. Create frontend UI

**Key patterns from AutomationsView:**

```typescript
// State
const [workflows, setWorkflows] = useState<N8nWorkflowSummary[]>([]);
const [allTags, setAllTags] = useState<N8nTag[]>([]);
const [search, setSearch] = useState('');
const [selectedTags, setSelectedTags] = useState<string[]>([]);
const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
const [sortBy, setSortBy] = useState<'last_created' | 'last_updated' | 'name_asc' | 'name_desc'>('last_created');

// Client-side filtering
const filteredWorkflows = useMemo(() => {
  let result = [...workflows];

  // Status filter
  if (statusFilter === 'active') result = result.filter(w => w.active);
  else if (statusFilter === 'inactive') result = result.filter(w => !w.active);

  // Tag filter (any of selected tags)
  if (selectedTags.length > 0) {
    result = result.filter(w => w.tags?.some(t => selectedTags.includes(t.id)));
  }

  // Text search
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(w =>
      w.name.toLowerCase().includes(q) ||
      w.tags?.some(t => t.name.toLowerCase().includes(q))
    );
  }

  // Sort
  result.sort((a, b) => {
    switch (sortBy) {
      case 'last_created': return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      case 'last_updated': return new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime();
      case 'name_asc': return a.name.localeCompare(b.name);
      case 'name_desc': return b.name.localeCompare(a.name);
    }
  });

  return result;
}, [workflows, search, selectedTags, statusFilter, sortBy]);
```

**UI elements:**
- Search bar with clear button
- Sort dropdown (4 options)
- Filter popover: status chips + tag chips with checkmarks
- Active filter pills below toolbar
- Refresh button (spinning icon while loading)
- Workflow list with n8n-style bordered rows:
  - Name, last updated (relative), created date, tags, active indicator
  - Row click → opens in n8n editor (new tab)
  - Three-dot menu → "Open in n8n"

**Time formatting:**
```typescript
function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}
```

### 4. Create 6 Buddzee AI tools

```typescript
export const n8nTools = [
  { name: 'configure_n8n', /* apiUrl, apiKey → test + save encrypted */ },
  { name: 'list_n8n_workflows', /* limit → { workflows, total } */ },
  { name: 'create_n8n_workflow', /* name, nodes, connections, activate? → { workflowId, url } */ },
  { name: 'update_n8n_workflow', /* workflowId, name?, nodes, connections → updated workflow */ },
  { name: 'activate_n8n_workflow', /* workflowId, active: boolean */ },
  { name: 'test_n8n_webhook', /* webhookPath, testPayload, method? → { status, body } */ },
];
```

## Gotchas & Lessons Learned

- **n8n PUT requires full payload** — partial updates silently fail. Always GET → merge → PUT.
- **Must deactivate before update** — n8n rejects PUT on active workflows. Deactivate, update, re-activate.
- **Auto-pagination** — n8n API paginates with cursor. `listWorkflows({ fetchAll: true })` collects all pages.
- **Client-side filtering** — all workflows are fetched at once (typically <100), then filtered/sorted in the browser.
- **Tag click navigation** — clicking a tag chip in a workflow row toggles that tag in the filter (UX pattern from n8n).
- **"Open in n8n"** — opens `{n8nUrl}/workflow/{id}` in new tab. User must be logged into n8n.
