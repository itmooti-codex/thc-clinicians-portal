# Bulk Actions Framework — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Multi-select pattern for performing actions on multiple records at once. Uses MUI DataGrid Pro's built-in checkbox selection with a custom toolbar that shows a contextual action bar when items are selected. Includes confirmation dialog for destructive actions.

## Architecture

- **Selection state:** MUI DataGrid Pro `rowSelectionModel` (array of row IDs)
- **Action bar:** Sticky toolbar at top with selected count + action buttons
- **Confirmation:** Dialog for destructive actions (delete, bulk status change)
- **State cleanup:** Selection cleared after action completes

```
DataGrid Pro (checkboxSelection) → rowSelectionModel state
  ├─ BulkActionBar (shows when selectedCount > 0)
  │  ├─ Tag action
  │  ├─ Email action
  │  ├─ SMS action
  │  └─ Delete action → BulkDeleteConfirm dialog
  └─ Custom toolbar slot
```

## File Inventory (2 files)

### Components (2 files)
- `src/components/bulk/BulkActionBar.tsx` — Sticky action bar with selected count + action chips
- `src/components/bulk/BulkDeleteConfirm.tsx` — Confirmation dialog for destructive actions

## Dependencies

```json
{
  "@mui/x-data-grid-pro": "^6.x",
  "@mui/material": "^5.x"
}
```

## Implementation Steps

### 1. Create BulkActionBar

```typescript
type BulkAction = 'tag' | 'email' | 'sms' | 'delete';

interface BulkActionBarProps {
  selectedCount: number;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
  actions?: BulkAction[];  // Defaults to all
}

const ACTION_CONFIG: Record<BulkAction, { icon: ReactNode; label: string; color: string }> = {
  tag: { icon: <TagIcon />, label: 'Tag', color: '#9c27b0' },
  email: { icon: <EmailIcon />, label: 'Email', color: '#2196f3' },
  sms: { icon: <SmsIcon />, label: 'SMS', color: '#4caf50' },
  delete: { icon: <DeleteIcon />, label: 'Delete', color: '#f44336' },
};

// Sticky bar at top
<Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'primary.main', color: 'white', px: 2, py: 1 }}>
  <Typography>{selectedCount} selected</Typography>
  {actions.map(action => (
    <Chip key={action} icon={config.icon} label={config.label} onClick={() => onAction(action)} />
  ))}
  <IconButton onClick={onClear}><CloseIcon /></IconButton>
</Box>
```

### 2. Create BulkDeleteConfirm

```typescript
interface BulkDeleteConfirmProps {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}

// Simple MUI Dialog
<Dialog open={open} onClose={onClose}>
  <DialogTitle>Delete {count} record{count !== 1 ? 's' : ''}?</DialogTitle>
  <DialogContent>This action cannot be undone.</DialogContent>
  <DialogActions>
    <Button onClick={onClose}>Cancel</Button>
    <Button onClick={onConfirm} color="error" variant="contained">Delete</Button>
  </DialogActions>
</Dialog>
```

### 3. Integrate with DataGrid Pro

```typescript
function RecordGrid() {
  const [rowSelection, setRowSelection] = useState<GridRowSelectionModel>([]);

  const handleBulkAction = async (action: BulkAction) => {
    const ids = rowSelection as (string | number)[];
    if (ids.length === 0) return;

    switch (action) {
      case 'delete':
        setDeleteConfirmOpen(true);
        break;
      case 'tag':
        setTagPickerOpen(true);
        break;
      case 'email':
        // Open compose with multiple recipients
        break;
    }
  };

  const handleBulkDelete = async () => {
    const ids = rowSelection as (string | number)[];
    for (const id of ids) {
      await deleteRecord(model, id);
    }
    setRowSelection([]);  // Clear selection
    setDeleteConfirmOpen(false);
    refresh();
  };

  return (
    <DataGridPro
      checkboxSelection
      rowSelectionModel={rowSelection}
      onRowSelectionModelChange={setRowSelection}
      slots={{
        toolbar: () => (
          <GridToolbarContainer>
            {rowSelection.length > 0 && (
              <BulkActionBar
                selectedCount={rowSelection.length}
                onAction={handleBulkAction}
                onClear={() => setRowSelection([])}
              />
            )}
            <GridToolbarColumnsButton />
            <GridToolbarFilterButton />
          </GridToolbarContainer>
        ),
      }}
    />
  );
}
```

### Alternative: Custom list bulk selection

For non-DataGrid lists (e.g., CollectionList with Virtuoso):

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

const toggleSelect = (id: string | number) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};

const selectAll = () => setSelectedIds(new Set(records.map(r => r.id)));
const clearSelection = () => setSelectedIds(new Set());
```

## Example Usage

### Bulk complete tasks

```typescript
const handleBulkComplete = async () => {
  // Filter out already-completed before API call
  const ids = (rowSelection as (string | number)[]).filter(id => {
    const task = allTasks.find(t => t.id === id);
    return task && task.status !== 'Completed';
  });

  if (ids.length === 0) return;
  await completeTasks(ids);
  setRowSelection([]);
  setToast(`${ids.length} task${ids.length !== 1 ? 's' : ''} completed`);
};
```

## Gotchas & Lessons Learned

- **Filter stale IDs before action** — records may have been updated since selection. Always re-check status.
- **Clear selection after action** — prevents stale selection state.
- **Sticky positioning** — `position: 'sticky', top: 0, zIndex: 10` keeps the action bar visible while scrolling.
- **DataGrid Pro checkbox column** — automatically handled by `checkboxSelection` prop, no manual column definition needed.
- **Bulk API calls** — for VitalSync mutations, loop through IDs. For Ontraport, use batch endpoints that accept ID arrays.
