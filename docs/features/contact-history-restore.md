# Restoring Deleted or Overwritten Contacts via ContactHistory

VitalSync maintains a complete history of every change to every record. When contacts are accidentally deleted, bulk-overwritten, or corrupted, you can use `calcContactHistories` to find their previous state and restore them.

## How ContactHistory Works

Every time a contact is created, updated, or deleted in Ontraport, VitalSync stores a **history snapshot** — a frozen copy of the entire record at that moment. Each snapshot has metadata fields:

| Field | Type | Description |
|-------|------|-------------|
| `historyId` | string | Unique ID for this history entry |
| `id` | number | The contact's ID (same across all snapshots) |
| `_ts_` | unix timestamp | When this snapshot was created |
| `_tsAction_` | enum | `create`, `update`, or `delete` |
| `_valid_to_` | unix timestamp | When this snapshot was superseded by a newer one. `2147483647` means it's the **current** state |

Every contact field (`first_name`, `last_name`, `email`, `company`, etc.) is available on the history model — it's a full snapshot, not a diff.

## Query Syntax

ContactHistory uses the `calc` query pattern with `field(arg: [...])` aliasing:

```graphql
{
  calcContactHistories(
    query: [{ where: { id: "308" } }],
    limit: 10
  ) {
    historyId: field(arg: ["historyId"])
    id: field(arg: ["id"])
    first_name: field(arg: ["first_name"])
    last_name: field(arg: ["last_name"])
    email: field(arg: ["email"])
    ts: field(arg: ["_ts_"])
    tsAction: field(arg: ["_tsAction_"])
    validTo: field(arg: ["_valid_to_"])
  }
}
```

**Important syntax rules:**
- Query name is `calcContactHistories` (NOT `calcContactHistorys`)
- Aliases **cannot start with `_`** — use `ts` not `_ts_`, `validTo` not `_valid_to_`
- Filter by contact ID using `id`, not `Contact_id`

## Investigating Deleted or Corrupted Records

### Step 1: Find the current state

Check what VitalSync currently has for the contact:

```graphql
{
  getContacts(
    query: [{ where: { id: "266" } }],
    limit: 1
  ) {
    id first_name last_name email
  }
}
```

### Step 2: Check if the contact exists in Ontraport

Use the Ontraport REST proxy to verify:

```
GET /api/ontraport/Contacts/getInfo?id=266
```

- If it returns data, the contact exists but VitalSync may be stale
- If it returns 404, the contact was deleted from Ontraport

### Step 3: View the full history timeline

Query all history snapshots for the contact, ordered by timestamp:

```graphql
{
  calcContactHistories(
    query: [{ where: { id: "266" } }],
    limit: 50
  ) {
    historyId: field(arg: ["historyId"])
    id: field(arg: ["id"])
    first_name: field(arg: ["first_name"])
    last_name: field(arg: ["last_name"])
    email: field(arg: ["email"])
    ts: field(arg: ["_ts_"])
    tsAction: field(arg: ["_tsAction_"])
    validTo: field(arg: ["_valid_to_"])
  }
}
```

This shows every version of the contact over time. Look for:
- The `_tsAction_: "delete"` entry (when it was deleted)
- Suspicious bulk updates (many contacts with the same `_ts_` timestamp)
- The last "good" snapshot before corruption

### Step 4: Find the pre-corruption snapshot

If you know the timestamp of the bad update, query for the snapshot that was active right before it:

```graphql
{
  calcContactHistories(
    query: [{ where: { id: "266", _valid_to_: 1771289847 } }],
    limit: 1
  ) {
    id: field(arg: ["id"])
    first_name: field(arg: ["first_name"])
    last_name: field(arg: ["last_name"])
    email: field(arg: ["email"])
    company: field(arg: ["company"])
    # ... any other fields you need
  }
}
```

The `_valid_to_` filter finds the snapshot that was superseded at exactly that timestamp — i.e., the state immediately before the corruption.

### Step 5: Find bulk corruption across many contacts

If a bulk update corrupted many contacts (e.g., all set to "Test Comprehensive"), find all affected records:

```graphql
# Find all contacts currently in the corrupted state
{
  calcContactHistories(
    query: [{ where: {
      first_name: "Test",
      last_name: "Comprehensive",
      _valid_to_: 2147483647
    } }],
    limit: 100
  ) {
    id: field(arg: ["id"])
  }
}

# Then get all pre-corruption snapshots at once
{
  calcContactHistories(
    query: [{ where: { _valid_to_: 1771289847 } }],
    limit: 100
  ) {
    id: field(arg: ["id"])
    first_name: field(arg: ["first_name"])
    last_name: field(arg: ["last_name"])
    email: field(arg: ["email"])
  }
}
```

## Restoring Contacts

### Case A: Contact exists in Ontraport (stale VitalSync data)

Update via VitalSync GraphQL mutation — this syncs the change back to Ontraport:

```graphql
mutation {
  updateContact(
    ID: "308",
    payload: {
      first_name: "Bill",
      last_name: "Doyle",
      email: "bill@altitudecommunications.com.au"
    }
  ) {
    id first_name last_name email
  }
}
```

**Constraint:** Only **one mutation per GraphQL request**. Batch aliases like `c1: updateContact(...) c2: updateContact(...)` will fail with "mutation already complete". You must send separate requests for each contact.

**Mutation argument is `ID` (uppercase), not `id`.**

### Case B: Contact deleted from Ontraport

VitalSync mutations will fail with a 404 because there's no backing Ontraport record. You must **re-create the contact in Ontraport first**:

```
POST Ontraport REST API /objects (objectID: 0)
{
  "firstname": "Tobin",
  "lastname": "Poppenberg",
  "email": "tobin@ontragenius.com",
  "unique_id": "HUEY000",
  "bulk_mail": "1",
  "bulk_sms": "0"
}
```

Or use the `ontraport_contact` MCP tool with `action: "create"`.

Note: This creates a **new** contact with a new ID — it won't have the same ID as the deleted record. If you need to preserve relationships (tasks, orders, etc.), you may need to update those references.

### Case C: Retrieve full contact data for restoration

When restoring, you likely want all meaningful fields. Query the history with all relevant fields:

```graphql
{
  calcContactHistories(
    query: [{ where: { id: "266", _valid_to_: 1771289847 } }],
    limit: 1
  ) {
    id: field(arg: ["id"])
    first_name: field(arg: ["first_name"])
    last_name: field(arg: ["last_name"])
    email: field(arg: ["email"])
    company: field(arg: ["company"])
    title: field(arg: ["title"])
    address: field(arg: ["address"])
    city: field(arg: ["city"])
    state: field(arg: ["state"])
    zip_code: field(arg: ["zip_code"])
    country: field(arg: ["country"])
    office_phone: field(arg: ["office_phone"])
    sms_number: field(arg: ["sms_number"])
    mobile_number: field(arg: ["mobile_number"])
    website: field(arg: ["website"])
    owner_id: field(arg: ["owner_id"])
    sales_pipeline: field(arg: ["sales_pipeline"])
    unique_id: field(arg: ["unique_id"])
    created_at: field(arg: ["created_at"])
    email_opt_in: field(arg: ["email_opt_in"])
    bulk_email_status: field(arg: ["bulk_email_status"])
    bulk_sms_status: field(arg: ["bulk_sms_status"])
    business_name: field(arg: ["business_name"])
    score: field(arg: ["score"])
    timezone: field(arg: ["timezone"])
    spent: field(arg: ["spent"])
  }
}
```

## Quick Reference

| Task | Query/Mutation |
|------|---------------|
| Get current state | `calcContactHistories` with `_valid_to_: 2147483647` |
| Get state before timestamp X | `calcContactHistories` with `_valid_to_: X` |
| Find all currently corrupted | Filter by corrupted field values + `_valid_to_: 2147483647` |
| Restore existing contact | `mutation { updateContact(ID: "...", payload: {...}) }` |
| Restore deleted contact | Create new contact via Ontraport REST API |
| Check if deleted in Ontraport | Ontraport REST GET returns 404 |
