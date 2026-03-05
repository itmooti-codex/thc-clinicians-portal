# VitalStats SDK: Mutations

> **Source:** VitalStats Isomorix Framework (Layer 3) documentation.
> **Context:** This covers creating, updating, and deleting records atomically with automatic transaction coordination across multiple models.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Mutation Hierarchy](#mutation-hierarchy)
3. [Creating Mutations](#creating-mutations)
4. [Creating Records](#creating-records)
5. [Updating Records](#updating-records)
6. [Deleting Records](#deleting-records)
7. [Execution](#execution)
8. [Observing Mutations](#observing-mutations)
9. [Nested Data (Virtual Fields)](#nested-data-virtual-fields)
10. [record.setState() — Convenience Method](#recordsetstate--convenience-method)
11. [Important Concepts](#important-concepts)
12. [Practical Examples](#practical-examples)

---

## Introduction

Mutations are queries with associated values for creating, updating, or deleting records.

**Key Features:**
- Atomic operations (all succeed or all rollback)
- Automatic transaction coordination across multiple models
- Support for nested data via virtual fields
- Execution count system ensures all participants are ready
- Storage-agnostic (connectors handle database specifics)

---

## Mutation Hierarchy

### PluginMutation (Controller)

The `PluginMutation` orchestrates the overall mutation:
- Manages all ModelMutation instances involved
- Coordinates execution flow across multiple models
- Handles storage layer communication via connectors

**Why it's needed**: Multiple models can be part of a single mutation, and operations must occur in the correct order (e.g., create referenced record before record with foreign key).

### ModelMutation

Each model involved in a mutation gets a `ModelMutation` instance:
- Manages changes for a specific model
- References PluginMutation via `controller` property
- Tracks create/update/delete operations for the model

---

## Creating Mutations

### From Plugin

```javascript
const pluginMutation = plugin.mutation();
const modelMutation = pluginMutation.switchTo('Contact');
```

### From Model

```javascript
const modelMutation = contactModel.mutation();
// Automatically creates PluginMutation
```

**These are identical:**

```javascript
plugin.mutation().switchTo('Contact');
plugin.switchTo('Contact').mutation();
```

### With dispatchId

Coordinate with existing actions:

```javascript
const mutation = contactModel.mutation(action.meta.mainDispatchId);
```

### switchTo() Method

Navigate between models within the same mutation:

```javascript
const mutation = plugin.mutation();
const contactMutation = mutation.switchTo('Contact');
const orderMutation = mutation.switchTo('Order');
// Both share the same PluginMutation (controller)
```

---

## Creating Records

### createOne(data)

Create a single record:

```javascript
const record = mutation.createOne({
  firstName: 'Bob',
  lastName: 'Smith',
  email: 'bob@gmail.com'
});

// Returns optimistic (pending) Record instance immediately
console.log(record.firstName); // "Bob"
console.log(record.id); // Generated ID
```

### create(arrayOrObject)

Create multiple records:

```javascript
const records = [
  { firstName: 'Bob', email: 'bob@gmail.com' },
  { firstName: 'Sam', email: 'sam@gmail.com' },
  { firstName: 'Jane', email: 'jane@gmail.com' }
];
mutation.create(records);
// Returns the mutation instance for chaining.
// The records array is mutated — entries are replaced with their
// Record representation with optimistic state applied.
// Fields not provided that have a defaultValue will be set to defaults.
console.log(records[0].firstName); // "Bob"
```

**Important**: `create()` expects multiple records. For a single record, use `createOne()`.

### With Nested Data

Create records with related records in one operation:

```javascript
const contact = mutation.createOne({
  firstName: 'Bob',
  email: 'bob@gmail.com',
  // Nested data via virtual field — can be Array or Object
  orders: [
    { amount: 100, status: 'pending' },
    { amount: 250, status: 'completed' }
  ]
});
// After execution, related orders are created and linked
```

---

## Updating Records

### update(queryCallback, data)

Update via query:

```javascript
mutation.update(query => query
  .where('firstName', 'Bob')
  .andWhere('lastName', 'Smith')
  .set({
    email: 'bob.smith@newdomain.com',
    isActive: true
  })
);
```

**Note**: Call `.set(data)` on the query to provide update values.

### update(record, data)

Update specific record(s) directly:

```javascript
// Single record — returns the mutation instance, NOT the record!
// Use getMutableRecord() to get the pending record:
const pendingRecord = mutation.update(contactRecord, {
  email: 'newemail@gmail.com',
  firstName: 'Robert'
}).getMutableRecord(contactRecord);

// Multiple records (all get same updates).
// Maintain reference — array is mutated with pending versions.
const pendingRecords = [record1, record2, record3];
mutation.update(pendingRecords, { status: 'active' });
console.log(pendingRecords[0].status); // "active"

// Object of records
mutation.update(recordsObject, { status: 'active' });
// recordsObject values are replaced with pending instances
```

### With Nested Data

Update related records via virtual fields:

```javascript
mutation.update(contactRecord, {
  firstName: 'Sam',
  // Update all related orders
  orders: { status: 'completed' }
});
```

---

## Deleting Records

### delete(queryCallback)

```javascript
mutation.delete(query => query
  .where('status', 'archived')
  .andWhere('updatedAt', '<', new Date('2023-01-01'))
);
```

### delete(record)

```javascript
mutation.delete(contactRecord);           // single
mutation.delete([record1, record2]);      // array
mutation.delete(recordsObject);           // object
```

---

## Execution

### execute(waitForMain?)

```javascript
// Wait for pending action only (default)
mutation.execute().subscribe(pluginMutation => {
  if (pluginMutation.isCancelling) {
    console.log('Mutation failed');
  }
});

// Wait for main action to complete (recommended)
mutation.execute(true).subscribe(pluginMutation => {
  if (pluginMutation.isCancelling) {
    console.log('Mutation failed');
  } else {
    console.log('Mutation succeeded — records in main state');
  }
});

// With async/await
await mutation.execute(true).toPromise();
```

**Parameters:**
- `waitForMain = false`: Observable emits after pending action completes
- `waitForMain = true`: Observable emits after main action completes (records in committed state)

### Execution Count System

Each call to `plugin.mutation()` or `model.mutation()` increments an internal counter. Each call to `execute()` decrements it. The mutation begins only when the counter reaches zero.

**Why**: Allows mutations to be passed around and built up by multiple functions before execution.

```javascript
const mutation = contactModel.mutation();  // counter = 1
mutation.createOne({ firstName: 'Bob' });
processOrders(mutation);                   // passes mutation around

function processOrders(mutation) {
  const orderMutation = mutation.switchTo('Order');
  orderMutation.createOne({ amount: 100 });
  orderMutation.execute();                 // counter = 0, mutation begins
}
```

### Execute from Any Mutation

Calling `execute()` on any ModelMutation or PluginMutation in the group executes the entire mutation:

```javascript
// All equivalent
await contactMutation.execute(true).toPromise();
await orderMutation.execute(true).toPromise();
await contactMutation.controller.execute(true).toPromise();
```

---

## Observing Mutations

### ofComplete(waitForMain?)

Subscribe to mutation completion **without affecting execution count**:

```javascript
mutation.ofComplete(true).subscribe(pluginMutation => {
  console.log('Mutation complete');
});

// Call multiple times — doesn't affect execution
mutation.ofComplete(true).subscribe(/* observer 1 */);
mutation.ofComplete(true).subscribe(/* observer 2 */);
mutation.ofComplete(true).subscribe(/* observer 3 */);

// execute() is what triggers the mutation
mutation.execute(true);
```

**Use Case**: Multiple parts of code need to react to mutation completion without coordinating execution.

---

## Nested Data (Virtual Fields)

### Creating with Nested Data

```javascript
const contact = mutation.createOne({
  firstName: 'Bob',
  email: 'bob@gmail.com',
  orders: [
    {
      amount: 100,
      status: 'pending',
      items: [
        { productId: 1, quantity: 2 },
        { productId: 3, quantity: 1 }
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001'
      }
    }
  ],
  tags: [
    { name: 'premium' },
    { name: 'newsletter' }
  ]
});
```

### Updating with Nested Data

```javascript
mutation.update(contactRecord, {
  firstName: 'Robert',
  orders: {
    status: 'completed',
    processedAt: new Date()
  }
});
```

### How It Works

1. Virtual field names map to relationships defined in Model schema
2. Framework automatically creates/updates/deletes related records
3. Foreign keys are set automatically
4. Operations occur in correct order (referenced records first)

---

## record.setState() — Convenience Method

`record.setState()` is a wrapper around `mutation.update()` that creates a mutation, updates the record, and executes it.

```javascript
// These are equivalent:
record.setState({ firstName: 'Bob' });

const mutation = model.mutation();
mutation.update(record, { firstName: 'Bob' });
mutation.execute();
```

### When to Use setState()

- **Single record update** — only one record changing
- **Straightforward update** — simple field changes
- **Nested updates** — can include virtual field data

```javascript
await record.setState({
  firstName: 'Bob',
  email: 'bob@gmail.com'
}).toPromise();

// With nested data
await record.setState({
  firstName: 'Bob',
  orders: { status: 'completed' }
}).toPromise();
```

### When to Use Explicit Mutations Instead

- **Multiple records** — updating more than one record
- **Atomicity required** — changes must succeed/fail together
- **Complex operations** — multiple creates/updates/deletes

```javascript
// Atomic — both succeed or both fail
const mutation = contactModel.mutation();
mutation.update(record1, { status: 'active' });
mutation.update(record2, { status: 'paused' });
await mutation.execute(true).toPromise();

// NOT atomic — two separate transactions
await record1.setState({ status: 'active' }).toPromise();
await record2.setState({ status: 'paused' }).toPromise();
```

### Undoable Changes

```javascript
record.setState({ firstName: 'Sam' }, true); // second param = undoable
plugin.timeTravel(-1); // undo
plugin.timeTravel(1);  // redo
```

### Key Points

- **Persists to database** — not local-only state
- **Creates mutation internally** — same as explicit mutation
- **Convenience for single records** — cleaner syntax
- **Not atomic across multiple records** — each call is separate
- **Returns Observable** — subscribe or convert to Promise

---

## Important Concepts

### Atomicity

All changes succeed together or roll back together:

```javascript
mutation.createOne({ firstName: 'Bob' });
mutation.update(existingRecord, { status: 'active' });
mutation.delete(otherRecord);

await mutation.execute(true).toPromise();
// If ANY operation fails, ALL roll back
```

### Optimistic Records

- `createOne()` returns the pending record with optimistic state
- `create()` and `update()` mutate the input Array/Object with pending instances
- For single updates, use `mutation.getMutableRecord(record)` to get the pending instance

```javascript
const contact = mutation.createOne({
  firstName: 'Bob',
  email: 'bob@gmail.com'
});
console.log(contact.firstName); // "Bob" — immediate, optimistic
// Changes persist only after execution completes
```

### Transaction Coordination

Multiple models coordinate automatically:

```javascript
const mutation = plugin.mutation();
const contact = mutation.switchTo('Contact').createOne({ firstName: 'Bob' });
mutation.switchTo('Order').createOne({
  contactId: contact.id,
  amount: 100
});

await mutation.execute(true).toPromise();
// Framework ensures Contact created BEFORE Order
```

---

## Practical Examples

### Example 1: Simple Create

```javascript
const mutation = contactModel.mutation();
const contact = mutation.createOne({
  firstName: 'Bob',
  lastName: 'Smith',
  email: 'bob.smith@gmail.com',
  isActive: true
});
await mutation.execute(true).toPromise();
```

### Example 2: Update Multiple Records

```javascript
const mutation = contactModel.mutation();
mutation.update(query => query
  .where('isActive', false)
  .andWhere('lastLoginAt', '<', new Date('2023-01-01'))
  .set({
    status: 'archived',
    archivedAt: new Date()
  })
);
const result = await mutation.execute(true).toPromise();
if (!result.isCancelling) {
  console.log('Archived inactive contacts');
}
```

### Example 3: Multi-Model Mutation

```javascript
const mutation = plugin.mutation();

const contactMutation = mutation.switchTo('Contact');
const contact = contactMutation.createOne({
  firstName: 'Bob',
  email: 'bob@gmail.com'
});

const orderMutation = mutation.switchTo('Order');
orderMutation.create([
  { contactId: contact.id, amount: 100, status: 'pending' },
  { contactId: contact.id, amount: 250, status: 'pending' }
]);

await mutation.execute(true).toPromise();
```

### Example 4: Create with Deep Nesting

```javascript
const mutation = contactModel.mutation();
const contact = mutation.createOne({
  firstName: 'Bob',
  email: 'bob@gmail.com',
  orders: [
    {
      amount: 100,
      status: 'pending',
      items: [
        { productId: 1, quantity: 2, price: 25.00 },
        { productId: 3, quantity: 2, price: 25.00 }
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001'
      }
    }
  ],
  tags: [
    { name: 'premium' },
    { name: 'newsletter' }
  ]
});
await mutation.execute(true).toPromise();
```

### Example 5: Coordinated Updates

```javascript
const mutation = plugin.mutation();

mutation.switchTo('Contact').update(contactRecord, {
  firstName: 'Robert',
  orders: { contactName: 'Robert' } // denormalized field
});

mutation.switchTo('Activity').createOne({
  userId: contactRecord.userId,
  type: 'name_change',
  details: { from: contactRecord.firstName, to: 'Robert' }
});

await mutation.execute(true).toPromise();
```

### Example 6: Using ofComplete()

```javascript
const mutation = contactModel.mutation();

// Multiple observers
mutation.ofComplete(true).subscribe(() => console.log('Update analytics'));
mutation.ofComplete(true).subscribe(() => console.log('Send notification'));
mutation.ofComplete(true).subscribe(() => console.log('Invalidate cache'));

mutation.createOne({ firstName: 'Bob' });
await mutation.execute(true).toPromise();
// All observers notified
```

---

## Best Practices

### Do
- Use `createOne()` for single record creation
- Use `record.setState()` for single record updates
- Use explicit mutations for multi-record updates (atomicity)
- Pass `true` to `execute()` to wait for main state
- Use nested data for related records
- Let the framework handle foreign key ordering

### Don't
- Don't use `create()` for single records (use `createOne()`)
- Don't use `record.setState()` for multiple records (loses atomicity)
- Don't expect the optimistic record back unless using `createOne()` (maintain reference)
- Don't manually track execution count (framework handles it)
- Don't assume order of operations (framework optimizes)

---

## Related SDK Documentation

- **Action Dispatcher Concepts** → `docs/sdk-action-dispatcher.md`
- **Queries** → `docs/sdk-queries.md`
- **Virtual Fields** → `docs/sdk-virtual-fields.md`
- **Persistent Queries** → `docs/sdk-persistent-queries.md`
- **Client-Side SDK Patterns** → `docs/vitalsync-sdk-patterns.md`
