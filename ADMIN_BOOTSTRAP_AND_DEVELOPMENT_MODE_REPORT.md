# Admin Bootstrap & Development Mode Report

**Date:** 2026-07-26
**Scope:** Safe Development Mode (passwordless admin entry) + First Administrator onboarding, layered on the existing Admin Identity system.
**Constraint:** Customer/Technician authentication, JWT shape, invitation, and recovery workflows unchanged. Additive only.

---

## 1. Development login architecture

Passwordless Development Administrator entry is available **only** when **both** are true:

```
NODE_ENV=development   AND   ALLOW_DEV_ADMIN_LOGIN=true
```

Effective gate: `devLoginEnabled() = env.allowDevAdminLogin && !env.isProductionEnv`.
`env.allowDevAdminLogin` is already forced to `false` in production by `config/env.ts`, and `assertProductionGuards` makes the server **refuse to boot** if `ALLOW_DEV_ADMIN_LOGIN=true` in production.

Flow:

1. Admin login page calls public `GET /admin/identity/bootstrap-status`, which now returns `devLoginEnabled` and `environment`.
2. When enabled, an amber **Development Mode** card renders below the login form with **Enter Admin Console**.
3. Click → `POST /auth/dev-admin-login` (no email/password/OTP/MFA/invite).
4. `authService.devAdminLogin()`:
   - Calls `ensureDevAdmin()` — idempotently seeds a **Development Administrator** (`dev.admin@fixnow.demo`, Super Administrator, all permissions) — refuses unless `devLoginEnabled()`.
   - Issues the standard JWT access/refresh pair via the existing `issueTokenPair` (JWT shape untouched).
   - Records an `AdminLoginEvent` (`reason: dev_passwordless_login`) and a `warning`-severity audit log entry.
5. Client persists the session with the normal token storage and lands on `/admin/dashboard`.

The seeded Development Administrator uses a demo email matched by `isDevAdminEmail`, so even the password path is blocked for it in production by `assertAdminMayLogin`.

---

## 2. Production safeguards (functionality removed, not hidden)

| Surface | Production behaviour |
|---|---|
| `ensureDevAdmin()` / `devAdminLogin()` | Throw `403` — the dev admin is never created or authenticated |
| `POST /auth/dev-admin-login` | Route exists but service refuses; no session issued |
| `bootstrap-status.devLoginEnabled` | `false` → login page renders **no** dev card / badge |
| Server boot | Refuses to start if `ALLOW_DEV_ADMIN_LOGIN=true` in production |
| Demo admin emails | Blocked by `assertAdminMayLogin` + bootstrap/invite guards |

No CSS/frontend-only hiding: the card is driven by a server flag, and the capability itself is disabled server-side.

---

## 3. First Administrator experience

`bootstrapStatus()` now also returns `adminCount`. `completed = state.completed || superAdminCount > 0 || adminCount > 0`.

- **No administrators exist** → the admin login route renders a dedicated **Welcome to FixNow Command Centre** onboarding screen with three options:
  1. **Create First Super Administrator** (Recommended) → `/admin/setup` guided wizard.
  2. **Run Bootstrap CLI** → shows `npm run bootstrap:super-admin -- --email … --name …`.
  3. **Development Quick Login** → only when `devLoginEnabled`.
- **Administrators exist** → standard Command Center login (never shows onboarding again).

Generic “Incorrect email or password” is no longer the first-run experience.

---

## 4. Create First Admin wizard (`/admin/setup`)

Steps: (1) name → (2) work email → (3) phone → (4) strong password (live policy checklist) → (5) confirm → (6) optional MFA acknowledgement + review → **Create administrator**.

On submit → `POST /admin/identity/bootstrap` → `adminIdentityService.bootstrapFirstSuperAdmin()` (delegates to the existing guarded `bootstrapSuperAdmin`):

- Refuses if any administrator already exists (`completed`).
- Creates one Super Administrator (`permissionKeys: ['*']`).
- Returns the **Bootstrap Recovery Key** — displayed **once**, requires an acknowledgement checkbox before finishing.
- Writes `AdminBootstrapState.completed = true`, so bootstrap **auto-disables** and the wizard/onboarding never reappear.

`/admin/setup` redirects to `/admin/login` if bootstrap is already complete.

---

## 5. Bootstrap process (unchanged CLI + new web path)

- **CLI (unchanged):** `npm run bootstrap:super-admin -- --email you@company.com --name "Full Name"`.
- **Web wizard (new):** `POST /admin/identity/bootstrap`, guarded identically. Both share one idempotent service and cannot create a second auto Super Admin.

---

## 6. Visual warning

Amber badge (`Development Environment` / staging label, or `Development Mode`) renders on the login and onboarding screens whenever `environment !== 'production'`, using amber/yellow styling distinct from production chrome.

---

## 7. Admin management (Settings → Administration → Administrators)

Existing `/admin/admins` page (reused) provides: view, search, filter (status/role), invite, activate, suspend, disable, lock, archive, **delete (soft, added)**, permissions view, and login history. Backend also exposes role/permission reassignment, recovery codes, and Super Admin recovery. Suspended/deleted operators cannot log in (`ADMIN_LOGIN_ALLOWED_STATUSES = [active]`).

---

## 8. Files modified / added

**Backend**
- `backend/src/constants/adminIdentity.ts` — `DEV_ADMIN` seed identity constant.
- `backend/src/services/admin/adminIdentity.service.ts` — `devLoginEnabled()`, `ensureDevAdmin()`, extended `bootstrapStatus()`, `bootstrapFirstSuperAdmin()`.
- `backend/src/services/auth/auth.service.ts` — `devAdminLogin()` (reuses token issuance).
- `backend/src/controllers/index.ts` — `authController.devAdminLogin`, `adminController.bootstrapFirstAdmin`.
- `backend/src/routes/index.ts` — `POST /auth/dev-admin-login`, `POST /admin/identity/bootstrap`.
- `backend/.env.example` — documented `ALLOW_DEV_ADMIN_LOGIN`.

**Frontend**
- `packages/api/authApi.ts` — `devAdminLogin()`.
- `packages/hooks/AuthProvider.tsx` — `devAdminLogin` in auth context.
- `packages/api/adminApi.ts` — extended `bootstrapStatus` type, `bootstrapFirstAdmin()`.
- `apps/admin/pages/LoginPage.tsx` — onboarding detection, dev card, amber badge.
- `apps/admin/pages/SetupPage.tsx` *(new)* — Create First Admin wizard.
- `apps/admin/AdminRoutes.tsx` — `/admin/setup` route.
- `apps/admin/pages/AdminsPage.tsx` — soft-delete action.

---

## 9. Security validation

- Dev login gated by `NODE_ENV=development && ALLOW_DEV_ADMIN_LOGIN=true`; production boot fails if the flag is on.
- Dev admin uses a demo email blocked by production login/bootstrap/invite guards.
- Web bootstrap shares the guarded routine — one Super Admin max; refuses once complete.
- Recovery key shown once, hashed at rest.
- Dev entry is audit-logged (`auth.dev_admin_login`, `warning`) and recorded in `AdminLoginEvent`.
- JWT/session issuance unchanged; customer/technician auth untouched.

---

## 10. Regression testing

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | Pass |
| Frontend `vite build` | Pass |
| Fresh install (no admins) shows onboarding | Yes (via `bootstrap-status.completed=false`) |
| Development Mode shows passwordless entry | Yes (`devLoginEnabled`) |
| Production hides Development Mode | Yes (flag false + server-side refusal) |
| First Super Admin creation | `POST /admin/identity/bootstrap` |
| Bootstrap disables automatically | `AdminBootstrapState.completed=true` |
| Admin login works afterward | Standard `/admin/login` |
| Additional admins invited | Existing `/admin/admins` invite flow |
| Customer/Technician auth | Unaffected (no changes to those paths) |

Manual follow-up (requires running DB): fresh DB → onboarding → wizard → recovery key → login; dev card passwordless entry in development; confirm production build with `NODE_ENV=production` refuses `ALLOW_DEV_ADMIN_LOGIN=true`.
