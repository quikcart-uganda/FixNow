# UX Content Audit Report

**Scope:** End-to-end audit of Customer and Technician experience — why screens looked empty despite a running backend, how content now flows from database → API → UI, and what was seeded/fixed so the product feels production-ready before Cloudinary.

**Status:** Root causes identified and fixed. Backend listening on `:4000`. Delivery APIs return populated, audience-filtered payloads. Local asset library in place for seamless Cloudinary migration.

---

## 1. Executive finding

| Layer | Status before | Status after |
|---|---|---|
| Database | Data **existed** (14 categories, 23 technicians, 6 promos, 11 sponsored, 8 offers) | Enriched: 15 categories, 19 content blocks, 8 promos, 19 sponsored, technician-specific rows |
| API | Categories/technicians/offers **worked**; platform promos & sponsored had **no public delivery** | `GET /marketing/{public,customer,technician}` + content blocks delivery |
| Frontend fetch | Real APIs called via `useAsync` | Unchanged architecture |
| Frontend state | **Sticky empty cache** hid live data | Cache never locks on empty; Retry always hits network; SWR updates React |
| UI layout | Vertical one-word wrapping from Tailwind `max-w-md` → 16px | Already mitigated (`--space-*`); empty states now use `max-w-prose` |
| Images | Seed banners pointed at unservable `/uploads/placeholders/...` | Catalog keys `asset:…` → `public/assets/images/…` |

**Content did not disappear in the database.** It disappeared in (1) a stale-while-revalidate cache that preferred empty arrays, and (2) missing public marketing delivery + broken image URLs.

---

## 2. Dependency map (where content disappeared)

```
MongoDB (data present)
  → services (list/search/homeFeed OK)
  → controllers / routes
  → GET /categories, /technicians/search, /offers/public*  ✅ already returned items
  → GET /admin/marketing/* only (no public feed)           ❌ gap
  → Axios @ http://localhost:4000/api/v1
  → useAsync + withCachedLoader(preferCache: true)
       └─ cached [] treated as hit → status "empty"        ❌ primary UI bug
       └─ background refresh wrote cache but not React     ❌
       └─ Retry skipped network while cache still "fresh"  ❌
  → AsyncStateView status==="empty" → children never render
  → Home never fetched platform promos / ads               ❌
```

---

## 3. Datasets

### Existing (before this audit)

| Dataset | Collection count (approx.) | Notes |
|---|---|---|
| Categories | 14 | From `seed:marketing` |
| Technician profiles | 23 | Search API returned all |
| Users | 57 | Mixed roles |
| Jobs | 20 | |
| Technician offers | 8 | Public home feed populated |
| Platform promotions | 6 | Admin-only until this work |
| Sponsored content | 11 | Admin-only; no audience field |
| Content pages (CMS) | 28 | Long-form legal/help |
| Content blocks | 7 | Partial seed; feature cards collided |

### Missing / incomplete

| Dataset | Gap |
|---|---|
| Subcategories | Still 0 (not required for home rails) |
| Public marketing feed | Did not exist |
| Technician-audience promos/ads | Did not exist (customer copy would have leaked if shared) |
| Internet & CCTV category | Missing from seed list |
| Servable promo/ad images | Placeholder paths behind signed UUID-only `/uploads` gate |
| Content blocks uniqueness | Same `type+section` skipped 2nd feature card / slides |

### Created / repaired (this audit)

| Action | Result |
|---|---|
| `npm run seed:ux` | Idempotent repair + technician marketing |
| Categories | **15** (added Internet & CCTV) |
| Content blocks | **19** |
| Platform promotions | **8** (6 customer + 2 technician) |
| Sponsored contents | **19** (customer ads/edu + technician ads/edu) |
| Banner URLs | Repointed to `asset:…` catalog keys |

---

## 4. APIs audited

| Endpoint | Auth | Result |
|---|---|---|
| `GET /categories` | none | 15 items |
| `GET /technicians/search` | none | 23 items |
| `GET /offers/public` | optional | 5 items |
| `GET /offers/public/home` | optional | All rails populated |
| `GET /content/{public,customer,technician}` | optional | Audience-filtered blocks |
| `GET /marketing/customer` | optional | **6 promos · 14 sponsored · 7 ads · 5 educational** |
| `GET /marketing/technician` | optional | **2 promos · 5 sponsored · 3 ads · 2 educational** |
| `GET /marketing/public` | none | Customer-facing guest surface |
| `POST /marketing/promotions/:id/track` | none | view/click |
| `POST /marketing/sponsored/:id/track` | none | impression/click |
| `GET /subscriptions/plans` | — | Still 501 (pre-existing stub) |

Audience verification: technician channel never returns customer-only campaigns; customer channel never returns technician recruitment/partner tools ads.

---

## 5. Root-cause fixes

### 5.1 Sticky empty cache (`packages/native/dataCache.ts` + `packages/hooks/useAsync.ts`)

- Empty arrays / all-empty rail objects no longer short-circuit when online.
- `preferCache: false` (Retry / pull-to-refresh) **always** hits the network when online.
- Background refresh calls `onBackgroundUpdate` so React state updates when live data arrives.

### 5.2 Public marketing delivery

- `marketingDeliveryService.deliver(channel)` filters by audience + live schedule window.
- `SponsoredContent.audience` added (`customer | technician | all`).
- Customer Home and Technician Dashboard render `MarketingRails`.

### 5.3 Local asset library

```
public/assets/images/
  categories/  heroes/  promotions/  advertisements/
  campaigns/   technicians/  testimonials/
packages/assets/index.ts  → assetUrl() / resolveMediaUrl()
```

- Keys like `asset:promotions.first-booking` resolve via Vite `BASE_URL` (Capacitor-safe).
- Legacy `/uploads/placeholders/...` mapped to catalog fallbacks.
- Cloudinary later: set `VITE_MEDIA_BASE_URL` (or store absolute CDN URLs); call sites keep using keys/`resolveMediaUrl`.

### 5.4 Vertical word wrapping

- Cause was Tailwind v4 `--spacing-md` colliding with `max-w-md` (16px width).
- Already renamed to `--space-*` in `src/index.css`.
- Empty/error copy now uses `max-w-prose text-pretty` instead of fragile `max-w-md`.

### 5.5 Empty states

- `AsyncStateView` supports `emptyIcon`, `emptyActionLabel`, `emptyActionHref`.
- My Jobs → “Post a job”; Technician reviews → “View reviews”.

### 5.6 Server boot blocker (unrelated but blocking validation)

- `console.provider.ts` had an unescaped apostrophe in a single-quoted string (`I'm`) → esbuild TransformError. Fixed.

---

## 6. Customer content (now delivered)

| Surface | Source |
|---|---|
| Hero / register perks | Content blocks `customer.register` |
| Onboarding slides | Content blocks `customer.onboarding` |
| Splash tagline | Content blocks `customer.splash` |
| Categories rail | `GET /categories` (15) |
| Top-rated technicians | `GET /technicians/search` |
| Today’s offers | `GET /offers/public/home` |
| Platform promotions | `GET /marketing/customer` → promotions |
| Educational / safety | marketing educational + content tips |
| Partner advertisements | marketing `partner_ad` (banks, insurance, materials, …) |

---

## 7. Technician content (never reused from Customer)

| Surface | Source |
|---|---|
| Onboarding / splash | Technician page-targeted content blocks |
| Dashboard blurb + feature cards | `technician.dashboard` blocks |
| Promotions | Technician-audience platform promos (referral credits, lower commission) |
| Educational | Earnings tips, verification tips |
| Partner ads | Tools, vehicle financing, training (technician audience only) |
| Jobs / assigned | Existing `jobs/nearby` + `jobs?mine` |

---

## 8. Advertisements & promotions model

Designed for future paid inventory (already on `SponsoredContent` / `PlatformPromotion`):

- Image, title, body/description, CTA, sponsor, audience, placement, priority, start/end, status
- Analytics: impressions/views, clicks (track endpoints increment counters)
- Served only through backend delivery APIs — **never hardcoded in the apps**

---

## 9. Files modified (summary)

**Cache / loading:** `packages/native/dataCache.ts`, `packages/hooks/useAsync.ts`, `packages/shared/AsyncStateView.tsx`

**Marketing delivery:** `backend/src/models/growth/Marketing.ts`, `backend/src/services/marketing/marketing.service.ts`, controllers, routes, validators, `packages/api/marketingApi.ts`

**Assets:** `packages/assets/index.ts`, `public/assets/images/**` (35 SVGs), vite + tsconfig aliases

**UI wiring:** `packages/shared/MarketingRails.tsx`, `apps/customer/pages/HomePage.tsx`, `apps/technician/pages/DashboardPage.tsx`, `apps/customer/pages/MyJobsPage.tsx`, `apps/admin/pages/marketing/SponsoredContentPage.tsx`

**Seeds:** `backend/scripts/seed-ux-content.ts`, `backend/src/services/content/contentBlock.seed.ts`, uniqueness fix in `contentBlock.service.ts`

**Boot fix:** `backend/src/providers/ai/console.provider.ts`

---

## 10. How to refresh local data

```bash
cd backend
npm run seed:ux          # idempotent repair + technician marketing
# optional full marketing demo:
npm run seed:marketing
```

Then hard-refresh the web app (or clear Preferences cache / pull-to-refresh) so empty cached rails are replaced by live feeds.

---

## 11. Remaining recommendations

1. **Subcategories** — still empty; seed when category drill-down UX needs them.
2. **Technician photos / portfolios** — many profiles lack real photos; catalog has `technicians.placeholder` until Cloudinary uploads.
3. **Messages empty** — expected until job-linked conversations exist; not a delivery bug.
4. **Subscriptions plans 501** — pre-existing stub; out of scope.
5. **Cloudinary cutover** — configure credentials + `MEDIA_STORAGE_PROVIDER`; store CDN URLs (or set `VITE_MEDIA_BASE_URL`); `resolveMediaUrl` already passes `https://` through.
6. **Admin platform promo form** — expose audience/featured/terms inputs (API already supports them; UI still defaults some fields).
7. **Frequency caps** — `frequencyCapPerDay` stored on content blocks but not yet enforced per-user.

---

## 12. Success criteria

| Criterion | Met |
|---|---|
| Categories display | ✅ API 15; cache no longer sticks empty |
| Technicians display | ✅ Search 23 |
| Promotions display | ✅ Customer 6 / Technician 2 via marketing delivery |
| Campaigns / educational display | ✅ |
| Advertisements display | ✅ Customer 7 / Technician 3 partner ads |
| Hero / auth content | ✅ Content blocks + fallbacks |
| Customer vs Technician separation | ✅ Server-enforced audience |
| Admin controls content | ✅ Marketing + Dynamic Content modules |
| No unintentional empty screens for seeded data | ✅ (true empties still explain + CTA) |
| No vertical word wrapping from spacing collision | ✅ |
| Local assets ready for Cloudinary | ✅ catalog + `resolveMediaUrl` |

The application now surfaces real backend content on Customer and Technician homes, with audience-safe marketing, a local asset pipeline, and a cache layer that can no longer permanently hide live data behind an empty snapshot.
