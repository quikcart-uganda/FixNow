# Admin Media & Interactions — Audit Report

**Date:** July 26, 2026  
**Scope:** Offer previews, marketing KPI cards, category modal/icon picker, payments drill-downs, media fallbacks  
**Approach:** Audit first → reuse existing media/dialog/list APIs → fix root causes only

---

## 1. Inventory (pre-fix)

| Module | Status | Notes |
|---|---|---|
| Marketing Analytics | Working | DrillCards already interactive |
| Technician Offers moderation | Partial | Preview image broken; bulk/search OK |
| Platform Promotions | Working | No dead KPI row |
| Sponsored / Ads | Working | No dead KPI row |
| Dynamic Content blocks | Partial | KPI cards were dead |
| Categories | Partial | Modal clipped; icon free-text; banners raw `<img>` |
| Payments & Escrow | Partial | Lists/actions OK; KPI cards dead |
| Shared `Dialog` | Broken (center) | No max-height / body scroll / sticky header |
| Media helpers | Working | `LazyImage` + `resolveMediaUrl` existed but unused in admin previews |

---

## 2. Root Causes Found

### Issue 1 — Offer Customer App Preview broken image
- Admin used raw `<img src={offer.bannerImageUrl}>`.
- Local uploads are relative signed paths (`/uploads/<uuid>?exp=&sig=`).
- Relative URLs resolve against the Vite admin origin → 404.
- Customer app already fixed this with `resolveMediaUrl` + `LazyImage`.
- `serializeOffer` did not re-sign banners via `publicMediaUrl` (only technician photos did).

### Issue 2 — Marketing dashboard cards inert
- The Live / Scheduled / Drafts / Impressions / Clicks / CTR cards live on **Content Blocks**, not Analytics.
- They were plain `<div>`s; status filters existed but were never driven by the cards.
- Marketing Analytics cards were already interactive from the prior pass.

### Issue 3 — Category modal clipped
- Shared center `Dialog` had no `max-h`, no overflow scroll, and vertically centered a tall form.
- Drawer placement already scrolled; center placement did not.

### Issue 4 — Icon picker
- Free-text “Material symbol” field forced admins to memorize names like `handyman`.
- Storage is a string icon id — compatible with a curated picker.

### Issue 5 — Payments KPI cards
- Summary tiles were non-interactive while rich workspaces already existed below on the same page.
- Missing: scroll/filter focus from cards into ledger / escrow / refund / payout sections.

---

## 3. Files Modified

| File | Change |
|---|---|
| `packages/shared/a11y/Dialog.tsx` | Sticky header + close button; scrollable body; `max-h-[min(92dvh,920px)]`; safe-area aware |
| `apps/admin/pages/OffersModerationPage.tsx` | Preview uses `LazyImage` + `resolveMediaUrl` + branded empty fallback |
| `backend/src/services/marketing/offer.service.ts` | Re-sign `bannerImageUrl` via `publicMediaUrl` on serialize |
| `apps/admin/pages/CategoriesPage.tsx` | Icon picker; LazyImage banners; wider dialog panel |
| `apps/admin/components/CategoryIconPicker.tsx` | **New** searchable icon catalogue |
| `apps/admin/pages/marketing/ContentBlocksPage.tsx` | Interactive KPI cards → filter + scroll to workspace |
| `apps/admin/pages/PaymentsEscrowPage.tsx` | Interactive KPI cards → focused workspaces + escrow filters + richer CSV |

**Reused:** `LazyImage`, `resolveMediaUrl`, `AsyncStateView`, existing payments/content-block APIs, Material `Icon`, existing escrow/payment list sections.

---

## 4. Image Rendering Fixes

- Offer preview: always absolutizes API uploads; falls back to `promotions.first-booking` asset; never shows the browser broken-image icon.
- Category list + form: banners go through `resolveMediaUrl` + `LazyImage`.
- Backend offer serialize re-signs upload tokens for longer-lived admin sessions.
- Missing/failed images → branded placeholder / gradient tile.

---

## 5. Marketing Improvements

Content Blocks KPI cards now:
- Hover / press / focus styles
- Live → `published` filter  
- Scheduled → `scheduled`  
- Drafts → `draft`  
- Total / Impressions / Clicks / CTR → scroll to block workspace (published where relevant)

Marketing Analytics drill-downs from the prior audit remain intact.

---

## 6. Modal Fixes

Center dialogs (including Category create/edit):
- Fit within viewport (`max-h` + `dvh`)
- Header + close always visible
- Content scrolls under the header
- Safe-area padding for mobile notches
- Drawer placement keeps full-height scroll behavior

---

## 7. Category Icon Picker

- Searchable dropdown with live Material glyph + label (Electrical, Plumbing, Carpentry, Cleaning, …).
- Persists Material Symbol id (`electrical_services`, `plumbing`, …).
- Legacy custom icon strings remain visible until replaced (backward compatible).
- Default remains `handyman`.

---

## 8. Escrow / Payments Drill-downs

Each summary card opens a focused workspace on the same page:

| Card | Workspace |
|---|---|
| Payments | Payment ledger (search / status / export) |
| Volume collected | Ledger filtered toward successful revenue |
| Escrow held | Escrow list |
| Held amount | Escrow filtered `held` |
| Disputed | Escrow filtered `disputed` |
| Refunded escrows | Escrow filtered `refunded` |
| Payouts completed | Payout approvals ledger |
| Refund txs | Refund approvals ledger |

Includes search, status filters, CSV export, job/customer/tech references where present. Existing approve/release actions preserved.

---

## 9. Performance Improvements

- Lazy-loaded images via existing `LazyImage`
- No new chart/media libraries
- Content-block KPI clicks only set local filter state (no extra fetches beyond existing list query)
- Payment card focus reuses already-loaded dashboards/lists

---

## 10. Regression Testing

| Check | Result |
|---|---|
| Offer preview uses resolved media URL / fallback | ✅ |
| Content block cards filter + scroll | ✅ |
| Category dialog header/close visible; body scrolls | ✅ |
| Icon picker selects + saves Material id | ✅ |
| Existing category icons still render | ✅ |
| Payments cards focus correct sections | ✅ |
| Escrow status filter works | ✅ |
| Marketing Analytics / offer queues / promotions unchanged functionally | ✅ |
| Typecheck clean for touched surfaces | ✅ |

---

## 11. Production Readiness Assessment

**Ready** for the audited Admin UX issues:
- Broken offer preview root cause fixed (client + serialize).
- Dead Content Block and Payments cards are interactive.
- Category modal and icon UX are production-grade.
- Media fallbacks reuse the established customer/media stack.

**Still future (not invented here):**
- Dedicated payment transaction detail route with full audit timeline
- Server-side PDF export
- Global `<SafeImage>` alias (behavior already covered by `LazyImage`)
- Parish/village geo heatmaps

**Verdict:** Root causes were URL resolution, missing dialog overflow, and non-interactive summary tiles — not missing product modules. Fixes reuse existing APIs and components without breaking working flows.
