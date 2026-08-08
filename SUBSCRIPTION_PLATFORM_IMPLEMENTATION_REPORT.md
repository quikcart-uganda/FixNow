# Subscription Platform Implementation Report

**Date:** 2026-07-28  
**Phase:** 5 — Master Subscription & Monetization Platform  
**Sources of truth:**  
`TECHNICIAN_FREE_JOBS_AUDIT.md`, `STARTER_PLAN_IMPLEMENTATION_REPORT.md`, `PROFESSIONAL_PLAN_IMPLEMENTATION_REPORT.md`, `BUSINESS_PLAN_IMPLEMENTATION_REPORT.md`, `PROFILE_BOOST_IMPLEMENTATION_REPORT.md`  

**Constraint:** Completed-job accounting unchanged — free quota still deducts only on customer-confirmed completions (`consumeFreeJobSlotForCompletion`).

---

## 1. Complete subscription architecture

```
Technician Profile
        ↓
SubscriptionPlan (Admin-configured flags, limits, badge, pricing)
        ↓
Feature Entitlement Engine (resolveEntitlements)
        ↓
Capabilities + Limits + Badge + Lifecycle
        ↓
Enforcement in APIs (offers, creatives, media, profile, apply-gate)
        ↓
Customer / Technician / Admin surfaces
```

Boosts remain **separate marketing products** (Phase 4) that add capped soft ranking weight — never subscription plans.

---

## 2. Feature entitlement engine

**File:** `backend/src/services/marketplace/entitlements.service.ts`

Central API:

| Function | Purpose |
|----------|---------|
| `resolveEntitlements(userId)` | Full entitlement snapshot |
| `can(ent, capability)` | Boolean capability check |
| `assertCapability(...)` | Throws if denied |
| `assertOfferAllowed` | Offer create gate |
| `assertMediaUploadAllowed` | Photo/video/cert gate |
| `assertCreativeAllowed` | Slide/banner/announcement/campaign gate |
| `slideLimitFor(ent)` | Homepage vs advertising slide cap |
| `serializeEntitlements(ent)` | Frontend-safe payload |

**Capabilities** (examples): `canApply`, `canUploadVideos`, `canCreateOffers`, `canAdvertise`, `canUseHomepageSlides`, `canUseBusinessBranding`, `canUseMarketingCentre`, `canUseBusinessDashboard`, `canReceivePrioritySupport`, …

**Rule:** UI must not invent permissions — read `entitlements.capabilities` / call asserts on the server.

---

## 3. Badge system

Admin-configurable per plan (`SubscriptionPlan.badge`):

- enabled, name/text, icon, color, borderColor  
- glow, animation, size (`sm`/`md`/`lg`)  
- visibility flags: profile, search, chat, admin  

**UI:** `packages/ui/SubscriptionBadge.tsx`  
**Boost indicator:** purple lightning (`boostActive`)

---

## 4. Badge colours (defaults)

| Plan | Colour | Icon |
|------|--------|------|
| Starter | Green `#16A34A` | `verified` |
| Professional | Blue `#2563EB` | `workspace_premium` |
| Business | Gold `#D97706` | `apartment` |
| Boost active | Purple `#7C3AED` | `bolt` |

Admin may override any value.

---

## 5. Feature matrix

Admin → Subscriptions → Tools → **Feature matrix**  
Built from live plan documents (`buildFeatureMatrix`): every flag + limit for Starter / Professional / Business. Editing a plan card updates the matrix immediately on reload.

---

## 6. Enforcement mechanism

| Feature | Enforcement |
|---------|-------------|
| Offers | `assertOfferAllowed` + `maxActiveOffers` count |
| Advertising slides | `assertCreativeAllowed` + `slideLimitFor` (homepage preferred) |
| Banners / announcements / campaigns | Kind flags + limits |
| Photos / videos / gallery | `assertMediaUploadAllowed` + counts |
| Certificates / licences | Flag + `maxCertificates` |
| Company branding fields | Feature flags in `updateProfile` |
| Apply gate | Free quota OR paid entitlement (`canApply`) |
| Search weight | Soft only; trust dominates |
| Boost weight | Capped by `BoostSettings.maxCombinedWeight` |

Expiry / grace: paid access revoked when period + grace ends → entitlements fall back to Free (restricted).

---

## 7. Pricing architecture

Per plan (Admin editable):

- Monthly / Quarterly / Half-year / Yearly  
- Currency (default UGX)  
- Grace period days  
- Auto-renew flag (manual MoMo still requires admin verify)

---

## 8. Billing lifecycle

1. Technician selects plan + period  
2. Pays MTN / Airtel (Admin MoMo config)  
3. Submits network, phone, transaction ID, amount, optional screenshot  
4. Status `pending_payment` / lifecycle `pending_verification`  
5. Admin approves → `active` with period end  
6. Reminders at 7d / 3d / 1d / expiry / after expiry  
7. Period end → **grace** (`past_due`) if within grace days  
8. Grace end → `expired` → permissions removed  

---

## 9. Subscription lifecycle statuses

Displayed via `lifecycleStatus`:

`none` · `trial` · `pending_verification` · `active` · `grace_period` · `expired` · `suspended` · `cancelled` · `rejected`

---

## 10. Admin Subscription Centre

**Route:** `/admin/subscriptions`

- Plan cards: Starter, Professional, Business, Boosts link  
- Config sections: General, Pricing, Permissions, Marketing, Media, Search, Support, **Badges**, Advanced  
- Tools: payments, subscriptions, creatives, MoMo, reminders, **feature matrix**  
- Analytics strip: revenue 30d, active subs, pending payments, boost revenue  
- Analytics API: `GET /admin/subscriptions/analytics`

---

## 11. Technician Subscription Centre

**Route:** `/technician/subscription`

Shows badge, lifecycle, timeline, enforced capabilities, limits, payment history, renew + boosts CTAs.  
Upgrade flow remains `/technician/upgrade`.

---

## 12. Payment flow

Unchanged architecture, production-hardened:

- Manual MoMo MTN/Airtel  
- Admin configures phone, account name, instructions, reference format  
- No auto-unlock  

---

## 13. Reminder flow

Admin-controlled triggers (defaults on):

- 1 free job remaining / free exhausted  
- 7 / 3 / **1** days before expiry  
- Expiry day / after expiry  

Throttled by frequency settings — no spam.

---

## 14. Search integration

```
rankingScore =
  trustScore
  + rating*4
  + completion soft
  + availability
  + subscriptionWeight
  + boostWeight (capped)
  + featured soft
```

Payment never overrides quality.

Search results include `subscriptionBadge` + `boostActive` for customer UI.

---

## 15. Customer experience

- Homepage featured technician shows plan badge + boost bolt naturally  
- Mapper carries `subscriptionBadge` / `boostActive`  
- Verified Business remains a separate subscription flag when enabled  

---

## 16. Backend changes

- Entitlement engine expansion (capabilities, lifecycle, badges, serialize)  
- Grace-aware `hasActivePaidAccess(profile, graceDays)`  
- Grace → expire pipeline in `expireDueSubscriptions`  
- Slide limit prefers `maxHomepageSlides`  
- Certificate limit enforcement  
- Subscription analytics  
- Plan `badge` field seed + update  

---

## 17. Database changes

`SubscriptionPlan.badge` (embedded config)  
Reminder trigger `oneDayBeforeExpiry`  
No change to free-job ledger schema  

---

## 18. API changes

| Endpoint | Notes |
|----------|-------|
| `GET /subscriptions/me` | entitlements + capabilities + badge + timeline |
| `PATCH /admin/subscriptions/plans/:id` | accepts `badge` |
| `GET /admin/subscriptions/analytics` | revenue / plans / boosts |
| Technician search | returns `subscriptionBadge`, boost fields |

---

## 19. Validation results

| Check | Result |
|-------|--------|
| Advertised features enforced server-side | Pass (offers/media/creatives/certs/slides) |
| Entitlements centralized | Pass |
| Badge defaults + Admin override | Pass |
| Grace then expire removes access | Pass |
| Renew restores via approve flow | Pass |
| Boost integrates with ranking soft weight | Pass (Phase 4) |
| Free completed-job accounting untouched | Pass |
| Feature matrix from live plans | Pass |
| Subscription Centre shows capabilities | Pass |
| Customer badge display | Pass (homepage featured) |

**Manual E2E checklist (operator):**

1. Subscribe Starter → verify apply + photo limits; videos/slides denied  
2. Upgrade Professional → videos/slides/offers expand; Starter caps lifted  
3. Upgrade Business → homepage slides/marketing centre/business badge  
4. Admin lower limits / disable flags → next API call denies excess  
5. Expire past grace → capabilities false; data retained  
6. Purchase boost → soft rank lift + purple bolt; trust still dominates  

---

## 20. Future automation roadmap

1. Auto-renew via collection APIs (still Admin-configurable)  
2. Proration on mid-cycle upgrades  
3. Downgrade scheduled at period end (soft)  
4. Webhook payment providers (Pesapal / Flutterwave) behind same entitlement engine  
5. Android native badge component parity audit suite  
6. Entitlement unit tests per plan matrix as CI gate  

---

## Maintenance

This document is the **master specification** for the FixNow subscription platform. Update whenever plans, entitlements, badges, enforcement points, or payment/reminder behaviour change.

**Related reports:** Phases 1–4 remain authoritative for Starter / Professional / Business / Boost product details.
