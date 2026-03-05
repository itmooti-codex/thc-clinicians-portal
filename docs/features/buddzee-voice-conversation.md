# Buddzee Voice Conversation (Deepgram Voice Agent)

## Overview

Real-time voice-to-voice conversations with Buddzee powered by Deepgram's Voice Agent API. Users tap a "conversation" button and have a natural spoken dialogue — Buddzee listens, thinks, speaks back, and can execute actions (VitalSync queries, mutations, n8n webhooks) via function calling. This is an enhancement to the existing Voice & Vision Assistant, adding a "Conversation Mode" alongside the existing one-shot voice commands.

**Key difference from one-shot mode:** One-shot captures a single utterance and returns a visual result. Conversation mode is a continuous bidirectional audio stream where Buddzee speaks responses, supports multi-turn context, barge-in detection, and real-time function execution.

## Architecture

- **10 files** (6 new + 4 modified) per child app
- **Data flow:** Mic → Web Audio API (PCM 16kHz) → WebSocket → Deepgram STT (Nova-3) → Claude (Anthropic think layer) → Function calls (VitalSync/n8n) → Deepgram TTS (Aura-2) → Speaker
- **Security:** Backend generates short-lived JWT tokens; client never sees permanent Deepgram API key
- **LLM:** Claude via Deepgram's Anthropic think provider — consistent Buddzee personality across all features
- **Coexistence:** Runs alongside existing one-shot voice, camera, and text modes

### Deepgram Voice Agent API

Single WebSocket connection (`wss://agent.deepgram.com/v1/agent/converse`) handles the entire pipeline:

1. **Listen** — Nova-3 STT (Deepgram's best model)
2. **Think** — Claude (Anthropic) with Buddzee system prompt + function definitions
3. **Speak** — Aura-2 TTS voices

**Pricing:** $4.50/hr WebSocket connection time (includes STT + orchestration + TTS). Claude tokens are additional (~$0.05-0.15 per 5-min conversation). Estimated ~$0.50 per average conversation, ~$50/month for 100 conversations.

### WebSocket Protocol

**Settings message** (sent immediately after connection):
```json
{
  "type": "SettingsConfiguration",
  "audio": { "encoding": "linear16", "sample_rate": 16000 },
  "agent": {
    "listen": { "model": "nova-3" },
    "think": {
      "provider": { "type": "anthropic" },
      "model": "claude-sonnet-4-5-20250929",
      "instructions": "You are Buddzee, an AI business assistant...",
      "functions": [/* generated from action registry */]
    },
    "speak": { "model": "aura-2-luna-en" }
  }
}
```

**Key message types:**

| Direction | Type | Purpose |
|---|---|---|
| Client → Server | `UserAudio` | Streamed mic audio (base64 PCM) |
| Server → Client | `AgentAudio` | TTS response for speaker playback |
| Server → Client | `FunctionCallRequest` | Agent wants to call a function |
| Client → Server | `FunctionCallResponse` | Function execution result |
| Client → Server | `InterruptAgent` | Barge-in (stop agent speaking) |
| Client → Server | `InjectMessage` | Push context into conversation |
| Client → Server | `UpdatePrompt` | Change system prompt mid-session |

### Function Calling Bridge

The existing action registry maps directly:

```
Action Registry Entry          →  Deepgram Function Definition
───────────────────────────────────────────────────────────────
action.id                      →  function.name
action.intentDescription       →  function.description
action.requiredFields + opt.   →  function.parameters (JSON Schema)
action.mutationType            →  client_side: true (mutations need confirmation)
```

**Three execution paths:**

| Type | Execution | Example |
|---|---|---|
| VitalSync read queries | Client-side (GraphQL fetch) | "How many contacts this week?" |
| VitalSync mutations | Client-side + confirmation card | "Create a contact for John Smith" |
| n8n webhooks | Server-side (backend executes) | "Send a follow-up email to Jane" |

For mutations: FunctionCallRequest → client pauses audio → shows confirmation card → user confirms → VitalSync SDK executes → FunctionCallResponse → agent acknowledges verbally.

## Files to Copy

### New Backend Files (3)
- **`server/src/routes/deepgram.ts`** — `POST /api/assistant/deepgram-token` endpoint for temporary JWT generation
- **`server/src/lib/deepgram-functions.ts`** — Converts action registry entries to Deepgram function definitions, builds Settings message with Buddzee system prompt
- **`server/src/services/deepgram-token.ts`** — Deepgram SDK wrapper for token generation

### New Frontend Files (3)
- **`src/features/assistant/hooks/useDeepgramAgent.ts`** — WebSocket lifecycle, audio streaming (mic → PCM chunks), function call handling, conversation state management
- **`src/features/assistant/ConversationOverlay.tsx`** — Full-screen conversation UI with live transcript, Buddzee speaking animation, interrupt/end buttons
- **`src/features/assistant/utils/audio-manager.ts`** — Web Audio API helpers (mic capture at 16kHz mono linear16, agent audio playback via AudioContext)

### Modified Files (4)
- **`src/features/assistant/AssistantFAB.tsx`** — Add headset/conversation icon to SpeedDial actions
- **`src/features/assistant/AssistantProvider.tsx`** — Wire conversation mode, manage Deepgram session lifecycle alongside existing modes
- **`src/features/assistant/config.ts`** — Add `VITE_VOICE_CONVERSATION_ENABLED` feature flag
- **`src/features/assistant/types.ts`** — Add `ConversationState`, `DeepgramMessage`, `ConversationTurn` types

## Dependencies

**Backend (`server/package.json`):**
```
@deepgram/sdk          — Token generation, API management
```

**Frontend (`package.json`):**
```
@deepgram/sdk          — WebSocket client for Voice Agent connection
```

No new Capacitor plugins needed — microphone access uses Web Audio API in the WebView. Existing `@capacitor-community/speech-recognition` stays for one-shot mode.

## Environment Variables

**Backend (`server/.env`):**
```
DEEPGRAM_API_KEY=<from Deepgram console>
DEEPGRAM_VOICE_MODEL=aura-2-luna-en        # TTS voice (configurable per app/brand)
DEEPGRAM_STT_MODEL=nova-3                  # STT model
ANTHROPIC_API_KEY=<already exists>          # Used by Deepgram for Claude think layer
```

**Frontend (`.env`):**
```
VITE_VOICE_CONVERSATION_ENABLED=true       # Feature flag for conversation mode
```

## Database Tables

```sql
CREATE TABLE voice_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  user_id INT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  duration_seconds INT DEFAULT 0,
  transcript_json JSON,
  function_calls_json JSON,
  status ENUM('active','completed','error') DEFAULT 'active',
  INDEX idx_session (session_id),
  INDEX idx_user (user_id)
);
```

## Implementation Steps

1. **Get Deepgram API key** — Sign up at deepgram.com, create project API key with Voice Agent + STT + TTS permissions
2. **Install backend dependencies** — `cd server && npm install @deepgram/sdk`
3. **Install frontend dependencies** — `npm install @deepgram/sdk`
4. **Add environment variables** — `DEEPGRAM_API_KEY`, `DEEPGRAM_VOICE_MODEL`, `DEEPGRAM_STT_MODEL` to `server/.env`; `VITE_VOICE_CONVERSATION_ENABLED=true` to `.env`
5. **Create database table** — Add `voice_conversations` to `server/src/seed.ts`, then create on production via SSH + docker exec
6. **Backend: Token service** — Create `server/src/services/deepgram-token.ts` with Deepgram SDK token generation
7. **Backend: Function bridge** — Create `server/src/lib/deepgram-functions.ts` to convert action registry → Deepgram function definitions
8. **Backend: Route** — Create `server/src/routes/deepgram.ts` with `POST /api/assistant/deepgram-token`, mount in main server
9. **Frontend: Audio manager** — Create `src/features/assistant/utils/audio-manager.ts` for mic capture + speaker playback
10. **Frontend: Deepgram hook** — Create `src/features/assistant/hooks/useDeepgramAgent.ts` for WebSocket + audio + function calls
11. **Frontend: Conversation UI** — Create `src/features/assistant/ConversationOverlay.tsx` with transcript, Buddzee animation, controls
12. **Frontend: Wire into FAB** — Update `AssistantFAB.tsx` to add conversation mode button
13. **Frontend: Wire into Provider** — Update `AssistantProvider.tsx` to manage Deepgram session lifecycle
14. **Test end-to-end** — Token generation → WebSocket → STT → function call → TTS → speaker playback

## Gotchas & Lessons Learned

- **Token auth, not API key** — Client connects with `Authorization: Token <JWT>` (not `Bearer`). Backend generates short-lived JWTs via Deepgram SDK.
- **Audio format critical** — Must be linear16, 16kHz, mono. Web Audio API defaults to 44.1kHz stereo — need to downsample.
- **Settings message must be first** — Send `SettingsConfiguration` immediately after WebSocket opens, before any audio data.
- **Mutations still need confirmation** — Even in voice conversation, VitalSync mutations must go through the confirmation card UI. Can't auto-execute mutations via voice for safety.
- **VitalSync SDK is client-side only** — Mutations via raw GraphQL fetch don't work (read-only API). Function calls for mutations must be `client_side: true`.
- **Capacitor WebView mic access** — Works via Web Audio API but `server.url` in capacitor config must be a real HTTP/HTTPS URL (not `capacitor://localhost`) for VitalSync SDK compatibility.
- **Barge-in UX** — Send `InterruptAgent` when user starts speaking while agent is still talking. Deepgram handles this natively but the UI needs to reflect the state change.
- **Session cleanup** — Always close WebSocket on component unmount / app background. Open connections are billed.

## Relationship to Existing Voice Feature

```
AssistantFAB (SpeedDial)
├── Mic icon        → Existing one-shot mode (Web Speech API / Capacitor STT)
├── Camera icon     → Existing camera/vision mode (Claude Vision API)
├── Text icon       → Existing text input mode
└── Headset icon    → NEW: Conversation mode (Deepgram Voice Agent)
```

**Shared components:** Action registry, screen context auto-fill, confirmation cards, VitalSync executor, database logging, Buddzee branding/animations.

**Independent:** WebSocket lifecycle, audio pipeline, TTS playback, conversation transcript UI.

## Buddzee Brand Integration

- **Greeting:** "Hey! I'm Buddzee. What can I help you with?"
- **Listening state:** Buddzee emblem pulses (repurpose existing "thinking" animation)
- **Speaking state:** New animation — emblem glows with voice waveform visualization
- **System prompt:** Standard Buddzee personality from `docs/features/buddzee-ai-assistant.md`
- **Voice selection:** Aura-2 voice matching "articulate yet approachable" personality

## App Type Support

| App Type | Supported | Notes |
|---|---|---|
| React + Mobile | Yes | Express backend handles token generation |
| React (no backend) | No | Needs backend for secure API key proxy |
| Ontraport | No | No backend — would need shared proxy service |

**Feature flag:** `voice-conversation`
