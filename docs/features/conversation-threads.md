# Conversation Thread Viewer — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Unified conversation timeline that merges messages from email, SMS, calls, and notes into a single chronological view. Includes channel-coded message bubbles, AI-generated thread summary, infinite scroll, and a channel picker for composing new messages. Aggregates Ontraport conversation messages with local call logs.

## Architecture

- **Multi-source merge:** Ontraport conversations (email/SMS) + local call logs + notes
- **Channel-coded UI:** Each message has a channel badge (email=blue, SMS=green, call=orange, note=purple)
- **AI summary:** Optional thread summary generated via n8n workflow (Claude)
- **Infinite scroll:** Paginated via offset parameter, 30 messages per page

```
useConversationThread (aggregator hook)
  ├─ GET /api/communication/thread/:contactId → merged + sorted messages
  │   ├─ Ontraport conversation messages (VitalSync REST proxy)
  │   ├─ Local call logs (MySQL)
  │   └─ AI thread summary (n8n Claude workflow)
  └─ Frontend rendering
      ├─ ThreadSummaryCard (AI summary at top)
      ├─ Virtuoso list of MessageBubble items
      └─ ChannelPicker (bottom bar for composing)
```

## File Inventory (8 files)

### Frontend Components (4 files)
- `src/components/communication/ConversationThread.tsx` — Main thread view
- `src/components/communication/ThreadSummaryCard.tsx` — AI summary card (Buddzee branded)
- `src/components/communication/MessageBubble.tsx` — Channel-coded message bubble
- `src/components/communication/ChannelPicker.tsx` — Bottom bar channel selector

### Frontend Hooks (2 files)
- `src/hooks/useConversationThread.ts` — Aggregator hook with pagination
- `src/hooks/useConversationMessages.ts` — Ontraport conversation message fetcher

### Backend (1 file)
- `server/src/routes/communication.ts` — Thread aggregation endpoint

### Modified (1 file)
- `server/src/index.ts` — Mount communication routes

## Dependencies

```json
{
  "react-virtuoso": "^4.x",
  "@mui/material": "^5.x"
}
```

## Implementation Steps

### 1. Define types

```typescript
type Channel = 'email' | 'sms' | 'call' | 'note' | 'whatsapp';

interface ThreadMessage {
  id: string;
  channel: Channel;
  direction: 'inbound' | 'outbound';
  content: string;
  subject?: string;             // Emails only
  timestamp: string;
  sender?: string;
  callDuration?: number;        // Calls only (seconds)
  callOutcome?: 'connected' | 'voicemail' | 'no_answer' | 'busy';
  aiSummary?: string;
}

interface ThreadSummary {
  text: string;
  generatedAt: string;
  lastContactDate?: string;
  lastChannel?: Channel;
}
```

### 2. Create channel configuration

```typescript
const channelConfig = {
  email: { icon: EmailIcon, label: 'Email', color: '#2196f3' },
  sms: { icon: SmsIcon, label: 'SMS', color: '#4caf50' },
  call: { icon: PhoneIcon, label: 'Call', color: '#ff9800' },
  note: { icon: NoteIcon, label: 'Note', color: '#9c27b0' },
  whatsapp: { icon: WhatsAppIcon, label: 'WhatsApp', color: '#25d366' },
};
```

### 3. Create MessageBubble

```typescript
// Channel badge + timestamp + sender
// Bubble alignment: outbound = right, inbound = left
// Background: outbound = primary tint, inbound = grey
// Email: shows subject line above content
// Call: shows outcome + duration chips
// AI Summary: border-top section with italic grey text
```

### 4. Create backend aggregation endpoint

```typescript
/** GET /api/communication/thread/:contactId */
router.get('/thread/:contactId', requireAuth, async (req, res) => {
  const { contactId } = req.params;
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 30;

  // 1. Fetch Ontraport conversation messages via VitalSync REST proxy
  const messages = await fetchOntraportMessages(contactId);

  // 2. Fetch local call logs from MySQL
  const [callRows] = await pool.execute(
    'SELECT * FROM call_logs WHERE contact_id = ? ORDER BY created_at DESC',
    [contactId]
  );

  // 3. Convert call logs to ThreadMessage format
  const callMessages = callRows.map(call => ({
    id: `call-${call.id}`,
    channel: 'call' as Channel,
    direction: 'outbound' as const,
    content: call.notes || `Call — ${call.outcome}`,
    timestamp: call.created_at,
    callOutcome: call.outcome,
    callDuration: call.duration_seconds,
  }));

  // 4. Merge and sort by timestamp (newest first)
  const all = [...messages, ...callMessages].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // 5. Paginate
  const page = all.slice(offset, offset + limit);

  // 6. Generate AI summary (first page only)
  let summary = null;
  if (offset === 0 && all.length > 0) {
    summary = await generateThreadSummary(contactId, all.slice(0, 10));
  }

  res.json({ messages: page, summary });
});
```

### 5. Create useConversationThread hook

```typescript
function useConversationThread({ contactId }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [summary, setSummary] = useState<ThreadSummary | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const fetchMessages = useCallback(async (offset, append) => {
    const res = await apiFetch(`/api/communication/thread/${contactId}?offset=${offset}&limit=30`);
    const data = await res.json();

    if (append) setMessages(prev => [...prev, ...data.messages]);
    else { setMessages(data.messages); setSummary(data.summary); }

    setHasMore(data.messages.length >= 30);
    offsetRef.current = offset + data.messages.length;
  }, [contactId]);

  const loadMore = () => fetchMessages(offsetRef.current, true);
  const refresh = () => { offsetRef.current = 0; fetchMessages(0, false); };

  return { messages, summary, loading, loadingMore, hasMore, refresh, loadMore };
}
```

### 6. Create ConversationThread view

```tsx
<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
  {summary && <ThreadSummaryCard summary={summary} />}
  <Virtuoso
    style={{ flex: 1 }}
    data={messages}
    endReached={() => { if (hasMore && !loadingMore) loadMore(); }}
    itemContent={(_i, msg) => <MessageBubble message={msg} />}
  />
  <ChannelPicker
    onSelect={(channel) => onCompose?.(channel)}
  />
</Box>
```

### 7. Create ChannelPicker

```typescript
interface ChannelPickerProps {
  activeChannel?: Channel;
  onSelect: (channel: Channel) => void;
  channels?: Channel[];  // Defaults to all
}

// Bottom bar with safe area inset
<Box sx={{ pb: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', borderTop: 1 }}>
  {channels.map(ch => (
    <IconButton key={ch} onClick={() => onSelect(ch)} color={active ? 'primary' : 'default'}>
      <channelConfig[ch].icon />
    </IconButton>
  ))}
</Box>
```

## Timestamp Formatting

```typescript
function formatTimestamp(ts: string): string {
  const diffMins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString();
}
```

## Gotchas & Lessons Learned

- **Thread endpoint is an aggregator** — merges multiple data sources server-side, not just a passthrough.
- **Call logs use negative IDs** (`call-${id}`) to avoid collision with Ontraport message IDs.
- **Ontraport message types:** `EMAIL`, `OUTSMS`, `INSMS`, `CONVO_MESSAGE` — map to channels accordingly.
- **AI summary is optional** — only generate on first page load (offset === 0), skip on pagination.
- **Safe area bottom padding** — `env(safe-area-inset-bottom)` for iOS home indicator.
- **Message bubble alignment** — outbound (staff sent) = right, inbound (received) = left.
- **HTML content in emails** — Ontraport `resource` field may contain HTML. Strip or render safely.
