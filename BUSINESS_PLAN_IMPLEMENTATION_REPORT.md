# Business Plan Implementation Report

**Date:** 2026-07-28  
**Phase:** 3 — Technician Business subscription  
**Sources of truth:** `TECHNICIAN_FREE_JOBS_AUDIT.md`, `STARTER_PLAN_IMPLEMENTATION_REPORT.md`, `PROFESSIONAL_PLAN_IMPLEMENTATION_REPORT.md`  
**Constraint:** Completed-job accounting unchanged (customer-confirmed completions only via `consumeFreeJobSlotForCompletion`). Free quota is not consumed while paid access is active.

---

## 1. Business plan overview

Business is **not** “Professional with higher numbers.” It turns FixNow into a **company management portal** for registered service companies and growing providers (electrical, plumbing, cleaning, security install, solar, pest control, building maintenance, HVAC, and similar).

Business subscribers get:

- A distinct **company command-centre dashboard** (not Starter/Pro layout)
- A **Marketing Centre** (Business-only CMS hub over existing creatives + offers)
- **Homepage advertising** at higher default caps (8 slides / 10 offers / 6 banners)
- **Company profile** with mission, vision, registration, tax (optional), and verification
- **Verified Business** badge + highest **fair** search weighting
- **Team** module placeholders (employees, dispatch, assignments — future-ready)
- Same MoMo + **admin-verify** payment flow as Starter / Professional (`planCode: BUSINESS`)

Nothing customer-facing publishes without Admin approval. Limits and flags are stored on `SubscriptionPlan` and are fully admin-editable — nothing is hardcoded for production behaviour beyond seed defaults.

---

## 2. Complete Business feature list

| Area | Capability |
|------|------------|
| Access | Unlimited applications & completed jobs (while paid) |
| Badge | Verified Business badge |
| Profile | Premium company profile, logo, cover, slogan, colours |
| Company | Mission, vision, registration number, optional tax ID |
| Verification | Business verification request → admin approve/reject + notify |
| Media | Unlimited photos / gallery / certificates; max 50 videos (default) |
| Marketing Centre | Business-only hub for campaigns, offers, announcements |
| Advertising | Up to 8 homepage slides (default) |
| Offers | Up to 10 active promotional offers (default) |
| Banners | Up to 6 promotional banners (default) |
| Announcements / campaigns | Higher caps (30 / 20 defaults) |
| Analytics | Business statistics, lead / advertising / performance flags |
| Search | Highest fair weighting + featured / recommendation weights |
| Support | Priority support flag |
| Team | Placeholder UI for employees, dispatch, assignments, performance, availability |
| Branches | Flag `branchesReady` for future multi-location |
| Billing | Monthly / quarterly / **half-year** / yearly MoMo |
| Boosters | Admin card reserved (not sold yet) |

---

## 3. Default Business permissions

Defaults only — Admin may change every flag and limit on the Business plan card.

### Feature flags (`DEFAULT_BUSINESS_FEATURES`)

Inherits Professional flags, plus:

- `verifiedBusinessBadge`, `marketingCentre`, `companyVerification`
- `businessRegistration`, `taxInformation`
- `homepagePromotions`, `seasonalCampaigns`
- `leadAnalytics`, `advertisingAnalytics`
- `dispatcher`, `teamManagement`, `branchesReady`
- `advancedEarnings`, `customerInsights`

### Limits (`DEFAULT_BUSINESS_LIMITS`)

| Limit | Default |
|-------|---------|
| `maxPhotos` | 9999 (unlimited) |
| `maxVideos` | 50 |
| `maxCertificates` | 9999 |
| `maxGalleryItems` | 9999 |
| `maxActiveOffers` | 10 |
| `maxPromotionalBanners` | 6 |
| `maxProfileBanners` | 8 |
| `maxAdvertisingSlides` | 8 |
| `maxHomepageSlides` | 8 |
| `maxAnnouncements` | 30 |
| `maxCampaigns` | 20 |
| `searchPriorityWeight` | 28 |
| `featuredWeighting` | 12 |
| `recommendationWeighting` | 10 |

### Seed pricing (editable)

| Period | Default UGX |
|--------|-------------|
| Monthly | 150,000 |
| Quarterly | 400,000 |
| Half-year | 780,000 |
| Yearly | 1,400,000 |

---

## 4. Admin configuration interface

**Route:** Admin → Subscriptions (`apps/admin/pages/SubscriptionsPage.tsx`)

Redesigned landing:

```
Subscription Plans
--------------------------------
[ Starter ] [ Professional ] [ Business ] [ Boosters ]
```

- Each live plan is a **clickable card** (price + short description).
- **Boosters** is a dashed placeholder for future lead packs / featured boosts.
- **Tools** row opens operational queues: pending payments, subscriptions, marketing approval, Mobile Money, reminders.

---

## 5. Subscription configuration window

Clicking a plan opens a dedicated configuration window with section chips:

| Section | Controls |
|---------|----------|
| General | Name, description, active, visible, display order |
| Pricing | Monthly / quarterly / half-year / yearly, currency, grace, auto-renew |
| Permissions | All `featureFlags` as switches |
| Marketing | Slide / homepage / banner / offer / announcement / campaign caps + marketing flags |
| Media | Photos, videos, gallery, certificates, profile banners |
| Search visibility | Search / featured / recommendation weights + badges / featured placement |
| Support & renewal | Priority / standard support, auto-renew |
| Advanced | Dispatcher, team, branches, lead & advertising analytics |

Saving calls `PATCH /admin/subscriptions/plans/:id`. Entitlements resolve from the live plan document — changes apply immediately to new entitlement reads.

Public catalogue respects `isVisible` (`listPublicPlans` filters hidden plans).

---

## 6. Marketing Centre

**Route:** `/technician/business/marketing-centre`  
**Gate:** `featureFlags.marketingCentre` or active Business entitlements.

Behaviour:

- CMS-style hub (capacity meters for slides, banners, offers, announcements)
- Deep-links into existing Professional marketing studio (`/technician/marketing/creatives`) and offers
- Non-Business users see an upgrade lock screen (can still use Pro studio if entitled)

Reuses `TechnicianMarketingCreative` + `TechnicianOffer` — **no duplicate marketing stack**.

---

## 7. Homepage advertising system

- Plan caps: `maxAdvertisingSlides` / `maxHomepageSlides` (Business default **8**)
- Creative kind `slide`: image, headline, subtitle/description, CTA label/href, promotion text, expiry, priority
- Workflow: draft → submit → **admin approve** → live
- Customer delivery: `GET` marketing deliver endpoint → `ProfessionalPromoSlider` on customer homepage
  - Auto-rotate ~5.5s
  - Manual swipe + arrow controls
  - Responsive aspect ratios (web + Android WebView)
  - View/click tracking

---

## 8. Promotional offers

- Reuses existing offers module + admin moderation
- Business default: **10** active offers (`maxActiveOffers`)
- Examples supported by content (not separate product types): % off, bundles, holiday, emergency, packages, maintenance, inspection, referral
- Technician notified on approve / reject (`offer.approved` / `offer.rejected`)

---

## 9. Promotional banners

- Creative kind `banner`; Business default **6** (`maxPromotionalBanners`)
- Same approval workflow as slides
- Delivered with slides to customer surfaces
- When `endsAt` passes, creatives flip to `expired` and technicians are notified (`technician.marketing_expired`)

Placement remains configurable via creative metadata / admin review; customer homepage is the primary rotating surface today.

---

## 10. Company profile

**Route:** `/technician/business/company`

Fields (server-gated by plan flags where applicable):

- Company name, slogan, logo URL, cover URL
- Brand primary / secondary colours
- About / bio, mission, vision
- Business registration number, tax ID (optional)
- **Business verification** status + “Submit for verification”

Public technician payload includes company branding + `businessVerificationStatus` for customer company presentation.

Admin compliance menu: **Approve / Reject business verification** (notifications: `technician.business_verification_approved` / `_rejected`).

---

## 11. Dashboard redesign

**Route:** `/technician/business` (also default home when `subscriptionPlanCode === 'BUSINESS'` and paid access is active)

Company portal sections:

- Company overview hero + Verified Business badge
- Subscription / renewal
- Visibility score (search weight)
- Pending approvals
- Business statistics (offer + ad views/clicks/bookings)
- Marketing usage vs limits
- Quick links: Marketing Centre, Company profile, Team (soon), Upgrade/billing
- Business tips + recent activity from professional dashboard API

Intentionally distinct styling (dark teal command centre) vs Professional dashboard.

**Team placeholders:** `/technician/business/team` — Employees, Dispatch, Assignments, Performance, Availability (no full dispatch in Phase 3).

---

## 12. Database changes

### `SubscriptionPlan`

- Extended `featureFlags` (Business marketing / verification / analytics / team flags)
- Extended `limits` (`maxHomepageSlides`, `maxCampaigns`, `featuredWeighting`, `recommendationWeighting`, recalibrated Business defaults)
- `priceHalfYear`, `isVisible`, billing period enum includes `half_yearly`
- Seed / backfill ensures BUSINESS plan exists with Phase 3 defaults

### `TechnicianProfile`

- `companyMission`, `companyVision`
- `businessRegistrationNumber`, `taxIdentificationNumber`
- `businessVerificationStatus` (`unverified` | `pending` | `verified` | `rejected`)
- `businessVerificationNote`
- Existing: `companyName`, `businessLogoUrl`, `businessSlogan`, brand colours, cover

### Unchanged (by design)

- Free-job ledger / `consumeFreeJobSlotForCompletion`
- `TechnicianMarketingCreative` / `TechnicianOffer` models (reused)
- MoMo payment + admin approval subscription unlock

---

## 13. Backend APIs

| Area | Endpoints / services |
|------|----------------------|
| Plans | `GET /subscriptions/plans` (includes `business`, `priceHalfYear`, visibility filter) |
| Mine | `GET /subscriptions/me` entitlements (`isBusiness`, `marketingCentre`, `verifiedBusinessBadge`, …) |
| Pay | `POST /subscriptions/payments` — periods include `half_yearly` |
| Admin catalogue | `GET /admin/subscriptions/catalogue` |
| Admin plan patch | `PATCH /admin/subscriptions/plans/:id` |
| Creatives | Existing technician + admin marketing creative APIs |
| Dashboard | `GET /technicians/me/professional-dashboard` (Business usage + tips) |
| Profile | `PATCH /technicians/me/profile` — company fields + `requestBusinessVerification` |
| Admin tech | `PATCH /admin/technicians/:id` — `businessVerificationStatus` + notify |
| Customer | Marketing deliver + track (shared with Professional) |

Entitlements: `backend/src/services/marketplace/entitlements.service.ts`  
Catalogue seed: `subscription.service.ts` → `ensureSubscriptionCatalogue`

---

## 14. Frontend changes

### Technician

- `BusinessDashboardPage.tsx`
- `MarketingCentrePage.tsx`
- `CompanyProfilePage.tsx`
- `CompanyTeamPlaceholderPage.tsx`
- Routes under `/technician/business/*`
- `DashboardPage.tsx` routes Business → Business dashboard
- `UpgradePage.tsx` — three-plan compare + half-year billing

### Admin

- Redesigned `SubscriptionsPage.tsx` — plan cards + config window + tools
- Technician menu: approve/reject business verification

### Customer

- `ProfessionalPromoSlider` — delivers Business + Professional approved slides (limit 8)
- Homepage continues to embed slider without interrupting primary flow

### Shared packages

- Types / mappers: company branding + verification fields
- `subscriptionsApi`: `half_yearly`, `priceHalfYear`, `business`

---

## 15. Customer experience

Approved Business content appears naturally:

- Homepage hero / advertising carousel (`ProfessionalPromoSlider`)
- Offers surfaces (existing offers UX)
- Technician / company public profile branding fields
- Soft search boost (trust, distance, reviews still dominate)

Does **not** interrupt booking, chat, or job flow. Premium, calm presentation — no aggressive overlays.

---

## 16. Validation results

| Check | Result |
|-------|--------|
| Business dashboard unique vs Starter/Pro | Pass — dedicated command centre |
| Marketing Centre Business-gated | Pass — upgrade lock for others |
| Slides auto-rotate + swipe | Pass — existing slider, limit 8 |
| Admin plan cards + Business config | Pass — redesigned Subscriptions page |
| Permissions / limits not hardcoded | Pass — plan document + entitlements |
| Half-year pricing | Pass — model, seed, checkout, admin pricing section |
| Free completed-job accounting unchanged | Pass — no redesign of consume path |
| Creative / offer approval notifications | Pass |
| Banner / creative expiry notifications | Pass — opportunistic expire + notify |
| Business verification approve/reject notify | Pass |
| Team dispatch fully implemented | N/A — placeholders only (by design) |
| Boosters sold | N/A — placeholder card only |

---

## 17. Future roadmap

1. **Full team management** — employee invites, roles, real dispatch, assignment board
2. **Branches** — multi-district company locations using `branchesReady`
3. **Boosters marketplace** — one-off lead packs / featured boosts
4. **Placement matrix** — explicit banner slots (category, search, offer page) beyond homepage
5. **Featured businesses rail** — dedicated customer “nearby / featured companies” row
6. **Richer company CMS** — seasonal campaign templates, A/B creatives
7. **Insurance / licence document vault** with admin checklist UI
8. **Revenue analytics deep-dive** — company P&L style reports for Business

---

## Maintenance

This report is the **official Business Plan documentation**. Update it whenever Business defaults, Marketing Centre scope, admin configuration surfaces, or customer delivery of Business advertising change.

**Related docs:** `STARTER_PLAN_IMPLEMENTATION_REPORT.md`, `PROFESSIONAL_PLAN_IMPLEMENTATION_REPORT.md`, `TECHNICIAN_FREE_JOBS_AUDIT.md`
