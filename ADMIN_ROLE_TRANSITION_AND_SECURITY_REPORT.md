# Admin Role Transition and Security Report

**Date:** 2026-07-28  
**Scope:** Development Admin → production Super Admin transition, three production roles, centralized capability engine  
**Builds on:** Admin identity catalogue, bootstrap, invitations, Dev Controls, audit logs

---

## 1. Development Admin lifecycle

| State | Meaning |
|-------|---------|
| Pre-transition | No real Super Admin yet. Env allows `ALLOW_DEV_ADMIN_LOGIN` + non-production → Development Access button is **rendered**. |
| Transition completed | First real Super Admin created (bootstrap). Dev Admin account set to **disabled** (never deleted). Login button **not rendered**. |
| Re-enabled | Super Admin turns **Allow Development Login** on under Security → Development Access. Button returns immediately (no restart). |
| Production / env off | Always unavailable. Cannot be unlocked from the UI. |

Seeded account: `dev.admin@fixnow.demo` (passwordless). Equivalent to Super Admin while active.

---

## 2. Production transition workflow

```
Development (Dev Admin builds platform)
        ↓
Create first Super Admin (Setup / bootstrap API / CLI)
        ↓
Automatic: completeDevelopmentTransition()
        ↓
Dev Admin disabled · allowDevLogin=false · audit logged
        ↓
Admin Login shows only email/password (no Development button)
        ↓
Super Admin may later re-enable Development Access (non-prod only)
```

---

## 3. First Super Admin activation

Paths:

- Guided web: `/admin/setup` → `POST /admin/identity/bootstrap`
- Login first-run: “Create First Administrator”
- CLI: `npm run bootstrap:super-admin`

Always assigns **`super_admin`** with wildcard `*`. Demo emails blocked in production.

---

## 4. Automatic Development Admin disable sequence

On successful `bootstrapSuperAdmin`:

1. Persist `AdminBootstrapState.completed`
2. Call `completeDevelopmentTransition({ actorId, reason })`
3. Disable Dev Admin `AdminUser` (`status=disabled`, `isActive=false`) — **User row kept**
4. Bump Dev Admin `refreshTokenVersion` (invalidate sessions)
5. Persist `admin.development_access` PlatformSetting
6. Audit: `admin.development_access.transition_completed`

Self-heal: if a real Super Admin exists but transition was never marked, `ensureTransitionSelfHeal()` completes it on next status/login check.

---

## 5. Role architecture

### Production roles (invite / create)

| Key | Name | Scope |
|-----|------|--------|
| `super_admin` | Super Admin | Everything |
| `finance` | Finance Admin | Payments, refunds, subscriptions, boosts, finance reports |
| `support` | Support Admin | Users, jobs, verification, CMS, marketing moderation, ops reports |

Legacy catalogue roles (operations, marketing, content, …) remain in the DB for existing operators but **cannot** be assigned to new invites.

### Capability engine (`adminCapabilities.ts`)

`CanManageFinance`, `CanManageSupport`, `CanManageSubscriptions`, `CanManageUsers`, `CanManageAdmins`, `CanManageSettings`, `CanManageInfrastructure`, `CanManageProviders`, `CanManageAI`, `CanManageContent`, `CanManageMarketing`, `CanViewReports`, `CanViewAudit`, `CanManageDevelopmentAccess`

Pages and APIs use capabilities — not hardcoded role strings.

---

## 6. Permission matrix (summary)

| Module | Super | Finance | Support |
|--------|-------|---------|---------|
| Dashboard / reports | ✓ | ✓ | ✓ |
| Payments / escrow / payouts | ✓ | ✓ | ✗ |
| Subscriptions / boosts | ✓ | ✓ | ✗ |
| Technicians / customers / jobs | ✓ | ✗ | ✓ |
| Verification / CMS / marketing | ✓ | ✗ | ✓ |
| Administrators / roles | ✓ | ✗ | ✗ |
| Providers / Dev Controls | ✓ | ✗ | ✗ |
| Development Access | ✓ | ✗ | ✗ |
| Audit logs | ✓ | ✓ (read) | ✓ (read) |

---

## 7. Backend authorization

| Mechanism | Use |
|-----------|-----|
| `authorize(ROLES.ADMIN)` | Marketplace role gate |
| `requirePermission(...)` | Granular catalogue keys + audit on deny |
| `requireCapability('CanManage…')` | Role engine |
| `requireSuperAdmin()` | Identity, providers, Dev Controls, Development Access |

`/auth/me` (and login responses) include `adminRoleKey`, `permissionKeys`, `capabilities` for the active AdminUser.

Development Access APIs:

- `GET/PUT /admin/security/development-access`
- `GET /admin/security/development-access/login-history`

Effective login flag: `isDevLoginEnabled()` (async) — env + transition + Super Admin toggle.

---

## 8. Frontend navigation restrictions

- `apps/admin/lib/adminCapabilities.ts` — client capability helpers
- `AdminShell` filters sidebar / mobile tabs by capability
- Direct URL to a forbidden module → in-shell **Access denied** (not blank)
- Invite dialog: only Super / Finance / Support; **no default role**
- Login: Development button only when `bootstrapStatus.devLoginEnabled === true` (not rendered otherwise); styled as **Internal Development Access**

Route: `/admin/settings/development-access`

---

## 9. Audit logging

| Action | When |
|--------|------|
| `auth.dev_admin_login` | Dev passwordless login |
| `admin.bootstrap.completed` | First Super Admin |
| `admin.development_access.transition_completed` | Auto disable |
| `admin.development_access.enable` / `.disable` | Super Admin toggle |
| `admin.invite.*` / status / permissions | Operator lifecycle |
| `admin.permission_denied` | Capability / permission gate fail |

Also: Development Access history array + `AdminLoginEvent` for Dev Admin sessions.

---

## 10. Security validation

| Check | Expected |
|-------|----------|
| Before first Super Admin | Development button visible (non-prod + env) |
| After bootstrap | Button gone; Dev Admin disabled |
| Super Admin re-enable | Button returns without restart |
| Finance Admin | Finance nav + APIs; no Settings / Admins |
| Support Admin | Ops nav; no payments / subscriptions APIs |
| Super Admin | Full nav |
| Unauthorized deep link | Access denied UI + API 403 |
| Production | Dev Access locked |

---

## 11. API protection

Finance / subscriptions / boosts / escrow / payouts admin routes require `CanManageFinance` or `CanManageSubscriptions`.  
Admin identity routes remain `admins.manage` / Super Admin.  
Settings / providers / Development Access remain Super Admin.

---

## 12. Database / settings changes

| Store | Purpose |
|-------|---------|
| `PlatformSetting` key `admin.development_access` | Transition + allowDevLogin + history |
| `AdminUser` for Dev Admin | Status `disabled` on transition (row retained) |
| `AdminBootstrapState` | Existing bootstrap completion |
| Catalogue seed | Super / Finance / Support permission sets updated |

No destructive migration — legacy role keys remain readable.

---

## 13. Future extensibility

1. Add a capability to `ADMIN_CAPABILITIES` + `CAPABILITY_PERMISSIONS`.
2. Map new permission keys in `PERMISSION_CATALOGUE` / role seed.
3. Attach `requireCapability(...)` on routes and nav `capability` on AdminShell.
4. Optionally promote a legacy role into `PRODUCTION_ADMIN_ROLES` if product requires a fourth production role.

Do **not** fork a second RBAC system — extend this engine.

---

**This document is the official FixNow reference for Development → Production admin transition and RBAC.**
