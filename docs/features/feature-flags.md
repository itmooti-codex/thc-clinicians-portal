# Feature Flag System — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Two-tier feature flag system for progressive feature rollout. Build-time env vars can hard-disable features (exclude from bundle), while runtime database flags allow per-client toggling without redeploy. Includes a `useFeature()` hook, `<FeatureGate>` declarative component, Zustand store, and Express API.

## Architecture

- **Tier 1 — Build-time:** `VITE_FEATURE_*` env vars checked first. If `'false'`, feature is disabled regardless of database state.
- **Tier 2 — Runtime:** Database-backed flags loaded after authentication via `GET /api/features`. Toggled per-client via `PUT /api/features/:key`.
- **Check order:** Build-time `'false'` wins → runtime DB flag → default to disabled if missing.

```
Component → useFeature(key)
  ├─ Check VITE_FEATURE_{KEY} env var → if 'false' → disabled
  └─ Check Zustand store (from DB) → enabled/disabled + config
```

## File Inventory (6 files)

### Backend (2 files)
- `server/src/lib/seed-features.ts` — CREATE TABLE + default flag definitions (idempotent)
- `server/src/routes/features.ts` — GET /api/features, PUT /api/features/:key

### Frontend (3 files)
- `src/stores/useFeatureStore.ts` — Zustand store with `loadFeatures(token)` action
- `src/lib/feature-flags.ts` — `useFeature()` hook + `<FeatureGate>` component

### Modified (1 file)
- `src/App.tsx` — Call `loadFeatures(token)` after authentication

## Dependencies

```json
{
  "zustand": "^4.x",
  "mysql2": "^3.x"
}
```

## Environment Variables

```bash
# Build-time feature flags (optional — set to 'false' to hard-disable)
# VITE_FEATURE_CRM_PLATFORM=true
# VITE_FEATURE_COMMUNICATION_HUB=true
# VITE_FEATURE_PIPELINE_MANAGEMENT=true
# VITE_FEATURE_DASHBOARD_SYSTEM=true
# VITE_FEATURE_GOAL_KPI_TRACKING=true
# VITE_FEATURE_AI_INSIGHTS=true
# VITE_FEATURE_WIDGET_LIBRARY=true
# VITE_FEATURE_VOICE_CONVERSATION=true
# VITE_FEATURE_VOICE_DASHBOARD_METRICS=true
# VITE_FEATURE_ROLE_DASHBOARDS=true
# VITE_FEATURE_LEAD_SCORING=true
# VITE_FEATURE_LIFECYCLE_ENGINE=true
# VITE_FEATURE_OFFLINE_MODE=true

# Encryption key for settings (optional — falls back to JWT_SECRET)
# APP_SETTINGS_ENCRYPTION_KEY=your-encryption-key
```

## Database Tables

```sql
CREATE TABLE IF NOT EXISTS app_features (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feature_key VARCHAR(64) NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT FALSE,
  tier ENUM('basic','standard','premium') DEFAULT 'basic',
  config_json JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Implementation Steps

### 1. Create seed file (`server/src/lib/seed-features.ts`)

```typescript
import type { Pool } from 'mysql2/promise';

const DEFAULT_FEATURES: Array<{ key: string; tier: 'basic' | 'standard' | 'premium'; enabled: boolean }> = [
  { key: 'crm-platform', tier: 'basic', enabled: false },
  { key: 'communication-hub', tier: 'standard', enabled: false },
  { key: 'pipeline-management', tier: 'standard', enabled: false },
  { key: 'dashboard-system', tier: 'premium', enabled: false },
  { key: 'goal-kpi-tracking', tier: 'premium', enabled: false },
  { key: 'ai-insights', tier: 'premium', enabled: false },
  { key: 'widget-library', tier: 'premium', enabled: false },
  { key: 'assistant-actions-extended', tier: 'premium', enabled: false },
  { key: 'voice-conversation', tier: 'premium', enabled: false },
  { key: 'voice-dashboard-metrics', tier: 'premium', enabled: false },
  { key: 'role-dashboards', tier: 'premium', enabled: false },
  { key: 'lead-scoring', tier: 'premium', enabled: false },
  { key: 'lifecycle-engine', tier: 'premium', enabled: false },
  { key: 'offline-mode', tier: 'premium', enabled: false },
  { key: 'onebrain-integration', tier: 'premium', enabled: false },
  { key: 'knowledge-base', tier: 'premium', enabled: false },
  { key: 'embeddable-buddzee', tier: 'premium', enabled: false },
];

export async function seedFeatures(pool: Pool): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_features (
      id INT AUTO_INCREMENT PRIMARY KEY,
      feature_key VARCHAR(64) NOT NULL UNIQUE,
      enabled BOOLEAN DEFAULT FALSE,
      tier ENUM('basic','standard','premium') DEFAULT 'basic',
      config_json JSON,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  for (const feature of DEFAULT_FEATURES) {
    await pool.execute(
      `INSERT IGNORE INTO app_features (feature_key, enabled, tier) VALUES (?, ?, ?)`,
      [feature.key, feature.enabled, feature.tier]
    );
  }
}
```

### 2. Create API routes (`server/src/routes/features.ts`)

```typescript
import { Router, Response } from 'express';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

interface FeatureRow {
  feature_key: string;
  enabled: number;
  tier: string;
  config_json: string | null;
}

/** GET /api/features — returns all flags as { [key]: { enabled, tier, config } } */
router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const [rows] = await pool.execute('SELECT feature_key, enabled, tier, config_json FROM app_features');
    const features: Record<string, { enabled: boolean; tier: string; config: any }> = {};

    for (const row of rows as FeatureRow[]) {
      let config = null;
      if (row.config_json) {
        try { config = JSON.parse(row.config_json); } catch { /* ignore */ }
      }
      features[row.feature_key] = { enabled: Boolean(row.enabled), tier: row.tier, config };
    }

    res.json(features);
  } catch (err) {
    console.error('Failed to fetch features:', err);
    res.status(500).json({ error: 'Failed to load features' });
  }
});

/** PUT /api/features/:key — update enabled and/or config */
router.put('/:key', requireAuth, async (req: AuthRequest, res: Response) => {
  const { key } = req.params;
  const { enabled, config } = req.body;

  if (enabled === undefined && config === undefined) {
    res.status(400).json({ error: 'Provide "enabled" and/or "config"' });
    return;
  }

  try {
    const sets: string[] = [];
    const values: any[] = [];

    if (enabled !== undefined) { sets.push('enabled = ?'); values.push(Boolean(enabled)); }
    if (config !== undefined) { sets.push('config_json = ?'); values.push(JSON.stringify(config)); }
    values.push(key);

    const [result] = await pool.execute(`UPDATE app_features SET ${sets.join(', ')} WHERE feature_key = ?`, values);
    if ((result as any).affectedRows === 0) { res.status(404).json({ error: `Feature "${key}" not found` }); return; }

    const [rows] = await pool.execute('SELECT feature_key, enabled, tier, config_json FROM app_features WHERE feature_key = ?', [key]);
    const row = (rows as FeatureRow[])[0];
    let parsedConfig = null;
    if (row.config_json) { try { parsedConfig = JSON.parse(row.config_json); } catch { /* ignore */ } }

    res.json({ [row.feature_key]: { enabled: Boolean(row.enabled), tier: row.tier, config: parsedConfig } });
  } catch (err) {
    console.error('Failed to update feature:', err);
    res.status(500).json({ error: 'Failed to update feature' });
  }
});

export default router;
```

### 3. Create Zustand store (`src/stores/useFeatureStore.ts`)

```typescript
import { create } from 'zustand';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface FeatureEntry {
  enabled: boolean;
  tier: string;
  config: any;
}

interface FeatureState {
  features: Record<string, FeatureEntry>;
  loaded: boolean;
  error: string | null;
  loadFeatures: (token: string) => Promise<void>;
}

const useFeatureStore = create<FeatureState>((set) => ({
  features: {},
  loaded: false,
  error: null,

  loadFeatures: async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load features (${res.status})`);
      const data: Record<string, FeatureEntry> = await res.json();
      set({ features: data, loaded: true, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load features';
      console.error('Feature store:', message);
      set({ loaded: true, error: message });
    }
  },
}));

export default useFeatureStore;
```

### 4. Create hook + gate component (`src/lib/feature-flags.ts`)

```typescript
import { ReactNode, Fragment, createElement } from 'react';
import useFeatureStore from '../stores/useFeatureStore';

/**
 * Two-tier feature flag check.
 * Feature keys use hyphens (e.g. 'dashboard-system'),
 * env vars use underscores (e.g. VITE_FEATURE_DASHBOARD_SYSTEM).
 */
export function useFeature(key: string): { enabled: boolean; config: any } {
  const envKey = `VITE_FEATURE_${key.toUpperCase().replace(/-/g, '_')}`;
  const buildFlag = (import.meta as any).env?.[envKey];
  if (buildFlag === 'false') return { enabled: false, config: null };

  const feature = useFeatureStore((s) => s.features[key]);
  return { enabled: feature?.enabled ?? false, config: feature?.config ?? null };
}

/**
 * Declarative feature gate — renders children only when enabled.
 */
export function FeatureGate({
  feature, children, fallback,
}: {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { enabled } = useFeature(feature);
  if (!enabled) return fallback ? createElement(Fragment, null, fallback) : null;
  return createElement(Fragment, null, children);
}
```

### 5. Wire up in server + app

**Server startup (`server/src/index.ts`):**
```typescript
import { seedFeatures } from './lib/seed-features';
import featuresRoutes from './routes/features';

app.use('/api/features', featuresRoutes);

app.listen(PORT, '0.0.0.0', async () => {
  try { await seedFeatures(pool); } catch (err) { console.error('Feature seed failed:', err); }
});
```

**App init (`src/App.tsx`):**
```typescript
import useFeatureStore from './stores/useFeatureStore';

function AuthenticatedApp() {
  const { token } = useAuthStore();
  const { loadFeatures } = useFeatureStore();

  useEffect(() => {
    if (token) loadFeatures(token);
  }, [token, loadFeatures]);
}
```

## Example Usage

### Imperative hook

```typescript
import { useFeature } from '../lib/feature-flags';

function MyComponent() {
  const { enabled, config } = useFeature('dashboard-system');
  if (!enabled) return <UpgradeBanner />;
  return <Dashboard config={config} />;
}
```

### Declarative gate

```tsx
import { FeatureGate } from '../lib/feature-flags';

<FeatureGate feature="voice-conversation" fallback={<UpgradeBanner />}>
  <VoiceChat />
</FeatureGate>
```

### Runtime toggle (admin API)

```typescript
await fetch('/api/features/dashboard-system', {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: true, config: { maxWidgets: 10 } }),
});
```

## Adding a New Feature Flag

1. Add to `DEFAULT_FEATURES` in `seed-features.ts`
2. (Optional) Add `VITE_FEATURE_*` to `.env.example`
3. Restart server to seed new flag
4. Use `<FeatureGate feature="my-flag">` in components

## Gotchas & Lessons Learned

- **Naming convention:** Feature keys use hyphens (`dashboard-system`), env vars use underscores (`VITE_FEATURE_DASHBOARD_SYSTEM`). Auto-converted in `useFeature()`.
- **Build-time must be string `'false'`** — not boolean `false` or `0`. Vite env vars are always strings.
- **Build-time wins:** If `VITE_FEATURE_X=false`, the runtime database flag cannot override it.
- **Missing features default to disabled** — safe by default.
- **`INSERT IGNORE`** makes seeding idempotent — safe to run on every server startup.
- **Config JSON** allows feature-specific settings (e.g., max widget count, allowed types) without code changes.
