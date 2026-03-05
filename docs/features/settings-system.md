# Settings System — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Hierarchical settings UI with four sections: Profile, Notifications, Integrations, and Security. Backend uses AES-256-GCM encryption for sensitive credentials (API keys, tokens). Settings are stored in MySQL with a key-value pattern. Supports environment variable fallback — if no DB entry exists, reads from env vars.

## Architecture

- **Key-value storage:** `app_settings` table with `setting_key` / `setting_value` pairs
- **AES-256-GCM encryption:** Sensitive values encrypted at rest, decrypted on read
- **Env var fallback:** `getConfig()` helpers check DB first, then fall back to env vars
- **Test endpoints:** Each integration has a test endpoint to validate credentials before saving
- **Auto-save:** Notification preferences debounce-save (500ms) on toggle

```
SettingsView
  ├─ ProfileSettings (name, display name, role, AI preferences)
  ├─ NotificationSettings (5 toggles, auto-save, OneSignal tag sync)
  ├─ IntegrationSettings
  │   ├─ n8n (API URL + key, test connection)
  │   ├─ Ontraport (App ID + key, test /Contacts)
  │   ├─ OpenRouter (API key, test /models)
  │   └─ Google Analytics 4 (Property ID + service account JSON, test report)
  └─ Security (biometric lock toggle, logout)

Backend: app_settings table → AES-256-GCM encryption → per-integration GET/PUT/DELETE/test routes
```

## File Inventory (6 files)

### Frontend Components (4 files)
- `src/components/settings/SettingsView.tsx` — Main container with 4 sections
- `src/components/settings/ProfileSettings.tsx` — Name, display name, role, AI preferences
- `src/components/settings/NotificationSettings.tsx` — 5 toggle switches with auto-save
- `src/components/settings/IntegrationSettings.tsx` — 4 integration configs with test/save/delete

### Backend (2 files)
- `server/src/routes/settings.ts` — All settings API routes (profile, notifications, integrations)
- `server/src/lib/settings.ts` — AES-256-GCM encryption service + config helpers

## Dependencies

```json
{
  "@mui/material": "^5.x",
  "mysql2": "^3.x"
}
```

Node.js built-in `crypto` module for encryption (no additional dependency).

## Environment Variables

```bash
# Encryption key (falls back to JWT_SECRET if not set)
APP_SETTINGS_ENCRYPTION_KEY=your-32-char-encryption-key

# Fallback env vars (used when DB settings don't exist)
N8N_API_URL=https://automations.vitalstats.app
N8N_API_KEY=your-n8n-key
ONTRAPORT_API_APPID=your-app-id
ONTRAPORT_API_KEY=your-api-key
OPENROUTER_API_KEY=your-openrouter-key
GA4_PROPERTY_ID=properties/123456789
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
```

## Database Tables

```sql
CREATE TABLE app_settings (
  setting_key VARCHAR(255) PRIMARY KEY,
  setting_value TEXT,
  is_encrypted BOOLEAN DEFAULT FALSE,
  description VARCHAR(255),
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Implementation Steps

### 1. Create encryption service

**`server/src/lib/settings.ts`:**
```typescript
import crypto from 'crypto';
import pool from '../db';

function getEncryptionKey(): Buffer {
  const raw = process.env.APP_SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key';
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedValue: string): string | null {
  try {
    const key = getEncryptionKey();
    const [ivHex, tagHex, ciphertext] = encryptedValue.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;  // Decryption failed (key changed)
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const [rows] = await pool.execute('SELECT setting_value, is_encrypted FROM app_settings WHERE setting_key = ?', [key]);
  const row = (rows as any[])[0];
  if (!row) return null;
  if (row.is_encrypted) return decrypt(row.setting_value);
  return row.setting_value;
}

export async function setSetting(key: string, value: string, opts?: { encrypted?: boolean; description?: string; updatedBy?: number }) {
  const storedValue = opts?.encrypted ? encrypt(value) : value;
  await pool.execute(
    `INSERT INTO app_settings (setting_key, setting_value, is_encrypted, description, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = ?, is_encrypted = ?, updated_by = ?`,
    [key, storedValue, opts?.encrypted ?? false, opts?.description ?? null, opts?.updatedBy ?? null,
     storedValue, opts?.encrypted ?? false, opts?.updatedBy ?? null]
  );
}

export async function deleteSetting(key: string) {
  await pool.execute('DELETE FROM app_settings WHERE setting_key = ?', [key]);
}

export async function getSettingHealth(key: string): Promise<{ exists: boolean; encrypted: boolean; decryptable: boolean }> {
  const [rows] = await pool.execute('SELECT setting_value, is_encrypted FROM app_settings WHERE setting_key = ?', [key]);
  const row = (rows as any[])[0];
  if (!row) return { exists: false, encrypted: false, decryptable: false };
  if (!row.is_encrypted) return { exists: true, encrypted: false, decryptable: true };
  const result = decrypt(row.setting_value);
  return { exists: true, encrypted: true, decryptable: result !== null };
}
```

### 2. Create config helpers (DB → env var fallback)

```typescript
export async function getN8nConfig(): Promise<{ apiUrl: string; apiKey: string } | null> {
  const apiUrl = await getSetting('n8n_api_url') || process.env.N8N_API_URL;
  const apiKey = await getSetting('n8n_api_key') || process.env.N8N_API_KEY;
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

export async function getOntraportConfig(): Promise<{ appId: string; apiKey: string } | null> {
  const appId = await getSetting('ontraport_app_id') || process.env.ONTRAPORT_API_APPID;
  const apiKey = await getSetting('ontraport_api_key') || process.env.ONTRAPORT_API_KEY;
  if (!appId || !apiKey) return null;
  return { appId, apiKey };
}

// Similar for getOpenRouterConfig(), getGA4Config()
```

### 3. Create API routes

**Per-integration pattern:**
```typescript
// GET — check if configured, return masked values
router.get('/n8n', requireAuth, async (req, res) => {
  const health = await getSettingHealth('n8n_api_key');
  const config = await getN8nConfig();
  res.json({
    configured: !!config,
    apiUrl: config?.apiUrl,
    maskedKey: config?.apiKey ? `${config.apiKey.slice(0, 4)}...${config.apiKey.slice(-4)}` : null,
    source: health.exists ? 'database' : (process.env.N8N_API_KEY ? 'env' : null),
    needsReconfig: health.exists && !health.decryptable,
  });
});

// PUT — validate, test, save encrypted
router.put('/n8n', requireAuth, async (req, res) => {
  const { apiUrl, apiKey } = req.body;
  // Test connection
  const testRes = await fetch(`${apiUrl}/api/v1/workflows?limit=1`, { headers: { 'X-N8N-API-KEY': apiKey } });
  if (!testRes.ok) { res.status(400).json({ error: 'Connection test failed' }); return; }
  // Save encrypted
  await setSetting('n8n_api_url', apiUrl, { encrypted: false, updatedBy: req.user.id });
  await setSetting('n8n_api_key', apiKey, { encrypted: true, updatedBy: req.user.id });
  res.json({ success: true });
});

// DELETE — remove from DB
router.delete('/n8n', requireAuth, async (req, res) => {
  await deleteSetting('n8n_api_url');
  await deleteSetting('n8n_api_key');
  res.json({ success: true });
});

// GET test — validate current config
router.get('/n8n/test', requireAuth, async (req, res) => {
  const config = await getN8nConfig();
  if (!config) { res.json({ success: false, message: 'Not configured' }); return; }
  // Test connection and return result
});
```

### 4. Create frontend components

**IntegrationSettings pattern:**
- Each integration shows: status chip (Connected/From Env/Needs Re-entry), masked key, save/test/delete buttons
- Input fields for URL/key/JSON, masked after saving
- Test button validates before save
- Delete removes DB config (falls back to env var)

**NotificationSettings pattern:**
- 5 toggles with debounced auto-save (500ms)
- OneSignal tag sync (non-blocking fire-and-forget)

## Example Usage

### Reading config in other routes

```typescript
import { getN8nConfig, getOntraportConfig } from '../lib/settings';

// In any route that needs n8n
const n8nConfig = await getN8nConfig();
if (!n8nConfig) { res.status(500).json({ error: 'n8n not configured' }); return; }
const { apiUrl, apiKey } = n8nConfig;
```

## Gotchas & Lessons Learned

- **AES-256-GCM format:** `iv:tag:ciphertext` (hex-encoded, colon-delimited). All three parts needed for decryption.
- **Encryption key change detection:** If `decrypt()` fails (returns null), `getSettingHealth()` returns `decryptable: false`. UI shows "Needs Re-entry" chip.
- **Always mask keys in GET responses** — never return full API keys. Show first 4 + last 4 chars.
- **Test before save** — validate credentials work before storing them.
- **Env var fallback** — DB settings take priority. When DB entry is deleted, falls back to env vars.
- **UPSERT pattern** — `INSERT ... ON DUPLICATE KEY UPDATE` for idempotent saves.
- **OneSignal tag sync** — set `notify_task_assignments = "1"` etc. for push preference filtering.
