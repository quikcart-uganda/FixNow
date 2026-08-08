# Admin Identity System Report

**Date:** 2026-07-25  
**Scope:** Production-ready FixNow administrator identity (bootstrap, invitations, RBAC, recovery, production guards)  
**Constraint:** Customer and Technician authentication contracts unchanged; JWT shape unchanged.

---

## 1. Previous architecture

- Single shared `User` model with `role: 'admin'`.
- Shared `POST /auth/login` for all roles.
- Coarse gate: `authenticate` + `authorize('admin')`.
- RBAC models (`Permission`, `AdminRole`, `AdminUser`) existed but were **unseeded**.
- `requirePermission` / `requireSuperAdmin` **failed open** when no `AdminUser` profile existed → every admin was effectively super-admin.
- Demo identity: `marketing.admin@fixnow.demo` / `Password1!` from `seed-marketing.ts`.
- No invitation flow, no bootstrap CLI, no admin management UI, no MFA/recovery codes.

---

## 2. Problems found

| Issue | Impact |
|-------|--------|
| Fail-open permission middleware | Privilege escalation for any `role=admin` user |
| Seeded demo admin in all environments | Production risk if seeds run |
| No first-Super-Admin bootstrap | No secure production onboarding |
| Passwords shared / admin-set resets | No invitation activation |
| No operator lifecycle statuses | Cannot suspend/disable independently of marketplace users |
| Admin UI had no identity module | Operators could not manage peers |
| Recovery limited to generic OTP | No Super Admin dual-approval or bootstrap key |

---

## 3. New admin lifecycle

```
Bootstrap Super Admin (CLI, once)
        ↓
Active Super Admin invites operators
        ↓
Email + single-use token (TTL)
        ↓
Accept invite → set password → Active
        ↓
Login (Active AdminUser required)
        ↓
Suspend / Disable / Lock / Archive / Delete (audited)
```

Only **`status === active`** administrators may log in.

Statuses: `pending_invitation`, `active`, `suspended`, `disabled`, `locked`, `archived`, `deleted`.

---

## 4. Bootstrap process

```bash
cd backend
npm run bootstrap:super-admin -- --email you@company.com --name "Full Name"
# Password prompted interactively (env password refused in production)
```

- Seeds permission + role catalogue.
- Creates exactly one Super Admin (`permissionKeys: ['*']`).
- Emits a **Bootstrap Recovery Key** once (hash stored; plaintext never re-shown).
- Writes `AdminBootstrapState.completed = true` — subsequent runs refuse.
- Never auto-creates additional Super Admins.

---

## 5. Invitation workflow

1. Authenticated admin with `admins.manage` (or `*`) calls `POST /admin/admins/invite`.
2. Secure token hashed (SHA-256), single-use, TTL (`ADMIN_INVITE_TTL_HOURS`, default 72).
3. Email sent via existing email provider.
4. Invitee opens `/admin/accept-invite?token=…`, sets password (12+ complex).
5. `User` + `AdminUser` activated; invitation marked accepted; audit logged.
6. Non-production responses may include `acceptUrl` for local QA without mail.

---

## 6. Permission model

**Roles:** Super Administrator, Operations, Support, Finance, Marketing, Content, Verification, Customer Care, Read-only Auditor.

**Permissions (independently assignable):** technicians/customers/jobs/categories/offers/promotions/payments/refunds/reports/marketing/content/verification/admins/settings/audit/force-logout/reset-password/dev.controls, plus `*`.

Catalogue constants: `backend/src/constants/adminIdentity.ts`.  
Middleware: fail-closed — active `AdminUser` required.

---

## 7. Security improvements

| Control | Implementation |
|---------|----------------|
| Dev admin login flag | `ALLOW_DEV_ADMIN_LOGIN` (forced false in production) |
| Demo email block | `@fixnow.demo` / `@example.com` blocked unless flag |
| Seed marketing | Refuses `NODE_ENV/APP_ENV=production` |
| Password policy | 12–128 chars, upper/lower/number/symbol |
| Lockout | Existing `AUTH_MAX_FAILED_LOGINS` / lockUntil |
| Login history | `AdminLoginEvent` collection |
| Recovery codes | Generated while logged in; stored hashed; single-use |
| Super Admin recovery | Dual Super Admin approval **or** bootstrap key when only one exists |
| Session revocation | `refreshTokenVersion++` + session revoke on recovery |
| Permission middleware | No fail-open |
| Customer/Technician auth | Untouched (`register` still marketplace-only) |

Optional MFA fields exist on `AdminUser` (`mfaEnabled`, `mfaSecret`, recovery codes). Full TOTP challenge UI can be layered without schema changes; `ADMIN_REQUIRE_MFA` env is reserved.

---

## 8. Files modified / added

**Backend**

- `backend/src/constants/adminIdentity.ts` *(new)*
- `backend/src/constants/roles.ts`
- `backend/src/models/admin/Admin.ts` (extended + Invitation / LoginEvent / Recovery / Bootstrap)
- `backend/src/config/env.ts`
- `backend/src/middleware/authenticate.ts`
- `backend/src/services/admin/adminIdentity.service.ts` *(new)*
- `backend/src/services/auth/auth.service.ts` (admin login gate)
- `backend/src/services/index.ts`
- `backend/src/controllers/index.ts`
- `backend/src/routes/index.ts`
- `backend/scripts/bootstrap-super-admin.ts` *(new)*
- `backend/scripts/seed-admin-catalogue.ts` *(new)*
- `backend/scripts/seed-marketing.ts` (prod refuse + AdminUser link)
- `backend/package.json`
- `backend/.env.example`

**Frontend**

- `packages/api/adminApi.ts`
- `apps/admin/pages/AdminsPage.tsx` *(new)*
- `apps/admin/pages/AcceptInvitePage.tsx` *(new)*
- `apps/admin/pages/ForgotPasswordPage.tsx` *(new)*
- `apps/admin/pages/LoginPage.tsx`
- `apps/admin/AdminRoutes.tsx`
- `apps/admin/components/AdminShell.tsx`

---

## 9. Regression testing

| Test | Expected |
|------|----------|
| Backend `tsc --noEmit` | Pass |
| Customer/Technician login | Unchanged |
| Admin login without `AdminUser` | Forbidden |
| Demo admin + `ALLOW_DEV_ADMIN_LOGIN=true` (dev) | Allowed after seed link |
| Demo admin in production | Blocked (env guard + login gate) |
| `bootstrap:super-admin` twice | Second run refuses |
| Invite → accept → login | Active operator |
| Suspended admin login | Forbidden |
| `requirePermission` without profile | Forbidden |
| Recovery codes generate/consume | Audited |
| Bootstrap key recovery (single super) | Temporary token → password reset → sessions revoked |

---

## 10. Production deployment checklist

1. Set strong `JWT_*` secrets; `APP_ENV=production` / `NODE_ENV=production`.
2. Ensure `ALLOW_DEV_ADMIN_LOGIN` is **unset/false** (startup fails if true).
3. Do **not** run `seed:marketing` in production.
4. Configure real `EMAIL_PROVIDER` (resend/smtp).
5. Set `ADMIN_FRONTEND_URL` to the production admin origin.
6. Run `npm run seed:admin-catalogue` (optional; bootstrap also seeds).
7. Run `npm run bootstrap:super-admin -- --email ops@company.com --name "…"`.
8. **Print and vault the Bootstrap Recovery Key** offline.
9. Invite operators from **Administrators** UI; never share passwords.
10. Verify Super Admin can open Development Controls; non-supers cannot.
11. Confirm audit log entries for bootstrap, invites, logins, status changes.
12. Rotate any previously shared `Password1!` demo credentials if they ever touched a shared DB.

---

## API surface (admin identity)

| Method | Path | Auth |
|--------|------|------|
| GET | `/admin/identity/catalogue` | `admins.manage` |
| GET | `/admin/identity/bootstrap-status` | public (status only) |
| GET | `/admin/admins` | `admins.manage` |
| POST | `/admin/admins/invite` | `admins.manage` |
| POST | `/admin/admins/accept-invite` | public (token) |
| PATCH | `/admin/admins/:id/status` | `admins.manage` |
| PATCH | `/admin/admins/:id/permissions` | `admins.manage` |
| GET | `/admin/admins/:id/login-history` | `admins.manage` |
| POST | `/admin/me/recovery-codes` | admin |
| POST | `/admin/recovery/super-admin` | public/bootstrap key or request |
| POST | `/admin/recovery/:id/decide` | Super Admin |
| POST | `/admin/recovery/complete` | recovery token |

---

## Follow-ups (recommended)

- TOTP enrollment UI + login step-up when `ADMIN_REQUIRE_MFA=true`.
- Wire `AuditPage` to `GET /audit-logs`.
- Emergency break-glass account (disabled by default) as a separate PlatformSetting.
- Email/phone change dual-approval workflow UI.
