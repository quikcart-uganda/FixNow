# Admin Security & Diagnostics Audit

**Date:** 2026-07-28  
**Scope:** FixNow Admin portal authentication UX, Platform Health / diagnostics surfaces, and accidental exposure of internal implementation details across Admin pages.  
**Goal:** Production-ready Sign Out + operator-friendly health status; raw developer diagnostics gated.

---

## Executive verdict

| Area | Before | After |
|------|--------|-------|
| Sign Out | Missing / incomplete on mobile drawer; often landed on `/admin/login` | Permanent Sign Out in avatar menu, desktop sidebar, header, and mobile drawer footer → public `/` |
| Logout teardown | Token clear only (partial) | Disconnect Socket.IO, clear caches/session, clear diagnostic ring, unregister push, `replace` navigation |
| Platform health UI | Raw HTTP logs, request IDs, paths, JSON dumps | Operator status cards only by default |
| Developer dumps | Visible to all admins on Realtime Diagnostics | Gated: Vite `DEV` **or** Development Mode; opt-in toggle |
| `window.__FIXNOW_DIAG__` | Always installed | Production builds: **not** attached |

**Production readiness score: 8.5 / 10**

Remaining residual risk (~1.5): Provider Manager still shows provider IDs and credential/connection status enums (intentional for ops); Audit Logs and Development Controls remain privileged Super Admin tools; notification “last successful delivery” uses last provider **test** timestamp when no delivery telemetry API exists.

---

## 1. Exposed implementation details found

### Critical (fixed)

| Finding | Where | Risk | Remediation |
|---------|-------|------|-------------|
| Raw HTTP diagnostic feed (`GET /admin/providers/snapshot`, `/auth/me`, request IDs, durations, paths) dumped via `JSON.stringify(getFrontendDiagnostics())` | `RealtimeDiagnosticsPage` (formerly “Realtime diagnostics”) | Internal operational surface in production Admin UI | Default UI is health cards only; raw dump only under **Developer Diagnostics** |
| Full provider + socket snapshot JSON on the same page | Same | Leak of internal topology / circuit state | Same gate |
| `window.__FIXNOW_DIAG__.dump()` available in production builds | `installWindowDiagnostics()` via native client boot | Any browser console user could pull request logs | Installed **only** when `import.meta.env.DEV` |

### Moderate (hardened)

| Finding | Where | Risk | Remediation |
|---------|-------|------|-------------|
| Missing env var **names** listed on Provider Manager | `ProvidersPage` (`missingEnv.join`) | Env schema disclosure | Production: show count only (“Configuration incomplete (N settings)”). Dev builds still list names |
| Absolute “Discovered at” / “Last test” timestamps + test messages | `ProvidersPage` | Noise / minor fingerprinting | Softened to “Last connection test succeeded”; footer no longer prints discovery clock |
| Nav label “Realtime diagnostics” implied developer tooling | `AdminShell` | Misleading for operators | Renamed to **Platform health** |

### Acceptable / residual (document, not removed)

| Finding | Where | Notes |
|---------|-------|------|
| Provider Manager active provider IDs (`gemini`, `cloudinary`, …) | `ProvidersPage` | Required for configuration; no secrets |
| Development Controls page | `/admin/settings/development` | Intentionally Super Admin; enables Development Mode used to unlock Developer Diagnostics |
| Audit Logs | `/admin/audit` | Security trail for admins — not HTTP client dumps |
| Header Live status sheet | `HeaderStatusControl` | Operator-friendly (Online / Offline / Reconnect); no request IDs |
| Error boundary | `AppErrorBoundary` | User-facing copy only; stacks go to monitoring / diag ring, not UI |
| Friendly API errors | Admin pages via `getFriendlyErrorMessage` | Sanitized; no stack traces |

### Not found across Admin pages

- Secrets / API keys / tokens in UI  
- Stack traces rendered to operators  
- Default exposure of `requestId` columns on operational pages  

---

## 2. Authentication improvements

### Sign Out placement (permanent)

1. **Avatar / profile menu** — `HeaderProfileMenu` + admin `menuConfig` item **“Sign out”** (`action: 'logout'`).  
2. **Desktop sidebar footer** — dedicated Sign out button under profile.  
3. **Mobile navigation drawer footer** — Sign out (was the primary gap vs screenshots).  
4. **Desktop header toolbar** — Sign out icon (≥ `lg`).  

### Logout behaviour

Implemented in `AuthProvider.logout` + Admin shell / header navigators:

| Step | Implementation |
|------|----------------|
| Invalidate authentication | `authApi.logout()` + `tokenStorage.clear()` |
| Clear local storage / session | Access/refresh/user keys cleared in `localStorage` + `sessionStorage`; native `clearSecureSession()` |
| Clear cached queries / role data | `clearRoleCaches()` (native/offline preference caches) |
| Disconnect Socket.IO | `disconnectSocket()` (removes listeners, clears dedupe, nulls socket) |
| Unregister realtime / push | Socket provider disconnects when `isAuthenticated` becomes false; `unregisterPushDevice()` on logout |
| Clear client diagnostic ring | `clearFrontendDiagnostics()` so the next session cannot inherit HTTP logs |
| Return to public landing | `navigate('/', { replace: true })` for admin (Role Selector / landing) |
| Prevent Back into Admin | `replace: true` drops protected history entry; unauthenticated access hits `ProtectedRoute` |

### Navigation consistency

| Surface | Destination after Sign Out |
|---------|----------------------------|
| `AdminShell.handleLogout` | `/` with `replace` |
| `HeaderProfileMenu` (admin) | `/` with `replace` |
| `HeaderMenuButton` (admin) | `/` with `replace` (aligned) |
| Session expiry / deep link without auth | Still `/admin/login` via `ProtectedRoute` `loginPath` (intentional for re-auth) |

---

## 3. Diagnostics redesign

### Production default — **Platform health** (`/admin/settings/realtime`)

Operator cards (no raw JSON / paths / request IDs):

| Card | Shows |
|------|--------|
| **Backend** | Healthy / Warning / Error · Latency · Version |
| **Realtime** | Connected / Connecting / Disconnected · Last heartbeat (relative) · Reconnect |
| **Providers** | Active names for AI, Email, Payments, Push |
| **Notifications** | Healthy / Disabled · Channel · Last successful delivery (relative; from last push provider test when available) |
| **Storage** | Connected / Attention · Provider · Status |
| **Maps** | Connected / Disabled / Attention · Provider · Status |
| **AI** | Available / Unavailable · Provider · Status |

Actions: **Refresh** (health probe + provider snapshot). No HTTP method/path list.

### Developer Diagnostics (gated)

| Gate | Rule |
|------|------|
| Allowed when | `import.meta.env.DEV` **or** public Development Controls flag `enableDevelopmentMode` |
| Activation | Explicit “Enable developer view” on the page (`localStorage` key `fixnow.admin.developerDiagnostics`) |
| Content when on | Socket stats, frontend diagnostic dump (incl. recent HTTP events with paths/IDs), provider snapshot JSON |
| When locked | Copy explains Super Admin must enable Development Mode (or use a local Vite build) |

Production admins with Development Mode **off** never see HTTP logs or request IDs on this page.

---

## 4. Logout implementation (reference)

**Core:** `packages/hooks/AuthProvider.tsx` → `logout()`

```
unregisterPushDevice → disconnectSocket → clearFrontendDiagnostics
→ clearRoleCaches → clearSecureSession → authApi.logout
→ clearSession (tokens + user) → dispatch fixnow:auth-logout
```

**UI:** `apps/admin/components/AdminShell.tsx`, `packages/shared/header/HeaderProfileMenu.tsx`, `HeaderMenuButton.tsx`, `menuConfig.ts` (admin “Sign out”).

**Realtime follow-up:** `SocketProvider` disconnects whenever auth becomes anonymous.

---

## 5. Page-by-page Admin exposure audit (summary)

| Page / area | Internal leak risk | Status |
|-------------|-------------------|--------|
| Platform health | Was critical | **Fixed** + Developer Mode |
| Provider Manager | Env names / timestamps | **Hardened** |
| Development Controls | Explicit developer tooling | OK if Super Admin only |
| Dashboard / Jobs / Tracking / etc. | Routes are app nav, not API dumps | OK |
| Audit Logs | Business audit events | OK (not client HTTP diag) |
| Login / Setup / Dev Entry | OTP/bootstrap for first-run | OK; keep Dev Entry gated |
| Header Live sheet | Friendly status | OK |
| Content / Technicians export JSON | User-initiated downloads | Acceptable |

---

## 6. Production readiness score

| Criterion | Score (0–2) | Notes |
|-----------|-------------|--------|
| Obvious Sign Out | 2 | Menu + drawer + sidebar + header |
| Complete session teardown | 2 | Socket, caches, tokens, diagnostics |
| Post-logout landing + Back safety | 1.5 | `/` + `replace`; expiry still → admin login |
| Operator health UI without internals | 2 | Cards only by default |
| Developer Mode gate | 1.5 | Requires Dev Mode or local DEV; not role-ACL beyond that |
| Cross-page leak hygiene | 1.5 | Provider Manager residual ops detail |
| **Total** | **10.5 / 12 → ~8.5 / 10** | |

### Recommended follow-ups (optional)

1. Restrict Provider Manager + Development Controls to Super Admin role ACL if not already.  
2. Add a real “last push delivery” metric from the notifications service for the Notifications card.  
3. ~~On Sign Out, also clear `fixnow.admin.developerDiagnostics` so developer view does not persist on shared devices.~~ **Done** in `AuthProvider.logout`.  
4. Consider routing unauthenticated Admin deep links to `/` instead of `/admin/login` if product prefers Role Selector for all cold starts.

---

## 7. Files touched

- `packages/hooks/AuthProvider.tsx` — logout teardown  
- `packages/api/diagnostics.ts` — `clearFrontendDiagnostics`; production-safe `installWindowDiagnostics`  
- `packages/api/index.ts` — export  
- `packages/shared/header/menuConfig.ts` — “Sign out”  
- `packages/shared/header/HeaderProfileMenu.tsx` / `HeaderMenuButton.tsx` — admin → `/`  
- `apps/admin/components/AdminShell.tsx` — Sign out surfaces + Platform health nav  
- `apps/admin/pages/RealtimeDiagnosticsPage.tsx` — health cards + gated Developer Diagnostics  
- `apps/admin/pages/ProvidersPage.tsx` — reduce env/timestamp exposure  

---

*End of audit.*
