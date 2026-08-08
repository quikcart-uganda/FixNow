# Technician Icon Rendering Audit

**Date:** 2026-07-28  
**Severity:** Critical UI regression (portal-wide)  
**Portals affected:** Technician (reported), Customer & Admin (same shared stack)

---

## Root cause

FixNow uses **Material Symbols Outlined** ligatures via a shared `Icon` component. Glyphs only appear when the self-hosted **woff2** font is applied. When it is not, the browser paints the raw ligature string (`near_me`, `bolt`, …) in Inter/sans-serif.

### Architectural failure points

1. **Font delivery depended on CSS `url(./…woff2)`** from `material-symbols/outlined.css`.
2. Vite is configured with **`base: './'`** (Capacitor). Relative font URLs are fragile across CSS chunking, nested SPA routes (`/technician/dashboard`), LAN hosts, and WebViews.
3. Icon styles lived in **`@layer base`**, so they could lose cascade fights with utilities.
4. There was **no fallback**: a missing font always leaked icon *names* into the UI.
5. Header-critical controls had already been moved to SVG (`HeaderGlyph` / `HamburgerIcon`) — which is why the notification **bell** still looked fine while sidebar/dashboard icons broke.

This was **not** per-page bad icon names. The shared icon system was brittle.

---

## Icon system (actual)

| Piece | Implementation |
|-------|----------------|
| System | Material Symbols Outlined (ligature font) |
| Package | `material-symbols@0.45.9` |
| Wrapper | `packages/ui/Icon.tsx` |
| Admin wrapper | `apps/admin/components/ui.tsx` → re-exports shared `Icon` |
| Header-critical | Inline SVG (`HamburgerIcon`, `HeaderGlyph`) — font-independent |
| Boot | `src/main.tsx` imports CSS + injects `@font-face` |

Customer, Technician, and Admin all share `@fixnow/ui` `Icon`.

---

## Fix implemented

1. **`packages/ui/materialSymbols.ts`**  
   - Injects `@font-face` using Vite `?url` so the woff2 path is always correct.  
   - Registers a **`FixNow Icon Fallback`** face with `size-adjust: 0%` so failed fonts collapse to invisible — not readable names.  
   - `font-display: swap`.

2. **`packages/ui/Icon.tsx`**  
   - Ensures font on mount.  
   - While unavailable: renders `.fixnow-icon-fallback` (neutral square).  
   - Never leaves ligature names visible as UI copy.

3. **`src/index.css`**  
   - Moved `.material-symbols-outlined` **out of `@layer base`**.  
   - `font-family: "Material Symbols Outlined", "FixNow Icon Fallback", sans-serif !important`.  
   - Clip bounds + `liga` features.

4. **`src/main.tsx`**  
   - Calls `injectMaterialSymbolsFont()` immediately.  
   - Awaits font load (capped) before first React paint.

5. **Admin `Icon`**  
   - Delegates to shared `@fixnow/ui` `Icon` (one code path).

6. **Production build**  
   - Confirmed `dist/assets/material-symbols-outlined-*.woff2` (~3.9MB) is emitted.  
   - `npm run build` succeeds.

---

## Files modified

- `packages/ui/materialSymbols.ts` *(new)*
- `packages/ui/Icon.tsx`
- `packages/ui/index.ts`
- `src/main.tsx`
- `src/index.css`
- `apps/admin/components/ui.tsx`
- `TECHNICIAN_ICON_RENDERING_AUDIT.md` *(this file)*

---

## Components / surfaces audited

| Surface | Uses shared Icon? | Status |
|---------|-------------------|--------|
| Technician sidebar / bottom nav | Yes (`AppShell`) | Fixed centrally |
| Dashboard quick actions / stats | Yes | Fixed centrally |
| Trust / Guarantee chips | Yes | Fixed centrally |
| Jobs, Portfolio, Reviews, Earnings, Settings, … | Yes | Fixed centrally |
| Admin shell / pages | Admin `Icon` → shared | Fixed centrally |
| Customer portal | `@fixnow/ui` Icon | Fixed centrally |
| Header bell / hamburger | SVG glyphs | Already OK |

Raw `<span className="material-symbols-outlined">` call sites still benefit from unlayered CSS + collapse fallback.

---

## Verification

| Check | Result |
|-------|--------|
| Desktop Chrome (automation) | Font check `true`; icon boxes ~1em wide (glyph, not string); inject style present |
| `body.innerText` contains `near_me` | **false** |
| Production `vite build` | Success; woff2 hashed into `dist/assets/` |
| Admin Icon path | Shared renderer |
| Customer Icon path | Shared renderer |
| Mobile / Capacitor | Same `?url` font registration (base `./` safe) |

### Manual confirm (Edge / Firefox / phone)

1. Hard-refresh `http://localhost:5173/technician/dashboard` (Ctrl+F5).  
2. Sidebar should show glyphs, not `near_me` / `assignment`.  
3. Dashboard “Unlock Unlimited” shows a bolt glyph, not the word `bolt`.  
4. Repeat on Customer + Admin shells.

---

## Before / after

| Before | After |
|--------|--------|
| Ligature names visible as Inter text | Material glyphs (or quiet geometric fallback while loading) |
| Font URL fragile under `base: './'` | Vite-resolved `?url` `@font-face` |
| Styles in `@layer base` | Unlayered + `!important` font-family |
| Admin duplicate Icon span | Single shared `Icon` |

---

## Success criteria

- ✅ No icon identifiers visible as UI copy when the font fails (collapsed fallback).  
- ✅ Shared icon system repaired for Customer, Technician, and Admin.  
- ✅ Production build includes the Material Symbols woff2.  
- ✅ Root cause addressed (font registration + cascade + fallback), not per-icon renames.
