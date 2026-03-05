# Advanced Search & Filters — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Multi-layered filtering system combining a filter drawer (ad-hoc conditions with AND/OR logic), saved filter chips (quick-toggle presets), and real-time text search. Converts filter conditions to VitalSync SDK query builder calls via a query translator utility. Works with the Collections System.

## Architecture

- **3 filter layers:** Text search (multi-field OR), filter drawer (ad-hoc conditions), saved filter chips (presets)
- **All layers combine with AND** — each narrows results further
- **Query translator** converts `FilterGroup[]` → VitalSync `.where()` / `.orWhere()` chains
- **9 operators:** `=`, `!=`, `like`, `>`, `>=`, `<`, `<=`, `is_null`, `is_not_null`

```
User input → 3 filter sources:
  1. Search term → multi-field OR .where()/.orWhere()
  2. FilterDrawer conditions → single AND group
  3. GroupFilterChips active IDs → saved FilterGroup[]
All combined → applyFilterGroups(query, groups) → VitalSync query
```

## File Inventory (4 files)

### Types (1 file)
- `src/types/filter.ts` — FilterOperator, FilterCondition, FilterGroup, SavedFilter

### Components (2 files)
- `src/components/search/FilterDrawer.tsx` — Right-side drawer for building filter conditions
- `src/components/search/GroupFilterChips.tsx` — Horizontal scrollable saved filter chips

### Utilities (1 file)
- `src/utils/groupQueryTranslator.ts` — `applyFilterGroups()` for VitalSync query building

## Dependencies

```json
{
  "@mui/material": "^5.x"
}
```

## Implementation Steps

### 1. Define filter types

See `src/types/filter.ts` in the [Collections System](collections-system.md) guide.

### 2. Create FilterDrawer

```typescript
interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filterableFields: FieldDef[];     // Available fields to filter on
  conditions: FilterCondition[];     // Current active conditions
  onApply: (conditions: FilterCondition[]) => void;
  onClear: () => void;
}
```

**UI structure:**
- Field dropdown (from `filterableFields`)
- Operator dropdown (9 options — `is_null`/`is_not_null` hide value input)
- Value input (text, number, or select based on field type)
- "AND" divider between conditions
- "Add condition" button
- Footer: "Clear All" + "Apply Filters"

**Validation:** Filters out conditions with empty fields or missing values (except `is_null`/`is_not_null` which need no value).

### 3. Create GroupFilterChips

```typescript
interface GroupFilterChipsProps {
  filters: SavedFilter[];
  activeIds: string[];
  onToggle: (filterId: string) => void;
}
```

- Horizontal scrollable chip row
- Active chips: primary color background + border
- Inactive chips: transparent + grey border
- Multi-select: multiple can be active simultaneously

### 4. Create query translator

See `src/utils/groupQueryTranslator.ts` in the [Collections System](collections-system.md) guide.

### 5. Integrate in CollectionList

```typescript
// State
const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);

// Combine into FilterGroup[]
const activeFilters = useMemo<FilterGroup[]>(() => {
  const groups: FilterGroup[] = [];
  if (filterConditions.length > 0) {
    groups.push({ logic: 'and', conditions: filterConditions });
  }
  for (const id of activeGroupIds) {
    const saved = savedFilters.find(f => f.id === id);
    if (saved) groups.push(saved.filter);
  }
  return groups;
}, [filterConditions, activeGroupIds, savedFilters]);

// Pass to useCollectionData
const { records, loading } = useCollectionData({ config, searchTerm, sort, filters: activeFilters });
```

## Example Usage

### Defining saved filters

```typescript
const savedFilters: SavedFilter[] = [
  { id: 'active', label: 'Active', filter: { logic: 'and', conditions: [
    { field: 'status', operator: '=', value: 'Active' }
  ]}},
  { id: 'high-value', label: 'High Value', filter: { logic: 'and', conditions: [
    { field: 'total_spent', operator: '>', value: 1000 }
  ]}},
  { id: 'recent', label: 'This Week', filter: { logic: 'and', conditions: [
    { field: 'created_at', operator: '>=', value: weekStartTimestamp }
  ]}},
];
```

### Operator translations

| UI Operator | SDK Translation |
|-------------|-----------------|
| `=` | `.where(field, '=', value)` |
| `!=` | `.where(field, '!=', value)` |
| `like` | `.where(field, 'like', '%value%')` |
| `>`, `>=`, `<`, `<=` | Direct pass-through |
| `is_null` | `.where(field, '=', null)` |
| `is_not_null` | `.where(field, '!=', null)` |

## Gotchas & Lessons Learned

- **Groups are ANDed together** — drawer conditions form one group, each active chip is another. All must match.
- **Within a group**, conditions follow the group's `logic` field (`'and'` or `'or'`).
- **First condition** in a group always uses `.where()`, subsequent use `.where()` (AND) or `.orWhere()` (OR).
- **`like` wraps with `%`** — the translator handles this automatically.
- **`is_null`/`is_not_null`** don't need a value input — hide the value field in the drawer.
- **Filter badge count** — show the total number of active conditions on the filter icon.
- **Chip toggle is multi-select** — users can activate multiple saved filters simultaneously.
