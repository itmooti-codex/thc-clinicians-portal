# Record Detail Views — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Configuration-driven tabbed detail view for any VitalSync model. Displays grouped fields with inline tap-to-edit (auto-save after 1.5s), a hero header with quick actions (call, SMS, email), and tabs for Details, Connected records, and Timeline. Works with any model via `RecordDetailConfig`.

## Architecture

- **Config-driven:** `RecordDetailConfig` defines field groups, quick actions, related records — no per-model components.
- **Inline editing:** Tap any field to edit inline. Auto-saves after 1.5s inactivity or on blur. Select fields save immediately.
- **VitalSync mutations:** `useRecordMutation` handles create/update via SDK.
- **Tabs:** Details (field groups), Connected (related records via FK), Timeline (activity log).

```
RecordDetailConfig → useRecordDetail (VitalSync query) → RecordDetailView
                                                            ├─ RecordHero (avatar, quick actions)
                                                            ├─ Tabs
                                                            │  ├─ DetailsTab (field groups + InlineFieldEditor)
                                                            │  ├─ ConnectedTab (related records)
                                                            │  └─ TimelineTab (activity feed)
                                                            └─ QuickAddDialog (minimal create form)
```

## File Inventory (8 files)

### Types (1 file)
- `src/types/record-detail.ts` — FieldDef, FieldGroup, RelatedRecordConfig, RecordDetailConfig

### Hooks (2 files)
- `src/hooks/useRecordDetail.ts` — Fetch single record by model + ID
- `src/hooks/useRecordMutation.ts` — Create/update via SDK mutations

### Components (5 files)
- `src/components/records/RecordHero.tsx` — Header with avatar, name, quick action buttons
- `src/components/records/DetailsTab.tsx` — Field groups with optional inline editing
- `src/components/records/InlineFieldEditor.tsx` — Tap-to-edit with debounced auto-save
- `src/components/records/ConnectedTab.tsx` — Related records via FK relationships
- `src/components/records/TimelineTab.tsx` — Chronological activity feed
- `src/components/records/QuickAddDialog.tsx` — Minimal create dialog

## Dependencies

```json
{
  "@mui/material": "^5.x"
}
```

## Implementation Steps

### 1. Define types

**`src/types/record-detail.ts`:**
```typescript
export interface FieldDef {
  field: string;
  label: string;
  type?: 'text' | 'email' | 'phone' | 'date' | 'select' | 'number' | 'url';
  options?: string[];         // For type='select'
}

export interface FieldGroup {
  title: string;
  fields: FieldDef[];
}

export interface RelatedRecordConfig {
  model: string;
  label: string;
  foreignKey: string;         // FK field on related model
  fields: string[];
  primaryField: string;
  secondaryField?: string;
  statusField?: string;
  statusColors?: Record<string, string>;
}

export interface RecordDetailConfig {
  collection: CollectionConfig;
  fieldGroups: FieldGroup[];
  quickActions?: Array<'call' | 'sms' | 'email' | 'whatsapp'>;
  subtitleField?: string;
  relatedRecords?: RelatedRecordConfig[];
  quickAddFields?: FieldDef[];
}
```

### 2. Create record detail hook

**`src/hooks/useRecordDetail.ts`:**
```typescript
export function useRecordDetail({ model, id, fields }: { model: string; id: string; fields: string[] }) {
  const [record, setRecord] = useState<CollectionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rawResult = await plugin.switchTo(model)
        .query().select(fields).where('id', '=', id).limit(1)
        .fetchAllRecords().pipe(window.toMainInstance(true)).toPromise();

      const keys = Object.keys(rawResult);
      const raw = rawResult[keys[0]];
      const plain = raw?.getState ? raw.getState() : raw;
      setRecord(plain);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load record');
    } finally {
      setLoading(false);
    }
  }, [model, id, fields]);

  useEffect(() => { refresh(); }, [refresh]);
  return { record, loading, error, refresh };
}
```

### 3. Create InlineFieldEditor

Key pattern — tap-to-edit with debounced auto-save:

```typescript
export function InlineFieldEditor({ fieldDef, value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const doSave = async (val: string) => {
    if (val === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    const result = await onSave(fieldDef.field, val);
    setSaving(false);
    if (result.success) setEditing(false);
  };

  const handleChange = (newValue: string) => {
    setEditValue(newValue);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(newValue), 1500);
  };

  const handleBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    doSave(editValue);
  };

  // Select fields save immediately on change (no timer)
  // Escape cancels and reverts
  // Enter saves and exits edit mode
}
```

### 4. Create RecordHero

Quick action buttons open native handlers:

```typescript
const actionHrefs = {
  call: (r) => r.sms_number ? `tel:${r.sms_number}` : r.phone ? `tel:${r.phone}` : null,
  sms: (r) => r.sms_number ? `sms:${r.sms_number}` : r.phone ? `sms:${r.phone}` : null,
  email: (r) => r.email ? `mailto:${r.email}` : null,
};

// Opens native dialer, then triggers call logger after 1s delay
const handleCall = () => {
  window.open(href, '_self');
  setTimeout(() => onCallInitiated?.(), 1000);
};
```

### 5. Wire up the full detail view

```tsx
function RecordDetailView({ modelKey, recordId }: { modelKey: string; recordId: string }) {
  const config = getRecordDetailConfig(modelKey)!;
  const [tab, setTab] = useState(0);
  const { record, loading, refresh } = useRecordDetail({
    model: config.collection.model, id: recordId, fields: config.collection.fields,
  });
  const { updateRecord } = useRecordMutation();

  const handleFieldSave = async (field: string, value: unknown) => {
    const result = await updateRecord(config.collection.model, recordId, { [field]: value });
    if (result.success) refresh();
    return result;
  };

  if (loading || !record) return <CircularProgress />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <RecordHero record={record} config={config} onRefresh={refresh} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Details" />
        <Tab label="Connected" />
        <Tab label="Timeline" />
      </Tabs>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {tab === 0 && <DetailsTab record={record} fieldGroups={config.fieldGroups} onFieldSave={handleFieldSave} />}
        {tab === 1 && <ConnectedTab relatedRecords={config.relatedRecords} />}
        {tab === 2 && <TimelineTab />}
      </Box>
    </Box>
  );
}
```

## Gotchas & Lessons Learned

- **Inline edit auto-save timer:** 1.5s debounce prevents excessive API calls while typing. Blur triggers immediate save.
- **Select fields save immediately** — no debounce needed since the value is final on selection.
- **`getState()` on SDK records** — always call this to get plain objects. Otherwise MUI components get empty objects.
- **Quick action `tel:` links** — use `window.open(href, '_self')` on mobile to open native dialer without leaving the app.
- **Call logger integration** — after opening dialer, wait 1s then show call logger dialog (user may or may not have connected).
- **ConnectedTab and TimelineTab** are extensible placeholders — implement fetching related records via FK queries and ObjectLogEntry queries respectively.
