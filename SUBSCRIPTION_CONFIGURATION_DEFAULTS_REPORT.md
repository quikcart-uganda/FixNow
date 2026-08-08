# SUBSCRIPTION_CONFIGURATION_DEFAULTS_REPORT

## Summary

First-install subscription defaults are seeded into MongoDB (`SubscriptionPlan` + `PlatformSetting`) when missing. Administrators can change every value afterward without code changes. Re-running ensure/seed does **not** overwrite existing plan prices or admin-edited settings.

---

## Default values seeded (only if absent)

### Billing periods — `marketplace.subscription_billing_periods`

| Key | Default |
|-----|---------|
| `monthlyDays` | 30 |
| `quarterlyDays` | 90 |
| `halfYearlyDays` | 182 |
| `yearlyDays` | 365 |
| `defaultGracePeriodDays` | 3 |
| `currency` | UGX |

### Plan prices — created via `ensureSubscriptionCatalogue` / `seedPlan`

| Plan | Monthly | Quarterly | Half-year | Yearly |
|------|---------|-----------|-----------|--------|
| Starter | 45,000 | 120,000 | 240,000 | 420,000 |
| Professional | 85,000 | 230,000 | 450,000 | 800,000 |
| Business | 150,000 | 400,000 | 780,000 | 1,400,000 |

Currency and grace for new plans come from billing-periods setting. Feature flags / limits use existing plan defaults in the Subscription model (still editable per plan in Admin).

### Other settings seeded if missing

- `marketplace.subscription_momo`
- `marketplace.subscription_reminders` (includes `daysBeforeExpiry: [14,7,3,1,0]`)
- `marketplace.subscription_discovery`

---

## Existing hardcoded values removed / neutralized

| Location | Change |
|----------|--------|
| `periodDays()` literals | Replaced by `resolvePeriodDays()` → PlatformSetting |
| Activation `* 30` months override | Uses configured monthly days |
| Schema price defaults 45k/… | Set to `0` (seed supplies real prices) |
| Schema grace default 3 | Set to `0` (seed / billing defaultGrace) |
| Expiry / entitlements `?? 3` | Plan grace → billing `defaultGracePeriodDays` |
| freeJob hardcoded grace 3 | Removed; `past_due` = in grace |
| UI “UGX 0” / implied 30-day months | Currency/currency + duration days from API |

Seed constants remain in `subscriptionBillingConfig.ts` (`SEED_PLAN_PRICES`, `SEED_BILLING_PERIODS`) **only** for first install — not read on every request after settings exist.

---

## Admin configuration screens connected

**Admin → Subscriptions → Tools**

| Tab | Manages |
|-----|---------|
| Plan cards → Pricing / General / … | Prices, currency, grace, features, flags, limits, badge, visibility |
| **Billing periods** | Monthly / quarterly / half / yearly days, default grace, currency |
| Reminders | Enabled, frequency, **days before expiry list**, channels |
| Mobile Money | Payee / currency / instructions |
| Upgrade discovery | Free card, featured plans, hero copy, downgrade messaging |

APIs:

- `GET/PUT /admin/subscriptions/billing-periods`
- Existing catalogue / plan / reminders / discovery / momo endpoints

---

## Runtime behaviour

- Every public catalogue and `getMine` response includes `billingPeriods` and per-plan `durationDays`.
- Technician Upgrade page shows “/ mo (30 days)” style labels from config (numbers live).
- Socket `subscription:catalogue_updated` refreshes open technician subscription screens when Admin saves.

---

## Validation

| Check | Result |
|-------|--------|
| Default monthly 30 / quarterly 90 / yearly 365 | Seeded in billing periods setting |
| Existing production prices seeded for Pro/Business | Yes (SEED_PLAN_PRICES) |
| Starter 45k / 120k / 420k | Yes |
| No overwrite if configuration already exists | `seedPlan` + PlatformSetting find-before-create |
| Existing subscriptions / users unmodified | Yes — seed does not touch Subscription / profile docs |
| Admin edits without code | Yes |

---

## Files

- `backend/src/services/marketplace/subscriptionBillingConfig.ts` (seed + getters/updaters)
- `backend/src/services/marketplace/subscription.service.ts` (`ensureSubscriptionCatalogue`)
- Admin / API / technician wiring as listed in `DYNAMIC_SUBSCRIPTION_CONFIGURATION_REPORT.md`
