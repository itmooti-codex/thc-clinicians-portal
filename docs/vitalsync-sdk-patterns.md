# VitalSync SDK Patterns

## Loading the SDK
Always load via CDN script tag in `index.html`:
```html
<script async data-chunk="client" src="https://static-au03.vitalstats.app/static/sdk/v1/latest.js" crossorigin="anonymous"></script>
```

## SDK Type Definitions (React Apps)

Every React app needs `src/types/sdk.ts` to type the VitalSync SDK loaded via script tag:

```typescript
declare global {
  interface Window {
    initVitalStatsSDK: (options: {
      slug: string;
      apiKey: string;
      isDefault?: boolean;
    }) => { toPromise: () => Promise<{ plugin?: VitalSyncPlugin }> };
    getVitalStatsPlugin: () => VitalSyncPlugin | undefined;
    toMainInstance: (flag: boolean) => <T>(source: T) => T;
  }
}

export interface VitalSyncPlugin {
  switchTo: (modelName: string) => VitalSyncModel;
  mutation: () => VitalSyncMutation;
  getSession: () => unknown;
}

export interface VitalSyncModel {
  query: () => VitalSyncQuery;
  mutation: () => VitalSyncMutation;
  subscribe: (callback: (model: unknown) => void) => { unsubscribe: () => void };
}

// Full API reference: docs/sdk-queries.md
export interface VitalSyncQuery {
  // Selection
  select: (fields: string[] | string) => VitalSyncQuery;
  selectAll: () => VitalSyncQuery;
  deSelectAll: () => VitalSyncQuery;

  // Where clauses (field, operatorOrValue, value?)
  where: (field: string | string[] | Record<string, unknown> | ((q: VitalSyncQuery) => VitalSyncQuery), operatorOrValue?: unknown, value?: unknown) => VitalSyncQuery;
  andWhere: (field: string | string[] | ((q: VitalSyncQuery) => VitalSyncQuery), operatorOrValue?: unknown, value?: unknown) => VitalSyncQuery;
  orWhere: (field: string | string[] | ((q: VitalSyncQuery) => VitalSyncQuery), operatorOrValue?: unknown, value?: unknown) => VitalSyncQuery;
  whereNot: (field: string | ((q: VitalSyncQuery) => VitalSyncQuery), operatorOrValue?: unknown, value?: unknown) => VitalSyncQuery;
  andWhereNot: (field: string | ((q: VitalSyncQuery) => VitalSyncQuery), operatorOrValue?: unknown, value?: unknown) => VitalSyncQuery;
  orWhereNot: (field: string | ((q: VitalSyncQuery) => VitalSyncQuery), operatorOrValue?: unknown, value?: unknown) => VitalSyncQuery;
  whereIn: (field: string, values: unknown[]) => VitalSyncQuery;
  andWhereIn: (field: string, values: unknown[]) => VitalSyncQuery;
  orWhereIn: (field: string, values: unknown[]) => VitalSyncQuery;
  whereNotIn: (field: string, values: unknown[]) => VitalSyncQuery;
  andWhereNotIn: (field: string, values: unknown[]) => VitalSyncQuery;
  orWhereNotIn: (field: string, values: unknown[]) => VitalSyncQuery;

  // Related records (virtual fields) — see docs/sdk-virtual-fields.md
  include: (virtualFieldName: string, callback: (q: VitalSyncQuery) => VitalSyncQuery) => VitalSyncQuery;
  includeFields: (virtualFieldName: string, fields?: string[]) => VitalSyncQuery;

  // Pagination & ordering
  limit: (count: number) => VitalSyncQuery;
  offset: (count: number) => VitalSyncQuery;
  orderBy: (field: string, direction?: 'asc' | 'desc') => VitalSyncQuery;

  // Calc/aggregation — see "Calc / Aggregation Query Pattern" section below
  count: (field: string, alias: string) => VitalSyncQuery;
  sum: (field: string, alias: string) => VitalSyncQuery;
  avg: (field: string, alias: string) => VitalSyncQuery;
  min: (field: string, alias: string) => VitalSyncQuery;
  max: (field: string, alias: string) => VitalSyncQuery;
  field: (fieldName: string, alias: string) => VitalSyncQuery;

  // Lifecycle
  noDestroy: () => VitalSyncQuery;
  destroy: () => void;

  // Async execution (use .pipe(window.toMainInstance(true)) on all fetch/find methods)
  fetch: (opts?: { variables?: Record<string, unknown> }) => {
    pipe: <T>(fn: T) => { toPromise: () => Promise<Record<string, unknown> | null> };
  };
  fetchAllRecords: (opts?: { variables?: Record<string, unknown> }) => {
    pipe: <T>(fn: T) => { toPromise: () => Promise<Record<string, unknown> | null> };
  };
  fetchOneRecord: (opts?: { variables?: Record<string, unknown> }) => {
    pipe: <T>(fn: T) => { toPromise: () => Promise<unknown | null> };
  };
  fetchAllRecordsArray: (opts?: { variables?: Record<string, unknown> }) => {
    pipe: <T>(fn: T) => { toPromise: () => Promise<unknown[]> };
  };
  fetchDirect: (opts?: { variables?: Record<string, unknown> }) => {
    toPromise: () => Promise<{ resp: unknown[] | null }>;
  };
  findAllRecords: (opts?: { variables?: Record<string, unknown> }) => {
    pipe: <T>(fn: T) => { toPromise: () => Promise<Record<string, unknown> | null> };
  };
  findOneRecord: (opts?: { variables?: Record<string, unknown> }) => {
    pipe: <T>(fn: T) => { toPromise: () => Promise<unknown | null> };
  };

  // Sync execution (local state only — no toMainInstance needed)
  get: () => { records: Record<string, unknown> | null };
  getAllRecords: () => Record<string, unknown> | null;
  getOneRecord: () => unknown | null;
  getAllRecordsArray: () => unknown[];

  // GraphQL
  toGraphql: (opts?: unknown) => string;
  fromGraphql: (graphqlString: string) => VitalSyncQuery;

  // Subscriptions
  subscribe: () => {
    subscribe: (callback: (payload: unknown) => void) => { unsubscribe: () => void };
  };
}

// Full API reference: docs/sdk-mutations.md
export interface VitalSyncMutation {
  switchTo: (modelName: string) => VitalSyncMutation;
  createOne: (data: Record<string, unknown>) => unknown;
  create: (dataArray: Record<string, unknown>[]) => VitalSyncMutation;
  update: (queryOrRecord: unknown, data?: Record<string, unknown>) => VitalSyncMutation;
  delete: (queryOrRecord: unknown) => VitalSyncMutation;
  getMutableRecord: (record: unknown) => unknown;
  execute: (waitForMain?: boolean) => {
    toPromise: () => Promise<unknown>;
    subscribe: (callback: (result: unknown) => void) => { unsubscribe: () => void };
  };
  ofComplete: (waitForMain?: boolean) => {
    subscribe: (callback: (result: unknown) => void) => { unsubscribe: () => void };
  };
  controller: VitalSyncMutation; // Access the PluginMutation
}
```

This file is included in the React template. Re-export SDK types from `src/types/index.ts`:
```typescript
export type { VitalSyncPlugin, VitalSyncModel, VitalSyncQuery, VitalSyncMutation } from './sdk';
```

## Initialization (React Hook)
For React apps, use the `useVitalSync` hook pattern. Config comes from env vars:
```typescript
const CONFIG = {
  slug: import.meta.env.VITE_VITALSYNC_SLUG || '',
  apiKey: import.meta.env.VITE_VITALSYNC_API_KEY || '',
  isDefault: true,
};
```

## Initialization (Vanilla JS)
For Ontraport apps, use the `window.VitalSync` wrapper (from `src/js/vitalsync.js`):
```javascript
// Config comes from window.AppConfig (set by Ontraport merge fields)
window.VitalSync.connect()
  .then(function (plugin) {
    // plugin is ready — run queries
    var records = plugin
      .switchTo('Contact')
      .query()
      .select(['id', 'email'])
      .limit(10)
      .fetchAllRecords()
      .pipe(window.toMainInstance(true))
      .toPromise();
  })
  .catch(function (err) {
    console.error('Connection failed:', err);
  });
```

## Query Pattern
```typescript
// Use the publicName from the schema XML (e.g., 'Contact', 'Order', 'Dispense')
// NOT the internal prefixed name (ThcContact, ThcOrder, ThcDispense)
const records = await plugin
  .switchTo('ThcContact') // ← internal name from schema XML (name attribute, not publicName)
  .query()
  .select(['id', 'email', 'first_name']) // ← column names from schema XML
  .where('status', '=', 'Active') // ← enum values from schema XML
  .limit(100)
  .fetchAllRecords()
  .pipe(window.toMainInstance(true))
  .toPromise();

// IMPORTANT: SDK records have non-enumerable properties — see "Record Conversion" section below
const list = records
  ? Object.values(records).map((r: unknown) => {
      const rec = r as { getState?: () => Record<string, unknown> };
      return (rec?.getState ? rec.getState() : r) as Contact;
    })
  : [];
```

## Search Pattern (LIKE with Multiple Fields)

Use `%` wildcards with `.where()` and `.orWhere()` for multi-field search:

```typescript
const searchTerm = `%${term}%`;
const records = await plugin
  .switchTo('PhyxContact')
  .query()
  .select(['id', 'email', 'first_name', 'last_name', 'sms_number'])
  .where('email', 'like', searchTerm)
  .orWhere('first_name', 'like', searchTerm)
  .orWhere('last_name', 'like', searchTerm)
  .orWhere('sms_number', 'like', searchTerm)
  .limit(100)
  .fetchAllRecords()
  .pipe(window.toMainInstance(true))
  .toPromise();
```

## Query Performance & Limits
- **Keep `.limit()` reasonable** — limits above ~1,000 can cause the SDK to hang or timeout. Use pagination instead.
- DataGrid Pro handles client-side pagination automatically with `pageSizeOptions` and `pagination` props
- For large datasets, fetch a reasonable page (100–500 records) and let DataGrid paginate client-side
- Debounce search inputs to avoid firing queries on every keystroke

## Real-time Subscription Pattern

**CRITICAL subscription payload behaviors:**
- Subscription payloads are **plain objects** (NOT SDK Records) — they do NOT have `getState()`. The `getState` check is a safe fallback but in practice, subscription items are always plain objects.
- Subscription payloads **do NOT include `id`** — you must track the record ID from the query setup and preserve it during merge.
- Payloads may contain `null`/`undefined` for unchanged fields — **never blind-merge** with spread/Object.assign, or you'll overwrite good data with `undefined`. Only merge fields with defined, non-null values.
- The subscription can fire with a `null` payload — always guard against it.
- **Mutations disrupt active subscriptions** — after a `mutation.execute()`, the subscription may silently die. Clean up and re-subscribe after mutations complete.

```typescript
// MUST use noDestroy() to keep query alive
const queryRef = plugin
  .switchTo('ModelName')
  .query()
  .select(['id', 'field1'])
  .where('id', '=', recordId)
  .noDestroy();

const subRef = queryRef.subscribe().subscribe((payload: unknown) => {
  if (!payload) return; // null payloads happen
  let updatedData: Record<string, unknown> | null = null;
  if (Array.isArray(payload) && payload.length > 0) {
    updatedData = payload[0]; // plain object, no getState needed
  } else if (payload && typeof payload === 'object') {
    updatedData = payload as Record<string, unknown>;
  }
  if (updatedData && typeof updatedData === 'object' && Object.keys(updatedData).length > 0) {
    // Only merge defined, non-null values — payload has undefined for unchanged fields
    setRecord(prev => {
      const merged = { ...prev };
      Object.keys(updatedData!).forEach(key => {
        if (updatedData![key] !== undefined && updatedData![key] !== null) {
          merged[key] = updatedData![key];
        }
      });
      merged.id = recordId; // preserve id — not included in subscription payloads
      return merged;
    });
  }
});

// Cleanup
subRef.unsubscribe();
queryRef.destroy();
```

**Vanilla JS equivalent (Ontraport apps):**
```javascript
contactSub = contactQuery.subscribe().subscribe(function (payload) {
  if (!payload) return;
  var updatedData = null;
  if (Array.isArray(payload) && payload.length > 0) {
    updatedData = payload[0]; // plain object
  } else if (payload && typeof payload === 'object') {
    updatedData = payload;
  }
  if (updatedData && typeof updatedData === 'object' && Object.keys(updatedData).length > 0) {
    var merged = Object.assign({}, currentContact);
    Object.keys(updatedData).forEach(function (key) {
      if (updatedData[key] !== undefined && updatedData[key] !== null) {
        merged[key] = updatedData[key];
      }
    });
    merged.id = contactId; // preserve known id
    currentContact = merged;
    renderContactDetail(currentContact);
  }
});
```

## Subscription Payload Extraction Utility

Subscription payloads arrive in multiple formats. Use this utility to normalize them:

```typescript
function extractRecordData(payload: unknown): Record<string, unknown> | null {
  // Format 1: Array of records (most common)
  if (Array.isArray(payload) && payload.length > 0) {
    const item = payload[0] as { getState?: () => Record<string, unknown> };
    return item?.getState ? item.getState() : (item as Record<string, unknown>);
  }
  // Format 2: Object with records property
  if (payload && typeof payload === 'object' && 'records' in payload) {
    const records = (payload as { records: Record<string, unknown> }).records;
    const record = Object.values(records)[0] as { getState?: () => Record<string, unknown> };
    return record?.getState ? record.getState() : (record as Record<string, unknown>);
  }
  // Format 3: Direct record object
  if (payload && typeof payload === 'object' && 'id' in payload) {
    const record = payload as { getState?: () => Record<string, unknown>; id: string };
    return record?.getState ? record.getState() : (record as Record<string, unknown>);
  }
  return null;
}
```

## Subscription Lifecycle with Refs (React)

Use React refs to track subscription and query objects for proper cleanup:

```typescript
const queryRef = useRef<VitalSyncQuery | null>(null);
const subRef = useRef<{ unsubscribe: () => void } | null>(null);

const subscribe = useCallback(() => {
  queryRef.current = plugin
    .switchTo('PhyxContact')
    .query()
    .select([...fields])
    .where('id', '=', recordId)
    .noDestroy();

  subRef.current = queryRef.current.subscribe().subscribe((payload: unknown) => {
    const data = extractRecordData(payload);
    if (data && data.id) {
      setRecord(prev => ({ ...prev, ...data } as Contact));
    }
  });
}, [plugin, recordId]);

const cleanup = useCallback(() => {
  if (subRef.current) {
    subRef.current.unsubscribe();
    subRef.current = null;
  }
  if (queryRef.current) {
    try { queryRef.current.destroy(); } catch { /* ignore */ }
    queryRef.current = null;
  }
}, []);

useEffect(() => {
  subscribe();
  return cleanup;
}, [subscribe, cleanup]);
```

## Direct GraphQL API (Alternative for Complex Queries)

The VitalSync SDK query builder **does** support calc/aggregation queries (e.g. `calcContacts`, `calcObjectLogEntries`). Past failures with calc queries were caused by referencing **invalid fields**, not by SDK limitations.

However, direct `fetch()` against the GraphQL API is a useful **alternative** when you want full control over query syntax — especially for complex cross-model joins with `field()` aliasing, `orderBy` clauses, or when debugging query issues independently of the SDK.

**Endpoint pattern:** `https://{slug}.vitalstats.app/api/v1/graphql`

**Required headers:**
```
Content-Type: application/json
Accept: application/json
Api-Key: <your-api-key>
```

**React app example (TanStack Query + direct fetch):**
```typescript
const GRAPHQL_ENDPOINT = `https://${import.meta.env.VITE_VITALSYNC_SLUG}.vitalstats.app/api/v1/graphql`;
const API_KEY = import.meta.env.VITE_VITALSYNC_API_KEY;

const GRAPHQL_QUERY = `query calcObjectLogEntryItems(
  $Contact_id: PhyxContactID!
  $limit: IntScalar
  $offset: IntScalar
) {
  calcObjectLogEntryItems(
    query: [
      { where: { Object_Log_Entry: [{ where: { Contact_id: $Contact_id } }] } }
      { andWhere: { object_type_id: 0 } }
    ]
    limit: $limit
    offset: $offset
    orderBy: [{ path: ["Timestamp"], type: desc }]
  ) {
    ID: field(arg: ["id"])
    Details: field(arg: ["details"])
    MessageSubject: field(arg: ["Message", "subject"])
    Message_Body: field(arg: ["Message", "message_body"])
    Status: field(arg: ["status"])
  }
}`;

async function fetchGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Api-Key': API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}
```

**Vanilla JS equivalent (Ontraport apps):**
```javascript
var GRAPHQL_ENDPOINT = 'https://' + window.AppConfig.SLUG + '.vitalstats.app/api/v1/graphql';

function fetchGraphQL(query, variables) {
  return fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Api-Key': window.AppConfig.API_KEY,
    },
    body: JSON.stringify({ query: query, variables: variables }),
  })
  .then(function (res) { return res.json(); })
  .then(function (json) {
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
    return json.data;
  });
}
```

**When to use direct GraphQL vs SDK query builder:**
- **SDK query builder** (`.switchTo().query().where().select()`) — Use for standard CRUD queries, calc/aggregation queries, subscriptions, local state caching, and optimistic updates. This is the default choice.
- **Direct GraphQL API** — Use when you want full control over query syntax: complex cross-model joins with `field()` aliasing, `orderBy` clauses, or when debugging query issues. Also useful when you don't need SDK features (subscriptions, caching).

**Key differences from SDK queries:**
- No `.pipe(window.toMainInstance(true))` needed — results are plain JSON
- No `.getState()` conversion needed — response objects are already plain
- No real-time subscription support — polling or manual refetch only
- Results come in `{ data: { queryName: [...] } }` shape

**Variable type naming:** The GraphQL variable types use the SDK's prefixed model name + "ID" suffix for foreign key references (e.g., `PhyxContactID!` for a Contact FK). Scalar types use `IntScalar`, `StringScalar`, etc.

## Direct WebSocket Subscriptions (Without SDK)

The SDK handles subscriptions internally, but you can also use VitalStats WebSocket subscriptions **directly** — essential for vanilla JS apps or when you need full control over the subscription lifecycle (dynamic filter changes, multiple independent sockets, etc.).

### WebSocket Endpoint & Protocol

```
Endpoint: wss://{slug}.vitalstats.app/api/v1/graphql?apiKey={API_KEY}
Protocol: "vitalstats" (custom subprotocol — MUST pass as second arg to WebSocket)
```

```javascript
const socket = new WebSocket(WS_ENDPOINT, "vitalstats");
```

### Message Types

| Direction | Type | Purpose |
|-----------|------|---------|
| Client → Server | `CONNECTION_INIT` | Initialize connection |
| Server → Client | `CONNECTION_ACK` | Connection acknowledged, ready for subscriptions |
| Client → Server | `GQL_START` | Start a subscription (with query + variables) |
| Client → Server | `GQL_STOP` | Stop a subscription by ID |
| Server → Client | `GQL_DATA` | Subscription data update |
| Server → Client | `GQL_ERROR` | Subscription error |
| Server → Client | `GQL_COMPLETE` | Subscription ended |
| Client → Server | `KEEP_ALIVE` | Heartbeat (send every 80 seconds) |
| Client → Server | `CONNECTION_TERMINATE` | Graceful disconnect |

### Connection Lifecycle

```javascript
const PROTOCOL = "vitalstats";
const SUB_ID = "my-subscription";
const KEEPALIVE_MS = 80000; // 80 seconds
const MAX_BACKOFF = 30000;  // 30 seconds max between reconnects

let socket = null;
let backoff = 1000;
let keepAliveTimer = null;

function connect() {
  if (socket?.readyState === WebSocket.OPEN) return;

  socket = new WebSocket(WS_ENDPOINT, PROTOCOL);

  socket.addEventListener("open", () => {
    backoff = 1000; // Reset on successful connect
    socket.send(JSON.stringify({ type: "CONNECTION_INIT" }));

    // Keep-alive heartbeat every 80 seconds
    keepAliveTimer = setInterval(() => {
      socket.send(JSON.stringify({ type: "KEEP_ALIVE" }));
    }, KEEPALIVE_MS);
  });

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "CONNECTION_ACK") {
      // Start subscription after ACK
      socket.send(JSON.stringify({
        id: SUB_ID,
        type: "GQL_START",
        payload: {
          query: SUBSCRIPTION_QUERY,
          variables: { /* ... */ }
        }
      }));
    }

    if (msg.type === "GQL_DATA" && msg.id === SUB_ID) {
      const data = msg.payload.data;
      // Handle incoming subscription data
    }
  });

  socket.addEventListener("close", () => {
    clearInterval(keepAliveTimer);
    socket = null;
    // Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s max
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
  });
}
```

### Stopping & Restarting Subscriptions

When subscription filters change (e.g., user updates notification preferences), stop and restart without reconnecting:

```javascript
function refreshSubscription(newQuery, newVariables) {
  socket.send(JSON.stringify({ id: SUB_ID, type: "GQL_STOP" }));
  socket.send(JSON.stringify({
    id: SUB_ID,
    type: "GQL_START",
    payload: { query: newQuery, variables: newVariables }
  }));
}
```

### Visibility / Inactivity Management

Disconnect after prolonged inactivity to save resources, reconnect when user returns:

```javascript
const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
let inactivityTimer;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    inactivityTimer = setTimeout(() => {
      socket?.send(JSON.stringify({ type: "CONNECTION_TERMINATE" }));
      socket?.close();
    }, INACTIVITY_MS);
  } else {
    clearTimeout(inactivityTimer);
    if (!socket || socket.readyState === WebSocket.CLOSED) connect();
  }
});
```

### React Hook Pattern

```typescript
function useVitalStatsSubscription<T>(
  query: string,
  variables: Record<string, unknown>,
  onData: (data: T) => void
) {
  const socketRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);

  useEffect(() => {
    let keepAlive: ReturnType<typeof setInterval>;

    function connect() {
      const ws = new WebSocket(WS_ENDPOINT, "vitalstats");
      ws.onopen = () => {
        backoffRef.current = 1000;
        ws.send(JSON.stringify({ type: "CONNECTION_INIT" }));
        keepAlive = setInterval(() => ws.send(JSON.stringify({ type: "KEEP_ALIVE" })), 80000);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "CONNECTION_ACK") {
          ws.send(JSON.stringify({ id: "sub", type: "GQL_START", payload: { query, variables } }));
        }
        if (msg.type === "GQL_DATA") onData(msg.payload.data);
      };
      ws.onclose = () => {
        clearInterval(keepAlive);
        setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, 30000);
      };
      socketRef.current = ws;
    }

    connect();
    return () => {
      clearInterval(keepAlive);
      socketRef.current?.close();
    };
  }, [query, variables]);
}
```

### Account Name Prefix for Type IDs

When writing direct GraphQL (HTTP or WebSocket), variable types use the **account name** as prefix:

```
${AccountName}FeedID        → EventmxFeedID
${AccountName}ContactID     → EventmxContactID
```

The account name is case-sensitive and matches the VitalStats account slug with original casing.

---

## VitalStats REST File Upload API (S3)

Upload files to VitalStats-managed S3 storage using a 3-step pre-signed URL flow.

### Endpoint

```
GET https://{slug}.vitalstats.app/api/v1/rest/upload?type={mimeType}&name={fileName}&generateName=1
Header: Api-Key: {apiKey}
```

### Three-Step Upload Process

```javascript
// Step 1: Request pre-signed S3 URL
async function requestUploadDetails(file) {
  const params = new URLSearchParams({
    type: file.type,       // e.g. "image/png"
    name: file.name,       // e.g. "photo.png"
    generateName: '1'      // Auto-generate unique filename
  });
  const res = await fetch(
    `https://${slug}.vitalstats.app/api/v1/rest/upload?${params}`,
    { headers: { 'Api-Key': API_KEY } }
  );
  const json = await res.json();
  return json.data; // { uploadUrl, url, key }
}

// Step 2: Upload file directly to S3
async function uploadFileToS3(uploadUrl, file) {
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file // Raw File or Blob
  });
}

// Step 3: Combined helper — returns the final CDN URL
async function uploadAndGetUrl(file) {
  const { uploadUrl, url } = await requestUploadDetails(file);
  await uploadFileToS3(uploadUrl, file);
  return url; // Permanent CDN URL for the uploaded file
}
```

### Supported File Types

Images (jpg, png, gif, webp), video (mp4, webm), audio (mp3, wav, ogg), documents (PDF, Word).

### Storing File Metadata on Records

When attaching uploaded files to VitalStats records (e.g., Feed posts), store metadata as JSON strings:

```javascript
{
  file_content: JSON.stringify({ link: url, name: "photo.png", size: "5.23mb", type: "image/png" }),
  file_type: "Image",       // "Image" | "Video" | "Audio" | "File"
  file_name: "photo.png",
  file_link: JSON.stringify({ link: url }),
  file_size: "5.23mb",      // Human-readable
  image_orientation: "landscape" // "landscape" | "portrait" | null
}
```

---

## Mutation Pattern (SDK)

**IMPORTANT:** Mutations disrupt active subscriptions. After a mutation completes, clean up the existing subscription and re-subscribe. Capture the record ID before creating the mutation to avoid closure issues.

```typescript
// Capture id before mutation (avoids stale closure if subscription fires during mutation)
const contactId = currentContact.id;
const mutation = plugin.switchTo('ModelName').mutation();

mutation.update((q) =>
  q.where('id', contactId).set(updates)
);

await mutation.execute(true).toPromise();

// After mutation: re-establish subscription (mutation disrupts it)
cleanupSubscription();
subscribeToRecord(contactId);
```

## Direct GraphQL Mutations (HTTP API)

When performing mutations via direct `fetch()` against the GraphQL API (not the SDK), the `query` parameter **MUST** be inline in the GraphQL string with `_OPERATOR_` specified.

### CRITICAL: Never Pass `query` as a GraphQL Variable

The VitalStats GraphQL API **silently ignores `where` clauses** when `query` is passed as a `$variable` (e.g., `$query: [ContactQueryBuilderInput]`). This causes the mutation to apply to **ALL records** instead of the targeted one. The API returns success with no error — making this an extremely dangerous silent failure.

```typescript
// WRONG — silently ignores where clause, updates ALL records!
const result = await gql(
  `mutation updateContact($payload: ContactUpdateInput, $query: [ContactQueryBuilderInput]) {
    updateContact(payload: $payload, query: $query) { id }
  }`,
  {
    query: [{ where: { id: 9113 } }],  // ← SILENTLY IGNORED
    payload: fields,
  },
);

// CORRECT — inline query with _OPERATOR_ targets specific record
const numericId = Number(recordId);
const result = await gql(
  `mutation updateContact($payload: ContactUpdateInput) {
    updateContact(payload: $payload, query: [{ where: { id: ${numericId}, _OPERATOR_: eq } }]) { id }
  }`,
  { payload: fields },
);
```

### Required Pattern for All Direct GraphQL Mutations

1. **`query:` must be inline** in the GraphQL string (NOT a `$variable`)
2. **`_OPERATOR_` must be specified** in the where clause (e.g., `_OPERATOR_: eq`)
3. **`$payload` can still be a variable** — only `$query` is broken
4. **Always validate the returned ID** matches the requested ID:

```typescript
if (result?.updateContact?.id !== numericId) {
  console.error('TARGETING ERROR: requested', numericId, 'but updated', result?.updateContact?.id);
}
```

### Create Mutations (no query needed)

Create mutations don't need a `query` parameter and work fine with `$payload` as a variable:

```typescript
const result = await gql(
  `mutation createContact($payload: ContactCreateInput) {
    createContact(payload: $payload) { id email }
  }`,
  { payload: fields },
);
```

### Read Queries (same inline rule applies)

`getContact` (singular) always returns the first record regardless of query. Use `getContacts` (plural) with inline query:

```graphql
# WRONG — getContact ignores query, always returns first record
{ getContact(query: [...]) { id } }

# CORRECT — getContacts (plural) with inline query
{ getContacts(query: [{ where: { id: 9113, _OPERATOR_: eq } }]) { id email } }
```

## CRITICAL: Record Immutability
SDK Record objects have protected setters. NEVER use:
- `Object.assign(record, data)` — WILL THROW ERROR
- `record.field = value` — WILL THROW ERROR

ALWAYS use spread operator to create plain objects:
```typescript
const updated = { ...existingData, ...newData };
```

## CRITICAL: SDK Records Have Non-Enumerable Properties
VitalSync SDK record objects wrap their data in non-enumerable properties. This means:
- `{ ...record }` produces `{}` (empty object)
- `Object.keys(record)` returns `[]`
- `JSON.stringify(record)` returns `"{}"`

This breaks any code that expects a plain JS object (e.g., MUI DataGrid needs an enumerable `id` field).

**Solution:** Use `record.getState()` to extract a plain JS object with all properties:
```typescript
// Converting a single record
const plain = record.getState ? record.getState() : record;

// Converting query results to a plain array (use after every fetchAllRecords)
const list = records
  ? Object.values(records).map((r: unknown) => {
      const rec = r as { getState?: () => Record<string, unknown> };
      return (rec?.getState ? rec.getState() : r) as ModelType;
    })
  : [];
```

**When is `getState()` needed?**
- Before passing records to MUI DataGrid rows
- Before spreading record properties (`{ ...record, ...updates }`)
- Before iterating fields with `Object.keys()` / `Object.entries()`
- Before serializing with `JSON.stringify()`

**Note:** Subscription payloads are **plain objects** (NOT wrapped SDK Records). They don't have `getState()` and don't need conversion. However, they also don't include the `id` field — see the Real-time Subscription Pattern section above for the correct merge strategy.

---

## VitalSync Context Provider Pattern

Provide the VitalSync plugin instance to the entire React component tree:

```typescript
// src/contexts/VitalSyncContext.tsx
import { createContext, useContext } from 'react';
import type { VitalSyncPlugin } from '../types/sdk';

const VitalSyncContext = createContext<VitalSyncPlugin | null>(null);

export function VitalSyncProvider({ plugin, children }: { plugin: VitalSyncPlugin; children: React.ReactNode }) {
  return <VitalSyncContext.Provider value={plugin}>{children}</VitalSyncContext.Provider>;
}

export function usePlugin(): VitalSyncPlugin {
  const ctx = useContext(VitalSyncContext);
  if (!ctx) throw new Error('usePlugin must be used within VitalSyncProvider');
  return ctx;
}
```

**Usage in App.tsx:**
```typescript
function App() {
  const { plugin, status } = useVitalSync();
  if (status !== 'connected' || !plugin) return <LoadingScreen />;
  return (
    <VitalSyncProvider plugin={plugin}>
      <Dashboard />
    </VitalSyncProvider>
  );
}
```

**Usage in any child component:**
```typescript
function RecordList() {
  const plugin = usePlugin(); // throws if no provider
  // Use plugin for queries, subscriptions, mutations...
}
```

---

## Calc / Aggregation Query Pattern

VitalSync's `calc` queries (`calcModelName`) are far more powerful than basic `get` queries (`getModelName`). They resolve related records server-side in a single request, eliminating the need for separate queries per relationship.

**Performance impact:** A page that previously needed 4+ sequential GraphQL requests (records, then related child records, then contacts) was reduced to 1 request using a calc query with field traversal. Page load dropped from ~8s to ~2.5s.

The query name is `calc` + pluralized publicName (e.g., `calcContacts`, `calcObjectLogEntries`, `calcDispenseRequests`).

### Basic Syntax

```graphql
{
  calcContacts(
    query: [
      { where: { status: "Active", _OPERATOR_: eq } }
      { andWhere: { created_at: $start, _OPERATOR_: gte } }
    ]
    limit: 20
    offset: 0
    orderBy: [{ path: ["created_at"], type: desc }]
  ) {
    # fields go here using field(), count(), max(), concat(), etc.
  }
}
```

Supports the same `query`, `limit`, `offset`, and `orderBy` parameters as `get` queries.

### Calc vs Get — When to Use Each

| Feature | `get` Query | `calc` Query |
|---|---|---|
| Returns | Raw record objects | Calculated/aggregated result objects |
| Related data | Must fetch separately | Resolved server-side via `field()` traversal |
| Aggregations | Not supported | `count()`, `sum()`, `avg()`, `min()`, `max()` |
| String ops | Not supported | `concat()` for combining fields |
| Network calls | 1 per model + relationships | 1 total |
| `id` field | Included automatically | Must explicitly request via `field(arg: ["id"])` |

**Use calc queries when:**
- You need data from related models (avoid N+1 query waterfalls)
- You need counts or aggregations of child records
- You want to combine fields (e.g. first + last name)
- Performance matters (list pages, dashboards)

**Use get queries when:**
- You need the raw record with all standard fields
- You're doing simple single-model lookups
- You need SDK record objects (with `getState()`, subscriptions, etc.)

### Field Functions

#### `field()` — Read a field value

Read a field directly from the queried model:

```graphql
status: field(arg: ["status"])
unique_id: field(arg: ["unique_id"])
request_date: field(arg: ["request_date"])
```

The alias (left of `:`) is the key name in the returned JSON. The `arg` array is the field path.

#### `field()` — Traverse relationships (the N+1 killer)

Follow FK relationships to read fields from related models in a single query:

```graphql
# One level deep: Order → Line_Item
line_item_name: field(arg: ["Line_Item", "name"])
line_item_variant: field(arg: ["Line_Item", "variant_title"])

# Two levels deep: Order → Line_Item → Customer (Contact)
patient_first: field(arg: ["Line_Item", "Customer", "first_name"])

# Another relationship: Order → Script
script_type: field(arg: ["Patient_Script", "script_type"])
```

**Relationship names** are derived from the FK field name by removing the `_id` suffix and using the model reference name. Check the schema for the exact names. Common patterns:

| FK Field | Relationship Name |
|---|---|
| `line_item_id` | `Line_Item` |
| `customer_id` | `Customer` |
| `contact_id` | `Contact` |
| `owner_id` | `Owner` |

#### `count()` — Count records or related records

```graphql
# Count the queried records themselves
total: count(args: [{ field: ["id"] }])

# Count child records through a reverse relationship
notes_count: count(args: [{ field: ["Notes", "id"] }])
```

**IMPORTANT:** The bare `{ count }` syntax does NOT work (400 error). You MUST use the `args: [{ field: [...] }]` pattern. Response is always an array: `[{ "result": N }]` — access `[0].result`.

#### `sum()` / `avg()` / `max()` / `min()` — Aggregations

```graphql
total_spent: sum(args: [{ field: ["Purchases", "total_purchase"] }])
avg_order: avg(args: [{ field: ["Purchases", "total_purchase"] }])
latest_note: max(args: [{ field: ["Notes", "note"] }])
```

#### `concat()` — Combine multiple fields

Join field values with separators:

```graphql
patient_name: concat(args: [
  { field: ["Line_Item", "Customer", "first_name"] }
  { value: " ", operator: "+" }
  { field: ["Line_Item", "Customer", "last_name"], operator: "+" }
])
```

Each item after the first needs `operator: "+"` to concatenate. The `value` property inserts a literal string (here a space separator).

### Aliased Count Queries

Request multiple calc operations in a single GraphQL query using aliases. Ideal for fetching counts per status:

```graphql
{
  active: calcContacts(
    query: [{ where: { status: "Active", _OPERATOR_: eq } }]
  ) {
    result: count(args: [{ field: ["id"] }])
  }

  inactive: calcContacts(
    query: [{ where: { status: "Inactive", _OPERATOR_: eq } }]
  ) {
    result: count(args: [{ field: ["id"] }])
  }
}
```

Returns:
```json
{
  "active": [{ "result": 258 }],
  "inactive": [{ "result": 14 }]
}
```

This replaces N individual count requests with 1 network call.

### Complete Real-World Example

Single query that fetches paginated records with all related data resolved server-side:

```graphql
{
  calcDispenseRequests(
    query: [
      { where: { pharmacy_contact_id: 364, _OPERATOR_: eq } }
      { andWhere: { status: "Preparing", _OPERATOR_: eq } }
    ]
    limit: 20
    offset: 0
    orderBy: [{ path: ["request_date"], type: asc }]
  ) {
    unique_id: field(arg: ["unique_id"])
    status: field(arg: ["status"])
    request_date: field(arg: ["request_date"])
    item: field(arg: ["item"])
    notes_count: count(args: [{ field: ["Notes", "id"] }])
    latest_note: max(args: [{ field: ["Notes", "note"] }])
    line_item_name: field(arg: ["Line_Item", "name"])
    line_item_variant: field(arg: ["Line_Item", "variant_title"])
    patient_name: concat(args: [
      { field: ["Line_Item", "Customer", "first_name"] }
      { value: " ", operator: "+" }
      { field: ["Line_Item", "Customer", "last_name"], operator: "+" }
    ])
    script_type: field(arg: ["Patient_Script", "script_type"])
    escript_link: field(arg: ["Patient_Script", "escript_link"])
  }
}
```

This single query replaces what would otherwise be:
1. `getDispenseRequests` — fetch the 20 records
2. `getLineItems` — fetch related line items by ID
3. `getScripts` — fetch related scripts by ID
4. `getContacts` — fetch patient contacts by ID (depends on LineItem data)

### Aggregation with Time Variables

```graphql
# Count with date filter
query q($start: TimestampSecondsScalar!, $end: TimestampSecondsScalar!) {
  calcContacts(
    query: [
      { where: { date_applied: $start, _OPERATOR_: gte } }
      { andWhere: { date_applied: $end, _OPERATOR_: lte } }
    ]
  ) {
    result: count(args: [{ field: ["id"] }])
  }
}

# Sum with filter
query q($start: TimestampSecondsScalar!, $end: TimestampSecondsScalar!) {
  calcPurchases(
    query: [
      { where: { created_at: $start, _OPERATOR_: gte } }
      { andWhere: { created_at: $end, _OPERATOR_: lte } }
      { andWhere: { status: "Paid", _OPERATOR_: eq } }
    ]
  ) {
    result: sum(args: [{ field: ["total_purchase"] }])
  }
}

# Using server-side time variables (no client-side timestamp computation needed)
# Pass 0 for current period, -1 for previous, etc.
query q($X_WEEK_BEGIN: TimestampSecondsScalar!) {
  calcContacts(
    query: [{ where: { created_at: $X_WEEK_BEGIN, _OPERATOR_: gt } }]
  ) {
    total: count(args: [{ field: ["id"] }])
  }
}
# variables: { "X_WEEK_BEGIN": 0 }
```

**Available server-side time variables** (declare as `$X_VAR: TimestampSecondsScalar!`, pass `0` for current):
- Year: `X_YEAR`, `X_YEAR_BEGIN`, `X_YEAR_END`
- Month: `X_MONTH`, `X_MONTH_BEGIN`, `X_MONTH_END`, `X_MONTH_WEEK_1-4_BEGIN/END`
- Week: `X_WEEK`, `X_WEEK_BEGIN`, `X_WEEK_END`
- Day: `X_DAY`, `X_DAY_BEGIN`, `X_DAY_END`
- Weekdays: `X_MONDAY` through `X_SUNDAY` (each with `_BEGIN`/`_END`)
- Time: `X_HOUR`, `X_MINUTE`, `X_SECOND` (each with `_BEGIN`/`_END`)

### Query Operators

Tested against the live API — these are the valid `_OPERATOR_` values for direct GraphQL:

| Operator | Meaning | Works? |
|----------|---------|--------|
| `eq` | Equal to | Yes |
| `neq` | Not equal to | Yes |
| `gt` | Greater than | Yes |
| `gte` | Greater than or equal | Yes |
| `lt` | Less than | Yes |
| `lte` | Less than or equal | Yes |
| `in` | Array membership (value is `[...]`) | Yes |

**Important:**
- `ne` does **NOT** work — use `neq` instead
- The `_var` suffixed operators (`eq_var`, `gt_var`, etc.) do **NOT** work via direct GraphQL. They are not needed — regular operators work with `$variable` references automatically.
- The `contains` operator does not exist — use `eq` for exact match

### TypeScript / JavaScript Helper

For complex filtering, use direct GraphQL with a helper function:

```typescript
const GRAPHQL_ENDPOINT = `https://${import.meta.env.VITE_VITALSYNC_SLUG}.vitalstats.app/api/v1/graphql`;
const API_KEY = import.meta.env.VITE_VITALSYNC_API_KEY;

async function gqlFetch<T>(query: string, variables: Record<string, unknown>, dataKey: string): Promise<T[]> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Api-Key': API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return (json.data?.[dataKey] ?? []) as T[];
}
```

Vanilla JS version (Ontraport apps):

```javascript
var url = 'https://' + slug + '.vitalstats.app/api/v1/graphql';

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Api-Key': apiKey,
  },
  body: JSON.stringify({ query: queryString }),
})
  .then(function (res) { return res.json(); })
  .then(function (json) {
    var rows = json.data.calcModelName || [];
    // Each row is a flat object with your aliased field names
    // e.g. rows[0].patient_name, rows[0].line_item_name, etc.
  });
```

**SDK + GraphQL hybrid pattern** — use GraphQL for bulk filtering/aggregation, SDK for final record fetch:

```typescript
// 1. GraphQL: get ordered IDs from child records
const childRecords = await gqlFetch<{ id: number; parentId: number; Date_Created: number }>(
  `query { modelItems(where: { status: { eq: "active" } }, orderBy: { Date_Created: DESC }) { id parentId Date_Created } }`,
  {}, 'modelItems'
);
const orderedParentIds = [...new Set(childRecords.map(r => r.parentId))];

// 2. SDK: fetch parent records by IDs (preserving order)
let query = plugin.switchTo('ParentModel').query().select(fields).where('id', '=', orderedParentIds[0]);
for (let i = 1; i < orderedParentIds.length; i++) {
  query = query.orWhere('id', '=', orderedParentIds[i]);
}
const records = await query.limit(orderedParentIds.length).fetchAllRecords().pipe(window.toMainInstance(true)).toPromise();
const parents = convertRecords(records);

// 3. Re-sort by original child-record order
const parentMap = new Map(parents.map(p => [p.id, p]));
return orderedParentIds.map(id => parentMap.get(id)).filter(Boolean);
```

### Calc Query Gotchas

- **Null relationships:** If a related record doesn't exist (e.g. no Script linked), traversed fields return `null`. Always handle nulls in your rendering code.
- **Relationship names:** These come from the schema's FK field definitions, not the model names. Check your schema for the exact relationship path names.
- **`count()` on self vs children:** Use `count(args: [{ field: ["id"] }])` (no relationship prefix) to count the queried records themselves. Use `count(args: [{ field: ["RelatedModel", "id"] }])` to count child records.
- **Aliased counts return arrays:** Even `count()` returns `[{ "result": N }]` — always access `[0].result`.
- **`orderBy` path syntax:** Uses `path: ["field_name"]` array format, same as get queries.
- **`id` field not automatic:** Unlike `get` queries, calc queries do NOT include `id` by default. You must explicitly request it: `id: field(arg: ["id"])`.

---

## Persistent Queries (PUIDs)

Pre-built queries stored in VitalStats that can be called by ID instead of raw GraphQL:

```typescript
// POST to the same GraphQL endpoint with puid instead of query
async function fetchPersistentQuery(puid: string, variables: Record<string, unknown>) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Api-Key': API_KEY },
    body: JSON.stringify({ puid, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  // PUIDs may return { data: [...] } or { data: { queryName: [...] } }
  if (Array.isArray(json.data)) return json.data;
  const keys = Object.keys(json.data || {});
  return keys.length ? json.data[keys[0]] : [];
}
```

**Parallel PUIDs with deduplication** — fetch from multiple models, normalize, and deduplicate:

```typescript
const PUIDS = [
  { puid: 'abc123', source: 'contacts' },
  { puid: 'def456', source: 'orders' },
];

async function fetchAllNotes(contactId: number) {
  const results = await Promise.allSettled(
    PUIDS.map((q) =>
      fetchPersistentQuery(q.puid, { id: contactId, limit: 50, offset: 0 })
        .then((rows) => rows.map((row) => normalizeRow(row, q.source)))
    )
  );

  const allNotes = results
    .filter((r): r is PromiseFulfilledResult<Note[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  // Deduplicate by composite key
  const seen = new Set<string>();
  return allNotes
    .filter((entry) => {
      const key = `${entry.timestamp}-${entry.text.slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}
```

---

## Time-Bucketed Metrics Pattern

Aggregate timestamps into hourly/daily/monthly buckets for chart display:

```typescript
type DateRange = 'today' | 'yesterday' | '7days' | 'thisMonth' | 'lastMonth' | 'financialYear';
type BucketMode = 'hourly' | 'daily' | 'monthly';

interface DateBounds {
  start: number;   // Unix seconds
  end: number;     // Unix seconds
  labels: string[];
  mode: BucketMode;
}

// Australian financial year: July 1 – June 30
function getFYStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 6, 1, 0, 0, 0, 0);
}

function getDateBounds(range: DateRange): DateBounds {
  const now = new Date();
  let start: Date, end: Date, labels: string[], mode: BucketMode;

  switch (range) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = now;
      labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      mode = 'hourly';
      break;
    case '7days':
      start = new Date(now.getTime() - 7 * 86400000);
      end = now;
      labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start.getTime() + i * 86400000);
        return d.toLocaleDateString('en-AU', { weekday: 'short' });
      });
      mode = 'daily';
      break;
    case 'financialYear':
      start = getFYStart();
      end = now;
      labels = []; // Generate month labels from start to end
      mode = 'monthly';
      break;
    // ... other ranges
  }
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000), labels, mode };
}

function bucketCounts(timestamps: number[], bounds: DateBounds): number[] {
  const buckets = new Array(bounds.labels.length).fill(0);
  for (const ts of timestamps) {
    if (!ts || ts < bounds.start || ts > bounds.end) continue;
    let index: number;
    switch (bounds.mode) {
      case 'hourly': index = new Date(ts * 1000).getHours(); break;
      case 'daily': index = Math.floor((ts - bounds.start) / 86400); break;
      case 'monthly': {
        const d = new Date(ts * 1000);
        const s = new Date(bounds.start * 1000);
        index = (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth());
        break;
      }
    }
    if (index >= 0 && index < buckets.length) buckets[index]++;
  }
  return buckets;
}
```
