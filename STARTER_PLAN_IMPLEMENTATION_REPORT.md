# Starter Plan Implementation Report

**Date:** 2026-07-28  
**Scope:** Phase 1 technician Starter subscription after free completed jobs are exhausted.  
**Source of truth:** `TECHNICIAN_FREE_JOBS_AUDIT.md`  
**Constraint:** Completed-job accounting was **not** redesigned. Free quota still deducts only on customer-confirmed completion (`consumeFreeJobSlotForCompletion`).

---

## 1. Overview

FixNow technicians receive a configurable free completed-job quota. When `remainingFreeCompletedJobs == 0`, they may still browse, search, receive notifications, edit profile, view earnings/history, and chat on existing jobs — but **cannot** submit new applications, accept invitations, or start new work.

Phase 1 replaces the “Coming Soon / Available soon” upgrade placeholder with a production **Starter** plan:

- Admin-configurable pricing, features, limits, MoMo payee details, and reminders
- Manual Mobile Money (MTN / Airtel) payment submission
- Admin verification before unlock (no auto-activate)
- Apply-gate opens when subscription is `active` / `trialing` and not past period end
- Standard search ranking (no boost, no penalty)

---

## 2. All Starter features (defaults)

| Area | Default |
|------|---------|
| Applications | Unlimited |
| Completed jobs | Unlimited (does not burn free quota while paid) |
| Public profile | Yes |
| Ratings / reviews | Yes |
| Portfolio / gallery | Yes (basic) |
| Photos | Up to 20 |
| Videos | No (0) |
| Profile banner | Basic (1) |
| Company name | Optional / enabled |
| Business description | Yes |
| Working hours / location / map | Yes |
| Availability | Basic |
| Analytics / earnings | Basic |
| Chat / push / job history | Yes |
| Certificates | Yes (limit 10) |
| Offers | Basic (max 2 active) |
| Promotional / advertising banner | 1 |
| Search ranking | Standard |
| Support | Standard |
| Referral programme | Yes |
| Featured / premium badge | No |
| Dispatcher / team | No |

---

## 3. Default feature permissions

Seeded in `DEFAULT_STARTER_FEATURES` / `DEFAULT_STARTER_LIMITS` (`backend/src/models/marketplace/Subscription.ts`).  
Professional and Business plans are also seeded for the admin feature matrix (checkout UI focuses on Starter for Phase 1).

---

## 4. Admin configurable options

| Setting | Where |
|---------|--------|
| Plan name, description | Admin → Subscriptions → Starter plan |
| Monthly / quarterly / yearly price, currency | Same |
| Grace period, auto-renew flag, active flag | Same |
| Feature flags (photos, videos, offers, banners, etc.) | Same |
| Numeric limits (photos, videos, certificates, gallery, offers, banners) | Same |
| Feature matrix (Starter / Professional / Business) | Admin → Feature matrix |
| MoMo account name, phone, network instructions, reference format | Admin → Mobile Money |
| Reminder frequency, dismiss duration, max per event, popup/notification/push/email, triggers | Admin → Reminders |
| Approve / reject payments | Admin → Pending payments |
| Suspend, deactivate, extend, refund, reset, complimentary month | Admin → Subscriptions |

Platform keys:

- `marketplace.free_jobs` — free quota + `subscriptionEnabled` (set true on catalogue seed)
- `marketplace.subscription_momo` — payee instructions
- `marketplace.subscription_reminders` — reminder policy

---

## 5. Database changes

### New / replaced models (`backend/src/models/marketplace/Subscription.ts`)

- `SubscriptionPlan` — codes, prices, `featureFlags`, `limits`, grace, autoRenew
- `Subscription` — technician period, status including `pending_payment`
- `SubscriptionPayment` — manual MoMo fields, unique `(transactionId, network)`

Removed duplicate stub schemas from `backend/src/models/future/Future.ts` (LeadPurchase / marketplace listings remain).

### TechnicianProfile additions

- `subscriptionPeriodEnd`
- `subscriptionBillingPeriod`
- `subscriptionStatus` enum includes `pending_payment`

Free-job fields (`freeJobsUsed`, `remainingFreeJobs`, etc.) unchanged.

---

## 6. Backend changes

| File | Change |
|------|--------|
| `services/marketplace/subscription.service.ts` | Catalogue seed, getMine, submitPayment, approve/reject, admin manage, MoMo/reminders, expireDue, evaluateReminders |
| `services/marketplace/freeJob.service.ts` | Apply gate + contact visibility respect active paid access; skip free-quota deduct while paid; default `subscriptionEnabled: true` |
| `services/index.ts` | Live `subscriptionService` export |
| `controllers/index.ts` | Full subscription controller surface |
| `routes/index.ts` | Technician + admin subscription routes |
| `server.ts` | Seeds catalogue on boot |
| `models/technician/Technician.ts` | Period / pending_payment fields |

**Apply gate:** `assertCanApplyToJobs` / `canViewCustomerContact` / `quotaSnapshot.canApply` allow access when subscription is active/trialing and not expired.

**Consume path:** Still only on customer-confirmed completion. Active paid technicians do not burn free slots (unlimited completed jobs on Starter). Free-plan accounting unchanged for unpaid technicians.

---

## 7. Frontend changes

| Package / app | Change |
|---------------|--------|
| `packages/api/subscriptionsApi.ts` | Technician subscription client |
| `packages/api/adminApi.ts` | Admin subscription APIs |
| `packages/api/mappers.ts` + `packages/types` | Subscription fields on technician profile |
| `apps/technician/context/AppContext.tsx` | `isLocked` / `canApply` respect active subscription |
| `apps/technician/pages/UpgradePage.tsx` | Full Starter experience + MoMo checkout + pending state |
| `apps/technician/pages/LockedPage.tsx` | Soft lock copy + Starter CTA |
| `apps/technician/pages/DashboardPage.tsx` | Plan badge / renew vs free meter |
| `apps/technician/components/SubscriptionReminderBanner.tsx` | Throttled reminders |
| `apps/admin/pages/SubscriptionsPage.tsx` | Starter settings, matrix, payments, MoMo, reminders |

---

## 8. Technician UI

1. **Upgrade (`/technician/upgrade`)** — Welcome / congratulations, trial ended messaging, benefits, price, billing period, Subscribe / Compare / Return to browsing  
2. **Checkout** — Network, payee details from admin, phone used, transaction ID, amount validation  
3. **Pending verification** — Clear “Payment Pending Verification” until admin approves  
4. **Active plan** — Badge, expiry, renew, payment history  
5. **Locked page** — Soft messaging; browsing still available  
6. **Dashboard** — Current plan or free quota meter; reminder banner when applicable  

---

## 9. Admin UI

`/admin/subscriptions` tabs:

1. Starter plan  
2. Feature matrix  
3. Pending payments (approve / reject)  
4. Subscriptions (extend, complimentary, suspend, deactivate, refund, reset)  
5. Mobile Money  
6. Reminders  

---

## 10. Payment flow

```
Technician selects Starter + billing period
        ↓
Sees MoMo instructions (admin-configured MTN / Airtel)
        ↓
Sends money with reference TECH-{userSeq}
        ↓
Submits network, phone, transaction ID, amount
        ↓
SubscriptionPayment status = pending
TechnicianProfile.subscriptionStatus = pending_payment
        ↓
Admin approves → Subscription active, period end set, account unlocked
        ↓
OR Admin rejects → technician notified, status required
```

**No auto-unlock.** Access returns only after approval (or admin complimentary/activate).

---

## 11. Reminder flow

Triggers (admin toggleable):

- One free completed job remaining  
- Free jobs exhausted  
- 7 days / 3 days / expiry day before period end  
- After expiry  

Channels: popup (banner), in-app notification types, push/email flags.  
Client dismiss duration + admin `frequencyDays` / `maxRemindersPerEvent` control spam.

Notification types include:

- `technician.subscription_required`  
- `technician.subscription_payment_submitted`  
- `technician.subscription_activated`  
- `technician.subscription_rejected`  
- `technician.subscription_expired`  
- `subscription.payment_pending` (admins)

---

## 12. Validation results

| Check | Expected | Implementation |
|-------|----------|----------------|
| No applications after free jobs end | 403 unless paid | `assertCanApplyToJobs` |
| Browsing still works | Yes | No browse gate |
| Notifications still work | Yes | Unchanged delivery |
| Existing jobs continue | Yes | Only new apply/accept gated |
| Subscription unlocks applications | Yes | Active/trialing paid access |
| Expiry re-locks when free=0 | Yes | `expireDueSubscriptions` + manage suspend |
| Admin controls immediate | Yes | Plan/MoMo/reminders upserted live |
| No hardcoded product locks | Defaults only; admin editable | PlatformSetting + SubscriptionPlan |

---

## 13. Future integration points

- Automatic MoMo collection / Flutterwave plan billing (reuse job escrow providers)  
- Enforce media/offer/banner limits in portfolio & marketing services via `featureFlags` / `limits`  
- Email reminder delivery when `emailEnabled`  
- Professional / Business self-serve checkout (matrix already seeded)  
- Auto-renew billing agent when `autoRenew` becomes live  
- Featured placement / premium badge ranking hooks (flags exist; ranking stays standard for Starter)  

---

## 14. Feature matrix used

Rows = feature flags + numeric limits.  
Columns = Starter | Professional | Business.  
Built by `buildFeatureMatrix()` from live plan documents; editable for Starter in admin UI; Pro/Business updateable via `PATCH /admin/subscriptions/plans/:id`.

---

## 15. Screens / pages modified

| Path | Role |
|------|------|
| `apps/technician/pages/UpgradePage.tsx` | Starter subscription UX |
| `apps/technician/pages/LockedPage.tsx` | Soft lock CTA |
| `apps/technician/pages/DashboardPage.tsx` | Plan / quota panel |
| `apps/technician/components/SubscriptionReminderBanner.tsx` | Reminders |
| `apps/technician/context/AppContext.tsx` | Lock/apply logic |
| `apps/admin/pages/SubscriptionsPage.tsx` | Full admin module |
| `packages/api/subscriptionsApi.ts` | New |
| `packages/api/adminApi.ts` | Extended |
| `packages/api/mappers.ts` / `packages/types/index.ts` | Profile fields |
| `backend/src/models/marketplace/Subscription.ts` | New |
| `backend/src/models/future/Future.ts` | Stub removal |
| `backend/src/services/marketplace/subscription.service.ts` | New |
| `backend/src/services/marketplace/freeJob.service.ts` | Paid access gate |
| `backend/src/routes/index.ts` / `controllers/index.ts` / `server.ts` | Wiring |

---

## API quick reference

**Technician**

- `GET /subscriptions/plans`  
- `GET /subscriptions/me`  
- `POST /subscriptions/payments`  
- `GET /subscriptions/reminders`  

**Admin**

- `GET /admin/subscriptions/catalogue`  
- `PATCH /admin/subscriptions/plans/:id`  
- `GET|POST /admin/subscriptions/payments` (+ `/:id/approve|reject`)  
- `GET /admin/subscriptions`  
- `POST /admin/subscriptions/technicians/:id/manage`  
- `GET|PUT /admin/subscriptions/momo`  
- `GET|PUT /admin/subscriptions/reminders`  

---

*This report is the official documentation for the Starter Plan implementation and future maintenance.*
