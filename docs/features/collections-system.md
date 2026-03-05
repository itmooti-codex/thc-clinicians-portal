# Collections System (Generic List Views) — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Model-agnostic, configuration-driven list view system for browsing any VitalSync model. Includes virtualized infinite scroll (React Virtuoso), multi-field search, sort, filter drawer with AND/OR logic, saved filter chips, and quick-add FAB. Paired with a record detail view system for tabbed detail pages with inline editing.

## Architecture

- **Configuration-driven:** A single `CollectionConfig` object defines model name, fields, search fields, status colors — no per-model components needed.
- **VitalSync SDK queries:** Built dynamically from config, with `.pipe(window.toMainInstance(true))` and `convertRecords()`.
- **Virtualized rendering:** React Virtuoso handles large lists with infinite scroll pagination.
- **Filter system:** Drawer conditions + saved filter chips combined via `applyFilterGroups()` utility.

```
CollectionConfig → useCollectionData (VitalSync query) → CollectionList (Virtuoso)
                                                            ├─ CollectionHeader (search, sort, filter icon)
                                                            ├─ GroupFilterChips (saved filter toggles)
                                                            ├─ CollectionListItem × N (virtualized)
                                                            ├─ FilterDrawer (slide-in condition builder)
                                                            └─ QuickAddDialog (minimal create form)
```

## File Inventory (12 files)

### Types (3 files)
- `src/types/collection.ts` — CollectionConfig, CollectionRecord, SortConfig
- `src/types/record-detail.ts` — FieldDef, FieldGroup, RelatedRecordConfig, RecordDetailConfig
- `src/types/filter.ts` — FilterOperator, FilterCondition, FilterGroup, SavedFilter

### Hooks (3 files)
- `src/hooks/useCollectionData.ts` — Paginated VitalSync query with search, sort, filters
- `src/hooks/useRecordMutation.ts` — Create/update records via SDK mutations
- `src/hooks/useRecordDetail.ts` — Fetch single record by model + ID

### Components (6 files)
- `src/components/collections/CollectionList.tsx` — Full list view with all features
- `src/components/collections/CollectionHeader.tsx` — Search bar, sort popover, filter badge
- `src/components/collections/CollectionListItem.tsx` — Avatar + primary/secondary text + status border
- `src/components/collections/EmptyState.tsx` — Empty state with icon + message
- `src/components/search/FilterDrawer.tsx` — Right-side drawer for ad-hoc filter conditions
- `src/components/search/GroupFilterChips.tsx` — Horizontal scrollable saved filter chips

### Utilities (2 files)
- `src/utils/formatters.ts` — `convertRecords()`, date/currency formatting
- `src/utils/groupQueryTranslator.ts` — `applyFilterGroups()` for VitalSync query building

### Config (1 file)
- `src/config/record-configs.ts` — Central registry of per-model configurations

## Dependencies

```json
{
  "react-virtuoso": "^4.x",
  "@mui/material": "^5.x"
}
```

## Implementation Steps

### 1. Define types

**`src/types/collection.ts`:**
```typescript
export interface CollectionConfig {
  model: string;              // VitalSync internal model name (e.g. 'PhyxContact')
  label: string;              // Display name (e.g. 'Contacts')
  fields: string[];           // Fields to fetch (always includes 'id')
  primaryField: string;       // Primary display field (e.g. 'first_name')
  secondaryField?: string;    // Secondary display field (e.g. 'email')
  searchFields: string[];     // Fields for multi-field OR search
  sortField?: string;         // Default sort field
  sortDirection?: 'asc' | 'desc';
  statusField?: string;       // Field for status color-coding
  statusColors?: Record<string, string>;
  pageSize?: number;          // Records per page (default: 50)
}

export interface CollectionRecord {
  id: number | string;
  [key: string]: unknown;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}
```

**`src/types/filter.ts`:**
```typescript
export type FilterOperator = '=' | '!=' | 'like' | '>' | '>=' | '<' | '<=' | 'is_null' | 'is_not_null';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: string | number | null;
}

export interface FilterGroup {
  logic: 'and' | 'or';
  conditions: FilterCondition[];
}

export interface SavedFilter {
  id: string;
  label: string;
  filter: FilterGroup;
  source?: 'ontraport' | 'quick' | 'user';
}
```

### 2. Create query translator utility

**`src/utils/groupQueryTranslator.ts`:**
```typescript
import { FilterCondition, FilterGroup } from '../types/filter';

function buildClause(condition: FilterCondition) {
  const { field, operator, value } = condition;
  switch (operator) {
    case 'like': return { field, operator: 'like', value: `%${value}%` };
    case 'is_null': return { field, operator: '=', value: null };
    case 'is_not_null': return { field, operator: '!=', value: null };
    default: return { field, operator, value };
  }
}

export function applyFilterGroup(query: any, filterGroup: FilterGroup): any {
  const { logic, conditions } = filterGroup;
  let q = query;
  conditions.forEach((condition, index) => {
    const clause = buildClause(condition);
    if (!clause) return;
    if (index === 0) {
      q = q.where(clause.field, clause.operator, clause.value);
    } else if (logic === 'or') {
      q = q.orWhere(clause.field, clause.operator, clause.value);
    } else {
      q = q.where(clause.field, clause.operator, clause.value);
    }
  });
  return q;
}

export function applyFilterGroups(query: any, groups: FilterGroup[]): any {
  let q = query;
  for (const group of groups) { q = applyFilterGroup(q, group); }
  return q;
}
```

### 3. Create hooks

**`src/hooks/useCollectionData.ts`** — key patterns:
```typescript
interface UseCollectionDataOptions {
  config: CollectionConfig;
  searchTerm?: string;
  sort?: SortConfig;
  filters?: FilterGroup[];
}

// Query building
const query = plugin.switchTo(config.model)
  .query()
  .select(config.fields)
  .limit(pageSize)
  .offset(offset);

// Multi-field OR search
config.searchFields.forEach((field, i) => {
  if (i === 0) query.where(field, 'like', `%${term}%`);
  else query.orWhere(field, 'like', `%${term}%`);
});

// Apply filters
if (filters?.length) applyFilterGroups(query, filters);

// Execute with toMainInstance
const raw = await query.fetchAllRecords().pipe(window.toMainInstance(true)).toPromise();
const records = convertRecords<CollectionRecord>(raw);
```

**`src/hooks/useRecordMutation.ts`:**
```typescript
// Create
plugin.switchTo(model).mutation().createOne(data).execute(true).toPromise();

// Update
const mutation = plugin.switchTo(model).mutation();
mutation.update((q) => {
  let query = q.where('id', '=', id);
  for (const [key, value] of Object.entries(data)) {
    query = query.set({ [key]: value });
  }
  return query;
});
await mutation.execute(true).toPromise();
```

### 4. Create components

**Key patterns for `CollectionList.tsx`:**
```tsx
// State combines drawer filters + saved filter chips
const activeFilters = useMemo<FilterGroup[]>(() => {
  const groups: FilterGroup[] = [];
  if (filterConditions.length > 0) groups.push({ logic: 'and', conditions: filterConditions });
  for (const id of activeGroupIds) {
    const saved = savedFilters.find(f => f.id === id);
    if (saved) groups.push(saved.filter);
  }
  return groups;
}, [filterConditions, activeGroupIds, savedFilters]);

// Virtuoso with infinite scroll
<Virtuoso
  style={{ flex: 1 }}
  data={records}
  endReached={() => { if (hasMore && !loadingMore) loadMore(); }}
  itemContent={(_index, record) => (
    <CollectionListItem record={record} config={config} onClick={onRecordClick} />
  )}
  components={{ Footer: () => loadingMore ? <CircularProgress /> : null }}
/>
```

### 5. Create model config registry

**`src/config/record-configs.ts`:**
```typescript
import { RecordDetailConfig } from '../types/record-detail';

const configs: Record<string, RecordDetailConfig> = {
  Contact: {
    collection: {
      model: 'YourContact',  // VitalSync internal name
      label: 'Contact',
      fields: ['id', 'first_name', 'last_name', 'email', 'phone', 'status'],
      primaryField: 'first_name',
      secondaryField: 'email',
      searchFields: ['first_name', 'last_name', 'email'],
      statusField: 'status',
      statusColors: { Active: '#4caf50', Pending: '#ff9800', Inactive: '#9e9e9e' },
    },
    fieldGroups: [
      { title: 'Personal', fields: [
        { field: 'first_name', label: 'First Name', type: 'text' },
        { field: 'last_name', label: 'Last Name', type: 'text' },
        { field: 'email', label: 'Email', type: 'email' },
      ]},
    ],
    quickActions: ['call', 'sms', 'email'],
    quickAddFields: [
      { field: 'first_name', label: 'First Name', type: 'text' },
      { field: 'email', label: 'Email', type: 'email' },
    ],
  },
};

export function getRecordDetailConfig(model: string): RecordDetailConfig | undefined {
  return configs[model];
}
```

## Example Usage

```tsx
import { CollectionList } from './components/collections/CollectionList';
import { getRecordDetailConfig } from './config/record-configs';

function ContactsPage() {
  const config = getRecordDetailConfig('Contact')!;
  const savedFilters: SavedFilter[] = [
    { id: '1', label: 'Active', filter: { logic: 'and', conditions: [{ field: 'status', operator: '=', value: 'Active' }] } },
  ];

  return (
    <CollectionList
      config={config.collection}
      sortableFields={[{ field: 'first_name', label: 'Name' }, { field: 'email', label: 'Email' }]}
      quickAddFields={config.quickAddFields}
      filterableFields={config.fieldGroups.flatMap(g => g.fields)}
      savedFilters={savedFilters}
      onRecordClick={(record) => navigate(`/contacts/${record.id}`)}
    />
  );
}
```

## Gotchas & Lessons Learned

- **Always `.pipe(window.toMainInstance(true))`** — omitting this causes stale/missing data.
- **`convertRecords()` is required** — SDK records have non-enumerable properties, `Object.keys()` returns `[]`.
- **Multi-field OR search** — first field uses `.where()`, rest use `.orWhere()`.
- **Filter groups are ANDed together** — each group narrows results further. Within a group, conditions follow the group's `logic` (AND or OR).
- **Keep `.limit()` reasonable** — limits above ~1,000 can hang the SDK. Use pagination.
- **Client-side sort** — fetch unsorted, sort with `localeCompare()` for consistent cross-browser behavior.
- **React Virtuoso `endReached`** — fires when scrolled to bottom, triggers `loadMore()` for infinite scroll.
