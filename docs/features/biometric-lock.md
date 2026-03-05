# Biometric Lock / Lock Screen — Reusable Guide

Source: `phyx-nurse-admin`

## Overview

Face ID / Touch ID lock screen for React + Capacitor mobile apps. Auto-locks after 5 minutes in background. Uses iOS `LocalAuthentication` framework via a custom Capacitor bridge plugin. Lock state persisted in localStorage to survive app restarts. Toggle in Settings allows users to enable/disable.

## Architecture

- **Zustand store:** Lock state + biometric availability + settings
- **localStorage persistence:** Background timestamp survives app restart
- **visibilitychange listener:** Detects background/foreground transitions
- **iOS native bridge:** `BiometricBridgePlugin.swift` handles Face ID/Touch ID
- **Auto-prompt:** Face ID is triggered automatically when lock screen appears

```
App backgrounded → visibilitychange:hidden → recordBackground() → save timestamp to localStorage
App foregrounded → visibilitychange:visible → checkForeground() → if >5min → lock()
Lock screen → auto-call __biometricAuth() → Face ID prompt → success → unlock()
```

## File Inventory (4 files)

### Frontend (3 files)
- `src/components/LockScreen.tsx` — Full-screen lock overlay with unlock button
- `src/hooks/useBiometricLock.ts` — Bridge setup + visibilitychange listener
- `src/stores/useLockStore.ts` — Zustand store for lock state

### iOS Native (1 file)
- `mobile/ios/App/App/BiometricBridgePlugin.swift` — Face ID/Touch ID Capacitor plugin

## Dependencies

No additional npm dependencies. Uses:
- `zustand` (already in React + Mobile template)
- iOS `LocalAuthentication` framework (system framework, no CocoaPods)

## Implementation Steps

### 1. Create Zustand store

**`src/stores/useLockStore.ts`:**
```typescript
import { create } from 'zustand';

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type BiometryType = 'faceId' | 'touchId' | 'none';

interface LockStore {
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  biometryType: BiometryType;
  isLocked: boolean;
  backgroundTimestamp: number | null;

  setBiometricEnabled: (enabled: boolean) => void;
  setBiometricAvailability: (available: boolean, type: BiometryType) => void;
  lock: () => void;
  unlock: () => void;
  recordBackground: () => void;
  checkForeground: () => void;
}

const useLockStore = create<LockStore>((set, get) => {
  // Check if we should start locked (app was killed while backgrounded)
  const savedTs = localStorage.getItem('biometric_bg_ts');
  const savedEnabled = localStorage.getItem('biometric_enabled') === 'true';
  const startLocked = savedEnabled && savedTs && (Date.now() - Number(savedTs)) >= LOCK_TIMEOUT_MS;

  return {
    biometricEnabled: savedEnabled,
    biometricAvailable: false,
    biometryType: 'none',
    isLocked: !!startLocked,
    backgroundTimestamp: null,

    setBiometricEnabled: (enabled) => {
      localStorage.setItem('biometric_enabled', String(enabled));
      set({ biometricEnabled: enabled });
      if (!enabled) set({ isLocked: false });
    },

    setBiometricAvailability: (available, type) => {
      set({ biometricAvailable: available, biometryType: type });
    },

    lock: () => set({ isLocked: true }),
    unlock: () => {
      localStorage.removeItem('biometric_bg_ts');
      set({ isLocked: false, backgroundTimestamp: null });
    },

    recordBackground: () => {
      if (!get().biometricEnabled) return;
      const ts = Date.now();
      localStorage.setItem('biometric_bg_ts', String(ts));
      set({ backgroundTimestamp: ts });
    },

    checkForeground: () => {
      if (!get().biometricEnabled) return;
      const savedTs = localStorage.getItem('biometric_bg_ts');
      if (!savedTs) return;
      const elapsed = Date.now() - Number(savedTs);
      if (elapsed >= LOCK_TIMEOUT_MS) {
        set({ isLocked: true });
      } else {
        localStorage.removeItem('biometric_bg_ts');
        set({ backgroundTimestamp: null });
      }
    },
  };
});

export default useLockStore;
```

### 2. Create bridge hook

**`src/hooks/useBiometricLock.ts`:**
```typescript
import { useEffect } from 'react';
import useLockStore from '../stores/useLockStore';

export function useBiometricLock() {
  const { setBiometricAvailability, recordBackground, checkForeground, unlock } = useLockStore();

  useEffect(() => {
    // Native → Web callbacks
    (window as any).__onBiometricCheck = (jsonString: string) => {
      const data = JSON.parse(jsonString);
      setBiometricAvailability(data.available ?? false, data.biometryType ?? 'none');
    };

    (window as any).__onBiometricAuth = (jsonString: string) => {
      const data = JSON.parse(jsonString);
      if (data.success) unlock();
    };

    // Check biometric availability on mount
    (window as any).__biometricCheck?.();

    // Background/foreground detection
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') recordBackground();
      else if (document.visibilityState === 'visible') checkForeground();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      delete (window as any).__onBiometricCheck;
      delete (window as any).__onBiometricAuth;
    };
  }, [setBiometricAvailability, recordBackground, checkForeground, unlock]);
}
```

### 3. Create LockScreen component

**`src/components/LockScreen.tsx`:**
```typescript
import { useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Fingerprint } from '@mui/icons-material';
import useLockStore from '../stores/useLockStore';

export function LockScreen() {
  const biometryType = useLockStore(s => s.biometryType);

  const handleUnlock = () => {
    (window as any).__biometricAuth?.();
  };

  // Auto-prompt Face ID when lock screen appears
  useEffect(() => { handleUnlock(); }, []);

  const label =
    biometryType === 'faceId' ? 'Unlock with Face ID' :
    biometryType === 'touchId' ? 'Unlock with Touch ID' :
    'Unlock';

  return (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      bgcolor: 'background.default',
    }}>
      {/* App logo */}
      <Box sx={{ mb: 4 }}>
        <img src="/logo.svg" alt="Logo" style={{ width: 80 }} />
      </Box>

      <Typography variant="h6" sx={{ mb: 3 }}>App is locked</Typography>

      <Button
        variant="contained"
        size="large"
        startIcon={<Fingerprint />}
        onClick={handleUnlock}
      >
        {label}
      </Button>
    </Box>
  );
}
```

### 4. Create iOS native bridge

**`mobile/ios/App/App/BiometricBridgePlugin.swift`:**
```swift
import Foundation
import LocalAuthentication
import WebKit

class BiometricBridgePlugin: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "biometricCheck": checkBiometrics()
        case "biometricAuth": authenticateWithBiometrics()
        default: break
        }
    }

    private func checkBiometrics() {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)

        var biometryType = "none"
        if available {
            switch context.biometryType {
            case .faceID: biometryType = "faceId"
            case .touchID: biometryType = "touchId"
            default: biometryType = "none"
            }
        }

        let json = "{\"available\":\(available),\"biometryType\":\"\(biometryType)\"}"
        evaluateCallback("__onBiometricCheck", json)
    }

    private func authenticateWithBiometrics() {
        let context = LAContext()
        context.localizedFallbackTitle = "Enter Passcode"

        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Unlock App"
        ) { success, error in
            DispatchQueue.main.async {
                if success {
                    self.evaluateCallback("__onBiometricAuth", "{\"success\":true}")
                } else {
                    let msg = error?.localizedDescription ?? "Authentication failed"
                    let escaped = msg.replacingOccurrences(of: "\"", with: "\\\"")
                    self.evaluateCallback("__onBiometricAuth", "{\"success\":false,\"error\":\"\(escaped)\"}")
                }
            }
        }
    }

    private func evaluateCallback(_ fn: String, _ json: String) {
        let js = "if(window.\(fn))window.\(fn)('\(json)');"
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
```

**Inject JS in BridgeViewController.swift:**
```swift
let biometricJS = """
window.__biometricCheck = function() {
    window.webkit.messageHandlers.biometricCheck.postMessage('');
};
window.__biometricAuth = function() {
    window.webkit.messageHandlers.biometricAuth.postMessage('');
};
"""
webView.configuration.userContentController.addUserScript(
    WKUserScript(source: biometricJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
)
webView.configuration.userContentController.add(biometricPlugin, name: "biometricCheck")
webView.configuration.userContentController.add(biometricPlugin, name: "biometricAuth")
```

### 5. Wire up in App

```typescript
// Near top of authenticated app tree
import { useBiometricLock } from './hooks/useBiometricLock';
import { LockScreen } from './components/LockScreen';
import useLockStore from './stores/useLockStore';

function AuthenticatedApp() {
  useBiometricLock();
  const isLocked = useLockStore(s => s.isLocked);

  return (
    <>
      {isLocked && <LockScreen />}
      {/* ... rest of app */}
    </>
  );
}
```

### 6. Settings toggle

```typescript
// In SettingsView
const { biometricEnabled, biometricAvailable, biometryType, setBiometricEnabled } = useLockStore();

{biometricAvailable && (
  <ListItem>
    <ListItemText
      primary={biometryType === 'faceId' ? 'Face ID Lock' : 'Touch ID Lock'}
      secondary="Lock app when returning after 5 minutes"
    />
    <Switch checked={biometricEnabled} onChange={(e) => setBiometricEnabled(e.target.checked)} />
  </ListItem>
)}
```

## Gotchas & Lessons Learned

- **localStorage for persistence** — `biometric_bg_ts` survives app kill. On cold start, check if >5min elapsed.
- **Auto-prompt on mount** — `useEffect(() => handleUnlock(), [])` triggers Face ID immediately when lock screen appears.
- **visibilitychange vs Capacitor lifecycle** — `visibilitychange` works in both browser and Capacitor WebView.
- **zIndex: 9999** — lock screen must be above everything including MUI Dialogs (default z-index 1300).
- **No Android native code** — Android biometric auth can use `@anthropic/capacitor-biometric-auth` plugin or similar.
- **Face ID requires entitlement** — Add `NSFaceIDUsageDescription` to Info.plist.
- **Disabling biometric lock** — immediately unlocks if currently locked (safety: don't trap user).
