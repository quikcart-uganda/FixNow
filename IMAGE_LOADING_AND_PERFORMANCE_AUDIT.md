# Image Loading & Application Performance Audit

## Verdict

Category cards that looked “broken” were mostly **data + URL resolution**, not CSS. Live catalog: **29 HTTPS** banners, **71 `asset:`** keys (many unmapped to Cloudinary). The client ignored slug aliases for `asset:` keys, so those tiles failed or fell through to wrong placeholders. Home felt slow because splash **prefetch wrote cache keys Home no longer reads**, technicians/offers waited on profile, and location updates **double-fetched** via `resync`.

---

## 1. Missing image audit

| Source | Count (live `GET /categories?limit=100`) |
| --- | --- |
| Total categories returned | 100 |
| `https://` Cloudinary banners | 29 |
| `asset:categories.*` unresolved until fix | 71 |
| Empty `bannerImageUrl` | 0 |

Cloudinary catalog has **25** dedicated category photos. Seed defines ~110 niches; visual seed maps ~31 slugs to HTTPS. Remaining rows keep `asset:categories.{slug}` from marketing seed.

**Missing dedicated artwork (examples):** niches with no catalog leaf and no alias — e.g. tutoring, laundry niches not aliased — now render **Material icon** (honest empty), not a technician silhouette.

---

## 2. Broken asset report

| Failure mode | Before | After |
| --- | --- | --- |
| `asset:categories.furniture-assembly` | Looked up catalog key literally → miss | Alias → `categories.furniture` |
| `asset:categories.lighting` etc. | Miss / placeholder | Alias map → nearest catalog photo |
| Unknown `asset:categories.*` | `localAssetUrl` → **technician placeholder SVG** | Empty src → **category icon** + `logImageDiag` |
| LazyImage fallback | Masked 404s as tech silhouette | Category-safe local SVG only when present; else icon |

Broken loads still log via `logImageDiag` (`start` / `retry` / `fallback` / `exhausted`).

---

## 3. Image pipeline analysis

```
DB bannerImageUrl (https | asset: | empty)
  → serializeCategory (raw)
  → mapCategory
  → resolveCategoryBannerSrc(raw, slug)
       → categoryDedicatedMediaKey (aliases, no silent handyman)
       → resolveMediaUrl / asset: alias repair
  → cloudinaryPresetUrl(thumbnailSquare) when CDN
  → LazyImage (retry → local SVG if any → empty glyph / icon)
```

**Files:** `packages/assets/index.ts`, `packages/ui/LazyImage.tsx`, `apps/customer/pages/HomePage.tsx`, `backend/.../category.service.ts` (passthrough).

Home tiles use **400×400** `thumbnailSquare` — not full ~1600px originals. Quality not reduced beyond existing Cloudinary `q_auto`.

---

## 4. API performance metrics (orchestration)

| Request | Parallel? | Notes |
| --- | --- | --- |
| Categories | Mount | Cache key aligned with prefetch |
| Marketing | Mount | Aligned |
| Technicians | Mount (was gated on profile) | Now immediate with district default Kampala |
| Offers | Mount (was gated) | Same |
| Profile | Mount | Auth only; guest stub |
| Job affinity | Mount | Soft personalise **client-side** (no second network abort) |

Splash prefetch (≤1.8s) now writes:

- `customer.home.technicians.v1:Kampala:any`
- `customer.home.v1:offers:Kampala`

matching Home readers.

---

## 5. Database performance findings

No N+1 change required for this pass. Category list is a single query; image URLs are fields, not populated blobs. Slow feel was **client cache miss + sequential gates**, not Mongo aggregation for Home rails.

---

## 6. Frontend rendering analysis

| Issue | Fix |
| --- | --- |
| Prefetch key mismatch | District-suffixed keys + homepage search params |
| Profile gate on public rails | Removed `locationReady` enable gate |
| Affinity refetch | `useMemo(personalise…)` without cacheKey churn |
| Location → double reload | Stop firing `fixnow:resync` with location-updated |
| Pull-to-refresh stuck on slowest of 6 | `Promise.allSettled` |
| Lazy Home chunk after splash | Preload `HomePage` during splash |
| Category image honesty | Icon when no dedicated art |

---

## 7. Network waterfall (before → after)

**Before**

```
Splash prefetch (flat keys) ─┐
Navigate + Suspense Home chunk ┤ often miss
Profile loading ───────────────┼─→ techs/offers start late
Affinity lands ────────────────┘─→ techs again
Location update → location-updated + resync → everything ×2
```

**After**

```
Splash: prefetch (matching keys) ∥ Home chunk preload
Home mount: categories + marketing + techs + offers in parallel
Profile/affinity: non-blocking; personalise in memory
Location: single reload path
```

---

## 8. Startup timeline

| Phase | Target |
| --- | --- |
| Font race | ≤1200ms (unchanged) |
| Splash + prefetch | ≤1800ms budget |
| Home Suspense | Near-zero when preload hits |
| Above-the-fold rails | Parallel; independent `AsyncStateView` errors |

---

## 9. Optimizations implemented

- `resolveCategoryBannerSrc` / `categoryDedicatedMediaKey` / expanded aliases
- `asset:` category resolution via aliases; no tech placeholder for categories
- Prefetch key + param alignment; Home chunk preload
- Parallel public rails; client-side affinity
- Location dual-event removed
- PTR `allSettled`
- Offer/Pay sticky footers clear customer tab + safe area

---

## 10. Before vs after performance

| Metric | Before | After |
| --- | --- | --- |
| Techs/offers after splash | Cold miss (wrong keys) | Warm for Kampala |
| Auth Home first tech fetch | After profile settle | Immediate |
| Tech fetch count (affinity) | Often 2 network | 1 network |
| Location grant | 2× full reload | 1× Home handler |
| Category `asset:` tiles | Miss / wrong placeholder | Alias photo or icon |
| “Refreshing…” | Waited on all 6 (fail-any) | Settles when all settle; sections keep own errors |

**Not done (follow-up):** upload unique Cloudinary art for every niche; DB rewrite of remaining `asset:` → HTTPS via `seed-visual-assets`. Client aliases cover nearest matches without inventing fake “uploaded” uniqueness.
