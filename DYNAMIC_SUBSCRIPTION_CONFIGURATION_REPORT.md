# DYNAMIC_SUBSCRIPTION_CONFIGURATION_REPORT

## Summary

Subscription prices, billing-period lengths, reminder day offsets, grace defaults, and related catalogue settings are now admin-driven via `SubscriptionPlan` documents and `PlatformSetting` keys. Runtime activation, remaining-days, expiry, and reminder evaluation read configuration from the database — not from hardcoded business constants. Entitlement rules, payment verification, and plan codes were not redesigned.

---

## Architecture

```
Admin Portal (Subscriptions)
  ├─ Per-plan pricing / grace / flags / limits / badges / visibility
  ├─ Billing periods (monthly/quarterly/half/yearly days + default grace + currency)
  ├─ Reminders (daysBeforeExpiry array + channels)
  ├─ MoMo payee details
  └─ Discovery (hero, featured plans, Free card visibility)
           │
           ▼
PlatformSetting + SubscriptionPlan (MongoDB)
           │
           ▼
subscription.service / subscriptionBillingConfig
  ├─ resolvePeriodDays() → activation length
  ├─ expireDueSubscriptions() → scheduled cancel/downgrade → grace → expire
  └─ evaluate / fan-out reminders
           │
           ▼
Technician apps (Upgrade / Subscription Centre)
  ← HTTP catalogue + Socket `subscription:catalogue_updated`
```

---

## Configuration moved from code

| Former hardcode | Now |
|-----------------|-----|
| `periodDays()` 30 / 90 / 182 / 365 | `marketplace.subscription_billing_periods` |
| Reminder days 7 / 3 / 1 / 0 only | `reminders.daysBeforeExpiry` (default seed `[14,7,3,1,0]`) |
| Grace fallback `?? 3` in expiry / entitlements | Plan `gracePeriodDays` → else billing `defaultGracePeriodDays` |
| Activation `end = start + days + grace` | `end = start + periodDays` only; grace at expiry |
| Schema price defaults 45k/120k/… | Schema defaults `0`; seed writes real prices once |
| Analytics currency `'UGX'` | Billing periods `currency` |
| Reminder copy always “Starter” | Uses active plan name |

**Still identity-only (not product pricing):** plan codes `STARTER` / `PROFESSIONAL` / `BUSINESS` / `FREE`, `PLAN_RANK` for upgrade/downgrade direction.

**Seed-only constants** (written to DB when missing; never overwrite admin edits): `SEED_PLAN_PRICES`, `SEED_BILLING_PERIODS` in `subscriptionBillingConfig.ts`.

---

## Realtime update mechanism

1. Admin saves plan / periods / reminders / discovery / MoMo → audit log + `emitSubscriptionCatalogueUpdated(reason)`.
2. Socket event: `subscription:catalogue_updated` to `role:technician` and `role:admin`.
3. Technician `UpgradePage` and `SubscriptionCentrePage` reload catalogue / `getMine` on that event (no logout required).
4. Fallback: normal navigation / `useAsync` refetch still pulls latest DB values.

---

## Scheduler / expiry engine

| Job | Where | Behaviour |
|-----|-------|-----------|
| Expiry + scheduled transitions | `expireDueSubscriptions` in CMS maintenance lease (~60s) **and** on `GET /subscriptions/me` | Cancel-at-period-end → Free; scheduled downgrade → lower plan; else grace (`past_due`) then `expired` + optional lock |
| Reminder fan-out | `processSubscriptionReminderFanout` in same worker | Matches `daysBeforeExpiry`; writes notification centre items (deduped by `frequencyDays`) |
| Prepaid honour | Unchanged lifecycle APIs | Downgrade / cancel schedule only; benefits until `currentPeriodEnd` |
| Upgrades | Immediate on payment approve / activate | Recalc period from admin billing days |

---

## Notification engine

- In-app banner / popup: existing reminder evaluation endpoint (now config-driven days).
- Notification centre: fan-out + activation / grace / expired / scheduled change notifications.
- Push / email flags remain admin toggles on reminder config.

---

## Files modified

**Added**
- `backend/src/services/marketplace/subscriptionBillingConfig.ts`
- `DYNAMIC_SUBSCRIPTION_CONFIGURATION_REPORT.md`
- `SUBSCRIPTION_CONFIGURATION_DEFAULTS_REPORT.md`

**Backend**
- `subscription.service.ts` — periods, reminders, activation, expiry, fan-out, catalogue serialization
- `entitlements.service.ts` — grace from plan / billing config
- `freeJob.service.ts` — no hardcoded grace days
- `jobs/index.ts` — subscription expiry + reminder worker
- `controllers/index.ts`, `routes/index.ts` — billing-periods admin APIs
- `sockets/events.ts`, `sockets/realtime.ts` — catalogue updated event
- `models/marketplace/Subscription.ts` — neutral schema price defaults

**Frontend / API**
- `packages/api/adminApi.ts`, `subscriptionsApi.ts`, `socketEvents.ts`
- `apps/admin/pages/SubscriptionsPage.tsx` — Billing periods + reminder day editor
- `apps/technician/pages/UpgradePage.tsx` — live reload + duration labels from config
- `apps/technician/pages/SubscriptionCentrePage.tsx` — live reload

---

## Validation

| Check | Result |
|-------|--------|
| No runtime `periodDays` 30/90/365 constants | Pass — config service |
| Prices from Admin / DB for UI | Pass — catalogue API |
| Admin period edits affect new activations | Pass — `resolvePeriodDays` |
| Remaining days from period end | Pass — unchanged calc, config-driven end |
| Expiry automatic without opening app | Pass — background worker |
| Reminders use configurable day list | Pass |
| Paid access until expiry (cancel/downgrade) | Pass — existing schedule APIs |
| Upgrades immediate | Pass |
| Audit on plan / periods / discovery updates | Pass |
| Entitlement / payment verification unchanged | Pass |

---

## Related

Seed-only first-install defaults: see `SUBSCRIPTION_CONFIGURATION_DEFAULTS_REPORT.md`.  
Graceful cancel/downgrade scheduling: see `SUBSCRIPTION_LIFECYCLE_ENHANCEMENT_REPORT.md`.
