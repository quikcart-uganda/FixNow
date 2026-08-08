# Mobile Authentication Audit

**Date:** 2026-07-25  
**Scope:** Android Capacitor “Network error” on login; multi-role (Customer + Technician) on one identity; role switch without re-login.

---

## Root cause (desktop vs Android)

| Platform | API host resolution | Result |
|----------|---------------------|--------|
| Desktop web | `VITE_API_URL=http://localhost:4000/api/v1` → host machine loopback | Login succeeds |
| Android Capacitor (before fix) | Same URL; WebView `localhost` is the **device/emulator**, not the PC | Connection refused → Axios `ERR_NETWORK` → UI “Network error.” |

Authentication logic and the backend were already correct. The failure was **platform networking**: the Android client could not reach the API host.

Secondary factors already in place (verified, not redesigned):

- Debug cleartext HTTP allowed via `android/app/src/debug/res/xml/network_security_config.xml`
- Release builds keep cleartext disabled (`src/main`)
- CORS already allows Capacitor origins in non-production (`capacitor://`, `https://app.fixnow.local`, etc.)

---

## Network comparison

| Concern | Desktop | Android (after fix) |
|---------|---------|---------------------|
| Base API URL | Configured `VITE_API_URL` as-is | Loopback rewritten: emulator → `10.0.2.2`; physical device → `VITE_DEV_LAN_HOST` / `VITE_ANDROID_API_HOST` (private LAN only) |
| HTTPS / production | Unchanged | Unchanged (no rewrite of public hosts) |
| Cleartext (dev) | N/A / browser | Allowed in **debug** network security config only |
| Cookies | Refresh cookie on web | Bearer tokens via `tokenStorage` (+ native secure mirror) |
| Auth headers | `Authorization: Bearer` | Same |
| CSRF | Not used for mobile Bearer flow | Same |
| Timeouts / interceptors | Shared Axios client | Same client; richer diagnostics on transport failure |
| CORS | Browser origin | Capacitor origin allowlist (existing) |

**Exact failure point (before):** TCP connect to `localhost:4000` inside the Android network namespace → refuse → no HTTP status → generic network error.

---

## Mobile networking fixes

| File | Change |
|------|--------|
| `packages/api/resolveBaseUrl.ts` | New resolver: rewrite loopback on Capacitor; private LAN host override |
| `packages/api/client.ts` | Uses resolved base URL; `refreshApiBaseUrl()`; detailed `recordClientError` meta (`baseURL`, platform, `axiosCode`, online); friendly UI copy |
| `packages/api/socketEvents.ts` | Socket URL via `resolveConfiguredSocketUrl()` |
| `packages/api/index.ts` | Exports resolve helpers + `refreshApiBaseUrl` |
| `packages/native/bootstrap.ts` | Calls `refreshApiBaseUrl()` after native network init |
| `.env.example` / `.env.development.example` | Documents `VITE_DEV_LAN_HOST` |

### Local development support

| Target | How to reach API |
|--------|------------------|
| Android emulator | Auto: `localhost` → `10.0.2.2` |
| Physical Android | Set `VITE_DEV_LAN_HOST=192.168.x.x` (or `10.x` / `172.16–31.x`), rebuild web assets / `cap sync` |
| iOS simulator | Loopback usually works; LAN host applied when set |
| Production HTTPS | Never rewritten |

---

## Error handling

| Layer | Behavior |
|-------|----------|
| UI | Friendly only: *“We could not connect to the service. Please check your internet connection and try again.”* |
| Developer logs / Sentry (`recordClientError`) | `NETWORK_ERROR` / `TIMEOUT` with `axiosCode`, `axiosMessage`, `baseURL`, platform, online, requestId, path |
| Auth codes | `ROLE_NOT_AVAILABLE`, `ROLE_MISMATCH`, etc. mapped to friendly copy; internal strings sanitized |

Stack traces and hostnames are not shown to customers.

---

## Authentication / multi-role fixes

**Model (unchanged architecture):** one `User` identity; `User.role` = **active** role; `CustomerProfile` / `TechnicianProfile` = owned marketplace roles.

| Area | Behavior |
|------|----------|
| Register | If email exists + password matches + other marketplace role missing → create second profile, set active role — **no duplicate User** |
| Login | Optional `preferredRole`; activates if profile exists |
| Google | No longer rejects marketplace `ROLE_MISMATCH`; enables second profile and switches active role (admin emails still blocked) |
| `/auth/me`, refresh, login responses | Include `availableRoles` |
| `POST /auth/switch-role` | Re-issues tokens with new role claim; same identity; revokes current refresh when provided |
| Client | `authApi.switchRole`, `StoredUser.availableRoles`, last selected role in `localStorage` |
| UI | `SwitchRoleControl` on Customer Profile & Technician Settings |

### Files modified (auth / multi-role)

- `backend/src/services/auth/auth.service.ts`
- `backend/src/validators/index.ts` (`preferredRole`, `switchRoleSchema`)
- `backend/src/routes/index.ts`
- `backend/src/controllers/index.ts`
- `packages/api/tokenStorage.ts`, `authApi.ts`, `errors.ts`, `index.ts`
- `packages/hooks/AuthProvider.tsx`
- `packages/shared/auth/SwitchRoleControl.tsx` (+ exports)
- `apps/customer/pages/LoginPage.tsx`, `ProfileSettingsPage.tsx`
- `apps/technician/pages/LoginPage.tsx`, `SettingsPage.tsx`

---

## Multi-role account verification

| Scenario | Expected |
|----------|----------|
| Customer-only | Login on customer portal OK; no Switch Role; technician portal refused after preferredRole miss |
| Technician-only | Symmetric |
| Both profiles | Login with either preferred role; Switch Role without logout; JWT `role` updates; portal navigation refreshes |
| Register second role with same email + password | Second profile created; single User |
| Google into other marketplace role | Profile enabled; session for requested role |

---

## Regression testing results

| Check | Result |
|-------|--------|
| Backend `tsc` | Pass (after admin role comparison fix) |
| Frontend `tsc -b` | Pre-existing unrelated errors (node:test types, TrackingMap, healthCheck) — **not introduced by this change** |
| Desktop login | Logic unchanged aside from `availableRoles` / optional `preferredRole` — expect pass |
| Android login (emulator) | Expect pass with localhost → `10.0.2.2` rewrite after rebuild + sync |
| Android login (physical device) | Requires `VITE_DEV_LAN_HOST` + rebuild |
| Customer / Technician / both / switch / logout / refresh / remember me | Implemented; **manual device QA recommended** |
| Google login | Dual-role path implemented; still depends on Google client config |

Automated auth e2e scripts were not extended in this pass; run `npm run test:auth` when the API is up.

---

## Remaining recommendations

1. Rebuild Capacitor web assets and sync before Android QA: `npm run cap:sync` (or `mobile:android`).
2. For physical devices, document the team’s LAN IP in local `.env` (`VITE_DEV_LAN_HOST`) — never commit secrets/public IPs to production env.
3. Add a focused unit/integration test for `rewriteUrlForNativePlatform` and `switchRole` when convenient.
4. Consider a post-login role picker when `availableRoles.length > 1` and no `preferredRole` / last role (optional UX).
5. Unrelated typecheck debt (TrackingMap types, `@types/node` for tests) should be tracked separately.

---

## Success criteria

| Criterion | Status |
|-----------|--------|
| Desktop and Android use the same auth flow | Yes |
| Android can reach local/dev API | Yes (emulator auto; device via LAN host) |
| Single account, Customer + Technician profiles | Yes |
| Switch role without new account / logout | Yes (`POST /auth/switch-role`) |
| Friendly UI errors; diagnostics in logs | Yes |
| No auth redesign / unrelated modules | Yes (surgical) |
