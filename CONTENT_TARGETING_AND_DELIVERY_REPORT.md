# Content Targeting & Delivery Report — Part 10

**Scope:** Convert hardcoded marketing/promotional/educational content into a dynamic,
admin-controlled content system with audience + page targeting, scheduling, priority,
and analytics. Backend is the single source of truth and the only place audience
permissions are decided.

**Status:** Implemented. Backend typecheck passes clean. Frontend typecheck shows only
pre-existing, unrelated errors (test files missing `node` types, `TrackingMap.tsx` Google
Maps typings, `healthCheck.ts` circuits) — none in the new content code.

---

## 1. Architecture

A new **`ContentBlock`** delivery layer was added that *complements* (does not replace)
the existing modules:

| Module | Purpose | Reused as-is |
|---|---|---|
| `ContentPage` (CMS) | Long-form legal/support/help documents | ✅ |
| `PlatformPromotion` | Coupon-style platform promos | ✅ |
| `SponsoredContent` | Ads / educational banners with placement | ✅ |
| `TechnicianOffer` | Marketplace offers (technician-authored) | ✅ |
| **`ContentBlock` (new)** | Hero headlines, welcome messages, feature cards, onboarding slides, banners, campaigns, safety tips, feature announcements — the micro-content that was hardcoded | 🆕 |

**Data flow**

```
Admin Panel ──(CRUD)──> ContentBlock (Mongo) ──(filter by audience+page+schedule+caps)──> GET /content/{public,customer,technician}
                                   │                                                              │
                          maintenance job (60s)                                          useContentBlocks() hook (offline cache)
                          scheduled→published→expired                                             │
                                                                                        Auth/onboarding/splash pages render
                                                                                        with hardcoded strings as FALLBACK only
```

Why a dedicated model: `SponsoredContent` lacks audience targeting and its `placement`
enum is customer-app-specific; auth pages need per-slot micro-copy (hero title vs
description vs feature cards) keyed by page + section + audience. `ContentBlock` provides
that shape plus fallbacks so **sections are never empty**.

---

## 2. Audience model (server-enforced)

`audience` ∈ `customers | technicians | both | guests | logged_in | new_users | returning_users`

Eligibility is computed **only** on the backend (`eligibleAudiences()` in
`contentBlock.service.ts`) from the request channel + auth state:

| Channel / state | Eligible audiences |
|---|---|
| `/content/public` (guest) | `guests` |
| `/content/customer`, not signed in | `guests`, `customers`, `both` |
| `/content/customer`, signed in | `logged_in`, `new_users`/`returning_users`, `customers`, `both` |
| `/content/technician`, not signed in | `guests`, `technicians`, `both` |
| `/content/technician`, signed in | `logged_in`, `new_users`/`returning_users`, `technicians`, `both` |

This guarantees:
- ✅ Customer content never appears in Technician UX (technician channel never adds `customers`).
- ✅ Technician recruitment never appears in Customer UX.
- ✅ Guest content only before auth.
- ✅ Admin content never public (no admin audience is ever eligible on public channels; admin preview pages are admin-only).

New vs returning is a lightweight segmentation hint (`?segment=new`); it is **not** a
permission — all role/guest/channel permissions are enforced server-side.

---

## 3. Page & section targeting

`page` enum covers the requested surfaces: `customer.{splash,onboarding,login,register,home,dashboard,bookings,checkout,notifications}`,
`technician.{splash,landing,onboarding,login,register,dashboard,jobs,wallet,profile}`,
`admin.{marketing_preview,content_preview}`, and `global` (shows across a channel).

`section` is a free-form slot key (e.g. `hero`, `feature`, `slide`, `tagline`) so multiple
blocks can compose one screen. Delivery groups results into `bySection` for the frontend.

---

## 4. Scheduling & priority

- **Status:** `draft | scheduled | published | expired | archived`.
- **Auto-transitions:** a maintenance worker (`jobs/index.ts`, every 60s) flips
  `scheduled → published` (when `startsAt ≤ now`) and `→ expired` (when `endsAt ≤ now`).
  Delivery queries also treat due `scheduled` blocks as live, so publishing is immediate.
- **Ordering when multiple blocks target the same slot:** sort by
  `priority ↓, displayOrder ↑, weight ↓, createdAt ↓`.
- **Impression cap:** `maxImpressions` removes a block from delivery once
  `analytics.impressions ≥ maxImpressions` (enforced in the query via `$expr`).
- **Frequency cap:** `frequencyCapPerDay` is stored for future per-user pacing.

---

## 5. API endpoints

**Delivery (audience-filtered server-side):**
| Method | Path | Auth |
|---|---|---|
| GET | `/content/public` | none (guest) |
| GET | `/content/customer` | optional |
| GET | `/content/technician` | optional |
| POST | `/content/blocks/:id/track` | none (`{ event: impression \| click }`) |

Query params: `page`, `section`, `locale`, `segment=new`. Response:
`{ items, bySection, channel, audiences }`.

**Admin (single source of truth, `admin` role):**
`GET/POST /admin/content-blocks`, `GET /admin/content-blocks/analytics`,
`GET/PATCH/DELETE /admin/content-blocks/:id`,
`POST /admin/content-blocks/:id/{status,duplicate}`, `POST /admin/content-blocks/seed`.

---

## 6. Admin changes

New **Marketing → Dynamic Content** tab (`apps/admin/pages/marketing/ContentBlocksPage.tsx`)
supporting every requested feature: content type, audience selection, page selection,
section slot, title/subtitle/body/icon/image/CTA/color/badge, **publication status
(publish/draft/archive)**, **scheduling** (starts/ends), **display priority / order /
weight**, **max impressions**, **live preview**, **duplicate**, **delete**, page/status
filters, a **Seed defaults** action, and an **analytics** strip (impressions, clicks, CTR,
live/scheduled/draft counts). Registered in `AdminRoutes.tsx` and `MarketingLayout.tsx`.

---

## 7. Database changes

New collection **`contentblocks`** (`backend/src/models/growth/ContentBlock.ts`):
`type, audience, page, section, locale, title, subtitle, body, imageUrl, icon, ctaLabel,
ctaHref, color, badge, status, startsAt, endsAt, priority, displayOrder, weight,
maxImpressions, frequencyCapPerDay, analytics{impressions,clicks}, createdByAdminId,
updatedByAdminId` + soft-delete/timestamps. Indexes:
`{page, section, status, locale, priority}` (delivery hot path) and `{status, startsAt, endsAt}`.

No existing collections were modified.

---

## 8. Content rendering flow (frontend)

New hook `useContentBlocks(channel, page, opts)` (`packages/shared/content/useContentBlocks.ts`):
- Reads a localStorage cache synchronously (offline-first), then fetches fresh data.
- Auto-tracks one impression per delivered block; exposes `pick(section)`, `list(section)`,
  `bySection`, and `trackClick(id)`.

**Auth/onboarding pages converted (hardcoded → dynamic, with fallbacks):**
| File | Was hardcoded | Now |
|---|---|---|
| `apps/customer/pages/RegisterPage.tsx` | "Quality fixes, just a tap away.", "Join thousands of homeowners…", "Vetted Pros", "Fast Arrival" | `customer.register` hero + feature blocks |
| `apps/customer/pages/OnboardingPage.tsx` | 3 slides | `customer.onboarding` slide blocks |
| `apps/customer/pages/SplashPage.tsx` | role tagline | `customer.splash` tagline |
| `apps/technician/pages/OnboardingPage.tsx` | 3 recruitment slides | `technician.onboarding` slide blocks |
| `apps/technician/pages/SplashPage.tsx` | "East Africa's most trusted…" | `technician.splash` tagline |
| Login pages (both) | — | already dynamic via existing `useCmsCopy('login-welcome')` (unchanged) |

---

## 9. Fallback strategy

- Every converted page keeps its original strings as `FALLBACK_*` constants and renders
  them if the backend returns nothing, so **sections are never empty**.
- Backend `ensureDefaults()` seeds those same strings on startup
  (`server.ts`) and via the admin **Seed defaults** button — so the DB is the source of
  truth out of the box while remaining fully editable.
- The hook is offline-first (localStorage), so returning users see cached content instantly.

---

## 10. Security model

- Audience/permission filtering is **exclusively** server-side; the frontend only names
  the channel + page. It cannot request content for an audience it isn't entitled to.
- Public projection (`serializePublic`) strips analytics, audience internals, admin IDs,
  and schedule internals.
- Admin CRUD is behind `authenticate + authorize(ADMIN)`; all mutations write audit logs.
- Tracking is unauthenticated but write-only (`$inc` on two counters), matching the
  existing offers `/track` pattern.

---

## 11. Validation results

| Check | Result |
|---|---|
| ✅ Customer content only in Customer UX | Enforced by channel→audience mapping |
| ✅ Technician content only in Technician UX | Enforced by channel→audience mapping |
| ✅ Guest content only before auth | `guests` eligible only when unauthenticated / public channel |
| ✅ Admin content never public | No admin audience served on public channels |
| ✅ Expired campaigns disappear | `endsAt` filter + 60s expiry job |
| ✅ Scheduled campaigns publish | `startsAt` filter + 60s publish job |
| ✅ Draft content never visible | Delivery filter excludes `draft`/`archived`/`expired` |
| ✅ Auth pages consume backend content | Register/onboarding/splash (customer+technician) + login (existing) |
| ✅ Never render empty sections | Frontend fallbacks + seeded defaults |
| Backend `tsc --noEmit` | **Pass (0 errors)** |
| Frontend `tsc -b` | New content code clean; only pre-existing unrelated errors remain |

---

## 12. Files changed

**Backend (new):** `models/growth/ContentBlock.ts`, `services/content/contentBlock.service.ts`,
`services/content/contentBlock.seed.ts`.
**Backend (edited):** `models/index.ts`, `services/index.ts`, `controllers/index.ts`,
`validators/index.ts`, `routes/index.ts`, `jobs/index.ts`, `server.ts`.

**Frontend (new):** `packages/api/contentBlocksApi.ts`,
`packages/shared/content/useContentBlocks.ts`,
`apps/admin/pages/marketing/ContentBlocksPage.tsx`.
**Frontend (edited):** `packages/api/index.ts`, `packages/shared/content/index.ts`,
`packages/shared/index.ts`, `apps/customer/pages/{RegisterPage,OnboardingPage,SplashPage}.tsx`,
`apps/technician/pages/{OnboardingPage,SplashPage}.tsx`,
`apps/admin/AdminRoutes.tsx`, `apps/admin/pages/marketing/MarketingLayout.tsx`.
