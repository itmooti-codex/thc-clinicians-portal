# VitalStats SDK: Action Dispatcher Concepts

> **Source:** VitalStats Isomorix Framework (Layer 2) documentation.
> **Context:** This is filtered to only the concepts relevant to using queries, mutations, and understanding execution flow when building apps with the VitalStats SDK. The full Layer 2 covers custom logic functions, LogicBuilder, and framework extension — none of which are needed for SDK consumers.

---

## Why This Matters

When you call `query.fetchAllRecords()` or `mutation.execute()`, a lot happens under the hood. Understanding these concepts helps you:
- Know why `mainDispatchId` matters for coordinating mutations
- Understand optimistic updates and rollback
- Debug transaction failures across multiple models
- Use `toMainInstance()` correctly

---

## Core Concepts

### Actions

Everything in the SDK works through **actions** — plain objects describing an intention:

```javascript
{
  type: 'MUTATION_CREATE',
  payload: {
    modelName: 'Task',
    create: { title: 'New Task' }
  },
  meta: ActionMeta  // Added automatically by the framework
}
```

When you call `mutation.execute()` or `query.fetch()`, the framework dispatches an action that flows through a pipeline of operations.

### The Action Flow

```
Action Dispatched → PREPARE → TRANSFORM → COMMIT → FINALIZE → COMPLETE
```

| Phase | What Happens |
|-------|-------------|
| **PREPARE** | Validation, permission checks, payload setup |
| **TRANSFORM** | Fetch dependencies, query related records |
| **COMMIT** | Persist to database / send to server |
| **FINALIZE** | Validate server response, final state updates |
| **COMPLETE** | Cleanup, notifications, side effects |

You don't interact with these phases directly, but knowing they exist helps when debugging why a mutation failed at a specific stage.

---

## Main vs Pending Stores

Every action creates two things:
1. **Main Store** — the authoritative, committed state
2. **Pending Store** — a working copy where changes happen first

```
Main Store (committed state)
    ↓ action dispatched
Pending Store (working copy)
    ↓ changes made
    ↓ action succeeds
Main Store (changes merged back)
```

**Why this matters for you:**
- `fetchAllRecords()` and `findAllRecords()` return **pending** instances by default
- Use `.pipe(toMainInstance(true))` to wait for the main action to complete and get the committed instances
- If an action fails, the pending store is discarded (automatic rollback)

### When NOT to use toMainInstance

If you're inside a logic flow performing follow-up queries under the same `mainDispatchId`, skip `toMainInstance` — it would wait for an action that hasn't completed yet:

```javascript
// Inside coordinated logic — don't use toMainInstance here
const record = await model.query()
  .where('id', someId)
  .findOneRecord({ dispatchId: action.meta.mainDispatchId });
```

---

## The dispatchId

Every action has two IDs:
- **mainDispatchId** — ID of the overall operation (the "umbrella")
- **pendingDispatchId** — ID of the individual pending action

### Why mainDispatchId Matters

When you pass a `mainDispatchId` to a query or mutation, you're saying: *"If there's already a pending version of this record from a prior step in this operation, use that version."*

```javascript
// Mutation that coordinates across models
const mutation = plugin.mutation();
const contactMutation = mutation.switchTo('Contact');
const orderMutation = mutation.switchTo('Order');

// Create contact
const contact = contactMutation.createOne({ firstName: 'Bob' });

// Create order referencing the contact — uses the pending contact's ID
orderMutation.createOne({
  contactId: contact.id,
  amount: 100
});

await mutation.execute(true).toPromise();
```

The framework ensures both operations share the same `mainDispatchId`, so the order creation sees the pending contact record.

---

## Transactions

**Transactions** coordinate state changes across multiple stores/models, ensuring they all commit together or all roll back.

### When Transactions Are Used

Any mutation that affects multiple models automatically uses transactions:
- All model changes under the same `mainDispatchId` participate in the same transaction
- Models with foreign keys are created/updated in the correct order (referenced record first)
- If any model's mutation fails, all changes roll back

### Transaction Phases

```
Optimistic Phase → Execute Phase → Commit Phase
```

| Phase | What Happens |
|-------|-------------|
| **Optimistic** | Changes visible immediately in UI (pending store) |
| **Execute** | Persist to database / send to server |
| **Commit** | All changes become permanent across all models |

### What This Means for You

You typically don't interact with transactions directly. Just:

1. **Use `plugin.mutation()` for multi-model operations** — creates a shared transaction automatically
2. **Call `execute(true)` to wait for the main action** — ensures all models have committed
3. **Check `mutation.isCancelling`** — indicates if the transaction failed

```javascript
const mutation = plugin.mutation();

// These all participate in the same transaction
mutation.switchTo('Contact').createOne({ firstName: 'Bob' });
mutation.switchTo('Order').createOne({ amount: 100 });
mutation.switchTo('Activity').createOne({ type: 'signup' });

const result = await mutation.execute(true).toPromise();
if (result.isCancelling) {
  console.log('Transaction failed — all changes rolled back');
}
```

---

## ActionMeta Quick Reference

When working with the SDK, you'll encounter `action.meta` in subscription callbacks and advanced patterns. Here are the most useful properties:

| Property | Description |
|----------|-------------|
| `action.meta.instance` | The Plugin, Model, or Record instance |
| `action.meta.store` | Current store reference |
| `action.meta.mainDispatchId` | Use this for coordinated queries/mutations |
| `action.meta.cancel()` | Cancel the current action |
| `action.meta.getSession()` | Get the current user session |

---

## Key Rules

1. **NEVER call `store.value.set()` or `model.value.set()`** — use Mutations for all state changes to Models/Records
2. **NEVER call `store.next(action)`** — use `store.dispatch(action)` instead
3. **Always pass `mainDispatchId`** to queries/mutations when coordinating operations
4. **Use `execute(true)`** to wait for main action completion (records in committed state)
5. **Use `toMainInstance(true)`** on query results when you need committed records

---

## Related SDK Documentation

- **Queries** → `docs/sdk-queries.md`
- **Mutations** → `docs/sdk-mutations.md`
- **Virtual Fields** → `docs/sdk-virtual-fields.md`
- **Persistent Queries** → `docs/sdk-persistent-queries.md`
- **Client-Side SDK Patterns** → `docs/vitalsync-sdk-patterns.md`
