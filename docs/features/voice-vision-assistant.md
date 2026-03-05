# Buddzee Voice & Vision Assistant (from phyx-nurse-admin)

> **This is Buddzee's voice, camera, and text interface.** All voice/vision AI interactions are branded as Buddzee. See `buddzee-ai-assistant.md` for the full brand identity, voice guidelines, and animated logo states.

## Overview

Buddzee's modular voice & vision interface lets users perform business actions via **voice**, **camera**, and **text** input. Uses Claude's tool-use API to classify intent, extract structured data from natural language or images (e.g. business cards), and execute VitalSync mutations after user confirmation. Screen-context-aware: automatically links actions to the current record.

**UI labels:** "Buddzee is listening..." (voice), "Buddzee is scanning..." (camera), "Buddzee is thinking..." (processing). The animated Buddzee emblem shows the current state (idle/thinking/ready).

## Architecture

- **20 files** total (8 backend, 12 frontend)
- **Data flow**: User input (voice/camera/text) → Express API → Claude tool-use (intent + extraction) → Confirmation UI → **Client-side VitalSync SDK mutation** → Backend logging
- **Key design decisions**:
  1. **Direct Claude API** from Express (NOT n8n) — tool-use requires structured schemas easier to manage in TypeScript
  2. **Action Registry pattern** — self-contained action modules with intent keywords, field definitions, VitalSync field mappings
  3. **Window Bridge** for voice/camera — same pattern as OneSignal (`window.__functionName()`) abstracts native Capacitor from shared React code
  4. **Client-side VitalSync SDK mutations** — VitalSync GraphQL API is read-only; mutations only work via the SDK's RxJS mechanism (`plugin.switchTo('Model').mutation().createOne(data).execute(true).toPromise()`). Backend `/confirm` endpoint is logging-only.
  5. **Schema-driven** — action fields map directly to VitalSync schema fields

## File Inventory (20 files)

### Backend — Action Registry (6 files)
- `server/src/lib/action-registry.ts` — Core types (`AssistantAction`, `FieldDefinition`, `ExtractionResult`, `ScreenContext`), registry (`registerAction`, `getAction`, `getEnabledActions`), `actionsToClaudeTools()` converter
- `server/src/lib/actions/index.ts` — Imports all action modules to register them
- `server/src/lib/actions/create-contact.ts` — Create contact action (firstName, lastName required + 9 optional fields)
- `server/src/lib/actions/scan-business-card.ts` — Business card scanning via Claude vision (same fields as create-contact, different intent keywords)
- `server/src/lib/actions/add-note.ts` — Add note to contact (content required, contactName/contactId optional, auto-fills from screen context)
- `server/src/lib/actions/update-contact.ts` — Update contact fields (all fields optional, mutationType: 'update')

### Backend — Services (2 files)
- `server/src/services/ai-processor.ts` — Claude tool-use integration: builds system prompt with screen context + business context, sends to Claude with actions as tools, parses tool calls, calculates confidence from field coverage. Also handles multi-step conversation via `continueConversation()`.
- `server/src/services/vitalsync-executor.ts` — Contains `searchContacts()` for contact disambiguation. Note: mutations are executed client-side via the VitalSync SDK, NOT server-side (VitalSync GraphQL API does not support mutations via raw fetch).

### Backend — Routes (1 file, mounted in existing server)
- `server/src/routes/assistant.ts` — 5 endpoints: `POST /process` (main: text/image/voice → Claude), `POST /confirm` (logging-only — receives client-side mutation result), `POST /clarify` (multi-step conversation), `GET /actions` (list enabled actions), `POST /transcribe` (Phase 3 stub). Uses multer for image uploads, sharp for resizing to 1568px (Claude vision limit).

### Frontend — Types & Config (2 files)
- `src/features/assistant/types.ts` — TypeScript interfaces: `ActionInfo`, `FieldDefinition`, `ExtractionResult`, `ExecutionResult`, `ScreenContext`, `AssistantState`, `AssistantPhase`, `InputMode`
- `src/features/assistant/config.ts` — Per-client config (`enabledActions`, `voiceModes`, `businessContext`) + feature flags from `VITE_*` env vars

### Frontend — Hooks (4 files)
- `src/features/assistant/hooks/useAssistantSession.ts` — Session lifecycle: `processInput()`, `confirmAction()` (executes VitalSync SDK mutation client-side), `clarify()`, state management (phase, extraction, execution). Includes `ENTITY_MODEL_MAP` for SDK model name lookup, email validation before SDK mutation, and friendly error message parsing.
- `src/features/assistant/hooks/useCameraInput.ts` — Camera capture: tries `window.__capturePhoto` (native Capacitor), falls back to hidden `<input type="file" capture="environment">`
- `src/features/assistant/hooks/useVoiceInput.ts` — Speech recognition: tries `window.__startVoiceRecognition` (native), falls back to Web Speech API (`en-AU`, interim results enabled)
- `src/features/assistant/hooks/useAssistantContext.ts` — Screen context registration: each screen calls this with its entity type, record ID, key fields. Clears on unmount.

### Frontend — UI Components (4 files)
- `src/features/assistant/AssistantProvider.tsx` — React context provider: manages session, actions, screen context, wires camera/voice/text flows. Loads available actions from `GET /api/assistant/actions` on mount.
- `src/features/assistant/AssistantFAB.tsx` — MUI SpeedDial with mic, camera, and chat actions. Positioned above bottom nav, sharp corners (PHYX brand).
- `src/features/assistant/AssistantOverlay.tsx` — Full-screen overlay with Framer Motion animations. Phase-specific content: listening (animated mic + text fallback), capturing/processing (spinner), confirming (editable ConfirmationCard), success (checkmark + record ID), error (retry).
- `src/features/assistant/ConfirmationCard.tsx` — Shows extracted data as EntityChip summary, toggleable edit mode with TextFields. Confirm/Edit/Cancel actions. Confidence indicator (High/Medium/Low).

### Frontend — Utilities (3 files)
- `src/features/assistant/EntityChip.tsx` — MUI Chip displaying extracted field label + value with type-appropriate icons. Low confidence (<0.7) shows amber outlined variant.
- `src/features/assistant/utils/context-ranker.ts` — `rankActionsForContext()` sorts actions by relevance to current screen. `getImplicitAction()` returns default action based on screen + tab (e.g. Notes tab → 'add-note').
- `src/features/assistant/utils/australian-formats.ts` — `normalizeAusPhone()`, `isValidAusPhone()`, `formatABN()`, `isValidEmail()`, `normalizeState()`, `isValidPostcode()`

## Database Schema (3 tables)

### `assistant_sessions`
```sql
CREATE TABLE assistant_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  context_json JSON,
  status ENUM('active','completed','cancelled') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `assistant_messages`
```sql
CREATE TABLE assistant_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  role ENUM('user','assistant','system') NOT NULL,
  input_type ENUM('voice','image','text','combined') NOT NULL,
  content TEXT,
  extraction_json JSON,
  action_id VARCHAR(64),
  confidence DECIMAL(3,2),
  confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES assistant_sessions(session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `assistant_action_log`
```sql
CREATE TABLE assistant_action_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64),
  user_id INT NOT NULL,
  action_id VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64),
  record_id VARCHAR(128),
  input_type ENUM('voice','image','text','combined') NOT NULL,
  extracted_data JSON,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Dependencies

### Backend (`server/package.json`)
```
@anthropic-ai/sdk    — Claude API with tool-use + vision
multer               — Multipart file upload handling (images)
sharp                — Image preprocessing (resize to 1568px for Claude vision)
@types/multer        — TypeScript types
```

### Frontend (`package.json`)
```
framer-motion        — Overlay animations (likely already installed)
```

### Mobile (Capacitor plugins — install when building native)
```
@capacitor-community/speech-recognition  — On-device STT
@capacitor/camera                         — Photo capture
```

## Environment Variables

### Server (`server/.env`)
```
ANTHROPIC_API_KEY=sk-ant-...         # Claude API key
ASSISTANT_MODEL=claude-sonnet-4-5-20250929  # Model to use (default: Sonnet 4.5)
ASSISTANT_MAX_TOKENS=2048             # Max tokens for Claude response
VITALSYNC_API_KEY=...                 # Already exists
VITALSYNC_SLUG=...                    # Already exists
```

### Frontend (`.env.local`)
```
VITE_ASSISTANT_ENABLED=true           # Master toggle
VITE_ASSISTANT_VOICE_ENABLED=true     # Voice input toggle
VITE_ASSISTANT_CAMERA_ENABLED=true    # Camera input toggle
```

## Implementation Steps

1. **Install backend deps**: `cd server && npm i @anthropic-ai/sdk multer sharp @types/multer`
2. **Add env vars** to `server/.env`: `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`, `ASSISTANT_MAX_TOKENS`
3. **Copy backend files**: action-registry, actions/, ai-processor, vitalsync-executor, routes/assistant
4. **Mount routes** in `server/src/index.ts`: `app.use('/api/assistant', assistantRoutes)`
5. **Create DB tables**: Run the 3 CREATE TABLE statements via SSH to the Docker MySQL container (no local mysql client exists): `ssh admin@15.204.34.114 'docker exec database-db-1 mysql -u app -p"PASSWORD" DB_NAME -e "CREATE TABLE ..."'`
6. **Copy frontend files**: entire `src/features/assistant/` directory
7. **Add env vars** to `.env.local`: `VITE_ASSISTANT_ENABLED=true`, voice + camera flags
8. **Integrate into App.tsx**: Wrap with `<AssistantProvider>`, add `<AssistantFAB />` and `<AssistantOverlay />`
9. **Wire screen context**: Add `useAssistantContext()` calls to screens that should provide context (e.g. patient detail)
10. **Customize config**: Edit `src/features/assistant/config.ts` for the target app's actions, business context, and terminology
11. **Customize actions**: Modify field mappings in `server/src/lib/actions/` to match the target app's VitalSync schema (field names, entity type prefix)
12. **Test**: Start both dev servers, test camera (business card scan), voice ("create a contact for..."), and text input

## Gotchas & Lessons Learned

- **Claude tool names can't have hyphens** — `actionsToClaudeTools()` converts hyphens to underscores; `toolNameToActionId()` reverses it
- **Image resizing is mandatory** — Claude vision has a 1568px longest-side limit; `sharp` handles this in the route before passing to the processor
- **VitalSync mutations use publicName** — e.g. `createContact`, NOT `createPhyxContact`. The "Phyx" prefix is for type IDs and SDK query names, NOT mutations.
- **VitalSync GraphQL API is read-only** — Mutations via raw `fetch()` do NOT work (400 errors). Must use the SDK's RxJS mutation mechanism client-side: `plugin.switchTo('PhyxContact').mutation().createOne(data).execute(true).toPromise()`
- **ENTITY_MODEL_MAP required** — The SDK `switchTo()` call needs the internal prefixed name (e.g. `PhyxContact`), while mutations use publicName (`createContact`). `useAssistantSession.ts` maps between them.
- **Email validation before SDK** — VitalSync SDK throws hard errors for invalid email format. Must validate with regex and skip invalid values before calling `createOne()`.
- **Express body limit** — Default `express.json()` is 100kb. Must set `express.json({ limit: '15mb' })` for base64 image payloads (camera scan).
- **`ImageBlockParam` type workaround** — Don't import `ImageBlockParam` from the SDK; use inline type with explicit `media_type` union (`'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'`) and `type: 'base64' as const`
- **Web Speech API types** — TypeScript doesn't include Web Speech API types by default; use `any` with eslint-disable comments for `SpeechRecognition`, event handlers
- **Screen context auto-fills** — When the user is viewing a contact and says "add a note", the AI processor automatically fills `contactId` from screen context — no need for the user to specify who
- **Confidence calculation** — Based on required field coverage (90% weight) + optional field bonus (10% weight), capped at 1.0
- **Window bridge pattern** — Voice and camera hooks check for `window.__functionName` first (native Capacitor), then fall back to web APIs. Same pattern as OneSignal push notifications.

## Example Usage

### Adding screen context to a screen
```tsx
import { useAssistantContext } from '../../features/assistant/hooks/useAssistantContext';

function PatientDetailGrid({ patientId }) {
  const { data: patient } = usePatientDetail(patientId);

  useAssistantContext(patient ? {
    screen: 'patient-detail',
    entityType: 'Contact',
    recordId: String(patientId),
    recordSummary: {
      firstName: patient.first_name,
      lastName: patient.last_name,
      email: patient.email,
      phone: patient.sms_number,
    },
    activeTab: currentTab,
  } : null);
}
```

### Adding a new action module
```typescript
// server/src/lib/actions/create-appointment.ts
import { registerAction } from '../action-registry';

registerAction({
  id: 'create-appointment',
  name: 'Create Appointment',
  category: 'scheduling',
  intentKeywords: ['appointment', 'booking', 'schedule', 'book in'],
  intentDescription: 'Book an appointment for a patient. Extract: date, time, patient name, type.',
  requiredFields: [
    { key: 'date', label: 'Date', type: 'date', vitalSyncField: 'appointment_date' },
    { key: 'contactName', label: 'Patient', type: 'string', vitalSyncField: '' },
  ],
  optionalFields: [
    { key: 'time', label: 'Time', type: 'string', vitalSyncField: 'appointment_time' },
    { key: 'type', label: 'Type', type: 'string', vitalSyncField: 'appointment_type' },
  ],
  entityType: 'Appointment',
  mutationType: 'create',
  parentEntityType: 'Contact',
  successMessage: 'Appointment booked!',
});
```

Then import in `server/src/lib/actions/index.ts` and add `'create-appointment'` to `ENABLED_ACTIONS` in `routes/assistant.ts`.

## Assistant Lifecycle Phases

```
idle → listening (voice) / capturing (camera) → processing (Claude API) → confirming (user review)
                                                                            ↓           ↓
                                                                      executing    cancel → idle
                                                                            ↓
                                                                    success / error → idle
```

## Future Phases (Not Yet Implemented)

- **Phase 2**: Core Actions — quotes, emails, tasks, receipts, contact search
- **Phase 3**: Conversation Mode — continuous transcription (Deepgram), progressive extraction
- **Phase 4**: Advanced — speaker diarization, barcode scanning, site documentation, offline mode
- **Phase 5**: Predictive Lifecycle Engine — cohort analysis, next-best-action, talk tracks (n8n workflows)
- **Phase 6**: 1Brain + Role-Based Dashboards — knowledge integration, voice-driven metrics
