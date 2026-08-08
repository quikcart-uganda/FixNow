# Technician Free Jobs / Monetization Audit

**Date:** 2026-07-28  
**Scope:** Read-only investigation of FixNow’s existing free-job quota, locks, subscriptions, payments, admin controls, and technician UX.  
**Constraint:** No product or code changes in this pass — establish current state and a production-ready path forward.

---

## Executive verdict

| Question | Answer |
|----------|--------|
| How are free jobs tracked? | On `TechnicianProfile`: `freeJobsUsed`, `freeJobLimit`, `remainingFreeJobs` (+ platform setting `marketplace.free_jobs`) |
| When does quota decrease? | **On job completion only** (`consumeFreeJobSlot` when status → `COMPLETED`) |
| What happens at zero? | Apply + accept blocked (403); browse/notifications still allowed; profile auto-locks if `lockAfterLimit`; upgrade screen exists but **cannot charge** |
| Paid subscription live? | **No** — models + stub routes + marketing UI only (“Available soon” / Phase 2) |
| Job escrow payments live? | **Yes** — MTN / Airtel / Flutterwave / etc. for **job escrow**, not plan billing |

**Critical product inconsistency:** Backend meters **completed jobs**. Much of the technician UI copy says **“applications”**. Frontend also treats `remainingFreeJobs <= 0` as locked for applying — so behaviour matches **completed-job quota**, not application quota. Copy and Locked/Upgrade messaging must be aligned before monetization ships.

---

## 1. Current implementation

### 1.1 Core service

**File:** `backend/src/services/marketplace/freeJob.service.ts`

| Function | Role |
|----------|------|
| `getFreeJobConfig` / `ensureFreeJobSetting` | Reads/writes `PlatformSetting` key `marketplace.free_jobs` |
| `assertCanApplyToJobs` | Throws 403 if suspended, `accountLocked`, or `remainingFreeJobs <= 0` |
| `canViewCustomerContact` | True only if unlocked and remaining > 0 |
| `consumeFreeJobSlot` | Increments used, recomputes remaining, optionally locks |
| `adminOverrideFreeJobs` | Admin set limit/remaining + unlock |
| `requestTechnicianUnlock` | Technician unlock request → notify admins |

**Platform config defaults**

```ts
{ enabled: true, defaultLimit: 20, lockAfterLimit: true }
```

When `enabled === false`, **consume is a no-op**, but apply checks still use `remainingFreeJobs` / lock flags (config disable is incomplete).

### 1.2 Enforcement points (`job.service.ts`)

```
Customer posts job (POSTED)
        ↓
Technician notified / browses nearby  → canApply flag from canViewCustomerContact
        ↓
Technician opens job                 → contact hidden if no quota
        ↓
Technician applies                   → assertCanApplyToJobs (+ profile completion %)
        ↓
Customer accepts application         → assertCanApplyToJobs again on assignee
        ↓
Work progresses…
        ↓
Customer confirms COMPLETED          → consumeFreeJobSlot(assignedTechnician)
```

| Event | Quota check? | Quota consumed? |
|-------|--------------|-----------------|
| View / browse | Soft (`canApply`) | No |
| Apply | **Hard** `assertCanApplyToJobs` | No |
| Accept / assign | **Hard** `assertCanApplyToJobs` | No |
| Start work | No | No |
| Complete | No (already assigned) | **Yes** |
| Escrow payment success | No | No |

### 1.3 Consume logic (evidence)

On `COMPLETED`:

- `freeJobsUsed += 1`
- `jobsCompleted += 1`
- `remainingFreeJobs = max(0, freeJobLimit - freeJobsUsed)`
- If `lockAfterLimit` and remaining ≤ 0 → `accountLocked`, `lockReason = 'Free job limit reached'`, profile `accountStatus → locked`
- Socket: `FREE_JOB_LIMIT_UPDATED` / lock events + notifications to tech and admins

### 1.4 Frontend lock model

**File:** `apps/technician/context/AppContext.tsx`

```ts
isLocked = accountStatus === 'locked' || remainingFreeJobs <= 0
canApply = !isLocked
```

Apply buttons on Jobs feed / Job details disabled when `!canApply`; locked users directed to `/technician/locked` and `/technician/upgrade`.

---

## 2. Database fields involved

### 2.1 `TechnicianProfile` (`backend/src/models/technician/Technician.ts`)

| Field | Default | Purpose |
|-------|---------|---------|
| `freeJobsUsed` | 0 | Consumed slots |
| `freeJobLimit` | 20 | Cap |
| `remainingFreeJobs` | 20 | Denormalized remaining |
| `accountLocked` | false | Soft lock for free-job / manual |
| `lockReason` | — | e.g. free limit / admin |
| `unlockRequestedAt` / `unlockRequestNote` | — | Unlock request |
| `accountStatus` | active | Includes `locked` |
| `subscriptionPlanCode?` | — | Placeholder; **not enforced** |
| `leadCredits` | 0 | Referral/lead stub |
| `jobsCompleted` / `jobsCancelled` | — | Stats (`jobsCancelled` rarely updated) |

### 2.2 `User` (`backend/src/models/auth/User.ts`)

| Field | Notes |
|-------|--------|
| `subscriptionPlanCode?` | Denormalized stub |
| `subscriptionStatus` | `none` \| `trialing` \| `active` \| `past_due` \| `cancelled` \| `expired` — **not wired to free-job gate** |
| `loyaltyPoints` | Separate from free jobs |
| `lockUntil` | Login brute-force lock — **not** free-job lock |

**Auth middleware** gates on **User** status, not `TechnicianProfile.accountLocked`. Auto free-job lock updates the **profile** primarily — User status may stay ACTIVE unless admin unlock path syncs it. Technicians can still authenticate while profile-locked.

### 2.3 Future / unused models (`backend/src/models/future/Future.ts`)

| Model | Fields (high level) | Status |
|-------|---------------------|--------|
| `SubscriptionPlan` | code, price, billingPeriod, freeJobLimitBonus, leadCreditsIncluded… | Schema only |
| `Subscription` | userId, planId, planCode, status, period start/end… | Schema only |
| `LeadPurchase` | technicianUserId, jobId, creditsSpent, amountPaid… | Schema only |

### 2.4 Platform settings

| Key | Shape |
|-----|--------|
| `marketplace.free_jobs` | `{ enabled, defaultLimit, lockAfterLimit }` |

### 2.5 Not found

`billingStatus`, `activePlan`, `trialJobs`, `jobsUsed` (as named), `remainingJobs` (as named), invoice collection for subscriptions.

---

## 3. Current technician experience

| Capability | Status | Where |
|------------|--------|--------|
| Remaining free jobs meter | **Yes** | `FreeJobsMeter`, AppShell, Dashboard |
| Locked state screen | **Yes** | `/technician/locked` |
| Upgrade marketing page | **Yes** (CTAs **disabled**) | `/technician/upgrade` — Pro Starter / Growth / Elite, “Available soon” |
| Request unlock | **Yes** (API) | `POST /technicians/me/unlock-request` |
| Plan name / paid status | **No real plan** | Shows free used/limit only |
| Billing / invoice history | **No** | Earnings/wallet = job payouts only |
| Apply gated when exhausted | **Yes** | AppContext + JobCard / JobDetails |
| Browse / notifications when locked | **Yes** (by design) | LockedPage copy |

**Copy drift (must fix before monetization)**

| Surface | Says | Reality |
|---------|------|---------|
| Dashboard / some meters | “applications” / “completed jobs remaining” mixed | Decrement on **completion** |
| UpgradePage | “free applications remaining” | Same |
| LockedPage | “Free monthly capacity” / “Completed jobs” | Quota is **lifetime-style counter**, not calendar month (no period reset in code) |

There is **no automatic monthly reset** of free jobs in the current implementation.

---

## 4. What happens after free jobs finish

Verified behaviour when `remainingFreeJobs` hits 0 (and/or `accountLocked`):

| Behaviour | Happens? |
|-----------|----------|
| Nothing | No |
| Warning only | No — hard block |
| Technician blocked from applying | **Yes** (API 403 + UI) |
| Technician blocked from being accepted | **Yes** (`accept` re-checks) |
| Hidden from search entirely | **No** evidence of full hide |
| Cannot receive notifications | **No** — still allowed |
| Can browse jobs | **Yes** |
| Customer contact hidden | **Yes** (`canViewCustomerContact`) |
| Forced upgrade / checkout | **Partial** — routed to Upgrade, **cannot pay** |
| Crash | **No** |

Admin path after lock: Free Job Settings / Locks / technician unlock → restores access (unlock may grant ~25% of limit if remaining was 0).

---

## 5. Existing subscription / payment infrastructure

### 5.1 Subscriptions — **partial / unused**

| Piece | State |
|-------|--------|
| `GET /subscriptions/plans`, `GET /subscriptions/me` | Routed; service = `notImplemented` |
| Admin `SubscriptionsPage` | Phase-2 empty shell |
| Technician `UpgradePage` | Hardcoded prices; buttons disabled |
| Models `Subscription` / `SubscriptionPlan` | Present, unused by live services |
| Client `subscriptionsApi` | **Missing** |

### 5.2 Payments — **live for escrow, not plans**

Wallet, escrow, MTN MoMo, Airtel Money, Flutterwave, Pesapal, Stripe providers exist for **job payments**. No plan checkout, recurring billing, or invoice flow for technician subscriptions.

### 5.3 Related stubs

- Admin `DynamicPricingPage` — placeholder  
- Growth `Promotion` type `free_job` — no redemption path  
- Referral `free_job_credit` — increments `freeJobLimit` only (**does not** update `remainingFreeJobs`) → **stale remaining until recalc**

---

## 6. Admin capabilities

| Capability | Available? | How |
|------------|------------|-----|
| Global free-job config (enable, default limit, lock after) | **Yes** | `/admin/free-jobs` → `PUT /admin/settings/free-jobs` |
| Override per-tech limit (20 / 50 / “unlimited”) | **Yes** | `POST /admin/technicians/:id/free-jobs` |
| Set remaining credits from UI | **API yes, UI no** | Type supports `remainingFreeJobs`; FreeJobsPage does not send it |
| Reset `freeJobsUsed` explicitly | **Indirect** | Via remaining/limit math on override |
| Unlock / lock technician | **Yes** | Locks page + technician actions |
| Assign / create paid plans | **No** | Subscriptions page empty |
| View usage | **Partial** | Technicians drawer / free-jobs context; not a usage analytics product |
| View subscription status | **Display only** | `subscriptionPlanCode` or “Free plan” badge — not billable truth |

---

## 7. Edge cases

| Case | Quota effect |
|------|----------------|
| Application cancelled / withdrawn | None |
| Customer cancels job | None (no restore); `jobsCancelled` often not incremented |
| Technician rejected | None |
| Duplicate apply | Conflict unless withdrawn; no double consume on apply |
| Failed escrow payment | No free-slot interaction |
| Refunded payment | **No** free-slot restore |
| Re-complete same job | Relies on status machine; no dedicated consume idempotency key |
| Expired subscription | N/A (no live subscriptions) |
| Account suspended | Apply blocked via `assertCanApplyToJobs` |
| Referral free-job credit | Increases limit only → remaining can stay wrong |
| `enabled: false` in settings | Consume skipped; apply gate still uses remaining/lock |

---

## 8. Implementation gaps

1. **No paid upgrade path** despite UX promising it.  
2. **Copy vs meter semantics** (applications vs completed jobs; “monthly” with no period).  
3. **Referral credit bug** (`freeJobLimit` ++ without remaining).  
4. **User vs profile lock desync** after auto lock.  
5. **Disabling free jobs** (`enabled: false`) incomplete.  
6. **Typo** select field `freeJobsLimit` vs `freeJobLimit` in nearby query.  
7. **Subscription stubs** and future models create false “ready” signal.  
8. **Admin unlimited = 9999** vs UI comparing `'unlimited'` string — selection state buggy after reload.  
9. **Profile-completion apply gate** admin-configurable but technician `canApply` ignores it (backend enforces on apply only).  
10. **Bypass risk:** Completing jobs still consumes after accept; if someone is accepted then lock races, they can finish and consume — by design. Main bypass risk is **admin unlock defaulting unlock:true** and referral stale remaining.  
11. **No restore** on cancelled completed-adjacent flows (fair if “completed only”, but must be documented).

---

## 9. Business model review

| Option | Fit to current code | Adoption | Revenue | Fairness | Scalability | Ease |
|--------|---------------------|----------|---------|----------|-------------|------|
| **A** Free X **completed** jobs → monthly subscription | **Best** — matches consume-on-complete + upgrade funnel | High | Strong recurring | High (pay for outcomes) | High | Medium (reuse MoMo) |
| **B** Free X completed → pay-per-application | Needs new decrement + checkout per apply | Medium | Spiky | Lower (tax on trying) | Medium | Medium-hard |
| **C** Commission only after completed jobs | Escrow already takes money; free-job lock becomes optional | High | Variable | High | High | Easy commercially / harder positioning |
| **D** Subscription + unlimited applications | Natural paid tier on top of A | High for power users | Strong | High | High | Same as A |
| **E** Freemium + premium visibility | Orthogonal to quota; good add-on | High | Medium | Medium | High | Can ship after A |

### Recommendation for FixNow

**Primary: Option A + D as the paid product**

1. Keep **consume on completed job** (already fairest and implemented).  
2. Align all UX to **“free completed jobs”** (not applications).  
3. After limit: keep browse/notify; block apply/accept; show **real MoMo subscription checkout** (reuse payment providers).  
4. Paid plan grants either raised limit or unlimited apply for the billing period (`Subscription` + sync `remainingFreeJobs` / `accountLocked`).  
5. Optional later: **E** (featured visibility) and lead packs (`LeadPurchase`) as add-ons — not the first revenue switch.

**Why not B first?** Application fees punish exploration and fight the “apply freely while learning” culture; also contradicts current decrement timing.

**Why not C alone?** Escrow commission can coexist, but without a free-tier ceiling FixNow loses the existing lock→upgrade funnel already built into UX.

---

## 10. Step-by-step implementation roadmap

### Phase 0 — Correctness (1–3 days, no monetization)

1. Unify product language: **completed free jobs**.  
2. Fix referral `free_job_credit` to adjust `remainingFreeJobs` (and used) safely.  
3. Sync `User.accountStatus` on auto free-job lock/unlock.  
4. Honour `marketplace.free_jobs.enabled === false` in `assertCanApplyToJobs`.  
5. Clarify LockedPage: remove “monthly” unless a period reset is implemented.  
6. Admin UI: expose remaining override; fix Unlimited selection.

### Phase 1 — Manual monetization ops (already mostly live)

1. Keep admin grant/unlock as the temporary monetization valve.  
2. Document ops playbook: unlock = grant N jobs after payment outside app if needed.

### Phase 2 — Production subscription (core)

1. Implement `Subscription.listPlans` / `getMine` / `subscribe` (MoMo / Flutterwave one-time then period).  
2. On successful payment: create `Subscription`, clear lock, set `remainingFreeJobs` or unlimited flag for period.  
3. Cron/webhook: expire → re-lock or revert to free remaining.  
4. Wire UpgradePage CTAs; remove “Available soon”.  
5. Admin SubscriptionsPage: CRUD plans, view subscribers.  
6. Technician: plan status + next renewal (no raw provider dumps).

### Phase 3 — Scale

1. Featured listing / search boost (Option E).  
2. Lead packs via `LeadPurchase` if marketplace needs it.  
3. Optional commission tuning alongside subscription (hybrid A+C).

---

## 11. Key file index

**Backend**  
`backend/src/services/marketplace/freeJob.service.ts`  
`backend/src/services/marketplace/job.service.ts`  
`backend/src/models/technician/Technician.ts`  
`backend/src/models/auth/User.ts`  
`backend/src/models/future/Future.ts`  
`backend/src/services/index.ts` (subscription stubs)  
`backend/src/services/referral/referral.service.ts`  
`backend/src/services/marketplace/admin.service.ts`

**Technician**  
`apps/technician/context/AppContext.tsx`  
`apps/technician/pages/LockedPage.tsx`  
`apps/technician/pages/UpgradePage.tsx`  
`apps/technician/pages/DashboardPage.tsx`  
`apps/technician/pages/JobsFeedPage.tsx`  
`apps/technician/pages/JobDetailsPage.tsx`  
`packages/ui/Progress.tsx` (`FreeJobsMeter`)

**Admin**  
`apps/admin/pages/FreeJobsPage.tsx`  
`apps/admin/pages/LocksPage.tsx`  
`apps/admin/pages/SubscriptionsPage.tsx`  
`packages/api/adminApi.ts`

---

## 12. Summary answers (checklist)

1. **Current implementation:** Completed-job quota on technician profile; apply/accept gated; consume on customer-confirmed completion; auto-lock.  
2. **DB fields:** `freeJobsUsed`, `freeJobLimit`, `remainingFreeJobs`, lock fields, stub subscription fields, future Subscription models.  
3. **Technician UX:** Meter + lock + upgrade marketing; **no real billing**.  
4. **After free jobs finish:** Cannot apply/accept; can browse/notify; upgrade dead-end until admin unlock.  
5. **Subscription/payment infra:** Escrow live; plans **stub**.  
6. **Missing:** Checkout, period reset, plan enforcement, remaining grant UI, referral remaining sync, copy alignment.  
7. **Recommended strategy:** **Free N completed jobs → MoMo monthly subscription (unlimited or higher cap)**; keep escrow commission as separate revenue.  
8. **Roadmap:** Phase 0 correctness → Phase 2 live subscriptions → Phase 3 visibility/leads.

---

*Audit only — no monetization code changes were made in this pass.*
