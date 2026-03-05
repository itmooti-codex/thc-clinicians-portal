# Ontraport Messaging (Email & SMS)

## Overview

Native email and SMS compose-and-send interface that replaces Ontraport redirects. Users can browse existing message templates, send them to contacts, or create new plain-text messages with AI-assisted drafting via Buddzee. All messages are saved as reusable Ontraport templates with merge fields (`[First Name]`, `[Related Object >> Field]`). Includes a 20-second cancel countdown before actual send, optimistic UI while waiting for confirmation, and full Buddzee chat integration.

## Architecture

- **14 new files** + **5 modified files**
- **Reads** (list templates, get template detail, merge fields, objects): Frontend → Express backend → VitalSync REST proxy
- **Writes** (create template, send, delete): Frontend → Express backend → Direct Ontraport API
- **AI drafting**: Frontend → Express backend → OpenRouter API (Buddzee)
- **Buddzee chat integration**: Claude tool call → `compose_message` action → ToolRenderer → messaging store → ComposeDialog opens with pre-filled content
- **Key constraint**: Messages are two-step Ontraport creations (shell → content update). The backend encapsulates this — the frontend just sends one request.
- **20-second countdown**: Template is created immediately, but the send API call is delayed 20 seconds with a prominent cancel button. If cancelled, the ad-hoc template is optionally deleted.

### Data Flow

```
COMPOSE FLOW:
  User types or Buddzee drafts message (with merge fields)
    → POST /api/messaging/create (two-step: shell + content)
    → 20-second frontend countdown (user can cancel)
    → POST /api/messaging/send
    → Optimistic "Sending..." entry in thread
    → Refresh conversation to see real ObjectLog entry

TEMPLATE BROWSE FLOW:
  GET /api/messaging/templates (VitalSync proxy)
    → User selects template → preview
    → Send → 20-second countdown → POST /api/messaging/send

BUDDZEE CHAT FLOW:
  User: "Send this patient an email about their order"
    → Claude calls compose_message tool with drafted body + merge fields
    → ToolRenderer shows "Open Compose" card
    → User clicks → navigates to patient → ComposeDialog opens pre-filled
```

## Files to Copy

### Backend
- **`server/src/routes/messaging.ts`** — 8 endpoints (4 read via VitalSync proxy, 4 write via Ontraport API)
- **`server/src/lib/actions/compose-message.ts`** — Buddzee client-side action registration

### Frontend Hooks
- **`src/hooks/useMessaging.ts`** — TanStack Query hooks (templates, objects, merge fields, mutations)
- **`src/hooks/useComposeMessage.ts`** — Compose orchestration with 20-second countdown

### Frontend Components
- **`src/components/messaging/ComposeDialog.tsx`** — Modal entry point (Compose/Templates tabs)
- **`src/components/messaging/ComposeForm.tsx`** — AI-first compose form (channel toggle, merge fields, SMS counter)
- **`src/components/messaging/TemplateList.tsx`** — Template browser with search and type filters
- **`src/components/messaging/TemplatePreview.tsx`** — Preview template with merge field highlighting
- **`src/components/messaging/SendCountdown.tsx`** — 20-second cancel countdown UI
- **`src/components/messaging/SendConfirmation.tsx`** — Post-send success/error state
- **`src/components/messaging/OptimisticSentMessage.tsx`** — Local "Sending..." placeholder in thread

### Stores
- **`src/stores/useMessagingStore.ts`** — Zustand store bridging Buddzee chat → ComposeDialog

### Types
- **`src/types/messaging.ts`** — `MessageChannel`, `MessageTemplate`, `MessageRecipient`, `MergeField`, `SendResult`, `PendingSend`, `ComposeData`, etc.

### Modified Files
- **`server/src/index.ts`** — Register messaging routes
- **`server/src/lib/actions/index.ts`** — Import compose-message action
- **`server/src/routes/ai.ts`** — System prompt update with messaging awareness
- **`src/features/ai/components/ToolRenderer.tsx`** — Handle `compose_message` action (opens ComposeDialog instead of VitalSync mutation)
- **`src/components/dashboard/ConversationMessagesCard.tsx`** — Add compose buttons, optimistic entries
- **Parent component (e.g. PatientDetailGrid.tsx)** — Add ComposeDialog state, wire `onCompose` callback

## Dependencies

No new npm packages. Uses existing:
- `@mui/material` (UI components)
- `@tanstack/react-query` (data fetching)
- `lucide-react` (icons)
- `zustand` (state management)
- `express` (backend)

## Environment Variables

No new variables. Uses existing:
- `VITALSYNC_SLUG` — VitalSync account slug
- `VITALSYNC_API_KEY` — VitalSync API key
- `VITALSYNC_DATASOURCE_ID` — VitalSync data source ID (for REST proxy)
- `ONTRAPORT_API_APPID` — Ontraport application ID
- `ONTRAPORT_API_KEY` — Ontraport API key
- `OPENROUTER_API_KEY` — OpenRouter API key (for Buddzee AI drafting)

## Database Tables

None. All data lives in Ontraport (messages are object type ID 7).

## Implementation Steps

1. **Copy backend route** — `server/src/routes/messaging.ts`
2. **Register route** — Add `import messagingRoutes from './routes/messaging'` and `app.use('/api/messaging', messagingRoutes)` to `server/src/index.ts`
3. **Copy types** — `src/types/messaging.ts`
4. **Copy hooks** — `src/hooks/useMessaging.ts` and `src/hooks/useComposeMessage.ts`
5. **Copy store** — `src/stores/useMessagingStore.ts`
6. **Copy components** — All files from `src/components/messaging/`
7. **Integrate into existing UI** — Modify the component that displays conversation messages:
   - Add `onCompose` callback prop to the messages content component
   - Add compose buttons (StartConversationPanel, thread header, empty state)
   - Add `<OptimisticSentMessages contactId={contactId} />` to the message thread
8. **Wire up in parent** — In the patient detail / contact detail view:
   - Add state: `composeOpen`, `composeChannel`
   - Build `MessageRecipient` from patient data (`id`, `firstName`, `lastName`, `email`, `smsNumber`)
   - Render `<ComposeDialog>` with `onSent` callback that refreshes conversation data
   - Pass `onCompose` to the activity/messages content component
   - Listen for `useMessagingStore.composeOpen` for Buddzee-driven compose
9. **Buddzee integration** (if app has AI chat):
   - Copy `server/src/lib/actions/compose-message.ts`
   - Add import to `server/src/lib/actions/index.ts`
   - Add `ComposeMessageCard` handler to `ToolRenderer.tsx`
   - Update system prompt in AI route with messaging awareness section
10. **Test** — See verification checklist below

## Gotchas & Lessons Learned

### Ontraport API
- **Two-step creation is required**: Shell first (alias, type, subject), then content update with the returned ID. Cannot create with content in one call.
- **Message object ID is 7** (`objectID: '7'` in saveorupdate calls)
- **`transactional_email`**: `'1'` for service messages (bypasses unsubscribe), `'0'` for marketing. This is a string, not boolean.
- **Send format**: `POST /1/message/send` with `{ objectID: 0, ids: [contactId], message: { object_type_id: 0, type: "e-mail"|"sms", message_id: templateId } }`
- **Merge fields are literal** — `[First Name]` stays as-is in the template body. Ontraport resolves them at send time. Never replace merge fields with actual contact data.

### VitalSync Proxy
- **REST proxy URL**: `https://{slug}.vitalstats.app/api/v1/rest/ontraport/...`
- **Headers**: `Api-Key` + `dataSourceId` (not `Api-Appid`)
- **VitalSync proxy is for reads only** — all write operations must go directly to the Ontraport API

### Frontend
- **SMS character counting**: 160 chars per segment for GSM-7, 70 for Unicode. Cost increases with segment count.
- **Optimistic entries use localStorage** — keyed by `messaging_pending_{contactId}`, auto-expire after 5 minutes
- **ComposeDialog is full-screen on mobile** — uses `useMediaQuery(theme.breakpoints.down('md'))`
- **Tool cache**: The backend tool registry caches tools. If you add new actions at runtime, call `resetToolCache()`.

### Buddzee Integration
- **compose_message is a client-side custom action** — it doesn't execute a VitalSync mutation. Instead, the ToolRenderer detects it and opens the ComposeDialog with pre-filled content.
- **Deep link**: `navigateToPatient(contactId, { tab: 'activity', subTab: 'messages' })` ensures the activity tab and messages sub-tab are selected before the dialog opens.

## Example Usage

### Opening compose from a button
```tsx
const [composeOpen, setComposeOpen] = useState(false);
const recipient: MessageRecipient = {
  id: patient.id,
  firstName: patient.first_name,
  lastName: patient.last_name,
  email: patient.email,
  smsNumber: patient.sms_number,
};

<Button onClick={() => setComposeOpen(true)}>Compose Message</Button>
<ComposeDialog
  open={composeOpen}
  onClose={() => setComposeOpen(false)}
  recipient={recipient}
  defaultChannel="sms"
  onSent={() => queryClient.invalidateQueries({ queryKey: ['conversationMessages'] })}
/>
```

### Buddzee pre-filling compose
```tsx
// In ToolRenderer, when compose_message is detected:
useMessagingStore.getState().setComposeData({
  contactId: 12345,
  channel: 'email',
  subject: 'Your order update',
  body: 'Hi [First Name],\n\nYour order is being processed...',
  objectTypeId: '0',
  transactional: true,
});
useMessagingStore.getState().openCompose();
```

### Backend: Create and send a message
```typescript
// Step 1: Create shell
const shell = await fetch('https://api.ontraport.com/1/objects/saveorupdate', {
  method: 'POST',
  headers: opHeaders,
  body: JSON.stringify({
    objectID: 7,
    alias: 'Quick SMS - 2024-01-15',
    type: 'sms',
    object_type_id: '0',
  }),
});
const { data: { id: messageId } } = await shell.json();

// Step 2: Add content
await fetch('https://api.ontraport.com/1/objects/saveorupdate', {
  method: 'POST',
  headers: opHeaders,
  body: JSON.stringify({
    objectID: 7,
    id: messageId,
    message_body: 'Hi [First Name], your order is ready for pickup.',
    transactional_email: '1',
  }),
});

// Step 3: Send
await fetch('https://api.ontraport.com/1/message/send', {
  method: 'POST',
  headers: opHeaders,
  body: JSON.stringify({
    objectID: 0,
    ids: [contactId],
    message: { object_type_id: 0, type: 'sms', message_id: Number(messageId) },
  }),
});
```

## Verification Checklist

1. `GET /api/messaging/templates` returns templates via VitalSync proxy
2. `POST /api/messaging/create` creates a template in Ontraport (verify in Ontraport UI)
3. Compose flow: Patient detail → Messages → Compose → type/draft → send → 20s countdown → cancel or complete
4. Template flow: Compose dialog → Templates tab → search/filter → select → preview → send → countdown
5. Countdown cancel: Start send → cancel within 20s → verify message NOT sent
6. Optimistic display: After send completes, "Sending..." entry appears then resolves
7. Mobile: Test full-screen dialog, touch-friendly countdown cancel
8. Merge fields: Verify `[First Name]` etc. appear as-is in Ontraport template (not resolved)
9. Buddzee: "Send this patient an email about..." → compose dialog opens pre-filled
