# New React + Mobile App Workflow

When the user wants to build a **React app with native iOS/Android mobile support**, follow this workflow:

## Step 1: Ask Setup Questions

Ask the same questions as the React App workflow, PLUS these additional questions:

10. **App Store name** — Display name on iOS/Android (e.g. "Phyx Admin", "Acme Dashboard")
11. **Bundle ID** — Reverse-domain identifier (e.g. `com.phyx.nurseadmin`, `com.acme.dashboard`)
12. **Public domain** — Subdomain for Cloudflare Tunnel (e.g. `admin.phyx.com.au`, `dashboard.acme.com`)
13. **Push notifications** — OneSignal App ID (or "set up later")
14. **Auth required?** — Whether the app needs login/auth (default: yes, JWT + MySQL)

## Step 2: Scaffold the App

Run the mobile scaffold script with the answers:
```bash
./scripts/new-mobile-app.sh \
  --name "Client Name" \
  --slug clientslug \
  --app-name app-name \
  --bundle-id com.client.appname \
  --public-domain app.client.com \
  --apple-team-id TEAMID \
  --repo org/repo-name \
  --host 10.65.65.15 \
  --user admin \
  --port 3010 \
  --api-port 4010 \
  --primary-color "#000000" \
  --secondary-color "#666666"
```

This creates a new directory at `../app-name/` (sibling to VibeCodeApps) with a complete React + Mobile app including `server/` (Express backend) and `mobile/` (Capacitor wrapper).

After scaffolding, generate native projects:
```bash
cd ../app-name/mobile
npm install
npx cap add ios
npx cap add android
```

## Step 3: Import Schema & Generate Types

Same as React App Workflow Steps 3–4. See `docs/react-app-workflow.md`.

> **MCP note:** The schema XML is used by `parse-schema.cjs` to generate TypeScript types. For ad-hoc field lookups during development, use the `vitalsync_describe_model` MCP tool instead — it returns live schema data including field names, types, enums, and correct query syntax.

## Step 4: Research Phase (Automated Business Intelligence)

Same as React App Workflow Step 5 — run the research script to collect business intelligence and generate a knowledge base. Read findings and discuss with user before building.

> **MCP note:** After research completes, MCP tools (`vitalsync_introspect_schema`, `vitalsync_query`, `vitalsync_calc_query`, `vitalsync_ontraport_read`) are available throughout development for live API queries. The research knowledge base provides business context; MCP tools provide technical execution. See `docs/research-phase.md` for the full MCP vs. research comparison.

## Step 5: Persona & Feature Discovery

Based on research findings, determine who this app is for and what it needs:
- Is this app for internal staff, clients, or both?
- Which models and segments matter most?
- What metrics should the dashboard show?
- What mobile-specific features are needed (push notifications, offline, etc.)?

**Review reusable features:** Read `docs/features/` and check each available feature against this app's use case and research findings. Proactively suggest any features that would be valuable — explain what each does and why it fits. Mobile apps especially benefit from OneSignal Push Notifications, and admin dashboards often benefit from the AI Chat Agent and Dynamic Metrics.

Present the persona, recommended features (both custom and reusable), and suggested layout to the user. Get approval on the feature set before building.

## Step 6: Build the App

Build React components, hooks, and stores. All implementation patterns are documented in `docs/react-app-workflow.md`, `docs/vitalsync-sdk-patterns.md`, and `docs/backend-patterns.md`. Use research knowledge base to inform feature choices, dashboard metrics, status colors, and filter tabs.

## Step 7: App Images

Generate the core image assets using NanoBanana (see `docs/features/nanobana-image-generation.md`). Ask the user for their logo or generate one based on their brand.

### Web Assets (same as React apps)

| Asset | Size | Location | Purpose |
|-------|------|----------|---------|
| `favicon-32x32.png` | 32x32 | `public/` | Browser tab icon |
| `favicon-16x16.png` | 16x16 | `public/` | Small browser tab icon |
| `apple-touch-icon.png` | 180x180 | `public/` | iOS home screen bookmark |

### iOS App Icon

| Asset | Size | Location | Purpose |
|-------|------|----------|---------|
| `AppIcon-1024.png` | 1024x1024 | Xcode asset catalog | App Store listing + all derived sizes |

Xcode automatically generates all required sizes (60x60, 76x76, 120x120, 152x152, 167x167, 180x180) from the single 1024x1024 source.

**To set the iOS icon** (automatic — no manual Xcode step needed):
```bash
cp public/app-icon-1024.png mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
```
The asset catalog's `Contents.json` already references `AppIcon-512@2x.png` at 1024x1024. Xcode generates all other sizes automatically on next build.

### Android App Icon

| Asset | Size | Location | Purpose |
|-------|------|----------|---------|
| `ic_launcher.png` | 512x512 | `android/app/src/main/res/` | Play Store + launcher icon |

**To set the Android icon:**
1. Open Android Studio: `cd mobile && npx cap open android`
2. Right-click `res/` → **New → Image Asset**
3. Select the source PNG, configure foreground/background layers
4. Android Studio generates all density variants (`mdpi` through `xxxhdpi`)

### Generation Workflow

1. **Ask the user** for their logo file. If yes, use it as the source.
2. **If no logo**, generate one:
   ```bash
   nanobana vector --style icons --subject "app icon for [app description]" --colors "[brand hex colors]" --output logo-source.png --aspect 1:1
   ```
3. **Resize for web** using `sips` (macOS built-in):
   ```bash
   sips -z 180 180 logo-source.png --out public/apple-touch-icon.png
   sips -z 32 32 logo-source.png --out public/favicon-32x32.png
   sips -z 16 16 logo-source.png --out public/favicon-16x16.png
   ```
4. **Create 1024x1024** for iOS App Store:
   ```bash
   sips -z 1024 1024 logo-source.png --out public/app-icon-1024.png
   ```
5. **Copy into iOS asset catalog** (replaces manual Xcode drag-and-drop):
   ```bash
   cp public/app-icon-1024.png mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
   ```
6. **Optional: Generate app store screenshots** using device mockups:
   ```bash
   nanobana mockup --ref screenshot.png --device phone --output appstore-screenshot.png --aspect 9:16
   ```

## Step 8: Set Up GitHub & Deploy

1. Initialize git, create private GitHub repo
2. Add GitHub Actions secrets (SSH key, server details, env vars, Cloudflare token)
3. Push — triggers auto-deploy
4. Configure Cloudflare Tunnel in Zero Trust dashboard to route subdomain to `http://localhost:{port}`

## Step 9: Build Mobile App

1. Update `mobile/capacitor.config.ts` with production `server.url` (the Cloudflare Tunnel domain)
2. Build and sync: `cd mobile && npm run build && npx cap sync ios`
3. Open in Xcode: `npx cap open ios`
4. Archive → Distribute → TestFlight
5. For Android: `npx cap sync android && npx cap open android`

---

# Capacitor Mobile App Patterns

## Architecture

The mobile app lives in a `mobile/` directory alongside the web app's `src/`. It shares 95%+ of the React codebase via TypeScript path aliases:

```
project-root/
├── src/                              # Shared React code (web + mobile)
│   ├── App.tsx                       # Shared app component
│   ├── hooks/                        # Shared hooks
│   ├── components/                   # Shared components
│   └── stores/                       # Shared Zustand stores
├── mobile/
│   ├── src/main.tsx                  # Mobile entry point (Capacitor + OneSignal init)
│   ├── capacitor.config.ts           # Capacitor configuration
│   ├── vite.config.mobile.ts         # Mobile Vite config
│   ├── package.json                  # Capacitor dependencies
│   ├── index.html                    # Mobile HTML entry
│   ├── ios/App/App.xcworkspace       # iOS project (generated)
│   └── android/                      # Android project (generated)
```

## Mobile Entry Point

`mobile/src/main.tsx` imports the shared app and initializes native plugins:

```typescript
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import OneSignal from 'onesignal-cordova-plugin';
import App from '@/App';     // Imports from ../src/App via alias
import { appTheme } from '@/theme';

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(console.error);
  StatusBar.setBackgroundColor({ color: '#ffffff' }).catch(console.error);
  SplashScreen.hide().catch(console.error);

  // OneSignal push notifications
  OneSignal.initialize('YOUR_ONESIGNAL_APP_ID');
  OneSignal.Notifications.requestPermission(true);

  // Bridge functions — shared code calls these (no-op on web where they don't exist)
  (window as any).__pushLogin = (userId: string) => OneSignal.login(userId);
  (window as any).__pushLogout = () => OneSignal.logout();
}
```

## Mobile Vite Config

`mobile/vite.config.mobile.ts` — Uses `base: ''` for relative paths in WebView and alias to share code:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '',                                    // Relative paths for Capacitor WebView
  resolve: {
    alias: { '@': path.resolve(__dirname, '../src') },  // Share root src/
  },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
});
```

## Capacitor Config

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.client.appname',
  appName: 'App Display Name',
  webDir: 'dist',
  server: {
    // VitalSync SDK rejects capacitor:// origin with 500 error.
    // Must load from real HTTPS URL instead of bundled files.
    // Local dev: 'http://localhost:5173' (run mobile Vite dev server)
    // Production: 'https://app.client.com' (Cloudflare Tunnel URL)
    url: 'https://app.client.com',
    allowNavigation: [
      'static-au03.vitalstats.app',
      'cdn.jsdelivr.net',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
    ],
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    handleApplicationNotifications: false,  // Let OneSignal handle notifications
  },
  plugins: {
    SplashScreen: { launchShowDuration: 2000, backgroundColor: '#fafafa', showSpinner: false },
    StatusBar: { style: 'light', backgroundColor: '#ffffff' },
    Keyboard: { resize: 'native', style: 'dark', resizeOnFullScreen: true },
  },
};
```

## VitalSync SDK Origin Constraint

**CRITICAL:** The VitalSync SDK rejects the `capacitor://localhost` origin with a 500 error. This means the mobile WebView **cannot load bundled files** (which would use the `capacitor://` scheme).

**Solution:** Set `server.url` in `capacitor.config.ts` to load from a real HTTP/HTTPS URL:
- **Production/TestFlight:** `url: 'https://app.client.com'` (Cloudflare Tunnel to your Docker app)
- **Local dev:** `url: 'http://localhost:5173'` (Vite dev server — run `cd mobile && npm run dev`)

The native app becomes a thin WebView shell that loads the web app from a real server.

## Push Notification Bridge Pattern

OneSignal is only available in the native mobile build (not web). Use a window bridge pattern so shared code works on both platforms:

```typescript
// In shared code (src/App.tsx or auth store):
useEffect(() => {
  if (user) {
    (window as any).__pushLogin?.(String(user.id));  // No-op on web (undefined)
  }
}, [user]);

const logout = () => {
  (window as any).__pushLogout?.();  // No-op on web
  clearToken();
};
```

## Xcode / iOS Gotchas

- **NEVER rename the Xcode project/target from "App"** — Capacitor hardcodes this name. Use `CFBundleDisplayName` in `Info.plist` for the App Store display name.
- **CocoaPods UTF-8 fix:** Prefix cap commands with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` if you get encoding errors.
- **iOS ATS (App Transport Security):** Set `NSAllowsArbitraryLoads=true` in `Info.plist` if the app needs HTTP connections (e.g., to local dev server or private IPs).
- **OneSignal native init:** Initialize in `AppDelegate.swift` before the WebView loads, not in JavaScript.
- iOS project: `mobile/ios/App/App.xcworkspace` (always open the `.xcworkspace`, NOT `.xcodeproj`)

---

# iOS Safari Mobile Fixes

## Font-Size Zoom Prevention

**Problem:** iOS Safari auto-zooms the entire page when a focused input element has `font-size < 16px`. This creates a terrible UX on mobile.

**Solution:** Add global MUI theme overrides that force `16px` on all inputs at mobile breakpoints:

```typescript
// In src/theme.ts
const appTheme = createTheme({
  components: {
    MuiInputBase: {
      styleOverrides: {
        root: {
          '@media (max-width: 899px)': {
            fontSize: '16px !important',  // Prevents iOS auto-zoom
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          '@media (max-width: 899px)': {
            fontSize: '16px !important',
          },
        },
      },
    },
  },
});
```

**Rule:** NEVER set input `font-size` below `16px` in component-level `sx` props on mobile. The theme handles this globally.

---

# Mobile Development Workflow

## Three Development Modes

**1. Local Browser Testing (fastest iteration):**
```bash
# Terminal 1: Backend API
ssh -f -N -L 3307:localhost:3306 admin@10.65.65.15  # SSH tunnel for DB
cd server && npm run dev                              # Port 4000

# Terminal 2: Mobile dev server
cd mobile && npm run dev                              # Port 5173

# mobile/.env.local:
VITE_API_BASE_URL=http://localhost:4000
```

**2. iPhone WiFi Testing (test on real device):**
```bash
# Backend must bind to 0.0.0.0 (already configured)
cd server && npm run dev                              # Port 4000

# Mobile dev with --host flag (REQUIRED for network access)
cd mobile
npx vite --config vite.config.mobile.ts --host        # Port 5173/5174

# mobile/.env.local:
VITE_API_BASE_URL=http://<mac-network-ip>:4000

# Backend CORS must include Mac's IP address
```

**3. Production / TestFlight Build:**
```bash
# mobile/.env.local:
VITE_API_BASE_URL=http://10.65.65.15:<port>

# Build and sync
cd mobile
npm run build
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios

# Open in Xcode
npx cap open ios
# Product > Archive > Distribute App > TestFlight
```

## Key Mobile Dev Notes

- Mobile `.env.local` needs rebuild when changed (Vite doesn't hot-reload env vars)
- Backend restart required when CORS config changes
- `--host` flag is REQUIRED for iPhone WiFi testing (without it, only localhost is accessible)
- Port may change (5173, 5174, etc.) if previous Vite instance is running
- Check `capacitor.config.ts` `server.url` — must point to Vite dev server for local dev, production URL for TestFlight

---

# Xcode Build Fixes (Capacitor iOS)

When building Capacitor iOS apps, you'll encounter these build errors. Apply these fixes:

## CapacitorCordova Double-Quoted Include Errors

**Symptom:** 21 errors like `double-quoted include "CDVWebViewProcessPoolFactory.h" in framework header, expected angle-bracketed instead` — Xcode's module verifier treats these as errors, not warnings.

**Fix:** Add to `mobile/ios/App/Podfile`:
```ruby
inhibit_all_warnings!

post_install do |installer|
  assertDeploymentTarget(installer)
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER'] = 'NO'
    end
  end
end
```

Then re-run: `cd mobile/ios/App && pod install`

## Pods Framework "Operation Not Permitted"

**Symptom:** `PhaseScriptExecution [CP] Embed Pods Frameworks ... Operation not permitted` — Xcode sandboxing blocks pod embedding scripts.

**Fix:** In Xcode, select App target → Build Settings → search "User Script Sandboxing" → set to **NO** for both Debug and Release.

Or in `project.pbxproj`, add `ENABLE_USER_SCRIPT_SANDBOXING = NO;` to both Debug and Release `buildSettings` blocks.

## Capacitor Version Pinning

Always pin all `@capacitor/*` packages to the same major version. Mixing versions (e.g., `@capacitor/core` v6 + `@capacitor/ios` v8) causes cryptic build failures.

```bash
# Install ALL Capacitor packages with the same major version
npm install @capacitor/core@6 @capacitor/ios@6 @capacitor/cli@6 --legacy-peer-deps
```

---

# Universal Links Setup (iOS)

Universal Links allow magic link emails to open directly in the iOS app instead of Safari.

## Required Components

1. **AASA file** at `public/.well-known/apple-app-site-association`:
```json
{
  "applinks": {
    "details": [{
      "appIDs": ["TEAMID.com.client.appname"],
      "components": [{ "/": "/verify*", "comment": "Magic link verification" }]
    }]
  }
}
```

2. **nginx location block** (serves AASA with correct content type):
```nginx
location /.well-known/apple-app-site-association {
    default_type application/json;
    try_files $uri =404;
}
```

3. **Xcode Associated Domains entitlement:**
   - App target → Signing & Capabilities → + Capability → Associated Domains
   - Add: `applinks:your-domain.com`

4. **AppDelegate.swift handler** (for cold launches):
```swift
func application(_ application: UIApplication,
  continue userActivity: NSUserActivity,
  restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
       let url = userActivity.webpageURL,
       url.path.hasPrefix("/verify") {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            if let vc = self.window?.rootViewController as? CAPBridgeViewController {
                vc.bridge?.webView?.load(URLRequest(url: url))
            }
        }
    }
    return ApplicationDelegateProxy.shared.application(
      application, continue: userActivity, restorationHandler: restorationHandler)
}
```

## Testing Universal Links

```bash
# Validate AASA file is served correctly
curl -I https://your-domain.com/.well-known/apple-app-site-association
# Should return Content-Type: application/json

# Apple's CDN caches AASA — force refresh:
# https://app-site-association.cdn-apple.com/a/v1/your-domain.com
```

---

# Universal Links appUrlOpen Gotcha

**Problem:** When `server.url` is set in `capacitor.config.ts` (required because VitalSync rejects `capacitor://` origin), the WebView loads from the remote server — NOT from the `mobile/src/main.tsx` bundle. This means any `appUrlOpen` listener in `mobile/src/main.tsx` **never runs**.

**Solution:** The `appUrlOpen` listener must be in **two places**:

1. **Shared code** (`src/App.tsx`) — handles warm launches (app already open):
```typescript
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;
  const listener = CapApp.addListener('appUrlOpen', (event) => {
    try {
      const url = new URL(event.url);
      if (url.pathname === '/verify' && url.searchParams.get('token')) {
        window.location.href = `${url.pathname}${url.search}`;
      }
    } catch { /* ignore */ }
  });
  return () => { listener.then(l => l.remove()); };
}, []);
```

2. **Native AppDelegate.swift** — handles cold launches (app not running, event fires before React mounts). Uses a 2-second delay to let the WebView finish loading.

**Both are required** — `@capacitor/core` and `@capacitor/app` must be installed in the **root** `package.json` (not just `mobile/`) so the shared code can import them.

---

# Mobile Vite envDir Gotcha

**Problem:** The mobile Vite config runs from `mobile/` but `.env.local` lives in the project root. Without configuration, mobile Vite can't find environment variables.

**Fix:** Set `envDir` in `mobile/vite.config.mobile.ts`:
```typescript
import path from 'path';

export default defineConfig({
  // ... other config
  envDir: path.resolve(__dirname, '..'),  // Look for .env files in project root
});
```

---

# iOS Safe Area CSS Patterns

On iOS, the status bar and home indicator overlay the WebView content. Use CSS `env()` functions for safe spacing:

## Header / AppBar
```typescript
<AppBar sx={{
  pt: 'calc(env(safe-area-inset-top, 0px) + 16px)',  // Status bar clearance
}}>
```

## Bottom Navigation
```typescript
<BottomNavigation sx={{
  pb: 'env(safe-area-inset-bottom, 0px)',  // Home indicator clearance
}}>
```

## Important
- `viewport-fit=cover` MUST be in the `<meta viewport>` tag for `env()` to work:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  ```
- Use `calc()` to add your own padding on top of the safe area inset
- The `0px` fallback ensures no-op on non-iOS browsers
