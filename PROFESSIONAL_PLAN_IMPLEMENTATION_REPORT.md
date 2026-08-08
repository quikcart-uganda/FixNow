# Professional Plan Implementation Report

**Date:** 2026-07-28  
**Phase:** 2 — Technician Professional subscription  
**Sources of truth:** `TECHNICIAN_FREE_JOBS_AUDIT.md`, `STARTER_PLAN_IMPLEMENTATION_REPORT.md`  
**Constraint:** Completed-job accounting unchanged (customer-confirmed completions only).

---

## 1. Professional plan overview

Professional is the growth plan for experienced technicians. It is not “Starter with more buttons” — it adds:

- A distinct **Professional business dashboard**
- **Marketing studio** (slides, banners, announcements, portfolio campaigns)
- **Admin approval** before any technician creative reaches customers
- **Soft search ranking boost** (fair — trust/distance/reviews still dominate)
- **Professional verified badge** (subscription-based; performance badges remain earned)
- Premium profile branding fields (logo, slogan, colours)

Payment still uses the Starter MoMo + admin-verify flow (`planCode: PROFESSIONAL`).

---

## 2. Default Professional features

Defaults only — every flag/limit is admin-editable on `SubscriptionPlan`.

| Capability | Default |
|------------|---------|
| Unlimited applications / completed jobs | Yes |
| Professional verified badge | Yes |
| Premium profile / company branding / logo / slogan / colours | Yes |
| Advanced availability calendar flag | Yes |
| Customer insights / advanced earnings flags | Yes |
| Photos | Unlimited (9999) |
| Videos | Max 20 |
| Before & after galleries | Yes |
| Certificates / licences / insurance docs flags | Yes |
| Advertising slides | Max 4 |
| Active offers | Max 5 |
| Promotional banners | Max 3 |
| Profile banners | Max 4 |
| Announcements | Max 10 |
| Featured placement | Yes |
| Search priority weight | 18 (soft) |
| Priority support flag | Yes |
| Advanced referral rewards | Yes |
| Dispatcher / team | No (Business) |

---

## 3. Feature comparison against Starter

| Area | Starter | Professional |
|------|---------|--------------|
| Apply / complete jobs | Unlimited | Unlimited |
| Photos | 20 | Unlimited |
| Videos | 0 | 20 |
| Active offers | 2 | 5 |
| Promo banners | 1 | 3 |
| Advertising slides | 0 | 4 |
| Premium badge | No | Yes |
| Featured placement | No | Yes |
| Search weight | 0 | 18 |
| Business logo / colours / slogan | No | Yes |
| Marketing studio slides | No | Yes |
| Dashboard | Standard | Professional business dashboard |

---

## 4. Marketing tools implemented

New model: `TechnicianMarketingCreative`  
Kinds: `slide` | `banner` | `announcement` | `portfolio_campaign`  
Statuses: draft → pending → approved | rejected | changes_requested | paused | expired  

Technician UI: `/technician/marketing/creatives`  
Reuses existing offers module for promotional offers (limits enforced).

---

## 5. Advertising slide system

- Plan limit: `limits.maxAdvertisingSlides` (default 4)
- Flag: `featureFlags.advertisingSlides`
- Technician creates → submits → admin approves
- Customer homepage: `ProfessionalPromoSlider` — auto-advance ~5.5s, swipe + arrows
- Tracking: view/click via `/marketing/creatives/:id/track`

---

## 6. Promotional offers

Reuses `TechnicianOffer` + existing approval workflow.  
`createDraft` now enforces `maxActiveOffers` from entitlements (Professional default 5).

---

## 7. Advertising banners

Creative kind `banner`, limit `maxPromotionalBanners` (default 3).  
Same approval workflow as slides. Delivered alongside slides to customers.

---

## 8. Dashboard redesign

Active Professional/Business technicians see `ProfessionalDashboardPage` instead of the standard dashboard:

- Professional badge + subscription card
- Performance summary (offers + creatives)
- Inventory vs plan limits
- Visibility / ranking indicator
- Pending approvals
- Business tips + renewal status
- Quick links to marketing studio, portfolio, offers

Route also available at `/technician/professional`.

---

## 9. Admin configurable permissions

Admin → Subscriptions:

- **Professional plan** tab — prices, flags, limits (slides/offers/banners/videos/weight)
- **Feature matrix** — Starter / Professional / Business
- **Marketing approval** — approve / reject / request changes
- Existing MoMo, payments, reminders, subscription manage actions

Nothing is hardcoded as product law — defaults seed the catalogue; admin edits apply to new entitlements immediately.

---

## 10. Customer UI integration

- Homepage slider: `apps/customer/components/ProfessionalPromoSlider.tsx`
- Wired under existing `PremiumSponsorHero` on `HomePage`
- Search results include `premiumBadge`, `featuredPlacement`, branding fields
- Soft ranking score blends trust, rating, completions, availability, plan weight

---

## 11. Approval workflow

```
Technician creates creative
        ↓
Draft → Submit
        ↓
Admin reviews (Subscriptions → Marketing approval)
        ↓
Approve | Reject | Request changes
        ↓
Only approved + in-date creatives appear for customers
```

Notifications: `technician.marketing_approve|reject|request_changes`.

---

## 12. Database changes

| Collection / fields | Change |
|---------------------|--------|
| `SubscriptionPlan.featureFlags` | Expanded Pro flags |
| `SubscriptionPlan.limits` | `maxAdvertisingSlides`, `maxAnnouncements`, `searchPriorityWeight` |
| `TechnicianMarketingCreative` | New |
| `TechnicianProfile` | `companyName`, `businessLogoUrl`, `businessSlogan`, `brandPrimaryColor`, `brandSecondaryColor` |

Free-job fields untouched.

---

## 13. Backend APIs

**Technician**

- `GET/POST /marketing/creatives/me`
- `PATCH /marketing/creatives/me/:id`
- `POST .../submit` · `POST .../pause` · `DELETE ...`
- `GET /technicians/me/professional-dashboard`

**Customer**

- `GET /marketing/creatives/customer`
- `POST /marketing/creatives/:id/track`

**Admin**

- `GET /admin/marketing/creatives`
- `POST /admin/marketing/creatives/:id/moderate`

**Shared**

- Entitlements: `resolveEntitlements` / assert helpers
- Portfolio + offers enforce plan limits
- Search ranking uses plan `searchPriorityWeight` + featured flag

---

## 14. Frontend changes

| Path | Role |
|------|------|
| `apps/technician/pages/ProfessionalDashboardPage.tsx` | Pro dashboard |
| `apps/technician/pages/DashboardPage.tsx` | Routes Pro techs to Pro dashboard |
| `apps/technician/pages/marketing/MarketingCreativesPage.tsx` | Marketing studio |
| `apps/technician/pages/UpgradePage.tsx` | Starter + Professional checkout |
| `apps/technician/routes.tsx` / `MarketingLayout.tsx` | Routes + nav |
| `apps/customer/components/ProfessionalPromoSlider.tsx` | Customer slider |
| `apps/customer/pages/HomePage.tsx` | Embed slider |
| `apps/admin/pages/SubscriptionsPage.tsx` | Pro settings + creative approval |
| `packages/api/technicianMarketingApi.ts` | Client |
| `packages/api/adminApi.ts` | Moderate creatives |

---

## 15. Validation results

| Check | Status |
|-------|--------|
| Free-job accounting unchanged | Yes |
| Professional dashboard distinct | Yes |
| Marketing tools + approval | Yes |
| Slider auto + manual | Yes |
| Offer/slide/banner limits from plan | Yes |
| Search boost soft / fair | Yes |
| Admin can change all defaults | Yes |
| No auto-publish | Yes |
| MoMo payment path reused | Yes |

---

## 16. Remaining future enhancements

- Enforce branding field writes in profile PATCH via entitlements
- Surface public portfolio galleries more deeply on customer tech pages
- Email channel for creative approval when `emailEnabled`
- Business plan dispatcher/team modules
- Denormalized ranking score on profile for larger search sets
- Persist reminder throttle server-side per event key
- Customer category pages / nearby widgets for Pro banners beyond homepage

---

*Official documentation for the Professional Plan. Maintain this file as the feature evolves.*
