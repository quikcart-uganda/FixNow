# FixNow Platform Restructuring Audit Report

**Document type:** Analysis only — no implementation, no refactor, no deletions.  
**Date:** 2026-07-29  
**Scope:** Backend, frontend apps (customer / technician / admin), Capacitor Android, shared packages, subscription & entitlement engines, AI, seed scripts, configuration.

---

## 1. Executive summary

FixNow has grown through many incremental phases. The result is a **partially coherent platform** with three overlapping “testing” concepts that look similar but are not the same:

| Concept | What it actually is today |
| --- | --- |
| **Process environment** (`NODE_ENV` / `APP_ENV`) | Deploy / feature-flag layer (dev OTP, mock providers, production lockdown) |
| **Content environment** (`dataEnvironment`) | Tags rows in a **single MongoDB** as `production \| sandbox \| development \| demo \| archived` |
| **Payment provider sandbox** | Stripe / MoMo / etc. test rails — unrelated to content isolation |

**What works:** Sandbox Management (Admin), demo data generator, entitlement engine as SSOT for many feature gates, technician/job list filtering by `dataEnvironment`, AI prompt awareness of env, Dev Controls / Dev Access.

**What does not exist (despite docs / expectations):** A real **Developer Subscription Preview** (plan-switch cards, temporary entitlements without billing). That is documented as a *next phase*, not shipped code.

**Highest risks:** Incomplete query isolation (offers, ads, promotions, boosts, admin directories, some get-by-id paths can leak demo into production discovery); marketing seed writing **untagged** (production-bucket) data; demo techs stamped “paid forever” without `Subscription` documents; three divergent paid-access checkers; Android has **no** sandbox/preview sync.

**Restructuring goal:** One clear mental model — process env vs content env vs subscription testing — with central query enforcement, honest demo subscriptions, and a single Developer Preview path that uses the real entitlement engine.

---

## 2. Current architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Process layer (APP_ENV / NODE_ENV / Dev Controls)           │
│  OTP · mock providers · admin login · production hard-lock  │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Single MongoDB (e.g. FixNow)                                │
│  Rows optionally tagged: dataEnvironment                     │
│  Untagged / default = production                             │
└───────┬─────────────────────┬───────────────────┬───────────┘
        │                     │                   │
   Sandbox demo           Marketing seed      Live users
   (@fixnow.demo          (often UNTAGGED     (production)
    + sandbox-demo-v1)     → production bucket)
        │                     │                   │
        └──────────┬──────────┴─────────┬─────────┘
                   │                    │
         Entitlement engine      Incomplete filters
         (profile plan stamps)   (offers/ads/boosts/…)
```

**Apps:** Customer, Technician, Admin (web) + Capacitor Android (shared web bundle; admin deep links blocked on native).

**Subscription path:** `SubscriptionPlan` catalogue → MoMo / Admin complimentary → `activateSubscriptionForUser` → profile fields → `resolveEntitlements`.

**Sandbox path:** Admin Sandbox Management → demo generator stamps `dataEnvironment` + plan codes on profiles (often **without** `Subscription` docs).

---

## 3. Current sandbox implementation

### Core modules (used)

| File | Purpose | Dependencies | Behaviour |
| --- | --- | --- | --- |
| `backend/src/constants/dataEnvironment.ts` | Taxonomy + promotable types | Models | Content tags orthogonal to `APP_ENV` |
| `backend/src/services/sandbox/dataEnvironment.ts` | Filters, actor env, cross-env assert | User | Untagged ≈ production; blocks some cross-env actions |
| `backend/src/services/sandbox/sandbox.service.ts` | Admin control centre | Demo generator, settings | Overview, CRUD lifecycle, export, analytics; promote mostly stubbed |
| `backend/src/services/sandbox/demoData.generator.ts` | Static UG demo set | User/Customer/Tech/Job/Offer | 4 customers, 12 techs, 10 jobs; password `SandboxDemo!2026` |
| `backend/src/services/sandbox/sandboxSettings.service.ts` | Enable/hide sandbox | PlatformSetting | Default enable when not production |
| `backend/src/services/sandbox/avatarLibrary.ts` | DiceBear catalogue | CDN | Public `/public/avatars` |
| Controllers + `routes/index.ts` | Sandbox REST | Super-admin | Wired |
| `packages/api/sandboxApi.ts` | Client | HTTP | Wired |
| `apps/admin/pages/SandboxManagementPage.tsx` | Admin UI | sandboxApi | Used |

### Related (not the same as data sandbox)

| File | Purpose | Status |
| --- | --- | --- |
| `backend/src/services/platform/devControls.service.ts` | Dev OTP / mock providers / debug | Used; production locked off |
| `apps/admin/pages/DevelopmentControlsPage.tsx` | UI for flags | Used |
| `backend/src/services/admin/developmentAccess.service.ts` | Dev-admin login | Used |
| `apps/admin/pages/DevelopmentAccessPage.tsx` | UI | Used |
| Payment `sandbox\|live` in `env.ts` | Provider test rails | Used; orthogonal |
| `backend/src/middleware/devFeature.ts` | `requireDevFeature` / `blockInProduction` | **Partial:** `requireDevFeature` unused |

### Unused / incomplete / duplicate

- **`enableTestAccounts`:** Admin toggle with **no runtime consumer**.
- **Promote-to-production:** Only `TechnicianOffer` implemented; other promotable types throw not-implemented.
- **Two demo user sources:** Sandbox generator vs `seed-marketing.ts` (same `@fixnow.demo` domain, different tags / isolation).
- No `isSandbox` / `isDemo` / `isSeed` booleans — string `dataEnvironment` + metadata only.

---

## 4. Current preview implementation

**Finding: Developer Subscription Preview is not implemented.**

`SUBSCRIPTION_UPGRADE_EXPERIENCE_REPORT.md` lists Developer Subscription Sandbox as a **next phase**. There are no preview cards, temporary entitlement overrides, or UI-only plan switches.

### Closest substitutes

| Mechanism | Creates real `Subscription`? | Uses entitlement engine? | Notes |
| --- | --- | --- | --- |
| Admin complimentary / activate | **Yes** | **Yes** | Correct production path |
| MoMo → admin approve | **Yes** | **Yes** | Correct |
| Sandbox demo plan stamps | **No** | **Yes** (via profile) | Looks paid forever; no period end |
| Upgrade page plan cards | N/A | Reads live catalogue | Shopping UI only |

### Weaknesses

1. QA cannot “try Professional for 15 minutes” without mutating accounts.  
2. Demo “subscriptions” are dishonest for billing/timeline UX.  
3. Frontend `AppContext` / dashboard routing recompute paid status from profile strings (drift vs engine + grace).  
4. Confusion between CMS Live Preview, Sandbox Management “preview”, and imagined Subscription Preview.

---

## 5. Current seed data

| Source | Generates | Static/dynamic | Quality / gaps |
| --- | --- | --- | --- |
| `demoData.generator.ts` (Admin API) | 4 customers, 12 techs, 10 jobs, applications, offers, avatars | Static | No Review entities, no Subscription docs, no portfolios, no AI chats; inflated rating fields |
| `backend/scripts/seed-marketing.ts` | Categories, promos, sponsored, offers, notifications, sample users | Static (+ DiceBear) | Refuses production CLI; **does not set `dataEnvironment`** → production bucket |
| `seed-ux-content.ts` | Banner repairs, content blocks | Static | Idempotent |
| `seed-visual-assets.ts` | Cloudinary catalog + remounts | Dynamic | Needs credentials |
| `seed-admin-catalogue.ts` | Admin permissions/roles | Service | No operators |
| `content.seed.ts` / `contentBlock.seed.ts` | CMS / marketing copy | Static | Boot defaults |
| `ensureSubscriptionCatalogue()` | STARTER / PRO / BUSINESS plans | Runtime bootstrap | Preserves admin edits |
| AI conversations | — | Missing | No marketplace AI seed |

**Reusable?** Yes for local/dev. **Not safe** to run marketing seed against a shared DB without env tagging.

---

## 6. Environment handling

### Exists

- **Process:** `development | staging | production | test` via `APP_ENV` / `NODE_ENV` (`backend/src/config/env.ts`).  
- **Content:** `production | sandbox | development | demo | archived` (`dataEnvironment`).  
- **Enforcement:** Partial service-level filters + `assertSameDataEnvironment` on some writes (e.g. job apply).  
- **Storage:** Same Mongo URI; field on documents via `dataEnvironmentPlugin` in `models/shared/base.ts`.  
- **Settings:** `PlatformSetting('sandbox_data_platform')`, `PlatformSetting('dev_controls')`.

### Does not exist

- Separate QA database or host.  
- Client-side environment switcher (`VITE_APP_ENV` content switch).  
- Full automatic mongoose middleware applying filters on every marketplace read.  
- Wiring of `hideSandboxFromReports` into main Admin Reports (sandbox analytics only).

### Naming collision

Process `development` and content `development` / `demo` / `sandbox` use similar words for different layers — a primary source of developer confusion.

---

## 7. AI environment awareness

### Strengths

- Role context loads user `dataEnvironment` (`context.manager.ts`).  
- Prompts instruct not to cross-claim environments.  
- Customer tools can pass env into technician search.  
- Pending-action summaries can label env.

### Gaps

| Issue | Impact |
| --- | --- |
| Guest AI forced `production` | Cannot demo sandbox via Guest Mode |
| Prompt ≠ query enforcement | If tools call unscoped offer/ad APIs, demo data can appear |
| `getPublicProfile` / `getById` without env gate | ID-known sandbox entities readable |
| `AiPendingAction` schema | No top-level `dataEnvironment` plugin field |
| `cross_env_blocked` audit | Typed but unused |

**Risk:** AI can mention or retrieve demo technicians/jobs if IDs leak or unscoped tools return mixed feeds — despite prompt rules.

---

## 8. Subscription preview analysis

| Question | Answer |
| --- | --- |
| How does preview work? | **It doesn’t** as a product; only real activations + demo profile stamps |
| Creates subscriptions? | Admin/MoMo: yes. Demo stamps: **no** |
| UI-only? | Upgrade cards are catalogue UI, not entitlement overrides |
| Bypasses engine? | Demo stamps **feed** the engine; they don’t bypass it — they fake inputs |
| Complete? | **No** |
| Weaknesses | Forever-active demo paid state; no expiry; no temp grants; frontend drift |

---

## 9. Entitlement engine analysis

### Canonical path

`resolveEntitlements(userId)` in `backend/src/services/marketplace/entitlements.service.ts`:

1. Load `TechnicianProfile`  
2. Resolve `SubscriptionPlan` by `subscriptionPlanCode`  
3. `hasActivePaidAccess(profile, grace)`  
4. Merge plan flags/limits or free defaults  
5. Derive capabilities (`canApply`, offers, ads, marketing, …)  
6. Assert helpers for offer/media/creative gates  

### Duplicate permission logic

| Location | Drift |
| --- | --- |
| `entitlements.service` + `hasActivePaidAccess` | Grace-aware — **canonical** |
| `freeJob.service` `paidAccessOpen` | No grace |
| `apps/technician/context/AppContext.tsx` | Local recompute; no grace |
| `DashboardPage.tsx` | Status string + plan code for shell |

**Preview does not hardcode a parallel flag table** into the engine. Risk is **duplicate clients of truth**, not a second engine.

---

## 10. Database findings

- Nearly all domain models via `createSchema` get **`dataEnvironment`** (indexed, default production).  
- **Exceptions:** `AiPendingAction` (raw schema, env only in payload); nested subdocs inherit via parent.  
- **No** `isSandbox` / `isDemo` / `isSeed` fields.  
- Soft-delete (`isDeleted`) is orthogonal.  
- Future stubs in `models/future/Future.ts` are tagged but product-dead.  
- Legacy `Promotion` in Growth likely superseded by `PlatformPromotion`.  
- `IUser` TS interface may omit `dataEnvironment` despite schema presence.

---

## 11. Search isolation findings

| Surface | Env-filtered? | Leak risk |
| --- | --- | --- |
| Technician search | Yes (viewer env; guests → production) | Low for list |
| Technician public by ID | No | Medium (ID oracle) |
| Job lists / nearby | Yes | Low |
| Job apply | Cross-env assert | Low |
| Job getById | No | Medium |
| Offers public / home | **No** | **High** — demo offers in production discovery |
| Promotions / ads / sponsored | **No** | **High** |
| Boost ranking | **No** | Medium–High |
| Admin tech/customer lists | **No** | Ops pollution |
| Content blocks | No | Low–Medium |
| Subscription catalogue | Shared (by design) | Plans are global |

---

## 12. Android synchronization findings

| Capability | Web | Android |
| --- | --- | --- |
| Sandbox Management | Admin web | **Blocked** (`deepLinks` rewrite `/admin` → `/`) |
| Content env switch | Via logged-in user only | Same API; **no native switcher** |
| Dev Controls / seed | Admin web | Not in app |
| Subscription preview | Not built | Not built |
| CORS Capacitor origins | Non-prod allowlist | `app.fixnow.local` hostname |

**Verdict:** Android is a consumer of the same API. Isolation = which account is logged in. No sync of sandbox/preview/developer tooling with native chrome.

---

## 13. Duplicate code inventory

- Admin capabilities maps: frontend + backend.  
- Marketing UI: banners / sponsored / ads overlap.  
- Offer moderation page + queue wrappers.  
- Paid-access checks: entitlements vs freeJob vs AppContext.  
- Demo users: sandbox generator vs marketing seed (`@fixnow.demo`).  
- Process vs content “development” naming.  
- CMS Live Preview vs Sandbox “preview” vocabulary collision.

---

## 14. Dead code inventory (report only — do not delete yet)

| Item | Notes |
| --- | --- |
| `requireDevFeature` middleware | Never mounted |
| `enableTestAccounts` consumers | None |
| `cross_env_blocked` AI audit | Typed, unused |
| `Future.ts` collections | Reserved, almost no services |
| Legacy `Promotion` model | Likely superseded |
| Dynamic Pricing admin page | Stub |
| Incomplete promote handlers | Throw not-implemented |
| Root `*_AUDIT*.md` / completion reports | Doc debt (not runtime) |

---

## 15. Mock data inventory

| Item | Classification |
| --- | --- |
| Console email/SMS/push/payment providers | **Safe** (dev) |
| `ENABLE_MOCK_PROVIDERS` / Dev Controls | **Safe** intent |
| `scripts/_helpers/mocks.mjs` | **Safe** (test helper) |
| Demo password in generator + API overview | **Needs replacing** before shared/prod |
| DiceBear avatars as “people” | **Safe** for demo; replace for launch realism |
| Content seed default copy | **Safe** |
| Plan default constants in Subscription model | **Safe** (overridable) |
| Company team placeholder page | **Safe** intentional |
| Profile `reviewCount` without Review rows | **Needs replacing** for reviews QA |
| Frontend hardcoded technician demo arrays | **Not found** (API-driven) |
| Dynamic Pricing placeholder | **Dead/stub** |
| Dual marketing/sandbox demo users | **Duplicate** |

---

## 16. Risks

1. **Discovery leakage** — untagged / unfiltered offers, ads, promotions, boosts pollute production Home.  
2. **Marketing seed pollution** — writes production-bucket rows on shared Mongo.  
3. **Fake forever-paid demos** — engine trusts profile stamps; billing timeline lies.  
4. **Triple paid-access logic** — grace expiry UX can disagree with API.  
5. **Shared demo password** returned to Super Admins when sandbox enabled.  
6. **AI over-trust** — prompt rules without universal tool filters.  
7. **Incomplete promote** — operators may believe promote is production-ready.  
8. **Android / Guest cannot exercise sandbox** — DX hole for mobile QA.  
9. **Building a second preview system** without retiring stamps will duplicate debt.

---

## 17. Recommended restructuring plan

### What should stay

- Dual-layer idea: process env ≠ content env.  
- `resolveEntitlements` as SSOT.  
- Sandbox Management admin module + demo generator (cleaned).  
- Dev Controls / Dev Access (process-layer).  
- Real MoMo + Admin complimentary activation path.

### What should merge

- Sandbox `demo` vs `development` content tags → one **sandbox** bucket (or strict hierarchy).  
- Marketing seed + sandbox generator → one **Seed Platform** that always stamps `dataEnvironment`.  
- Three paid-access helpers → one shared function used by freeJob + AppContext.

### What should disappear (later implementation)

- Forever profile stamps without `Subscription` docs.  
- Untagged marketing seed.  
- Dead toggles (`enableTestAccounts` without consumers) or wire them.  
- Future unused collections or quarantine them.  
- Vocabulary “preview” for CMS device frames vs subscription testing.

### What should become platform services

1. **DataEnvironmentQuery** — central filter / plugin for all marketplace reads.  
2. **SeedOrchestrator** — idempotent, env-tagged, sectioned seeds.  
3. **DeveloperPreviewService** — temporary plan grants that create **real** short-lived `Subscription` docs (or explicit preview subscriptions) feeding the **same** entitlement engine.  
4. **PromoteService** — complete handlers or remove stubs from UI.

### What should become admin modules

- Sandbox + Seed (merged UX).  
- Subscriptions (keep) + Developer Preview panel (new).  
- Dev Controls (keep, clearly labeled “process flags”).  
- Reports with `hideSandboxFromReports` actually wired.

### What should become environment-aware

- Offers, marketing feeds, boosts, admin directories, get-by-id, AI tools, guest mode (optional sandbox guest for QA).

---

## 18. Implementation roadmap (no code in this audit)

### Phase A — Close leaks (highest priority)

1. Apply `dataEnvironment` filters to offers, promotions, ads, boosts, admin directories, getById/public profile.  
2. Force marketing seed to stamp `sandbox` (or refuse without `--env=`).  
3. Wire `hideSandboxFromReports` into main reports.

### Phase B — Single source of paid access

1. Export one `hasActivePaidAccess` used everywhere.  
2. Align AppContext + freeJob with grace rules.  
3. Demo generator creates proper `Subscription` docs with period ends.

### Phase C — Developer Preview (real product)

1. Admin/tech “Preview as Professional / Business” → temporary subscription via engine.  
2. Auto-expire; audit log; never promote preview subs.  
3. No parallel hardcoded flag tables.

### Phase D — Seed platform + AI + Android DX

1. Unified seed catalogue (jobs, reviews, portfolios, AI samples).  
2. AI tools inherit query middleware; emit `cross_env_blocked`.  
3. Optional “Sandbox account” deep link for Android QA (still same API).

### Phase E — Cleanup

1. Remove or quarantine dead Future models / unused middleware / stubs.  
2. Rename taxonomies to kill process/content word collision.  
3. Docs: one architecture page replacing conflicting audit reports.

---

## 19. Estimated implementation difficulty

| Phase | Difficulty | Effort (rough) | Risk |
| --- | --- | --- | --- |
| A — Leak closure | Medium | 1–2 weeks | High impact; must regression-test Home |
| B — Paid-access unify | Medium | 3–5 days | Touches apply + lock UX |
| C — Developer Preview | Medium–High | 1–2 weeks | Must not fork entitlements |
| D — Seed + AI + Android DX | High | 2–3 weeks | Data quality + guest policy |
| E — Cleanup | Low–Medium | 1 week | Mostly deletions after substitutes |

**Overall:** Medium–High. Schema already has tags; the hard part is **consistent enforcement** and **not inventing a second entitlement path**.

---

## 20. Files likely to be modified during restructuring

### Backend

- `backend/src/services/sandbox/dataEnvironment.ts`  
- `backend/src/services/sandbox/sandbox.service.ts`  
- `backend/src/services/sandbox/demoData.generator.ts`  
- `backend/src/services/marketplace/offer.service.ts`  
- `backend/src/services/marketplace/marketing.service.ts` (or equivalent feed)  
- `backend/src/services/marketplace/boost.service.ts`  
- `backend/src/services/marketplace/entitlements.service.ts`  
- `backend/src/services/marketplace/subscription.service.ts`  
- `backend/src/services/marketplace/freeJob.service.ts`  
- `backend/src/services/marketplace/technician.service.ts`  
- `backend/src/services/marketplace/job.service.ts`  
- `backend/src/services/admin/admin.service.ts`  
- `backend/src/services/ai/**` (context, tools, orchestration)  
- `backend/src/models/ai/AiPendingAction.ts`  
- `backend/scripts/seed-marketing.ts` (+ related seeds)  
- `backend/src/routes/index.ts` / controllers for preview APIs  

### Frontend / shared

- `apps/admin/pages/SandboxManagementPage.tsx`  
- `apps/admin/pages/SubscriptionsPage.tsx`  
- `apps/admin/pages/DevelopmentControlsPage.tsx`  
- `apps/technician/context/AppContext.tsx`  
- `apps/technician/pages/UpgradePage.tsx` / dashboards  
- `packages/api/sandboxApi.ts` / `subscriptionsApi.ts`  

### Android / native

- `packages/native/deepLinks.ts` (only if exposing limited sandbox QA entry)  
- Capacitor config / CORS already env-aware — likely minor  

### Docs

- Replace conflicting reports with one architecture source of truth (this audit is the baseline).

---

## Proposed development strategy (why better)

**Target model**

1. **Process env** = how the server is deployed and which *engineering* switches exist.  
2. **Content env** = which *rows* an actor may see; enforced centrally on every marketplace read/write.  
3. **Developer Preview** = first-class temporary subscriptions that go through `resolveEntitlements` — never parallel hardcoded flags.  
4. **Seed Platform** = one generator, always tagged, sectioned (customers, jobs, reviews, offers, AI), promotable via explicit Admin action.  
5. **Promotion to production** = copy/transform tagged sandbox rows → production with audit; incomplete stubs removed from UI until ready.  
6. **AI** = inherits the same query middleware; guest defaults stay production unless an explicit sandbox guest session is created for QA.  
7. **Android** = same rules via API; optional deep link into sandbox *accounts*, not a second native sandbox stack.

**Why better than today**

- Ends the illusion that schema tags equal isolation.  
- Ends fake paid demos that break billing honesty.  
- Ends three paid-access implementations.  
- Makes Subscription Preview a thin UX over the real engine (no second system).  
- Makes seed data reusable and safe on shared databases.  
- Gives subsequent implementation prompts a single map — avoiding duplicate sandboxes, dead previews, and hidden debt.

---

## Appendix A — Developer experience today (confusion map)

| Goal | Current path | Confusion |
| --- | --- | --- |
| Test Professional / Business | Stamp demo tech or Admin grant | Looks like preview; is mutation |
| Test Boost / Ads / Offers | Live admin + tech UI; seed-marketing | Demo may appear on customer Home |
| Test applications / jobs | Demo create/apply | Apply gated; lists partly mixed |
| Test payments | Mock providers + payment sandbox modes | Word “sandbox” means three things |
| Test AI | Guest (always production) or logged-in user | Guest never sees sandbox |
| Test on Android | Log into same demo user | No admin/sandbox tooling on device |

---

## Appendix B — Audit completeness checklist

| Part | Covered |
| --- | --- |
| 1 Sandbox implementation | Yes |
| 2 Subscription preview | Yes (absent + substitutes) |
| 3 Entitlement engine | Yes |
| 4 Seed data | Yes |
| 5 Mock data | Yes |
| 6 Environment isolation | Yes |
| 7 Database tagging | Yes |
| 8 Search isolation | Yes |
| 9 AI awareness | Yes |
| 10 Admin | Yes |
| 11 Android | Yes |
| 12 Developer experience | Yes |
| 13 Code quality | Yes |
| 14 Restructuring opportunities | Yes |
| 15 Proposed strategy | Yes |

---

*End of analysis. No code was modified. No models created. No deletions performed. Implementation should proceed only from an explicit follow-up prompt against this report.*
