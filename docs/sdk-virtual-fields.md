# VitalStats SDK: Virtual Fields (Relationships)

> **Source:** VitalStats Isomorix Framework (Layer 3) documentation.
> **Context:** Virtual fields define relationships between models, allowing you to work with related records seamlessly through a unified interface.

---

## Table of Contents

1. [Understanding Virtual Fields](#understanding-virtual-fields)
2. [Defining Virtual Fields](#defining-virtual-fields)
3. [Accessing Related Records](#accessing-related-records)
4. [Creating with Nested Data](#creating-with-nested-data)
5. [Updating Related Records](#updating-related-records)
6. [Querying with Virtual Fields](#querying-with-virtual-fields)
7. [Important Concepts](#important-concepts)
8. [Practical Examples](#practical-examples)

---

## Understanding Virtual Fields

Virtual fields represent relationships between models. Unlike regular fields, they don't exist as columns in the database — they're "virtual" references to related records.

```javascript
const contact = contactModel.getState()['some-id'];
console.log(contact.orders);
// Object { "order1-id": OrderRecord, "order2-id": OrderRecord } or null
```

### How They're Stored

Virtual field records are stored as **Objects keyed by primary key** (not Arrays):

```javascript
console.log(contact.orders);
// {
//   "abc123": OrderRecord,
//   "def456": OrderRecord,
//   "ghi789": OrderRecord
// }

// Convert to Array when needed
const ordersArray = contact.orders ? Object.values(contact.orders) : [];
```

**Why Objects?**
- Efficient lookup by ID
- Consistent with Model state structure
- Easier to update/delete specific records

---

## Defining Virtual Fields

Virtual fields are defined in the `virtualFields` property of the Model schema:

```javascript
import { MODEL_RELATIONSHIP_TYPES } from '@isomorix/core-config';

export function defineContactModel(types) {
  return {
    name: 'Contact',
    primaryKey: 'id',
    fields: { /* regular fields */ },
    virtualFields: {
      orders: {
        type: MODEL_RELATIONSHIP_TYPES.HAS_MANY,
        otherModelName: 'Order',
        fieldName: 'contactId' // Foreign key on Order model
      },
      address: {
        type: MODEL_RELATIONSHIP_TYPES.HAS_ONE,
        otherModelName: 'Address',
        fieldName: 'contactId' // Foreign key on Address model
      },
      tagsData: { // "through" relationship for many-to-many
        type: MODEL_RELATIONSHIP_TYPES.HAS_MANY,
        otherModelName: 'ContactTag',
        fieldName: 'contactId',
      },
      tags: { // many-to-many relationship
        type: MODEL_RELATIONSHIP_TYPES.BELONGS_TO_MANY,
        ownModelThroughVFName: 'tagsData',
        otherModelName: 'Tag',
        otherModelVFName: 'contacts',
      }
    }
  };
}
```

### Relationship Types

| Type | Meaning | Foreign Key Location |
|------|---------|---------------------|
| `HAS_MANY` | One-to-many (Contact has many Orders) | On the "many" model (Order.contactId) |
| `HAS_ONE` | One-to-one (Contact has one Address) | On the related model (Address.contactId) |
| `BELONGS_TO` | Inverse of HAS_ONE/HAS_MANY (Order belongs to Contact) | On THIS model (Order.contactId) |
| `BELONGS_TO_MANY` | Many-to-many with junction table | Via "through" relationship |

### Complete Schema Example

```javascript
export function defineOrderModel(types) {
  return {
    name: 'Order',
    primaryKey: 'id',
    fields: {
      contactId: {
        type: types.ModelID.use('Contact'),
        description: 'ID of the contact who placed this order'
      },
      amount: { type: types.Float.use() },
      status: { type: types.String.use() }
    },
    virtualFields: {
      contact: {
        type: MODEL_RELATIONSHIP_TYPES.BELONGS_TO,
        otherModelName: 'Contact',
        fieldName: 'contactId'
      },
      items: {
        type: MODEL_RELATIONSHIP_TYPES.HAS_MANY,
        otherModelName: 'OrderItem',
        fieldName: 'orderId'
      },
      shippingAddress: {
        type: MODEL_RELATIONSHIP_TYPES.HAS_ONE,
        otherModelName: 'Address',
        fieldName: 'orderId'
      }
    }
  };
}
```

---

## Accessing Related Records

### Direct Property Access

```javascript
const contact = contactModel.getState()['some-id'];

// Object or null
console.log(contact.orders);

// Convert to Array
const ordersArray = contact.orders ? Object.values(contact.orders) : [];
console.log(`Contact has ${ordersArray.length} orders`);

// Access specific order
if (contact.orders && contact.orders['specific-order-id']) {
  console.log(contact.orders['specific-order-id'].amount);
}
```

### getState() Does NOT Include Virtual Fields

```javascript
const state = contact.getState();
// { id: "...", firstName: "Bob", email: "bob@gmail.com" }
// Note: 'orders' is NOT here

// Access virtual fields directly on the record instance
console.log(contact.orders); // Object or null
```

### Loading Related Records

Use `include()` in queries to load related records:

```javascript
const contacts = await contactModel.query()
  .where('isActive', true)
  .include('orders', query => query
    .select(['id', 'amount', 'status'])
    .where('status', 'completed')
  )
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();

for (const contact of Object.values(contacts)) {
  if (contact.orders) {
    for (const order of Object.values(contact.orders)) {
      console.log(`Order ${order.id}: $${order.amount}`);
    }
  }
}
```

### Nested Includes

```javascript
const contacts = await contactModel.query()
  .include('orders', query => query
    .select(['id', 'amount'])
    .include('items', query => query
      .select(['id', 'productId', 'quantity'])
    )
  )
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();
```

---

## Creating with Nested Data

### Basic Nested Creation

```javascript
const mutation = contactModel.mutation();
const contact = mutation.createOne({
  firstName: 'Bob',
  email: 'bob@gmail.com',
  orders: [
    { amount: 100, status: 'pending' },
    { amount: 250, status: 'completed' }
  ]
});
await mutation.execute(true).toPromise();
```

### Input Format: Array or Object

Both work — after creation, data is stored as Object keyed by primary key:

```javascript
// Array format (common)
orders: [{ amount: 100 }, { amount: 250 }]

// Object format (keys don't matter, will be replaced)
orders: { temp1: { amount: 100 }, temp2: { amount: 250 } }
```

### Deep Nesting

```javascript
const contact = mutation.createOne({
  firstName: 'Bob',
  email: 'bob@gmail.com',
  orders: [
    {
      amount: 100,
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

### Framework Handles Ordering

The framework creates records in the correct order automatically:

```javascript
const mutation = plugin.mutation();
const contact = mutation.switchTo('Contact').createOne({ firstName: 'Bob' });
mutation.switchTo('Order').createOne({
  contactId: contact.id, // Reference to contact
  amount: 100
});
await mutation.execute(true).toPromise();
// Framework ensures Contact created BEFORE Order
```

---

## Updating Related Records

### Update All Related Records

```javascript
const mutation = contactModel.mutation();
mutation.update(contactRecord, {
  firstName: 'Robert',
  orders: { status: 'completed', processedAt: new Date() }
});
await mutation.execute(true).toPromise();
```

### Update with Query

```javascript
mutation.update(query => query
  .where('id', contactId)
  .set({
    firstName: 'Robert',
    orders: { status: 'processing' }
  })
);
```

### Selective Updates

To update specific related records, query them separately:

```javascript
const mutation = plugin.mutation();
mutation.switchTo('Order').update(query => query
  .where('contactId', contact.id)
  .andWhere('status', 'pending')
  .set({ status: 'cancelled' })
);
await mutation.execute(true).toPromise();
```

---

## Querying with Virtual Fields

### Filter by Related Records

```javascript
const contacts = await contactModel.query()
  .where('orders', query => query
    .where('status', 'completed')
    .andWhere('amount', '>', 100)
  )
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();
```

### Multiple Relationship Conditions

```javascript
const contacts = await contactModel.query()
  .where('orders', query => query
    .where('amount', '>', 100)
  )
  .andWhere('tags', query => query
    .where('name', 'premium')
  )
  .andWhere('addresses', query => query
    .where('type', 'billing')
    .andWhere('state', 'NY')
  )
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();
```

### Include with Filtering

```javascript
const contacts = await contactModel.query()
  .where('isActive', true)
  .include('orders', query => query
    .where('status', 'completed')
    .andWhere('createdAt', '>', new Date('2024-01-01'))
    .andWhere('amount', '>', 50)
    .select(['id', 'amount', 'createdAt'])
    .orderBy('createdAt', 'desc')
  )
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();
```

---

## Important Concepts

### Virtual Fields are NOT in getState()

```javascript
const state = contact.getState();
// { id, firstName, email, ... } — no virtual fields

// Access virtual fields directly on the record
console.log(contact.orders); // Object or null
```

### Storage Format: Objects (Not Arrays)

```javascript
// Stored as Object
contact.orders = { "order-id-1": OrderRecord, "order-id-2": OrderRecord }

// Convert to Array when needed
const ordersArray = contact.orders ? Object.values(contact.orders) : [];
ordersArray.forEach(order => console.log(order.amount));
ordersArray.sort((a, b) => b.amount - a.amount);
const largeOrders = ordersArray.filter(order => order.amount > 100);
```

### Foreign Keys Managed Automatically

```javascript
const contact = mutation.createOne({
  firstName: 'Bob',
  orders: [{ amount: 100 }]
});
// Framework automatically sets contactId on orders
```

### Null vs Empty Object

| Value | Meaning |
|-------|---------|
| `null` | Related records not loaded OR none exist |
| `{}` | Related records were loaded, but none matched |
| `{ "id1": Record }` | Related records loaded with matches |

---

## Practical Examples

### Example 1: E-commerce Order with Items

```javascript
const mutation = orderModel.mutation();
const order = mutation.createOne({
  contactId: someContactId,
  status: 'pending',
  items: [
    { productId: 'prod-123', quantity: 2, price: 25.00, name: 'Widget' },
    { productId: 'prod-456', quantity: 1, price: 50.00, name: 'Gadget' }
  ],
  shippingAddress: {
    street: '123 Main St', city: 'New York', state: 'NY', zip: '10001'
  }
});
await mutation.execute(true).toPromise();

if (order.items) {
  const totalItems = Object.values(order.items).reduce((sum, item) => sum + item.quantity, 0);
  console.log(`Order has ${totalItems} total items`);
}
```

### Example 2: Loading and Displaying Nested Data

```javascript
const posts = await postModel.query()
  .where('isPublished', true)
  .include('author', query => query
    .select(['id', 'firstName', 'lastName', 'avatar'])
  )
  .include('comments', query => query
    .where('isApproved', true)
    .include('author', query => query
      .select(['id', 'firstName', 'avatar'])
    )
    .orderBy('createdAt', 'asc')
  )
  .includeFields('tags', ['id', 'name'])
  .orderBy('createdAt', 'desc')
  .limit(10)
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();

for (const post of Object.values(posts)) {
  console.log(`Title: ${post.title}`);
  console.log(`Author: ${post.author.firstName} ${post.author.lastName}`);

  if (post.tags) {
    const tagNames = Object.values(post.tags).map(tag => tag.name);
    console.log(`Tags: ${tagNames.join(', ')}`);
  }

  if (post.comments) {
    const commentsArray = Object.values(post.comments);
    console.log(`Comments (${commentsArray.length}):`);
    commentsArray.forEach(comment => {
      console.log(`  - ${comment.author.firstName}: ${comment.content}`);
    });
  }
}
```

### Example 3: Complex Relationship Query

```javascript
// Find contacts who:
// - Have completed orders over $500
// - Are tagged as 'premium'
// - Have an address in specific cities
const contacts = await contactModel.query()
  .where('tags', query => query.where('name', 'premium'))
  .andWhere('orders', query => query
    .where('status', 'completed')
    .andWhere('amount', '>', 500)
  )
  .andWhere('addresses', query => query
    .whereIn('city', ['New York', 'Los Angeles', 'Chicago'])
  )
  .include('orders', query => query
    .where('status', 'completed')
    .select(['id', 'amount', 'createdAt'])
    .orderBy('createdAt', 'desc')
    .limit(5)
  )
  .includeFields('tags', ['id', 'name'])
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();

for (const contact of Object.values(contacts)) {
  if (contact.orders) {
    const totalSpent = Object.values(contact.orders).reduce((sum, order) => sum + order.amount, 0);
    console.log(`${contact.firstName} spent: $${totalSpent}`);
  }
}
```

---

## Best Practices

### Do
- Define virtual fields in schema for all relationships
- Use `include()` to load related records
- Convert to Array when you need Array methods
- Handle null and empty Object cases
- Use nested data for atomic creates
- Let framework manage foreign keys

### Don't
- Don't expect Arrays — virtual fields are Objects keyed by primary key
- Don't look for virtual fields in `getState()` — access them directly on the record
- Don't manually set foreign keys when using nested data
- Don't assume virtual fields are loaded (check for null)
- Don't mutate virtual field Objects directly

---

## Related SDK Documentation

- **Action Dispatcher Concepts** → `docs/sdk-action-dispatcher.md`
- **Queries** → `docs/sdk-queries.md`
- **Mutations** → `docs/sdk-mutations.md`
- **Persistent Queries** → `docs/sdk-persistent-queries.md`
- **Client-Side SDK Patterns** → `docs/vitalsync-sdk-patterns.md`
