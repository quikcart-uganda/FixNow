# Android Startup Root Cause Report

**Date:** 2026-07-28  
**Severity:** Production-blocking  
**Symptom:** Native splash displays → splash closes → permanent white screen. No Role Selector, public landing, login, or portal entry.

---

## Root cause

**Capacitor plugin thenable adoption hung JavaScript bootstrap before React could mount.**

`packages/native/secureStorage.ts` dynamically imported `@aparajita/capacitor-secure-storage` and **returned the `SecureStorage` plugin proxy from a Promise `.then()`**. Capacitor plugin proxies expose a `then` property (via Proxy) that:

1. Does **not** call the Promise resolve/reject callbacks used for thenable adoption.
2. Returns a separate rejecting promise with:  
   `"SecureStorage.then()" is not implemented on android`

Result:

| Stage | What happened |
|---|---|
| `bootstrapNative()` → `rehydrateSecureSession()` | `await secureStorage.get(...)` never settled (adopting promise hung) |
| `src/main.tsx` `start()` | Blocked on `await bootstrapNative(...)` |
| React | Never called `createRoot(...).render(...)` |
| Native splash | Auto-hid on timeout / Capacitor splash config |
| HTML boot splash | Removed by 8s failsafe in `index.html` |
| `#root` | Empty → **permanent white screen** |

The same thenable hazard existed on other bootstrap-path plugin loaders (`App`, `PushNotifications`, `Preferences`, `Camera`, `Geolocation`).

This is **not** a routing bug, auth-guard loop, or missing Role Selector route. `/` correctly maps to `PlatformLanding` (role cards); `/select-role` maps to `RoleSelectPage`. Neither could render because React never mounted.

---

## Runtime errors found

### JavaScript / Chrome Remote DevTools (CDP)

Captured live from the device WebView (`https://app.fixnow.local/`):

```text
Uncaught (in promise) "SecureStorage.then()" is not implemented on android
    at https://app.fixnow.local/assets/capacitor-Dg3rNNzq.js
```

Also observed (non-fatal / secondary):

- `Error injecting safe area CSS: TypeError: Cannot read properties of null (reading 'style')`
- `Network.getStatus` → `{ connected: false, connectionType: "cellular" }` (network bridge ran; SecureStorage hang occurred afterward)

### Logcat

- Capacitor bridge started; plugins registered; WebView loaded `https://app.fixnow.local/`.
- Heavy WebView `onDraw` traffic after splash hide with no useful JS stack in logcat (failure is inside the WebView JS runtime; CDP was required).
- No native crash / Activity finish — the Activity stayed alive on a blank WebView.

### Regression proof (Node)

`node scripts/test-cap-plugin-thenable.mjs`:

```json
{ "buggy": { "kind": "hung" }, "fixed": { "kind": "resolved", "v": "ok" } }
PASS: bare plugin return hangs; wrapCapPlugin works
```

---

## Fix summary

1. **Never return a Capacitor plugin across an `await` boundary.** Always return a plain `{ plugin }` carrier (`wrapCapPlugin`).
2. **Hardened `bootstrapNative`** with per-step try/catch and a 4s budget so native setup cannot block React mount again.
3. **Branded recovery UI** in `src/main.tsx` if startup still fails (FixNow gradient, mark, message, Retry) — never a blank white page.
4. **Boot-lock fix** in `AppSplashGate`: role splash routes now clear `fixnow-splash-boot` so `#root` is not left `visibility: hidden`.
5. **Launcher icon**: adaptive foreground occupancy reduced **58% → 42%** (more padding, safe-zone compliant); all mipmaps regenerated via `npm run assets:generate`.
6. **Android build**: added Material Components dependency for compileSdk 36 M3 resources; assemble with a local Gradle home to avoid a corrupted sandbox transform cache.

---

## Files modified

| File | Change |
|---|---|
| `packages/native/capPlugin.ts` | **New** — `wrapCapPlugin` / `CapPluginRef` |
| `packages/native/secureStorage.ts` | Return wrapped plugin; catch all keystore I/O |
| `packages/native/bootstrap.ts` | Non-throwing bootstrap + 4s budget |
| `packages/native/nativeApp.ts` | Wrap `App` plugin |
| `packages/native/nativePush.ts` | Wrap `PushNotifications` |
| `packages/native/offlineCache.ts` | Wrap `Preferences` |
| `packages/native/locationPermission.ts` | Wrap `Geolocation` |
| `packages/native/nativeDevice.ts` | Wrap `Camera` |
| `src/main.tsx` | Always mount React after bootstrap; branded `BootFailure` |
| `packages/shared/splash/AppSplashGate.tsx` | Clear boot lock on role splash routes |
| `scripts/brand-geometry.mjs` | `ADAPTIVE_ICON_OCCUPANCY = 0.42` |
| `scripts/write-brand-masters.mjs` | Log updated occupancy |
| `resources/icon-foreground.svg` (+ mipmaps) | Regenerated smaller wrench / more padding |
| `android/app/build.gradle` | `com.google.android.material:material:1.13.0` |
| `apps/admin/pages/RealtimeDiagnosticsPage.tsx` | Unrelated TS unblock for `tsc -b` |
| `scripts/test-cap-plugin-thenable.mjs` | Regression harness |

---

## Routing verification (code path)

Once React mounts:

- `/` → `PlatformLanding` — Customer / Technician role cards (native Role Selector).
- `/select-role` → `RoleSelectPage`.
- `/customer`, `/technician`, `/admin` → portal entry (admin hidden on native landing).
- Auth starts `anonymous` when no stored session — no infinite loading spinner for cold guests.

---

## Startup resilience

| Guard | Behavior |
|---|---|
| Plugin wrap | Prevents Capacitor thenable hang |
| Bootstrap budget | Continues to React after 4s even if native init stalls |
| Bootstrap try/catch | Keystore / push / chrome failures are best-effort |
| Branded BootFailure | Visible recovery + Retry if `start()` throws |
| HTML 8s failsafe | Removes `#fixnow-boot-splash` + boot lock class |
| AppSplashGate | Always clears boot lock when handing off |

---

## Launcher icon

- Foreground SVG pad: `22.68` → **`31.32`** on 108dp canvas (scale `2.61` → `1.89`).
- Occupancy: **42%** (inside Android adaptive safe zone ~66/108).
- Regenerated: `mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}` + adaptive XML.
- Brand blue `#004AC6` + white wrench match splash plate branding.

---

## Build / install status

| Step | Result |
|---|---|
| `npm run build` | Success (fix bundled into `dist/` + synced assets) |
| `npx cap sync android` | Success |
| `assembleDebug` | **SUCCESS** — `android/app/build/outputs/apk/debug/app-debug.apk` (~16.7 MB) |
| Device reinstall | **Blocked** — `adb devices` empty at validation time (USB device disconnected) |
| Prior live CDP | Confirmed SecureStorage error on white screen before fix |
| Regression test | **PASS** |

### To finish device validation

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.fixnow.app/.MainActivity
```

Expected:

1. Native splash shows.
2. Splash closes.
3. Platform landing / Role Selector (Customer + Technician) renders — **not** a white screen.
4. Customer and Technician entry links navigate into their portals.

---

## Verification that startup reaches the Role Selector

| Evidence | Status |
|---|---|
| Root cause identified via CDP stack | Confirmed |
| Fix removes thenable hang | Confirmed (unit + code) |
| Recovery UI present in production bundle | Confirmed (`index-*.js` contains “Couldn’t start FixNow”) |
| Fixed native bundle synced into APK assets | Confirmed |
| Debug APK assembled with new assets | Confirmed |
| On-device Role Selector screenshot after reinstall | **Pending device reconnect** |

**Verdict:** The permanent white screen was caused by a hung `bootstrapNative` await on `SecureStorage` thenable adoption. With the wrap + resilience changes, React mounts and `/` renders `PlatformLanding` (the Role Selector). Reconnect the device and install the built APK to confirm visually on hardware.
