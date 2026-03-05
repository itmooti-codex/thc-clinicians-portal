# Buddzee Chat Agent System (from phyx-nurse-admin)

> **All AI chat in VibeCodeApps apps is branded as Buddzee.** See `buddzee-ai-assistant.md` for the full brand identity, voice guidelines, animated logo integration, and system prompt template. This document covers the technical architecture.

## Architecture Overview
- Users type messages to Buddzee → backend proxies to n8n webhook with SSE passthrough → n8n orchestrates Claude → streams response back as Buddzee
- All conversations persisted to MySQL (sessions + messages + query analytics)
- Rich structured content: tables, patient cards, status lists, action buttons
- Optional push notification layer (OneSignal) with in-app notification feed
- Buddzee animated emblem shows thinking state during streaming, idle when waiting

## File Inventory (22 files)

### Backend (3 files)
- `server/src/routes/ai-chat.ts` — 6 REST endpoints: send (SSE proxy), sessions CRUD, search, popular queries
- `server/src/routes/notifications.ts` — 1 endpoint: OneSignal API proxy for notification polling
- `server/src/seed.ts` — 3 DB tables: `ai_chat_sessions`, `ai_chat_messages`, `ai_query_log`

### Frontend State (2 files)
- `src/stores/useAiChatStore.ts` — Zustand: messages, sessions, streaming, structured content
- `src/stores/useNotificationStore.ts` — Zustand (persisted): notifications with dedup + merge

### Frontend Hooks (4 files)
- `src/hooks/useAiChat.ts` — Core: SSE streaming, context building, session/search ops
- `src/hooks/useNotificationListener.ts` — Foreground push listener (native bridge)
- `src/hooks/useNotificationSync.ts` — 60s polling for notifications via API
- `src/utils/apiFetch.ts` — Authenticated fetch helper (Bearer token + API base URL)

### Frontend Components (7 files)
- `src/components/ai/AiChatFullPage.tsx` — Full-page chat with history sidebar
- `src/components/ai/AiChatPanel.tsx` — 400px right drawer chat panel
- `src/components/ai/AiChatToggle.tsx` — FAB to open chat drawer
- `src/components/ai/AiChatMessage.tsx` — Message bubble: markdown + structured content + copy/regenerate/retry
- `src/components/ai/AiChatHistory.tsx` — Session browser: search, date grouping, archive
- `src/components/ai/StructuredMessageRenderer.tsx` — Rich blocks: tables, patient cards, status lists, actions
- `src/components/home/NotificationFeed.tsx` — Notification list with deep-link navigation

### Frontend Utilities (1 file)
- `src/utils/aiQuickActions.ts` — Context-aware quick action suggestions

## Database Schema (3 tables)

### `ai_chat_sessions`
```sql
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_key VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) DEFAULT NULL,
  patient_id INT DEFAULT NULL,
  patient_name VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_archived BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX idx_user_sessions (user_id, is_archived, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `ai_chat_messages`
```sql
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  structured_content JSON DEFAULT NULL,
  patient_id INT DEFAULT NULL,
  patient_name VARCHAR(255) DEFAULT NULL,
  is_error BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  FULLTEXT INDEX ft_content (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `ai_query_log`
```sql
CREATE TABLE IF NOT EXISTS ai_query_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  query_text TEXT NOT NULL,
  normalized_query VARCHAR(500) NOT NULL,
  session_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE SET NULL,
  INDEX idx_normalized (normalized_query)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/ai-chat/send` | Send message → n8n webhook SSE proxy. Saves user + assistant messages to DB |
| GET | `/api/ai-chat/sessions` | List sessions (paginated). `?limit=` `?offset=` |
| GET | `/api/ai-chat/sessions/:key` | Load session with all messages |
| PATCH | `/api/ai-chat/sessions/:key` | Rename or archive. Body: `{title?, is_archived?}` |
| GET | `/api/ai-chat/search?q=term` | FULLTEXT search (LIKE for <4 chars) |
| GET | `/api/ai-chat/popular-queries?limit=5` | Top N frequent queries (30 days, min 2 occurrences) |
| GET | `/api/notifications` | OneSignal REST API proxy (last 50 notifications) |

## Core Types

### ChatMessage
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  patientId?: number;
  patientName?: string;
  isError?: boolean;
  isStreaming?: boolean;
  structuredContent?: ResponseBlock[];
}
```

### ResponseBlock (structured content)
```typescript
type ResponseBlock =
  | { type: 'text'; content: string }
  | { type: 'table'; title?: string; columns: { key: string; label: string }[]; rows: Record<string, string | number>[] }
  | { type: 'patient_card'; patientId: number; name: string; status?: string }
  | { type: 'status_list'; title?: string; items: { label: string; value: string; status: 'ok' | 'warning' | 'error' | 'info' }[] }
  | { type: 'actions'; buttons: { label: string; action: string; payload: string }[] };
```

### SessionSummary
```typescript
interface SessionSummary {
  session_key: string;
  title: string;
  patient_name: string | null;
  last_message_at: string;
  created_at: string;
  message_count: number;
}
```

### AppNotification
```typescript
interface AppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  sourceId?: string;    // OneSignal ID for dedup
  contactId?: number;   // Patient ID for deep link
  tab?: string;         // Tab to navigate to
  subTab?: string;      // Sub-tab to navigate to
}
```

## SSE Streaming Flow

### Backend (POST /send)
1. Receive `{sessionKey, chatInput, context, patientId, patientName}`
2. Get or create session in `ai_chat_sessions`
3. Save user message to `ai_chat_messages`
4. Log query to `ai_query_log` (normalized lowercase, max 500 chars)
5. Forward to n8n webhook with `Accept: text/event-stream`
6. If SSE response:
   - Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
   - Pipe chunks to client
   - Accumulate from `data:` lines (parse JSON for `text_delta`)
   - On stream end, save full assistant response to DB
7. If JSON response (fallback): extract `.output`/`.text`, save, return

### Frontend (useAiChat.ts)
1. Create AbortController
2. Add empty assistant message (`isStreaming: true`)
3. Call `apiFetch('/api/ai-chat/send')` with SSE accept header
4. Parse `data:` lines:
   - `{type: 'text_delta', content: '...'}` → accumulate, update message
   - `{type: 'block', block: {...}}` → add structured block
   - `[DONE]` → stop
5. `finalizeStreaming()` — mark complete
6. Error → remove failed message, add error with retry
7. Abort → finalize partial message

### SSE Event Format
```
data: {"type": "text_delta", "content": "Here is the "}
data: {"type": "text_delta", "content": "patient summary..."}
data: {"type": "block", "block": {"type": "table", "title": "Orders", "columns": [...], "rows": [...]}}
data: [DONE]
```

## n8n Webhook Integration

### URL Pattern
`https://automations.vitalstats.app/webhook/{app-slug}/chat`

### Request Payload
```json
{
  "action": "sendMessage",
  "sessionId": "1738946123456-abc1234",
  "chatInput": "What is the status of John Smith's orders?",
  "context": "PATIENT CONTEXT — use these values directly...\nPatient ID: 12345\nName: John Smith\n..."
}
```

### Context Building (`buildContext`)
Frontend builds hidden context from selected patient:
- Patient ID, name, email
- Approval status, patient status
- Red flags (medical conditions)
- Current medications (prescribed, supplements, peptides)
- Current medical conditions, health goals

n8n injects this into the AI system prompt.

## Zustand Store Design

### useAiChatStore (NOT persisted)
- `isOpen` / `open()` / `close()` / `toggle()` — drawer state
- `messages`, `sessionId` (stored in localStorage), `isLoading`
- `abortController`, `streamingMessageId` — streaming control
- `sessions`, `sessionsLoading`, `searchResults`, `popularQueries` — DB-backed
- Session ID format: `{timestamp}-{random7chars}`
- Max 100 messages per session in local state
- Messages loaded from DB on demand (not persisted locally)

### useNotificationStore (persisted via zustand/persist)
- Persisted to localStorage (`phyx-notifications` key)
- Max 200 notifications, dedup by `sourceId`
- `mergeFromApi(items)` for bulk merge from polling
- `useUnreadCount()` selector for badge

## UI Components

### AiChatFullPage
- Desktop: 280px history sidebar (collapsible) + chat area
- Mobile: Full-screen with swappable history view
- Quick action chips (static + popular queries)
- Enter to send, Shift+Enter for newline
- Stop generation button during streaming

### AiChatPanel
- 400px right-side MUI Drawer (temporary, z-index above sidebar)
- Full-screen on mobile
- Header with patient context chip
- History view toggle
- Suppressed when full-page chat is active

### AiChatToggle
- FAB: bottom-right (32px/24px desktop, 24px/16px mobile)
- **Buddzee emblem** icon (NOT generic bot icon) — use `BuddzeeAvatar` component
- Hidden when chat open, on mobile, or full-page active

### AiChatMessage
- User: black bg, white text, right-aligned
- Buddzee (assistant): markdown via `react-markdown` + `remark-gfm`, light grey bg, left-aligned, `BuddzeeAvatar` beside message
- Error: red border, error icon, retry button
- Streaming: blinking cursor animation
- Hover actions: copy, regenerate (last assistant msg only), retry

### AiChatHistory
- Debounced search (300ms), FULLTEXT
- Sessions grouped: Today, Yesterday, This Week, Older
- Session card: title, relative date, patient name chip, message count
- Archive on hover

### StructuredMessageRenderer
- TextBlock — markdown via react-markdown
- TableBlock — MUI Table, zebra striping, scrollable
- PatientCardBlock — Clickable, avatar, name, status → navigates to patient
- StatusListBlock — Colored dots (green=ok, amber=warning, red=error, blue=info)
- ActionButtonsBlock — Clickable Chip buttons

## Quick Actions System

### With patient selected:
- "Summarize {name}", "Check orders", "Draft pharmacy note", "Red flags", "Script status"

### Without patient:
- "Patients needing attention", "Today's summary", "Help with workflow"

Popular queries from `ai_query_log` merged with static actions.

## Key Design Decisions

1. **n8n as AI orchestrator** — Backend does NOT call Claude/GPT directly. Proxies to n8n webhook which handles: conversation memory, Buddzee system prompt (see `buddzee-ai-assistant.md`), tool calling, structured output. Decouples AI logic from app code.
2. **SSE passthrough** — Backend pipes n8n SSE stream to frontend while accumulating for DB save. Real-time without buffering.
3. **Session ID in localStorage** — Browser/device gets persistent session key. "New Chat" generates new key.
4. **Messages NOT persisted locally** — Only current session in memory. History loaded from DB on demand.
5. **Structured content first-class** — `ResponseBlock` union allows rich UI (tables, cards) not just markdown.
6. **Dual notification sources** — Push (native bridge) + polling (60s). Both deduped by `sourceId`.
7. **Context injection** — Patient data auto-injected as hidden field. User doesn't need to specify who they're asking about.
8. **Popular queries** — `ai_query_log` tracks every query. Top N (30 days, min 2) shown as quick action chips.

## To Reuse in Another App

1. Copy the 22 files
2. Create 3 DB tables
3. **Add Buddzee branding** — Copy `BuddzeeAvatar` component + CSS animations (see `buddzee-ai-assistant.md`)
4. Set up n8n webhook (receives POST, maintains memory per sessionId, streams SSE)
5. **Set Buddzee system prompt** in the n8n AI agent workflow (see `buddzee-ai-assistant.md` → System Prompt Template)
6. Update n8n webhook URL in `ai-chat.ts`
7. Update quick actions in `aiQuickActions.ts`
8. Update context builder in `useAiChat.ts` (`buildContext`)
9. Set up OneSignal (optional)
10. Mount routes in Express
11. Add components to layout: `<AiChatPanel />`, `<AiChatToggle />`, `<AiChatFullPage />`, `<NotificationFeed />`
12. Wire hooks: `useNotificationListener()` + `useNotificationSync()` in app root
13. **Update n8n chat widget** initial message to Buddzee greeting (if using widget)

## Dependencies
- Backend: `express`, `mysql2`, Node 18+ native `fetch`
- Frontend: `react-markdown` + `remark-gfm`, `zustand` + `zustand/middleware` (persist), `@mui/material`, `lucide-react`

## Route Mount Points
```typescript
import aiChatRoutes from './routes/ai-chat';
import notificationRoutes from './routes/notifications';
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/notifications', notificationRoutes);
```
