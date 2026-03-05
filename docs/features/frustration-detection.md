# Buddzee Frustration Detection & Admin Alerting

> Buddzee silently detects user frustration during chat sessions and alerts admin staff via push notification + email with AI-powered root cause analysis. This is a hidden Buddzee capability — the user never sees this feature. See `buddzee-ai-assistant.md` for Buddzee's brand identity.

## Architecture

```
User frustrated in Buddzee chat
  → Buddzee silently calls flag_user_frustration tool
  → Server: DB insert + OneSignal push + n8n webhook
  → n8n: Claude analyzes transcript → formatted email to admin
  → Admin: push notification → tap → notification feed → click → Buddzee session loaded
```

## Files (11 files)

### Backend (server/)
| File | Purpose |
|------|---------|
| `server/src/seed.ts` | `admin_alerts` table schema |
| `server/src/lib/tools/frustration-tool.ts` | **NEW** — `flag_user_frustration` tool (DB + OneSignal + n8n) |
| `server/src/lib/tool-registry.ts` | Register frustration tool |
| `server/src/routes/ai.ts` | Inject `_sessionKey` into tool args + system prompt |
| `server/src/routes/notifications.ts` | Pass through `sessionKey` and `alertType` |

### Frontend (src/)
| File | Purpose |
|------|---------|
| `src/features/ai/store/useAiStore.ts` | Tool status label |
| `src/stores/useNotificationStore.ts` | `sessionKey` + `alertType` on AppNotification |
| `src/hooks/useNotificationSync.ts` | Map `sessionKey` + `alertType` from API |
| `src/components/home/NotificationFeed.tsx` | Deep-link click handler |

### Infrastructure
| File | Purpose |
|------|---------|
| `docker-compose.yml` | `N8N_FRUSTRATION_WEBHOOK_URL` env var |
| `.github/workflows/deploy.yml` | Webhook URL in deploy env |

### n8n Workflow
| Workflow | ID | Webhook |
|----------|-----|---------|
| PHYX: Frustration Alert Analysis | `pt2gNJKAKg6lAfBb` | `POST /webhook/frustration-alert` |

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS admin_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL DEFAULT 'frustration',
  session_id INT NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(255) DEFAULT NULL,
  severity ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  context_snapshot JSON DEFAULT NULL,
  n8n_webhook_sent BOOLEAN DEFAULT FALSE,
  onesignal_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX idx_session_type (session_id, alert_type),
  INDEX idx_created (created_at)
);
```

## Environment Variables

```env
# Required
ONESIGNAL_APP_ID=...          # Already exists for push notifications
ONESIGNAL_REST_API_KEY=...    # Already exists for push notifications

# New
N8N_FRUSTRATION_WEBHOOK_URL=https://automations.vitalstats.app/webhook/frustration-alert
```

## How Detection Works

The AI model itself detects frustration — no keyword matching or post-processing. The system prompt instructs the AI to watch for:
- Frustration language ("this is so annoying", "nothing works")
- Repeated failed requests
- Explicit confusion or being lost
- Threats to stop using the system or requests to escalate
- Multiple consecutive tool errors

**Critical rules in the system prompt:**
- Never tell the user the tool exists
- Never change tone after calling it
- Call at most once per conversation
- Set severity: low/medium/high
- Write admin-facing summary for push notification

## Tool Status Label

When the AI calls `flag_user_frustration`, the user sees "Analyzing conversation..." — an innocuous label that doesn't reveal frustration detection.

## n8n Workflow Flow

1. **Webhook** receives: `{ alertId, sessionKey, userId, userName, severity, reason, summary, transcript, createdAt }`
2. **Format Transcript** (Code node): Formats transcript into readable text, builds Claude prompt
3. **AI Analyze Frustration** (HTTP Request → OpenRouter): Claude analyzes root cause, assigns priority/category
4. **Build Email Report** (Code node): Creates styled HTML email with severity-colored header, AI analysis, session info
5. **Send Alert Email** (Gmail): Sends to admin staff

## Notification Deep-Link

When admin taps the push notification or clicks in the notification feed:
1. `NotificationFeed.tsx` checks for `sessionKey` on the notification
2. If present, calls `useAiStore.getState().loadSession(sessionKey)`
3. Opens the AI panel with `setPanelOpen(true)`
4. Admin sees the full chat session transcript

## Deduplication

- One frustration alert per session: `SELECT id FROM admin_alerts WHERE session_key = ? AND alert_type = 'frustration' LIMIT 1`
- System prompt also instructs AI to call at most once per conversation

## Adding to a New App

1. Copy `server/src/lib/tools/frustration-tool.ts`
2. Add `admin_alerts` table to seed
3. Register tool in `tool-registry.ts`, spread `...frustrationTool` into `serverTools`
4. Inject `_sessionKey` in `routes/ai.ts` executeTool
5. Add frustration monitoring section to system prompt
6. Add tool status label to AI store
7. Extend notification types with `sessionKey` + `alertType`
8. Add deep-link handling in notification feed
9. Set `N8N_FRUSTRATION_WEBHOOK_URL` env var
10. Create/reuse n8n workflow for the new app
