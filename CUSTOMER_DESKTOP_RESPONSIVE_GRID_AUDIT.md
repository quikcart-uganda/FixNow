# Customer Desktop Responsive Grid Audit

**Date:** 2026-07-28  
**Scope:** Customer portal desktop layouts (Home + related rails/pages)  
**Constraint:** Mobile UX preserved via `max-md:` / `md:hidden` / `md:grid` splits — no API or branding changes

---

## Components audited

| Component / page | Finding |
|------------------|---------|
| `CustomerShell` | Correct single `md:pl-20` for icon rail |
| `HomePage` | `max-w-6xl` + **duplicate** `md:pl-20` narrowed desktop; categories/offers/techs used mobile rails on all viewports |
| `TechnicianCard` / recommended block | Recommended was a stretched mobile row; top-rated capped at 6 cards / weak column count |
| `MarketingRails` | Always horizontal scroll + `max-w-[240px]` cards |
| `CustomerOfferCard` | Compact mode forced 220–240px width even in grids |
| `CategoriesPage` | Stopped at `lg:grid-cols-4` |
| `SearchPage` / `OffersPage` / `SavedOffersPage` | Single-column or 2-col only |
| Shell child pages | Redundant `md:pl-20` (double offset with shell) |

---

## Responsive issues found

1. **Double sidebar padding** — shell + page both applied `md:pl-20` → ~160px left gutter.
2. **Hard max-width** — `max-w-6xl` (~1152px) left large empty margins on 1440–1920 displays.
3. **Categories** — always horizontal scroll, sliced to 8 icons → sparse desktop whitespace.
4. **Top rated** — only `slice(1, 7)` (6 cards) with max ~5 columns → looked like “stuck at three cards” on common laptop widths.
5. **Recommended** — one stretched mobile strip, no desktop metrics/CTA composition.
6. **Offers / promotions / ads** — carousel-only rails with fixed card widths.

---

## Files modified

| File | Changes |
|------|---------|
| `apps/customer/pages/HomePage.tsx` | Wider container; category grid; recommended desktop layout; top-rated carousel/grid split; denser data slices; remove duplicate padding |
| `apps/customer/pages/CategoriesPage.tsx` | Dense responsive category grid; remove duplicate padding |
| `apps/customer/pages/SearchPage.tsx` | Desktop result grid; remove duplicate padding |
| `apps/customer/pages/OffersPage.tsx` | 2→4 column offer grid; remove duplicate padding |
| `apps/customer/pages/SavedOffersPage.tsx` | Denser offer grid; remove duplicate padding |
| `apps/customer/components/CustomerOfferCard.tsx` | Compact width only below `md` |
| `packages/shared/MarketingRails.tsx` | Mobile scroll + desktop multi-column grids |
| `packages/shared/PremiumSponsorHero.tsx` | Wider `sizes` hint for hero imagery |
| Multiple customer pages | Removed redundant `md:pl-20` (PayJob fixed footer **kept** `md:pl-20`) |

---

## Grid changes

### Categories (Home)

| Breakpoint | Layout |
|------------|--------|
| `< md` | Horizontal scroll (unchanged), 8 icons |
| `md` | 8 columns |
| `lg` | 10 columns |
| `xl` | 12 columns |
| `2xl` | 14 columns (`repeat(14, minmax(0,1fr))`), up to 16 icons |

### Top rated technicians

| Breakpoint | Layout |
|------------|--------|
| `< md` | Horizontal carousel |
| `md` | 2 cols |
| `lg` | 3 cols |
| `xl` | 4 cols |
| `≥1440px` | 5 cols |
| `2xl` | 6 cols |

Fetch limit **24**; display `slice(1, 13)` (up to 12 cards after featured).

### Offers / Marketing rails

| Breakpoint | Layout |
|------------|--------|
| `< md` | Horizontal snap rails (unchanged) |
| `md+` | `grid-cols-2` → `lg:3` → `xl:4` |

### All Categories page

`2 / 3 / 4 / 6 / 8 / 10` columns from default → `2xl`.

### Container

Home content: `max-w-[100rem]` (~1600px) instead of `max-w-6xl`.

---

## Card layout improvements

### Recommended technician (desktop `md+`)

Three-zone composition:

1. **Left** — avatar, name, trade, match hint  
2. **Middle** — rating / trust / availability / distance metric tiles  
3. **Right** — Book now + View profile  

Mobile keeps the previous compact row (`md:hidden`).

### Technician cards

Full-width in desktop grids; fixed snap width only under `md`.

---

## Before / after (desktop Home)

**Before**

- Narrow centered column (`max-w-6xl` + double `pl-20`)
- Categories: ~8 icons in a short row with empty space
- Top rated: few mobile-width cards
- Recommended: full-width stretched mobile strip

**After**

- Content uses available width up to ~1600px with single rail offset
- Categories fill 8–14 columns
- Top rated fills 2–6 columns with more cards
- Recommended uses desktop info / metrics / CTA layout
- Promotions / offers / partner ads use multi-column grids on `md+`

---

## Desktop breakpoint verification

| Width | Expected |
|-------|----------|
| 1024 | Categories 8–10; techs 2–3; marketing 2–3 |
| 1280 | Categories 10; techs 3–4; offers 3 |
| 1366 | Categories 10–12; techs 4 |
| 1440 | Categories 12; techs 5 |
| 1600 | Categories 12–14; techs 5–6 |
| 1920 | Categories 14; techs 6 |

Hard-refresh Vite after pull. Confirm on a wide window that side gutters shrink and more cards appear per row.

---

## Mobile / tablet confirmation

| Surface | Status |
|---------|--------|
| Home categories `< md` | Still horizontal scroll |
| Home top rated `< md` | Still carousel |
| Home recommended `< md` | Still compact row |
| Marketing / offers `< md` | Still snap rails |
| Bottom tab bar | Unchanged (`md:hidden`) |
| Icon rail | Unchanged (`md:flex`) |
| Branding / APIs | Unchanged |

---

## Final status

**PASS** — Customer Home and shared marketing rails now use intentional desktop grids; mobile carousels/rows preserved behind breakpoints.
