# Category Management Implementation

**Date:** 2026-07-25  
**Module:** Admin Category Management + shared Category lifecycle

---

## Existing architecture (reused)

| Layer | Location | Reuse |
|---|---|---|
| Model | `Category` / `Subcategory` in `backend/src/models/marketplace/Job.ts` | Extended additively |
| Soft delete | `createSchema` / `softDeletePlugin` | Used for Admin delete |
| Service | `categoryMarketplaceService` | Extended (list filters, usage, remove, reorder) |
| Routes | `/categories*` | Added DELETE, reorder, usage |
| Client | `packages/api/categoriesApi.ts` + `mapCategory` | Extended |
| Admin UI | `apps/admin/pages/CategoriesPage.tsx` | Rebuilt on same page route |
| Realtime | `emitCategoryUpdated` | Extended actions: `deleted`, `reordered` |

Customer and Technician apps already consumed `categoriesApi` — no hardcoded catalogues found.

---

## Changes made

### Database

Additive fields on `Category`:

- `bannerImageUrl?: string`
- `accentColor?: string`
- `status: 'active' | 'suspended' | 'archived'` (default `active`)

`isActive` remains the public filter and stays **synced** with `status`:

| Status | `isActive` | Customer / Technician |
|---|---|---|
| `active` | `true` | Visible |
| `suspended` | `false` | Hidden |
| `archived` | `false` | Hidden |

Soft delete: `isDeleted` + `deletedAt` (hidden from default queries; history preserved).

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/categories` | `q`, `active`, `status`, `includeUsage`, pagination |
| POST | `/categories` | Create (name, icon, description, sortOrder, banner, accent, status) |
| PATCH | `/categories/:id` | Update / suspend / reactivate / archive |
| DELETE | `/categories/:id` | Soft-delete if **not referenced** |
| POST | `/categories/reorder` | `{ orderedIds: string[] }` |
| GET | `/categories/:id/usage` | Reference counts |

**Delete safety — reference checks:**

- Jobs, technician profiles (`primaryCategoryId`), technician services  
- Technician offers (`categoryIds`)  
- Skill verifications, portfolio albums, case studies  
- Search analytics, marketplace listings  

If any count &gt; 0 → `409` with `CATEGORY_IN_USE` and recommendation to **suspend**.  
Subcategories alone do not block delete; orphan subs are soft-deleted with the parent.

### Admin UI

Administrators can:

- View / search / filter by status  
- Create / edit (name, icon, description, sort order, accent colour, banner URL or upload)  
- Suspend / activate  
- Soft-delete (with in-use messaging)  
- Reorder via ↑ / ↓ (calls reorder API)  
- See usage counts (jobs, technicians, offers)

### Customer & Technician impact

- Lists remain `GET /categories` with default active-only filter.  
- Removed `.slice(0, 6)` and raised limits to 100 so Admin catalogue size is reflected on Web and Capacitor Android.  
- Suspended categories disappear from Home, Search-driven pickers, job creation, registration, services, and offer builders.  
- Historical jobs that reference a suspended category continue to store `categoryId` unchanged.

### Seed

`seed-marketing.ts` expanded to ~30 idempotent categories (upsert by slug/name; refreshes metadata without forcing active state off).

---

## Files modified

**Backend**

- `backend/src/models/marketplace/Job.ts`
- `backend/src/services/marketplace/category.service.ts`
- `backend/src/controllers/index.ts`
- `backend/src/routes/index.ts`
- `backend/src/sockets/realtime.ts`
- `backend/scripts/seed-marketing.ts`

**Shared / API**

- `packages/api/categoriesApi.ts`
- `packages/api/mappers.ts`
- `packages/types/admin.ts`
- `packages/shared/splash/prefetchEssentialContent.ts`

**Apps**

- `apps/admin/pages/CategoriesPage.tsx`
- `apps/customer/pages/HomePage.tsx`
- `apps/customer/pages/PostJobPage.tsx`
- `apps/customer/pages/CategoriesPage.tsx`
- `apps/technician/pages/RegisterPage.tsx`
- `apps/technician/pages/ServicesPage.tsx`
- `apps/technician/pages/marketing/CreateOfferPage.tsx`

**Docs**

- `CATEGORY_SYSTEM_AUDIT.md`
- `CATEGORY_MANAGEMENT_IMPLEMENTATION.md`

---

## Regression testing checklist

| Check | Expected |
|---|---|
| Create category in Admin | Appears in Admin; if Active, appears on Customer Home / Post Job / Technician Register |
| Edit name / icon / banner | Updates across apps after reload / realtime |
| Suspend | Disappears from Customer & Technician; remains in Admin |
| Activate | Returns to public lists |
| Delete unused | Soft-deleted; gone from Admin default list |
| Delete in-use | Blocked; message recommends Suspend |
| Reorder | Customer/Technician order follows `sortOrder` |
| Existing jobs with old category | Still open/load; no data corruption |
| Android Capacitor | Same API — no hardcoded lists; inherits Web fix |
| Auth / payments / messaging | Untouched |

---

## Success criteria

- [x] Admin has full control over categories  
- [x] Customer & Technician use backend-managed categories only  
- [x] Suspended categories disappear from public interfaces  
- [x] Historical references preserved; delete guarded when in use  
- [x] No hardcoded category catalogues  
- [x] Changes propagate via API (+ realtime `CATEGORY_UPDATED`) to Web and Android  
- [x] Changes isolated to category-related surfaces  
