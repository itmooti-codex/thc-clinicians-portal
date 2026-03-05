# Buddzee Dashboard Builder — Feature Extraction Brief

> **Purpose:** This document captures every meaningful dashboard/widget/KPI feature and translates them into implementation-ready briefs for VibeCodeApps child apps. All AI-powered features (insights, metric generation, goal analysis) are delivered by **Buddzee** — see `buddzee-ai-assistant.md` for brand identity, voice guidelines, and system prompt template.
>
> We are extracting the *concepts and intent* so we can build them properly within our stack.

---

## Table of Contents

1. [Feature Overview & Priority Matrix](#1-feature-overview--priority-matrix)
2. [Dashboard Management System](#2-dashboard-management-system)
3. [Widget System & Chart Library](#3-widget-system--chart-library)
4. [Data Processing Pipeline](#4-data-processing-pipeline)
5. [Goal & KPI Tracking Engine](#5-goal--kpi-tracking-engine)
6. [AI-Powered Insights](#6-ai-powered-insights)
7. [Drag & Drop Widget Ordering](#7-drag--drop-widget-ordering)
8. [Period Management & Date Filtering](#8-period-management--date-filtering)
9. [Number Formatting Engine](#9-number-formatting-engine)
10. [Auto-Refresh & Real-Time Updates](#10-auto-refresh--real-time-updates)
11. [Widget Library & Templates](#11-widget-library--templates)
12. [Multi-Tenant Account Architecture](#12-multi-tenant-account-architecture)
13. [Custom Chart Builder (AI-Generated)](#13-custom-chart-builder-ai-generated)
14. [Integration Notes for VibeCodeApps](#14-integration-notes-for-vibecodeapps)

---

## 1. Feature Overview & Priority Matrix

| # | Feature | Difficulty | Value | Priority |
|---|---------|-----------|-------|----------|
| 1 | Dashboard Management (multi-dashboard, tabs) | Medium | High | P1 |
| 2 | Widget System (5 chart types) | Medium | High | P1 |
| 3 | Data Processing Pipeline (aggregation, gap-fill) | Medium | High | P1 |
| 4 | Goal & KPI Tracking | Hard | High | P1 |
| 5 | Period Management & Date Filtering | Easy | High | P1 |
| 6 | Number Formatting Engine | Easy | Medium | P1 |
| 7 | Drag & Drop Widget Ordering | Easy | Medium | P2 |
| 8 | AI-Powered Insights (per-widget + dashboard) | Medium | High | P2 |
| 9 | Auto-Refresh & Real-Time Updates | Easy | Medium | P2 |
| 10 | Widget Library & Templates | Medium | Medium | P2 |
| 11 | Custom Chart Builder (AI code gen) | Hard | Medium | P3 |
| 12 | Multi-Tenant Account Architecture | Medium | Low* | P3 |

**Difficulty scale:**
- **Easy** = 1–2 days, straightforward, mostly UI + state
- **Medium** = 3–5 days, requires data layer design and multiple components
- **Hard** = 1–2 weeks, complex logic, multiple subsystems, edge cases

\* Multi-tenant is low priority because VibeCodeApps already handles this via VitalSync's account/entity model.

---

## 2. Dashboard Management System

### What Buddzee Does
Users can create multiple dashboards, each acting as an independent workspace with its own collection of widgets. Dashboards appear as horizontal scrollable tabs at the top of the screen. Users can:
- Create, rename, and soft-delete dashboards
- Pin/unpin dashboards to control which appear in tabs
- Reorder tabs via drag
- Each dashboard stores its own set of global variables (date range filters)
- Dashboard configuration stored as JSON blob (layout settings, variable overrides)

### Concept & Intent
A dashboard is a *saved view* — a named container that groups related widgets together. Think of it like browser tabs for analytics. The user curates what they see by choosing which dashboards are pinned (visible) and which are hidden. Each dashboard can have its own time period context, so "Sales This Month" and "Marketing Last 30 Days" can coexist without conflicting.

### How to Build in VibeCodeApps

**Tech stack:** React + MUI + Zustand + VitalSync SDK

**Data model (MySQL via VitalSync):**
```
dashboards
├── id (INT, PK, auto-increment)
├── account_id (INT, FK)
├── user_id (INT, FK)
├── name (VARCHAR 255)
├── configuration (JSON) — layout prefs, variable overrides
├── sort_order (INT) — tab position
├── is_pinned (BOOLEAN, default true)
├── deleted_at (DATETIME, nullable) — soft delete
├── created_at (DATETIME)
└── updated_at (DATETIME)
```

**UI components:**
- `DashboardTabs` — MUI `Tabs` component (scrollable variant) across the top
- `DashboardManager` — Dialog for create/rename/delete/reorder
- Tab context menu (right-click or long-press on mobile) for pin/unpin/rename/delete

**State:** Zustand store with `dashboards[]`, `activeDashboardId`, and CRUD actions that sync to VitalSync.

**Key pattern:** Use VitalSync subscriptions to keep dashboard list in sync across browser tabs / devices. When a dashboard is updated or created on one device, the subscription pushes the change to all connected clients.

---

## 3. Widget System & Chart Library

### What Buddzee Does
Buddzee supports 5 chart types, each rendered differently:
1. **Line Chart** — Time series with optional trendline overlay
2. **Bar Chart** — Vertical bars with optional goal comparison coloring (green when goal met)
3. **Area Chart** — Filled line chart with gradient fill
4. **Gauge Chart** — Circular arc showing a single KPI value vs target, with delta indicator (▲/▼)
5. **Custom Chart** — User-defined Recharts code rendered in a WebView sandbox

Each widget has a rich configuration object (~40 fields) covering: data source, chart type, colors, aggregation method, date gap filling, formatting, goals, AI insights, refresh interval, and layout position.

### Concept & Intent
Widgets are the atomic unit of the dashboard. Each widget:
- Connects to one data source (a VitalSync query/PUID)
- Applies processing (aggregation, gap-fill, trendline)
- Renders as a specific chart type
- Can optionally overlay goal targets
- Can optionally generate AI insights about the data

The widget is self-contained — it knows how to fetch its own data, process it, and render it. The dashboard just arranges widgets in a grid.

### How to Build in VibeCodeApps

**Tech stack:** MUI X Charts Pro (line, bar, area, gauge) + React

**MUI X Charts Pro** is already in our stack and handles line, bar, area, pie, scatter, and gauge charts natively. This is a major advantage over Buddzee's hand-rolled SVG approach.

**Data model (MySQL via VitalSync):**
```
widgets
├── id (INT, PK)
├── dashboard_id (INT, FK)
├── account_id (INT, FK)
├── user_id (INT, FK)
├── name (VARCHAR 255)
├── chart_type (ENUM: 'line', 'bar', 'area', 'gauge', 'number', 'table')
├── configuration (JSON) — see below
├── sort_order (INT) — position in grid
├── col_span (INT, 1–4) — width in grid columns
├── is_template (BOOLEAN) — library item vs instance
├── deleted_at (DATETIME, nullable)
├── created_at (DATETIME)
└── updated_at (DATETIME)
```

**Widget configuration JSON shape:**
```json
{
  "dataSource": {
    "puid": "string",
    "variables": {},
    "limit": 1000
  },
  "axes": {
    "xKey": "string (auto-detected or manual)",
    "yKeys": ["string (supports multiple series)"]
  },
  "aggregation": {
    "method": "sum | mean | median | min | max | first | last",
    "frequency": "day | week | month | quarter | year"
  },
  "dateGaps": {
    "fill": true,
    "frequency": "day | week | month"
  },
  "formatting": {
    "style": "number | currency | percent",
    "notation": "standard | compact",
    "decimals": 2,
    "prefix": "",
    "suffix": ""
  },
  "visual": {
    "color": "#6366f1",
    "showTrendline": false,
    "showLegend": true
  },
  "goal": {
    "enabled": false,
    "kpiDefinitionId": null,
    "gaugeMin": 0,
    "gaugeMax": 100,
    "gaugeTarget": null
  },
  "ai": {
    "insightEnabled": false,
    "userContext": ""
  },
  "refresh": {
    "intervalSeconds": 0
  }
}
```

**UI components:**
- `ChartWidget` — Container component (card with header, chart, footer)
- `WidgetHeader` — Name, refresh button, settings gear, AI insight toggle
- `LineChart` / `BarChart` / `AreaChart` — Thin wrappers around `@mui/x-charts-pro`
- `GaugeWidget` — MUI X Gauge component with custom center label
- `NumberWidget` — Single big number with delta (not in Buddzee but a natural addition)
- `AddWidgetDialog` — Step wizard: pick data source → pick chart type → configure

**Why MUI X Charts Pro is better than Buddzee's approach:**
- Built-in responsive sizing (no manual SVG scaling)
- Built-in tooltips, legends, axis formatting
- Built-in animation
- TypeScript-native API
- Pro features: zoom, pan, reference lines (goal lines), click handlers
- No WebView needed for any standard chart

---

## 4. Data Processing Pipeline

### What Buddzee Does
Raw data from VitalStats queries goes through a processing pipeline before rendering:

1. **Axis Detection** — Scans the first data row to auto-detect which field is the X axis (looks for date-like fields) and which are Y axes (numeric fields)
2. **Multi-Source Merge** — If a widget references multiple PUIDs, fetches each and merges by common X axis
3. **Aggregation** — Rolls up data by frequency (day → week → month → year) using 7 methods: sum, mean, median, min, max, first, last
4. **Date Gap Filling** — Inserts zero-value rows for missing dates so charts don't show misleading jumps
5. **Trendline Calculation** — Linear regression over the dataset to show direction
6. **Goal Injection** — Overlays daily/aggregated target values from KPI definitions
7. **iOS-Safe Date Parsing** — Handles multiple date formats (YYYY, YYYY-MM, YYYY-MM-DD)

### Concept & Intent
The pipeline transforms raw query results into chart-ready data. The key insight is that *most business data has gaps and inconsistencies* — missing dates, varying granularity, no aggregation. The pipeline normalizes everything so every chart gets clean, consistent data regardless of what the raw query returns.

### How to Build in VibeCodeApps

**Implementation:** A utility module `src/utils/data-processing.ts` with pure functions.

```typescript
// Pipeline entry point
function processWidgetData(
  rawData: Record<string, unknown>[],
  config: WidgetConfiguration
): ProcessedData {
  let data = rawData;
  data = detectAndNormalizeAxes(data, config.axes);
  data = aggregate(data, config.aggregation);
  data = fillDateGaps(data, config.dateGaps);
  const trendline = config.visual.showTrendline
    ? calculateTrendline(data, config.axes.xKey, config.axes.yKeys[0])
    : undefined;
  return { data, trendline };
}
```

**Key functions to implement:**

| Function | What it does | Complexity |
|----------|-------------|------------|
| `detectAxes(row)` | Finds date-like field → X, numeric fields → Y | Easy |
| `aggregate(data, method, freq)` | Groups by time bucket, applies aggregation | Medium |
| `fillDateGaps(data, freq)` | Inserts missing date rows with zero values | Medium |
| `calculateTrendline(data, xKey, yKey)` | Linear regression → array of {x, y} points | Easy |
| `mergeMultiSource(datasets[], xKey)` | Left-joins datasets on common X axis | Medium |
| `formatValue(value, config)` | Applies number formatting (see section 9) | Easy |

**Important:** All date handling should use `dayjs` (already common in MUI). Buddzee had to write custom iOS-safe date parsing — we won't need that since we're web-first with Capacitor.

---

## 5. Goal & KPI Tracking Engine

### What Buddzee Does
This is Buddzee's most sophisticated feature. It provides a full goal management system:

**Goal Distribution Types:**
- **Fixed** — Equal daily targets (annual goal ÷ 365)
- **Linear** — Gradually increasing or decreasing daily targets
- **Seasonal** — Monthly weighting profiles (e.g., December gets 15% of annual goal, February gets 5%)

**Goal Processing:**
- Generates a *daily target vector* — an array of expected values for every day of the goal period
- Dynamically adjusts targets when the user changes the date range filter
- Overlays goal lines on line/bar charts
- Shows goal attainment as a gauge (current value vs target)
- Color-codes data points: green when goal is met, default color when not

**Forecasting Engine:**
- Linear regression on actual data to predict future values
- Calculates *velocity* — current rate vs required rate to hit goal
- Confidence scoring: safe (on track), risk (behind but recoverable), critical (unlikely to meet)
- Predicts end-of-period attainment percentage

**Composite KPIs:**
- Parent/child hierarchy — a parent KPI rolls up child KPIs
- Rollup methods: sum, average, min, max
- Enables team-level goals built from individual goals

**Automation Rules:**
- Trigger webhooks when goal events occur (met, at risk, etc.)
- Business justification tracking — attach reasoning to goals
- Owner assignment — link goals to specific users

### Concept & Intent
Goals turn passive dashboards into active performance management tools. Without goals, a chart just shows "what happened." With goals, it shows "are we on track?" The forecasting adds "will we make it?" — which is the question every manager actually cares about.

The seasonal distribution is particularly clever — it acknowledges that business isn't linear. Retail peaks in December, B2B SaaS peaks in Q4 for enterprise renewals. Fixed daily targets are naive; seasonal weighting makes goals realistic.

### How to Build in VibeCodeApps

**Difficulty: Hard — but high value. This is the feature that transforms a dashboard from "nice to have" into a daily driver.**

**Data model:**
```
kpi_definitions
├── id (INT, PK)
├── account_id (INT, FK)
├── name (VARCHAR 255)
├── description (TEXT)
├── owner_user_id (INT, FK, nullable)
├── parent_kpi_id (INT, FK, nullable) — for composite KPIs
├── rollup_method (ENUM: 'sum', 'avg', 'min', 'max', nullable)
├── configuration (JSON) — see below
├── created_at (DATETIME)
└── updated_at (DATETIME)

kpi_widget_links
├── id (INT, PK)
├── kpi_definition_id (INT, FK)
├── widget_id (INT, FK)
└── created_at (DATETIME)
```

**KPI configuration JSON:**
```json
{
  "goalType": "fixed | linear | seasonal",
  "annualTarget": 1000000,
  "periodStart": "2025-01-01",
  "periodEnd": "2025-12-31",
  "direction": "increase | decrease",
  "seasonalWeights": {
    "jan": 0.06, "feb": 0.05, "mar": 0.07,
    "apr": 0.08, "may": 0.08, "jun": 0.09,
    "jul": 0.08, "aug": 0.08, "sep": 0.09,
    "oct": 0.10, "nov": 0.10, "dec": 0.12
  },
  "forecast": {
    "enabled": true,
    "confidenceThresholds": {
      "safe": 0.90,
      "risk": 0.70
    }
  },
  "conditionalColors": {
    "met": "#22c55e",
    "notMet": "#ef4444",
    "atRisk": "#f59e0b"
  }
}
```

**Implementation approach:**
1. **Goal Processing utility** (`src/utils/goal-processing.ts`) — pure functions for daily target vector generation, forecast calculation, velocity tracking
2. **KPI Manager component** — CRUD UI for creating/editing KPI definitions
3. **Goal overlay integration** — Reference lines on MUI X Charts (built-in feature via `referenceLinePlugin`)
4. **Gauge widget** — MUI X Gauge with custom center content showing value + delta
5. **Forecast badge** — Small chip on widget header showing "On Track" / "At Risk" / "Critical"

**MUI X Charts Pro advantage:** Reference lines are a built-in feature. Adding a goal line to any chart is a single prop:
```tsx
<BarChart
  series={[...]}
  xAxis={[...]}
  // Built-in goal line support
  plugins={[referenceLinePlugin]}
  referenceLines={[{ y: goalValue, label: 'Goal', color: '#94a3b8', lineStyle: 'dashed' }]}
/>
```

---

## 6. AI-Powered Insights

### What Buddzee Does
Buddzee uses Google Gemini for several AI features:

1. **Per-Widget Insights** — User clicks an AI button on a widget, the system sends the widget's data + user context to Gemini and gets back a 3-sentence business analysis (trend, significance, recommendation)
2. **Dashboard Summary** — Analyzes all widgets on a dashboard together to find cross-metric patterns
3. **Widget Suggestions** — Given a data source, AI recommends which chart type would best visualize it
4. **Goal Auditing** — AI evaluates whether a KPI definition is well-structured and scores it

### Concept & Intent
AI insights answer "so what?" after the chart answers "what happened?" The per-widget insight is the most immediately useful — it turns a chart that shows declining revenue into actionable text like "Revenue declined 12% week-over-week, driven primarily by a drop in enterprise deals. Consider reviewing the Q4 pipeline and scheduling a forecast review with the sales team."

The dashboard summary is even more powerful — it can spot correlations humans miss: "While marketing spend increased 20%, lead quality (as measured by SQL conversion rate) decreased. The additional spend may be attracting lower-quality leads."

### How to Build in VibeCodeApps

**Tech stack:** n8n workflow (AI agent) + n8n chat widget or direct API call

**This maps perfectly to our existing AI Chat Agent feature pattern.** The implementation is:

1. **n8n workflow** with an AI agent node (Claude) that receives widget data + context
2. **System prompt** tailored for business analytics interpretation
3. **Triggered via** either:
   - The existing n8n chat widget (conversational)
   - A direct HTTP POST from the app (one-shot insight)

**Per-widget insight flow:**
```
User clicks "Insight" button on widget
  → App sends POST to n8n webhook:
    {
      widgetName: "Monthly Revenue",
      chartType: "bar",
      data: [...last 30 data points...],
      userContext: "B2B SaaS, enterprise segment",
      question: "Analyze this data and provide a 3-sentence business insight"
    }
  → n8n AI agent processes with Claude
  → Returns 3-sentence insight
  → App displays in a collapsible panel below the chart
```

**Dashboard summary flow:**
```
User clicks "Summarize Dashboard" button
  → App collects summary stats from all widgets (name, type, latest value, trend direction, % change)
  → Sends to n8n webhook as a single payload
  → Claude analyzes cross-metric patterns
  → Returns 1-paragraph summary
  → App displays in a dialog or banner
```

**Difficulty: Medium — mostly integration work since we already have the n8n AI agent pattern.**

**Important:** Use Claude (via n8n's Anthropic node) instead of Gemini. Better at structured business analysis and follows system prompts more reliably.

---

## 7. Drag & Drop Widget Ordering

### What Buddzee Does
Widgets can be reordered via drag & drop using `react-native-draggable-flatlist`. On mobile, this is a single-column vertical list. When a widget is dropped in a new position, the `sort_order` (called `row` in Buddzee) is updated for all affected widgets.

### Concept & Intent
Users want to put their most important widgets at the top. Drag & drop is the most intuitive way to reorder. On desktop, this extends to a grid layout where widgets can be placed in specific columns.

### How to Build in VibeCodeApps

**Tech stack:** Built-in HTML5 drag & drop or a lightweight library

**For React web apps:**
- Use `@dnd-kit/core` + `@dnd-kit/sortable` — the modern React DnD library
- Or use MUI's built-in `DataGrid` reordering for table-based layouts
- For a simple vertical reorder: even a basic sortable list with grip handles works

**For Capacitor mobile:**
- `@dnd-kit` works on touch devices out of the box
- Long-press to initiate drag (standard mobile pattern)

**Implementation:**
```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

function WidgetGrid({ widgets, onReorder }) {
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgets} strategy={verticalListSortingStrategy}>
        {widgets.map(widget => (
          <SortableWidget key={widget.id} widget={widget} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

**On drag end:** Update `sort_order` for affected widgets via VitalSync mutation, then re-fetch.

**Difficulty: Easy — well-solved problem with mature libraries.**

---

## 8. Period Management & Date Filtering

### What Buddzee Does
A global date range filter applies to all widgets on a dashboard. The system uses "period presets" — predefined date ranges calculated as day offsets from today:

| Preset | Offset Start | Offset End |
|--------|-------------|-----------|
| Today | 0 | 0 |
| Last 7 Days | -6 | 0 |
| Last 30 Days | -29 | 0 |
| This Month | first of month | 0 |
| Last Month | first of prev month | last of prev month |
| This Year | Jan 1 | 0 |

The selected period is stored as two dashboard variables (`X_DAY_BEGIN`, `X_DAY_END`) that get injected into every VitalSync query as parameters.

### Concept & Intent
Date filtering is the #1 interaction on any analytics dashboard. Users constantly switch between "how did we do today?" and "how's this month going?" The preset system makes this a single tap instead of picking two dates from a calendar.

The variable injection pattern is key: the dashboard doesn't re-configure each widget when the period changes — it just updates two global variables, and every widget's query automatically picks up the new values on its next fetch.

### How to Build in VibeCodeApps

**Tech stack:** MUI `ToggleButtonGroup` or `Select` + dayjs

**UI:** A period picker in the dashboard header. Options:
- Toggle buttons for quick presets (Today / 7D / 30D / MTD / YTD)
- "Custom" option that opens an MUI `DateRangePicker`

**State:** Store in the dashboard's Zustand slice:
```typescript
interface DashboardState {
  activePeriod: PeriodPreset | 'custom';
  dateRange: { start: string; end: string }; // ISO dates
}
```

**Variable injection:** When fetching widget data via VitalSync SDK:
```typescript
const result = await vs.query(widget.dataSource.puid, {
  variables: {
    X_DAY_BEGIN: dashboardState.dateRange.start,
    X_DAY_END: dashboardState.dateRange.end,
    ...widget.dataSource.variables // widget-specific overrides
  },
  limit: widget.dataSource.limit
});
```

**Difficulty: Easy — mostly UI work. The variable injection pattern already exists in VitalSync SDK.**

---

## 9. Number Formatting Engine

### What Buddzee Does
A configurable formatter that handles:
- **Styles:** number (1,234), currency ($1,234.00), percent (45.6%)
- **Notation:** standard (1,234,567) vs compact (1.2M)
- **Decimals:** configurable precision (0–4)
- **Prefix/Suffix:** custom symbols before/after the number (e.g., "AUD ", " units")

Uses `Intl.NumberFormat` with fallbacks for environments that don't support it.

### Concept & Intent
Raw numbers are meaningless without formatting. "1234567.89" means nothing — "$1.2M" tells a story. Every widget needs formatting configured per-metric: revenue is currency, conversion rate is percent, headcount is a plain number.

### How to Build in VibeCodeApps

**Implementation:** A single utility function, ~30 lines:

```typescript
function formatValue(
  value: number,
  config: {
    style?: 'number' | 'currency' | 'percent';
    notation?: 'standard' | 'compact';
    decimals?: number;
    prefix?: string;
    suffix?: string;
    currency?: string;
  }
): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: config.style === 'currency' ? 'currency' : config.style === 'percent' ? 'percent' : 'decimal',
    currency: config.currency || 'USD',
    notation: config.notation || 'standard',
    minimumFractionDigits: config.decimals ?? 0,
    maximumFractionDigits: config.decimals ?? 2,
  }).format(config.style === 'percent' ? value / 100 : value);

  return `${config.prefix || ''}${formatted}${config.suffix || ''}`;
}
```

**Also apply to:** MUI X Charts axis labels and tooltips via the `valueFormatter` prop.

**Difficulty: Easy — `Intl.NumberFormat` does the heavy lifting.**

---

## 10. Auto-Refresh & Real-Time Updates

### What Buddzee Does
Each widget can have a `refreshInterval` (in seconds). When set, the widget automatically re-fetches its data on that interval. Buddzee uses `setTimeout` (not `setInterval`) for iOS safety, clearing timers on tab change to prevent memory leaks.

There's also a manual refresh — per-widget (refresh button) and per-dashboard (refresh all widgets).

### Concept & Intent
Dashboards displayed on a wall monitor or left open all day need auto-refresh. A sales dashboard might refresh every 60 seconds to show live numbers. A monthly report dashboard might refresh every 5 minutes or not at all.

### How to Build in VibeCodeApps

**Tech stack:** TanStack Query (already in our stack) handles this natively.

```typescript
const { data } = useQuery({
  queryKey: ['widget-data', widget.id, dateRange],
  queryFn: () => fetchWidgetData(widget),
  refetchInterval: widget.configuration.refresh.intervalSeconds * 1000 || false,
  refetchIntervalInBackground: false, // pause when tab not visible
});
```

**TanStack Query advantages over Buddzee's manual approach:**
- Automatic cache management
- Background refetch indicators (stale data shown while refreshing)
- Automatic cleanup on unmount (no manual timer clearing)
- `refetchIntervalInBackground: false` prevents wasted API calls
- Built-in retry logic

**Manual refresh:** Just call `queryClient.invalidateQueries({ queryKey: ['widget-data'] })` to refresh all, or `queryClient.invalidateQueries({ queryKey: ['widget-data', widgetId] })` for one.

**Difficulty: Easy — TanStack Query makes this trivial.**

---

## 11. Widget Library & Templates

### What Buddzee Does
Widgets can be saved as templates (`is_template: true`). When a user places a template widget on a dashboard, a new instance is created (cloned). This lets organizations create a shared library of pre-configured chart widgets that any user can add to their dashboards.

Templates are account-scoped — all users in an organization can access the same library.

### Concept & Intent
Without a library, every user has to configure every widget from scratch. With a library, an admin creates "Monthly Revenue" once with the right data source, chart type, formatting, and goals. Then any user can add it to their dashboard in one click.

This is particularly powerful for onboarding — new users get a library of pre-built widgets and just pick the ones relevant to their role.

### How to Build in VibeCodeApps

**Data model:** Already covered in the widgets table (the `is_template` flag).

**UI components:**
- `WidgetLibrary` dialog — grid of template cards with preview thumbnails, name, description
- "Add to Dashboard" button on each card → clones template into a new widget instance linked to the active dashboard
- "Save as Template" option in widget settings → creates a template from an existing widget

**Admin flow:**
1. Admin creates a widget on their dashboard
2. Configures it fully (data source, chart type, formatting, goals)
3. Clicks "Save to Library" → saves as template
4. Other users browse library → click "Add" → clone appears on their dashboard

**Difficulty: Medium — the cloning logic and library UI need careful design, but it's standard CRUD.**

---

## 12. Multi-Tenant Account Architecture

### What Buddzee Does
Buddzee uses a Supabase-backed multi-tenant model:
- **Accounts** (organizations) have branding (logo, colors), timezone, and VitalStats API credentials
- **Profiles** (users) belong to an account
- **All data** (dashboards, widgets, KPIs) is scoped to an account
- Row-Level Security ensures users only see their account's data

### Concept & Intent
Multi-tenancy allows one app deployment to serve many organizations, each with their own data, branding, and configuration. Each organization's users only see their own data.

### How to Build in VibeCodeApps

**This is largely already handled by VitalSync's entity model.** VitalSync queries are already scoped by entity/account, so data isolation is built in.

**What we might add:**
- Account-level settings table for storing dashboard preferences, branding overrides, feature flags
- Per-account widget library (templates scoped to account)

**Difficulty: Low additional work — VitalSync already provides the multi-tenant data layer.**

---

## 13. Custom Chart Builder (AI-Generated)

### What Buddzee Does
Users can describe a chart in natural language, and Gemini generates Recharts JSX code that gets rendered in a WebView. Users can also modify existing custom charts by describing changes ("make it a stacked bar chart", "add a second Y axis").

### Concept & Intent
This is an escape hatch for when the standard chart types don't cover a specific visualization need. Instead of building every possible chart variant, let AI generate one-off custom charts.

### How to Build in VibeCodeApps

**Assessment: This is a P3 feature. The complexity and security implications of rendering AI-generated code are significant, and MUI X Charts Pro covers the vast majority of chart needs.**

**If we do build it:**
- Use an n8n AI agent to generate MUI X Charts Pro configuration (not raw code)
- The AI returns a JSON config object, not executable code
- The app renders the config through standard MUI components
- This is safer than Buddzee's WebView approach and stays within our stack

**Alternative approach (recommended):**
Instead of AI-generated code, build a **chart configurator wizard** — a UI that lets users pick chart type, axes, series, colors, and aggregation. This gives the same flexibility without the security risk of code execution.

**Difficulty: Hard if doing AI code gen. Medium if doing a configurator wizard.**

---

## 14. Integration Notes for VibeCodeApps

### Stack Mapping (Buddzee → VibeCodeApps)

| Buddzee Component | VibeCodeApps Equivalent |
|-------------------|------------------------|
| React Native + Expo | React + Vite + Capacitor |
| Supabase (Postgres) | MySQL via VitalSync |
| react-native-svg (charts) | MUI X Charts Pro |
| @shopify/react-native-skia (gauge) | MUI X Gauge |
| react-native-draggable-flatlist | @dnd-kit/sortable |
| AsyncStorage | localStorage / Capacitor Preferences |
| Google Gemini (AI) | Claude via n8n AI agent |
| Supabase Auth | JWT auth via Express backend |
| Supabase Realtime | VitalSync subscriptions |
| react-native-reanimated | Framer Motion |
| react-native-gesture-handler | Native browser events / Capacitor |

### What We Get for Free (Already in VibeCodeApps Stack)

1. **MUI X Charts Pro** — Line, bar, area, gauge, pie, scatter with tooltips, legends, animations, reference lines, zoom
2. **TanStack Query** — Auto-refresh, caching, background refetch, retry logic
3. **VitalSync SDK** — Data fetching, subscriptions, real-time sync, query variables
4. **n8n AI Agent** — Claude-powered insights (better than Gemini)
5. **Zustand** — Clean state management with no boilerplate
6. **Framer Motion** — Smooth animations for drag, transitions, loading states
7. **JWT Auth** — Already in the mobile app template
8. **Docker + CI/CD** — Already configured for deployment

### Suggested Build Order

**Phase 1 — Core Dashboard (1–2 weeks)**
1. Period management & date filtering
2. Number formatting engine
3. Data processing pipeline (aggregation, gap-fill)
4. Widget system with 4 chart types (line, bar, area, gauge)
5. Dashboard management (tabs, CRUD)
6. Drag & drop widget ordering

**Phase 2 — Intelligence Layer (1–2 weeks)**
7. Goal & KPI tracking engine
8. AI-powered insights (per-widget + dashboard summary)
9. Auto-refresh via TanStack Query
10. Widget library & templates

**Phase 3 — Advanced (if needed)**
11. Custom chart configurator wizard
12. Composite KPIs with rollups
13. Forecasting engine with confidence scoring
14. Automation rules (webhook triggers on goal events)

### Files to Create in a Child App

```
src/
├── components/
│   ├── dashboard/
│   │   ├── DashboardTabs.tsx
│   │   ├── DashboardHeader.tsx
│   │   ├── PeriodPicker.tsx
│   │   └── WidgetGrid.tsx
│   ├── widgets/
│   │   ├── ChartWidget.tsx
│   │   ├── WidgetHeader.tsx
│   │   ├── LineChart.tsx
│   │   ├── BarChart.tsx
│   │   ├── AreaChart.tsx
│   │   ├── GaugeWidget.tsx
│   │   └── NumberWidget.tsx
│   └── dialogs/
│       ├── AddWidgetDialog.tsx
│       ├── WidgetSettingsDialog.tsx
│       ├── KpiManagerDialog.tsx
│       └── WidgetLibraryDialog.tsx
├── hooks/
│   ├── useDashboard.ts
│   ├── useWidgetData.ts
│   └── useKpi.ts
├── stores/
│   └── dashboardStore.ts
├── utils/
│   ├── data-processing.ts
│   ├── goal-processing.ts
│   ├── formatting.ts
│   └── period-presets.ts
└── types/
    └── dashboard.ts
```

---

## Summary

Buddzee is a capable mobile BI platform with strong features in dashboard management, charting, KPI tracking, and AI insights. The good news is that **our VibeCodeApps stack is better suited for most of these features** — MUI X Charts Pro, TanStack Query, and VitalSync SDK provide higher-quality foundations than Buddzee's hand-rolled equivalents.

The highest-value features to port are:
1. **Goal & KPI Tracking** — transforms dashboards from passive displays into active performance tools
2. **AI Insights** — answers "so what?" after charts answer "what happened?"
3. **Period Management** — the #1 daily interaction for dashboard users

The lowest-effort, highest-impact starting point is **Period Management + Number Formatting + Basic Charts** — this gives users a functional dashboard in days, not weeks.
