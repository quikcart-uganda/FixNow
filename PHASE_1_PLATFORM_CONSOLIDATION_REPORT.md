# Phase 1 — Platform Foundation Consolidation Report

**Date:** 2026-07-29  
**Source of truth:** `PLATFORM_RESTRUCTURING_AUDIT_REPORT.md`  
**Scope:** Consolidate Process Environment vs Content Environment, central query enforcement, close marketplace leaks, keep entitlement SSOT, harden marketing seed, prepare seed plug-ins — **without** Developer Preview / seed-technician / demo-subscription product work.

---

## Verdict

Phase 1 consolidation is complete as a **stable foundation**. Existing sandbox / content-environment systems are wired through one enforcement module; audit-identified discovery leaks are closed at the service layer; entitlements remain the permission authority; marketing seed cannot silently write the production content bucket. No Developer Preview plans, temporary subscriptions, or new seed-technician product were introduced.

---

## 1. Files modified (Phase 1)

### Content environment & sandbox

| File | Change |
| --- | --- |
| `backend/src/services/sandbox/dataEnvironment.ts` | Documented Process vs Content; `applyDataEnvironment`, `resolveViewerDataEnvironment`, `assertDocumentVisibleToViewer`, `applySharedCatalogueEnvironment` |
| `backend/src/services/sandbox/sandbox.service.ts` | Honest promote errors; `promoteImplemented` / `promoteUnimplemented` on overview |
| `backend/src/services/sandbox/SEED_PLATFORM.md` | Future generator plug-in map (no redesign) |
| `backend/scripts/seed-marketing.ts` | Requires `--env=` / `SEED_DATA_ENVIRONMENT`; refuses production; stamps `dataEnvironment` |
| `apps/admin/pages/SandboxManagementPage.tsx` | Promote N/A labels; implemented vs unfinished promote copy |
| `packages/api/sandboxApi.ts` | Overview types for promote honesty fields |

### Marketplace / marketing leak closure

| File | Change |
| --- | --- |
| `backend/src/services/marketplace/job.service.ts` | Env assert on `getById`; list/apply use env helpers |
| `backend/src/services/marketplace/technician.service.ts` | Env assert on public profile; search filtered |
| `backend/src/services/marketplace/admin.service.ts` | Customer/technician lists default production; `?dataEnvironment=` override |
| `backend/src/services/marketplace/boost.service.ts` | Purchase ranking filtered by viewer env; eligibility via `hasActivePaidAccess` |
| `backend/src/services/marketing/offer.service.ts` | Public list / home / getPublic env-scoped |
| `backend/src/services/marketing/marketing.service.ts` | Promo/sponsored delivery env-scoped + `viewerUserId` |
| `backend/src/services/marketing/technicianMarketingCreative.service.ts` | Customer deliver env-scoped |
| `backend/src/services/marketplace/category.service.ts` | Shared-catalogue env filter |
| `backend/src/services/content/contentBlock.service.ts` | Delivery env-scoped |
| `backend/src/services/content/content.service.ts` | Public CMS list/search/slug env-scoped |
| `backend/src/services/reviews/review.service.ts` | Public technician reviews gated by tech env |
| `backend/src/services/portfolio/portfolio.service.ts` | Public portfolio gated by tech env |
| `backend/src/services/messaging/message.service.ts` | Cross-env messaging blocked; conversation stamped |
| `backend/src/controllers/index.ts` | Passes `viewerUserId` into marketing/CMS delivery |

### Entitlement consolidation

| File | Change |
| --- | --- |
| `backend/src/services/marketplace/freeJob.service.ts` | `paidAccessOpen` → thin alias of `hasActivePaidAccess` (grace-aware) |
| `backend/src/services/marketplace/boost.service.ts` | Removed local paid-status recompute |
| `apps/technician/context/AppContext.tsx` | Apply gate from `/technicians/me/quota`; exposes `hasActiveSubscription` |
| `apps/technician/pages/DashboardPage.tsx` | Shell routing uses server quota paid flag (not raw status strings) |

### AI (inherit backend filters — no redesign)

AI tools already pass `userId` / `dataEnvironment` into marketplace services via `asQueryRequest`. Guest AI resolves to **production**. Retrieval now inherits the same getById / search / catalogue gates above (prompt text is supplementary only).

---

## 2. Environment architecture after consolidation

```text
PROCESS ENVIRONMENT (APP_ENV / NODE_ENV / Dev Controls)
  development | staging | production | test
  Owns: OTP, mock providers, deployment locks, developer login flags
  Modules: config/env.ts, platform/devControls.service.ts, developmentAccess

CONTENT ENVIRONMENT (document.dataEnvironment)
  production | sandbox | development | demo | archived
  Owns: marketplace visibility in the shared MongoDB
  Module: services/sandbox/dataEnvironment.ts  ← single authority for query helpers

PAYMENT PROVIDER MODE (Stripe/MoMo sandbox|live)
  Orthogonal — not content isolation
```

**Rules**

- Guests / unauthenticated → Content Environment **production**.
- Authenticated actors → their user `dataEnvironment` (metadata fallback).
- Admin workforce lists → **production by default**; explicit `?dataEnvironment=` for QA.
- Shared catalogues (categories, CMS blocks/pages) → production never sees sandbox; sandbox-like viewers may see **own + production** via `applySharedCatalogueEnvironment` (explicit exception for platform taxonomy/CMS).
- Discovery surfaces (technicians, jobs, offers, ads, boosts) → **strict** env match (no production↔sandbox bleed).

---

## 3. Query enforcement architecture

**Central module:** `backend/src/services/sandbox/dataEnvironment.ts`

| Helper | Use |
| --- | --- |
| `dataEnvironmentFilter(env)` | Mongo clause (untagged ≈ production) |
| `applyDataEnvironment(filter, env)` | Merge into marketplace queries |
| `applySharedCatalogueEnvironment` | Categories / CMS only |
| `resolveUserDataEnvironment` / `resolveViewerDataEnvironment` | Actor → env |
| `assertDocumentVisibleToViewer` | getById / public profile (404, not 403) |
| `assertSameDataEnvironment` | Writes / messaging / apply |
| `documentDataEnvironment` | Normalize doc tag |
| `parseAdminEnvironmentQuery` | Admin overrides |

Services should **not** hand-roll `dataEnvironment: 'sandbox'` checks. Call these helpers.

---

## 4. Remaining duplicate systems

Left intentionally (stability > aggressive delete):

| Item | Status |
| --- | --- |
| Sandbox demo generator vs marketing seed (`@fixnow.demo`) | Both valid; different tags; coordinated via seed contract |
| Admin capability maps (FE + BE) | Unrelated to content env; Phase 2+ if needed |
| `paidAccessOpen` alias in freeJob | Deprecated wrapper — redirects to SSOT |
| Profile plan stamps without `Subscription` docs (demo) | Still feeds engine; honest Subscription seeding is Phase 2+ |
| `hideSandboxFromReports` | Exists on settings; full Admin Reports wiring still incomplete |
| Process `development` vs content `development` naming | Documented; rename deferred |

---

## 5. Deprecated / quarantined components

| Item | Action |
| --- | --- |
| `freeJob.service` `paidAccessOpen` | `@deprecated` → `hasActivePaidAccess` |
| Boost local paid check | Removed; uses `hasActivePaidAccess` |
| AppContext local paid recompute | Replaced by quota API (fallback only while loading) |
| Sandbox promote for non-offer types | Throws clear “not implemented”; UI shows Promote N/A |
| `requireDevFeature` / `enableTestAccounts` | Still unused — not deleted (Phase 1: quarantine by neglect) |

---

## 6. Remaining work for Phase 2

Explicitly **out of Phase 1** (do not start here accidentally):

1. Developer Preview subscriptions / temporary entitlements.
2. Seed Technician product + honest Subscription documents for demos.
3. Full promote-to-production handlers beyond `TechnicianOffer`.
4. Promotion / ads UX redesign.
5. Separate QA database (if desired).
6. Wire `hideSandboxFromReports` into main Admin Reports aggregates.
7. Retire or merge dual `@fixnow.demo` seed sources.
8. Optional mongoose global plugin for automatic env filters (today: service-layer enforcement).

---

## 7. Validation evidence

| Criterion | Evidence |
| --- | --- |
| Process vs Content separation | Header docs in `dataEnvironment.ts`; Process remains in env/devControls |
| Marketplace queries enforce env | Offers, ads, boosts, techs, jobs, admin lists, categories, CMS, reviews, portfolio, messages |
| Audit leaks closed | Offers/promos/ads/boosts/admin/public profile/job getById/search/guest→production/AI tools inherit services |
| Entitlement SSOT | `resolveEntitlements` + `hasActivePaidAccess` kept; duplicates redirected |
| AI inherits backend filters | Tools call env-aware services; guest forced production in context manager |
| Marketing seed safety | Missing `--env=` exits; production refused; rows stamped |
| Android = Web | No native sandbox screens; same APIs / filters by logged-in account |
| Sandbox Management works | Overview/settings/demo lifecycle unchanged; promote honesty improved |
| No Developer Preview shipped | No preview plans, temp grants, or seed-tech product code |

### Suggested manual smoke (ops)

1. Production user Home → no `@fixnow.demo` / sandbox offers or ads.
2. Sandbox demo login → sees sandbox jobs/techs; not production workforce.
3. `npx tsx scripts/seed-marketing.ts` without `--env=` → refuses.
4. Admin Customers/Technicians → production-only unless `?dataEnvironment=sandbox`.
5. Technician Dashboard → paid shell follows `/technicians/me/quota`, not raw status alone.
6. Sandbox UI → Promote only on offers; other sections show Promote N/A.

---

## Explicit non-goals confirmed

- No Developer Preview plans  
- No temporary subscriptions  
- No Developer / Seed Technician product  
- No sandbox subscription redesign  
- No promotion redesign  

Phase 1 ends here: a coherent platform foundation ready for the Developer Seed Platform and Developer Preview work in later phases without parallel permission or environment systems.
