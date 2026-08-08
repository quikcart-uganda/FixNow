# Admin Entry Gateway — Audit & Restoration Report

**Date:** July 26, 2026
**Scope:** `/admin` entry experience — bootstrap detection, development quick login, production safeguards.
**Status:** Regression identified and fixed. Single adaptive entry gateway restored.

---

## 1. Root Cause of the Regression

The plain login screen (Screenshot 1) was **not** a competing page and the bootstrap screen (Screenshot 2) was **not** deleted. Both live in the same component (`apps/admin/pages/LoginPage.tsx`), which already branched on the server's bootstrap status. Two defects caused the bootstrap experience to disappear:

### Defect A — Bootstrap detection failure (primary)

`adminIdentityService.bootstrapStatus()` computed `completed` from raw `AdminUser` counts:

```ts
completed: Boolean(state?.completed) || superCount > 0 || adminCount > 0
```

The seeded Development Administrator (`dev.admin@fixnow.demo`) is created as an **active Super Admin `AdminUser` record** by `ensureDevAdmin()`. So the first time a developer used Development Quick Login, the seed account was written to the database and `completed` flipped to `true` — permanently. From then on `/admin` rendered the standard email/password login even though no real administrator had ever been created.

### Defect B — UI refactor side effect (secondary)

A previous authentication-UI pass converted the visible "Development Quick Login" into a *silent* shortcut (long-press the logo, or Ctrl/Cmd+Shift+D, navigating to a hidden `/admin/dev` page). With no visible affordance, the development entry appeared to be gone entirely.

**Classification:** bootstrap detection failure + authentication refactor side effect. Not a routing mistake, merge conflict, or feature-flag misconfiguration.

## 2. What Was Merged vs. Restored

Nothing was reverted. The existing adaptive `LoginPage` was kept and repaired:

- Backend bootstrap detection now **excludes development-seeded administrators** from initialization counts.
- The bootstrap screen regained a **visible "Continue as Development Administrator"** action (development only).
- The standard login regained a **small "Development Quick Login"** option (development only).
- Screenshot 1 and Screenshot 2 remain a single component — one adaptive experience, zero competing pages.

## 3. Final Routing Flow

There is exactly one entry route. `/admin` (unauthenticated) redirects through `ProtectedRoute` to `/admin/login`, which renders the gateway:

```
/admin
  │  (unauthenticated → /admin/login)
  ▼
GET /admin/identity/bootstrap-status   ← public, sanitized
  │
  ├─ completed = false ──► First-Run Welcome
  │     ├─ Create First Administrator      → /admin/setup (guided wizard)
  │     ├─ Continue as Development Admin   (only if devLoginEnabled)
  │     └─ Restore Existing Administration → /admin/forgot-password
  │
  └─ completed = true ───► Standard Command Center Login
        ├─ Email + password + remember device + forgot password (+ MFA)
        └─ Development Quick Login          (only if devLoginEnabled)
```

Supporting routes (`/admin/setup`, `/admin/dev`, `/admin/accept-invite`, `/admin/forgot-password`) are workflow pages, not alternative logins. `/admin/setup` self-redirects to login once an administrator exists; `/admin/dev` is an unlinked engineer shortcut that redirects to login whenever the server reports the capability disabled.

## 4. Bootstrap Decision Logic

The client never decides — the server does, via `GET /admin/identity/bootstrap-status`, which now returns only:

| Field | Meaning |
|---|---|
| `completed` | A real (non-development-seed) administrator exists, or bootstrap was formally completed |
| `devLoginEnabled` | `ALLOW_DEV_ADMIN_LOGIN=true` AND environment is non-production |

Key fix in `adminIdentityService.bootstrapStatus()`: user IDs whose email matches the dev-seed suffixes (`@fixnow.demo`, `@example.com`, `@test.local`) are excluded from both the Super Admin and total admin counts. The seeded development account can therefore never mark the system as initialized.

The four cases resolve as:

| Case | Environment | Real admin exists | Rendered UI |
|---|---|---|---|
| 1 | dev + flag on | No | Welcome + **Create First Administrator** + **Continue as Development Administrator** |
| 2 | dev + flag on | Yes | Standard login + small **Development Quick Login** |
| 3 | production | No | Welcome + **Create First Administrator** only (secure setup wizard) |
| 4 | production | Yes | Standard login only |

## 5. Development Seed Administrator Logic

- Canonical account: `dev.admin@fixnow.demo` (`DEV_ADMIN` in `backend/src/constants/adminIdentity.ts`).
- Created **lazily and idempotently** by `ensureDevAdmin()` only during a dev login — never by production code paths, migrations, or seeds.
- `devLoginEnabled()` = `env.allowDevAdminLogin && !env.isProductionEnv`. Both `ensureDevAdmin()` and the `POST /auth/dev-admin-login` endpoint refuse when it is false.
- `env.allowDevAdminLogin` is **hard-forced to `false` in production** (`backend/src/config/env.ts`), and startup validation rejects `ALLOW_DEV_ADMIN_LOGIN=true` in production outright.
- Passwordless entry issues standard admin JWT/session — no special token shape.
- The account is assigned a random unguessable password hash; the passwordless flow never uses it.
- Dev-suffix emails are blocked from password login in production (`assertAdminMayLogin`) and blocked from bootstrapping production (`bootstrapSuperAdmin`).
- Excluded from bootstrap counts (this fix), so it never masks first-run setup.

## 6. Production Safeguards

1. **Environment enforcement:** `ALLOW_DEV_ADMIN_LOGIN=true` fails startup validation in production; the derived flag is unconditionally `false` there.
2. **Server-driven visibility:** the dev buttons render only when the server returns `devLoginEnabled: true`. The client has no environment heuristics of its own.
3. **Endpoint refusal:** even if a client is tampered with, `POST /auth/dev-admin-login` returns 403 unless the server-side gate passes.
4. **Sanitized public status:** the unauthenticated bootstrap-status endpoint no longer exposes admin counts, recovery key hints, or environment names — only `completed` and `devLoginEnabled`.
5. **No technical UI:** no CLI commands, environment banners, npm instructions, or internal wording anywhere on the entry screens. First-run copy is purely product-facing ("Welcome to FixNow Command Center…").
6. **Fail-safe fallback:** if the status request fails, the page renders the standard login (the most restrictive state), never the bootstrap or dev options.
7. **Dev accounts quarantined:** dev-suffix admin emails cannot log in with a password in production and cannot bootstrap production.

## 7. Files Modified

| File | Change |
|---|---|
| `backend/src/services/admin/adminIdentity.service.ts` | `bootstrapStatus()` excludes development-seeded admins from initialization counts (root-cause fix) |
| `backend/src/controllers/index.ts` | `identityBootstrapStatus` returns a sanitized public payload (`completed`, `devLoginEnabled` only) |
| `packages/api/adminApi.ts` | `bootstrapStatus()` response type matches the sanitized payload |
| `apps/admin/pages/LoginPage.tsx` | Restored visible dev entry: "Continue as Development Administrator" on the first-run screen and "Development Quick Login" on the standard login; product copy updated; inline passwordless entry with busy/error states |

Unchanged (verified correct): `apps/admin/AdminRoutes.tsx` (single entry route), `apps/admin/pages/SetupPage.tsx` (guided wizard, self-guards), `apps/admin/pages/DevEntryPage.tsx` (hidden shortcut, server-gated), `backend/src/routes/index.ts`, auth service dev-login gate, env validation. Customer and Technician authentication were not touched.

## 8. Regression Testing

| Scenario | Expected | Result |
|---|---|---|
| Fresh DB, development, flag on | Welcome + Create First Administrator + Continue as Development Administrator | ✅ |
| Dev quick login used once, then revisit `/admin` (dev) | Bootstrap screen **still shows** (seed admin no longer counts) | ✅ root cause fixed |
| Real admin created, development | Standard login + small Development Quick Login | ✅ |
| Fresh DB, production | Welcome + Create First Administrator only; no dev options, no technical detail | ✅ |
| Admin exists, production | Standard login only | ✅ |
| `ALLOW_DEV_ADMIN_LOGIN=false` (any env) | No dev UI; `POST /auth/dev-admin-login` → 403 | ✅ |
| `ALLOW_DEV_ADMIN_LOGIN=true` in production | Server refuses to start (env validation) | ✅ |
| Bootstrap-status API unreachable | Standard login (fail-safe), wizard still server-guarded | ✅ |
| `/admin/setup` after bootstrap completed | Redirects to `/admin/login` | ✅ |
| `/admin/dev` with capability disabled | Redirects to `/admin/login` | ✅ |
| Route guards | `/admin/*` console routes require authenticated admin role | ✅ unchanged |
| Customer / Technician auth | Untouched code paths | ✅ unchanged |
| Type safety | `tsc` frontend monorepo + backend | ✅ clean |
