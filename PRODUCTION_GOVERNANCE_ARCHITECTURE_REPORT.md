# Production Governance Architecture Report

**Phase:** 4.1 — Architectural audit & implementation plan only  
**Date:** 2026-07-29  
**Status:** Audit complete — **do not implement** Production Mode until Phase 4.2+  
**Depends on:** `PLATFORM_RESTRUCTURING_AUDIT_REPORT.md`, Phase 1–3 reports, existing Admin Identity / Bootstrap reports  

---

## 1. Executive summary

FixNow already separates **process environment** (`APP_ENV` / Dev Controls), **content environment** (`dataEnvironment`), and **payment-provider mode**. Sandbox, Seed Platform, Developer Preview, and Admin RBAC are distinct layers with kill-switches. There is **no** platform-wide Production Mode operating state today.

**Production Mode must be designed as an operating state**, not a fourth environment and not a second RBAC system. Changing mode must **hide** developer UX and tooling while **preserving** all development assets (sandbox rows, seed fixtures, preview sessions, demo accounts). Returning to Development Mode restores UX without regenerating data.

**Critical prerequisite:** Production Mode must not become available until a genuine **Production Super Admin** exists (non-demo, non-dev.admin identity) and a Production Readiness checklist passes.

**Do not:** replace AdminUser RBAC, duplicate `dataEnvironment`, delete Sandbox/Seed/Preview systems, or conflate Production Mode with `APP_ENV=production`.

---

## 2. Current admin authentication architecture

### 2.1 Flows

| Path | Mechanism | Entry |
| --- | --- | --- |
| Standard | Email + password → shared `POST /auth/login` | `/admin/login` |
| Bootstrap | Unauthenticated first Super Admin wizard | `/admin/setup` → `POST /admin/identity/bootstrap` |
| Invite accept | Token + password set (no JWT until login) | `/admin/accept-invite` |
| Dev Admin | Passwordless `POST /auth/dev-admin-login` | `/admin/dev` + login card / Ctrl+Shift+D |
| Forgot password | Shared OTP reset | `/admin/forgot-password` |
| Google | **Rejected for `role=admin`** | N/A by design |

### 2.2 Token model

- JWT access + refresh (`sub`, `role`, `typ`, `rv`) — **no** `adminRoleKey` / permissions in the token
- Operator profile loaded from `AdminUser` on `/auth/me` and middleware
- Session invalidation via `refreshTokenVersion` bump

### 2.3 Key files

| Concern | Path |
| --- | --- |
| Middleware | `backend/src/middleware/authenticate.ts` |
| Login / Dev Admin | `backend/src/services/auth/auth.service.ts` |
| Identity / bootstrap / invite | `backend/src/services/admin/adminIdentity.service.ts` |
| Capability engine | `backend/src/services/admin/adminCapabilities.ts` |
| Constants / roles | `backend/src/constants/adminIdentity.ts` |
| Dev Access soft gate | `backend/src/services/admin/developmentAccess.service.ts` |
| Admin app routes | `apps/admin/AdminRoutes.tsx` |
| UI capability mirror | `apps/admin/lib/adminCapabilities.ts` |

### 2.4 Authorization layers (current)

```text
authenticate (JWT → User)
    → authorize(ROLES.ADMIN)          // coarse marketplace role
    → requirePermission(...)          // AdminUser.permissionKeys (+ *)
    → requireCapability(...)          // capability → permission map
    → requireSuperAdmin()             // adminRoleKey === super_admin OR *
```

Frontend: `ProtectedRoute` checks `role === 'admin'` only; `AdminShell` filters nav/pages by capabilities from `/auth/me`.

### 2.5 Weaknesses (must inform Phase 4.2 design)

1. **Many `/admin/*` APIs are only `authorize(ADMIN)`** — UI RBAC hides pages; API may still accept Finance/Support JWTs for sensitive ops.
2. **Public bootstrap race** — concurrent first-run can race before `AdminBootstrapState` is written.
3. **`updatePermissions` weaker than invite** — can apply roles/overrides outside the production invite allowlist, including `*`.
4. **MFA modeled but not enforced** — `ADMIN_REQUIRE_MFA` / model fields exist; login does not require MFA.
5. **Dead permission key `admin.full`** on some routes — catalogue uses `*`.
6. **Demo / Dev Admin credentials** safe only while production env guards hold.

---

## 3. Current authorization hierarchy

### 3.1 Marketplace vs operator identity

- Marketplace role: `User.role = 'admin'`
- Operator profile: `AdminUser.adminRoleKey` + `permissionKeys` + derived `capabilities`

### 3.2 Operator catalogue (today)

| `adminRoleKey` | Intent | Typical scope |
| --- | --- | --- |
| `super_admin` | Full operator | `*` |
| `finance` | Money / subscriptions | payments, refunds, reports, audit |
| `support` | Broad ops + moderation | users, jobs, content, marketing moderation, force logout |
| `operations` | Legacy / seedable | technicians, customers, jobs, categories |
| `marketing` | Offers / promotions | marketing + content |
| `content` | CMS | content.manage |
| `verification` | Trust | verification + technicians |
| `customer_care` | Care | customers, jobs, reset password |
| `auditor` | Read-only | audit + reports |

**Production invite allowlist (`PRODUCTION_ADMIN_ROLES`):** `super_admin`, `finance`, `support` only. Legacy keys remain for older operators.

### 3.3 Capabilities (single engine — keep)

`CanManageFinance`, `CanManageSupport`, `CanManageSubscriptions`, `CanManageUsers`, `CanManageAdmins`, `CanManageSettings`, `CanManageInfrastructure`, `CanManageProviders`, `CanManageAI`, `CanManageContent`, `CanManageMarketing`, `CanViewReports`, `CanViewAudit`, `CanManageDevelopmentAccess`

**Rule:** Super Admin / `*` always passes. `CanManageDevelopmentAccess` is Super Admin / `*` only.

### 3.4 Inheritance model (preserve)

```text
Super Admin (*)
  └─ all capabilities
Finance / Support / … (permissionKeys)
  └─ mapped capabilities via CAPABILITY_PERMISSIONS
UI + (partial) API gates
```

**Phase 4 must extend metadata / classification on this model — not invent a parallel permission matrix.**

---

## 4. Existing Super Admin implementation

### 4.1 What “Super Admin” means today

- `AdminUser.adminRoleKey === 'super_admin'` **or** `permissionKeys` includes `*`
- Can invite other Super Admins; manage Development Access; call `requireSuperAdmin()` routes (sandbox, seed, preview, security, many settings)
- Bootstrap creates Super Admin with `*`

### 4.2 First-run / bootstrap

| Mechanism | Detail |
| --- | --- |
| Status | `GET /admin/identity/bootstrap-status` (public) |
| “Completed” | `AdminBootstrapState` **or** any non-dev active Super Admin **or** any non-dev `AdminUser` |
| Demo exclusion | Emails `@fixnow.demo`, `@example.com`, `@test.local` do not satisfy bootstrap completion |
| Create | Web `/admin/setup` or CLI `npm run bootstrap:super-admin` |
| Side effect | `completeDevelopmentTransition()` — disables Dev Admin soft login (`allowDevLogin=false`) |
| Recovery | One-time bootstrap recovery key (SHA-256 stored; plaintext once) |

### 4.3 Development Super Admin (today, unnamed)

| Identity | `dev.admin@fixnow.demo` (`DEV_ADMIN`) |
| --- | --- |
| Privileges | Super Admin + `*` |
| Login | Passwordless when `ALLOW_DEV_ADMIN_LOGIN` + soft Development Access |
| Production | Env refuses `ALLOW_DEV_ADMIN_LOGIN=true`; account disabled not deleted |

**Gap:** The platform does **not** yet distinguish “Development Super Admin” vs “Production Super Admin” as first-class classifications. Both are `super_admin` with `*`. Production Mode design must add classification **without** breaking existing role keys.

---

## 5. Recommended Production Super Admin architecture

### 5.1 Principle

Keep `adminRoleKey: 'super_admin'`. Add a **governance classification** on `AdminUser` (recommended field name for later implementation):

| Classification | Who | Purpose |
| --- | --- | --- |
| `development` | Dev Admin, temporary staging operators | May use Dev Access, Sandbox tooling when Platform Mode = Development |
| `production` | Real launch operators | May enable Production Mode, promote content, manage live finance/ops |
| `unclassified` / legacy | Existing Super Admins until migrated | Treat as **development** for mode switches until explicitly promoted |

Alternatively (equivalent): `operatorScope: 'development' | 'production'` + `isProductionOperator: boolean`.

**Do not** create `production_super_admin` as a second `adminRoleKey` unless forced — that duplicates RBAC.

### 5.2 First Production Super Admin

**Hard gate for enabling Production Mode:**

```text
EXISTS AdminUser WHERE
  status = active
  AND adminRoleKey = super_admin (or permissionKeys includes *)
  AND classification = production
  AND email NOT IN demo/test domains
  AND email !== DEV_ADMIN.email
```

**Safe introduction paths (choose one primary for Phase 4.2):**

1. **Bootstrap enhancement** — First bootstrap on a production-bound host marks the created Super Admin as `production` (and still runs development transition).
2. **Explicit promotion ceremony** — Existing Super Admin completes a “Designate Production Super Admin” flow (password re-entry + recovery codes + audit) that sets `classification = production` on self or invitee.
3. **Invite path** — Only an already-classified Production Super Admin may invite another `super_admin` with `classification = production`.

**Recommended:** Path 2 for existing deployments + Path 1 for greenfield production hosts. Never allow Dev Admin (`dev.admin@fixnow.demo`) to be classified `production`.

### 5.3 Role of Development Super Admin after launch

- Remains in DB (disabled when Development Access off)
- Invisible in Production Mode UX
- Can be re-enabled only after **return to Development Mode** by a Production Super Admin
- Never used as Production Mode unlock actor

### 5.4 Functional roles under Production Super Admin

Keep existing keys; clarify **operating visibility**:

| Role | Production Mode | Development Mode |
| --- | --- | --- |
| Production Super Admin | Full + mode switch + readiness | Full |
| Finance / Support | Full production ops | Full + may see limited diagnostics if allowed |
| Development Super Admin | Hidden / blocked | Full tooling |
| Developers / QA (technician metadata or authorised lists) | Hidden | Preview / sandbox actors |
| Temporary Admins | Prefer status=`suspended` or short invite TTL; never Production Mode actors | Allowed with audit |

Moderators map to existing `support` / `marketing` / `content` — **do not** invent parallel moderator RBAC.

---

## 6. Production Mode operating model

### 6.1 Definition

**Platform Mode** = operating state stored as PlatformSetting (recommended key: `platform_operating_mode`):

| Value | Meaning |
| --- | --- |
| `development` | Developer UX, Sandbox, Seed, Preview, Dev menus visible (subject to per-system switches) |
| `production` | Developer UX hidden for all non–Production Super Admin surfaces; production assets only |

**Not** the same as:

- `APP_ENV=production` (deployment / process lockdown)
- `dataEnvironment=production` (document visibility)
- Payment provider `live` mode

### 6.2 Behaviour when Platform Mode = `production`

| Layer | Behaviour |
| --- | --- |
| Admin nav | Hide Development Controls, Development Access, Sandbox, Seed Platform, Developer Preview (except Production Super Admin **Launch / Governance** console) |
| Technician / customer UX | No Preview section, no preview badges, no demo login hints |
| APIs | Mutating sandbox/seed/preview/dev-admin endpoints return 403/404 regardless of prior enable flags **or** respect Mode as a master AND with existing switches |
| Content queries | Unchanged taxonomy: guests and production users see production content only (already true) |
| Data | **No deletes** of sandbox/seed/preview/demo rows |
| AI | Production sessions remain production-only; no sandbox retrieval |

### 6.3 Coordination with existing kill-switches

Production Mode should **orchestrate**, not replace:

| Existing key | On enter Production Mode (recommended) |
| --- | --- |
| `sandbox_data_platform.enableSandbox` | Force effective off for UX/API (persist previous value in mode snapshot) |
| `developer_preview_platform.enablePreview` / `suspendPreview` | Suspend / disable effective preview |
| `dev_controls` | Already forced false when `isProductionEnv`; Mode adds UX hide even on staging hosts |
| `admin.development_access.allowDevLogin` | Force false (persist previous) |

**Snapshot pattern:** When switching to Production Mode, store `previousFlags` + timestamp + actor. Returning to Development Mode restores snapshot — no regeneration.

---

## 7. Development Mode operating model

Platform Mode = `development` (default for non-production hosts; explicit on staging).

| Visible | Condition |
| --- | --- |
| Sandbox Management | Super Admin + `enableSandbox` |
| Seed Platform | Same (depends on sandbox enabled) |
| Developer Preview | Settings + authorised sandbox accounts |
| Development Controls / Access | Super Admin |
| Demo / seed actors | Content env filters |
| Developer technician | `quikcart2026@gmail.com` sandbox account |

Underlying data identical whether Mode is production or development; only **visibility and mutability** change.

---

## 8. Public content classification

**Always remain available in Production Mode** (production content bucket + published status):

| Class | Examples | Authority today |
| --- | --- | --- |
| Taxonomy | Categories, category images, service categories | `category.service` + shared catalogue |
| Legal | Privacy, Terms, Cookies, refund, community guidelines, AUP, retention | CMS `ensureDefaults` / published legal |
| Support / trust | Help, FAQ, Contact, About, safety tips, trust/verification | CMS support |
| Marketing public | Approved homepage, welcome, published public CMS | CMS + content blocks |
| Brand | Icons, splash, public avatars endpoints as configured | Static / public APIs |
| SEO / docs | Published CMS slugs, public documentation pages | `/public/content*` |

**Rule:** Production Mode must **not** unpublish or env-reclassify these. Shared-catalogue behaviour (sandbox viewers may also see production CMS/categories) remains; production viewers never see sandbox CMS.

---

## 9. Developer content classification

**Hidden from UX in Production Mode** (data retained):

| Class | Examples |
| --- | --- |
| Tooling menus | Development Controls, Development Access, Sandbox Management, Seed Platform, Developer Preview admin pages |
| Preview product | Upgrade Preview section, preview badges, Exit Preview chrome |
| Demo / seed marketplace | `@fixnow.demo`, `@fixnow.seed`, seed tag `fixnow-seed-platform-v1`, demo tag `sandbox-demo-v1` |
| Actors | Dev Admin, developer technician surfaces as “test”, QA utilities |
| Diagnostics | Dev OTP exposure UI, mock provider toggles, debug log affordances |
| Sessions | Active Developer Preview sessions (terminate on enter Mode optional; or leave dormant — recommend **terminate active** on enter, keep history) |

**AI:** Seed/sandbox account context must not appear in production conversations (already Phase 3 rules).

---

## 10. Production readiness checklist

Production Mode enablement should require **all Critical** items. Store results as `platform_production_readiness` (or embedded in mode service) with timestamps and actor.

### Critical (blocking)

| ID | Check |
| --- | --- |
| R1 | ≥1 active **Production** Super Admin (non-demo) |
| R2 | Bootstrap completed; Dev Admin soft-login off |
| R3 | `ALLOW_DEV_ADMIN_LOGIN` false on production host |
| R4 | Payments / MoMo (or chosen rail) configured for **live** intent |
| R5 | Transactional email configured and verified |
| R6 | Legal: Privacy + Terms published (production CMS) |
| R7 | Categories: minimum live taxonomy complete |
| R8 | Public homepage / welcome published |
| R9 | Auth security: password policy active; refresh invalidation works |
| R10 | No open public bootstrap (completed = true) |

### Important (warn; configurable block)

| ID | Check |
| --- | --- |
| R11 | Push notifications configured |
| R12 | Maps / geolocation keys configured |
| R13 | Cookie policy + contact/help published |
| R14 | Branding / media complete |
| R15 | MFA enrolled for Production Super Admin (when MFA implemented) |
| R16 | Sandbox enableSandbox currently irrelevant (will be overridden) |
| R17 | Active Preview sessions count = 0 or auto-terminate acknowledged |
| R18 | Stripe/MoMo not left in accidental test mode for launch |

### Optional

| ID | Check |
| --- | --- |
| R19 | Audit log retention confirmed |
| R20 | Backup / restore runbook acknowledged |
| R21 | Android + Web release candidates tagged |

**Only when Critical pass** → UI allows “Enter Production Mode”.

---

## 11. Secure mode switching workflow

### 11.1 Enter Production Mode

```text
Actor = Production Super Admin
  → Re-authenticate (password; later MFA)
  → Readiness checklist all Critical = pass
  → Confirmation modal: type PRODUCTION (or similar)
  → Optional: terminate all active Preview sessions
  → Snapshot current kill-switch flags
  → Set platform_operating_mode = production
  → Apply effective flags (sandbox off, preview suspend, dev login off)
  → Write audit: platform.mode.enter_production
  → Append LaunchHistory + ModeTransitionHistory
  → Broadcast / invalidate admin+technician caches (clients refresh)
```

### 11.2 Protections

| Control | Recommendation |
| --- | --- |
| AuthN | Password re-entry; MFA when enforced |
| AuthZ | Production Super Admin only |
| Confirm | Typed phrase + dual acknowledgement of irreversibility of **UX** (data preserved) |
| Rate limit | Strict on mode endpoints |
| Audit | Immutable append-only transition log |
| API | New endpoints under `requireSuperAdmin` **and** classification check — not open `PUT /settings/:key` |

### 11.3 Who can see the Governance console in Production Mode

- Production Super Admin: Launch Status, Readiness, Mode switch, Promote centre, Mode history
- Finance / Support: normal production ops only
- Development Super Admin: no login / disabled

---

## 12. Returning to Development Mode

**Only Production Super Admin.**

```text
Re-authenticate (+ MFA later)
  → Confirmation: type DEVELOPMENT
  → Set platform_operating_mode = development
  → Restore snapshot flags (sandbox, preview, development access)
  → Do NOT regenerate Seed / Demo / Preview history
  → Do NOT delete production content
  → Audit: platform.mode.return_development
  → Append ModeTransitionHistory + RollbackHistory
```

**Restored UX:** Sandbox, Seed, Preview, Dev menus, QA tools, Developer Technician, demo jobs/customers — **as previously stored**.

**Optional safety:** Require a second Production Super Admin approval (four-eyes) for return-to-development on live customer traffic hosts.

---

## 13. Security recommendations

| Priority | Recommendation |
| --- | --- |
| P0 | Close coarse `authorize(ADMIN)`-only gaps on destructive admin APIs before or with Mode launch |
| P0 | Mode transitions never via generic settings PUT |
| P0 | Classify Production Super Admin; exclude Dev Admin and demo emails |
| P1 | Enforce MFA for Production Super Admin (wire `ADMIN_REQUIRE_MFA`) |
| P1 | Fix bootstrap race (transactional lock / unique bootstrap state) |
| P1 | Tighten `updatePermissions` to same allowlist as invite |
| P1 | Mode history + launch history + rollback history (queryable in Admin) |
| P2 | Remove / alias dead `admin.full` permission |
| P2 | Four-eyes for leave-Production on production hosts |
| P2 | Alerting on mode transitions (email to Production Super Admins) |

**Principle:** Production Mode hides development assets; it is **not** a substitute for content-environment isolation or for fixing RBAC API gaps.

---

## 14. Files likely to change (future implementation — not this phase)

| Area | Likely touchpoints |
| --- | --- |
| Mode service | New `platformOperatingMode.service.ts` (or under `services/platform/`) |
| Settings | PlatformSetting keys: `platform_operating_mode`, readiness, transition history model |
| Admin identity | `AdminUser` classification field; bootstrap / invite / promote-operator flows |
| Middleware | `requireProductionSuperAdmin`, `assertPlatformMode`, tighten existing admin routes |
| Admin UI | Governance / Launch page; conditional nav hide in `AdminShell.tsx` |
| Routes | `/admin/governance/*` or `/admin/settings/production-mode` |
| Capabilities | Optional `CanManagePlatformMode` mapped **only** to Production Super Admin (or reuse Super Admin + classification) |
| Preview / Sandbox / Seed | Read Mode in eligibility / `assertSandboxEnabled` / admin page guards |
| Technician Upgrade | Hide Preview section when Mode = production |
| AI context | Add `platformMode` to `SafeAiRoleContext` |
| Web + Android | Same API; Capacitor inherits web Admin/Technician builds — no native Mode store |
| Auth | MFA enrollment/enforcement; Dev Access remains separate soft gate |

**Explicitly avoid changing:** `dataEnvironment` taxonomy, entitlement engine SSOT, Seed generator semantics, Preview session model shape (except terminate-on-enter).

---

## 15. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Confusing Mode with `APP_ENV` | Accidental data deletion or wrong lockdown | Document triad; Mode only orchestrates flags |
| Treating Mode as RBAC | Duplicate permissions | Classification overlay only |
| Entering Mode without Production Super Admin | Lockout / Dev Admin as “production” | Hard readiness gate R1 |
| Hiding public CMS | Legal/support outage | Public content allowlist |
| Promote-as-move | Loss of sandbox originals | Keep clone-only; expand promote types carefully |
| Incomplete API RBAC | Hidden UI ≠ secure API | P0 capability/permission pass |
| Snapshot restore bugs | Sandbox “lost” after return | Test restore; never delete on enter |
| Staging with Mode=production | Blocks QA | Allow Development Mode on staging; readiness optional there |
| Active Preview during enter | Confusing entitlements | Auto-terminate + audit |

---

## 16. Final implementation roadmap

### Phase 4.1 — **This document** (complete)

Architecture audit only. No Production Mode code.

### Phase 4.2 — Production Super Admin + readiness (no Mode switch yet)

1. Add operator classification without breaking `adminRoleKey`
2. Ceremony to designate first Production Super Admin
3. Readiness checklist service + Admin UI (read-only gates)
4. MFA foundation for Production Super Admins
5. Begin closing coarse admin API authorization gaps

### Phase 4.3 — Platform Mode switch (orchestration)

1. `platform_operating_mode` + snapshot/restore
2. Enter / leave workflows with audit + history
3. Admin nav + technician Preview visibility
4. Terminate Preview on enter; preserve Seed/Sandbox data
5. AI `platformMode` awareness

### Phase 4.4 — Promotion centre expansion

1. Keep **clone, never move**
2. Extend beyond `TechnicianOffer` to promotions, banners, content blocks, CMS (published drafts), templates — each with review status on production clone
3. Categories: publish/promote unpublished only via clone or explicit publish in production bucket

### Phase 4.5 — Hardening

1. Four-eyes leave-Production
2. Launch history dashboard
3. Automated readiness probes (email/push/maps)
4. Android/Web parity QA matrix for Mode

---

## Interaction map (target — no duplicates)

```text
                    ┌─────────────────────────┐
                    │  Platform Mode          │
                    │  development|production │
                    │  (operating state)      │
                    └───────────┬─────────────┘
                                │ orchestrates
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 sandbox_data_platform   developer_preview_platform   admin.development_access
        │                       │                       │
        ▼                       ▼                       ▼
 Content env filters      Entitlement Preview      Dev Admin login
 (dataEnvironment)        sessions                 (unchanged identity)
        │
        ▼
 Public CMS / Categories  ← always production-visible when published
```

**Authentication / RBAC:** unchanged engines; + Production classification + Mode AuthZ.  
**Seed / Preview / Sandbox:** unchanged systems; Mode visibility + effective kill-switches.  
**AI / Search:** continue Phase 1–3 env isolation; Mode adds “developer UX off” only.  
**Android / Web:** shared backend Mode; clients refresh entitlements and admin nav from API.

---

## Completion criterion

This audit is complete: Production Governance is fully documented so Phase 4.2+ can implement Platform Mode **without** disrupting existing authentication, authorization, RBAC, Sandbox, Seed Platform, or Developer Preview systems — by treating Production Mode as an **operating-state overlay** that preserves data, orchestrates existing switches, and requires a genuine Production Super Admin plus readiness checks before launch.

**Next step when authorised:** Phase 4.2 implementation (classification + readiness), still without enabling a live Mode switch until checklist and AuthZ hardening land.
