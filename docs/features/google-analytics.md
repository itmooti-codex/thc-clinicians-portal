# Google Analytics Integration — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Server-side Google Analytics 4 Data API integration with 5 Buddzee AI tools for website analytics. Users configure their GA4 Property ID and service account credentials in Settings, then ask Buddzee questions like "How's the website doing?" or "Are there any problems?" The tools provide analytics overview, top pages, traffic sources, site health checks, and visitor demographics.

## Architecture

- **Backend only:** GA4 Data API called from Express server (service account auth)
- **Cached client:** `BetaAnalyticsDataClient` cached and reused across requests
- **5 AI tools:** Registered in tool registry, exposed to Buddzee for natural language queries
- **Settings integration:** Property ID and credentials configured via Settings → Integrations

```
User asks Buddzee → AI selects GA tool → Backend GA client → GA4 Data API → formatted response
Settings → ga4_property_id + credentials → encrypted in app_settings table
```

## File Inventory (3 files)

### Backend (2 files)
- `server/src/lib/ga-client.ts` — GA4 Data API client with caching and report helper
- `server/src/lib/tools/ga-tools.ts` — 5 Buddzee AI tool definitions

### Frontend (1 file)
- `src/components/settings/IntegrationSettings.tsx` — GA4 configuration section (shared with other integrations)

## Dependencies

```json
{
  "@google-analytics/data": "^4.x"
}
```

## Environment Variables

```bash
# Can be set in .env OR configured in Settings UI (DB takes priority)
GA4_PROPERTY_ID=properties/123456789
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"..."}
```

## Implementation Steps

### 1. Create GA4 client

**`server/src/lib/ga-client.ts`:**
```typescript
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getGA4Config } from './settings';

let cachedClient: BetaAnalyticsDataClient | null = null;
let cachedCredentialsHash: string | null = null;

export async function getGA4Client(): Promise<{ client: BetaAnalyticsDataClient; propertyId: string } | null> {
  const config = await getGA4Config();
  if (!config) return null;

  const hash = config.credentialsJson.slice(0, 50);
  if (cachedClient && cachedCredentialsHash === hash) {
    return { client: cachedClient, propertyId: config.propertyId };
  }

  const credentials = JSON.parse(config.credentialsJson);
  cachedClient = new BetaAnalyticsDataClient({ credentials });
  cachedCredentialsHash = hash;
  return { client: cachedClient, propertyId: config.propertyId };
}

export function resetGA4Client(): void {
  cachedClient = null;
  cachedCredentialsHash = null;
}

export async function runGA4Report(params: GA4ReportParams): Promise<GA4ReportResult> {
  const ga = await getGA4Client();
  if (!ga) throw new Error('GA4 not configured');

  const [response] = await ga.client.runReport({
    property: ga.propertyId,
    dateRanges: [params.dateRange, ...(params.compareDateRange ? [params.compareDateRange] : [])],
    dimensions: params.dimensions?.map(d => ({ name: d })),
    metrics: params.metrics.map(m => ({ name: m })),
    dimensionFilter: params.dimensionFilter ? {
      filter: { fieldName: params.dimensionFilter.fieldName, stringFilter: params.dimensionFilter.stringFilter }
    } : undefined,
    orderBys: params.orderBys?.map(o => ({
      metric: o.metric ? { metricName: o.metric.metricName } : undefined,
      dimension: o.dimension ? { dimensionName: o.dimension.dimensionName } : undefined,
      desc: o.desc ?? true,
    })),
    limit: params.limit,
  });

  // Parse rows, handling comparison de-interleaving
  return parseGA4Response(response, params);
}
```

### 2. Create 5 AI tools

**`server/src/lib/tools/ga-tools.ts`:**

**Tool 1: `ga_analytics_overview`**
- Params: `date_range?: '7d' | '28d' | '90d'` (default: `'28d'`)
- Metrics: activeUsers, sessions, screenPageViews, bounceRate, averageSessionDuration, newUsers
- Compares to previous period (e.g., last 28d vs 28d before that)
- Returns: overview object with value + change percentage per metric

**Tool 2: `ga_top_pages`**
- Params: `date_range?`, `limit?` (max 50), `order_by?: 'views' | 'users' | 'bounce_rate'`
- Dimensions: pagePath, pageTitle
- Returns: pages array with path, title, views, users, bounceRate, avgDuration

**Tool 3: `ga_traffic_sources`**
- Params: `date_range?`, `limit?` (max 50)
- Dimensions: sessionSource, sessionMedium
- Returns: sources array with source, medium, sessions, users, bounceRate

**Tool 4: `ga_site_health`**
- No params — runs 3 automated health checks:
  1. **404 pages** (last 7d): pageTitle CONTAINS '404', >10 views = critical
  2. **High bounce pages** (last 28d): bounceRate >80% with min 10 views
  3. **Traffic drop** (this week vs last week): >20% drop = warning, >50% = critical
- Returns: issues array with severity, issue, detail, recommendation

**Tool 5: `ga_user_demographics`**
- Params: `dimension?: 'country' | 'device' | 'browser' | 'os' | 'city'`, `date_range?`, `limit?`
- Returns: entries array with name, users, sessions, percentage

**Helper — percent change:**
```typescript
function pctChange(current: string, previous: string): string {
  const curr = parseFloat(current);
  const prev = parseFloat(previous);
  if (prev === 0) return curr > 0 ? '+100%' : '0%';
  const change = ((curr - prev) / prev) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}
```

### 3. Register tools

Add to tool registry alongside other Buddzee tools:

```typescript
import { gaTools } from './tools/ga-tools';
const allTools = [...existingTools, ...gaTools];
```

### 4. Configure in Settings UI

Add GA4 section to IntegrationSettings:
- Property ID input (format: `properties/123456789`)
- Service account JSON textarea (paste from Google Cloud Console)
- Test button runs `activeUsers` report for yesterday/today
- Shows "Connected" / "From Env" / "Needs Re-entry" status

## Example Buddzee Conversations

- "How's the website doing?" → `ga_analytics_overview` → "Your website had 1,234 users this month, up 12% from last month..."
- "What are the most popular pages?" → `ga_top_pages` → table of pages with views
- "Where is our traffic coming from?" → `ga_traffic_sources` → source breakdown
- "Any problems with the website?" → `ga_site_health` → "I found 2 issues: 3 pages returning 404..."
- "Who's visiting from which countries?" → `ga_user_demographics` → country breakdown with percentages

## Gotchas & Lessons Learned

- **Service account required** — GA4 Data API uses service account auth, not OAuth. Create in Google Cloud Console → IAM & Admin → Service Accounts.
- **Grant access in GA4** — Add the service account email as a viewer in GA4 Admin → Property → Property Access Management.
- **Property ID format** — must be `properties/123456789` (with `properties/` prefix), not just the number.
- **Client caching** — creating `BetaAnalyticsDataClient` is expensive. Cache and reuse, invalidate on credential change.
- **Comparison period de-interleaving** — GA4 API interleaves metrics when comparison date range is provided: `[current_m1, compare_m1, current_m2, compare_m2, ...]`. The client must de-interleave.
- **Rate limits** — GA4 Data API has quotas. The 5 tools are designed for conversational use (1-2 calls per question), not batch processing.
- **Dimensions map** — GA4 uses `deviceCategory` not `device`, `operatingSystem` not `os`. The tool maps friendly names.
