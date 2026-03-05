# LMS Real-Time Notifications & Course Browser — Reusable Feature Guide

Source: `AWC-LMS` (Australian Writers Centre Learning Management System widget)

## Overview

A production-ready, real-time notification and course browsing system for a Learning Management System. Built as a vanilla JS embedded widget using VitalSync SDK subscriptions for live updates. Features 12 alert types, 24 user preference flags, 3-role access control (student/teacher/admin), private submission guards, preference-based query filtering, mark-as-read mutations, and a course browser with role-specific views. Designed as a plugin that can be embedded into any host page via `<script>` tags.

## Architecture

- **Data layer**: VitalSync SDK (query builder + subscriptions for reads, mutations for writes)
- **Alert creation**: Direct GraphQL API (not SDK) with exponential backoff retry
- **Real-time**: SDK `.subscribe()` returns RxJS Observables — two parallel subscriptions (nav: 50 items, body: 5000 items)
- **Render optimization**: DJB2 hash signatures prevent re-rendering when data hasn't changed
- **Caching**: localStorage with TTL for courses (disabled for alerts — always fresh)
- **Access control**: Role-based query constraints (admin=all, teacher=their classes, student=enrolled classes)
- **User preferences**: 24 boolean flags injected as window globals, applied at query-build time
- **No build step**: Native ES6 modules loaded as `<script>` tags

### Data Flow

```
Host Page (injects window globals: userId, userType, 24 preferences)
    ↓
SDK Init (load CDN script, initialize with slug/apiKey)
    ↓
Plugin instance (switchTo models, query builder, mutations)
    ↓
NotificationCore.start()
    ├── Pre-fetch ownership data (my posts, submissions, announcements, comments)
    ├── Build query with preference-based OR branches
    ├── Subscribe to query (RxJS Observable)
    └── On each emission:
        ├── Map SDK records → UI format
        ├── Hash signature check (skip if unchanged)
        └── Render notification cards via innerHTML
```

## File Inventory (13 files)

### SDK Layer (3 files)
- `src/sdk/init.js` — `VitalStatsSDK` class: script loader, plugin initializer, model ID mapping with `switchToId()` helper
- `src/sdk/config.js` — SDK credentials (`slug`, `apiKey`)
- `src/sdk/userConfig.js` — `UserConfig` class: reads userId, userType, debug flags, and 24 notification preferences from window globals

### Notifications (5 files)
- `src/alerts/index.js` (442 lines) — Main entry: SDK init, creates 2 NotificationCore instances, event handlers (mark read, tabs, unread toggle, red dot)
- `src/alerts/NotificationCore.js` (862 lines) — Query builder with preference-based filtering, SDK subscriptions, ownership pre-fetching, signature-based render optimization
- `src/alerts/NotificationUI.js` (111 lines) — HTML rendering: notification cards, skeleton loaders, debug panel
- `src/alerts/NotificationUtils.js` (35 lines) — Data mapping (SDK snake_case → UI PascalCase) and `timeAgo()` helper
- `src/alerts/AlertCreator.js` (332 lines) — GraphQL-based alert creation with retry, URL builder for role-based navigation

### Courses (4 files)
- `src/courses/index.js` (61 lines) — Entry: SDK init, cache pre-render, CourseCore load
- `src/courses/CourseCore.js` (161 lines) — Query builder (students=enrolments, teachers/admins=classes), localStorage caching, signature-based render optimization
- `src/courses/CourseUI.js` (252 lines) — HTML rendering: nav items, home cards (role-specific), skeleton loaders, DOM pooling for efficient re-renders
- `src/courses/CourseUtils.js` (27 lines) — Data mapping: SDK enrolment/class records → UI objects

### Utilities (1 file)
- `src/utils/cacheConfig.js` — Cache TTL configuration (courses: 2-5 min, alerts: disabled), overridable via `window.AWC.cacheTTLs`

---

## Data Models

### Alert (AwcAlert)

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | Primary key |
| `alert_type` | string | One of 12 types (see below) |
| `alert_status` | string | `"Published"` (only published alerts shown) |
| `content` | string | Alert message body |
| `title` | string | Alert subject line |
| `created_at` | unix timestamp | Creation time |
| `is_read` | boolean | Read status |
| `is_mentioned` | boolean | User was @mentioned |
| `notified_contact_id` | number | Target user ID |
| `origin_url` | string | Click-through navigation URL |
| `unique_id` | string | Deduplication key |
| `parent_class_id` | number | Related class FK |
| `parent_post_id` | number | Related forum post FK |
| `parent_submission_id` | number | Related submission FK |
| `parent_announcement_id` | number | Related announcement FK |
| `parent_comment_id` | number | Related comment FK |

**Related fields (via `.include()`):**
- `Parent_Class.class_name` — Class display name
- `Parent_Class.Course.course_name` — Course display name

### Alert Types (12 total)

| Base Type | Mention Variant |
|-----------|-----------------|
| Post | Post Mention |
| Submission | Submission Mention |
| Announcement | Announcement Mention |
| Post Comment | Post Comment Mention |
| Submission Comment | Submission Comment Mention |
| Announcement Comment | Announcement Comment Mention |

### Enrolment (AwcEnrolment)

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | Primary key |
| `student_id` | number | Student FK |
| `status` | string | `"Active"` or `"New"` |
| `Course` | relation | → course_name, image, unique_id, module\_\_count\_\_visible, description |
| `Class` | relation | → id, unique_id, class_name |

### Class (AwcClass)

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | Primary key |
| `unique_id` | string | URL-safe identifier |
| `class_name` | string | Display name |
| `start_date` | unix timestamp | Class start date |
| `instructor_id` | number | Teacher FK |
| `Student_Enrolements` | number | Enrolment count |
| `Course` | relation | → course_name, image, unique_id, etc. |
| `Enrolments` | relation | → array of enrolment records |

### Computed/Calc Models (for ownership queries)

- `calcAnnouncements` — query by `instructor_id` to find user's announcements
- `calcForumPosts` / `getForumPosts` — query by `author_id` to find user's posts
- `calcForumComments` — query by `author_id` to find user's comments
- `calcSubmissions` / `getSubmissions` — query by `student_id` to find user's submissions

---

## User Preference System (24 flags)

All preferences are `"Yes"` or `"No"` strings injected as global JS variables by the host page.

### Preference Categories

```
Master Switch:
  turnOffAllNotifications         — Stops all notifications completely

Base Types (includes mentions when enabled):
  posts                           — Post alerts (+ Post Mention)
  submissions                     — Submission alerts (+ Submission Mention)
  announcements                   — Announcement alerts (+ Announcement Mention)

Mention-Only (when base type is OFF):
  postMentions                    — Only Post Mention where is_mentioned=true
  submissionMentions              — Only Submission Mention where is_mentioned=true
  announcementMentions            — Only Announcement Mention where is_mentioned=true

Comment Types (includes mentions when enabled):
  postComments                    — Post Comment alerts (+ Post Comment Mention)
  submissionComments              — Submission Comment alerts (+ Submission Comment Mention)
  announcementComments            — Announcement Comment alerts (+ Announcement Comment Mention)

Comment Mention-Only (when base comment type is OFF):
  postCommentMentions             — Only Post Comment Mention where is_mentioned=true
  submissionCommentMentions       — Only Submission Comment Mention where is_mentioned=true
  announcementCommentMentions     — Only Announcement Comment Mention where is_mentioned=true

Comments on My Content (when base comment type is OFF):
  commentsOnMyPosts               — Comments on posts I authored
  commentsOnMySubmissions         — Comments on submissions I submitted
  commentsOnMyAnnouncements       — Comments on announcements I created
```

### Preference Logic in Query Builder

Preferences are applied as **OR branches** within an `andWhere` group. The algorithm:

1. If `turnOffAllNotifications === "Yes"` → render empty list, skip query entirely
2. For each enabled base type: add OR branch for both base + mention alert_types
3. For each enabled mention-only (when base is OFF): add OR branch with `is_mentioned=true`
4. For each enabled "comments on my X" (when base comments OFF):
   - Pre-fetch user's owned entity IDs (posts, submissions, announcements, comments)
   - Add OR branch with `parent_X_id IN [owned IDs]` or relational fallback
5. If no preferences enabled: `limit(0)` to return no results

### Private Submission Guard (Students Only)

For submission-related alert types, students only see alerts where:
- The parent submission's assessment is NOT private (`private_submission = false`), OR
- The submission belongs to them (`Student.student_id = userId`)

```javascript
builder.andWhere((gate) => {
  gate.where((b) =>
    b.andWhere("Parent_Submission", (ps) =>
      ps.andWhere("Assessment", (a) => a.where("private_submission", false))
    )
  );
  gate.orWhere((b) =>
    b.andWhere("Parent_Submission", (ps) =>
      ps.andWhere("Student", (s) => s.where("student_id", userId))
    )
  );
});
```

---

## Key Patterns

### SDK Initialization with Model ID Mapping

The `VitalStatsSDK` class auto-discovers Ontraport model IDs from the plugin schema, enabling `switchToId("ALERT")` instead of hardcoding `switchTo("AwcAlert")`:

```javascript
class VitalStatsSDK {
  async initialize() {
    await this.loadScript();
    const initFn = window.initVitalStats || window.initVitalStatsSDK;
    const { plugin } = await initFn({ slug, apiKey, isDefault: true }).toPromise();

    // Build model maps from schema
    const models = plugin.getState();
    const MODELS_BY_ID = {};
    for (const modelName in models) {
      const props = models[modelName]?.schema?.props;
      if (props?.dataSourceType === 'ontraport' && props.objectId != null) {
        MODELS_BY_ID[String(props.objectId)] = models[modelName].schema.name;
      }
    }

    // Infer well-known model IDs
    const MODEL_IDS = {
      ALERT: inferIdByName('AwcAlert'),
      CLASS: inferIdByName('AwcClass'),
      ENROLMENT: inferIdByName('AwcEnrolment'),
    };

    // Attach switchToId helper
    plugin.switchToId = (key) => {
      const name = resolveModelName(key);
      return plugin.switchTo(name);
    };
    return plugin;
  }
}
```

### Two-Tier Subscription System

Nav and body run as independent subscriptions with different limits:

```javascript
// Nav: fast, limited (priority load)
const navCore = new NotificationCore({
  plugin, limit: 50,
  targetElementId: "navbar-notifications-list",
  scope: "nav",
});
await navCore.start();

// Body: comprehensive (deferred load via requestIdleCallback)
const bodyCore = new NotificationCore({
  plugin, limit: 5000,
  targetElementId: "body-notifications-list",
  scope: "body",
});
// Start after nav is ready to reduce contention
if (window.requestIdleCallback) {
  window.requestIdleCallback(() => bodyCore.start(), { timeout: 2500 });
} else {
  setTimeout(() => bodyCore.start(), 900);
}
```

### Subscription Lifecycle

```javascript
async start() {
  // 1. Pre-fetch ownership IDs (parallel)
  const [myAnnouncements, myPosts, mySubmissions, myComments] =
    await Promise.all([...]);

  // 2. Build query with all preference branches
  this.query = this.buildQuery([]);

  // 3. Subscribe (server or local fallback)
  const serverObs = this.query.subscribe
    ? this.query.subscribe()
    : this.query.localSubscribe();

  // 4. Handle emissions with signature-based dedup
  const subscription = serverObs
    .pipe(window.toMainInstance(true))
    .subscribe((payload) => {
      const raw = payload?.records || payload || [];
      const recs = raw.map(NotificationUtils.mapSdkNotificationToUi);
      const newSig = this.listSignature(recs);
      if (!this.lastSig || newSig !== this.lastSig) {
        NotificationUI.renderList(recs, element);
        this.lastSig = newSig;
      }
    });

  // 5. Resolve on first emission for loading state
  return firstEmissionPromise;
}
```

### Signature-Based Render Optimization

DJB2 hash of record content prevents redundant DOM updates:

```javascript
hashKey(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++)
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

listSignature(list) {
  const norm = list.map(x =>
    [x.ID, x.Is_Read ? 1 : 0, x.Alert_Type, x.Title, x.Date_Added, x.Parent_Class_ID]
  ).join('|');
  return this.hashKey(norm);
}
```

### Mark as Read (Individual + Bulk)

```javascript
// Individual: SDK mutation
async function markAsRead(id) {
  const mut = plugin.mutation();
  const target = mut.switchToId("ALERT");  // or mut.switchTo("AwcAlert")
  await target
    .update((q) => q.where("id", Number(id)).set({ is_read: true }))
    .execute(true)
    .toPromise();
  // Subscriptions emit automatically — both views update
}

// Bulk: loop with fresh mutation per iteration (IMPORTANT!)
async function markAllAsRead() {
  const unreadIds = Array.from(document.querySelectorAll(".notification-card.unread"))
    .map(c => Number(c.dataset.id))
    .filter(Number.isFinite);

  for (const id of unreadIds) {
    const mut = plugin.mutation();  // NEW mutation each iteration
    await mut.switchToId("ALERT")
      .update((q) => q.where("id", Number(id)).set({ is_read: true }))
      .execute(true)
      .toPromise();
  }
  // Optimistically update DOM
  unreadCards.forEach(c => c.classList.remove("unread"));
}
```

### Alert Creation via GraphQL (Not SDK)

```javascript
const ALLOWED_FIELDS = new Set([
  'alert_type', 'content', 'created_at', 'is_mentioned', 'is_read',
  'notified_contact_id', 'origin_url', 'origin_url_teacher', 'origin_url_admin',
  'alert_status', 'parent_announcement_id', 'parent_class_id',
  'parent_comment_id', 'parent_post_id', 'parent_submission_id', 'title',
]);

async function createAlert(payload) {
  const clean = buildAlertPayload(payload);  // Sanitize to allowed fields
  const query = `mutation createAlerts($payload: [AlertCreateInput]) {
    createAlerts(payload: $payload) { is_mentioned }
  }`;
  return retryUntilSuccess(async () => {
    return await gqlFetch(query, { payload: [clean] });
  }, { initialDelayMs: 500, maxDelayMs: 30000, factor: 2, jitter: 0.2 });
}

// Exposed globally
window.AWC.createAlert(payload);
window.AWC.createAlerts([...payloads]);
```

### Role-Based Course Queries

```javascript
// Students: query enrolments → include Course + Class
if (type === 'student') {
  return plugin.switchToId('ENROLMENT').query()
    .select(['id'])
    .where('student_id', userId)
    .andWhere(q => q.where('status', 'Active').orWhere('status', 'New'))
    .include('Course', q => q.select(['unique_id', 'course_name', 'image', 'module__count__visible', 'description']))
    .include('Class', q => q.select(['id', 'unique_id', 'class_name']))
    .limit(limit).offset(0).noDestroy();
}

// Teachers: query classes where Teacher.id = userId
if (type === 'teacher') {
  return plugin.switchToId('CLASS').query()
    .select(['id', 'unique_id', 'class_name', 'start_date', 'Student_Enrolements'])
    .include('Course', q => q.select([...]))
    .include('Enrolments', q => q.select(['id']))
    .andWhere('Teacher', qb => qb.where('id', userId))
    .limit(limit).offset(0).noDestroy();
}

// Admins: same as teachers but no .andWhere filter (see all classes)
```

### Client-Side Filtering (Tabs + Unread Toggle)

Filters are applied to rendered DOM, not by rebuilding queries:

```javascript
function applyFilters() {
  const hideRead = unreadToggle?.checked;
  const cards = container.querySelectorAll('.notification-card');
  cards.forEach(card => {
    const isUnread = card.classList.contains('unread');
    const type = card.dataset.type || '';
    const matchesTab = currentTab === 'all' ||
      (currentTab === 'announcements' && type.startsWith('Announcement'));
    card.classList.toggle('hidden', (hideRead && !isUnread) || !matchesTab);
  });
}

// Re-apply filters on subscription re-renders
const observer = new MutationObserver(() => applyFilters());
observer.observe(container, { childList: true, subtree: true });
```

---

## DOM Elements Required

```html
<!-- Navbar Notification Dropdown -->
<button id="toggle-notifications" class="relative">
  <span id="navbar-unread-dot"></span>  <!-- Red dot (auto-created if missing) -->
</button>
<div id="navbar-notifications-list"></div>
<div id="navbar-notifications-loading"></div>
<button id="navbar-mark-all">Mark All</button>
<input id="navbar-unread-toggle" type="checkbox" />
<a id="navbar-tab-all">All</a>
<a id="navbar-tab-announcements">Announcements</a>

<!-- Full Notifications Page -->
<div id="body-notifications-list"></div>
<div id="body-notifications-loading"></div>
<button id="body-mark-all">Mark All</button>
<input id="body-unread-toggle" type="checkbox" />
<a id="body-tab-all">All</a>
<a id="body-tab-announcements">Announcements</a>

<!-- Course Navigation Dropdown -->
<div id="navCoursesContainer"></div>
<div id="nav-courses-loading"></div>

<!-- Course Home Page Grid -->
<div id="homeCoursesContainer"></div>
<div id="home-courses-loading"></div>
```

## Global Variables Required (Injected by Host Page)

```javascript
// User identity (required)
window.loggedinuserid = 12345;           // or: var userIdForSDK = 12345;
window.loggedinuserType = "student";     // or: var userTypeForSDK = "student";
// Values: "student" | "teacher" | "admin"

// Debug (optional)
var debug_Notifications = false;

// GraphQL endpoint (required for alert creation)
var graphqlApiEndpoint = "https://awc.vitalstats.app/api/v1/graphql";
var apiAccessKey = "your-api-key";

// Notification preferences (all "Yes" or "No")
var user_Preference_Turn_Off_All_Notifications = "No";
var user_Preference_Posts = "Yes";
var user_Preference_Submissions = "Yes";
var user_Preference_Announcements = "Yes";
var user_Preference_Post_Comments = "Yes";
var user_Preference_Submission_Comments = "Yes";
var user_Preference_Announcement_Comments = "Yes";
var user_Preference_Comments_On_My_Posts = "No";
var user_Preference_Comments_On_My_Submissions = "No";
var user_Preference_Comments_On_My_Announcements = "No";
var user_Preference_Post_Mentions = "No";
var user_Preference_Post_Comment_Mentions = "No";
var user_Preference_Submission_Mentions = "No";
var user_Preference_Submission_Comment_Mentions = "No";
var user_Preference_Announcement_Mentions = "No";
var user_Preference_Announcement_Comment_Mentions = "No";
```

## Global API Exposed

```javascript
window.AWC.createAlert(payload)          // Create single alert via GraphQL
window.AWC.createAlerts([...payloads])   // Create multiple alerts
window.AWC.buildAlertPayload(payload)    // Sanitize to allowed fields
window.AWC.buildAlertUrl(role, category, params)  // Build role-based navigation URL
window.AWC.waitForAlertParams(category, params)   // Wait for URL params to resolve
window.AWC.getAlertsDebug()              // Get query debug info
window.AWC.cacheTTLs                     // Override cache TTLs
window.AWC.alertsRetryConfig             // Override retry config
```

---

## React Migration Guide

### State Management

| Vanilla JS | React Equivalent |
|-----------|-----------------|
| Window globals (userId, userType, preferences) | React Context provider or Zustand store |
| `new UserConfig()` reading globals | `useAuth()` hook returning user + preferences |
| DOM `getElementById` + `innerHTML` | Component state + JSX rendering |
| `MutationObserver` for filter reapply | `useEffect` dependency on filter state |
| `localStorage` cache | TanStack Query with `staleTime` / `gcTime` |
| `window.AWC.*` global API | Exported functions or context methods |

### Component Structure

```
<NotificationProvider>          // Context: plugin, userId, preferences
  <NotificationBell />          // Navbar: dropdown + red dot
    <NotificationList scope="nav" limit={50} />
    <NotificationFilters />     // Tabs (All/Announcements) + Unread toggle
    <MarkAllButton />
  <NotificationsPage />         // Full page
    <NotificationList scope="body" limit={5000} />
    <NotificationFilters />
    <MarkAllButton />
</NotificationProvider>

<CourseProvider>
  <CourseDropdown />            // Navbar: 10 items
  <CourseGrid />                // Home: paginated cards
</CourseProvider>
```

### Key Hooks

```typescript
// Real-time notification subscription
function useNotificationSubscription(plugin, preferences, limit) {
  const [notifications, setNotifications] = useState([]);
  const queryRef = useRef(null);
  const subRef = useRef(null);

  useEffect(() => {
    if (!plugin) return;
    // Build query from preferences (same logic as NotificationCore.buildQuery)
    queryRef.current = buildNotificationQuery(plugin, preferences, limit);
    subRef.current = queryRef.current.subscribe()
      .pipe(window.toMainInstance(true))
      .subscribe((payload) => {
        const records = (payload?.records || []).map(mapSdkToUi);
        setNotifications(records);
      });
    return () => {
      subRef.current?.unsubscribe();
      queryRef.current?.destroy?.();
    };
  }, [plugin, preferences, limit]);

  return notifications;
}

// Mark as read mutation
function useMarkAsRead(plugin) {
  return useCallback(async (id) => {
    const mut = plugin.mutation();
    await mut.switchToId("ALERT")
      .update(q => q.where("id", id).set({ is_read: true }))
      .execute(true).toPromise();
  }, [plugin]);
}

// Course fetcher
function useCourses(plugin, userType, userId, limit) {
  return useQuery({
    queryKey: ['courses', userType, userId, limit],
    queryFn: async () => {
      const query = buildCourseQuery(plugin, userType, userId, limit);
      const payload = await query.fetchDirect().toPromise();
      return (payload?.resp || []).map(mapEnrolmentToUi);
    },
    staleTime: 2 * 60 * 1000,  // 2 min
  });
}
```

### Ontraport App Migration

For Ontraport (vanilla JS) apps, the existing code is already close to the right pattern. Key adaptations:

1. Replace `import/export` with IIFEs attaching to `window`
2. Config via `window.AppConfig` (set by Ontraport merge fields in header)
3. User identity from `[Visitor//Contact ID]` merge field
4. Preferences from Ontraport contact fields (merge fields or API lookup)
5. Keep `window.toMainInstance(true)` pipe on all queries

---

## Gotchas & Lessons Learned

1. **Create new mutation per iteration in bulk mark-as-read** — Reusing the same mutation object across loop iterations causes silent failures. Always `plugin.mutation()` inside the loop.

2. **SDK `fetchDirect()` vs `fetchAllRecords()`** — This app uses `fetchDirect().toPromise()` for one-time fetches. Response shape is `{ resp: [...] }` not the standard `records` object. Check both patterns.

3. **Private submission guard uses deep relational filters** — `Parent_Submission.Assessment.private_submission` and `Parent_Submission.Student.student_id`. These relational `.andWhere()` calls may not be available on all SDK versions — wrapped in try/catch for safety.

4. **Preference logic: base type enables mentions implicitly** — When `posts = "Yes"`, both "Post" and "Post Mention" types are included. `postMentions` only applies when `posts = "No"`.

5. **"Comments on my X" requires pre-fetching ownership IDs** — The query builder needs to know which posts/submissions/announcements belong to the user BEFORE building the subscription query. These are fetched in parallel at startup.

6. **SDK `.subscribe()` may not exist** — Always check `this.query.subscribe ? this.query.subscribe() : this.query.localSubscribe()` as a fallback.

7. **MutationObserver for filter persistence** — When subscriptions re-render the list (replacing innerHTML), client-side filters (tab selection, unread toggle) are lost. A MutationObserver watching `childList` re-applies filters after each render.

8. **Ordering API varies across SDK versions** — The code tries `orderBy()`, then `sortBy()`, then `order()`, then `order_by()`, then `orderByRaw()` until one works. Wrap in try/catch chains.

9. **No `whereIn` on older SDK** — Falls back to chaining `.where()` + `.orWhere()` for array values.

10. **GraphQL for creation, SDK for reads** — Alert creation uses direct GraphQL with retry because the SDK mutation API doesn't support the `createAlerts` batch endpoint. Reads and mark-as-read use SDK.

11. **Body notifications use `requestIdleCallback`** — Deferred loading reduces contention with nav (priority) subscription during initial page load.

12. **Cache disabled for alerts** — Real-time accuracy trumps loading speed for notifications. Courses still use localStorage cache for fast initial paint.

13. **DJB2 hash for signatures** — Simple, fast, collision-resistant enough for UI dedup. Used for both render optimization and cache invalidation.

14. **Skeleton loaders before SDK init** — Nav shows skeleton immediately (before SDK loads), then replaces with cache data (if available), then replaces with live data. Three-phase loading for perceived performance.
