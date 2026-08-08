# ANDROID FALSE OFFLINE UI — FIX REPORT

**Date:** 2026-08-02  
**Scope:** Eliminate false Offline UI flash on Android startup while connected  
**Constraint:** No networking redesign · no offline-mode redesign · genuine offline detection preserved  

---

## 1. Root cause

The Offline UI on the Customer/Technician splash (`FixNowSplash`) was mounting for **non-offline** conditions:

1. **`healthState === 'error'` treated as Offline**  
   Role splash pages and `AppSplashGate` showed **Retry / Continue offline** whenever `GET /health` failed, even when the device was online and the app continued to login successfully.  
   That produced the exact flash: loader + badge **"Can't connect right now"** + Retry + Continue offline → then automatic navigation to login.

2. **Uncertain network treated as Offline**  
   `useNetworkStatus` could initialize from `navigator.onLine === false` (common brief Android WebView cold-start lie). Splash then set `online={network === 'online'}`, so `poor` / false-negative offline also drove Offline copy.

3. **Alarming copy for soft failures**  
   `useSplashController` and `FixNowSplash` mapped backend health `error` to **"Can't connect right now"** even though the controller message was “Continuing…” and the splash auto-dismissed.

**Component responsible:** `FixNowSplash` actions + status, gated by Customer/Technician `SplashPage` and `AppSplashGate`.

**Incorrect initial model:** Unknown / failed `/health` / brief `navigator.onLine=false` → rendered as Offline.

---

## 2. Corrected lifecycle

```
Startup
  → NetworkStatus = checking   (never offline by default)
  → HealthState   = checking
  → Offline UI    = not mounted

Conclusive online (or /health ok|degraded|error while device online)
  → Soft “Connecting / Starting FixNow”
  → Offline UI never mounts
  → Navigate to login

Conclusive offline (network offline OR health offline)
  → Offline copy + Retry + Continue offline
```

**Rule:** Unknown / Checking must never render Offline UI. Only conclusive Offline may.

---

## 3. Permanent fix (three-state connectivity)

| State | Meaning | Offline UI |
|---|---|---|
| `checking` | Startup / settling | Hidden |
| `online` / `poor` | Connected (poor advisory) | Hidden |
| `offline` | Conclusive device offline | Shown |

Helpers:

- `isNetworkUsable(status)` — true unless conclusive offline  
- `shouldShowSplashOfflineActions(network, healthState)` — true only for conclusive network offline **or** health `offline`; **never** for health `error`

Backend `/health` `error` (device online, probe failed) now stays a soft continue label — no Retry/Continue offline flash.

Android cold-start: deferred offline settle (~700ms) so a brief `navigator.onLine=false` cannot flash Offline UI before Capacitor/`online` corrects it. Genuine offline still resolves to Offline after settle.

---

## 4. Files modified

| File | Change |
|---|---|
| `packages/shared/splash/useNetworkStatus.ts` | Start in `checking`; add `unknown`/`checking`; deferred conclusive offline; helpers |
| `packages/shared/splash/splashOfflineUi.ts` | **New** — single gate for splash Offline actions |
| `packages/shared/splash/FixNowSplash.tsx` | Soft status for health `error`; no “Can't connect” alarm |
| `packages/shared/splash/useSplashController.ts` | Soft label for health `error` |
| `packages/shared/splash/AppSplashGate.tsx` | Use conclusive offline gate |
| `packages/shared/splash/index.ts` / `packages/shared/index.ts` | Export helpers |
| `apps/customer/pages/SplashPage.tsx` | Same gate; `isNetworkUsable` |
| `apps/technician/pages/SplashPage.tsx` | Same gate; `isNetworkUsable` |
| `packages/native/OfflineBanner.tsx` | Comment clarifying Checking ≠ Offline (banner already hides when not offline) |

**Not modified:** Capacitor Network bridge design, offline queue, auth, routes, entitlement, API clients.

---

## 5. Validation

| Check | Expected |
|---|---|
| Offline UI never flashes during successful startup | ✓ Gate + soft error + deferred offline |
| Customer login opens cleanly | ✓ Splash continues without Offline mount |
| Technician login opens cleanly | ✓ Same |
| Genuine offline still works | ✓ `network === 'offline'` or `healthState === 'offline'` still shows Retry / Continue offline |
| Retry still works when truly offline | ✓ Unchanged handlers |
| Web behaviour | ✓ Same gate; unknown/checking never offline; web still resolves via `navigator` + events |
| Android feels professional | ✓ No false connectivity scare on connected launch |

**Manual Android check:** Launch → Customer / Technician → splash should show brand + progress only → login; airplane mode → Offline UI + Retry still appear.

---

## 6. Conclusion

The false Offline flash was a **presentation/state gating** bug: splash treated transient `/health` errors and uncertain network as Offline. Startup now begins in **Checking**, mounts Offline UI only after **conclusive Offline**, and keeps genuine offline + Retry intact.
