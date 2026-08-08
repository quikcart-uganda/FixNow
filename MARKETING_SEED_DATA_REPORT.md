# Marketing Seed Data Report

**Script:** `backend/scripts/seed-marketing.ts`  
**Command:** `cd backend && npm run seed:marketing`  
**Seed tag:** `fixnow-marketing-seed-v1`  
**Idempotent:** Yes — safe to re-run; existing records are skipped.

---

## 1. Audit summary (models reused)

| Requested concept | Existing model used | Notes |
|-------------------|---------------------|-------|
| Platform promotions | `PlatformPromotion` | `backend/src/models/growth/Marketing.ts` |
| Sponsored content | `SponsoredContent` | Same file |
| Advertisements | `SponsoredContent` (`type: partner_ad`) | No separate Advertisement model |
| Technician offers | `TechnicianOffer` | `backend/src/models/growth/Offer.ts` |
| Marketing categories | `Category` | Marketplace categories — no `MarketingCategory` model |
| Analytics | Embedded `analytics` on offers / promos / sponsored | Aggregated by existing admin analytics API |
| Notification templates | `Notification` rows | No separate template collection — seeded demo inbox messages |
| Audit trail | `AuditLog` | `meta.seedKey` for idempotency |
| Users / techs | `User`, `TechnicianProfile`, `CustomerProfile` | Demo accounts only |

**No duplicate models created. No business logic changed.**

---

## 2. Files modified / added

| File | Change |
|------|--------|
| `backend/scripts/seed-marketing.ts` | **Added** — idempotent seed |
| `backend/package.json` | Added `seed:marketing` script |
| `backend/uploads/placeholders/marketing-banner.svg` | Local placeholder banner |
| `backend/uploads/placeholders/offer-banner.svg` | Local placeholder banner |
| `backend/uploads/placeholders/sponsored-banner.svg` | Local placeholder banner |
| `MARKETING_SEED_DATA_REPORT.md` | This report |

---

## 3. Verified run results (2026-07-25)

### First run (`EXIT:0`)

| Collection | Created | Skipped |
|------------|--------:|--------:|
| Categories | 14 | 0 |
| Users | 8 | 0 |
| Technician profiles | 6 | 0 |
| Platform promotions | 6 | 0 |
| Sponsored content / ads | 11 | 0 |
| Technician offers | 8 | 0 |
| Notifications | 12 | 0 |
| Audit logs | 30 | 0 |
| Placeholder SVGs | 0* | 3 |

\*Placeholders already present on disk from an earlier write.

### Second run (idempotency) (`EXIT:0`)

| Collection | Created | Skipped |
|------------|--------:|--------:|
| Categories | 0 | 14 |
| Users | 0 | 8 |
| Technician profiles | 0 | 6 |
| Platform promotions | 0 | 6 |
| Sponsored content / ads | 0 | 11 |
| Technician offers | 0 | 8 |
| Notifications | 0 | 12 |
| Audit logs | 0 | 2† |
| Placeholder SVGs | 0 | 3 |

†Most audit rows are created only inside insert branches; on re-run those branches skip, so only the always-checked audit keys are re-evaluated. No duplicates created.

---

## 4. Records seeded (detail)

### Categories (14)
Electrical, Plumbing, Carpentry, Cleaning, Painting, Roofing, HVAC, Locksmith, Landscaping, Pest Control, Appliance Repair, Solar, Moving, General Handyman  

Idempotency key: `slug` or `name`

### Users
| Email | Role |
|-------|------|
| `marketing.admin@fixnow.demo` | admin |
| `marketing.customer@fixnow.demo` | customer |
| `spark.electrical@fixnow.demo` | technician |
| `bright.plumbing@fixnow.demo` | technician |
| `coolair.services@fixnow.demo` | technician |
| `handyfix.carpentry@fixnow.demo` | technician |
| `safelock@fixnow.demo` | technician |
| `gardenpro@fixnow.demo` | technician |

Password for all: `Password1!`  
Idempotency key: `email`

### Platform promotions (6)
1. Welcome to FixNow (welcome, featured, active, code `WELCOME20`)  
2. Weekend Service Deals (seasonal, active)  
3. Rainy Season Ready (seasonal, active)  
4. Refer & Earn (referral, active)  
5. Emergency Home Repairs (custom/platform campaign, featured)  
6. Verified Technicians (announcement, active)  

Idempotency: `title` or `code`

### Sponsored content + ads (11)
Home Safety Month, Energy Saving Tips, Water Conservation, Fire Safety Awareness, Community Clean-Up, Partner Advertisement, Home Maintenance Tips, Emergency Technician, Verified Professionals, Fast Response, Partner Promotion Spotlight  

Idempotency: `title` + `type`

### Technician offers (8)
| Title | Status | Notes |
|-------|--------|-------|
| 15% OFF Electrical Inspection | active + featured | Spark Electrical |
| Free Leak Inspection | active + featured | Bright Plumbing |
| Free AC Diagnosis | active | CoolAir |
| 10% OFF Furniture Assembly | active | HandyFix |
| Free Lock Assessment | active | SafeLock |
| Garden Maintenance Package | **pending** | GardenPro |
| Rejected Wiring Promo Draft | **rejected** | Review comment seeded |
| Suspended Flash Drain Offer | **archived** | Suspend + archive audits |

Idempotency: `technicianId` + `titleKey`

### Notifications (12 demo inbox rows)
Technician: Approved, Rejected, Suspended, Featured, Expiring, Archived  
Customer: Favourite technician promo, Nearby, Featured campaign, Expiring soon, Welcome, Referral  

Idempotency: `meta.seedKey`

### Audit trail
Created / submitted / approved / rejected / featured / suspended / archived / expired / platform & sponsored created — keyed by `meta.seedKey`

### Analytics
Realistic embedded counters on platform promos, sponsored content, and technician offers (views, clicks, CTR inputs, redemptions/bookings, revenue) so `/admin/marketing/analytics` is populated.

### Placeholder images
Local SVGs under `backend/uploads/placeholders/` (no external CDN).

---

## 5. Idempotency verification

1. Run `npm run seed:marketing` → creates missing rows; prints counters.  
2. Run again → `created` ≈ 0, `skipped` increases; no duplicates. **Verified.**  
3. Marker setting: `PlatformSetting` key `seed.marketing.v1` stores last run report.  

Does **not** overwrite titles/codes already present from production or prior manual entry.

---

## 6. Screens / flows to validate

| Screen | Expected seed coverage |
|--------|------------------------|
| `/admin/marketing` Analytics | Non-zero views/clicks/revenue, top lists |
| Pending Offers | Garden Maintenance Package |
| Approved / Active | Multiple live technician offers |
| Rejected Offers | Rejected Wiring Promo Draft + reason |
| Platform Promotions | 6 campaigns |
| Sponsored Campaigns | Educational / safety / tips / notices |
| Advertisements | `partner_ad` rows |
| Categories | 14 marketplace categories |
| Search / filters / pagination | Varied statuses, titles, kinds, types |
| Notifications | Demo user inboxes |
| Admin actions | Preview existing offers; audits already present |
| Customer offers home | Active offers with analytics |
| Technician marketing | Demo tech can log in and see own offers |

---

## 7. Regression analysis

| Area | Impact |
|------|--------|
| Models / services / controllers | Unchanged |
| Admin / customer / technician UI | Unchanged |
| Existing DB documents | Preserved (skip-on-exist) |
| Auth | New demo users only if emails absent |
| Production risk | Low if emails/titles/`seedKey` unused; always review before running against shared DBs |

---

## 8. How to run

```bash
cd backend
# ensure MONGODB_URI is set in .env
npm run seed:marketing
```

Re-run anytime; the script only inserts missing seed content.
