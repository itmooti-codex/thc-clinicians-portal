# VitalSync SDK API Test Findings

Standalone tests run against the live VitalSync SDK (no app UI). Use these to see what works and what fails.

## How to run

1. Start the dev server: `npm run dev`
2. In another terminal: `npx playwright test tests/sdk-api-tests.spec.js -c playwright.sdk.config.js`

Or open **http://localhost:3000/dev/sdk-api-tests.html** in a browser and watch the results on the page and in the console.

## What the 10 tests do

| # | Test | What it does |
|---|------|--------------|
| 1 | ThcItem limit 5 | Fetch up to 5 items (e.g. drugs) |
| 2 | ThcContact limit 5 | Fetch up to 5 contacts (patients) |
| 3 | ThcContact by id 425 | Fetch single contact by ID |
| 4 | ThcAppointment limit 5 | Fetch up to 5 appointments |
| 5 | ThcAppointment doctor_id=425 | Fetch up to 10 appointments for doctor 425 |
| 6 | ThcItem limit 20 | Fetch up to 20 items |
| 7 | ThcContact limit 20 | Fetch up to 20 contacts |
| 8 | ThcClinicalNote patient_id=425 | Fetch clinical notes for patient 425 |
| 9 | ThcScript patient_id=425 | Fetch scripts for patient 425 |
| 10 | ThcContact search first_name like %a% | Search contacts by first name (LIKE) |

There is a **4 second delay** between each query to reduce "currently executing logic" errors.

## Findings (from last run)

- **Connect**: Succeeds. Plugin is available after `VitalSync.connect()`.
- **ThcItem** (1, 6): Queries **succeed**. If you see count: 0 here, see "Contact/Item count fix" below.
- **ThcContact** (2, 3): Queries **succeed**. If you see count: 0 here, see "Contact/Item count fix" below.

### Contact/Item count fix

The SDK can return objects keyed by primary key where the **keys are non-enumerable**. Using `Object.keys()` on that object returns `[]`, so we showed 0 contacts/items even when data was present. In `src/js/vitalsync.js`, `toPlain()` was updated to use **`Object.getOwnPropertyNames(data)`** instead of `Object.keys(data)` when converting the keyed-by-PK object to an array, so contacts and items are now counted and converted correctly.
- **ThcAppointment** (4, 5): Queries **succeed** and return **real data** (5 and 10 records).
- **ThcContact limit 20** (7): **Fails** with SDK error:  
  `logic error -- executeQuery -- currently executing logic`
- **ThcContact search first_name like %a%** (10): When run earlier in the sequence (e.g. as test 4), **fails** with the same "currently executing logic" error.

### Conclusions

1. **Appointment queries work** and return data. Item and Contact queries can succeed but may return 0 rows (data/permissions).
2. **"Currently executing logic"** is triggered in practice when:
   - Running a **`like` search** on ThcContact (e.g. `where('first_name', 'like', '%a%')`), or
   - Running **another ThcContact query** after several previous queries (e.g. ThcContact limit 20 as the 7th query).
3. The SDK appears to **serialize or limit** how many operations can run, or has a bug when mixing ThcContact with other models or when re-querying ThcContact.
4. **Recommendation for the app**: Use long delays (e.g. 4s) between VitalSync queries, run the minimal set of queries needed on load (e.g. only fetchItems or only fetchAppointments first), and consider avoiding `like`-based patient search via the SDK—or run it only once after a long delay and no other Contact queries in between.
