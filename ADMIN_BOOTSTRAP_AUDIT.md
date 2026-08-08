# Admin Bootstrap Audit

**Date:** 2026-07-25  
**Scope:** Admin portal infinite loading; Technician `useApp` / `AppProvider`; shared auth bootstrap with Customer  
**Constraint:** No redesign of Admin, routing, or auth architecture. No fake spinner timeouts.

---

## 1. Root cause

**Admin’s infinite spinner was `ProtectedRoute` waiting on `AuthProvider.status === 'loading'` that never settled.**

`AuthProvider` always started as `loading` and only called `restoreSession()` **after**:

1. `await import('@fixnow/native')`
2. `await readCachedData(userProfile)` (Capacitor Preferences)

With **no** access/refresh token (common for `/admin/dashboard` deep links), `restoreSession()` would have set `anonymous` immediately — but that code never ran while the native/Preferences path stalled or delayed. `ProtectedRoute` therefore rendered its full-viewport spinner forever. There was no visible error.

Admin **login** still appeared to “work” because `/admin/login` is outside `ProtectedRoute` and does not wait on auth status.

This is the **same architectural class of bug** as the Customer dashboard cache hang: UI settle incorrectly depended on `@fixnow/native` / Preferences I/O.

**Not causes:** React Query (unused), empty Admin APIs, AdminShell, missing AppProvider for Admin, splash hard-lock (splash has fail-safes and renders children underneath).

---

## 2. Bootstrap sequence (where it stopped)

```
main.tsx
  → AuthProvider          ← stuck: status stays "loading"
  → SocketProvider / PushProvider / AppSplashGate
  → App (lazy)
  → /admin/* → AdminPortalGate → AdminRoutes (lazy)
  → ProtectedRoute(roles=['admin'])   ← STOP: spinner while status==="loading"
  → AdminShell / Dashboard            ← never reached when anonymous deep-link
```

Reproduced: open `http://127.0.0.1:5173/admin/dashboard` with no session → gray `aria-label="Loading"` spinner, empty body text, URL stays on `/admin/dashboard`.

---

## 3. Failed component

| Layer | Component | Failure |
|-------|-----------|---------|
| Auth | `packages/hooks/AuthProvider.tsx` | `status` never left `loading` when native cache path blocked restore |
| Guard | `packages/shared/ProtectedRoute.tsx` | Correctly waits on `loading` — symptom surface, not root bug |
| Admin | `AdminShell` / `DashboardPage` | Not reached in the hanging case |

---

## 4. Failed API (if any)

**None required for the hang.** Browser storage had no `fixnow_refresh_token`. No `/auth/me` or Admin dashboard request was needed for the spinner; auth never finished bootstrapping.

Admin dashboard APIs (`GET /admin/dashboard`, marketplace metrics, categories, applications) only matter **after** auth settles and the user is an admin.

React Query: **not used** in this codebase (no `QueryClientProvider` / `useQuery`).

---

## 5. Provider analysis

| Provider | Customer | Technician | Admin |
|----------|----------|------------|-------|
| `AuthProvider` | shared root | shared root | shared root |
| `SocketProvider` / `PushProvider` | shared | shared | shared |
| `AppSplashGate` | shared | shared | shared |
| `AppProvider` (technician profile) | n/a | wraps entire `TechnicianApp` | n/a |
| `QueryClientProvider` | none | none | none |

Admin does not need technician `AppProvider`. Technician portal already wraps all routes (including splash/onboarding) in `AppProvider` (`apps/technician/routes.tsx`). Live check: `/technician` → onboarding renders without `useApp` errors.

---

## 6. React Query analysis

N/A — Admin uses `useAsync` + direct API clients, not TanStack Query. No permanently `enabled: false` bootstrap queries found.

---

## 7. Files modified

| File | Change |
|------|--------|
| `packages/hooks/AuthProvider.tsx` | Initial status from session presence; restore no longer awaits native before settling; cache paint is fire-and-forget |
| `apps/admin/AdminRoutes.tsx` | Absolute redirects for index + catch-all (`/admin/dashboard`) to avoid relative Navigate loops |
| `src/App.tsx` | Comment clarifying AdminPortalGate must remain the route element for splat matching |

---

## 8. Fix implemented

1. **`hasStoredSession()`** — if no access/refresh token, start as **`anonymous`** (not `loading`).
2. **Session restore** — when a session exists, call `restoreSession()` without awaiting Preferences; optional cache read/write runs in parallel and never blocks status.
3. **Admin redirects** — use absolute `/admin/dashboard` paths for index/`*` routes.

After fix: `/admin/dashboard` (anonymous) → immediate redirect to **`/admin/login`** (no infinite spinner).

---

## 9. Regression tests

| Check | Result |
|-------|--------|
| `/admin/dashboard` anonymous | Redirects to `/admin/login` |
| `/admin/login` | Command Center form renders |
| `/customer/login` | Customer login renders |
| `/technician` | Onboarding renders (`useApp` OK under `AppProvider`) |
| No React Query dependency | Confirmed absent |
| Shared auth bootstrap | Single `AuthProvider` for all portals |

Manual follow-up (credentials required): admin login → dashboard KPIs; logout; role switch customer↔technician; Android Capacitor customer/technician only (admin gated).

---

## 10. Remaining recommendations

- Pass `AbortSignal` into Admin dashboard `Promise.all` loaders so pull-to-refresh / unmount cancels cleanly.
- Consider splitting `@fixnow/native` cache helpers from Capacitor-heavy barrel so auth never even *imports* the full native graph on the critical path.
- Keep Admin web-only via `AdminPortalGate`; do not mount Admin chunks on Capacitor.
- Document demo admin: `marketing.admin@fixnow.demo` / seed password from `seed-marketing` (ops only).
