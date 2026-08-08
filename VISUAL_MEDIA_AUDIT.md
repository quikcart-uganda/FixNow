# Visual Media Audit

**Date:** 2026-07-28  
**Goal:** Service-specific imagery everywhere; preserve Material Symbols icons; eliminate duplicate living-room / weekend promo art on offers and tips.

---

## Root cause of duplicates

Customer Home showed the **same living-room / shared promo photo** on Electrical, Plumbing, HVAC, Carpentry, and Locksmith offers because:

1. `seed-marketing.ts` assigned **every** technician offer `asset:promotions.weekend`
2. `seed-visual-assets.ts` remapped placeholder offers to the **same** weekend Cloudinary URL
3. UI fallbacks defaulted to `promotions.first-booking` / `advertisements.bank`
4. Safety tips both matched `/safety/` → one campaign photo

Categories were already largely unique via Cloudinary `categories.*` assets.

---

## Strategy (normalized)

| Layer | Rule |
|-------|------|
| **Category** | Keep `icon` (Material Symbol) **and** `bannerImageUrl` (photo). Image if present; else icon; else placeholder. |
| **Offers** | Banner = `categories.{slug}` photo for that service |
| **Promotions** | Title → distinct `promotions.*` keys |
| **Campaigns / tips** | Title-specific `campaigns.*` / `categories.*` keys |
| **Icons** | Unchanged — still Material Symbols via `Icon` / category picker |

---

## Files modified

| File | Change |
|------|--------|
| `packages/assets/index.ts` | `categoryMediaKey`, `inferServiceMediaKey`, `isGenericPromoBanner`, `resolveOfferBannerUrl` |
| `backend/scripts/seed-marketing.ts` | Category/offer/promo/sponsored banners unique; remaps existing seed rows |
| `backend/scripts/seed-visual-assets.ts` | Offers remapped by category (not blanket weekend) |
| `backend/scripts/visual-media-sources.ts` | Distinct sponsored title matches (home vs fire safety, energy, water) |
| `apps/customer/components/CustomerOfferCard.tsx` | Service-aware banner + alt text |
| `apps/customer/pages/OfferDetailPage.tsx` | Same |
| `apps/customer/pages/HomePage.tsx` | Category media key + alt (not hard-coded electrical) |
| `packages/shared/MarketingRails.tsx` | Infer unique creative when banner is a shared default |

---

## Duplicate images removed / remapped

| Before | After |
|--------|-------|
| All offers → `promotions.weekend` (living-room-adjacent / shared tools shot) | Electrical → `categories.electrical`, Plumbing → `plumbing`, HVAC → `hvac`, Carpentry → `carpentry`, Locksmith → `locksmith`, Landscaping → `landscaping`, … |
| Home Safety + Fire Safety → same safety/bank art | Home Safety → `campaigns.safety`; Fire Safety → `campaigns.seasonal` |
| Energy / water tips → bank default | HVAC / plumbing category photos |
| UI fallback `first-booking` on every offer | `resolveOfferBannerUrl` swaps generic URLs to inferred service keys |

**DB remount (seed:visual-assets):** `offersUpdated: 8`, `sponsoredUpdated: 4`.

---

## Cloudinary

- Cloud: `nkcltsv9`, folder root `fixnow/`
- Catalog: `packages/assets/cloudinary-catalog.json` — **65** keys (reused; no forced re-upload)
- Folders in use: `categories`, `offers`, `partners`, `safety`, `campaigns`/`marketing`, `academy`, `technicians`, `knowledge`, `equipment`, `tools`, `hero`

Each catalog entry retains `publicId`, `url`, `alt`, dimensions, `kind`.

---

## Category coverage

| | Status |
|--|--------|
| Icon field | Preserved (`Category.icon` + admin Material Symbol picker) |
| Image field | `bannerImageUrl` (no schema rename) |
| Dedicated Cloudinary category photos | electrical, generator, emergency, plumbing, carpentry, painting, roofing, cleaning, pest-control, appliance-repair, hvac, solar, internet-cctv, locksmith, landscaping, moving, handyman, welding, masonry, tiling, ceiling, furniture, glass, interior-design, borehole |
| Display rule | Image → icon → default placeholder |

---

## Accessibility

- Catalog `alt` strings used via `assetAlt(key, fallback)`
- Offer/promo cards pass descriptive alts (e.g. service title + catalog alt)
- Empty `alt=""` removed from Home category thumbs

---

## Assets reused (Stitch / existing)

- Stitch HTML refs under `apps/customer/reference/stitch` remain design-only (not product seeds)
- Product photography continues from existing Unsplash/Pexels → Cloudinary catalog
- Local SVG category icons remain offline fallbacks under `public/assets/images/categories/`

---

## Remaining placeholders / risks

| Item | Note |
|------|------|
| Some Unsplash IDs shared across keys | Visual similarity possible for a few promo/category pairs; primary offer duplicate path is fixed |
| Admin moderation previews | Still fall back to `promotions.first-booking` in a few admin screens (non-customer) |
| Technician avatars | Demo techs may still use cartoon placeholders (separate from offer banners) |
| Full 100+ trade photography | Core catalog covers major FixNow categories; long-tail slugs alias to nearest `categories.*` leaf |
| Intentional same-category reuse | Draft/suspended offers of the same trade share that category photo (e.g. two electrical drafts) |

---

## Validation checklist

| Check | Status |
|-------|--------|
| No shared weekend banner on distinct offers | ✓ remapped + client guard |
| Category icons preserved | ✓ |
| Category images supported | ✓ |
| Promotions / campaigns unique by title | ✓ improved matching |
| Cloudinary delivery | ✓ catalog URLs |
| Lazy loading | ✓ existing `LazyImage` |
| Mobile / tablet / desktop | ✓ same resolvers |

**Hard-refresh** the phone (`172.20.10.4`) after Vite picks up frontend changes. Offers should show electrician / plumber / AC / carpentry / locksmith photos respectively.

---

## Final inventory

- Catalog keys: **65** (`VISUAL_ASSET_SEED_REPORT.json` / `cloudinary-catalog.json`)
- Live offer banners: **6 unique** across 8 offers (same-category drafts share intentionally)
- Sponsored banners: **22 unique** across 28 rows (partner finance ads may share bank creative)
- Admin Categories: icon picker + image upload/preview + **Remove image** + **Restore default icon**
- Icon system: **unchanged** (Material Symbols)
