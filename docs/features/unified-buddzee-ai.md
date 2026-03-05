# Unified Buddzee AI System — Reusable Guide

Source: `phyx-nurse-admin`

> **All AI features = Buddzee.** See `buddzee-ai-assistant.md` for brand identity, voice guidelines, and animated logo states. This doc covers the technical architecture of the unified AI system with 50+ tools.

## Overview

Complete AI assistant system with SSE streaming, tool-use via OpenRouter (Claude Sonnet 4.5 / Opus 4.6), 3 view modes (side drawer, full page, FAB), session persistence, screen context awareness, multi-modal input (text, voice, camera), and a modular tool registry supporting 50+ tools across VitalSync queries, client-side mutations, metrics, automations, analytics, and more.

This is the evolution of the basic SSE chat documented in `ai-chat-agent.md`. It replaces both the basic chat and the legacy voice/vision assistant with a unified system.

## Architecture

```
Frontend (3 view modes)              Backend (Express)                External
┌─────────────────────┐          ┌──────────────────────┐       ┌──────────────┐
│ AiPanel (drawer)    │          │ POST /api/ai/chat    │       │ OpenRouter   │
│ AiChatFullPage      │──SSE──→ │   buildSystemPrompt()│──→────│ (Claude/     │
│ AiFAB               │          │   streamChat()       │       │  Gemini)     │
│                     │          │   executeTools()     │       └──────────────┘
│ AiChatInputBar      │          │   persistSession()   │       ┌──────────────┐
│  ├─ text input      │          │                      │       │ VitalSync    │
│  ├─ voice (STT)     │          │ Tool Registry        │       │ GraphQL API  │
│  └─ camera (image)  │          │  ├─ VitalSync tools  │──→────│              │
│                     │          │  ├─ App server tools  │       └──────────────┘
│ AiMessageBubble     │          │  └─ Client-side tools │       ┌──────────────┐
│  ├─ markdown        │          │                      │       │ n8n, GA4,    │
│  ├─ ToolRenderer    │          │ POST /api/ai/confirm │       │ Ontraport    │
│  └─ suggested       │          │ GET  /api/ai/sessions│       └──────────────┘
│     actions         │          └──────────────────────┘
└─────────────────────┘
         ↕
    useAiStore (Zustand)
    useAiRuntime (assistant-ui adapter)
```

## File Inventory (20+ files)

### Frontend — AI Features (6 files)
- `src/features/ai/components/AiPanel.tsx` — 480px side drawer
- `src/features/ai/components/AiChatFullPage.tsx` — Full-page chat with history sidebar
- `src/features/ai/components/AiFAB.tsx` — Floating action button (desktop only)
- `src/features/ai/components/AiChatInputBar.tsx` — Multi-modal input bar (text/voice/camera)
- `src/features/ai/store/useAiStore.ts` — Zustand store for messages, sessions, screen context
- `src/features/ai/hooks/useAiRuntime.ts` — assistant-ui runtime adapter

### Frontend — Buddzee Components (7 files)
- `src/components/buddzee/BuddzeeAvatar.tsx` — Animated SVG emblem (4 states)
- `src/components/buddzee/BuddzeeFollower.tsx` — Single avatar that follows below messages
- `src/components/buddzee/AiMessageBubble.tsx` — Message bubble with markdown + tool renderer
- `src/components/buddzee/ToolRenderer.tsx` — Inline tool call result display
- `src/components/buddzee/SessionHistory.tsx` — Session list with search and date grouping
- `src/components/buddzee/BuddzeeAuroraGlow.tsx` — Voice-active aurora effect
- `src/components/buddzee/ThinkingPill.tsx` — "Buddzee is thinking..." pill

### Backend (6+ files)
- `server/src/routes/ai.ts` — Main AI route (SSE streaming, sessions, image upload)
- `server/src/lib/tool-registry.ts` — 3-tier tool merging (VitalSync + app + client-side)
- `server/src/lib/action-registry.ts` — Client-side mutation definitions
- `server/src/services/ai-processor.ts` — Streaming orchestration
- `server/src/lib/tools/` — Individual tool files (metrics, automations, GA, n8n, calls, etc.)
- `server/src/lib/actions/` — Action definitions (create-contact, update-contact, add-note, etc.)

## Dependencies

```json
{
  "@assistant-ui/react": "^0.x",
  "zustand": "^4.x",
  "@mui/material": "^5.x",
  "sharp": "^0.x",
  "multer": "^1.x"
}
```

Backend also requires:
- `openrouter` or direct `fetch` to OpenRouter API
- `buddzee-agent` library (if using shared agent package)

## Environment Variables

```bash
OPENROUTER_API_KEY=sk-or-v1-...
VITE_API_BASE_URL=/api
```

## Database Tables

Uses existing `ai_chat_sessions` and `ai_chat_messages` tables from `ai-chat-agent.md`.

## Key Concepts

### 3-Tier Tool Architecture

**Tier 1 — VitalSync Tools (from buddzee-agent library):**
- `list_models`, `describe_model` — schema introspection
- `query_vitalsync`, `query_vitalsync_aggregation` — raw GraphQL

**Tier 2 — App Server Tools (custom per app):**
- `query_contacts`, `get_contact`, `get_related`, `aggregate_data`
- `create_dashboard_metric`, `inspect_metric`, `fix_metric`
- `create_automation`, `list_automations`, `toggle_automation`
- `list_n8n_workflows`, `create_n8n_workflow`, `test_n8n_webhook`
- `ga_analytics_overview`, `ga_top_pages`, `ga_traffic_sources`, `ga_site_health`
- `log_call`, `check_consumable_status`
- `flag_user_frustration`, `submit_feature_request`
- `generate_newsletter_image`, `compose_newsletter`, `preview_newsletter`

**Tier 3 — Client-Side Action Tools (from action registry):**
- `create_contact`, `update_contact`, `add_note`, `scan_business_card`, `compose_message`
- These return `pendingApproval` payloads for user confirmation before executing mutations

### Screen Context Awareness

```typescript
// Set by navigation/detail views
useAiStore.getState().setScreenContext({
  screen: 'patient-detail',
  entityType: 'Contact',
  recordId: '123',
  recordSummary: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
  activeTab: 'notes',
});
```

Sent with every message — AI auto-fills `contactId`, makes context-aware suggestions, skips redundant questions.

### Client-Side Mutation Flow

1. AI calls client-side tool (e.g., `create_contact`)
2. Backend returns `{ pendingApproval: { action, extractedData, requiredFields } }`
3. Frontend `ToolRenderer` shows approval card with field list
4. User clicks Approve → VitalSync SDK mutation executes on client
5. Field mapping: camelCase (AI) → snake_case (VitalSync) via `vitalSyncField` property
6. Result sent back to AI via `POST /api/ai/confirm`

### Input Bar States

- **Idle:** Mic button (tap for voice input)
- **Typing:** Send button (tap to send)
- **Streaming:** Stop button (tap to cancel)
- **Voice active:** Aurora glow effect, headset icon
- Image paste/drag-and-drop support (10MB limit, resized via Sharp)

## Implementation Steps

### 1. Set up Zustand store

Key state: `messages`, `sessions`, `activeSessionKey`, `pendingMutations`, `screenContext`, `isStreaming`

### 2. Create SSE streaming endpoint

```typescript
router.post('/chat', requireAuth, upload.single('image'), async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const { message, sessionKey, screenContext } = req.body;

  // Build system prompt (Buddzee identity + domain + time context + capabilities)
  const systemPrompt = buildSystemPrompt(req.user, screenContext);

  // Load session history
  const history = await loadSessionMessages(sessionKey);

  // Stream with tool execution loop (max 5 steps)
  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = await openrouter.chat.completions.create({
      model: selectModel(message),
      messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }],
      tools: getAllAgentTools(),
      stream: true,
    });

    for await (const chunk of stream) {
      // SSE write: text chunks, tool calls, tool results
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // If no tool calls, break
    if (!hasToolCalls) break;

    // Execute tool calls, add results to history, continue loop
  }

  // Persist to MySQL
  await persistSession(sessionKey, req.user.id, message, response);
  res.end();
});
```

### 3. Create tool registry

```typescript
import { vitalsyncTools } from 'buddzee-agent';
import { metricsTools } from './tools/metrics-tools';
import { gaTools } from './tools/ga-tools';
import { n8nTools } from './tools/n8n-tools';
import { automationTools } from './tools/automation-tools';
import { callTools } from './tools/log-call-tool';
import { actions } from './actions';

export function getAllAgentTools() {
  return [
    ...vitalsyncTools,
    ...metricsTools,
    ...gaTools,
    ...n8nTools,
    ...automationTools,
    ...callTools,
    ...actions.map(actionToTool),  // Convert client-side actions to tool definitions
  ];
}
```

### 4. Create ToolRenderer

Renders tool call results inline in messages:
- **Query results** → collapsible table with click-to-navigate
- **Aggregate results** → large value + label card
- **Pending mutations** → approval card with Approve/Reject buttons
- **Visual tools** (images, email previews) → full render
- **Compact mode** → one-line summary for non-visual tools

### 5. Adding new tools

**Server-side tool:**
```typescript
// server/src/lib/tools/my-tool.ts
export const myTools: ToolDefinition[] = [{
  name: 'my_tool',
  isClientSide: false,
  openaiTool: {
    type: 'function',
    function: { name: 'my_tool', description: '...', parameters: { type: 'object', properties: { ... } } },
  },
  execute: async (args, context) => {
    // Do something
    return { success: true, data: result };
  },
}];
```

**Client-side action:**
```typescript
// server/src/lib/actions/my-action.ts
registerAction({
  id: 'my_action', name: 'My Action', category: 'CRM',
  intentKeywords: ['create', 'new', 'add'],
  intentDescription: 'Create a new record',
  entityType: 'Contact',
  mutationType: 'create',
  requiredFields: [{ key: 'firstName', label: 'First Name', type: 'text', vitalSyncField: 'first_name' }],
  optionalFields: [...],
  successMessage: 'Record created!',
});
```

## Gotchas & Lessons Learned

- **Tool execution loop max 5 steps** — prevents infinite tool-calling loops. Configurable.
- **Client-side mutations need user approval** — never auto-execute mutations. Always show confirmation card.
- **Screen context is stale-safe** — if context is missing, AI asks for it. Never assume.
- **Image upload via multer** — Sharp resizes to max 1200x1200 to reduce tokens. Use `multipart/form-data`.
- **Model selection** — image messages always use primary model (Sonnet/Opus). Voice mode uses fast model (Gemini Flash).
- **Session auto-title** — generate title from first message via a separate Claude call (non-blocking).
- **Unique SVG gradient IDs** — BuddzeeAvatar uses instance-unique IDs to avoid SVG gradient conflicts.
- **Daily cost limit** — track token usage, enforce $20/day default limit per user.
- **`compose_message` special case** — opens compose dialog on client instead of executing VitalSync mutation.
