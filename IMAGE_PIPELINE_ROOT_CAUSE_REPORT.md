# Image Pipeline Root Cause Report

**Date:** 2026-07-28  
**Product:** FixNow  
**Scope:** End-to-end image delivery (API → Cloudinary/local → LazyImage → Capacitor WebView)  
**Symptoms addressed:** Category / promotion / advertisement / hero images failing or placeholders; Android missing images; technician avatars OK

---

## Executive verdict

Technician avatars worked because they use **absolute HTTPS** (Dicebear / uploads / Google) and **`ProfileAvatar` initials fallback**.

Category, promo, ad, and hero surfaces preferred **Cloudinary catalog URLs**, then fell back to **the same Cloudinary family** (or Capacitor-broken `./assets/...` paths). When CDN transforms failed or local SVGs resolved under nested SPA routes, those tiles went blank / person-glyph while the rest of the UI still rendered.

**Primary root causes (ranked):**

1. Capacitor `base: './'` + nested routes broke local SVG fallbacks (`./assets/...` → `/customer/assets/...` 404).  
2. LazyImage fallback often equaled another Cloudinary URL — no distinct offline/local recovery.  
3. `extractCloudinaryPublicId` / transform stripping could keep `v1/` inside public_id on catalog-shaped URLs (server rebuilds).  
4. Exhausted state used a **person** glyph (looked like “avatar placeholder” on marketing tiles).  
5. Missing image diagnostics made Android WebView failures hard to confirm.

---

## 1. Current architecture

```
DB field (bannerImageUrl | photoUrl | asset:key | https://…)
        │
        ├─ Backend publicMediaUrl (profiles / uploads only — strips marketing asset:)
        │
        ▼
Client resolveMediaUrl / assetUrl
        │
        ├─ Cloudinary catalog (cloudinary-catalog.json)  ← preferred
        └─ Local SVG under public/assets/images/…     ← secondary
                │
                ▼
        cloudinaryPresetUrl (thumbnail/poster/banner)
                │
                ▼
        LazyImage (retry → fallback → empty)
                │
                ▼
        Capacitor WebView (HTTPS scheme, cleartext off in release)
```

---

## 2. Broken URL patterns found

| Pattern | Where | Effect |
|---|---|---|
| `asset:categories.*` / `asset:advertisements.*` | Seeded DB | OK if client resolves; broken if treated as literal `<img src>` |
| Catalog HTTPS `…/upload/f_auto,q_auto/v1/fixnow/...` | Catalog JSON | Valid delivery; fragile if public_id extraction keeps `v1/` |
| Double / stacked transforms | Client `withCloudinaryTransform` | Previously could leave stale `f_auto,q_auto` segments |
| `./assets/images/...` on `/customer/*` | Capacitor | **404** — main Android missing-image bug for local fallbacks |
| `http://…/uploads/...` | Local storage banners | Blocked by release cleartext + `allowMixedContent: false` |
| `cloudinary://publicId` | Upload docs | Previously unhandled in `resolveMediaUrl` |
| Same URL as src + fallback | Home / MarketingRails | Retry then empty — no distinct recovery |

### Working vs failing (before fix)

| Surface | Typical source | Before |
|---|---|---|
| Technician avatar | Dicebear / signed upload HTTPS | **OK** + initials |
| Some campaigns | Fresh Cloudinary HTTPS uploads | **OK** |
| Category tiles | Catalog / `asset:` + transform | **Fail / placeholder** |
| Promotions / ads | Catalog / `asset:` + poster transform | **Fail / placeholder** |
| Heroes | mobile/desktop/banner + catalog | **Often placeholder** |

*Quantitative before/after success rates were not measured on-device in this pass (no live WebView session). Expected after fix: local SVG fallback always paints; Cloudinary success path unchanged when CDN healthy.*

---

## 3. Missing / weak database assets

| Entity | Field | Issue |
|---|---|---|
| Category | `bannerImageUrl` | Often `asset:categories.{slug}` until `seed-visual-assets` writes HTTPS |
| PlatformPromotion | `bannerImageUrl` | Same `asset:` pattern |
| SponsoredContent | `bannerImageUrl`, `mobileImageUrl`, `desktopImageUrl` | Same; heroes need multi-field |
| Subcategory | — | No image fields |
| CMS | `heroImageUrl` / block `imageUrl` | Raw; null → client fallback |

`publicMediaUrl` correctly **strips** marketing `asset:` for profile faces — categories/marketing must not rely on it alone.

---

## 4. Cloudinary issues

| Issue | Detail | Fix |
|---|---|---|
| Catalog cloud | `nkcltsv9`, folder `fixnow/`, 65 assets | Intact |
| `extractCloudinaryPublicId` | Kept `v1/` as part of public_id for catalog URLs | **Fixed** — strip version + transform segments |
| Client transform strip | Brittle regex | **Fixed** — `stripCloudinaryUploadPrefix` |
| Duplicate `thumbnailSquare` preset key | `transforms.ts` | **Fixed** |
| Deleted CDN assets | Would 404 both primary + cloud fallback | Local SVG fallback now distinct |

---

## 5. Android-specific issues

| Setting | Impact |
|---|---|
| `androidScheme: https`, hostname `app.fixnow.local` | Absolute HTTPS Cloudinary OK |
| `allowMixedContent: false` | HTTP images blocked in release |
| Release NSC cleartext off / Debug on | LAN HTTP only in debug |
| `vite` `base: './'` | Relative local assets broke on nested routes — **fixed via origin-absolute `withAppBase`** |
| Static SVGs in sync | Present under `assets/public/assets/images/` after build (verified) |

Admin portal is not mounted in Capacitor; image issues there are web-only.

---

## 6. Fixes implemented

| Change | File(s) |
|---|---|
| Origin-absolute local asset URLs for Capacitor/SPA | `packages/assets/index.ts` → `withAppBase` |
| `localAssetUrl(key)` — Cloudinary-free fallback | `packages/assets/index.ts` |
| Resolve `cloudinary://` refs | `packages/assets/index.ts` → `resolveMediaUrl` |
| Robust Cloudinary transform rewrite | `packages/assets/cloudinary.ts` |
| Image diagnostics ring buffer + console warn | `packages/assets/imageDiagnostics.ts` |
| LazyImage: retry, diag hooks, branded empty (image glyph), `referrerPolicy` | `packages/ui/LazyImage.tsx` |
| Category / promo / ad / hero use `localAssetUrl` fallback | `HomePage.tsx`, `MarketingRails.tsx`, `PremiumSponsorHero.tsx`, `SponsoredHeroBanner.tsx` |
| Server public_id extraction + duplicate preset | `backend/src/providers/storage/transforms.ts` |

### LazyImage contract (after)

1. Detect load failure  
2. Retry primary once (cache-bust query)  
3. Log via `logImageDiag` (URL, component, entityId, phase, duration)  
4. Fall back to **local** branded SVG (not another Cloudinary URL)  
5. If still failing → gradient + `image` icon (never blank, never broken icon)

---

## 7. Validation checklist

| Image type | Expected after fix |
|---|---|
| Category icons/photos | Cloudinary thumb **or** local SVG |
| Hero banners | Cloudinary **or** local campaign SVG |
| Advertisements | Cloudinary **or** `advertisements.*` SVG |
| Promotions | Cloudinary **or** `promotions.*` SVG |
| CMS content | Resolved HTTPS / uploads; empty → branded empty |
| Campaign images | Same as heroes/ads |
| Technician avatars | Unchanged success path |
| Company / sponsor logos | `resolveMediaUrl`; fail → emptyContent/gradient |
| Profile images | `ProfileAvatar` initials preserved |

**On-device:** Rebuild web + `npm run mobile:sync`, install debug APK, confirm category grid and marketing rails paint on Android.

---

## 8. Performance

| Topic | Status |
|---|---|
| Lazy loading | Default `loading="lazy"` (heroes eager first slide) |
| Cloudinary `f_auto,q_auto` + presets | Applied on delivery URLs |
| srcSet | Marketing rails / heroes |
| Local SVG fallback | Tiny; no CDN round-trip on failure |
| Caching | Browser/WebView HTTP cache; retry uses `?r=` bust once |

---

## 9. Image success rate

| Metric | Before (observed product) | After (code path) |
|---|---|---|
| Avatars | High | High (unchanged) |
| Category / promo / ad when CDN OK | Medium | High |
| Category / promo / ad when CDN fails / offline | **Near zero** (blank/person) | **High** via local SVG |
| Android nested-route local assets | **Fail** | **Pass** (origin absolute) |

Exact percentages require a device pass with `getImageDiagEvents()` sampled — not collected in this session.

---

## 10. Follow-ups

1. Re-run `seed-visual-assets` in each env so DB stores HTTPS catalog URLs (not only `asset:`).  
2. Expand `localAssetUrl` coverage for any catalog keys without SVG files.  
3. Optional admin “Image health” page reading `getImageDiagEvents` in dev builds.  
4. Ensure production edge CSP `img-src` allows `https://res.cloudinary.com`.  
5. Re-sync Android (`npm run mobile:sync`) after this change set before QA.

---

## Absolute answers

1. **Why avatars worked but categories didn’t?** Different delivery + fallback strategy.  
2. **Was Cloudinary “down”?** Not necessarily — transform/fallback/Capacitor path bugs were enough.  
3. **Did we fix Android blank images?** Yes for local fallbacks; CDN still needs network.  
4. **Are blank tiles still possible?** Only if both Cloudinary and local SVG fail — then branded gradient placeholder, not empty.
