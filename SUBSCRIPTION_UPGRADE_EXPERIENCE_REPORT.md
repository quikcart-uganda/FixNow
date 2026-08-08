# Subscription Upgrade Experience Report

**Date:** 2026-07-28  
**Phase:** 5A — Subscription Discovery & Upgrade Experience  
**Prerequisite for:** Developer Subscription Sandbox (next phase)  
**Sources of truth:** `TECHNICIAN_FREE_JOBS_AUDIT.md`, Starter / Professional / Business / Profile Boost implementation reports, Feature Entitlement Engine (`entitlements.service.ts`)

---

## 1. Upgrade journey overview

Technicians can explore and upgrade from day one. Free completed-job quota does **not** gate discovery.

```
Settings → Subscription & Billing
        → Upgrade Plan
        → Plan comparison (/technician/upgrade or /technician/plans)
        → Plan detail (/technician/plans/:code)
        → Select plan → billing period → MoMo instructions
        → Submit payment → pending verification
        → Admin approval → subscription activated
```

Parallel entry points (same destination):

| Surface | CTA | Route |
|---------|-----|-------|
| Desktop sidebar | Upgrade Plan | `/technician/upgrade` |
| Header menu | Upgrade Plan | `/technician/upgrade` |
| Dashboard | Upgrade Plan | `/technician/upgrade` |
| Settings group | Upgrade Plan / Billing | `/technician/upgrade`, `/technician/settings/billing` |
| Subscription Centre | Upgrade Plan / Renew | `/technician/upgrade` |
| Profile | Upgrade Plan | `/technician/upgrade` |
| Locked screen | Upgrade messaging | `/technician/locked` → upgrade |

Global kill switch: Admin `discovery.upgradesEnabled === false` hides checkout and shows a paused state on the plans page. Submit payment is also rejected server-side.

---

## 2. Subscription & Billing module

**Route:** `/technician/settings/billing`  
**Nav:** Settings → **Subscription & Billing** group

Shows:

- Current plan name (from entitlements / subscription)
- Current badge (`SubscriptionBadge` from plan config)
- Subscription / lifecycle status
- Remaining free completed jobs (Free tier)
- Subscription expiry + days remaining
- Pending payment status
- Payment history (recent MoMo submissions)
- Actions: Upgrade Plan, Compare Plans, View Current Benefits, Renew (when paid), Support

Replaced the misleading Settings label **“Verification & Pro status”** with explicit subscription terminology.

---

## 3. Plan comparison page

**Routes:** `/technician/upgrade`, `/technician/plans`  
**Page:** `apps/technician/pages/UpgradePage.tsx`

Displays Admin-configured catalogue:

- Free (when `showFreePlan`)
- Starter / Professional / Business (visible + active paid plans)

Each card: name, badge, description, monthly / quarterly / yearly prices, feature bullets, Current / Popular / Recommended markers, View details, Upgrade / Renew.

Comparison table rows come from `GET /subscriptions/plans` → `comparison` (built from live plan `limits` + `featureFlags` in `buildComparisonRows`). **No hardcoded product matrix in the UI.**

Checkout step on the same page: period picker, MoMo networks, payer MSISDN, transaction ID → `POST /subscriptions/payments` → pending verification UI.

---

## 4. Plan detail pages

**Route:** `/technician/plans/:code`  
**Page:** `apps/technician/pages/PlanDetailPage.tsx`  
**API:** `GET /subscriptions/plans/:code` → `getPublicPlanDetail` / `buildPlanDetail`

Includes:

- Overview / description
- Pricing (monthly, quarterly, yearly)
- Included features list
- Feature limits (from plan limits)
- Capability flags (included vs locked)
- Ideal customer, why upgrade
- Support level + grace / renewal notes
- FAQ
- CTA to checkout (`?plan=CODE&checkout=1`) when upgrades are enabled

Free detail is available when discovery shows the Free plan.

---

## 5. Navigation changes

| Change | Detail |
|--------|--------|
| Settings | New **Subscription & Billing** section; removed “Verification & Pro status” |
| Desktop nav | Always-visible **Upgrade Plan** |
| Header menu | **Upgrade Plan**, **Subscription Centre**, **Subscription & Billing** |
| AppShell meter | Always shows **Upgrade Plan** (not only when unlocked); lock link remains when locked |
| Dashboard | CTA label **Upgrade Plan** (was “Unlock Unlimited”) |
| Aliases | `/technician/plans` → same comparison page |

Terminology is normalized to **Upgrade Plan**, **Subscription & Billing**, **Subscription Centre**.

---

## 6. Feature entitlement integration

Single source of truth:

| Concern | Source |
|---------|--------|
| Plan catalogue & prices | `SubscriptionPlan` + `listPublicPlans` |
| Comparison matrix | `buildComparisonRows` from plan flags/limits |
| Current access | `resolveEntitlements` / `GET /subscriptions/me` |
| Apply / media / offers gates | Entitlement engine asserts |
| Free quota | Unchanged free completed-job accounting |

UI does not redefine plan permissions; it renders API payloads.

---

## 7. Admin configuration

**UI:** Admin → Subscriptions → Tools → **Upgrade discovery**  
**API:** `GET/PUT /admin/subscriptions/discovery`  
**Also returned on:** `GET /admin/subscriptions/catalogue` → `discovery`

Controls:

| Setting | Effect |
|---------|--------|
| `upgradesEnabled` | Pause new purchases globally |
| `showFreePlan` | Include Free card + comparison column |
| `featuredPlanCode` | Featured ring on plans page |
| `recommendedPlanCode` | Recommended badge |
| `popularPlanCode` | Popular badge |
| `allowDowngrade` | Downgrade messaging flag (for future / copy) |
| `heroTitle` / `heroSubtitle` | Plans page hero copy |

Per-plan visibility / ordering: plan editor `isVisible`, `sortOrder`, `isActive` (existing).

---

## 8. Backend APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/subscriptions/plans` | Discovery + plans + comparison + payment config |
| GET | `/subscriptions/plans/:code` | Plan detail (incl. FREE) |
| GET | `/subscriptions/me` | Current plan, entitlements, payments, badge, timeline |
| POST | `/subscriptions/payments` | Submit MoMo proof (blocked if upgrades disabled / invisible plan) |
| GET | `/admin/subscriptions/discovery` | Read discovery config |
| PUT | `/admin/subscriptions/discovery` | Update discovery config |
| GET | `/admin/subscriptions/catalogue` | Plans + matrix + momo + reminders + discovery |

Notifications (existing pipeline):

- `technician.subscription_payment_submitted` — payment received / verification pending
- `technician.subscription_activated` — approved / activated
- `technician.subscription_rejected` — rejected
- Reminder triggers — renewal approaching (7 / 3 / 1 day, expiry, after expiry)
- Grace / expired events when lifecycle advances

---

## 9. Frontend implementation

| File | Role |
|------|------|
| `apps/technician/pages/UpgradePage.tsx` | Comparison + checkout + pending |
| `apps/technician/pages/PlanDetailPage.tsx` | Per-plan detail |
| `apps/technician/pages/SubscriptionBillingPage.tsx` | Settings billing hub |
| `apps/technician/pages/SettingsPage.tsx` | Subscription & Billing nav group |
| `apps/technician/pages/SubscriptionCentrePage.tsx` | Benefits / timeline / renew CTA |
| `apps/technician/components/layout/AppShell.tsx` | Always-on Upgrade Plan |
| `apps/technician/routes.tsx` | `plans`, `plans/:code`, `settings/billing` |
| `packages/shared/header/menuConfig.ts` | Menu entries |
| `packages/api/subscriptionsApi.ts` | Client types + `getPlanDetail` |
| `packages/api/adminApi.ts` | Discovery get/put; catalogue `discovery` |
| `apps/admin/pages/SubscriptionsPage.tsx` | Discovery ops panel |

Responsive: card grid collapses 4 → 2 → 1; comparison table scrolls horizontally; checkout is single-column — suitable for web and Capacitor WebView.

---

## 10. Validation results

| Check | Result |
|-------|--------|
| Free technician can open Upgrade Plan without exhausting free jobs | Pass (nav + Settings + dashboard always link) |
| Plans page loads Free + paid from API | Pass (when `showFreePlan` / visible plans) |
| Comparison values from Admin config | Pass (`comparison` server-built) |
| Current plan / badge / status display | Pass (me + entitlements) |
| Upgrade flow MoMo → pending → admin approve | Pass (existing payment pipeline + upgradesEnabled gate) |
| Admin can pause upgrades | Pass (UI + submitPayment rejection) |
| No feature matrix hardcoded in technician UI | Pass |
| Routes for web / Capacitor | Same React routes; responsive layout |

Manual QA recommended before sandbox phase: toggle discovery flags in Admin and confirm technician plans page updates without redeploy.

---

## 11. UX recommendations

1. Keep **Upgrade Plan** wording everywhere; avoid “Unlock Unlimited” / “Verification & Pro”.
2. Prefer Settings → Billing for status; Upgrade page for shopping; Subscription Centre for entitlements.
3. When `upgradesEnabled` is false, keep Subscription Centre readable so paid users still see benefits.
4. Featured / Recommended / Popular should map to real Admin strategy — do not leave all three on the same plan long-term.
5. Developer Subscription Sandbox (next phase) should call the same plans / me / payment APIs (or entitlement overrides) rather than inventing a parallel catalogue.

---

## Notifications

| Event | Type |
|-------|------|
| Payment submitted / verification pending | `technician.subscription_payment_submitted` |
| Subscription approved & activated | `technician.subscription_activated` |
| Payment / subscription rejected | `technician.subscription_rejected` |
| Renewal approaching | Reminder triggers (7 / 3 / 1 day, expiry day) |
| Grace / expired | `technician.subscription_grace`, `technician.subscription_expired` |
| Plan configuration updated (Admin) | `technician.subscription_plan_updated` (active subscribers on that plan, capped) |

---

## Pre-implementation audit (summary)

| Finding | Resolution |
|---------|------------|
| Upgrade hidden behind exhaust / lock language | Always-on Upgrade Plan CTAs |
| Settings labeled “Verification & Pro status” | Renamed; dedicated Billing section |
| Duplicate / unclear upgrade paths | Unified on `/technician/upgrade` + aliases |
| No Free plan in public catalogue | `buildFreePlanCard` + discovery flag |
| Hardcoded comparison risk | Server `comparison` rows |
| No Admin discovery controls | Discovery setting + Admin UI |

---

**This document is the official production foundation for the technician subscription discovery and upgrade experience, and the baseline the Developer Subscription Sandbox must reuse.**
