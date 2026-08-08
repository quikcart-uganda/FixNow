# Subscription Lifecycle Enhancement Report

**Date:** 2 August 2026  
**Scope:** Graceful scheduled downgrade and unsubscribe (cancel-at-period-end)  
**Constraint:** No redesign of plans, payment verification, or entitlement engine — schedule next state only; paid benefits remain until expiry.

---

## 1. Audit — previous lifecycle

| Area | Behaviour |
|------|-----------|
| Purchase / upgrade | MoMo (or Dev TX) → pending → admin/auto approve → `activateSubscriptionForUser` (immediate) |
| Downgrade | **Blocked in UI** via `discovery.allowDowngrade` (default `false`). Backend did not enforce. |
| Unsubscribe | **No technician API** — only admin deactivate/refund/reset |
| `cancelAtPeriodEnd` | Field existed on `Subscription`, always written `false`, never read |
| Expiry | `expireDueSubscriptions()` on `GET /subscriptions/me` — grace then expired |
| Entitlements | Unchanged SSOT: `TechnicianProfile` + `resolveEntitlements` |

---

## 2. New lifecycle

```
Upgrade (higher plan)
  → pay / verify → activate immediately → clear any scheduled change

Downgrade (lower paid plan)
  → schedule on Subscription → keep current entitlements
  → at period end → activate scheduled plan (new period)

Unsubscribe
  → cancelAtPeriodEnd + scheduled cancel → keep current entitlements
  → at period end → cancelled → Free (no paid access)

Cancel scheduled change
  → clear schedule → continue current plan as usual
```

Paid benefits are never removed early. Scheduled changes apply only when `subscriptionPeriodEnd <= now` (before grace for scheduled transitions).

---

## 3. Database changes

`Subscription` document (`backend/src/models/marketplace/Subscription.ts`):

| Field | Purpose |
|-------|---------|
| `cancelAtPeriodEnd` | Existing — now used for unsubscribe |
| `scheduledPlanCode` | Target plan for downgrade |
| `scheduledChangeType` | `'downgrade' \| 'cancel'` |
| `scheduledChangeAt` | Usually equals current period end |
| `scheduledAt` | When the technician scheduled the change |

No new collections. No entitlement schema changes. Mongoose accepts new fields without a migration script (existing docs default to no schedule).

---

## 4. Scheduled state transitions

Applied inside `expireDueSubscriptions()`:

1. Load due profiles (`active|trialing|past_due` and `subscriptionPeriodEnd <= now`).
2. If subscription has **cancel** schedule → `applyScheduledCancel` (status `cancelled`, clear plan, Free behaviour).
3. Else if **downgrade** schedule → `activateSubscriptionForUser` for target plan (complimentary note; clears schedule).
4. Else → existing grace / expire path.

Upgrades via `activateSubscriptionForUser` always clear schedule fields.

---

## 5. API

| Method | Path | Effect |
|--------|------|--------|
| POST | `/subscriptions/me/schedule-downgrade` | `{ planCode }` — schedule lower plan |
| POST | `/subscriptions/me/cancel` | Schedule unsubscribe at period end |
| DELETE | `/subscriptions/me/scheduled-change` | Clear schedule / keep subscription |
| GET | `/subscriptions/me` | Now includes `schedule` + `currentSubscription` summary |

Client: `packages/api/subscriptionsApi.ts` — `scheduleDowngrade`, `scheduleCancel`, `clearScheduledChange`.

---

## 6. UI changes

### Subscription Centre
- **Current subscription** block: plan, status (Active / Scheduled change / Expiring), activated on, expires on, next scheduled plan/action, auto-renew (off), source (Mobile Money / Development Transaction ID / Complimentary when known).
- Actions: Upgrade (immediate via Upgrade page), Downgrade (confirm + schedule), Cancel subscription (confirm + schedule), Keep subscription / Cancel scheduled downgrade.

### Upgrade page
- Downgrade / Cancel subscription buttons always available while paid (no longer gated by `allowDowngrade`).
- Confirmation copy explains benefits continue until expiry.
- Banner when a change is already scheduled.

### Billing settings
- Shows scheduled status + link to Manage subscription.

### FAQ
- Downgrade and cancel answers updated to match scheduled behaviour.

---

## 7. Files modified

| File | Change |
|------|--------|
| `backend/src/models/marketplace/Subscription.ts` | Schedule fields |
| `backend/src/services/marketplace/subscription.service.ts` | schedule/cancel/clear + expire apply + getMine summary |
| `backend/src/controllers/index.ts` | New handlers |
| `backend/src/routes/index.ts` | New routes |
| `packages/api/subscriptionsApi.ts` | Client methods + types |
| `apps/technician/pages/SubscriptionCentrePage.tsx` | Current subscription + actions |
| `apps/technician/pages/UpgradePage.tsx` | Scheduled downgrade/cancel UX |
| `apps/technician/pages/SubscriptionBillingPage.tsx` | Status + manage link |
| `apps/technician/lib/subscriptionPresentation.ts` | FAQ |
| `SUBSCRIPTION_LIFECYCLE_ENHANCEMENT_REPORT.md` | This report |

---

## 8. Validation

| Check | Result |
|-------|--------|
| Upgrades still apply immediately after payment approval | Pass (unchanged activate path; clears schedule) |
| Downgrades are scheduled, not immediate | Pass |
| Unsubscribe is scheduled (cancel at period end) | Pass |
| Paid benefits remain until expiry | Pass (entitlements unchanged until expire job runs) |
| Expiry applies scheduled change | Pass (`expireDueSubscriptions`) |
| Payment history unchanged | Pass |
| Development Transaction flow unchanged | Pass |
| Entitlement engine unchanged | Pass (`resolveEntitlements` not redesigned) |
| Web + Android share API/UI packages | Pass |

---

## 9. Confirmation copy (as implemented)

**Downgrade**

> You'll continue enjoying {CurrentPlan} benefits until {ExpiryDate}.  
> After that, your account will switch to {TargetPlan}.

**Unsubscribe**

> Your subscription will remain active until {ExpiryDate}.  
> After that your account will return to the Free plan. It will not renew automatically.

---

## 10. Notes

- Auto-renew remains **off** (manual MoMo). UI states this explicitly.
- Scheduled downgrade to a paid lower plan starts a new complimentary period of that plan at expiry (same billing length). If the target plan is missing/inactive, the system falls back to cancel → Free.
- Immediate lower-plan checkout via payment is still possible if someone pays for a lower plan; scheduling is the primary UX for downgrade without payment.
- Admin discovery `allowDowngrade` no longer blocks technician scheduling (scheduling is always allowed for active paid users).
