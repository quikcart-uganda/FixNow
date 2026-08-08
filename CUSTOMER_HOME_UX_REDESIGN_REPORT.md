# Customer Home UX Redesign Report

**Date:** 2026-07-26  
**Scope:** Customer Home presentation, media rendering, responsive hierarchy, and AI launcher placement  
**Preserved:** Authentication, API contracts, offers, booking routes, categories, recommendations, and promotions

## 1. UX problems found

The previous Home screen rendered all available marketplace and marketing data instead of curating a useful first journey. Its first viewport was dominated by a promotional hero, a large recommendation card, and repeated offer rails. Categories—the fastest route to completing the customer’s task—appeared near the bottom.

Observed problems:

- Five near-identical offer rails rendered from one feed.
- Offer listing cards exposed secondary controls and analytics better suited to the detail page.
- Technician cards used large landscape artwork and displayed low-priority job-count metadata.
- The promotional hero duplicated content shown again under platform promotions.
- Partner advertisements added another horizontal rail without advancing the primary customer journey.
- Section headings had nearly equal visual weight.
- The floating AI launcher covered card content and actions while scrolling.
- Cards were 260–280px wide and visually tall on a 390–472px mobile viewport.
- Invalid media displayed native browser broken-image icons.

## 2. Image loading root causes

### Offer images

`CustomerOfferCard` passed `offer.bannerImageUrl` directly to `<LazyImage>`, bypassing `resolveMediaUrl`. Stored values such as `asset:promotions.*`, legacy `/uploads/placeholders/*`, and relative asset paths therefore reached the browser unchanged.

### Technician avatars

Seeded/demo technician `photoUrl` values can contain promotion artwork. The old resolver treated any syntactically valid `asset:` or relative path as a valid technician image, so “Weekend savings” artwork appeared as a technician avatar.

### Fallback behavior

`LazyImage` only switched to a fallback when one was explicitly supplied. If the fallback also failed—or no fallback was provided—the browser’s broken-image icon remained visible.

### Fix

- All offer and technician images now use `resolveMediaUrl`.
- Technician contexts reject promotion/campaign/advertisement/offer artwork and use a technician placeholder.
- `LazyImage` now has primary → fallback → neutral rendered placeholder states.
- The technician placeholder was redesigned as square avatar artwork rather than a landscape banner.
- Home and marketing cards pass explicit local fallback URLs.

No Cloudinary or backend contract change was required.

## 3. Layout improvements

New Home order:

1. Header
2. Greeting and service search
3. Choose a service
4. Recommended technician
5. Top rated near the customer
6. Post a job
7. Today’s offers
8. Platform promotions
9. Tips & safety
10. Recent activity

The oversized duplicate hero was removed from Home. Its campaign remains available in the lower platform promotions section.

## 4. Component changes

### Home

- Rebuilt `HomePage` around the task journey.
- Categories are limited to the first eight, with a clear “All categories” route.
- Recommendation uses one compact horizontal card.
- Top-rated cards show only avatar, name, specialty, rating, trust score, and Book.
- Post Job is a concise decision-point CTA.
- Recent Activity links to the existing jobs area without introducing another API request.

### Offers

Home now builds one deduplicated, curated list (maximum four) from featured, nearby, recommended, and popular results.

Compact cards contain:

- Offer image
- Discount
- Title
- Technician
- Rating
- Expiry
- Book button

Save, share, remaining redemptions, distance, extra badges, and richer metadata remain on non-compact/detail experiences.

### Marketing

Home renders at most three platform promotions and three safety items. Partner ads are not rendered on Home. Card width was reduced to 220–240px.

### AI launcher

On mobile, AI Help is now a bottom-navigation item. It no longer floats over cards, buttons, or copy. Desktop retains the floating launcher.

## 5. Performance optimisations

- Replaced five duplicated offer rails with one deduplicated rail.
- Limited Home offer rendering to four cards.
- Limited category rendering to eight items.
- Limited platform promotion and safety rails to three items each.
- Removed partner-ad rendering from Home.
- Preserved the existing single offers request and single marketing request.
- Secondary images retain native lazy loading and async decoding.
- No additional Home API request was introduced.

## 6. Responsive improvements

- Mobile cards use 208–240px widths, allowing the next item to remain visible as a scroll cue.
- Touch targets remain at least 40–44px.
- Horizontal rails use consistent 12px gaps and 16px page gutters.
- Section spacing is consistently 28–32px.
- Home has no document-level horizontal overflow at a 390px viewport.
- AI Help participates in bottom navigation instead of occupying content space.
- Long names and specialties use truncation/line clamping.

## 7. Files modified

| File | Change |
|---|---|
| `apps/customer/pages/HomePage.tsx` | Complete Home hierarchy and density redesign |
| `apps/customer/components/CustomerOfferCard.tsx` | Simplified compact card and resolved media |
| `apps/customer/components/CustomerShell.tsx` | Embedded mobile AI navigation item |
| `packages/shared/AiAssistantLauncher.tsx` | Added non-floating embedded mode |
| `packages/shared/MarketingRails.tsx` | Smaller cards and explicit media fallbacks |
| `packages/assets/index.ts` | Media-context validation for technician images |
| `packages/ui/LazyImage.tsx` | Multi-stage failure handling; no broken-image icon |
| `public/assets/images/technicians/placeholder.svg` | Square avatar-safe placeholder |

## 8. Before vs after

| Area | Before | After |
|---|---|---|
| First journey | Marketing first | Search and categories first |
| Offers | Up to five repeated rails | One curated rail, max four cards |
| Offer density | 10+ competing data/actions | Seven essential fields/actions |
| Technician cards | Landscape art, job counts | Avatar, specialty, rating, trust, Book |
| Hero | Large duplicate campaign | Removed; promotion retained lower down |
| AI | Floating over content | Mobile bottom-nav item |
| Broken media | Native broken-image glyphs | Resolved URL or graceful placeholder |
| Home marketing | Promotions, education, partner ads | Promotions and safety only |

## 9. Regression testing results

### Live browser verification

- Customer login and Home load succeeded.
- Home settled with **0 skeletons**.
- Runtime image audit found **0 completed images with `naturalWidth === 0`**.
- Mobile viewport: **390 × 844**.
- Document horizontal overflow: **0px**.
- Categories, recommendation, top-rated technicians, Post Job, offers, promotions, safety, and Recent Activity rendered in the intended order.
- Mobile navigation exposed Home, Search, Post, Jobs, Chat, and AI Help.
- `.fixnow-ai-fab` was absent on mobile; the assistant no longer overlaid Home content.

### Static checks

- Changed-file Oxlint: **passed**.
- Existing Fast Refresh warnings remain in `CustomerOfferCard` because utility functions are exported from the component file; no new lint errors.
- Repository-wide TypeScript build remains blocked by pre-existing errors in Admin, test Node type configuration, health checks, and tracking map declarations. No TypeScript error referenced a modified redesign file.

## Follow-up from audits (2026-07-26)

Applied after [Map homepage UX components](a4833fd9-c1d1-4253-b6d8-1fedce245c46) and [Trace homepage media failures](97a683de-338e-41a5-8501-371bea876ca0):

- Nested Home `<main>` replaced with `<div>` to avoid invalid landmarks under `CustomerShell`.
- Section copy aligned to Categories / Recommended technician / Post a job / Safety tips.
- Technician and offer Home queries wait for profile settle and pass `district`, with district-scoped cache keys.
- `curatedOffers()` now includes `expiringSoon` and prefers featured → recommended → nearby → expiring → popular.
- Empty state when Top Rated would otherwise render blank after removing the recommended technician.
- Same `resolveMediaUrl` + fallback treatment applied to `OfferDetailPage` and `SearchPage` (same raw `/uploads/placeholders/...` failure mode as Home offer cards).

Deferred (intentional): partner ads on Home remain suppressed; Recent Activity stays a jobs entry point rather than a second live job-history query; splash prefetch revalidation tuning left for a dedicated performance pass.
