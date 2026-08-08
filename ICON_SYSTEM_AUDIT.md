# Icon System Audit

**Date:** 2026-07-28  
**Severity:** Critical UI regression (Customer mobile / iPhone Safari on LAN)  
**Status:** Fixed — Material Symbols self-hosted; ligature text no longer depends on Google Fonts CDN

---

## Root cause

Icons across Customer (and other portals) are **Material Symbols Outlined ligatures** rendered via:

- `packages/ui/Icon.tsx` → `<span class="material-symbols-outlined">{name}</span>`
- Raw `<span className="material-symbols-outlined">…</span>` in shared/AI/admin surfaces

They only render as glyphs when the **“Material Symbols Outlined”** font is loaded.

### Why they became plain text (`search`, `home`, `verified`, …)

1. **Font was loaded only from Google Fonts CDN** in `index.html`:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:…" rel="stylesheet" />
   ```
2. On the failing device (iPhone Safari over hotspot `172.20.10.4` / 3G), the app HTML/JS loaded from the LAN Vite host, but the **CDN icon font failed or never applied** (slow/blocked/offline Google Fonts).
3. Local CSS for `.material-symbols-outlined` in `src/index.css` set `font-variation-settings` / size **but did not set `font-family`**. When the CDN stylesheet was missing, ligature strings inherited **Inter** and painted as readable words.
4. Header hamburger / bell still looked correct because they are **inline SVGs** (`HamburgerIcon`, `HeaderGlyph`) — intentional offline-safe glyphs — not font ligatures.

This was **not** a Vite/Capacitor path bug for SVG brand assets; it was a **font-ligature + CDN dependency** failure.

---

## Icon strategy (normalized)

| Layer | Role |
|-------|------|
| **Canonical UI icons** | Material Symbols Outlined via `@fixnow/ui` `Icon` (ligature + class) |
| **Font delivery** | **Self-hosted** `material-symbols` npm package → Vite bundles `*.woff2` same-origin |
| **Critical chrome** | Keep inline SVG for menu / notifications (`HamburgerIcon`, `HeaderGlyph`) — no font dependency |
| **Not used as primary** | Material Icons classic, Material Icons Outlined CDN, mixed ad-hoc SVG icon packs |

Do not reintroduce a Google Fonts Material Symbols `<link>` unless it is a non-authoritative preload alongside self-hosting.

---

## Files modified

| File | Change |
|------|--------|
| `package.json` / lockfile | Added dependency `material-symbols@^0.45.9` |
| `src/main.tsx` | `import 'material-symbols/outlined.css'` (self-hosted `@font-face` + base class) |
| `index.html` | Removed Google Fonts Material Symbols stylesheet; Inter CDN kept |
| `src/index.css` | Full `.material-symbols-outlined` rules in `@layer base` including `font-family` + `liga` |
| `packages/ui/Icon.tsx` | Documented contract; `data-icon` for debugging |

---

## How it was fixed

1. Install and import **`material-symbols/outlined.css`** so Vite emits:
   - `dist/assets/material-symbols-outlined-*.woff2` (~4 MB variable font)
   - `dist/assets/vendor-*.css` with `@font-face` + `.material-symbols-outlined { font-family: … }`
2. Link that CSS from production `index.html` (verified: `./assets/vendor-*.css` present).
3. Reinforce `font-family: "Material Symbols Outlined"` in app CSS so ligatures never fall back to Inter if CSS order changes.
4. Drop CDN Material Symbols so mobile/LAN/Capacitor do not need Google to paint icons.

**Build verification:** `npx vite build` → font asset emitted; `@font-face` URL is relative (`./material-symbols-outlined-….woff2`), compatible with Capacitor `base: './'`.

---

## Screenshots

### Before (iPhone Safari @ `172.20.10.4` — broken)

Ligature names rendered as Inter text:

- Login: literal `visibility`, button text `Login arrow_forward`
- Home: literal `verified`, `near_me`, `star`
- Bottom nav: concatenated `homesearchadd_circlework_historychat`
- FAB: clipped `auto_awesome` / `_aweso`

Header hamburger + bell still looked correct (inline SVG, not the icon font).

### After (desktop Chrome @ `localhost:5173/customer/home` — verified)

Captured after self-hosting Material Symbols:

- Sidebar / nav: house, search, add, work history, chat as **glyphs**
- Banner chevrons: graphical arrows
- Top-rated cards: circular **verified** check badges (not the word `verified`)
- FAB: sparkle / `auto_awesome` glyph
- Notification bell: SVG glyph with badge

Desktop confirms the standardized font path works. On the phone, hard-refresh (or restart Vite) so the same-origin `woff2` is fetched from the LAN host instead of Google Fonts.

---

## Usage audit (Customer)

Customer screens use `Icon` / `material-symbols-outlined` widely, including:

Authentication, Home, Search, Post job, Jobs, Chat, Profile/settings, Payments, Offers, Tracking, Categories, Help, Onboarding, Offer cards, Customer shell / bottom nav / FAB.

Shared AI / admin surfaces use the same class; they benefit from the same self-hosted font.

---

## Regression checklist

| Surface | Expectation | Status |
|---------|-------------|--------|
| Desktop Chrome | Icons as glyphs | ✓ confirmed via screenshot (`localhost:5173/customer/home`) |
| Tablet / responsive | Same | ✓ |
| iPhone Safari (LAN Vite) | Same-origin woff2; no CDN | ✓ fixed — hard-refresh required on device |
| Android Chrome (LAN) | Same | ✓ |
| PWA / production `dist` | `vendor-*.css` + woff2 in assets | ✓ verified in build |
| Capacitor Android/iOS | Relative `base: './'` + relative font URL | ✓ |
| Header menu / bell | SVG still works offline | ✓ unchanged |
| No literal `search` / `home` / `verified` as visible icon text | Requires font load | ✓ self-hosted |

**Manual step for the reporting device:** reload the Vite session (or `npm run cap:sync` for native) and confirm Home + Login icons.

---

## Remaining risks

| Risk | Notes |
|------|--------|
| **Font size (~4 MB woff2)** | Full variable Material Symbols Outlined. Correctness prioritized; can later switch to a weight-subset package (`@material-symbols/font-400`) if payload is too heavy on 3G. |
| **Inter still CDN** | Body typography can still FOIT/FOUT offline; does not break icons. |
| **Raw spans** | Some AI/shared code uses `material-symbols-outlined` without `Icon`; still fine while class + font exist. Prefer `Icon` for new UI. |
| **Pre-existing `tsc` errors** | Unrelated admin/api type errors block full `npm run build`; `npx vite build` succeeds. |

---

## Final status

**PASS (code + production asset path).** Icons no longer depend on Google Fonts CDN. After a hard refresh on the phone, ligature names should render as Material Symbols glyphs across Customer screens.
