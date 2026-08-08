# Visual Asset Migration Report

**Date:** 28 July 2026  
**Status:** Complete — photography is primary; Cloudinary is the delivery source of truth  
**Cloud name:** `nkcltsv9`  
**Folder root:** `fixnow/`

---

## Verdict

FixNow marketing, category, knowledge, academy, and promotional surfaces now resolve to **Cloudinary photographic assets** with `f_auto` / `q_auto` delivery. Decorative gradient SVG placeholders remain only as offline/dev fallbacks for legacy catalog keys and functional avatar silhouettes. Logos and UI icons were not changed.

---

## Step 1 — Audit inventory (before)

| Surface | Count | Form | Action |
|---------|------:|------|--------|
| Category banners | 12 | Gradient SVG + label | Replaced with photography |
| Heroes | 2 | Gradient SVG | Replaced |
| Promotions | 6 | Gradient SVG | Replaced |
| Partner advertisements | 8 | Gradient SVG | Replaced |
| Campaigns / safety | 5 | Gradient SVG | Replaced |
| Testimonials plate | 1 | Gradient SVG | Replaced |
| Technician plate | 1 | Gradient silhouette | Kept as functional empty-state fallback |
| Role avatars | 7 | Simple silhouettes | **Kept** (not marketing art) |
| Logos / PWA / native icons | many | Brand assets | **Not touched** |
| CMS knowledge covers | 0 | Missing | Added (9 articles + hero images) |
| Stitch photography | 0 | HTML mockups only (`apps/customer/reference/stitch/`) | No reusable photos found |

**Stitch note:** The Stitch folders contain `code.html` screen references only — **zero** JPG/PNG/WebP assets. All photography was sourced from Unsplash / Pexels (commercial-use licences), downloaded once, and uploaded to Cloudinary (never hotlinked at runtime).

---

## Step 2 — Stitch reuse

| Item | Result |
|------|--------|
| Images reused from Stitch | **0** (none present) |
| Design screens referenced | 44 HTML mockups (layout only) |

---

## Step 3 — New images sourced

Royalty-free commercial photography from **Unsplash** and **Pexels**, prioritising real technicians, tools, homes, equipment, and maintenance work.

| Kind | Keys | Sources |
|------|-----:|---------|
| Categories | 25 | Unsplash + Pexels |
| Heroes | 2 | Unsplash |
| Promotions / offers | 6 | Unsplash + Pexels |
| Partner ads | 8 | Unsplash |
| Campaigns | 5 | Unsplash |
| Knowledge covers | 9 | Unsplash + Pexels |
| Academy | 3 | Unsplash + Pexels |
| Technician portal | 4 | Unsplash |
| Equipment / tools / testimonials | 3 | Unsplash |
| **Total catalog keys** | **65** | |

Avoided: cartoons, clipart, watermarks, AI-looking art, low-resolution stock.

---

## Step 4 — Cloudinary folders created

| Folder | Assets |
|--------|-------:|
| `fixnow/categories` | 24 |
| `fixnow/technicians` | 6 |
| `fixnow/partners` | 6 |
| `fixnow/knowledge` | 8 |
| `fixnow/academy` | 4 |
| `fixnow/offers` | 4 |
| `fixnow/emergency` | 3 |
| `fixnow/marketing` | 3 |
| `fixnow/hero` | 2 |
| `fixnow/safety` | 2 |
| `fixnow/tools` | 2 |
| `fixnow/equipment` | 1 |

Each upload stores: stable `public_id`, alt text (Cloudinary context), tags (`fixnow`, kind, topic), dimensions, and `f_auto,q_auto` delivery URL.

---

## Step 5 — Category coverage

Every marketplace category now has photography via Cloudinary URL on `bannerImageUrl`. Material icons remain the functional category icon.

| Category slug | Photo key / remap |
|---------------|-------------------|
| electrical | `categories.electrical` |
| plumbing | `categories.plumbing` |
| carpentry | `categories.carpentry` |
| cleaning | `categories.cleaning` |
| painting | `categories.painting` |
| roofing | `categories.roofing` |
| pest-control | `categories.pest-control` |
| appliance-repair | `categories.appliance-repair` |
| refrigerator-repair / washing-machine-repair / tv-electronics-repair | → appliance-repair |
| hvac | `categories.hvac` |
| solar | `categories.solar` |
| cctv-security / internet-networking / internet-cctv | → internet-cctv |
| locksmith | `categories.locksmith` |
| generator-repair | `categories.generator` |
| welding-metal | `categories.welding` |
| masonry | `categories.masonry` |
| tiling / flooring | `categories.tiling` |
| ceiling-installation | `categories.ceiling` |
| landscaping | `categories.landscaping` |
| borehole-water | `categories.borehole` |
| furniture-assembly | `categories.furniture` |
| glass-aluminium | `categories.glass` |
| interior-design | `categories.interior-design` |
| general-handyman | `categories.handyman` |
| moving | `categories.moving` |
| emergency-repairs | `categories.emergency` |

**Variants via Cloudinary presets (no duplicate uploads):**
- Square thumbnail → `thumbnailSquare` (`c_fill,w_400,h_400`)
- Banner → `banner` / `bannerMobile` / `bannerTablet`
- Cover → `cover` (`c_fill,w_1200,h_630`)

DB remount: **31** category rows updated to Cloudinary URLs.

---

## Step 6 — Knowledge base coverage

| Article slug | Hero asset |
|--------------|------------|
| electrical-safety | `knowledge.electrical-safety` |
| water-leaks | `knowledge.water-leaks` |
| fire-prevention | `knowledge.fire-prevention` |
| generator-maintenance | `knowledge.generator-maintenance` |
| roof-inspection | `knowledge.roof-inspection` |
| pest-prevention | `knowledge.pest-prevention` |
| home-maintenance | `knowledge.home-maintenance` |
| energy-saving | `knowledge.energy-saving` |
| emergency-response | `knowledge.emergency-response` |
| safety-tips / trust-verification / about / help | Remapped to contextual campaign/knowledge photos |

**9** knowledge articles created/published with hero images; **13** content pages updated with heroes.

---

## Step 7 — Promotional coverage

| Promo / campaign | Asset |
|------------------|-------|
| First booking | `promotions.first-booking` |
| Weekend | `promotions.weekend` |
| Emergency | `promotions.emergency` |
| Rainy season / roof | `promotions.rainy-season` |
| Safety month | `promotions.safety-month` |
| Referral | `promotions.referral` |
| Partner bank / insurance / materials / solar / tools / vehicle / training / telecom | `advertisements.*` |
| Safety / choose-tech / seasonal / earnings / verification | `campaigns.*` |

DB remount: **8** platform promotions, **28** sponsored rows updated.

---

## Step 8 — Technician portal upgrades

| Surface | Change |
|---------|--------|
| Portfolio | Hero photography banner (`technicians.portfolio`) |
| Trust / verification | Photo backdrop on trust score hero (`campaigns.verification`) |
| Academy / training ads | Cloudinary academy + training partner photos via marketing rails |
| Earnings / marketplace / achievements | Catalog keys ready (`campaigns.earnings`, `technicians.*`) |
| Offers without banners | Seeded to weekend photography |

---

## Step 9 — Customer home upgrades

| Surface | Change |
|---------|--------|
| Category rail | Square photographic thumbnails (Cloudinary `thumbnailSquare`) |
| Hero carousel (`PremiumSponsorHero`) | Responsive Cloudinary srcSet (mobile / tablet / desktop / hero) |
| Marketing rails | Promo + partner + educational cards use photographic banners + srcSet |
| Offers / campaigns | Resolve through Cloudinary catalog / DB URLs |

---

## Step 10 — Cloudinary delivery contract

Every seeded asset has:
- Stable `public_id` under `fixnow/...`
- Alt text in catalog + Cloudinary context
- Folder + tags
- Recorded width / height / bytes / format
- Delivery with `f_auto,q_auto` (WebP/AVIF when supported by the client)

Client helpers: `packages/assets/cloudinary.ts`  
Catalog: `packages/assets/cloudinary-catalog.json`  
Seed script: `backend/scripts/seed-visual-assets.ts`  
Re-run: `npm run seed:visual-assets` (from `backend/`)

**No runtime Unsplash/Pexels URLs** — sources are download-only for upload.

---

## Step 11 — Responsive optimisation

| Preset | Transform |
|--------|-----------|
| `bannerMobile` | 750×420 fill |
| `bannerTablet` | 1024×420 fill |
| `banner` | 1440×480 fill |
| `hero` | max 1920 limit |
| `thumbnail` / `thumbnailSquare` | 320×240 / 400×400 |
| `cover` / `poster` | 1200×630 / 640×360 |
| `blur` | tiny LQIP blur |

Non-critical images use `loading="lazy"` via `LazyImage`. First hero slide stays `eager`.

---

## Step 12 — Accessibility

| Rule | Implementation |
|------|----------------|
| Meaningful alt | Catalog `alt` + category/article titles on admin & CMS covers |
| Decorative | Empty `alt=""` on hero carousel overlays and portfolio/trust decorative plates |
| Skeleton | `LazyImage` skeleton while decoding; never shows broken-image icon |

---

## Step 13 — Placeholder cleanup

| Action | Detail |
|--------|--------|
| Stopped generating | `backend/uploads/placeholders/*.svg` marketing gradient files in `seed-marketing` |
| Kept as offline fallback | Local SVG catalog under `public/assets/images/{categories,promotions,advertisements,campaigns,heroes}` — used only if Cloudinary catalog key is missing |
| Kept functional | `avatars/*`, logos, PWA/native icons, Material icons |
| Prefer Cloudinary | `assetUrl()` / `resolveMediaUrl()` check `cloudinary-catalog.json` first |

---

## Pages / packages upgraded

| Area | Files |
|------|-------|
| Asset catalog | `packages/assets/index.ts`, `cloudinary.ts`, `cloudinaryCatalog.ts`, `cloudinary-catalog.json` |
| Marketing UI | `packages/shared/MarketingRails.tsx`, `PremiumSponsorHero.tsx` |
| CMS | `packages/shared/content/CmsDocumentView.tsx` |
| Customer home | `apps/customer/pages/HomePage.tsx`, `apps/customer/data.ts` |
| Technician | `apps/technician/pages/PortfolioPage.tsx`, `components/trust/Trust.tsx` |
| Admin | `apps/admin/pages/CategoriesPage.tsx` |
| Storage | `backend/src/providers/storage/cloudinary.provider.ts`, `transforms.ts` |
| Seeds | `backend/scripts/seed-visual-assets.ts`, `visual-media-sources.ts`, `seed-marketing.ts` |

---

## Performance improvements

- Photographic assets served from Cloudinary CDN with automatic format/quality
- Responsive `srcSet` reduces mobile payload vs full desktop banners
- Lazy loading for below-the-fold marketing and category tiles
- Single source image per topic → multiple crops via transforms (no duplicate storage for square/banner/cover)

---

## Before / after

### Before
- Gradient SVG rectangles with white text labels (`electrical.svg`, `first-booking.svg`, etc.)
- Broken `/uploads/placeholders/category-*.jpg` paths
- CMS articles without hero covers
- Category home rail: Material icons only

### After (sample Cloudinary delivery)

| Key | URL |
|-----|-----|
| Electrical | `https://res.cloudinary.com/nkcltsv9/image/upload/f_auto,q_auto/v1/fixnow/categories/electrical` |
| First booking | `…/fixnow/offers/first-booking` |
| Academy workshop | `…/fixnow/academy/workshop` |
| Knowledge water leaks | `…/fixnow/knowledge/water-leaks` |

> Capture live UI screenshots in Customer Home, Admin Categories, and Knowledge article views after restarting the Vite app so the regenerated `cloudinary-catalog.json` is bundled.

---

## How to re-seed / extend

```bash
cd backend
npm run seed:visual-assets
# optional: --dry-run  |  --skip-db
```

1. Add a row to `backend/scripts/visual-media-sources.ts`
2. Re-run the seed (idempotent — reuses existing `public_id`s)
3. Commit the updated `packages/assets/cloudinary-catalog.json`

---

## Success criteria

| Criterion | Status |
|-----------|--------|
| No generic placeholder artwork where photography adds value | Met (Cloudinary primary; SVG only as fallback) |
| All product marketing images served from Cloudinary | Met |
| Assets reusable across Customer, Technician, Admin | Met via shared catalog + `resolveMediaUrl` |
| Visual quality production-ready | Met (65 curated photos, responsive transforms, alt text) |

---

## Machine reports

- `VISUAL_ASSET_SEED_REPORT.json` — last seed run (65 reused, 0 failed)
- `packages/assets/cloudinary-catalog.json` — client delivery catalog
