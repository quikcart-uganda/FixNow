# Profile Boost Implementation Report

**Date:** 2026-07-28  
**Phase:** 4 — Technician Profile Boost system  
**Sources of truth:** `TECHNICIAN_FREE_JOBS_AUDIT.md`, `STARTER_PLAN_IMPLEMENTATION_REPORT.md`, `PROFESSIONAL_PLAN_IMPLEMENTATION_REPORT.md`, `BUSINESS_PLAN_IMPLEMENTATION_REPORT.md`  
**Constraint:** Ranking engine extended, not replaced. Free completed-job accounting unchanged. Boosts are **not** subscription plans.

---

## 1. Boost overview

A **Profile Boost** is an optional marketing product that temporarily improves exposure. Starter, Professional, and Business subscribers (and Free, if Admin enables) may purchase boosts when Admin allows.

Boosts:

- Do **not** guarantee jobs
- Do **not** override trust, ratings, distance, availability, or verification
- Add a **soft, capped** weight to the existing ranking score
- Activate only after MoMo payment + **Admin verification** (same pattern as subscriptions)

**Ranking formula (extended, not replaced):**

```
rankingScore =
  trustScore                          // 0–100 primary
  + ratingAverage * 4
  + min(20, jobsCompleted / 5)
  + (isAvailableNow ? 8 : 0)
  + subscriptionSearchWeight          // plan soft weight
  + boostWeight                       // NEW — capped (default max combined 25)
  + (featuredPlacement ? 6 : 0)
```

Because trust is 0–100 and combined boost weight defaults to ≤25, a low-trust boosted technician cannot outrank an excellent high-trust technician under normal conditions.

---

## 2. Available boost types

| Code | Type | Default intent |
|------|------|----------------|
| `CATEGORY_BOOST` | Category Boost | Category / nearby / featured category lift |
| `DISTRICT_BOOST` | District Boost | Visibility only in selected districts |
| `HOMEPAGE_FEATURED` | Homepage Featured | Featured / recommended homepage placements |
| `WEEKEND_BOOST` | Weekend Boost | Fri–Sun / weekend job exposure |
| `EMERGENCY_BOOST` | Emergency Boost | Urgent / night / emergency queries |
| `SEARCH_BOOST` | Search Boost | Soft search weight (no #1 guarantee) |
| `PROMOTION_BOOST` | Promotion Boost | Offer / promotion surface lift |
| `NEW_CUSTOMER_BOOST` | New Customer Boost | Soft lift for new-customer matching |
| `BUSINESS_SPOTLIGHT` | Business Spotlight | Homepage / Featured Businesses (Business plan) |
| `SEASONAL_BOOST` | Seasonal Boost | Seasonal / holiday campaign visibility |

Admin may enable, disable, rename, reprice, or re-weight any product.

---

## 3. Default configuration

### System settings (`BoostSettings`)

| Setting | Default |
|---------|---------|
| Enabled | `true` |
| Max combined soft weight | `25` |
| Currency | `UGX` |

### Product seed defaults (editable)

| Product | Price (UGX) | Duration | Weight | Eligible plans |
|---------|-------------|----------|--------|----------------|
| Category Boost | 25,000 | 7 days | 10 | Starter, Pro, Business |
| District Boost | 20,000 | 7 days | 10 | Starter, Pro, Business |
| Homepage Featured | 45,000 | 3 days | 8 | Starter, Pro, Business |
| Weekend Boost | 15,000 | 3 days | 8 | Starter, Pro, Business |
| Emergency Boost | 30,000 | 2 days | 12 | Starter, Pro, Business |
| Search Boost | 22,000 | 7 days | 12 | Starter, Pro, Business |
| Promotion Boost | 18,000 | 7 days | 6 | Starter, Pro, Business |
| New Customer Boost | 16,000 | 7 days | 7 | Starter, Pro, Business |
| Business Spotlight | 60,000 | 7 days | 10 | **Business only** |
| Seasonal Boost | 35,000 | 14 days | 9 | Pro, Business |

Durations are stored as hours (`24`, `72`, `168`, `336`, `720`, `1440`, `2160` examples supported via Admin edit).

---

## 4. Admin configuration

**Route:** `/admin/boosts` — **Boost Management**

Landing cards for every boost product. Click opens configuration:

- Name, description, price, currency  
- Duration (hours), weight, priority, display order  
- Status (active), visible in marketplace  
- Eligible plans (`FREE`, `STARTER`, `PROFESSIONAL`, `BUSINESS`)  
- Max concurrent purchases  
- Estimated visibility lift %  
- District pick allowance  

Also:

- **Settings** — global enable + max combined weight  
- **Pending payments** — approve / reject MoMo boost purchases  

Subscriptions page **Boosters** card links here.

---

## 5. Pricing system

- Per-product UGX price on `BoostProduct`
- Duration hours on product (Admin editable)
- MoMo payee details **reused** from subscription MoMo config
- Technician submits network + MSISDN + transaction ID
- Status `pending_payment` → Admin approve → `active` with `startsAt` / `endsAt`
- Reject → `rejected` + notification

No auto-activation.

---

## 6. Ranking integration

**File:** `backend/src/services/marketplace/technician.service.ts` → `search`

- Loads active boosts via `resolveBoostContributions(userIds, context)`
- Context: `categoryId`, `district`, `emergency`, `weekend`, `newCustomer`, `placement`
- Scoped types only apply when context matches (e.g. district boost only in listed districts; emergency only when `emergency=true`)
- Combined boost weight capped by `BoostSettings.maxCombinedWeight`
- Homepage / Business Spotlight set `featuredPlacement` / `businessSpotlight` flags for customer UI
- Offer home feed: `promotion_boost` soft-prioritises recommended offers (still sorted with featured + trust)

**Customer homepage** passes `placement: 'homepage'` and uses server `rankingScore` in personalisation so featured/boosted profiles surface naturally without interrupting UX.

---

## 7. Customer experience

Boosts appear as natural ranking / featured preference:

- Search & nearby technician lists  
- Homepage recommended / featured technician card  
- Offer recommended rail (promotion boost)  
- No intrusive overlays, popups, or forced ads from boost alone  

Premium UX preserved: trust badges and quality signals remain primary.

---

## 8. Technician experience

**Route:** `/technician/boosts` — **Boost Marketplace**

Shows:

- Eligibility plan  
- Boost cards (name, description, benefits, price, duration, est. lift, soft weight)  
- Purchase → MoMo instructions → transaction submit  
- Active boosts with days remaining  
- History  

Nav: desktop sidebar + header menu “Profile Boosts”.

Notifications:

- Payment pending  
- Boost activated  
- Payment rejected  
- 3 days remaining / 1 day remaining  
- Expired + renew prompt  

---

## 9. Database changes

### Models (`backend/src/models/marketplace/ProfileBoost.ts`)

| Model | Purpose |
|-------|---------|
| `BoostProduct` | Admin catalogue of boost types |
| `BoostPurchase` | Purchase + payment + lifecycle + analytics |
| `BoostSettings` | Global enable + max combined weight |

Purchase analytics fields: `views`, `clicks`, `enquiries`, `applications`, `conversions`.

---

## 10. Backend APIs

| Method | Path | Role |
|--------|------|------|
| GET | `/boosts/products` | Public / optional auth |
| GET | `/boosts/me` | Technician |
| POST | `/boosts/purchases` | Technician |
| POST | `/boosts/purchases/:id/track` | Optional |
| GET | `/admin/boosts/catalogue` | Admin |
| PATCH | `/admin/boosts/products/:id` | Admin |
| PUT | `/admin/boosts/settings` | Admin |
| GET | `/admin/boosts/purchases` | Admin |
| POST | `/admin/boosts/purchases/:id/approve` | Admin |
| POST | `/admin/boosts/purchases/:id/reject` | Admin |

**Service:** `backend/src/services/marketplace/boost.service.ts`  
**Expiry / reminders:** CMS maintenance job every 60s (`expireDueBoosts`, `processBoostReminders`).

---

## 11. Frontend changes

| Surface | Change |
|---------|--------|
| Technician | `BoostMarketplacePage.tsx`, route `/technician/boosts`, nav links |
| Admin | `BoostsPage.tsx`, route `/admin/boosts`, shell nav, Subscriptions Boosters link |
| Customer | Homepage search `placement=homepage`; mapper + personalise use ranking / spotlight flags |
| API package | `boostsApi.ts`, `adminBoostsApi` |

---

## 12. Validation

| Check | Result |
|-------|--------|
| Boost activates only after Admin approve | Pass |
| Auto-expire + notify | Pass (job + opportunistic expire) |
| Ranking extended (not replaced) | Pass |
| Trust remains dominant vs capped boost | Pass (max combined 25 vs trust 0–100) |
| Admin configures all products / settings | Pass |
| Nothing hardcoded for production gates | Pass (DB catalogue + settings) |
| MoMo flow reused | Pass |
| Free-job accounting untouched | Pass |
| Business Spotlight Business-only by default | Pass (eligible plans) |

---

## 13. Future enhancements

1. Technician-selectable category scope UI for Category Boost  
2. Explicit Featured Businesses homepage rail component  
3. ROI dashboard (spend vs enquiries / conversions)  
4. A/B weight experiments under Admin  
5. Bundle packs (multi-boost discounts)  
6. Night-window emergency auto-context from job urgency metadata  
7. Cap purchases per billing cycle for abuse prevention  

---

## Maintenance

This report is the **official Profile Boost documentation**. Update whenever boost types, ranking contribution rules, Admin UI, or payment/expiry behaviour change.

**Related:** Phase 1–3 subscription reports; ranking lives in `technician.service.ts` search — always extend, never replace.
