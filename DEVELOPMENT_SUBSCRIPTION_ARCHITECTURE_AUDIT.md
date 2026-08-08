# DEVELOPMENT SUBSCRIPTION ARCHITECTURE AUDIT

**Phase:** Audit only — no implementation  
**Date:** 2026-07-30  
**Scope:** Developer Technician, Developer Preview, subscription plans, payment verification, entitlement activation, Seed Platform, Platform Mode impact  
**Account under review:** `quikcart2026@gmail.com`

---

## 1. Executive verdict

After governance phases (Platform Mode, Capability Engine, Developer Preview, Seed Platform, Launch Centre, Production Governance), **commercial billing is still a single production path**: one subscription catalogue, one MoMo submit → admin-approve pipeline, one entitlement resolver.

Development does **not** use a separate billing product. It uses **three parallel access sources** that feed the same entitlement engine:

| Access source | Writes `Subscription` / `SubscriptionPayment`? | Purpose |
|---|---|---|
| **Production paid** | Yes | Real MoMo + admin verification |
| **Admin complimentary / activate** | Yes (often amount 0) | Manual grants on same engine |
| **Seed profile stamps** | No | Permanent sandbox QA access |
| **Developer Preview sessions** | No | Temporary simulation of plan entitlements |

**Developer Preview still exists and is live.**  
**There is no separate “development subscription” catalogue or plan code.**  
**Payment validation for real submissions is shared with production** (same models, same uniqueness rules, same admin approve). Preview and Seed intentionally **bypass** payment rather than forking validation.

Observed payment screen (`UGX 45,000`, period tag `yearly`, MTN MoMo, transaction ID, “admin approval — never automatically”) matches the **production manual MoMo UX** on `UpgradePage` + `subscription.service` defaults. Catalogue default for **Starter monthly** is `UGX 45,000`; **Starter yearly** defaults to `UGX 420,000`. Header “RISING LEVEL PRO” is **reputation ladder + Pro chrome**, not a subscription plan name.

---

## 2. Current implementation

### 2.1 Subscription catalogue (single SSOT)

**Authority:** `ensureSubscriptionCatalogue()` in `backend/src/services/marketplace/subscription.service.ts`

| Code | Name | Default monthly / quarterly / half-year / yearly (UGX) |
|---|---|---|
| `FREE` | Free (virtual card; not a billable plan) | 0 |
| `STARTER` | Starter | 45,000 / 120,000 / 240,000 / 420,000 |
| `PROFESSIONAL` | Professional | 85,000 / 230,000 / 450,000 / 800,000 |
| `BUSINESS` | Business | 150,000 / 400,000 / 780,000 / 1,400,000 |

Billing periods: `monthly` | `quarterly` | `half_yearly` | `yearly`.

Models: `SubscriptionPlan`, `Subscription`, `SubscriptionPayment` in `backend/src/models/marketplace/Subscription.ts`.

Discovery / MoMo / reminders are platform settings (`marketplace.subscription_discovery`, `marketplace.subscription_momo`, `marketplace.subscription_reminders`).

### 2.2 How plans are activated

| Path | Trigger | Result |
|---|---|---|
| **Paid** | Technician `submitPayment` → Admin `approvePayment` | `activateSubscriptionForUser` → `Subscription` active + profile stamps + unlock notify |
| **Complimentary** | Admin `manageTechnicianSubscription` (`grant_complimentary` / `activate`) | Same activator |
| **Seed** | Seed Platform generate / upsert | Profile + User `subscriptionPlanCode` + `subscriptionStatus: 'active'` only — **no** `Subscription` document, **no** period end |
| **Developer Preview** | `activatePreviewSession` | `DeveloperPreviewSession` only — **no** billing docs |

Paid access math for profile-based paths: `hasActivePaidAccess()` — `active`/`trialing` with **null `subscriptionPeriodEnd` is treated as paid forever**. Seed developer technician therefore gets perpetual Professional access without a billing row.

### 2.3 Entitlement engine (single SSOT)

**Authority:** `resolveEntitlements(userId)` in `backend/src/services/marketplace/entitlements.service.ts`

Resolution order:

1. Active `DeveloperPreviewSession` → catalogue plan caps, `subscriptionSource: 'developer_preview'`
2. Else `TechnicianProfile` + catalogue + `hasActivePaidAccess` → `subscriptionSource: 'production'`
3. Else Free / restricted entitlements

UI and most gates should use this resolver (quota API, Upgrade/Subscription Centre, dashboards via `entitlementPlanCode`).

### 2.4 Dashboards

`apps/technician/pages/DashboardPage.tsx`:

- Paid + `BUSINESS` → `BusinessDashboardPage`
- Paid + `PROFESSIONAL` → `ProfessionalDashboardPage`
- Else → Free / Starter-style home dashboard (Starter does **not** get a separate dashboard shell)

Developer Preview banner overlays wherever entitlement routing applies.

### 2.5 Developer Preview (still exists)

| Layer | Location |
|---|---|
| Model | `backend/src/models/marketplace/DeveloperPreview.ts` — `PREVIEW_PLAN_CODES`: `STARTER`, `PROFESSIONAL`, `BUSINESS`, `BUSINESS_BOOST` |
| Lifecycle | `developerPreview.service.ts` |
| Settings | `developerPreviewSettings.service.ts` — key `developer_preview_platform` |
| Admin UI | `apps/admin/pages/DeveloperPreviewPage.tsx` |
| Tech UI | `UpgradePage.tsx` preview cards, `DeveloperPreviewBanner.tsx` |
| API | `packages/api/developerPreviewApi.ts` |

**Eligibility gates:** Platform Mode ≠ production; `enablePreview`; not suspended; sandbox enabled (if required); account authorised by email/id **or** `metadata.developer` / `metadata.qa`; sandbox `dataEnvironment`. Default authorised email always includes `quikcart2026@gmail.com`.

**Contract:** Preview never creates Subscription / Payment / Invoice. Real payments and boost purchases are **blocked** while a preview session is active.

### 2.6 Rising Level

**Not a subscription.** Reputation ladder (`Beginner` → `Rising` → …) in trust/reputation UI. Do not conflate with plan codes.

---

## 3. Development account audit — `quikcart2026@gmail.com`

### 3.1 Identity (Seed constants)

Defined in `backend/src/services/sandbox/seed/constants.ts` as `DEVELOPER_TECHNICIAN`:

| Field | Value |
|---|---|
| Email | `quikcart2026@gmail.com` |
| Password (seed) | `FixNowDev!2026` |
| Phone | `+256700202026` |
| Name | Jordan Mutebi |
| seedKey | `developer-technician` |
| Content env | `sandbox` only |

Fixture: `developerTechnicianDef()` in `fixtures.catalog.ts` — plan **`PROFESSIONAL`**, `isDeveloper: true`.

### 3.2 Current role / capabilities / subscription / entitlement source

| Question | Finding |
|---|---|
| **Role** | `technician` (marketplace QA account — not Production Super Admin) |
| **Flags** | `metadata.developer: true`, `metadata.seedKey: 'developer-technician'`, `dataEnvironment: 'sandbox'` |
| **Subscription (seeded)** | Profile/User stamped `PROFESSIONAL` + `active`, typically **no** `subscriptionPeriodEnd` |
| **Entitlement source (default, no Preview)** | `production` path via profile stamps (not a real billing subscription) |
| **Entitlement source (if Preview active)** | Overrides to `developer_preview` for the session duration |
| **Capabilities** | Professional catalogue feature flags / limits via `resolveEntitlements` |
| **Dashboard** | `ProfessionalDashboardPage` when paid + PROFESSIONAL |
| **Preview authorisation** | Always in `authorizedEmails`; also passes `metadata.developer` |
| **Restrictions** | Sandbox content only; Preview/Seed tooling hidden when Platform Mode = production; cannot use Preview in production mode |

### 3.3 Payment flow for this account

Same Upgrade → MoMo → Transaction ID → Admin approve path as production, **except**:

1. If **Developer Preview** is active → `submitPayment` rejects (must exit Preview first).
2. If relying on **Seed stamps** alone → paid access already exists **without** ever submitting payment.
3. Submitting a real payment still creates production `SubscriptionPayment` rows (shared tables) — there is no “dev-only payment collection.”

### 3.4 Platform Mode behaviour

`platformMode.service.ts`:

| Mode Development | Mode Production |
|---|---|
| Developer UX visible (Seed, Preview, Dev Controls, etc.) | Those admin surfaces hidden (except Launch/Governance for Production Super Admin) |
| Preview eligible (other gates permitting) | Preview forced off; all active sessions terminated |
| Sandbox may remain enabled | Sandbox disabled as part of production enter |
| Dev access flags restored from snapshot | Dev login suspended via `applyDevelopmentAccessFlagForPlatformMode` |

The Development Technician account **survives** as sandbox user data; it does not become a production operator. In Production Mode it cannot activate Developer Preview and should not be used as a production commercial identity.

---

## 4. Payment flow trace

```
Select plan (Upgrade catalogue)
        ↓
Payment screen (MoMo network + amount + instructions)
        ↓
Transaction ID + payer phone submit
        ↓
SubscriptionPayment status = pending
Subscription status = pending_payment
Profile subscriptionStatus = pending_payment
        ↓
Admin review (CanManageSubscriptions / PAYMENTS_MANAGE)
        ↓
approvePayment  OR  rejectPayment
        ↓
activateSubscriptionForUser (approve only)
        ↓
Entitlements via resolveEntitlements (production source)
```

### 4.1 Transaction ID validation (current)

Implemented in `submitPayment`:

1. Trim → uppercase → max 120 chars  
2. Minimum length **4**  
3. Uniqueness on `(transactionId, network)` among non-deleted `SubscriptionPayment`  
4. At most **one pending** payment per user  
5. Amount must match catalogue `priceFor(plan, billingPeriod)` within ±1  
6. MoMo config must be enabled; discovery `upgradesEnabled`  
7. Blocked if active Developer Preview  

**There is no automatic MTN/Airtel API verification.** Admin manually confirms the MoMo receipt against the submitted ID, then approves.

### 4.2 Where development diverges from production

| Step | Production tech | Development Technician |
|---|---|---|
| Select plan | Real catalogue | Same catalogue + optional Preview cards |
| Payment screen | MoMo | Same UI |
| Transaction ID | Required for paid unlock | Optional if Seed already stamped paid; blocked during Preview |
| Verification | Admin approve | Same admin queue if submitted |
| Entitlement activation | `activateSubscriptionForUser` | Same **or** Seed stamp **or** Preview session |
| Content | Production `dataEnvironment` | Sandbox |

Boost purchases mirror MoMo + admin approve in a separate collection (`BoostPurchase`), also blocked during Preview; Preview `BUSINESS_BOOST` simulates boost weight only.

Job escrow payments (`payments/payment.service.ts`) are a **different** stack and are out of scope for technician plan billing.

---

## 5. Seed Platform — what it generates

**Entry:** `seedPlatform.generator.ts` / `seedPlatform.service.ts` / Admin Seed Platform / `backend/scripts/seed-platform.ts`

| Generates | Does **not** generate |
|---|---|
| Sandbox users, customers, technicians | `Subscription` documents |
| Jobs F01–F17, offers, ads, reviews, portfolios | `SubscriptionPayment` |
| Profile/User `subscriptionPlanCode` + `subscriptionStatus: 'active'` | Transaction IDs / MoMo records |
| Login hints including developer credentials | `DeveloperPreviewSession` (explicitly deferred / separate Phase 3) |
| Payment reference strings for billing | Demo payment artefacts |

Seed comments and Phase 2 docs state clearly: **profile stamps only — not Preview subscriptions; not payment records.**

---

## 6. Duplicate logic audit

### 6.1 What looks duplicated but is intentional layering

| Concern | Reality |
|---|---|
| Development vs production subscriptions | **No second catalogue.** One plan list. |
| Preview vs real plans | Preview plan codes map onto the **same** catalogue (`BUSINESS_BOOST` → `BUSINESS` + simulated boost). |
| Separate entitlement engines | **No.** One `resolveEntitlements`. |
| Separate payment validators | **No** for real payments. Preview/Seed skip payment instead of cloning validation. |

### 6.2 Real duplication / drift risks

1. **Three entitlement *sources*** (Preview session, Seed stamp, billing Subscription) — one engine, multiple writers into paid access.  
2. **Seed stamps without `Subscription` rows** — Admin Subscription Centre / billing history may disagree with effective entitlements.  
3. **Apply gate drift:** `assertCanApplyToJobs` / `paidAccessOpen` read **profile** `hasActivePaidAccess` and **ignore** active Preview sessions. Quota/UI may show Preview `canApply` while hard apply still fails unless free quota remains or profile is already stamped (Seed developer is stamped, so applies work).  
4. **Boost** is a parallel purchase collection reusing MoMo config (acceptable product split, but second admin queue).  
5. **Job escrow payments** are a third payment domain (customer jobs), not technician subscriptions.

### 6.3 Governance impact summary

| Phase | Effect on Development Technician workflow |
|---|---|
| Seed Platform | Created permanent sandbox tech with Professional stamps |
| Developer Preview | Added simulation path; payments disabled while active |
| Entitlement engine | Unified capability resolution including Preview override |
| Platform Mode / Launch | Production Mode kills Preview + hides developer admin UX |
| Capability Engine | Admin who can approve payments ≠ who can manage Seed/Preview |
| Production Governance | Documented operating overlay; did not invent a second billing product |

---

## 7. Target architecture evaluation

**Proposed target:**

- Single subscription catalogue: Starter / Professional / Business  
- Same dashboards  
- Same entitlement engine  
- Same subscription engine  
- **Different payment verification path only** (for development)

### 7.1 Fit against current code

| Target pillar | Already true? | Gap |
|---|---|---|
| Single catalogue | **Yes** | None |
| Same dashboards | **Mostly** | Starter shares Free shell; Preview uses same shells via plan code |
| Same entitlement engine | **Yes** | Apply-gate Preview drift |
| Same subscription engine | **Yes** for real grants | Seed bypasses engine (stamps only) |
| Different payment verification only | **Not yet** | Dev currently bypasses payment (Seed/Preview) rather than using an alternate verifier on the same payment objects |

### 7.2 Can it be adopted safely?

**Yes, as a consolidation strategy — with constraints:**

**Safe / low-risk**

- Keep one catalogue and one `resolveEntitlements`.  
- Keep one Technician dashboard routing by plan code.  
- Keep MoMo + admin approve as the production verification path.  
- Treat Developer Preview as **simulation chrome**, not a billing product (already designed that way).  

**Requires explicit product decision before coding**

1. **Seed Developer Technician:** Keep perpetual Professional stamps for QA **or** force it through the real subscription engine (complimentary grant) so Admin billing views stay consistent.  
2. **Developer Preview:** Keep as non-payment override **or** retire once Seed + complimentary grants cover plan testing. Do not invent “preview subscriptions” as `Subscription` rows.  
3. **“Different payment verification path only”:** If development must exercise the payment UI without real MoMo money, introduce a **dev verification adapter** (e.g. auto-approve sandbox payments / accept fixture TX IDs) that still writes the **same** `SubscriptionPayment` + `activateSubscriptionForUser` — do **not** create a second catalogue or entitlement matrix.  
4. **Close apply-gate drift** so Preview and profile paid access agree before relying on Preview for apply testing.

**Unsafe / avoid**

- Parallel “development plan” codes or prices.  
- Second entitlement service for sandbox.  
- Seed-generated fake transaction IDs that pollute production payment uniqueness indexes without env scoping.  
- Letting Platform Mode Production leave Preview or Seed payment shortcuts enabled.

### 7.3 Recommended implementation strategy (next phase — not this phase)

1. **Document SSOT:** Catalogue + `resolveEntitlements` + `activateSubscriptionForUser` remain the only commercial cores.  
2. **Classify access sources:** `billing` | `complimentary` | `seed_stamp` | `developer_preview` — expose source in Admin for audit clarity (Preview already exposes `subscriptionSource`).  
3. **Normalize Development Technician (choose one):**  
   - **A (minimal):** Keep Seed stamps; accept no billing row.  
   - **B (aligned to target):** On seed, also create complimentary `Subscription` via existing activator so dashboards/history match entitlements.  
4. **Optional sandbox payment path:** Same `submitPayment` schema; verification adapter gated by Platform Mode = development + sandbox user; still calls `approvePayment` / activator.  
5. **Fix Preview apply gate** to use entitlement SSOT (or document that Preview does not unlock apply).  
6. **Do not redesign** plan matrix, dashboards, or entitlement feature flags in that phase.

---

## 8. Migration impact (if consolidating later)

| Area | Impact |
|---|---|
| Existing Seed profiles with `active` + null end | Continue to resolve as paid forever until reset |
| Existing Preview sessions | Unaffected if kept; terminated on Production Mode enter |
| Existing pending/approved `SubscriptionPayment` | Shared production tables — any sandbox TX uniqueness applies globally per network |
| Admin Subscription UI | May under-report Seed-only techs until complimentary rows exist |
| Technician UX | Little change if catalogue/dashboards unchanged |
| Platform Mode | Already orchestrates Preview/Seed visibility |

No data migration is required for an audit-only stance. A future “complimentary on seed” change would be additive upserts, not catalogue redesign.

---

## 9. Files affected (reference index)

### Core backend

- `backend/src/services/marketplace/subscription.service.ts` — catalogue, MoMo submit/approve, activator, `hasActivePaidAccess`
- `backend/src/services/marketplace/entitlements.service.ts` — entitlement SSOT
- `backend/src/services/marketplace/developerPreview.service.ts` — preview lifecycle / eligibility
- `backend/src/services/marketplace/developerPreviewSettings.service.ts` — kill-switch + authorised emails
- `backend/src/services/marketplace/boost.service.ts` — parallel MoMo purchases
- `backend/src/services/marketplace/freeJob.service.ts` — apply gate / quota (`assertCanApplyToJobs`)
- `backend/src/services/marketplace/job.service.ts` — calls apply gate
- `backend/src/models/marketplace/Subscription.ts`
- `backend/src/models/marketplace/DeveloperPreview.ts`
- `backend/src/services/platform/platformMode.service.ts`
- `backend/src/services/sandbox/seed/constants.ts`
- `backend/src/services/sandbox/seed/fixtures.catalog.ts`
- `backend/src/services/sandbox/seed/seedPlatform.generator.ts`
- `backend/src/services/sandbox/seed/seedPlatform.service.ts`
- `backend/src/services/admin/adminCapabilities.ts`

### Frontend / API

- `apps/technician/pages/UpgradePage.tsx`
- `apps/technician/pages/DashboardPage.tsx`
- `apps/technician/pages/SubscriptionCentrePage.tsx`
- `apps/technician/pages/SubscriptionBillingPage.tsx`
- `apps/technician/components/DeveloperPreviewBanner.tsx`
- `apps/technician/context/AppContext.tsx`
- `apps/admin/pages/SubscriptionsPage.tsx`
- `apps/admin/pages/DeveloperPreviewPage.tsx`
- `apps/admin/pages/SeedPlatformPage.tsx`
- `apps/admin/components/AdminShell.tsx`
- `packages/api/subscriptionsApi.ts`
- `packages/api/developerPreviewApi.ts`
- `packages/api/seedPlatformApi.ts`

### Design history (non-runtime)

- `PHASE_2_DEVELOPER_TESTING_PLATFORM_REPORT.md`
- `PHASE_3_DEVELOPER_PREVIEW_PLATFORM_REPORT.md`
- `PRODUCTION_GOVERNANCE_ARCHITECTURE_REPORT.md`
- `SUBSCRIPTION_PLATFORM_IMPLEMENTATION_REPORT.md`
- `backend/src/services/sandbox/SEED_PLATFORM.md`

---

## 10. Risks

| Risk | Severity | Notes |
|---|---|---|
| Seed perpetual paid access without billing row | Medium | Audits/Admin lists can misread “subscribed” state |
| Preview vs apply-gate inconsistency | Medium | Preview-only accounts may fail hard apply |
| Shared TX uniqueness across envs | Medium | Sandbox test TX IDs can block reuse in production MoMo submissions |
| Hard-coded developer credentials in repo | High (ops/security) | Email/password in seed constants — expected for seed, must never be production login |
| Accidental real payment while testing | Medium | Same MoMo payee defaults (`0770000000`) — manual money can be sent to placeholder numbers |
| Platform Mode misconfiguration | High | Leaving Preview/Seed enabled near production launch |
| Conflating Rising Level with plans | Low | UX header can confuse auditors |
| Price/period display mismatch | Low | Screenshot showed `yearly` + `45,000` (Starter monthly default) — verify UI period binding if reproduced |

---

## 11. Direct answers to audit questions

| Question | Answer |
|---|---|
| How are plans activated? | Admin-approved MoMo payment or admin complimentary/activate; Seed stamps; or Preview session |
| How does manual payment verification work? | Technician submits TX ID → pending → admin approve/reject → activator on approve |
| How are transaction IDs validated? | Format/length, amount match, unique per network, one pending per user — **no** provider API |
| How are development accounts detected? | Seed email/seedKey, `metadata.developer`/`qa`, sandbox env, Preview authorised lists |
| Does Development Preview still exist? | **Yes** |
| Do development subscriptions exist? | **No separate product** — Seed stamps + Preview sessions only |
| Duplicate subscription logic? | Multiple **sources**, one catalogue/engine; apply-gate drift is the main logic split |
| Is payment validation shared with production? | **Yes** for real submits; Preview/Seed skip payment |
| Does Seed generate payments / TX IDs / references / demo payments? | **No** (only profile plan stamps + login hints) |
| Can target architecture be adopted safely? | **Yes**, if Seed/Preview remain non-catalogue bypasses or are folded into complimentary/sandbox verification on the **same** engine — no redesign of plans/entitlements/dashboards required |

---

## 12. Out of scope (this phase)

- No code changes  
- No subscription redesign  
- No entitlement redesign  
- No payment adapter implementation  

---

*End of audit.*
