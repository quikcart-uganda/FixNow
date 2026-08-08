# Category System Audit

**Date:** 2026-07-25  
**Scope:** FixNow marketplace Category catalogue (DB → API → Customer/Technician/Admin UX)

---

## Executive summary

| Question | Finding |
|---|---|
| Are categories hardcoded in the frontend? | **No** — Customer, Technician, and Admin load via `categoriesApi.list`. |
| Are categories seeded? | **Yes** — `backend/scripts/seed-marketing.ts` (+ Internet & CCTV in `seed-ux-content.ts`). |
| Are categories database-driven? | **Yes** — MongoDB `Category` / `Subcategory` models. |
| Why did Customer UI show only six? | **Frontend truncation** — `.slice(0, 6)` on Home and Post Job, not seed/API limits. |

---

## Step 1 — Database

| Metric | Pre-fix (typical seeded DB) | Post-expansion seed |
|---|---|---|
| Total categories | ~14–15 (marketing seed + Internet & CCTV) | **~30** core home-service categories |
| Active (`isActive: true`) | Same as total unless admins deactivated | Same unless suspended |
| Featured | **N/A** — no `featured` field existed | Still N/A (order via `sortOrder`) |
| Hidden / inactive | Via `isActive: false` | Via `status: suspended \| archived` + `isActive: false` |
| Soft-deleted | Plugin supported (`isDeleted`) but unused | Soft-delete used by Admin delete |

Schema (additive):

- Existing: `name`, `slug`, `icon`, `description`, `isActive`, `sortOrder`, soft-delete fields  
- Added: `bannerImageUrl`, `accentColor`, `status` (`active` \| `suspended` \| `archived`)

Public visibility continues to use **`isActive === true`**. Suspended/archived set `isActive` to `false`.

---

## Step 2 — API

| Endpoint | Behaviour |
|---|---|
| `GET /categories` | Default **active only** (`active !== 'false'`). Sort `sortOrder`, `name`. Pagination default 50, max 100. Optional `q`, `status`, `includeUsage`. |
| `POST /categories` | Admin create |
| `PATCH /categories/:id` | Admin update (incl. status / media / order) |
| `DELETE /categories/:id` | Soft-delete; **blocked** if referenced (jobs, techs, offers, etc.) |
| `POST /categories/reorder` | Admin bulk `sortOrder` |
| `GET /categories/:id/usage` | Reference counts for Admin |

**Root cause was not API pagination or featured filters.** A public `list({ limit: 20 })` already returned more than six when seeded with 14+.

---

## Step 3 — Frontend

| Surface | Before | After |
|---|---|---|
| Customer `HomePage` | `list({ limit: 20 })` then **`.slice(0, 6)`** | `limit: 100`, **no slice** (horizontal scroll) |
| Customer `PostJobPage` | `limit: 50` then **`.slice(0, 6)`** | `limit: 100`, all categories |
| Customer `CategoriesPage` | `limit: 50`, no slice | `limit: 100` |
| Technician Register / Services / Offers | `limit: 50`, API-driven | `limit: 100` |
| Splash prefetch | `limit: 20` | `limit: 100` |

---

## Root cause of “only six displayed”

**Customer Home and Post Job intentionally truncated the API result with `.slice(0, 6)`.**

This matched the screenshot (Electrical, Plumbing, Carpentry, Cleaning, Painting, Roofing — the first six by `sortOrder`). Seeding more categories alone would **not** have fixed Home/Post Job until the slice was removed.

---

## New categories added (seed)

Expanded idempotent seed to ~30 categories, including Pest Control, HVAC, appliance/TV repair, CCTV, networking, solar, generator, locksmith, welding, masonry, tiling, ceiling, flooring, landscaping, borehole, furniture assembly, glass & aluminium, interior design, handyman, moving, emergency repairs, and related trades.

Each seed row includes: name, slug, icon, description, sortOrder, active status, and a local placeholder banner path.

---

## Files modified (audit + catalogue fix)

- `apps/customer/pages/HomePage.tsx`
- `apps/customer/pages/PostJobPage.tsx`
- `apps/customer/pages/CategoriesPage.tsx`
- `apps/technician/pages/RegisterPage.tsx`
- `apps/technician/pages/ServicesPage.tsx`
- `apps/technician/pages/marketing/CreateOfferPage.tsx`
- `packages/shared/splash/prefetchEssentialContent.ts`
- `backend/scripts/seed-marketing.ts`
- (Admin/API/model changes documented in `CATEGORY_MANAGEMENT_IMPLEMENTATION.md`)

---

## Verification notes

- Re-run `seed:marketing` (or equivalent) to upsert the expanded catalogue.
- Customer Home horizontal strip and Post Job category grid should list all **active** categories from the API.
- Suspend a category in Admin → it must disappear from Customer/Technician lists while remaining visible in Admin (`active=false` list).
