# Social Feed / MemberFeed — Reusable Feature Guide

Source: `memberfeed-eventmx` (VitalStats MemberFeed product)

## Overview

A real-time social feed powered by VitalStats GraphQL API with posts, threaded comments/replies, reactions (likes), bookmarks, @mentions, in-app notifications, file attachments (images/video/audio/documents), admin moderation, and client-side filtering/sorting/search. Uses direct WebSocket subscriptions (not the SDK subscription system) for real-time updates.

## Architecture

- **Data layer**: VitalStats GraphQL API (HTTP for mutations/queries, WebSocket for subscriptions)
- **Real-time**: Two independent WebSocket connections — one for the feed, one for notifications
- **File uploads**: VitalStats REST S3 upload API (see `docs/vitalsync-sdk-patterns.md`)
- **Access control**: Tag-based — contacts tagged `{PageTag}_Admin` or `{PageTag}_Subscriber`
- **State**: Dual storage — flat `rawItems[]` (for merging) + tree `postsStore[]` (for rendering)
- **Threading**: 3 levels max — Post (depth 0) → Comment (depth 1) → Reply (depth 2)

## Data Models

### Feed Post (core entity)

| Field | Type | Notes |
|-------|------|-------|
| `id` | ID | VitalStats internal ID |
| `unique_id` | String (8 chars) | Short unique identifier |
| `author_id` | ContactID | Creator |
| `feed_copy` | HTML String | Content body |
| `published_date` | Unix timestamp | When published (or scheduled for) |
| `feed_status` | Enum | `"Published - Not Flagged"` or `"Scheduled"` |
| `feed_type` | Enum | `"Post"`, `"Comment"`, or `"Reply"` |
| `depth` | 0, 1, or 2 | Nesting level |
| `parent_feed_id` | FeedID or null | null for root posts |
| `feed_tag` | String | Tag identifier for which feed page |
| `featured_feed` | Boolean | Admin-featured |
| `disable_new_comments` | Boolean | Admin-locked |
| `file_content` | JSON string | `{ link, name, size, type }` |
| `file_type` | Enum or null | `"Image"`, `"Video"`, `"Audio"`, `"File"` |

### Junction Tables

- **Reactions (Likes)**: `OFeedReactorReactedtoFeed` — `{ feed_reactor_id, reacted_to_feed_id }`
- **Bookmarks (Saves)**: `OBookmarkingContactBookmarkedFeed` — `{ bookmarking_contact_id, bookmarked_feed_id }`

### Notifications

| Field | Type | Notes |
|-------|------|-------|
| `notified_contact_id` | ContactID | Who to notify |
| `parent_feed_id` | FeedID | The post/comment that triggered it |
| `parent_feed_if_not_a_post` | FeedID | Root post (for comment/reply notifications) |
| `notification_type` | String | `"Post"`, `"Comment"`, `"Reply"`, `"Post Mention"`, `"Comment Mention"`, `"Reply Mention"` |
| `title` | String | Human-readable, e.g. "John mentioned you in a comment." |
| `is_read` | Boolean | Read status |

### Contact Notification Preferences (4 mutually exclusive flags)

| Flag | Field | Effect |
|------|-------|--------|
| Turn off all | `turn_off_all_notifications` | Master kill switch |
| All posts | `notify_me_of_all_posts` | Get everything |
| Comments on my posts | `notify_me_of_comments_replies_on_my_posts_only` | Only interactions on your posts |
| Mentions only | `notify_me_when_i_am_mentioned` | Only when @mentioned |

Only ONE preference active at a time (besides "turn off all"). Enabling one disables others.

## Key Patterns

### Tag-Based Access Control

Contacts are assigned tags to determine role:
- `{PageTag}_Admin` — Full access: feature posts, disable comments, delete any post, see scheduled posts
- `{PageTag}_Subscriber` — Standard access: create posts, comment, like, bookmark, delete own posts

Check role via `calcContacts` query filtering by tag:

```graphql
query feedContacts($id: {Account}ContactID, $name: TextScalar) {
  feedContacts: calcContacts(
    query: [
      { where: { id: $id } }
      { andWhere: { TagsData: [{ where: { Tag: [{ where: { name: $name } }] } }] } }
    ]
  ) { Contact_ID: field(arg: ["id"]) }
}
```

### WebSocket Feed Subscription

Uses two independent WebSocket connections (see `docs/vitalsync-sdk-patterns.md` for protocol details):

1. **Feed socket** — subscribes to root posts, receives real-time creates/updates/deletes
2. **Notification socket** — subscribes to notifications filtered by user preferences

Admin subscription includes `{ orWhere: { feed_status: "Scheduled" } }` to see scheduled posts.

### Deep Merge by ID (WebSocket Updates)

All incoming WebSocket data is **merged** (not replaced) with existing data. Critical behaviors:
- New values override old values
- `null`/`undefined` new values are **skipped** (preserves existing data)
- Arrays are recursively merged by `id` field
- Objects are recursively deep-merged

```javascript
function mergeLists(oldList, newList, idKey = 'id') {
  const map = new Map();
  for (const item of oldList) {
    if (item?.[idKey] != null) map.set(item[idKey], item);
  }
  for (const item of newList) {
    if (!item || item[idKey] == null) continue;
    const existing = map.get(item[idKey]);
    map.set(item[idKey], mergeObjects(existing || {}, item));
  }
  return Array.from(map.values());
}

function mergeObjects(oldObj, newObj) {
  const result = { ...oldObj };
  for (const [key, val] of Object.entries(newObj)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) result[key] = mergeLists(oldObj[key] || [], val);
    else if (typeof val === 'object') result[key] = mergeObjects(oldObj[key] || {}, val);
    else result[key] = val;
  }
  return result;
}
```

### Tree Building (Flat → Hierarchical)

Flat items linked via `parent_feed_id` into parent-child tree:
- Depth 0 → Post (root)
- Depth 1 → Comment (child of post)
- Depth 2 → Reply (child of comment, max nesting — deeper items flattened to depth 2)

Posts expanded by default, comments with replies collapsed by default. Collapsed state (`collapsedState[uid]`) persists across re-renders.

### Optimistic UI with Socket Echo Suppression

After creating a post/comment:
1. Add to state immediately (optimistic)
2. Set `ignoreNextSocketUpdate = true`
3. When the WebSocket echoes the same data back, skip the re-render
4. Reset the flag after

### Post Creation Flow

1. Validate (content or file must exist)
2. Sanitize HTML (DOMPurify)
3. Extract @mentions from `data-mention-id` attributes
4. Upload file to S3 if attached
5. Send `createFeed` mutation
6. Optimistic UI update (add to tree, expand parent for comments)
7. Send bulk `createNotifications` to all contacts
8. Clear editor, close modal, show toast

### @Mentions System

Uses **Tribute.js** for autocomplete:

```javascript
const tribute = new Tribute({
  trigger: "@",
  values: contacts, // [{ key: "John Doe", value: contactId, image: url }]
  selectTemplate: (item) =>
    `<span contenteditable="false" class="mention" data-mention-id="${item.original.value}">@${item.original.key}</span>`
});
tribute.attach(editorElement);
```

Extract mentions from HTML on submit:
```javascript
const mentionedIds = Array.from(
  feedCopy.matchAll(/data-mention-id=['"](\d+)['"]/g)
).map(m => Number(m[1]));
```

### Notification Type Logic

```
isMentioned + Post    → "Post Mention"    → "John mentioned you in a post."
isMentioned + Comment → "Comment Mention"  → "John mentioned you in a comment."
isMentioned + Reply   → "Reply Mention"    → "John mentioned you in a reply."
!mentioned + Comment + isParentOwner → "Comment" → "John commented on your post."
!mentioned + Reply + isParentOwner   → "Reply"   → "John replied to your comment."
default → type → "John created a post."
```

### Dynamic Notification Subscription Filters

The notification subscription query is **dynamically generated** based on user preferences. When preferences change:
1. Update preference via mutation
2. `GQL_STOP` the current notification subscription
3. `GQL_START` a new one with rebuilt query filters

### Reactions (Like/Unlike)

Toggle via junction table create/delete:
```javascript
// Like: createOFeedReactorReactedtoFeed({ feed_reactor_id, reacted_to_feed_id })
// Unlike: deleteOFeedReactorReactedtoFeed({ id: reactionRecordId })
```
Disable button during API call to prevent double-clicks.

### Bookmarks (Save/Unsave)

Same pattern as reactions, using `OBookmarkingContactBookmarkedFeed` junction table. Only available on root posts (depth 0).

### Post Modal (Separate WebSocket)

Opening a single post in a modal creates a **separate WebSocket** that subscribes to the full post tree (3 levels deep). This prevents modal updates from interfering with main feed state.

### Admin Moderation

- **Feature/unfeature post**: `updateFeedPost({ featured_feed: true/false })`
- **Disable/enable comments**: `updateFeedPost({ disable_new_comments: true/false })` — propagates recursively
- **Delete any post**: `deleteFeed({ id })` — recursive DFS removal from tree
- **Scheduled posts**: Create with `feed_status: "Scheduled"` + future `published_date`. "Post Now" changes status to `"Published - Not Flagged"`.

### Client-Side Filtering, Sorting & Search

All applied to `postsStore` before rendering:

**Filters**: Recent (default), Featured, My Posts, Saved Posts, Scheduled (admin)
**File type filters**: All, Image, Video, Audio, File
**Sort**: Latest, Oldest, Most Popular (`upvotes + children.length`)
**Search**: Case-insensitive on author name + content, debounced 300ms

## Dependencies (Vanilla JS version)

| Library | Purpose |
|---------|---------|
| Tribute.js 5.x | @mention autocomplete |
| DOMPurify 3.x | XSS sanitization |
| FilePond + plugins | File upload UI with preview |
| Plyr 3.x | Video/audio player |
| mic-recorder-to-mp3 | Browser audio recording |

## React Migration Notes

| Vanilla JS | React Equivalent |
|-----------|-----------------|
| Global `state` object | Zustand store or `useReducer` |
| Manual WebSocket lifecycle | Custom `useVitalStatsSubscription` hook |
| `mergeLists` / `mergeObjects` | Same utilities (framework-agnostic) |
| `buildTree` | Derived state via `useMemo` |
| JsRender templates | `<Post />`, `<Comment />` (recursive), `<PostModal />` |
| contenteditable + execCommand | Tiptap, Slate, or Lexical |
| Tribute.js | Tiptap mention extension |
| FilePond | react-filepond or react-dropzone |
| Two DOM notification targets | Shared Zustand store |
| Modal WebSocket | Separate hook instance in modal component |

## Gotchas & Lessons Learned

- **Optimistic UI requires socket echo suppression** — without `ignoreNextSocketUpdate`, the same post renders twice
- **Notification preferences are mutually exclusive** — enabling one must disable all others
- **Post modal needs its own WebSocket** — main feed subscription only returns root posts with comment/reply IDs (not full content)
- **Single-post subscription returns PascalCase fields** — needs normalization to snake_case before merging
- **Max depth is 2** — deeper items get flattened to depth 2 during tree building
- **`disable_new_comments` propagates recursively** — must cascade to all children when toggling
- **VitalStats WebSocket requires `"vitalstats"` subprotocol** — omitting it causes connection failure
- **Keep-alive every 80 seconds** — connection drops without heartbeat
- **S3 upload is a 3-step flow** — request pre-signed URL, PUT to S3, use returned CDN URL
