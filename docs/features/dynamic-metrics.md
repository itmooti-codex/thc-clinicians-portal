# Buddzee Dynamic Metrics System

> Buddzee-powered metric creation. Users describe metrics in plain English, Buddzee generates a structured QueryConfig, and the frontend executes it live against VitalSync GraphQL. See `buddzee-ai-assistant.md` for Buddzee's brand identity.

Reusable architecture built in phyx-nurse-admin. When creating a metric, show "Buddzee is creating your metric..." with the Buddzee thinking animation.

## Architecture Flow
```
User describes metric to Buddzee → POST /api/metrics/generate → Backend sends condensed schema + description to Claude API
→ Claude returns QueryConfig JSON → Backend validates against schema → User previews + picks color/title
→ POST /api/metrics (saved to DB) → Auto-added to user's dashboard → Frontend renders via useDynamicMetric hook
```

## 16 Files (copy all to reuse)

### Backend (6 files)
- `server/src/seed.ts` — 3 tables: `metric_definitions`, `user_dashboard_metrics`, `metric_generation_log` + 7 seed metrics
- `server/src/routes/metrics.ts` — 8 REST endpoints for library CRUD, dashboard mgmt, AI generation
- `server/src/lib/anthropic.ts` — Claude API client + system prompt with schema context, examples, aggregation types
- `server/src/lib/schema-context.ts` — Reads `schema/schema-reference.json`, builds condensed ~3-4KB schema for AI prompt
- `server/src/lib/validate-metric-config.ts` — Validates AI-generated QueryConfig against schema
- `server/src/index.ts` — Mount: `app.use('/api/metrics', metricsRoutes)`

### Frontend Hooks (3 files)
- `src/hooks/useMetrics.ts` — Shared: `gqlFetch`, `getDateBounds`, `bucketCounts`, `bucketRevenue`, `DATE_RANGE_OPTIONS`
- `src/hooks/useDynamicMetric.ts` — Core engine: QueryConfig + date range → executes GraphQL, buckets results, returns {total, trend[], labels[]}
- `src/hooks/useMetricLibrary.ts` — React Query hooks for all 8 API endpoints

### Frontend Components (7 files)
- `src/components/metrics/MetricCard.tsx` — Base card: value, title, sparkline, color accent
- `src/components/metrics/DynamicMetricCard.tsx` — Wrapper: useDynamicMetric → MetricCard
- `src/components/metrics/MetricsDashboard.tsx` — Full page with date range selector, grid of cards, detail dialog
- `src/components/metrics/MetricLibraryDialog.tsx` — 3-tab dialog: My Dashboard / Library / Create New (AI)
- `src/components/metrics/MetricEditDialog.tsx` — Edit title/color/description; description change triggers AI re-gen
- `src/components/metrics/ColorPicker.tsx` — 9 preset color circles
- `src/components/home/CompactMetricsRow.tsx` — Compact metrics for home page (3-col desktop, 2-col mobile)

## Core Types

### QueryConfig (heart of the system)
```typescript
interface QueryConfig {
  model: string;                // 'Contact', 'Purchase', etc.
  rootField: string;            // 'calcContacts', 'calcPurchases', etc.
  timestampField: string;       // 'date_applied', 'created_at', etc.
  selectedFields: string[];     // Fields to fetch from GraphQL
  filters: Array<{ field: string; operator: string; value: string | number | boolean }>;
  aggregation: 'count' | 'sum' | 'avg' | 'median' | 'min' | 'max' | 'conversion_rate';
  sumField: string | null;      // Required for sum/avg/median/min/max
  conversionField: string | null; // Required for conversion_rate
  postFilter: { field: string; operator: string; value: string | number | boolean } | null;
  valueFormat: 'number' | 'currency' | 'percentage';
}
```

### MetricResult (from useDynamicMetric)
```typescript
interface MetricResult {
  total: number;
  trend: number[];    // Values per time bucket
  labels: string[];   // Matching labels ("Mon", "Tue", ...)
  isLoading: boolean;
  error: Error | null;
}
```

## Database Tables
- `metric_definitions` — shared library (slug, title, description, color, query_config JSON, ai_explanation, is_recommended, is_default, created_by)
- `user_dashboard_metrics` — per-user dashboard (user_id, metric_id, sort_order, UNIQUE user+metric)
- `metric_generation_log` — audit trail (user_prompt, ai_response JSON, success, error_message)

## 8 API Endpoints
- `GET /api/metrics/library` — all metrics + on_dashboard flag
- `GET /api/metrics/dashboard` — user's metrics (auto-seeds 3 defaults on first call)
- `POST /api/metrics/generate` — AI preview (not saved)
- `POST /api/metrics` — create + auto-add to dashboard
- `PATCH /api/metrics/:id` — edit (description change → AI re-gen)
- `DELETE /api/metrics/:id` — delete (blocks defaults)
- `POST /api/metrics/dashboard/add` — add library metric to dashboard
- `DELETE /api/metrics/dashboard/:metricId` — remove from dashboard
- `PATCH /api/metrics/dashboard/reorder` — reorder: {metricIds: number[]}

## useDynamicMetric Engine
1. Build GraphQL query from QueryConfig (rootField, date range, filters, fields)
2. Fetch rows via gqlFetch (VitalSync SDK, runs in browser)
3. Apply postFilter client-side if present
4. Route to aggregation: count→bucketCounts, sum→bucketRevenue, avg/median/min/max→bucketAggregate, conversion_rate→% of non-null
5. Return {total, trend[], labels[]}

### Bucketing by date range
- Today/Yesterday → hourly (24 labels)
- 7 days/This month/Last month → daily
- Financial year → monthly (Australian FY, July start)

## AI Prompt Design (anthropic.ts)
1. Role: "metrics configuration generator"
2. Condensed schema (~3-4KB): models, root fields, fields grouped by type
3. GraphQL pattern: query array, where/andWhere, _OPERATOR_ syntax, field(arg: [...])
4. 7 aggregation types with guidance
5. 10 rules: timestamp field required, exact enum values, filters vs postFilter, confidence scoring
6. 6 few-shot examples
7. Strict JSON response format

## Validation Pipeline (backend, post-AI)
1. Parse JSON (strip markdown fences)
2. Validate model exists in schema
3. Validate rootField matches (auto-correct if wrong)
4. Validate aggregation type
5. Validate timestampField is type `ts`
6. Validate selectedFields exist
7. Validate sumField is numeric/currency
8. Validate conversionField exists
9. Validate enum filter values match schema exactly
10. Confidence warning if < 0.7

## Key Decisions
- GraphQL runs in browser (VitalSync SDK), NOT proxied through backend
- postFilter exists because some filters need client-side (e.g. filter by field you're summing)
- Slug auto-generated from title + timestamp
- First GET /dashboard auto-seeds 3 default metrics
- Schema context cached in memory on backend
- Compact formatting on cards ($97K), full in tooltips ($96,969.78)
- Description edit triggers AI re-generation

## Dependencies
- Backend: `@anthropic-ai/sdk`, existing express + mysql2 stack
- Frontend: `@mui/x-charts-pro` (SparkLineChart + LineChart), `@tanstack/react-query`, VitalSync SDK (CDN)

## To Reuse in Another App
1. Copy all 16 files
2. Update `schema-context.ts` to read that app's `schema-reference.json`
3. Update seed data with app-specific defaults
4. Update AI prompt examples for new domain
5. Ensure VitalSync SDK loaded (CDN script tag)
6. Mount metrics route in Express app
7. Run seed for 3 database tables
8. Add `ANTHROPIC_API_KEY` to backend `.env`
