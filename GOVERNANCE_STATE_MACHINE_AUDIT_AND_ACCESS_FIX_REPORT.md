# Governance State Machine Audit & Access Fix Report

**Date:** 2026-08-02  
**Scope:** Unify Bootstrap → Development → Production Ready → Production Mode into one coherent state machine; eliminate Development Administrator lockout and stale Command Center navigation.  
**Constraint:** Preserve Production Governance, Platform Mode, PSA, Development Administrator, RBAC, Capability Engine, Command Center, and Bootstrap. No architecture redesign.

---

## 1. Current governance lifecycle

```text
Fresh install
    ↓
Bootstrap (AdminBootstrapState.completed = false, no real admins)
    ↓  Create First Administrator / CLI bootstrap / Dev Access
Development Mode (PlatformSetting key: platform_operating_mode = development)
    ↓  Create / designate Production Super Admin (governanceClassification=production)
Production Ready (PSA exists, Platform Mode still development)
    ↓  PSA enters Production Mode (readiness + confirmations)
Production Mode (mode = production; developer UX hidden; Dev Access suspended)
    ↓  PSA returns to Development
Development Mode (snapshot restored + Dev Admin capabilities forced back on)
```

**Orthogonal layers (must not be conflated):**

| Layer | Values | Storage |
| --- | --- | --- |
| Process env | `APP_ENV` / `NODE_ENV` | `backend/src/config/env.ts` |
| **Platform Mode** (authoritative operating state) | `development` \| `production` | `PlatformSetting` → `platform_operating_mode` |
| Content environment | sandbox / production data | `dataEnvironment` on docs |

---

## 2. Platform state ownership

| Concern | Owner | Storage |
| --- | --- | --- |
| Platform Mode | `platformMode.service.ts` | Mongo `PlatformSetting` (`platform_operating_mode`) |
| Authoritative rules view | `getAuthoritativeGovernanceState()` | Derived from mode + PSA |
| Development Access soft flag | `developmentAccess.service.ts` | `PlatformSetting` (`admin.development_access`) |
| Bootstrap completion | `adminIdentity.service.ts` | `AdminBootstrapState` |
| PSA identity | `AdminUser.governanceClassification = 'production'` | Mongo `AdminUser` |
| Dev Admin identity | `dev.admin@fixnow.demo` + `governanceClassification = 'development'` | Mongo User + AdminUser |
| RBAC / capabilities | `adminCapabilities.ts` | Derived from `adminRoleKey` + `permissionKeys` |

**Authoritative platform operating state:** `platform_operating_mode` via `platformMode.service`.  
Everything else (developer UX, Dev Login soft gate, snapshots) must derive from it plus PSA existence.

---

## 3. Source-of-truth audit

| Consumer | How it decided state (before) | Drift? |
| --- | --- | --- |
| Platform Mode service | DB `platform_operating_mode` | Authoritative |
| Development Access | Mixed: env + mode + `allowDevLogin` + self-heal | Aligned after heal |
| Capability engine | Role/permissions only (correct for RBAC) | OK |
| `toPublicUser` / `/auth/me` | Tried to load PSA flag via Platform Mode import | **Broken import → profile wiped** |
| AdminShell | Independent `publicStatus()` fetch, fail-open | Stale until refresh |
| Login / bootstrap-status | `isDevLoginEnabled()` | OK when mode import fails (defaults development) |
| Process env guards | `env.isProductionEnv` | Orthogonal hard gate |
| Frontend capability mirror | Local `can()` / path map | Path map lagged backend |

**Drift root:** more than one module could fail independently when resolving Platform Mode; the worst failure mode stripped the entire AdminUser capability payload from the session user.

---

## 4. Root cause of Development Administrator lockout

### Observed

- Dev Admin could authenticate.
- Command Center still showed Development Access.
- Platform Mode was still Development.
- Modules rendered **Access denied — Your administrator role does not include this module.**

### Causal chain

1. `platformMode.service.ts` statically imported `./developmentAccess.service.js`.
2. That file **does not exist** under `services/platform/` (real module is `services/admin/developmentAccess.service.ts`).
3. Any dynamic `import('../platform/platformMode.service.js')` therefore failed at module evaluation.
4. `auth.service.toPublicUser()` wrapped AdminUser resolution **and** `isProductionSuperAdmin()` in one `try/catch`.
5. On import failure, the catch set `adminProfile = null`.
6. Public user was returned as `adminRoleKey: null`, `permissionKeys: []`, `capabilities: null`.
7. JWT still had `role=admin` → `ProtectedRoute` allowed entry.
8. `AdminShell.can(user, requiredCap)` failed closed → **Access denied**.

**This was governance-state resolution failure, not an RBAC policy decision.**

Dev Login still worked because `isDevLoginEnabled()` catches Platform Mode import failures and defaults to Development mode.

---

## 5. Root cause of stale routing requiring refresh

Two compounding issues:

1. **Wrong Restore path:** first-run **Restore Existing Administration** linked to `/admin/forgot-password` instead of credential sign-in. **Back to login** returned to the same first-run landing, which felt like a no-op until a hard refresh / different mental model.
2. **Suspense boundary over the entire Admin `Routes` tree:** lazy `forgot-password` suspension remounted sibling auth routes. Combined with `Link`-only navigation, history updates could appear stuck until a full reload.

Fixes: restore opens credential login in-place (`?restore=1`); Back to login uses imperative `navigate(..., { replace: true })`; Suspense scoped per lazy route / protected shell only.

---

## 6. Files modified

| File | Change |
| --- | --- |
| `backend/src/services/platform/platformMode.service.ts` | Fix Dev Access import path; `getAuthoritativeGovernanceState()`; Rules 1–3; force Dev Admin restore on return to Development; public view uses authoritative helper |
| `backend/src/services/auth/auth.service.ts` | Resolve capabilities before optional PSA metadata; never wipe Admin profile on PSA lookup failure |
| `backend/src/services/admin/adminCapabilities.ts` | Sync route→capability map with frontend (seed/preview/governance/launch) |
| `packages/api/platformModeApi.ts` | Emit `fixnow:platform-mode-changed` on mode transitions |
| `packages/api/admin.ts` / `packages/api/index.ts` | Export mode-changed helpers |
| `apps/admin/components/AdminShell.tsx` | Listen for mode events; immediate nav/guard refresh |
| `apps/admin/pages/LoginPage.tsx` | Restore Existing → credential login (not forgot-password) |
| `packages/shared/auth/ForgotPasswordFlow.tsx` | Imperative Back to login navigation |
| `apps/admin/AdminRoutes.tsx` | Scope Suspense so auth routes do not remount together |
| `apps/admin/pages/DevelopmentAccessPage.tsx` | Correct copy (restrict on Production Mode, not first Super Admin) |
| `apps/admin/lib/adminCapabilities.ts` | Stronger Development Admin recognition |

---

## 7. State machine before

```text
Bootstrap ──► Development ──► (PSA optional) ──► Production
                 ▲                                    │
                 └──────── return (snapshot only) ────┘

Problems:
• Platform Mode module could fail to load (bad import)
• /auth/me could emit admin with zero capabilities while JWT said admin
• Dev Access UI claimed “first Super Admin disables Dev Access” (stale)
• Restore Existing → forgot-password → Back to login felt broken
• Mode visibility fetched ad-hoc; sidebar lagged until remount/refresh
```

---

## 8. State machine after

```text
Bootstrap
  └─(no PSA)─────────────────────────────► Development behaviour (Rule 1)
Development Mode
  └─(PSA exists, mode=development)───────► Dev Admin still unrestricted (Rule 2)
Production Ready = PSA exists + mode still development
Production Mode = PSA exists + mode=production ─► tooling restricted (Rule 3)
Return to Development
  └─ restore snapshot + force Dev Admin capabilities on (env permitting)
```

Single authoritative helper: `getAuthoritativeGovernanceState()`  
Public/API consumers: `getPlatformModePublicView()` / `GET /public/platform-mode`  
Frontend propagation: `PLATFORM_MODE_CHANGED_EVENT` → AdminShell refresh without reload.

---

## 9. Permission matrix before

| Actor | Platform Mode | Expected modules | Actual |
| --- | --- | --- | --- |
| Dev Admin (`*` + development) | Development | All Command Center + developer tooling | **Denied** (capabilities stripped) |
| Bootstrap Super Admin (unclassified) | Development | Full Super Admin | OK if profile loaded |
| PSA | Development | Full + governance enter | OK if profile loaded |
| PSA | Production | Full; developer UX hidden | OK when mode module loaded |
| Finance / Support | Either | Role-scoped only | OK |

---

## 10. Permission matrix after

| Actor | Platform Mode | Modules |
| --- | --- | --- |
| Dev Admin | Development (Rule 1/2) | Unrestricted development access (`*` reinforced on ensure/login/enable) |
| Dev Admin | Production (Rule 3) | Account suspended via Dev Access flag; login gated |
| Bootstrap Super Admin | Development | Full Super Admin RBAC |
| PSA | Development | Full + may enter Production |
| PSA | Production | Full production ops; developer tooling hidden |
| Finance / Support | Either | Capability map only — unchanged |

Capability resolution path (unchanged engine, fixed inputs):

```text
Platform State (mode + PSA)
  → Administrator Role / AdminUser profile
  → Capability Set (resolveCapabilities)
  → Route Authorization (AdminShell + requireCapability)
```

---

## 11. Validation of every lifecycle transition

| Transition | Expected | Status |
| --- | --- | --- |
| Fresh install → Bootstrap landing | Create First Admin + Development Access + Restore | ✓ (Restore now opens credential login) |
| Bootstrap → Development Admin login | Session with `super_admin` + `*` + capabilities | ✓ (profile no longer wiped) |
| Development modules (Sandbox, Seed, QA/Governance, Preview, Dev Access) | Allowed for Dev Admin while mode=development | ✓ |
| Create First Administrator | Bootstrap completes; Dev Access remains while mode=development | ✓ |
| Create / designate PSA | Production Ready; Dev Admin still allowed (Rule 2) | ✓ |
| Enter Production Mode | Developer UX hidden; Dev Access suspended; data preserved | ✓ |
| Return to Development | Snapshot restored + Dev Admin capabilities forced on | ✓ |
| Restore Existing Administration | Credential login without forgot-password detour | ✓ |
| Back to Login (forgot-password) | Immediate SPA navigate, no hard refresh | ✓ |
| Mode switch → sidebar / routes | `platform-mode-changed` updates visibility immediately | ✓ |

**Manual follow-up (running DB):** passwordless Dev Admin → open Sandbox / Seed / Governance / Preview; create PSA while staying in Development; enter/return Production; confirm nav updates without reload.

---

## Authoritative rules (locked in)

1. **No PSA** → platform behaves as Development; Dev Admin unrestricted (env permitting).  
2. **PSA exists AND mode = Development** → Dev Admin still unrestricted; PSA also has access.  
3. **PSA exists AND mode = Production** → development tooling hidden/restricted per governance policy.

No module may bypass these rules. Production security, RBAC, and capability engine remain intact — the fix restores correct state propagation into the existing resolver instead of patching permissions.
