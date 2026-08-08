# Customer Dashboard Content Audit

**Date:** 2026-07-25  
**Scope:** Customer Home (`/customer/home`) — endless skeletons / missing content after login  
**Constraint:** Audit first; reuse existing APIs/components; fix only dashboard data-loading path

---

## Verdict

The database and delivery APIs were already populated (categories, technicians, offers, customer marketing). Content failed to paint reliably because of **frontend loading/cache plumbing**, not missing seed data:

1. **Aborted `useAsync` requests could leave `status === 'loading'` forever** → `AsyncStateView` kept showing skeletons.
2. **Marketing empty payloads were treated as usable cache** (`channel: 'customer'` + empty arrays) → sticky empty marketing rails until hard refresh.
3. **Offers / marketing sections rendered `null` when empty or still loading** → the page looked like “only skeletons” (Categories + Top Rated) with no hero/promos/offers even when those queries had finished empty or were mid-flight without a settled UI.
4. **Technician/profile images skipped `resolveMediaUrl`** → broken `/uploads/placeholders/…` URLs looked blank.

After fixes, completed requests clear skeletons and show **real data or meaningful empty states**. Live API check against the connected Mongo DB confirmed content is present.

---

## Root cause of missing content

| Rank | Cause | Symptom |
|------|--------|---------|
| **1** | `useAsync` discarded completed/aborted results without settling status (`controller.signal.aborted` gate) | Categories / Top Rated stuck on skeletons |
| **2** | `isEmptyCacheValue` ignored marketing shape (string `channel` made empty feed look non-empty) | Promos/ads/edu never refreshed from network after a prior empty cache write |
| **3** | Home hid offers/marketing when `data` null or empty (no `AsyncStateView`) | Page looked barren aside from two skeleton rails |
| **4** | Photos not passed through `resolveMediaUrl` | Cards/rails looked empty even when text existed |
| 5 | Unseeded DB (historical) | Empty states — mitigated by `seed:marketing` + `seed:ux` (already present in this environment) |

**Not the cause:** Auth redesign, routing, React Query (Home uses `useAsync` only), audience filter excluding customer content (customer channel correctly returns `all` + `customer`).

---

## APIs audited

| Request | Endpoint | Sent by Home | Live result (dev DB) | Frontend mapping |
|---------|----------|--------------|----------------------|------------------|
| Profile | `GET /customers/me` | ✓ | Auth customer profile | `name`, `photo`, `district` |
| Categories | `GET /categories?limit=20` | ✓ | **15** items | `mapCategory` |
| Technicians | `GET /technicians/search?limit=12&sort=-trustScore` | ✓ | **23** total | `mapCustomerTechnicianCard` |
| Offers home | `GET /offers/public/home` | ✓ | featured 2 · nearby 5 · rec 5 · exp 5 · pop 5 | `OfferHomeFeed` as-is |
| Marketing | `GET /marketing/customer?placement=home` | ✓ | promos **6** · ads **5** · edu **2** · sponsored 9 | `MarketingDelivery` |
| Content blocks | `GET /content/customer` | ✗ (not on Home) | 19 blocks | Splash/onboarding only |
| AI status | `GET /ai/status` | via launcher | enabled | Role FAB |

Envelope `{ success, data }` unwrap is correct. No renamed-field contract break on categories/technicians. Offers still include legacy `bannerImageUrl: /uploads/placeholders/…` — resolved via local asset catalog on the client.

---

## Database findings

| Dataset | Status |
|---------|--------|
| Categories | Present (15) |
| Technicians | Present (23 searchable) |
| Technician offers | Present (home rails populated) |
| Platform promotions | Present (6 customer-live) |
| Sponsored / ads / educational | Present (audience-filtered) |
| Content blocks | Present (19) — not required for Home rails |
| Hero banners | Served via promo `bannerImageUrl` → `asset:…` / catalog |

**Seed status:** Idempotent seeders already applied.

```bash
cd backend
npm run seed:marketing   # categories, users, techs, offers, promos
npm run seed:ux          # asset: URLs, content blocks, audience rows
```

This run of `seed:ux`: `contentBlocks.total: 19`, no new creates needed.

---

## Audience filtering

| Channel | Allowed audiences |
|---------|-------------------|
| Customer Home | `all`, `customer` |
| Technician | `all`, `technician` |
| Public | defaults to customer-facing |

Technician-only campaigns do not appear on Customer Home. Verified by `marketingDeliveryService.deliver('customer', { placement: 'home' })`.

---

## Files modified

| File | Change |
|------|--------|
| `packages/hooks/useAsync.ts` | Settle on completed fetch even if prior controller aborted; clear skeletons on orphaned cancel; ignore superseded imports |
| `packages/native/dataCache.ts` | Empty marketing payloads (array rails empty) never short-circuit online |
| `packages/shared/AsyncStateView.tsx` | Skeletons only for `loading` — `idle` no longer shows infinite placeholders |
| `apps/customer/pages/HomePage.tsx` | Hero banner; `AsyncStateView` for offers + marketing; empty states; `resolveMediaUrl` on photos |
| `packages/shared/splash/prefetchEssentialContent.ts` | Prefetch customer marketing into the same cache key Home reads |
| `CUSTOMER_DASHBOARD_CONTENT_AUDIT.md` | This report |

---

## Sections fixed

| Section | Before | After |
|---------|--------|-------|
| Hero banner | Missing | Featured/first customer promo with local asset image |
| Categories | Skeleton could stick | Loads or empty state + retry |
| Featured / Top Rated technicians | Skeleton could stick; photos broken | Loads / empty; media resolved |
| Today’s Offers | Hidden when empty/loading | Skeleton → data or empty state |
| Platform promos / ads / tips | Hidden when empty/sticky cache | Rails or empty state; cache hole fixed |
| Search | Already present | Unchanged |
| AI Assistant | Separate subsystem | Unchanged (enabled when `AI_ENABLED`) |
| Post a Job CTA | Static | Unchanged |

---

## Skeleton / empty-state rules (now)

- **Skeleton** only while `status === 'loading'` (genuine in-flight work).
- **Empty state** when the request completes with no items (categories, techs, offers, marketing).
- **Error + Try again** when the request fails and there is no cached paint.
- Pull-to-refresh forces `preferCache: false` (network).

---

## Local content library

Already in place under `public/assets/images/` (categories, heroes, promotions, advertisements, campaigns, technicians).  
`resolveMediaUrl` / `asset:` keys bridge until Cloudinary (`VITE_MEDIA_BASE_URL`).

---

## Regression testing

| Check | Result |
|-------|--------|
| Categories API → Home rail | ✓ data present |
| Featured / top technicians | ✓ data present |
| Promotions / ads / educational | ✓ customer audience |
| Offers home rails | ✓ populated |
| Hero banner | ✓ from marketing featured |
| Empty → empty copy (not skeleton) | ✓ `AsyncStateView` + section empties |
| Abort / Strict Mode | ✓ no perpetual loading |
| Marketing sticky empty cache | ✓ treated as empty |
| Web / Android | Same SPA; rebuild + `cap:copy` for Capacitor |

**Manual:** Log in as `marketing.customer@fixnow.demo` / `Password1!`, open Home, pull-to-refresh once if an old empty cache is still in Preferences/`localStorage` (`fixnow.cache.*`).

---

## Remaining recommendations

1. Pass `AbortSignal` into `apiGet` from Home loaders so cancels actually abort HTTP.
2. Map offer seed banners to `asset:…` in `seed-marketing` (not only `seed:ux`) so raw placeholders never ship.
3. Optional “Recently viewed” rail still not on Home — add when product wants it (needs history API).
4. Clear role caches on login success if empty sticky caches reappear on shared devices.

---

## Success criteria

| Criterion | Met |
|-----------|-----|
| Meaningful content instead of endless skeletons | ✓ |
| Skeletons disappear after API completion | ✓ |
| Customer-specific content rendered | ✓ |
| Web and Android consistent (shared SPA) | ✓ |
| Empty sections show empty states, not skeletons | ✓ |
