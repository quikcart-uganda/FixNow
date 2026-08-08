# FixNow Command Center — Landing Redesign

**Date:** July 26, 2026  
**Scope:** Visual redesign of the Admin Command Center first-run landing (`/admin/login` when no real administrator exists).  
**Constraint:** Workflow unchanged. No CLI, environment banners, or internal setup details.

---

## Summary

The simplified gateway actions were kept and restyled as a premium SaaS entry experience: clear brand hero, one primary CTA, and two elevated secondary cards. Hierarchy, spacing, iconography, and microinteractions now match the polish of Linear / Stripe / Vercel-style admin consoles without reintroducing developer noise.

---

## Components Updated

| Component | File | Change |
|---|---|---|
| `AuthShell` | `apps/admin/pages/LoginPage.tsx` | Wider content column (`max-w-[560px]`), soft radial + blur atmosphere, safe-area-aware padding, vertical centering via `min-h-dvh` |
| `BrandMark` | `apps/admin/pages/LoginPage.tsx` | Shared official FixNow wrench mark (`/brand/fixnow-mark.svg`), 64×64, `14px` radius, blue soft shadow, press scale |
| First-run landing | `apps/admin/pages/LoginPage.tsx` | New hero typography + primary CTA + Development / Restore cards |
| Standard login (light polish) | `apps/admin/pages/LoginPage.tsx` | Shared shell + brand mark, `20px` card radius, stronger elevation; small Development Quick Login chip when enabled |

**Unchanged:** bootstrap detection, setup wizard route, forgot-password restore route, passwordless `devAdminLogin`, production gates, Customer/Technician auth.

---

## Visual Improvements

### Hero
- Official FixNow blue rounded mark with soft blue shadow (wrench proportions preserved — mark SVG unchanged).
- Split hierarchy:
  - Eyebrow: **Welcome to FixNow**
  - Title: **Command Center** (`34–40px`, tight tracking)
  - Subtitle: *Configure your administration workspace and manage your marketplace.*
- Centered vertically with generous breathing room.

### Primary action
- **Create First Administrator** — full-width primary button, `54px` min height, `16px` radius (`rounded-2xl`), blue fill, medium blue shadow, arrow icon that nudges on hover, press scale, focus ring.

### Development access (card)
- Replaces the plain secondary button.
- Lightning icon in a soft primary tint tile.
- Title **Development Administrator** + compact **DEVELOPMENT** badge.
- Subtitle: *Continue using the seeded development account.*
- Trailing arrow; hover lift + border tint; loading spinner replaces icon while signing in.
- Intentionally calm — not a warning style. Still server-gated (`devLoginEnabled`).

### Restore Existing Administration (card)
- Shield icon on a neutral tile.
- Title + subtitle: *Sign in to an existing Command Center.*
- Trailing chevron; same elevation / hover lift language as the development card.

### Hierarchy & tokens
- Section gap ≈ `24–40px` (`mt-10` / `space-y-4`).
- Cards: `20px` radius, soft border + light shadow.
- Buttons: `16px` radius.
- No environment banners, CLI blocks, recovery internals, or framework wording.

---

## Screenshots

Captured against the live local stack (`Vite :5173` + API `:4000`) with bootstrap status `{ completed: false, devLoginEnabled: true }`.

### Desktop
Verified centered composition (~560px content column) on soft gradient atmosphere:

- Brand mark → Welcome → Command Center → subtitle  
- Primary blue CTA  
- Development Administrator card  
- Restore Existing Administration card  

Screenshot artifact: `docs/screenshots/admin-command-center-desktop.png`.

### Mobile (≈390×844)
Same single-column stack, thumb-friendly targets (`≥48dp`), cards remain full-width with readable wrapping for the Development badge. Safe-area padding applied via `env(safe-area-inset-*)`.

Screenshot artifact: `docs/screenshots/admin-command-center-mobile.png`.

> Note: Screenshots are visual verification captures from the Cursor browser session; re-capture after any future copy/spacing tweaks before release notes.

---

## Accessibility Improvements

| Area | Detail |
|---|---|
| Touch targets | Primary CTA ≥54px; cards ≥44–48px effective height with generous padding |
| Focus | Visible `focus-visible` rings on mark, CTA, and cards |
| Contrast | Primary blue on white; ink-primary titles; muted subtitles on soft surface |
| Semantics | One `h1` (“Command Center”); Restore remains a link; Development remains a button |
| Loading | Development card shows spinner + “Signing in…” status text; busy disables interaction |
| Brand mark | Accessible name “FixNow”; decorative SVG `alt=""` |
| Motion | Hover lift / press scale are subtle; no flashing or blocking animations |
| Safe areas | Top/bottom padding respects notch / home indicator insets |

---

## Responsive Verification

| Surface | Result |
|---|---|
| Desktop (≥1024) | Centered column, max width 560px, generous whitespace |
| Tablet | Same centered column; no side-by-side competition |
| iPhone Safari / Android Chrome widths | Full-width actions, no clipped titles, badge wraps cleanly |
| Capacitor WebView | Safe-area aware; `min-h-dvh` avoids 100vh mobile URL-bar jumps |
| Production (no `devLoginEnabled`) | Development card omitted; Welcome + Create + Restore only |

---

## Microinteractions

- **Primary CTA:** brightness lift, shadow deepen, arrow translate, active scale `0.985`
- **Cards:** `-translate-y-0.5` lift, border/shadow intensify, active scale `0.99`
- **Brand mark:** shadow deepen + active scale `0.97`
- **Development busy:** icon → spinner; button disabled

---

## Explicitly Not Restored

- Development Environment banner  
- Bootstrap CLI / npm commands  
- Long development explanations  
- Internal setup / recovery implementation details  
- Environment names or framework terminology  

---

## Regression Checklist

- [x] First-run flow still: Welcome → Create First Administrator → (optional) Development Administrator → Restore Existing Administration  
- [x] Development card only when server reports `devLoginEnabled`  
- [x] Create navigates to `/admin/setup`  
- [x] Restore navigates to `/admin/forgot-password`  
- [x] Development still calls `devAdminLogin()` (passwordless, server-gated)  
- [x] Standard login path unchanged when `completed === true`  
- [x] No backend / auth / customer / technician changes  
- [x] Official FixNow mark used (wrench proportions from brand SVG)  
