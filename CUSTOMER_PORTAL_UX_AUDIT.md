# Customer Portal UX Audit

**Date:** 26 Jul 2026  
**Scope:** Customer Portal — desktop, tablet, mobile, Capacitor/Android  
**Mode:** Audit only (no production redesign applied in this pass)  
**Constraint:** Preserve branding, APIs, auth, routing, backend architecture, Capacitor compatibility

---

## Executive verdict

The Customer Portal is **mobile-first and functionally wired to Admin → API delivery**, but the homepage still **behaves like a phone layout stretched onto desktop**. Large empty regions are caused by **horizontal snap rails + hard `.slice()` caps**, not by missing categories/technicians in the backend. Marketing images fall back to **SVG illustrations**, not professional photography. Admin can upload banners and preview some CMS/marketing forms, but there is **no true live Customer Portal preview** across desktop/tablet/mobile/Android/dark/light for every home rail.

**Do not rewrite architecture.** Redesign should be layout/CSS + image pipeline + Admin media UX on top of existing APIs.

---

## 1. Current issues

### Header & top navigation
| Issue | Observation |
| --- | --- |
| Desktop hamburger always visible | `HomePage` passes `showMenu`. Customer `PortalHeader` does **not** hide the menu button at `md`/`lg` (unlike Admin `md:hidden` and Technician `lg:hidden`). |
| Dual navigation chrome | `CustomerShell` already shows a fixed **icon rail** from `md:` upward **and** the hamburger drawer still appears — redundant desktop chrome. |
| Logo too small / weak | Brand is text-only `FixNow` (`text-base` / `sm:text-lg`), no mark asset in header. |
| Right controls compressed | Header actions use `gap-1 sm:gap-2`. Presence/status also floats as a separate fixed chip in `CustomerShell` while home sets `hideStatus` on the header — asymmetric density. |
| Feels mobile-stretched | Home content uses phone patterns (horizontal scroll, compact header) inside `max-w-6xl` with no desktop expanded nav. |

### Categories
| Issue | Observation |
| --- | --- |
| Few categories on wide screens | API loads up to **100** categories; UI **`.slice(0, 8)`** then renders a **horizontal scroller**, not a responsive grid. |
| Huge empty whitespace | `flex overflow-x-auto` with `min-w-[72px]` icons leaves the rest of the row blank on desktop. |

### Recommended technicians
| Issue | Observation |
| --- | --- |
| Cards hug the left | `TechnicianCard` is locked to `min-w-[208px] max-w-[224px]` inside another horizontal scroller. |
| Cap below fetch size | Search fetches **12**; featured uses `[0]`; “Top rated” uses **`.slice(1, 7)`** (max 6 cards). |
| Not a width-aware grid | No `auto-fill` / breakpoint column grid on desktop. |

### Content & images
| Issue | Observation |
| --- | --- |
| Grey / illustration blocks | Offers without `bannerImageUrl` show gradient + `local_offer` icon. Marketing rails fall back to SVG keys under `public/assets/images/**`. |
| SVG “photography” | Seeds/fallbacks are gradient SVG posters (e.g. `promotions/first-booking.svg`), not JPEG/WEBP service photography. |
| Rails truncated | Home slices promotions / educational / ads to **3 each**. |
| Offers truncated | Home curated feed capped at **4** offers. |

### Responsive / Capacitor
| Issue | Observation |
| --- | --- |
| Desktop under-utilised | Horizontal rails + `max-w-6xl` + icon-only sidebar. |
| Mobile mostly OK | Bottom tab bar (`md:hidden`) + pull-to-refresh + snap rails match phone UX. |
| Android parity risk | Same WebView CSS; empty desktop whitespace also appears on large tablets / foldables unless grids adapt. |

---

## 2. Root causes

### A. Layout pattern choice
Homepage sections intentionally use **mobile carousel rails**:

```285:300:apps/customer/pages/HomePage.tsx
<div className="no-scrollbar scroll-touch-x flex snap-x gap-3 overflow-x-auto px-4 pb-1">
  {safeArray<CustomerCategory>(categoriesQuery.data).slice(0, 8).map((category) => (
```

Same pattern for technicians, offers, and `MarketingRails`.

### B. Artificial frontend caps (not API scarcity)
| Location | Cap |
| --- | --- |
| Categories render | `.slice(0, 8)` after `limit: 100` fetch |
| Top rated technicians | `.slice(1, 7)` after `limit: 12` |
| Home offers | `curatedOffers(...).slice(0, 4)` |
| Marketing rails | `.slice(0, 3)` per channel |

### C. Customer header lacks desktop breakpoint for hamburger

```54:60:packages/shared/header/PortalHeader.tsx
{showMenu && menuItems.length > 0 ? (
  <HeaderMenuButton
    ...
    className={variant === 'technician' ? 'lg:hidden' : variant === 'admin' ? 'md:hidden' : ''}
  />
```

Customer variant → **empty class** → hamburger always on.

### D. Image pipeline defaults to illustration SVGs
`resolveMediaUrl(null, 'promotions.first-booking')` etc. resolve to packaged SVGs in `packages/assets/index.ts`. When Admin content lacks a real upload (or points at legacy `/uploads/placeholders/`), customers see illustrations / empty aspect boxes.

### E. Shell + page padding coupling
`CustomerShell` main uses `md:pl-20`; `HomePage` `PullToRefresh` also uses `md:pl-20` — double awareness of rail width, easy to mis-align when redesigning header.

---

## 3. Files to modify (proposed redesign — not yet changed)

### Customer portal
- `apps/customer/pages/HomePage.tsx` — grids, remove/raise slices, desktop section layouts
- `apps/customer/components/CustomerShell.tsx` — desktop nav / status placement
- `apps/customer/components/CustomerOfferCard.tsx` — hero image, responsive card width
- `apps/customer/pages/OffersPage.tsx`, `CategoriesPage.tsx`, `SearchPage.tsx` — align grids

### Shared chrome / marketing
- `packages/shared/header/PortalHeader.tsx` — customer desktop menu hide; logo scale; action gaps
- `packages/shared/header/HeaderStatusControl.tsx` / `HeaderNotificationsButton.tsx` / `HeaderProfileMenu.tsx` — spacing, touch targets
- `packages/shared/MarketingRails.tsx` — responsive grids vs rails; photography fallbacks
- `packages/shared/header/menuConfig.ts` — optional expanded desktop link set

### Media / assets
- `packages/assets/index.ts` — photography fallback keys (or stop falling back to decorative SVGs)
- `packages/ui/LazyImage.tsx` — ensure srcset/sizes/blur/fallback contract used consistently
- `public/assets/images/**` — replace SVG posters with licensed/Admin-managed WEBP/JPEG set **or** remove as customer-facing defaults

### Admin (image control + preview)
- Marketing pages under `apps/admin/pages/marketing/*` (promotions, sponsored, ads)
- `apps/admin/pages/ContentPage.tsx` + `apps/admin/components/cms/LivePreview.tsx` — extend preview modes
- Media picker / upload components used by marketing forms

### Backend (reuse preferred)
- Existing: `/marketing/customer`, offers home feed, `/uploads`, categories list, technician search
- Likely **no schema rewrite** required for Phase 1–3 layout work
- Image optimisation may need upload variants endpoint later (optional enhancement)

---

## 4. Components to redesign (recommended)

| Component | Redesign intent |
| --- | --- |
| `PortalHeader` (customer) | Larger brand mark + wordmark; hide hamburger ≥`md` when rail/sidebar exists; `gap-3`+ action cluster |
| `CustomerShell` aside | Expand to labelled nav **or** keep icon rail but remove hamburger overlap; optionally collapsible |
| Home Categories | CSS Grid `auto-fill` / breakpoint columns (2–3 / 4 / 6 / 8–12); show all active categories (or paginate, don’t hard-cap at 8) |
| `TechnicianCard` + Top rated | Responsive grid 1–2 / 2–3 / 3–5 / 5–6; drop fixed max width on desktop |
| Featured technician | Full-bleed / wider hero band on desktop |
| `CustomerOfferCard` | Larger hero, badge, tech photo, price/discount, countdown, CTA; grid on desktop |
| `MarketingRails` | Desktop multi-column cards; photography-first media; empty state with Admin CTA message for ops |
| Status control placement | Single source — either header cluster **or** shell float, not both competing |

---

## 5. Responsive improvements (target)

| Breakpoint | Categories | Technicians | Offers / marketing | Nav |
| --- | --- | --- | --- | --- |
| Mobile `<md` | 2–3 cols or compact rail | 1–2 / horizontal OK | horizontal OK | Bottom tabs + hamburger optional |
| Tablet `md–lg` | 4 cols | 2–3 cols | 2–3 cols | Icon rail; **no** hamburger if rail present |
| Desktop `lg+` | 6–8 cols | 3–5 cols | 3–4 cols | Expanded or rail; premium header |
| XL / ultrawide | 8–12 cols | 5–6 cols | 4 cols | Same; use available width inside sensible `max-w` |

Replace fixed carousels with:

```css
grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr));
```

(or Tailwind equivalents) per section.

---

## 6. Image pipeline — current vs required

### Current (good foundations)
- Admin/technician/customer uploads via authenticated `/uploads`
- Offers & marketing items carry `bannerImageUrl`
- `LazyImage` used in offer/marketing cards
- `resolveMediaUrl` centralises URL resolution
- Some `sizes` hints already present in `MarketingRails`

### Gaps vs requirements
| Requirement | Status |
| --- | --- |
| JPEG / PNG / WEBP | Upload MIME support exists; customer defaults are often SVG |
| Responsive `srcset` | Partial / inconsistent — not a full derivative pipeline |
| Retina | Not systematically generated |
| Blur placeholders | Not standard across customer home |
| Fallback images | Exists, but falls back to **illustrations**, not photography |
| Admin crop / archive / restore / schedule / order / audience | Partially present in marketing/CMS; crop + full DAM incomplete |
| Live preview Desktop/Tablet/Mobile/Android/Dark/Light | CMS has device modes; marketing has mobile/desktop form preview — **not** full Customer Home live shell |
| Every displayed image Admin-originated | Structurally yes for offers/marketing; **fallback SVGs are hardcoded frontend assets** |

### Recommended pipeline (non-breaking)
1. Keep Admin upload → store URL on entity.
2. On upload, generate derivatives (e.g. 480 / 960 / 1440 WEBP) **or** use CDN transforms.
3. Customer components request `srcset` from API metadata when present; else single URL.
4. Replace SVG fallbacks with a small Admin-seeded photography library **or** a neutral branded photo plate — never grey empty blocks.
5. Enforce `object-fit: cover` + fixed `aspect-ratio` (already partly done).

---

## 7. Admin integration

### Already connected (reuse)
| Customer surface | Source |
| --- | --- |
| Categories | `categoriesApi.list` ← Admin Category Management |
| Today’s offers | `offersApi.homeFeed` ← technician offers + Admin moderation |
| Platform promotions / safety / ads | `marketingApi.deliverCustomer({ placement: 'home' })` ← Admin Marketing |
| CMS documents | Public content APIs + Admin `ContentPage` |

### Gaps to close in redesign (without new product silos)
- Require banner image before publishing promotions / educational / ads (validation).
- Media library UX: upload, replace, delete, archive, restore, schedule, order, audience (extend existing marketing forms).
- **Customer Home Live Preview** pane: render home rails against draft payload (iframe or embedded preview component) for desktop/tablet/mobile + theme toggle.
- Category banners/icons: Admin already supports; Customer home currently shows **Material icon only** — optional upgrade to Admin banner thumbnails.

---

## 8. Backend API reuse

Prefer these existing contracts — **no breaking changes**:

| Need | API |
| --- | --- |
| Categories | `GET` categories list (`limit` already 100) |
| Technicians | `technicianApi.search` |
| Offers home | `offersApi.homeFeed` |
| Marketing delivery | `GET /marketing/customer` |
| Tracking | `marketingApi.trackPromotion` / `trackSponsored`, `offersApi.track` |
| Uploads | `POST /uploads` |
| Admin marketing CRUD | `/admin/marketing/*` |
| CMS | content/admin content endpoints already used by `ContentPage` |

Optional later (non-blocking for layout redesign): image derivative metadata on upload response.

---

## 9. Capacitor verification plan

After redesign (not executed in this audit):

1. `npm run build && npx cap sync android`
2. Exercise Customer Home on:
   - Phone emulator (bottom tabs, rails/grids)
   - Tablet / large emulator width (grids fill width; no hamburger if rail shown)
3. Confirm:
   - Images load over HTTPS / Capacitor scheme
   - Lazy load does not blank above-the-fold heroes (preload first rail)
   - Safe-area + `pt-safe` / `pb-safe` unchanged
   - AI FAB + bottom nav collision still cleared (`fixnow-ai-fab-pad`)

---

## 10. Regression testing checklist

- [ ] Desktop home uses full useful width (no large empty left-biased rails)
- [ ] Categories wrap in responsive columns; “All categories” still works
- [ ] Technician cards fill 3–6 columns by breakpoint
- [ ] Header: no redundant hamburger on desktop with rail; logo larger; actions spaced ≥12–16px; ≥44px targets
- [ ] Offers show hero photography when Admin/technician supplied URL
- [ ] Safety tips / promotions never render empty grey; photography or strong branded fallback
- [ ] Admin upload → refresh Customer Home shows new image (cache TTL aware; pull-to-refresh)
- [ ] Mobile bottom nav unchanged in behaviour
- [ ] Tablet adapts without horizontal page scroll
- [ ] Auth, routes, APIs, Capacitor plugins unchanged
- [ ] No new hardcoded marketing copy/images in Customer Home (fallbacks only)

---

## 11. Remaining recommendations (priority)

### P0 — Layout (fast, high impact, low risk)
1. Hide customer hamburger from `md:` when shell rail is visible (match Admin/Technician pattern).
2. Convert Categories + Top rated + Offers + Marketing to **responsive CSS grids** on `md+`; keep optional rails only on small screens if desired.
3. Remove or raise `.slice(0, 8)` / `(1, 7)` / `(0, 4)` / `(0, 3)` caps; use CSS to manage density.
4. Increase header action spacing; unify status control into header cluster; drop duplicate floating chip or make it intentional for mobile only.
5. Add FixNow mark to header (reuse `/brand/fixnow-mark.svg`) at larger desktop size.

### P1 — Imagery
6. Seed Admin marketing/offers with real service photography; ban SVG-only publish for customer-facing banners.
7. Replace frontend SVG fallbacks with photography defaults **managed as Admin media**, not repo decorations.
8. Standardise `LazyImage` props: `sizes`, blur, fallback, aspect ratio everywhere on home.

### P2 — Admin preview & DAM
9. Extend Live Preview to Customer Home rails (device + theme).
10. Cropping tool + archive/restore in media picker.
11. Optional upload derivatives for srcset.

### P3 — Premium marketplace polish
12. Expand desktop sidebar labels (Airbnb/Uber-like clarity) or collapsible master-detail nav.
13. Offer cards: countdown, rating, technician logo/photo consistently.
14. Virtualize very long category grids only if catalogue exceeds ~40 visible items.

---

## Content origin map (confirmed)

```
Admin Category Management ──► categoriesApi.list ──► Home Categories
Admin Offer Moderation / Tech Offers ──► offersApi.homeFeed ──► Today’s offers
Admin Marketing (platform / sponsored / ads) ──► marketingApi.deliverCustomer ──► Promotions / Safety / Partners
Customer profile ──► customerApi.getProfile ──► district → technician search
Technician directory ──► technicianApi.search ──► Recommended / Top rated
```

**Hardcoded customer marketing lists:** not found on Home (good).  
**Hardcoded visual fallbacks:** yes — SVG asset map in `@fixnow/assets`.

---

## Explicit non-goals for the redesign pass

- Do not change auth, routing trees, or Capacitor plugin config unless required for media URLs.
- Do not invent a parallel CMS.
- Do not remove mobile bottom navigation.
- Do not block ship on a full CDN if Admin uploads + better fallbacks already fix the “grey block” perception.

---

## Suggested implementation sequence (next chat / PR)

1. **Audit sign-off** (this document)  
2. Header + shell desktop nav cleanup  
3. Home responsive grids (categories, technicians, offers, marketing)  
4. Image fallback + Admin publish rules  
5. Live preview enhancement  
6. Capacitor visual QA  

**Status:** Phase 1 audit complete. **No application code was modified for this deliverable.**
