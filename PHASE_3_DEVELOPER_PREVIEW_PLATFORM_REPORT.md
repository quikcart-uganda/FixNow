# Phase 3 — Developer Preview Platform Report

**Date:** 2026-07-29  
**Depends on:** `PHASE_1_PLATFORM_CONSOLIDATION_REPORT.md`, `PHASE_2_DEVELOPER_TESTING_PLATFORM_REPORT.md`, `PLATFORM_RESTRUCTURING_AUDIT_REPORT.md`  
**Scope:** Temporary entitlement sessions (Developer Preview), Upgrade page integration, AI environment awareness, boost simulation, Admin controls, launch kill-switch — **without** recreating Sandbox, Seed Platform, or Environment Management.

---

## Verdict

Phase 3 is complete. Authorised developer / QA sandbox accounts can activate Preview Starter, Professional, Business, and Business + Boost as **temporary entitlement sessions**. The real entitlement engine resolves those sessions; production Subscription / Payment / Invoice documents are never created. Admin can enable, suspend, authorise, terminate, and fully disable Preview for production launch without code deletion.

---

## 1. Preview Session architecture

```text
Upgrade / Admin
      ↓
developerPreview.service  (eligibility → activate / exit / terminate)
      ↓
DeveloperPreviewSession   (Mongo — temporary only)
      ↓
entitlements.service.resolveEntitlements
      ↓  (if active session)
entitlementsFromPlanCode(cataloguePlan) + preview metadata
      ↓
Quota · Dashboard · Marketing · Boost ranking · AI context · getMine
```

| Concern | Location |
| --- | --- |
| Session model | `backend/src/models/marketplace/DeveloperPreview.ts` |
| Settings (kill-switch) | `backend/src/services/marketplace/developerPreviewSettings.service.ts` |
| Lifecycle service | `backend/src/services/marketplace/developerPreview.service.ts` |
| Entitlement hook | `backend/src/services/marketplace/entitlements.service.ts` |
| Tech + Admin API | `developerPreviewController` + `/subscriptions/developer-preview/*`, `/admin/developer-preview/*` |
| Client API | `packages/api/developerPreviewApi.ts` |

### Session fields (and nothing else)

- Developer account (`userId`, `email`)
- Selected preview plan (`STARTER` | `PROFESSIONAL` | `BUSINESS` | `BUSINESS_BOOST`)
- Environment (`sandbox` / sandbox-like)
- `activatedAt` / `expiresAt`
- `activeBoosts`
- Session metadata + `aiContext`
- Status: `active` | `ended` | `expired` | `terminated`

**Never created:** Subscription, Payment, Invoice, Renewal, Receipt, subscription history.

Settings key: `developer_preview_platform`  
Default authorised email: `quikcart2026@gmail.com` (Phase 2 developer technician).

---

## 2. Temporary entitlement lifecycle

1. **Eligibility** — Preview enabled, not suspended, Sandbox platform on (when required), account authorised (email / id / `metadata.developer` / `metadata.qa`), account content env is sandbox-like.
2. **Activate** — End any prior active session for the user → create new `DeveloperPreviewSession` → audit log.
3. **Resolve** — `resolveEntitlements` checks active session first → maps `BUSINESS_BOOST` → catalogue `BUSINESS` + `activeBoosts`.
4. **Experience** — Quota, dashboards, menus, marketing capabilities, boost ranking, AI context refresh from entitlement output.
5. **Exit / expire / terminate** — Session status closed → next resolve uses production profile subscription again. Profile / billing documents untouched.

`getMine` while previewing:

- Returns `subscription: null` (does not fabricate a Subscription DTO)
- Hides payments and renewal reminders
- Marks timeline `simulationOnly` / `subscriptionSource: 'developer_preview'`
- Blocks `submitPayment` for preview actors

---

## 3. Upgrade page integration

Extended existing `apps/technician/pages/UpgradePage.tsx` only (no second page).

Layout:

1. **Production Plans** — Free / Starter / Professional / Business (real checkout)
2. **Developer Preview** — Simulation Only cards (Preview Starter / Professional / Business / Business + Boost)

Section visibility: `developerPreviewApi.availability().eligible` (Sandbox enabled + authorised account + Preview enabled).

Activation navigates to dashboard after `refreshProfile()` so Pro/Business shells remount from entitlement plan codes.

Subscription Centre + `DeveloperPreviewBanner` show badge, plan, and Exit Preview; payment history is hidden during preview.

---

## 4. AI environment awareness

`backend/src/services/ai/context/context.manager.ts` now includes:

| Field | Purpose |
| --- | --- |
| `dataEnvironment` | Content isolation (Phase 1) |
| `subscriptionSource` | `production` \| `developer_preview` |
| `previewActive` / `previewPlanCode` | Temporary session |
| `seedPlatform` / `sandboxAccount` | Phase 2 flags |

Prompt rules:

- Preview → simulation only; sandbox marketplace tools; never claim production billing
- Non-production env → never leak sandbox into production advice
- Production → never retrieve/mention sandbox/seed records

Retrieval still inherits Phase 1 `dataEnvironment` filters — prompt text is supplementary.

---

## 5. Search isolation

Unchanged authority: Phase 1 Content Environment enforcement.

Developer Preview does **not** invent a second search index. Eligible accounts are sandbox content accounts; jobs, technicians, companies, offers, promotions, and ads resolve through existing env-scoped services. Production search remains unreachable from Preview actors.

---

## 6. Boost preview

`BUSINESS_BOOST` sets `activeBoosts: true` on the session.

- Entitlement engine grants Business catalogue capabilities
- `boost.service.resolveBoostContributions` injects temporary spotlight/featured/promotion weight when `ent.preview.activeBoosts`
- Boost **purchases** are blocked while `subscriptionSource === 'developer_preview'`
- No `BoostPurchase` document is required for simulation

---

## 7. Admin controls

Route: `/admin/settings/developer-preview`  
Page: `apps/admin/pages/DeveloperPreviewPage.tsx`  
Nav: Admin Shell → Platform → Developer Preview  
Capability: `CanManageInfrastructure` (API: Super Admin)

Controls:

- Enable / Suspend Preview
- Allow Developers / Allow QA
- Require Sandbox
- Enable/disable individual plans
- Authorise emails
- Default duration hours
- View active sessions + terminate one / all
- Analytics counters (active + total sessions)
- Launch copy: disable Preview (+ Sandbox / Seed) for production-only mode

---

## 8. Launch transition strategy

When FixNow goes production-only, Admin disables (no redeploy / no feature deletion):

1. Developer Preview (`enablePreview = false` or suspend)
2. Developer / QA access lists as needed
3. Seed Platform generation
4. Sandbox Environment master switch

Code paths remain; settings fail closed. Production subscriptions continue as the only real subscriptions.

---

## 9. Validation

| Check | Result |
| --- | --- |
| `quikcart2026@gmail.com` can activate every Preview plan | Eligible by default authorised email + `metadata.developer` + sandbox account |
| Production technicians cannot see Preview | Eligibility fails without auth + sandbox; Upgrade section gated on `eligible` |
| Preview uses real entitlement engine | `resolveEntitlements` → `entitlementsFromPlanCode` |
| Professional / Business unlock immediately | Dashboard routes on entitlement plan + paid flag from quota |
| Boost preview works | Session `activeBoosts` → ranking injection; purchases blocked |
| AI recognises Preview | Context + prompt lines |
| Search isolated | Sandbox content env (Phase 1) |
| Seed jobs isolated | Phase 2 seed tag + env filters |
| Exit restores production | Session ended → production entitlement source |
| Android / Web sync | Shared API + Capacitor webview; same endpoints |
| No subscription / payment records | Activate path only writes `DeveloperPreviewSession` |

---

## 10. Remaining technical debt

1. **Preview analytics** — counters only; no funnel charts or cohort export yet.
2. **Session history UI** — Admin overview lists active sessions; full history API exists (`?history=true`) but is not a dedicated table yet.
3. **Realtime push** — Activation relies on client `refreshProfile` / navigation; optional socket event for multi-tab sync not added.
4. **Starter Preview dashboard** — Starter still uses Free shell chrome with paid entitlements; Pro/Business get dedicated shells.
5. **Manual E2E** — Automated Playwright/Detox coverage for Preview activate/exit matrix not added in this phase.
6. **Production default** — `enablePreview` defaults off when `env.isProductionEnv`; confirm ops runbook before first prod deploy.

---

## Production safety summary

Developer Preview **cannot**:

- Create payments / invoices
- Modify production subscriptions or renewal dates
- Write billing history
- Alter production analytics documents via session create
- Search or recommend production marketplace rows (sandbox account + Phase 1 filters)
- Instruct AI to treat sandbox data as production

Production subscriptions remain the only real subscriptions.

---

## Key files touched (Phase 3)

| Area | Files |
| --- | --- |
| Model / settings / service | `DeveloperPreview.ts`, `developerPreviewSettings.service.ts`, `developerPreview.service.ts` |
| Entitlements / quota / boost / getMine | `entitlements.service.ts`, `jobCompletion.service.ts`, `boost.service.ts`, `subscription.service.ts` |
| AI | `context.manager.ts` |
| Routes / controllers | `routes/index.ts`, `controllers/index.ts` |
| Technician UI | `UpgradePage.tsx`, `SubscriptionCentrePage.tsx`, `DeveloperPreviewBanner.tsx`, dashboards, `AppShell.tsx`, `AppContext.tsx` |
| Admin UI | `DeveloperPreviewPage.tsx`, `AdminRoutes.tsx`, `AdminShell.tsx`, `adminCapabilities.ts` |
| API package | `developerPreviewApi.ts` (+ exports) |

---

**Completion criterion:** The dedicated developer technician can freely switch Preview Starter / Professional / Business / Business + Boost via the real entitlement engine inside Sandbox; production subscriptions, payments, analytics, and customer data stay isolated; Admin can disable the entire capability centrally without code changes.
