# Technician Portal Production Audit

**Date:** 2026-07-26  
**Scope:** Dashboard card interactivity · Session persistence · Marketing media · Admin CMS · Responsive rails  
**Constraint:** Preserve architecture, routing, APIs, auth, branding; no breaking changes

---

## 1. Findings

### Phase 1 — Dashboard cards
Almost every metric on `DashboardPage` used display-only `StatCard` / `div`s with **no navigation**, despite existing detail routes (`/technician/jobs`, `/active`, `/reviews`, `/earnings`, `/reputation`, etc.).

### Phase 2 — Session persistence
Refreshing sometimes bounced to login due to:
1. **Refresh-token rotation race** — parallel `/auth/refresh` calls (StrictMode + interceptor) reused a revoked token and wiped the session family  
2. **Network errors treated as logout** — transport failures cleared tokens  
3. Access token is memory-only (by design) so every reload must refresh successfully once

### Phase 3–5 — Marketing media
- Rails already use `resolveMediaUrl` + `LazyImage`, but many banners were SVG placeholders / gradients  
- Admin Platform Promotion / Sponsored create forms had **no image upload** (CMS `MediaLibrary` existed but was unwired)  
- Promo cards tracked clicks but often did not navigate  
- Card widths were fixed; aspect ratios were short (`h-24`) and could crop poorly on mobile

### Screenshots reviewed
- Technician dashboard with zeroed metrics + non-clickable cards  
- Customer login (session bootstrap path)  
- Technician marketing rails with gradient/SVG-style banners  

---

## 2. Root causes

| Area | Root cause |
|------|------------|
| Dead metric cards | `StatCard` had no `to` / `onClick` API; Trust / Reputation / Guarantee were plain markup |
| Session bounce | Dual refresh paths without mutex; `clearSession` on any restore failure |
| Flat marketing art | Seed + admin forms never required raster `bannerImageUrl`; placeholders remapped to SVG catalog |
| No live admin preview | CMS LivePreview/MediaLibrary not reused on marketing create forms |

---

## 3. Components changed

| File | Change |
|------|--------|
| `packages/ui/Card.tsx` | `StatCard` supports `to` / `onClick` |
| `apps/technician/pages/DashboardPage.tsx` | Wired all metric cards + free-jobs body + badges |
| `apps/technician/components/trust/Trust.tsx` | Trust hero, ladder, guarantee → existing routes |
| `packages/api/client.ts` | Exported `queueRefresh`; no logout on network refresh failure; skip refresh URL in 401 loop |
| `packages/api/authApi.ts` | `refresh()` uses single-flight `queueRefresh` |
| `packages/hooks/AuthProvider.tsx` | Restore retries network blips; clears only on 401/403 |
| `packages/api/index.ts` | Export `queueRefresh` |
| `packages/shared/MarketingRails.tsx` | Promo cards navigate; responsive widths; 16:9 object-cover |
| `apps/admin/pages/marketing/PlatformPromotionsPage.tsx` | Audience select, MediaLibrary upload, live preview |
| `apps/admin/pages/marketing/SponsoredContentPage.tsx` | Banner upload + live desktop/mobile preview |

---

## 4. APIs reused

- `jobsApi.nearby` / `jobsApi.list` (dashboard counts)  
- `technicianApi.getProfile` / `dashboard`  
- `marketingApi.deliverTechnician` / create platform & sponsored  
- `POST /uploads` via existing `MediaLibrary`  
- `GET /auth/refresh` + `/auth/me` (mutexed)  
- Cloudinary/local storage providers already behind uploads  

**No new marketplace endpoints.** No fake stats.

---

## 5. Session persistence fixes

1. **Single-flight refresh** — AuthProvider and axios interceptor share `queueRefresh()`  
2. **Auth vs network** — 401/403 revoke session; transport errors keep refresh token and retry once  
3. **Interceptor** — does not retry `/auth/refresh` itself; network failure during refresh does not clear tokens  

**Expected after fix:** Refresh on Nearby Jobs (or any technician route) returns to the same page when tokens are valid.

---

## 6. Image pipeline implementation

| Capability | Status |
|------------|--------|
| JPG / PNG / WEBP upload | Via CMS `MediaLibrary` → `POST /uploads` |
| Lazy loading + skeleton | Existing `LazyImage` |
| Retry + fallback | Existing |
| Aspect-ratio + object-cover | Marketing rails updated to 16:9 |
| Responsive card width | `min(70vw, 240px)` on small screens |
| `sizes` hint | Passed on rail images |
| Full `srcset` generation | **Deferred** (Cloudinary `deliveryUrl` exists; not wired into LazyImage yet) |
| Crop UI / focal point | **Deferred** (recommend next iteration on MediaLibrary) |

---

## 7. Marketing content architecture

```
Admin (Platform Promotions / Sponsored)
  → bannerImageUrl + audience + schedule
  → Backend models (PlatformPromotion / SponsoredContent)
  → GET /marketing/technician|customer
  → MarketingRails (Customer + Technician)
```

No frontend-hardcoded campaign copy required for new content. Seeded SVG placeholders remain as **fallback** only when URL missing.

---

## 8. Live preview implementation

On Platform Promotions and Sponsored create forms:
- Desktop / Mobile width toggle  
- Customer / Technician audience toggle (promotions)  
- Live title, body, CTA, and banner as fields change  

Full dark-mode / multi-hero crop studio **not** built in this pass (see recommendations).

---

## 9. Mobile responsiveness verification

| Check | Result |
|-------|--------|
| Rail cards resize (`70vw` → 220px) | Implemented |
| 16:9 image box, `object-cover` | Implemented |
| Touch targets on StatCards | Link wraps full card |
| Desktop layout preserved | Grid breakpoints unchanged |

---

## 10. Android verification

Same SPA WebView (`webDir: dist`). Auth uses keystore mirror + Web Storage; refresh mutex applies equally. Marketing images use absolute upload/CDN URLs resolved by `resolveMediaUrl`.  
**Manual:** rebuild + `cap:sync` after pull to verify banners and session on device.

---

## 11. Regression results

| Criterion | Status |
|-----------|--------|
| Dashboard cards open correct detail pages | ✓ wired to existing routes |
| No fake statistics | ✓ same APIs |
| Session survives refresh (valid tokens) | ✓ mutex + network-safe restore |
| Protected routes remain secure | ✓ still RequireAuth |
| Marketing upload + preview | ✓ admin forms |
| Customer + Technician delivery | ✓ same delivery API / audience |
| Accessibility (aria-label on cards) | ✓ |
| Crop / multi-hero / auto-thumbnails | Remaining |

### Card → route map (implemented)

| Card | Destination |
|------|-------------|
| Available Jobs | `/technician/jobs` |
| Assigned Jobs | `/technician/active` |
| Completed Jobs | `/technician/active` |
| Rating | `/technician/reviews` |
| Jobs Won | `/technician/achievements` |
| Earnings | `/technician/earnings` |
| Response Rate | `/technician/reputation` |
| Trust hero + sub-scores | `/technician/reputation` |
| Reputation Engine | `/technician/reputation` |
| Badges | `/technician/achievements` |
| Free jobs / Marketplace Health | `/technician/locked` or `/upgrade` |
| Guarantee chip | `/technician/guarantee` |

---

## 12. Remaining recommendations

1. **Completed Jobs** dedicated list (filter Active page or BottomSheet of completed jobs) when product wants separation from Assigned.  
2. Wire Cloudinary `deliveryUrl` into `LazyImage` `srcSet` for retina rails.  
3. Extend MediaLibrary with crop / focal-point / alt-text persistence on marketing entities.  
4. Admin replace/archive/duplicate banners on edit (create path done; edit drawer still status-only).  
5. Seed a few technician-audience rows with real raster URLs for demos.  
6. Ensure login “Remember me” stays checked for long-lived refresh storage on shared devices.

---

## Success criteria

| Criterion | Met |
|-----------|-----|
| Interactive dashboard cards | ✓ |
| Session survives refresh | ✓ (valid session) |
| Marketing images uploadable from Admin | ✓ |
| Live create preview | ✓ (desktop/mobile) |
| Backward compatible | ✓ |
| Production-quality path without redesign | ✓ |
