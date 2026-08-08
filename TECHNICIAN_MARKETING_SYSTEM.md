# Technician Marketing System

**Date:** 2026-07-24  
**Scope:** Technician Promotions & Offers subsystem  
**Constraint:** Customer-visible offers require Admin approval. Platform `Promotion` codes and job bid `JobApplication`s are unchanged.

QuikCart (`D:\QQCART\QuikCart APP VND cursor`) was used **read-only** for workflow inspiration (draft → pending review → approve → live window).

---

## 1. Architecture

```text
Technician App (Marketing module)
  └─ packages/api/offersApi.ts
       └─ /api/v1/offers/me/*          (technician JWT)
       └─ /api/v1/offers/public*       (customer discovery)
       └─ /api/v1/admin/offers*        (admin JWT)
            └─ offerService (backend/src/services/marketing/offer.service.ts)
                 └─ TechnicianOffer (MongoDB collection)
```

| Layer | Responsibility |
|-------|----------------|
| Model | `TechnicianOffer` — technician-owned marketing creatives |
| Service | Validation, duplicate checks, lifecycle sync, public gate, analytics counters |
| Controller / routes | Role-gated HTTP API |
| Technician UI | Marketing shell, status lists, 6-step create wizard, analytics |
| Admin UI | Pending queue with approve / reject |

**Hard public gate:** an offer is customer-visible only when:

1. Status lineage is admin-approved (`approved` / `scheduled` / `active`)
2. `now >= startsAt` and `now <= endsAt`
3. Not soft-deleted

Draft, pending, rejected, archived, and expired offers never appear on `/offers/public`.

---

## 2. Models

**File:** `backend/src/models/growth/Offer.ts`  
**Enums:** `OFFER_TYPE`, `OFFER_STATUS` in `backend/src/models/shared/enums.ts`

### Offer types

| Value | Label |
|-------|-------|
| `percentage_discount` | Percentage Discount |
| `fixed_discount` | Fixed Discount |
| `free_call_out` | Free Call-out |
| `free_inspection` | Free Inspection |
| `bundle` | Bundle Offer |
| `seasonal` | Seasonal Offer |
| `limited_time` | Limited Time |
| `referral` | Referral Offer |
| `custom` | Custom Promotion |

### Stored statuses

`draft` · `pending` · `approved` · `rejected` · `scheduled` · `active` · `expired` · `archived`

After admin approval, `scheduled` / `active` / `expired` are derived from the schedule window on read/mutate (`syncLifecycleStatus`).

### Key fields

- Creative: `title`, `subtitle`, `description`, `terms`, `bannerImageUrl`, `promotionColor`, `badge`
- Targeting: `categoryIds`, `serviceNames`, `serviceAreaDistricts`, `availabilityNote`
- Rules: `discountValue`, `currency`, `minimumBookingAmount`, `maximumDiscountAmount`, `maxRedemptions`, `perCustomerLimit`
- Schedule: `startsAt`, `endsAt`, `timeStart`, `timeEnd`, `weekdays`, `holidayNotes`
- Moderation: `status`, `rejectionReason`, `reviewedByAdminId`, `reviewedAt`, `submittedAt`, `publishedAt`
- Analytics: `views`, `clicks`, `bookings`, `revenueGenerated`, `redemptionCount`
- Integrity: `titleKey` (normalized title for overlap checks), `featured`

Distinct from platform `Promotion` (growth coupons) and marketplace `JobApplication` (per-job bids).

---

## 3. Workflow

```text
Create (draft)
   │
   ├─ Save draft ─────────────────────────────► draft
   │
   └─ Submit for approval ────────────────────► pending
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │                           │
                              Admin approve               Admin reject
                                    │                           │
                                    ▼                           ▼
                         approved → scheduled/active         rejected
                         (by dates)                            │
                                    │                     Edit → draft
                                    ▼
                         active (inside window)
                                    │
                                    ▼
                         expired (past endsAt) / archived
```

Technician can withdraw a **pending** offer back to draft. Editing a rejected offer returns it to draft.

---

## 4. Validation

| Rule | Enforcement |
|------|-------------|
| Title / description required | Zod + service |
| End after start; end not in the past on submit | Service |
| Percentage 1–100; fixed &gt; 0; no negatives | Service |
| At least one service or category on submit | Service (`requireServices: true`) |
| Overlapping same-title promotions blocked | `assertNoDuplicate` |
| HH:MM time restrictions | Zod regex + service |
| Reject requires reason | Admin moderate API |

---

## 5. Analytics

Per offer (and dashboard totals):

- Views / clicks / bookings  
- Revenue generated  
- Conversion rate = bookings ÷ clicks  
- Remaining redemptions  
- Expiry countdown (`expiryCountdownMs` / hours)

Events: `POST /offers/public/:id/track` with `{ event: 'view' | 'click' | 'booking', amount? }` — booking increments redemption counters and can auto-expire when `maxRedemptions` is hit.

---

## 6. API endpoints

### Technician (`authorize: technician`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/offers/me/dashboard` | Counts + totals + recent |
| GET | `/offers/me?lifecycle=` | Filtered list |
| GET | `/offers/me/:id` | Detail |
| POST | `/offers/me` | Create draft |
| PATCH | `/offers/me/:id` | Update draft/rejected |
| POST | `/offers/me/:id/submit` | → pending |
| POST | `/offers/me/:id/withdraw` | pending → draft |
| POST | `/offers/me/:id/archive` | Archive |
| DELETE | `/offers/me/:id` | Soft-delete draft/rejected/archived |
| GET | `/offers/me/analytics` | Aggregates |

### Public

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/offers/public` | **Approved + live window only** |
| POST | `/offers/public/:id/track` | Analytics events |

### Admin (`authorize: admin`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/offers?lifecycle=pending` | Moderation queue |
| POST | `/admin/offers/:id/moderate` | `{ action: 'approve' \| 'reject', reason? }` |

---

## 7. Frontend

### Technician — `/technician/marketing`

| Route | Page |
|-------|------|
| `/marketing` | Dashboard |
| `/marketing/offers` | All offers |
| `/marketing/create` | 6-step wizard |
| `/marketing/drafts` … `/rejected` | Status lists |
| `/marketing/analytics` | Funnel + active performance |

Wizard steps: Type → Details → Services → Discount Rules → Schedule → Preview → Submit (pending).

Sidebar: **Marketing** (`campaign` icon).

### Admin — `/admin/offers`

Pending queue with approve/reject. Nav: Overview → Offers.

---

## 8. Testing

1. Technician creates draft → appears under Drafts; not on `/offers/public`.
2. Submit → Pending; admin list shows it; still not public.
3. Admin approves future-dated offer → lifecycle `scheduled`; public empty.
4. When `startsAt` passes → lifecycle `active`; public lists it.
5. Reject with reason → Rejected; technician edits → Draft → resubmit.
6. Validation: 120% discount, end before start, no services on submit → blocked.
7. Duplicate overlapping title → 409 conflict.
8. Track booking toward `maxRedemptions` → offer expires when limit reached.
9. Typecheck / build frontend + backend.

---

## 9. Files

```text
backend/src/models/shared/enums.ts
backend/src/models/growth/Offer.ts
backend/src/models/index.ts
backend/src/services/marketing/offer.service.ts
backend/src/services/index.ts
backend/src/validators/index.ts
backend/src/controllers/index.ts
backend/src/routes/index.ts
packages/api/offersApi.ts
packages/api/index.ts
apps/technician/pages/marketing/*
apps/technician/routes.tsx
apps/technician/components/layout/AppShell.tsx
apps/admin/pages/OffersModerationPage.tsx
apps/admin/AdminRoutes.tsx
apps/admin/components/AdminShell.tsx
TECHNICIAN_MARKETING_SYSTEM.md
```

---

*Offers never become public until an Admin approves them and the schedule window is live.*
