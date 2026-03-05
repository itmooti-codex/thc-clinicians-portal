# OneSignal Push Notification System — Reusable Guide

Source: `phyx-nurse-admin/docs/onesignal-notification-system.md`

## Overview
Production-ready push notification system for React + Capacitor apps using OneSignal. Works on **both web (polling only)** and **native iOS/Android (full push + polling)**.

## Architecture — 3 Notification Paths

1. **Background tap** → Native SDK `onClick` → Swift bridge → `window.__onPushDeepLink(json)` → `useDeepLinkListener` → navigate to record
2. **Foreground receive** → Native SDK `onWillDisplay` → Swift bridge → `window.__onNotificationReceived(json)` → `useNotificationListener` → add to store
3. **Polling** → `useNotificationSync` (60s) → `GET /api/notifications` → backend proxies OneSignal REST API → `mergeFromApi()` → add to store

## File Inventory (14 files)

### iOS Native (4 files)
- `mobile/ios/App/App/AppDelegate.swift` — OneSignal SDK init + permission request
- `mobile/ios/App/App/OneSignalBridge.swift` — Custom Capacitor plugin: login/logout, deep links, foreground notifications
- `mobile/ios/App/App/BadgeBridgePlugin.swift` — Custom Capacitor plugin: iOS app badge count
- `mobile/ios/App/App/BridgeViewController.swift` — Manual plugin registration

### iOS Config (3 files)
- `mobile/ios/App/App/App.entitlements` — Push notification entitlement (`aps-environment`)
- `mobile/ios/App/App/Info.plist` — Background modes (`remote-notification`)
- `mobile/ios/App/Podfile` — CocoaPods dependencies

### Mobile Entry Point (1 file)
- `mobile/src/main.tsx` — OneSignal Cordova plugin init + window bridge

### Frontend Hooks (4 files)
- `src/hooks/useNotificationListener.ts` — Foreground push → notification store
- `src/hooks/useNotificationSync.ts` — 60s polling → merge from API
- `src/hooks/useDeepLinkListener.ts` — Notification tap → deep link navigation
- `src/hooks/useBadgeCount.ts` — Unread count → native iOS badge

### Frontend State (1 file)
- `src/stores/useNotificationStore.ts` — Zustand store with persistence, dedup, merge

### Backend (1 file)
- `server/src/routes/notifications.ts` — Proxy to OneSignal REST API

## Setup Checklist for New App

### 1. OneSignal Dashboard
- Create app, configure Apple iOS (APNs) platform
- Upload `.p8` APNs key from Apple Developer → Keys
- Note App ID (UUID) and generate REST API Key

### 2. Apple Developer
- Enable Push Notifications capability on App ID
- Create APNs key if needed, upload to OneSignal

### 3. Xcode Project

**App.entitlements** — `aps-environment: development` (change to `production` for App Store)

**Info.plist** — Add `UIBackgroundModes: [remote-notification]`

**capacitor.config.ts** — `ios: { handleApplicationNotifications: false }` (let OneSignal handle)

### 4. iOS Native Code

**AppDelegate.swift** — Init OneSignal with App ID + request permission:
```swift
OneSignal.initialize("YOUR_APP_ID", withLaunchOptions: launchOptions)
OneSignal.Notifications.requestPermission({ accepted in }, fallbackToSettings: true)
```

**OneSignalBridge.swift** — Core bridge (3 channels):
- Web → Native: `__pushLogin(userId)`, `__pushLogout()`, `__deepLinkReady()`
- Native → Web (tap): `__onPushDeepLink(json)` — deep link
- Native → Web (foreground): `__onNotificationReceived(json)` — capture
- Uses `WKScriptMessageHandler` for web→native and `evaluateJavaScript` for native→web
- Static `pendingDeepLink` for cold start (payload arrives before webview ready)
- Implements `OSNotificationClickListener` + `OSNotificationLifecycleListener`
- `buildPayload()` extracts title, body, and flattens `additionalData` into JSON

**BadgeBridgePlugin.swift** — Badge bridge:
- `window.__setBadgeCount(count)` → `UIApplication.shared.applicationIconBadgeNumber`
- `window.__clearBadge()` → sets to 0
- Also enables Safari Web Inspector in DEBUG builds

**BridgeViewController.swift** — CRITICAL: Capacitor does NOT auto-discover local Swift plugins:
```swift
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BadgeBridgePlugin())
        bridge?.registerPluginInstance(OneSignalBridgePlugin())
    }
}
```
IMPORTANT: In `Main.storyboard`, reference `BridgeViewController` (module: `App`), NOT `CAPBridgeViewController` (module: `Capacitor`)

### 5. Mobile Entry Point (`mobile/src/main.tsx`)
```typescript
if (Capacitor.isNativePlatform()) {
  OneSignal.initialize('YOUR_APP_ID');
  OneSignal.Notifications.requestPermission(true);
  (window as any).__pushLogin = (userId: string) => OneSignal.login(userId);
  (window as any).__pushLogout = () => OneSignal.logout();
}
```
Dependency: `"onesignal-cordova-plugin": "^5.3.1"` in mobile/package.json

### 6. Notification Store (Zustand + persist)

```typescript
interface AppNotification {
  id: string; title: string; body: string; timestamp: number; read: boolean;
  sourceId?: string;    // OneSignal ID — dedup key
  contactId?: number;   // Record ID for deep link
  tab?: string;         // Main tab to navigate
  subTab?: string;      // Sub-tab within tab
}
```
- `addNotification()` — deduplicates by `sourceId`, caps at 200
- `mergeFromApi()` — merges polling results, skips existing sourceIds
- `markAllRead()` / `clearAll()` — read state management
- Persisted to localStorage key `'app-notifications'`
- `useUnreadCount()` selector for badge

### 7. Frontend Hooks

**useNotificationListener** — Sets `window.__onNotificationReceived` handler, parses JSON, adds to store

**useDeepLinkListener** — Sets `window.__onPushDeepLink` handler, parses JSON, navigates to record/tab. On mount calls `window.__deepLinkReady?.()` to signal cold-start readiness. Customize `TAB_MAP` and `SUB_TAB_MAP` per app.

**useNotificationSync** — Polls `GET /api/notifications` every 60s, maps response to AppNotification[], calls `mergeFromApi()`. Uses `apiFetch` (authenticated).

**useBadgeCount** — Watches unread count, calls `window.__setBadgeCount?.(count)` when changed. No-op on web.

### 8. Backend Route

Proxies OneSignal REST API: `GET https://api.onesignal.com/notifications?app_id={id}&limit=50`
- Auth: `Authorization: Basic {REST_API_KEY}`
- Transforms response: headings.en → title, contents.en → body, completed_at*1000 → timestamp
- Extracts `data.contactId`, `data.tab`, `data.subTab` from notification payload
- Requires `requireAuth` middleware (JWT)

### 9. App.tsx Wiring

```typescript
function AuthenticatedApp() {
  useDeepLinkListener();          // Tap navigation
  useNotificationListener();      // Foreground capture
  useNotificationSync();          // Polling
  useEffect(() => {               // Bind user to OneSignal
    if (user?.email) (window as any).__pushLogin?.(user.email);
  }, [user]);
  return <><BadgeUpdater />{/* ... */}</>;
}
function BadgeUpdater() { useBadgeCount(); return null; }
```

Logout: `(window as any).__pushLogout?.();`

## Notification Payload Format (for sending)

```json
{
  "headings": { "en": "Order Fulfilled" },
  "contents": { "en": "John Smith's order has been shipped" },
  "data": { "contactId": 12345, "tab": "pharmacy", "subTab": "comms" }
}
```

## Window Bridge Functions

| Function | Direction | Set By | Purpose |
|----------|-----------|--------|---------|
| `__pushLogin(userId)` | Web→Native | OneSignalBridge.swift / main.tsx | Bind OneSignal external user ID |
| `__pushLogout()` | Web→Native | OneSignalBridge.swift / main.tsx | Unbind user ID |
| `__deepLinkReady()` | Web→Native | OneSignalBridge.swift | Signal webview ready for deep links |
| `__setBadgeCount(count)` | Web→Native | BadgeBridgePlugin.swift | Set iOS badge number |
| `__clearBadge()` | Web→Native | BadgeBridgePlugin.swift | Clear iOS badge |
| `__onNotificationReceived(json)` | Native→Web | useNotificationListener | Foreground notification received |
| `__onPushDeepLink(json)` | Native→Web | useDeepLinkListener | Notification tapped (deep link) |

## Cold Start Flow
1. User taps notification → app launches from scratch
2. Native `onClick` fires BEFORE webview is ready
3. OneSignalBridge stores payload in static `pendingDeepLink`
4. React loads → `useDeepLinkListener` calls `window.__deepLinkReady()`
5. Native receives signal → delivers pending deep link
6. React navigates to correct record

## Key Design Decisions
1. **No OneSignal Web SDK** — web gets polling only (avoids permission prompts)
2. **Window bridge pattern** — decouples React from Capacitor/OneSignal imports (same code web+mobile)
3. **Dual initialization** — OneSignal in BOTH AppDelegate (native SDK) AND main.tsx (Cordova plugin), required because app loads remote URL via `server.url`
4. **Static pendingDeepLink** — survives plugin re-instantiation during cold starts
5. **Deduplication by sourceId** — prevents dupes from foreground listener + polling
6. **Backend proxy** — REST API key never exposed to frontend
7. **`handleApplicationNotifications: false`** — gives OneSignal full control

## Environment Variables

Backend `.env`:
```
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_REST_API_KEY=your-onesignal-rest-api-key
```

Docker Compose:
```yaml
api:
  environment:
    - ONESIGNAL_APP_ID=${ONESIGNAL_APP_ID}
    - ONESIGNAL_REST_API_KEY=${ONESIGNAL_REST_API_KEY}
```

## Dependencies
- iOS: `OneSignalXCFramework` ~5.4.1 (via CocoaPods/cap sync)
- Mobile npm: `onesignal-cordova-plugin` ^5.3.1
- Frontend: `zustand` (state + persistence)
- Backend: Node 18+ native `fetch`, `express`
