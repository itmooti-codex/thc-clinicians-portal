# VitalStats SDK: Persistent Queries

> **Source:** VitalStats Isomorix Framework (Layer 3) documentation.
> **Context:** Persistent queries let you save, share, and reuse query definitions across users and sessions by storing them as records in the PersistentQuery model.

---

## Table of Contents

1. [Why Persistent Queries?](#why-persistent-queries)
2. [The PersistentQuery Model](#the-persistentquery-model)
3. [Creating Persistent Queries](#creating-persistent-queries)
4. [Executing Persistent Queries](#executing-persistent-queries)
5. [Variable Presets](#variable-presets)
6. [Sharing and Permissions](#sharing-and-permissions)
7. [AI Examples](#ai-examples)
8. [Practical Examples](#practical-examples)

---

## Why Persistent Queries?

### Reusability

Define complex queries once, execute many times:

```javascript
// Without persistent query — redefine everywhere
const query = orderModel.query()
  .where('status', 'completed')
  .andWhere('createdAt', '>', startDate)
  .count('*', 'total')
  .sum('amount', 'revenue');

// With persistent query — execute by name
const result = await persistentQueryRecord.execute().toPromise();
```

### Sharing

Share query definitions between users and teams with permission controls.

### Variable Presets

Save one query with multiple parameter configurations (e.g., "This Week", "This Month", "This Year").

### AI Context

Mark queries as AI examples so AI assistants can reference them for similar tasks.

---

## The PersistentQuery Model

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Unique query name (per user/entity/model) |
| `description` | String | Optional detailed description |
| `modelName` | String | Model the query operates on |
| `graphql` | Text | GraphQL representation of query |
| `variableValuesMap` | JSON | Variable presets |
| `userId` | ModelID | Owner user ID |
| `pluginId` | ModelID | Associated plugin |
| `viewableBy` | Enum | Who can view: NOBODY_ELSE, TEAM_MEMBERS, EVERYONE |
| `editableBy` | Enum | Who can edit: NOBODY_ELSE, TEAM_MEMBERS, EVERYONE |
| `isAiExample` | Boolean | Use as AI example |
| `createdAt` | Timestamp | Creation time |

---

## Creating Persistent Queries

### From Query Instance

The most common approach:

```javascript
import { toMainInstance } from '@isomorix/operators';

// Build query
const query = orderModel.query()
  .where('status', 'completed')
  .andWhere('createdAt', '>', ':startDate')
  .count('*', 'totalOrders')
  .sum('amount', 'totalRevenue')
  .avg('amount', 'avgOrderValue');

// Save as persistent query
const persistentQueryModel = plugin.switchTo('PersistentQuery');
const mutation = persistentQueryModel.mutation();

const queryRecord = mutation.createOne({
  name: 'Completed Orders Analytics',
  description: 'Aggregate statistics for completed orders since a given date',
  query, // Provide Query instance
  variableValuesMap: {
    DEFAULT: { startDate: new Date('2024-01-01') }
  }
});

await mutation.execute(true).toPromise();
```

### From GraphQL String

```javascript
const mutation = persistentQueryModel.mutation();
const queryRecord = mutation.createOne({
  name: 'Active Contacts',
  modelName: 'Contact',
  graphql: `
    query {
      getContacts(
        where: { isActive: true }
        select: ["id", "firstName", "lastName", "email"]
        limit: 100
      ) {
        id
        firstName
        lastName
        email
      }
    }
  `
});
await mutation.execute(true).toPromise();
```

### With Nested Includes

```javascript
const query = contactModel.query()
  .where('isActive', true)
  .include('orders', query => query
    .select(['id', 'amount', 'status'])
    .where('status', 'completed')
  )
  .select(['id', 'firstName', 'email']);

const mutation = persistentQueryModel.mutation();
mutation.createOne({
  name: 'Active Contacts with Completed Orders',
  description: 'Lists active contacts along with their completed orders',
  query
});
await mutation.execute(true).toPromise();
```

---

## Executing Persistent Queries

### Basic Execution

```javascript
const queryRecord = await persistentQueryModel.query()
  .where('name', 'Completed Orders Analytics')
  .andWhere('userId', currentUserId)
  .findOneRecord()
  .pipe(toMainInstance(true))
  .toPromise();

const result = await queryRecord.execute().toPromise();
```

### With Variable Preset

```javascript
const result = await queryRecord.execute('THIS_MONTH').toPromise();
```

### With Custom Variables

```javascript
const result = await queryRecord.execute({
  variables: {
    startDate: new Date('2024-06-01'),
    status: 'pending'
  }
}).toPromise();
```

### Activation (Browser Only)

Persistent queries may need activation before execution in the browser (ensures models/fields are loaded). Not needed on the server.

```javascript
await queryRecord.activateModelsAndFields().toPromise();
const result = await queryRecord.execute().toPromise();
```

### Accessing the Underlying Query Instance

```javascript
const query = queryRecord.model.query()
  .fromGraphql(queryRecord.graphql);

query.limit(50); // modify
const results = await query.fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();
```

---

## Variable Presets

### Defining Presets

```javascript
mutation.createOne({
  name: 'Filtered Orders',
  query,
  variableValuesMap: {
    DEFAULT: {
      status: 'completed',
      minAmount: 0,
      startDate: new Date('2024-01-01')
    },
    LARGE_ORDERS: {
      status: 'completed',
      minAmount: 1000,
      startDate: new Date('2024-01-01')
    },
    PENDING_THIS_MONTH: {
      status: 'pending',
      minAmount: 0,
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    }
  }
});
```

### Using Presets

```javascript
const defaultResult = await queryRecord.execute().toPromise();
const largeOrders = await queryRecord.execute('LARGE_ORDERS').toPromise();
const pending = await queryRecord.execute('PENDING_THIS_MONTH').toPromise();
```

### Preset Inheritance

Presets can inherit from other presets using `__parentKey`:

```javascript
variableValuesMap: {
  DEFAULT: {
    status: 'completed',
    minAmount: 0,
    startDate: new Date('2024-01-01')
  },
  LARGE_ORDERS: {
    __parentKey: 'DEFAULT',
    minAmount: 1000 // Override only minAmount, inherit rest
  }
}
```

---

## Sharing and Permissions

### Permission Levels

| Value | Description |
|-------|-------------|
| `NOBODY_ELSE` | Only the creator |
| `TEAM_MEMBERS` | Creator's team members |
| `EVERYONE` | All users in the entity |

### Setting Permissions

```javascript
import { RESOURCE_SHARE_STATUS } from '@isomorix/core-config';

// Private
mutation.createOne({
  name: 'My Private Query',
  query,
  viewableBy: RESOURCE_SHARE_STATUS.NOBODY_ELSE
});

// Team can view, only owner can edit
mutation.createOne({
  name: 'Team Report',
  query,
  viewableBy: RESOURCE_SHARE_STATUS.TEAM_MEMBERS,
  editableBy: RESOURCE_SHARE_STATUS.NOBODY_ELSE
});

// Everyone can view and team can edit
mutation.createOne({
  name: 'Shared Dashboard Query',
  query,
  viewableBy: RESOURCE_SHARE_STATUS.EVERYONE,
  editableBy: RESOURCE_SHARE_STATUS.TEAM_MEMBERS
});
```

---

## AI Examples

Mark queries as examples for AI assistants:

```javascript
mutation.createOne({
  name: 'Customer Lifetime Value',
  description: 'Calculates total revenue per customer over their entire history. ' +
    'Demonstrates how to aggregate across a relationship (Customer -> Orders) ' +
    'and group by the parent record.',
  query: contactModel.query()
    .include('orders', query => query.where('status', 'completed'))
    .select(['id', 'firstName', 'lastName']),
  isAiExample: true,
  viewableBy: RESOURCE_SHARE_STATUS.EVERYONE
});
```

### AI Example Best Practices

**Do:**
- Write clear, descriptive names
- Include detailed descriptions explaining what, why, and when
- Make them discoverable (`viewableBy: EVERYONE`)
- Focus on unique patterns or techniques

**Don't:**
- Mark trivial queries as examples
- Use vague descriptions
- Include sensitive data in examples

---

## Practical Examples

### Example 1: Dashboard Analytics

```javascript
const query = orderModel.query()
  .where('createdAt', '>', ':startDate')
  .andWhere('createdAt', '<', ':endDate')
  .count('*', 'totalOrders')
  .sum('amount', 'totalRevenue')
  .avg('amount', 'avgOrderValue')
  .field('status', 'status');

mutation.createOne({
  name: 'Dashboard Analytics',
  description: 'Key metrics: order count, revenue, average order value',
  query,
  variableValuesMap: {
    DEFAULT: {
      startDate: new Date(Date.now() - 30 * 86400000),
      endDate: new Date()
    },
    THIS_WEEK: {
      startDate: new Date(Date.now() - 7 * 86400000),
      endDate: new Date()
    },
    THIS_MONTH: {
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate: new Date()
    },
    THIS_YEAR: {
      startDate: new Date(new Date().getFullYear(), 0, 1),
      endDate: new Date()
    }
  },
  viewableBy: RESOURCE_SHARE_STATUS.TEAM_MEMBERS
});
await mutation.execute(true).toPromise();

// Execute with different time periods
const weeklyStats = await queryRecord.execute('THIS_WEEK').toPromise();
const monthlyStats = await queryRecord.execute('THIS_MONTH').toPromise();
```

### Example 2: User-Created Saved Searches

```javascript
async function saveUserSearch(userId, searchName, filters) {
  const query = contactModel.query().where('isActive', true);

  if (filters.email) query.andWhere('email', 'like', `%${filters.email}%`);
  if (filters.city) query.andWhere('addresses', q => q.where('city', filters.city));
  if (filters.tags) query.andWhere('tags', q => q.whereIn('name', filters.tags));

  const mutation = persistentQueryModel.mutation();
  const savedSearch = mutation.createOne({
    name: searchName,
    description: 'Saved search created by user',
    query,
    userId,
    viewableBy: RESOURCE_SHARE_STATUS.NOBODY_ELSE
  });
  await mutation.execute(true).toPromise();
  return savedSearch;
}

async function executeSavedSearch(userId, searchName) {
  const queryRecord = await persistentQueryModel.query()
    .where('name', searchName)
    .andWhere('userId', userId)
    .findOneRecord()
    .pipe(toMainInstance(true))
    .toPromise();

  if (!queryRecord) throw new Error('Saved search not found');
  return await queryRecord.execute().toPromise();
}
```

### Example 3: Query Library for AI

```javascript
const aiExamples = [
  {
    name: 'Revenue by Product Category',
    description: 'Demonstrates grouping orders by a related model field (Product.category).',
    query: orderModel.query()
      .include('items', q => q.include('product', q => q.select(['category'])))
      .count('*', 'orderCount')
      .sum('amount', 'totalRevenue')
      .field('items.product.category', 'category')
  },
  {
    name: 'Customers with No Recent Activity',
    description: 'Find records that DON\'T have related records matching criteria. ' +
      'Useful for "hasn\'t done X" queries.',
    query: contactModel.query()
      .whereNot('orders', q => q
        .where('createdAt', '>', new Date(Date.now() - 30 * 86400000))
      )
  },
  {
    name: 'Top 10 Customers by Lifetime Value',
    description: 'Calculate a derived metric (lifetime value) and sort by it.',
    query: contactModel.query()
      .include('orders', q => q
        .where('status', 'completed')
        .sum('amount', 'lifetimeValue')
      )
      .orderBy('orders.lifetimeValue', 'desc')
      .limit(10)
  }
];

const mutation = persistentQueryModel.mutation();
for (const example of aiExamples) {
  mutation.createOne({
    ...example,
    isAiExample: true,
    viewableBy: RESOURCE_SHARE_STATUS.EVERYONE
  });
}
await mutation.execute(true).toPromise();
```

---

## Best Practices

### Do
- Use descriptive, unique names
- Include helpful descriptions
- Set appropriate permissions
- Use variable presets for common variations
- Mark educational queries as AI examples
- Activate before executing in browser

### Don't
- Don't store sensitive data in query definitions
- Don't create overly complex queries (break into multiple)
- Don't forget to set viewableBy/editableBy
- Don't assume queries are activated (check first in browser)
- Don't duplicate queries unnecessarily

### Naming Conventions

```javascript
// Good
'Monthly Revenue by Product Category'
'High-Value Customers (>$5K Lifetime)'
'Inactive Users - Last 90 Days'

// Bad
'Query 1'
'Customer Report'
'Data'
```

---

## Related SDK Documentation

- **Action Dispatcher Concepts** → `docs/sdk-action-dispatcher.md`
- **Queries** → `docs/sdk-queries.md`
- **Mutations** → `docs/sdk-mutations.md`
- **Virtual Fields** → `docs/sdk-virtual-fields.md`
- **Client-Side SDK Patterns** → `docs/vitalsync-sdk-patterns.md`
