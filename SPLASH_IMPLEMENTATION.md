# FixNow Splash Implementation

**Date:** 2026-07-24  
**Inspiration:** QuikCart splash architecture (timing, fail-safes, mobile hardening, connectivity) — **branding is FixNow-only**.  
**Constraint:** QuikCart was not edited. Routing, auth, and business logic were preserved.  
**Method:** Audit-first — shared splash stack was already present; only gaps were patched.

---

## Summary

FixNow has a premium, layered startup experience:

1. **HTML first-paint prime** (`index.html`) — FixNow mark + wordmark on brand blue before React loads  
2. **Cold-start overlay** (`AppSplashGate`) — once per tab session on platform/admin paths  
3. **Role splash routes** — `/customer` and `/technician` index pages using shared `FixNowSplash`

Includes animated logo, smooth leave transitions, loading indicator, backend `/health` check, network detection, offline continue/retry, and light/dark/brand theme resolution.

---

## Audit findings (before patch)

| Area | Status before | Action |
|------|---------------|--------|
| Shared `FixNowSplash` + CSS | Present | Keep |
| `useSplashController` timing / fail-safes | Present | Keep + reconnect retry |
| `healthCheck` + `useNetworkStatus` | Present | Patch offline catch state |
| `AppSplashGate` in `main.tsx` | Present | Export session marker |
| Role `SplashPage`s | Present | Offline CTA + mark session done |
| HTML prime | Wordmark only | Add logo mark + boot lock |
| Boot lock (`overflow` / hide `#root`) | Missing vs QuikCart | Added |
| Theme / Inter / FixNow colours | Present | Keep |
| Routes / Auth / business logic | Intact | Untouched |

---

## What lives where

| Area | Files |
|------|--------|
| Brand mark | `public/brand/fixnow-mark.svg` |
| Splash CSS | `packages/shared/splash/fixnowSplash.css` |
| Health check | `packages/shared/splash/healthCheck.ts` |
| Network hook | `packages/shared/splash/useNetworkStatus.ts` |
| Timing controller | `packages/shared/splash/useSplashController.ts` |
| UI | `packages/shared/splash/FixNowSplash.tsx` |
| Cold-start gate | `packages/shared/splash/AppSplashGate.tsx` |
| Exports | `packages/shared/splash/index.ts`, `packages/shared/index.ts` |
| Boot wire-up | `src/main.tsx`, `index.html` |
| Role pages | `apps/customer/pages/SplashPage.tsx`, `apps/technician/pages/SplashPage.tsx` |
| Landing mark | `src/PlatformLanding.tsx` |

**Unchanged:** `App.tsx` routes, `AuthProvider`, API business calls, ProtectedRoute role gates, technician/customer app logic beyond splash presentation.

---

## Branding (FixNow, not QuikCart)

| Token | Value |
|-------|--------|
| Primary blue | `#004ac6` |
| Bright blue | `#2563eb` |
| Customer indigo | `#3d27bc` |
| Admin blue | `#003ec7` |
| Accent (wordmark) | `#ffcc00` (existing FixNow token) |
| Cream / ink | `#f7f9fb` / `#0a1628` |
| Logo | `/brand/fixnow-mark.svg` (FixNow “F” mark) |
| Typography | **Inter** (existing FixNow stack) — not Literata |

Wordmark: **Fix** (white / primary) + **Now** (yellow on brand, blue variants on light/customer).

---

## Architecture

```
index.html prime (mark + wordmark)
  → React mount (Auth → Socket → Push → AppSplashGate → App)
       ├─ Cold overlay (once / session) on `/`, `/admin/*`, nested paths
       └─ Role SplashPage owns `/customer` and `/technician` index
```

Role and cold splash both call `markColdSplashDone()` so a later visit to `/` in the same tab does not replay the cold overlay.

### Timing (QuikCart-inspired, FixNow-tuned)

| Gate | Mobile | Desktop |
|------|--------|---------|
| Minimum brand dwell | 1100ms | 900ms |
| Soft max → finish | 4200ms | 2400ms |
| Hard fail-safe | 5000ms | 3000ms |
| Leave animation | skipped (instant) | ~420ms fade + 460ms remove |
| HTML prime fail-safe | 5000ms | 5000ms |

Dismiss when: **auth left `loading`** (cold gate) / **ready** (role pages), after min dwell — health check does **not** block forever.

### Backend connectivity

- `GET {VITE_SOCKET_URL or API origin}/health`
- Timeout 2.5s
- States: `checking` · `ok` · `degraded` · `offline` · `error`
- Degraded/unreachable → status chip + allow continue (non-blocking)
- Network `online` event during splash re-runs health automatically

### Network / offline

- `useNetworkStatus` listens to `online` / `offline`
- Offline UI: **Retry** + **Continue offline** (cold gate and role splashes)
- App routes remain available; splash does not invent new auth rules

### Theme support

`resolveSplashTheme()`:

1. Explicit `theme` prop if provided  
2. `html.dark` / `data-theme=dark` → dark  
3. `html.light` (current default) → brand gradient  
4. `prefers-color-scheme: dark` → dark  
5. Else brand  

Role accents via `data-role`: `platform` | `customer` | `technician` | `admin`.

### Mobile hardening

At `max-width: 720px`, ambient blur/glow animations are disabled (same class of WebView stall risk QuikCart documented). Reduced-motion media query disables loops. Leave animation is skipped on mobile.

### Boot lock

While `html`/`body` have `fixnow-splash-boot`:

- `overflow: hidden` on document
- `#root` is `visibility: hidden` + non-interactive  
- Prevents underlay flash/scroll before splash release

---

## How to use

### Cold start (already wired)

```tsx
// src/main.tsx
<AppSplashGate>
  <App />
</AppSplashGate>
```

Session key: `fixnow_cold_splash_done_v1` (via `COLD_SPLASH_SESSION_KEY` / `markColdSplashDone()`).

### Role splash

```tsx
const splash = useSplashController({
  checkHealth: true,
  ready: authStatus !== 'loading',
  onFinish: () => {
    markColdSplashDone()
    navigate(nextPath(), { replace: true })
  },
})

<FixNowSplash
  role="customer"
  leaving={splash.leaving}
  healthState={splash.healthState}
  online={network === 'online'}
  loaderLabel={splash.label}
/>
```

Technician keeps **Get started** / **Continue offline** and authed redirect to dashboard.

---

## Behaviour matrix

| Entry | Splash | After dismiss |
|-------|--------|----------------|
| `/` first visit in tab | HTML prime → cold `AppSplashGate` | Platform landing |
| `/` same tab later | Skipped | Platform landing |
| `/customer` | Customer `SplashPage` | home / login / onboarding |
| `/technician` (guest) | Technician `SplashPage` | login or onboarding |
| `/technician` (authed tech) | Brief splash → force finish | `/technician/dashboard` |
| `/admin/*` | Cold overlay (if session not done) | Existing admin routes / auth |

---

## Design principles carried from QuikCart analysis

1. Brand-first first paint before JS readiness  
2. Shell-ready dismiss, not “all APIs ready”  
3. Layered fail-safes so content cannot stay locked  
4. Mobile prefers static paint over heavy motion  
5. One shared mark asset, eager/preload  
6. Connectivity is visible but non-blocking  
7. Keep boot lock through HTML→React handoff on role routes (avoid underlay flash)  

---

## Patches applied this pass

1. Boot lock: overflow + hide `#root` during splash boot  
2. HTML prime: FixNow mark + wordmark  
3. Health: offline catch returns `offline` (not `error`)  
4. Reconnect: auto re-check `/health` on `online` during splash  
5. Role pages: **Continue offline** + `markColdSplashDone()`  
6. Technician role gradient accent in splash CSS  
7. Export `markColdSplashDone` / `COLD_SPLASH_SESSION_KEY`  
8. Role-route handoff: keep boot lock until role controller owns the surface

---

## Manual test plan

1. Hard refresh `/` — see FixNow mark + wordmark prime → animated splash → landing; no QuikCart colors/fonts.  
2. Refresh `/` again in same tab — cold overlay skipped.  
3. Open `/customer` — indigo-tinted splash, health chip, then onboarding/login/home.  
4. DevTools → Offline → splash shows Retry + Continue offline; Continue works.  
5. Go online again during splash → health status updates without blocking.  
6. Stop backend → degraded/error chip; splash still releases under fail-safe.  
7. `/technician` while logged in as technician → dashboard without long wait.  
8. `prefers-reduced-motion: reduce` — no looping logo/loader motion.  
9. Confirm routes `/customer/home`, auth login, admin still behave as before.

---

## Follow-ups (optional)

- Add a dedicated dark-mode user toggle that sets `html.dark` (resolver already supports it).  
- Align `public/favicon.svg` fill with `#004ac6` if product wants one mark color everywhere (customer indigo vs platform blue).  
- Admin-specific splash route if a branded admin entry is desired beyond the cold overlay.
