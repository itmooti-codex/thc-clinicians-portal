# Tag Management — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Tag picker and display system integrated with Ontraport's tag API. Includes a searchable multi-select picker dialog, inline tag chips with add/remove, and Express backend proxy that keeps API keys server-side. Supports bulk tagging (multiple contact IDs).

## Architecture

- **Backend proxy:** Express routes proxy to Ontraport tag API (keys never exposed to frontend)
- **Tag list:** Fetched from Ontraport via `GET /api/tags` on mount
- **Tag operations:** Add/remove via Ontraport batch endpoints (supports multiple contact IDs)
- **Immediate toggle:** Each add/remove triggers an API call immediately (no save button)

```
Frontend                          Backend                         Ontraport
TagPicker → onToggle(id,action) → POST /api/tags/add|remove → PUT/DELETE /objects/tag
TagChips → onRemove(name)       → POST /api/tags/remove     → DELETE /objects/tag
useTags → tags[], addTag(), removeTag()
```

## File Inventory (5 files)

### Frontend (3 files)
- `src/components/tags/TagPicker.tsx` — Searchable multi-select dialog
- `src/components/tags/TagChips.tsx` — Inline chip display with add/remove
- `src/hooks/useTags.ts` — Fetch tags, add/remove operations

### Backend (1 file)
- `server/src/routes/tags.ts` — Ontraport tag API proxy (GET, add, remove)

### Modified (1 file)
- `server/src/index.ts` — Mount tag routes

## Dependencies

```json
{
  "@mui/material": "^5.x"
}
```

## Environment Variables

```bash
ONTRAPORT_API_APPID=your-app-id
ONTRAPORT_API_KEY=your-api-key
```

## Implementation Steps

### 1. Create backend routes

**`server/src/routes/tags.ts`:**
```typescript
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getOntraportConfig } from '../lib/settings';

const ONTRAPORT_API_BASE = 'https://api.ontraport.com/1';
const router = Router();

/** GET /api/tags — Fetch all tags */
router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
  const config = await getOntraportConfig();
  if (!config) { res.status(500).json({ error: 'Ontraport not configured' }); return; }

  const headers = { 'Api-Appid': config.appId, 'Api-Key': config.apiKey, 'Content-Type': 'application/json' };
  const upstream = await fetch(`${ONTRAPORT_API_BASE}/Tags?range=250`, { headers });
  const data = await upstream.json();
  const tags = (data.data ?? []).map((t: any) => ({ tag_id: Number(t.tag_id), tag_name: String(t.tag_name ?? '') }));
  res.json({ tags });
});

/** POST /api/tags/add — Add tag to contact(s) */
router.post('/add', requireAuth, async (req: AuthRequest, res: Response) => {
  const { contact_ids, tag_id } = req.body;
  const config = await getOntraportConfig();
  if (!config) { res.status(500).json({ error: 'Ontraport not configured' }); return; }

  const headers = { 'Api-Appid': config.appId, 'Api-Key': config.apiKey, 'Content-Type': 'application/json' };
  await fetch(`${ONTRAPORT_API_BASE}/objects/tag`, {
    method: 'PUT', headers,
    body: JSON.stringify({ objectID: 0, ids: contact_ids.map(Number), add_list: String(tag_id) }),
  });
  res.json({ success: true });
});

/** POST /api/tags/remove — Remove tag from contact(s) */
router.post('/remove', requireAuth, async (req: AuthRequest, res: Response) => {
  const { contact_ids, tag_id } = req.body;
  const config = await getOntraportConfig();
  if (!config) { res.status(500).json({ error: 'Ontraport not configured' }); return; }

  const headers = { 'Api-Appid': config.appId, 'Api-Key': config.apiKey, 'Content-Type': 'application/json' };
  await fetch(`${ONTRAPORT_API_BASE}/objects/tag`, {
    method: 'DELETE', headers,
    body: JSON.stringify({ objectID: 0, ids: contact_ids.map(Number), remove_list: String(tag_id) }),
  });
  res.json({ success: true });
});

export default router;
```

### 2. Create useTags hook

```typescript
export interface Tag { tag_id: number; tag_name: string; }

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await apiFetch('/api/tags');
    const data = await res.json();
    setTags(data.tags ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addTag = async (contactIds: (string | number)[], tagId: number) => {
    const res = await apiFetch('/api/tags/add', {
      method: 'POST',
      body: JSON.stringify({ contact_ids: contactIds, tag_id: tagId }),
    });
    return res.ok;
  };

  const removeTag = async (contactIds: (string | number)[], tagId: number) => {
    const res = await apiFetch('/api/tags/remove', {
      method: 'POST',
      body: JSON.stringify({ contact_ids: contactIds, tag_id: tagId }),
    });
    return res.ok;
  };

  return { tags, loading, refresh, addTag, removeTag };
}
```

### 3. Create TagPicker

```typescript
interface TagPickerProps {
  open: boolean;
  onClose: () => void;
  currentTags: string[];  // Tag names currently applied
  onToggle: (tagId: number, tagName: string, action: 'add' | 'remove') => void;
}

// Searchable checkbox list
// Checked state based on currentTags.includes(tag.tag_name)
// Each toggle calls onToggle immediately (no save button)
```

### 4. Create TagChips

```typescript
interface TagChipsProps {
  tags: string[];
  onAdd?: () => void;           // Shows "+ Tag" chip
  onRemove?: (tagName: string) => void;  // Shows X on each chip
  maxVisible?: number;          // Default 5, "+X more" for overflow
}
```

## Example Usage

```tsx
const { tags, addTag, removeTag } = useTags();
const [tagPickerOpen, setTagPickerOpen] = useState(false);

const handleTagToggle = async (tagId: number, tagName: string, action: 'add' | 'remove') => {
  if (action === 'add') await addTag([contactId], tagId);
  else await removeTag([contactId], tagId);
  refreshRecord();
};

<TagChips
  tags={record.tags || []}
  onAdd={() => setTagPickerOpen(true)}
  onRemove={async (name) => {
    const tag = tags.find(t => t.tag_name === name);
    if (tag) await removeTag([contactId], tag.tag_id);
  }}
/>

<TagPicker
  open={tagPickerOpen}
  onClose={() => setTagPickerOpen(false)}
  currentTags={record.tags || []}
  onToggle={handleTagToggle}
/>
```

## Gotchas & Lessons Learned

- **Ontraport objectID 0** = Contacts. Other objects have different IDs (Tasks = 50, etc.).
- **`add_list` / `remove_list`** are strings — single tag ID as string, not array.
- **Batch operations** — Ontraport accepts arrays of contact IDs, so bulk tagging is a single API call.
- **Tags are stored on Ontraport side** — no local database needed for tag data.
- **Proxy pattern** — keeps `ONTRAPORT_API_KEY` server-side. Frontend never sees the key.
- **Tag operations trigger Ontraport automations** — adding a tag may trigger sequences, campaigns, etc.
