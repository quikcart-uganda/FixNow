# Development Admin Access Fix Report

**Date:** 2026-07-30  
**Bug:** Development Administrator incorrectly locked out / denied Command Center modules before Platform Mode is Production  
**Constraint:** No architecture, RBAC engine, Platform Mode, or Launch Centre redesign  

---

## 1. Root cause

Two coupled defects caused “Access denied — Your administrator role does not include this module” while Platform Mode was still **Development**:

### A. Premature Development Access suspension (primary)

`ensureTransitionSelfHeal()` and bootstrap `completeDevelopmentTransition()` treated **“a real Super Admin exists”** as enough to:

1. Set `allowDevLogin = false`
2. Disable the Development Administrator `AdminUser` (`status=disabled`)

That ran even when **Platform Mode === Development**.

Expected product rule:

> Restrict development tooling only when **both** are true:  
> 1) Production Super Admin exists, **and**  
> 2) Platform Mode === Production  

Creating a PSA / bootstrap Super Admin while still in Development Mode must **not** strip Development Admin access.

### B. Incomplete Dev Admin capability repair

`ensureDevAdmin()` only restored `permissionKeys=['*']` + `adminRoleKey=super_admin` when the profile was inactive. An **active but stripped / stale** profile (or a re-enabled account without reinforcing wildcard) could log in while the frontend capability gate failed closed:

```ts
// AdminShell
allowedHere = !requiredCap || can(user, requiredCap)
// can() fail-closed when capabilities/permissionKeys/adminRoleKey absent
```

Re-enable via `enableDevelopmentAdminAccount()` previously only flipped `isActive` and did **not** restore Super Admin wildcard permissions.

### C. Secondary UX

Help menu shortcuts to Development Access / Development Controls were shown to any admin, so limited roles could navigate into modules and see the same Access denied shell message.

---

## 2. Files modified

| File | Change |
| --- | --- |
| `backend/src/services/admin/developmentAccess.service.ts` | Platform Mode–aware login gate; stop auto-disable on Super Admin create; heal premature lockouts; restore full Dev Admin RBAC on enable |
| `backend/src/services/admin/adminIdentity.service.ts` | `ensureDevAdmin()` always reinforces Super Admin + `*` + `governanceClassification=development`; bootstrap transition no longer disables Dev Admin in Development Mode |
| `apps/admin/lib/adminCapabilities.ts` | Clarify Super Admin / Development Admin capability inheritance for Command Center |
| `apps/admin/components/AdminShell.tsx` | Refresh `/auth/me` on mount; gate Help shortcuts by capability |

Unchanged (by design): Platform Mode enter/rollback, Launch Centre PSA gates, `requireProductionSuperAdmin`, production env hard blocks.

---

## 3. Why Development Admin was denied

| Layer | What happened |
| --- | --- |
| Development Access config | Auto-transition set `allowDevLogin=false` when first real Super Admin appeared |
| AdminUser | Profile disabled or left without reliable `*` / `super_admin` after re-enable |
| Frontend `can()` | Fail-closed without Super Admin signals → Access denied banner |
| Platform Mode | Still Development (`developerUxVisible=true`) — menus visible, capability gate still failed |
| Backend sandbox/seed routes | `requireSuperAdmin()` — would also 403 if profile lacked `*` / `super_admin` |

Login could still succeed after a soft re-enable or passwordless path, while module capabilities remained incomplete — matching the reported symptoms.

---

## 4. Permission matrix

### Before

| Actor / Mode | Sandbox / Seed / Preview / Dev Controls | Development Access | Governance | PSA creation | Launch Centre mutations |
| --- | --- | --- | --- | --- | --- |
| Dev Admin + Development Mode + no PSA | Full (intended) | Full | Full | Available | N/A |
| Dev Admin + Development Mode + PSA exists | **Often denied / disabled** | Soft-locked | Often denied | Available to others | PSA only |
| Dev Admin + Production Mode | Hidden / suspended | Suspended | Restricted | N/A | PSA only |
| Limited admin | Capability-gated | Should be denied | Capability-gated | No | No |
| Production Super Admin + Production Mode | Hidden | Suspended | Full (PSA) | Done | Full |

### After

| Actor / Mode | Sandbox / Seed / Preview / Dev Controls | Development Access | Governance | PSA creation | Launch Centre mutations |
| --- | --- | --- | --- | --- | --- |
| Dev Admin + Development Mode (± PSA) | **Full** (`*` Super Admin) | **Available** (unless intentional soft-disable) | **Full** | Available | Still PSA-only (unchanged) |
| Dev Admin + Production Mode | Hidden (`developerUxVisible=false`) + access suspended | Suspended via enter Production | N/A for Dev Admin | N/A | PSA only |
| Limited admin | Capability-gated | Capability-gated (Help links hidden) | Capability-gated | No | No |
| Production Super Admin + Production Mode | Hidden | Suspended (reversible on return to Development) | Full | Done | Full |

---

## 5. Fix summary

1. **`isDevLoginEnabled`** — Production Mode requires explicit `allowDevLogin`; Development Mode keeps Dev Admin available (`allowDevLogin !== false`).
2. **`ensureTransitionSelfHeal`** — Records Super Admin awareness **without** disabling Dev Admin; heals premature `allowDevLogin=false` while still in Development Mode (unless history shows intentional `disable` by an actor).
3. **`completeDevelopmentTransition`** — Suspends Dev Admin **only when Platform Mode is already Production**.
4. **`ensureDevAdmin` / `enableDevelopmentAdminAccount`** — Always restore `super_admin` + `permissionKeys=['*']` + `governanceClassification=development`.
5. **Frontend** — Refresh session capabilities; Help shortcuts respect capabilities.

Production security is not weakened: Production Mode still hides developer UX, suspends Development Access on enter, and Launch Centre / mode transitions remain Production Super Admin–gated.

---

## 6. Validation

| Check | Result |
| --- | --- |
| Platform Mode === Development → Dev Admin login enabled (env permitting) | Pass (logic) |
| PSA / bootstrap Super Admin exists + still Development Mode → Dev Admin retains `*` | Pass |
| Premature `allowDevLogin=false` healed on next login/status read | Pass |
| `ensureDevAdmin` reinforces Super Admin capabilities every login | Pass |
| Enter Production Mode still suspends Development Access | Pass (unchanged `applyProductionVisibility`) |
| Return to Development restores snapshot / Dev Access flag | Pass (unchanged) |
| `requireProductionSuperAdmin` for Launch Centre / mode switch | Intact |
| Limited admin still fail-closed without capabilities | Intact |
| Help menu no longer advertises Development modules to limited roles | Pass |

**Operator verify (manual):**

1. Confirm Platform Mode is Development in Production Governance.  
2. Sign in via Internal Development Access.  
3. Open Sandbox, Seed Platform, Developer Preview, Development Controls, Development Access, Governance — no Access denied.  
4. Confirm Production Owner / PSA creation still available.  
5. Enter Production Mode as PSA — developer menus hide; Dev Admin login suspends.  
6. Return to Development — tooling returns per snapshot.

---

## 7. Completion statement

Development Administrator access is restored for **Platform Mode === Development**, including when a Production Super Admin already exists. Restrictions apply when entering **Production Mode**, preserving Production Super Admin and Launch Centre protections without redesigning governance.
