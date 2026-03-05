# VitalStats SDK: Queries

> **Source:** VitalStats Isomorix Framework (Layer 3) documentation.
> **Context:** This covers the SDK Query API for retrieving data from local state and/or persistent storage. Queries are storage-agnostic — connectors translate them to the appropriate database format.

---

## Table of Contents

1. [Basic Query Building](#basic-query-building)
2. [Where Conditions](#where-conditions)
3. [Including Related Records](#including-related-records)
4. [Selection and Pagination](#selection-and-pagination)
5. [Variables](#variables)
6. [Execution Methods](#execution-methods)
7. [Calc Queries (Aggregates)](#calc-queries-aggregates)
8. [GraphQL Integration](#graphql-integration)
9. [Important Execution Details](#important-execution-details)
10. [Method Index](#method-index)

---

## Basic Query Building

### Creating a Query

```javascript
const contactModel = plugin.switchTo('Contact');
const query = contactModel.query();
```

### Simple Example

```javascript
const query = contactModel.query()
  .where('email', 'like', '%@gmail.com')
  .andWhere('firstName', 'Bob')
  .limit(10);

const records = await query.fetchAllRecords().toPromise();
```

---

## Where Conditions

### Basic Where Clauses

```javascript
query
  // Implied '=' operator
  .where('email', 'bob@gmail.com')

  // Explicit operator
  .where('age', '>', 18)
  .where('status', '=', 'active')

  // Like operator
  .where('email', 'like', '%@gmail.com')

  // RegExp operator
  .where('firstName', /^Bo/)

  // In operator
  .where('firstName', 'in', ['Bob', 'Jane', 'Sam'])

  // And conditions
  .andWhere('lastName', 'Smith')

  // Or conditions
  .orWhere('email', 'sam@gmail.com');
```

**Signature**: `where(fieldName, operatorOrValue, value?)`

**Important**: Use `andWhere()` instead of successive `where()` calls (differs from Knex).

### Convenience Methods

```javascript
// whereIn — shorthand for 'in' operator
query.whereIn('firstName', ['Bob', 'Jane'])
query.andWhereIn('status', ['active', 'pending'])
query.orWhereIn('role', ['admin', 'editor'])

// Negation
query.whereNot('status', 'deleted')
query.andWhereNot('email', 'like', '%spam.com')
query.orWhereNot('isBlocked', true)

query.whereNotIn('status', ['deleted', 'archived'])
query.andWhereNotIn('role', ['guest'])
query.orWhereNotIn('priority', ['low'])
```

### Object Notation (Multiple AND Conditions)

```javascript
// All conditions interpreted as AND with "=" operator
query.where({
  email: 'bob@gmail.com',
  lastName: 'Smith',
  isActive: true
})
```

### Grouped Conditions

Use a function to create parenthesized conditions:

```javascript
query.where(query => query
  .where('firstName', 'Bob')
  .orWhere('firstName', 'Sam')
)
// SQL: WHERE (firstName = 'Bob' OR firstName = 'Sam')

// Complex grouping
query
  .where('status', 'active')
  .andWhere(query => query
    .where('email', 'like', '%@gmail.com')
    .orWhere('email', 'like', '%@yahoo.com')
  )
// SQL: WHERE status = 'active' AND (email LIKE '%@gmail.com' OR email LIKE '%@yahoo.com')
```

### Querying Related Records

Use the virtual field name:

```javascript
// Assume Contact has 'posts' virtual field
query.where('posts', query => query
  .where('title', 'like', '%my content%')
  .andWhere('isPublished', true)
)
// Returns Contacts that have Posts matching the conditions
```

### Querying JSON Fields

Provide an array path to query values within JSON fields:

```javascript
query.where(['someJsonField', 'key1', 'key2'], '>', 10)
query.andWhere(['metadata', 'settings', 'enabled'], true)
```

### Timestamp Fields

Accept epoch timestamps or Date instances:

```javascript
query.where('createdAt', '>', new Date('2024-08-09'))
query.andWhere('updatedAt', '<', Math.round(Date.now() / 1000))
```

---

## Including Related Records

### include(virtualFieldName, callback)

Load related records through virtual field relationships:

```javascript
query.include('posts', query => query
  .select(['id', 'title', 'content'])
  .where('isPublished', true)
  .andWhere('createdAt', '>', new Date('2024-01-01'))
)

const contacts = await query.fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();
for (const contact of Object.values(contacts)) {
  console.log(contact.posts); // Object keyed by primary key, or null
}
```

### includeFields(virtualFieldName, fields?)

Simpler version when no filtering needed:

```javascript
query.includeFields('posts', ['id', 'title', 'content'])
query.includeFields('posts') // all fields
```

### Nested Includes

```javascript
query
  .include('posts', query => query
    .select(['id', 'title'])
    .include('comments', query => query
      .select(['id', 'content', 'authorId'])
      .where('isApproved', true)
    )
  )
```

---

## Selection and Pagination

### select(fields)

```javascript
query.select(['id', 'firstName', 'lastName', 'email'])
query.select('email')       // single field
query.selectAll()            // all fields
query.deSelectAll()          // clear selection
```

### limit(count)

```javascript
query.limit(10)
```

### offset(count)

```javascript
// Pagination
const page = 2;
const perPage = 20;
query
  .limit(perPage)
  .offset((page - 1) * perPage)
```

### orderBy(field, direction?)

```javascript
query.orderBy('createdAt', 'desc')
query.orderBy('lastName', 'asc')
query.orderBy('email') // defaults to 'asc'
```

---

## Variables

Use variables for dynamic query values:

```javascript
const query = contactModel.query()
  .where('email', ':email')
  .andWhereIn('firstName', ':names')
  .where('age', '>', ':minAge')
  .limit(':limit')
  .offset(':offset')

const records = await query.fetch({
  variables: {
    email: 'bob@gmail.com',
    names: ['Sam', 'Bob', 'Susan'],
    minAge: 18,
    limit: 100,
    offset: 0
  }
}).toPromise();
```

**Note**: Variables for `limit` and `offset` must be named `:limit` and `:offset`. Other variable names are flexible.

---

## Execution Methods

### Synchronous (Local State Only)

| Method | Returns |
|--------|---------|
| `get()` | Payload with records |
| `getAllRecords()` | Object of records or null |
| `getOneRecord()` | Single record or null |
| `getAllRecordsArray()` | Array of records |

```javascript
const payload = query.get();
console.log(payload.records); // Object keyed by ID, or null
```

### Asynchronous — find()

Attempts to resolve from local state first. If all unique constraint values are present and records exist locally, no fetch occurs:

```javascript
const records = await query.find()
  .pipe(toMainInstance(true))
  .toPromise();
```

### Asynchronous — fetch()

Always fetches from server and adds records to local state:

```javascript
const records = await query.fetch()
  .pipe(toMainInstance(true))
  .toPromise();
```

### Asynchronous — fetchDirect()

Fetches data but does NOT create Record instances in local state. Returns raw data:

```javascript
const payload = await query.fetchDirect().toPromise();
console.log(payload.resp); // Array of plain objects or null
```

### Convenience Variations

```javascript
// Object of records keyed by ID, or null
await query.fetchAllRecords().pipe(toMainInstance(true)).toPromise()
await query.findAllRecords().pipe(toMainInstance(true)).toPromise()

// Single record or null
await query.fetchOneRecord().pipe(toMainInstance(true)).toPromise()
await query.findOneRecord().pipe(toMainInstance(true)).toPromise()

// Array of records
await query.fetchAllRecordsArray().pipe(toMainInstance(true)).toPromise()
```

---

## Calc Queries (Aggregates)

Calc queries perform aggregate calculations (count, sum, avg, etc.).

### Creating Calc Queries

```javascript
query
  .count('*', 'totalCount')
  .sum('amount', 'totalAmount')
  .avg('price', 'avgPrice')
  .min('age', 'minAge')
  .max('age', 'maxAge')
  .median('score', 'medianScore')
  .stdDev('value', 'stdDevValue')
  .variance('value', 'varianceValue')
```

### Selecting Fields in Calc Queries

```javascript
query
  .count('*', 'total')
  .select(['status', 'category'])  // auto-converts to field() for calc
  .field('region', 'regionName')   // explicit field with alias
```

### Example

```javascript
const query = orderModel.query()
  .where('status', 'completed')
  .andWhere('createdAt', '>', new Date('2024-01-01'))
  .count('*', 'totalOrders')
  .sum('amount', 'totalRevenue')
  .avg('amount', 'avgOrderValue')
  .field('customerId', 'customer')

const result = await query.fetchDirect().toPromise();
console.log(result.resp);
// [{ totalOrders: 150, totalRevenue: 45000.00, avgOrderValue: 300.00, customer: '...' }]
```

---

## GraphQL Integration

The Query class handles GraphQL conversion automatically. You rarely need to interact with GraphQL directly.

### Convert Query to GraphQL

```javascript
const str = query.toGraphql(true)     // GraphQL string
const pretty = query.toGraphql({})    // Pretty-printed (uses prettier)
```

### Build Query from GraphQL

```javascript
const query = contactModel.query()
  .fromGraphql(`
    query {
      getContacts(
        where: { email: { like: "%@gmail.com" } }
        limit: 10
      ) {
        id
        firstName
        lastName
        email
      }
    }
  `)

// Modify like any other query
query.deSelectAll()
     .select(['firstName', 'lastName'])
     .limit(20)
```

### GraphQL API Structure

Each Model gets these top-level operations:

**Queries:**
- `get{DisplayName}` / `get{DisplayNamePlural}` — standard queries
- `calc{DisplayName}` / `calc{DisplayNamePlural}` — aggregation queries

**Subscriptions:**
- `subscribeTo{DisplayName}` / `subscribeTo{DisplayNamePlural}`

**Mutations:**
- `create{DisplayName}` / `create{DisplayNamePlural}`
- `update{DisplayName}` / `update{DisplayNamePlural}`
- `delete{DisplayName}` / `delete{DisplayNamePlural}`

**Note**: `displayName` and `displayNamePlural` are Schema properties.

---

## Important Execution Details

### Query Destruction

**Query instances automatically destruct after execution** unless you call `noDestroy()`:

```javascript
// ERROR on second execution — query is destroyed
const records1 = await query.fetchAllRecords().toPromise();
const records2 = await query.getAllRecords(); // ERROR

// Use noDestroy() for multiple executions
const records1 = await query
  .noDestroy()
  .fetchAllRecords()
  .toPromise();
const records2 = await query.getAllRecords(); // OK

// Cleanup when done
query.destroy();
```

### toMainInstance Operator

`fetch()` and `find()` methods return **pending** Record instances. Use `toMainInstance` to get committed instances:

```javascript
import { toMainInstance } from '@isomorix/operators';

const records = await query.fetch()
  .pipe(toMainInstance(true))
  .toPromise();
```

**When to use:**
- `get()` & variations — No (synchronous, no action)
- `find()` & variations — Yes
- `fetch()` & variations — Yes
- `fetchDirect()` — No (doesn't create Records)

---

## Method Index

### Where Methods

| Method | Description |
|--------|-------------|
| `where(field, op, val)` | Basic where condition |
| `andWhere(...)` | AND condition |
| `orWhere(...)` | OR condition |
| `whereNot(...)` | Negated where |
| `andWhereNot(...)` | Negated AND |
| `orWhereNot(...)` | Negated OR |
| `whereIn(field, arr)` | Field in array |
| `andWhereIn(...)` | AND in array |
| `orWhereIn(...)` | OR in array |
| `whereNotIn(...)` | Field not in array |
| `andWhereNotIn(...)` | AND not in array |
| `orWhereNotIn(...)` | OR not in array |

### Selection Methods

| Method | Description |
|--------|-------------|
| `select(fieldNames)` | Select fields |
| `selectAll()` | Select all fields |
| `deSelectAll()` | Clear selection |
| `include(vfName, callback)` | Include related records |
| `includeFields(vfName, fields?)` | Include related records (simple) |

### Pagination Methods

| Method | Description |
|--------|-------------|
| `limit(count)` | Limit results |
| `offset(count)` | Skip results |
| `orderBy(fieldName, dir?)` | Order results |

### Execution Methods (Sync)

| Method | Returns |
|--------|---------|
| `get()` | Payload with records |
| `getAllRecords()` | Object of records or null |
| `getOneRecord()` | Single record or null |
| `getAllRecordsArray()` | Array of records |

### Execution Methods (Async)

| Method | Returns |
|--------|---------|
| `find()` | Observable -> Payload |
| `findAllRecords()` | Observable -> Object or null |
| `findOneRecord()` | Observable -> Record or null |
| `fetch()` | Observable -> Payload |
| `fetchAllRecords()` | Observable -> Object or null |
| `fetchOneRecord()` | Observable -> Record or null |
| `fetchAllRecordsArray()` | Observable -> Array |
| `fetchDirect()` | Observable -> Payload with resp |

### Calc Methods

| Method | Description |
|--------|-------------|
| `count(field, alias)` | Count records |
| `sum(field, alias)` | Sum values |
| `avg(field, alias)` | Average values |
| `min(field, alias)` | Minimum value |
| `max(field, alias)` | Maximum value |
| `median(fieldName, alias)` | Median value |
| `stdDev(fieldName, alias)` | Standard deviation |
| `variance(fieldName, alias)` | Variance |
| `field(fieldName, alias)` | Add field to calc query |
| `getOrInitQueryCalc()` | Convert to calc query |
| `convertCalcToSelect()` | Convert to standard query |

### GraphQL Methods

| Method | Description |
|--------|-------------|
| `toGraphql(opts?)` | Convert to GraphQL |
| `fromGraphql(str)` | Build from GraphQL |
| `removeAllFieldAliases()` | Remove field aliases |

### Lifecycle Methods

| Method | Description |
|--------|-------------|
| `noDestroy()` | Prevent auto-destruction |
| `destroy()` | Manually destroy query |

---

## Practical Examples

### Example 1: Basic Query with Filtering

```javascript
const contacts = await contactModel.query()
  .where('email', 'like', '%@gmail.com')
  .andWhere('isActive', true)
  .whereIn('role', ['customer', 'subscriber'])
  .orderBy('createdAt', 'desc')
  .limit(50)
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();
```

### Example 2: Query with Related Records

```javascript
const contacts = await contactModel.query()
  .where('isActive', true)
  .include('orders', query => query
    .select(['id', 'amount', 'status'])
    .where('status', 'completed')
    .andWhere('amount', '>', 100)
    .orderBy('createdAt', 'desc')
  )
  .fetchAllRecords()
  .pipe(toMainInstance(true))
  .toPromise();

// Access orders — Object keyed by record pk, not Array
for (const contact of Object.values(contacts)) {
  console.log(`${contact.firstName} has ${Object.values(contact.orders || {}).length} orders`);
}
```

### Example 3: Aggregate Query

```javascript
const stats = await orderModel.query()
  .where('status', 'completed')
  .andWhere('createdAt', '>', new Date('2024-01-01'))
  .count('*', 'total')
  .sum('amount', 'revenue')
  .avg('amount', 'avgOrder')
  .fetchDirect()
  .toPromise();

// resp could be null if no records matched
console.log(stats.resp && stats.resp[0]);
// { total: 1543, revenue: 125430.50, avgOrder: 81.25 }
```

### Example 4: Variables for Dynamic Queries

```javascript
function getContactsByRole(role, limit = 50) {
  return contactModel.query()
    .where('role', ':role')
    .andWhere('isActive', true)
    .limit(':limit')
    .fetchAllRecords({
      variables: { role, limit }
    })
    .pipe(toMainInstance(true))
    .toPromise();
}

const admins = await getContactsByRole('admin', 10);
```

---

## Related SDK Documentation

- **Action Dispatcher Concepts** → `docs/sdk-action-dispatcher.md`
- **Mutations** → `docs/sdk-mutations.md`
- **Virtual Fields** → `docs/sdk-virtual-fields.md`
- **Persistent Queries** → `docs/sdk-persistent-queries.md`
- **Client-Side SDK Patterns** → `docs/vitalsync-sdk-patterns.md`
