# Production Mode Implementation Report

**Phase:** 4.2 — Production Super Admin & Platform Mode  
**Date:** 2026-07-29  
**Depends on:** `PRODUCTION_GOVERNANCE_ARCHITECTURE_REPORT.md` (Phase 4.1)  
**Status:** Implemented — operating-state overlay; **no** dataEnvironment merge; **no** asset deletion  

---

## 1. PlatformModeService architecture

| Item | Detail |
| --- | --- |
| Service | `backend/src/services/platform/platformMode.service.ts` |
| Settings key | `platform_operating_mode` |
| Modes | `development` \| `production` (single active mode) |
| History model | `PlatformModeTransition` (`backend/src/models/platform/PlatformModeTransition.ts`) |
| Public API | `GET /public/platform-mode` (optional auth) |
| Admin API | `/admin/governance/*` |

**Responsibilities:** current mode, history, switch validation, PSA permission checks, visibility orchestration (snapshot/restore of Sandbox / Preview / Dev Access flags), audit logging, short mode lock (`MODE_LOCK_MS`).

**Not responsible for:** Content Environment filters, entitlements math, Seed generators (unchanged).

```text
Platform Mode (operating state)
    orchestrates → sandbox_data_platform
                 → developer_preview_platform
                 → admin.development_access
Content Environment (dataEnvironment) remains orthogonal
```

---

## 2. Production Super Admin implementation

| Item | Detail |
| --- | --- |
| Field | `AdminUser.governanceClassification`: `development` \| `production` \| `unclassified` |
| RBAC | Unchanged — still `adminRoleKey: super_admin` + `*` |
| Middleware | `requireProductionSuperAdmin()` |
| Dev Admin | Forced `governanceClassification: 'development'` in `ensureDevAdmin` |
| `/auth/me` | Exposes `governanceClassification`, `isProductionSuperAdmin` |

**Authority (Production Super Admin):** switch Platform Mode, create/designate Production Owner path, suspend effective Sandbox/Preview/Dev Access via Mode, promote sandbox offers while Mode is Production.

**Development Super Admin:** continues Seed / Sandbox / Preview / Dev Controls when Mode = Development; cannot enter/leave Production Mode.

---

## 3. First Production Owner workflow

| Surface | Path |
| --- | --- |
| Wizard UI | `/admin/production-owner` → `ProductionOwnerPage` |
| Create API | `POST /admin/governance/production-owner` (rate-limited; public only until PSA exists) |
| Designate self | `POST /admin/governance/designate-production-owner` (authenticated Super Admin) |

**Collects:** full name, business email, recovery email, recovery phone, strong password, MFA intent acknowledgement, confirmation.

**Gates:** Demo / `dev.admin@fixnow.demo` emails rejected. Refuses if a Production Super Admin already exists.

**Audit:** `admin.production_owner.created` / `.designated`.

Production Mode **cannot** be entered until `hasProductionSuperAdmin()` is true.

---

## 4. Platform Mode lifecycle

### Enter Production

1. Actor must be Production Super Admin  
2. Type `PRODUCTION` + second confirmation  
3. Optional MFA token when `ADMIN_REQUIRE_MFA` and profile `mfaEnabled`  
4. Snapshot Sandbox / Preview / Dev Access flags  
5. Force `enableSandbox=false`, Preview suspend/off, Dev Access off  
6. Terminate active Developer Preview sessions  
7. Persist mode = `production`, lock window, transition history + audit  

### Return to Development

1. Production Super Admin only  
2. Type `DEVELOPMENT` + second confirmation  
3. Restore snapshot flags (no regenerate / reseed)  
4. Mode = `development`, history + audit  

**Never deleted:** sandbox rows, seed fixtures, preview session history docs, demo users, AI conversations, companies, media.

---

## 5. Visibility rules

| Audience | Development Mode | Production Mode |
| --- | --- | --- |
| Admin developer menus | Visible (capability-gated) | Hidden; redirect to Governance |
| Production Governance | Visible | Visible |
| Technician Preview section | Eligible accounts | Not eligible (`evaluatePreviewEligibility`) |
| Sandbox mutators | `assertSandboxEnabled` | Forbidden (data preserved) |
| Promote (offers) | Sandbox enabled | PSA may still clone without enabling Sandbox UX |

---

## 6. Public content rules

Unchanged delivery paths — Production Mode does **not** unpublish or re-bucket:

- Categories / category images  
- Published CMS (legal, help, about, contact, FAQ, homepage, etc.)  
- Content blocks / approved banners in **production** content env  
- Production companies, portfolios, offers, ads, reviews  

Guests and production users continue to see production shared-catalogue content (Phase 1).

---

## 7. Developer content rules

Hidden from UX in Production Mode (stored):

- Development Controls, Development Access, Sandbox Management, Seed Platform, Developer Preview admin pages  
- Developer Preview upgrade cards / badges / sessions (terminated on enter)  
- Demo / seed marketplace actors remain invisible to production viewers via `dataEnvironment` (unchanged)

---

## 8. Rollback workflow

`returnToDevelopmentMode` restores the pre-enter snapshot. Transition records `snapshotRestored: true`. No Seed/Demo regeneration.

---

## 9. Android synchronization

Android uses the same backend APIs and Capacitor web surfaces. `GET /public/platform-mode` and Preview eligibility drive visibility — **no** native Mode store or platform-specific Mode logic.

---

## 10. AI behaviour

`context.manager.ts` adds `platformMode` and `developerUxVisible`.

In Production Mode prompts: never recommend Seed jobs, Sandbox technicians, Developer Preview, developer menus, or Development Controls. Content retrieval still inherits Phase 1 env filters.

---

## 11. Security implementation

| Control | Implementation |
| --- | --- |
| Permission | `requireProductionSuperAdmin` on mode transitions |
| Confirmation | Typed phrase + `confirmAgain` |
| Mode lock | ~2 minutes after each switch |
| Audit | `platform.mode.enter_production` / `return_development` + permanent `PlatformModeTransition` |
| MFA hook | Required when `env.adminRequireMfa` and operator has `mfaEnabled` |
| Owner create | Rate-limited; demo emails blocked |

---

## 12. Validation

| Check | Status |
| --- | --- |
| Production Mode requires Production Super Admin | Yes |
| Hides developer Admin UX | Nav `developerOnly` + route redirect |
| Public / legal / categories remain | Content env unchanged |
| Sandbox data preserved | Flags forced off; no deletes |
| Return restores snapshot | Yes |
| Android / Web same APIs | Yes |
| AI respects Platform Mode | Yes |
| No subscription/payment created by Mode | Yes |

---

## 13. Remaining work for Phase 4.3+

1. **Production Readiness checklist** — automated probes (payments, email, push, maps, legal) before allowing Enter  
2. **Four-eyes** leave-Production on live hosts  
3. **Promotion centre expansion** — clone beyond `TechnicianOffer`; `productionApproved` markers for banners/blocks  
4. **Full MFA enrollment UX** for Production Owner  
5. **Close coarse `authorize(ADMIN)` API gaps** (Phase 4.1 P0)  
6. **Bootstrap race lock**  
7. **Tighten `updatePermissions`** to invite allowlist  
8. **Alerting** on mode transitions (email to Production Super Admins)  
9. E2E matrix (Web + Android) for Mode switch / Preview hide / restore  

---

## Key files

| Area | Paths |
| --- | --- |
| Mode service | `platformMode.service.ts`, `PlatformModeTransition.ts` |
| Owner | `productionOwner.service.ts`, `ProductionOwnerPage.tsx` |
| Admin UI | `ProductionGovernancePage.tsx`, `AdminShell.tsx`, `AdminRoutes.tsx` |
| Auth / model | `Admin.ts` (`governanceClassification`), `auth.service.ts`, `authenticate.ts` |
| Visibility | `sandboxSettings.service.ts`, `developerPreview.service.ts`, `sandbox.service.ts` (promote) |
| AI | `context.manager.ts` |
| Client | `packages/api/platformModeApi.ts` |

---

## Completion criterion

The platform can switch Development ↔ Production Mode without deleting development assets; only a verified Production Super Admin can transition; public production content remains available; Sandbox / Seed / Preview systems are orchestrated, not replaced.
