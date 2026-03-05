# Deal Pipeline / Kanban — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Configuration-driven Kanban pipeline board for managing deals through stages. Includes drag-to-move, deal health scoring (green/yellow/red based on time in stage), weighted forecast, summary bar, list/Kanban view toggle, and a bottom-sheet stage selector for mobile.

## Architecture

- **Config-driven:** `PipelineConfig` defines model, stages, fields, and health scoring thresholds.
- **VitalSync data:** Deals fetched via SDK, grouped by stage field.
- **Health scoring:** Time-based algorithm comparing days in stage vs expected averages.
- **Optimistic moves:** Stage change updates local state immediately, then executes SDK mutation.

```
PipelineConfig → usePipelineData (VitalSync query + groupByStage)
                    ├─ PipelineSummaryBar (total value, count, forecast)
                    ├─ PipelineBoard
                    │  ├─ PipelineColumn × N (stage cards)
                    │  │  └─ DealCard × N (health color, amount, days)
                    │  └─ MoveStageSheet (bottom sheet for mobile)
                    └─ useDealHealth (time-in-stage algorithm)
```

## File Inventory (7 files)

### Frontend Components (5 files)
- `src/components/pipeline/PipelineBoard.tsx` — Root component with view toggle
- `src/components/pipeline/PipelineSummaryBar.tsx` — 3 metrics: total, count, forecast
- `src/components/pipeline/PipelineColumn.tsx` — Single stage column with deal cards
- `src/components/pipeline/DealCard.tsx` — Deal card with health indicator
- `src/components/pipeline/MoveStageSheet.tsx` — Bottom sheet for stage selection

### Frontend Hooks (2 files)
- `src/hooks/usePipelineData.ts` — Fetch deals, group by stage, calculate summary
- `src/hooks/useDealHealth.ts` — Time-in-stage health scoring algorithm

### Types (1 file)
- `src/types/pipeline.ts` — DealRecord, PipelineConfig, PipelineStage, PipelineSummary

## Dependencies

```json
{
  "@mui/material": "^5.x"
}
```

## Implementation Steps

### 1. Define types

```typescript
export interface PipelineConfig {
  model: string;              // VitalSync model name
  fields: string[];           // Fields to fetch
  stageField: string;         // Field holding stage value
  stages: { key: string; label: string; color: string }[];
  amountField?: string;       // Default: 'amount'
  avgDaysPerStage?: Record<string, number>;  // For health scoring
}

export interface DealRecord {
  id: string | number;
  name: string;
  stage: string;
  amount?: number;
  contact_name?: string;
  expected_close?: string;
  days_in_stage?: number;
  stage_entered_at?: string;
  [key: string]: unknown;
}

export interface PipelineStage {
  key: string;
  label: string;
  color: string;
  deals: DealRecord[];
  totalValue: number;
  count: number;
}

export interface PipelineSummary {
  totalValue: number;
  dealCount: number;
  weightedForecast: number;
  avgDaysToClose: number;
}
```

### 2. Create usePipelineData hook

```typescript
export function usePipelineData(config: PipelineConfig) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [summary, setSummary] = useState<PipelineSummary>({ totalValue: 0, dealCount: 0, weightedForecast: 0, avgDaysToClose: 0 });

  const refresh = useCallback(async () => {
    const raw = await plugin.switchTo(config.model)
      .query().select(config.fields)
      .fetchAllRecords().pipe(window.toMainInstance(true)).toPromise();
    const deals = convertRecords<DealRecord>(raw);

    // Group by stage
    const grouped = new Map<string, DealRecord[]>();
    config.stages.forEach(s => grouped.set(s.key, []));
    deals.forEach(d => {
      const stage = d[config.stageField] as string;
      if (grouped.has(stage)) grouped.get(stage)!.push(d);
    });

    // Build stages with totals
    const pipelineStages = config.stages.map(s => ({
      ...s,
      deals: grouped.get(s.key) || [],
      totalValue: (grouped.get(s.key) || []).reduce((sum, d) => sum + (d.amount || 0), 0),
      count: (grouped.get(s.key) || []).length,
    }));

    // Weighted forecast (later stages weighted higher)
    const totalStages = config.stages.length;
    const weightedForecast = pipelineStages.reduce((sum, stage, i) => {
      const weight = (i + 1) / totalStages;
      return sum + stage.totalValue * weight;
    }, 0);

    setStages(pipelineStages);
    setSummary({ totalValue: deals.reduce((s, d) => s + (d.amount || 0), 0), dealCount: deals.length, weightedForecast, avgDaysToClose: 0 });
  }, [config]);

  const moveDeal = async (dealId: string | number, newStage: string) => {
    // Optimistic update
    setStages(prev => /* move deal between stages */);
    // SDK mutation
    const mutation = plugin.switchTo(config.model).mutation();
    mutation.updateOne(String(dealId), { [config.stageField]: newStage });
    await mutation.execute(true).toPromise();
  };

  return { stages, summary, loading, error, refresh, moveDeal };
}
```

### 3. Create deal health scoring

```typescript
export function getDealHealth(deal: DealRecord, avgDaysPerStage?: Record<string, number>) {
  const daysInStage = deal.days_in_stage ?? 0;
  const avgDays = avgDaysPerStage?.[deal.stage] ?? 14;

  if (daysInStage >= avgDays * 2) return { color: '#f44336', label: 'At Risk' };    // Red
  if (daysInStage >= avgDays * 1.5) return { color: '#ff9800', label: 'Slow' };      // Yellow
  return { color: '#4caf50', label: 'On Track' };                                    // Green
}
```

### 4. Create components

**PipelineBoard:**
- View toggle: Kanban (horizontal columns) / List (vertical rows)
- Tap deal → opens MoveStageSheet (mobile) or detail view (desktop)

**PipelineColumn:**
- Fixed 260px width, horizontal scroll on parent
- Header: stage label + count + total value in stage color
- Scrollable deal card list

**DealCard:**
- Left border color = health indicator
- Shows: name, formatted amount, contact name, days-in-stage chip
- Health chip color matches border

**MoveStageSheet:**
- Bottom sheet dialog with stage list
- Color dots per stage, current stage disabled
- Tap to move → `moveDeal(dealId, newStage)`

**PipelineSummaryBar:**
- 3 metrics: Total Pipeline, Deals, Weighted Forecast
- Currency formatting: `>=1M` → "$X.XM", `>=1K` → "$X.XK"

## Example Usage

```tsx
const pipelineConfig: PipelineConfig = {
  model: 'Deal',
  fields: ['id', 'name', 'stage', 'amount', 'contact_name', 'expected_close', 'days_in_stage'],
  stageField: 'stage',
  stages: [
    { key: 'new', label: 'New', color: '#2196f3' },
    { key: 'contacted', label: 'Contacted', color: '#ff9800' },
    { key: 'qualified', label: 'Qualified', color: '#9c27b0' },
    { key: 'proposal', label: 'Proposal', color: '#f44336' },
    { key: 'won', label: 'Won', color: '#4caf50' },
  ],
  amountField: 'amount',
  avgDaysPerStage: { new: 3, contacted: 7, qualified: 14, proposal: 21 },
};

<PipelineBoard config={pipelineConfig} onDealTap={(deal) => navigate(`/deal/${deal.id}`)} />
```

## Gotchas & Lessons Learned

- **Horizontal scroll for Kanban** — use `overflow-x: auto` on parent container, fixed-width columns.
- **Optimistic stage moves** — update local state immediately, then execute mutation. Revert on failure.
- **Weighted forecast** — later stages get higher weight. Stage index / total stages as multiplier.
- **Health scoring thresholds** — 1.5x average = yellow, 2x average = red. Customize per client.
- **Mobile: MoveStageSheet** — bottom sheet is more touch-friendly than drag-and-drop on small screens.
- **Currency formatting** — use compact notation for summary bar (`$1.2M`, `$97K`), full format for deal cards.
