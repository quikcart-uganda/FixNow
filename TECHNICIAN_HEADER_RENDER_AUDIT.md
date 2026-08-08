# Technician Header Render Audit

## Root cause

The Technician menu trigger rendered its hamburger through the generic
`Icon` component:

```text
<Icon name="menu" />
```

That component emits a Material Symbols font ligature rather than an SVG. The
font is downloaded from Google Fonts in `index.html`. When that remote font is
unavailable, delayed, blocked, offline, or not cached inside a Capacitor
WebView, the trigger retains its circular button styles but has no dependable
graphic to paint. The fallback text ligature can also be clipped by the fixed
touch target.

The circular container and click handler were therefore healthy; the visual
glyph had an external font dependency and no fallback.

## Icon rendering fix

- Replaced the menu-font ligature with a dependency-free inline SVG.
- The SVG has a fixed 24 by 24 view box, three explicit paths, round line caps,
  `currentColor`, and non-scaling strokes.
- Added a dependency-free notification bell and drawer-close glyph for the
  other header-critical controls.
- Shared the same hamburger SVG with the Admin mobile header.
- Kept non-critical content icons on the existing Material Symbols system.

The menu button now has:

- A 44 by 44 pixel minimum target.
- Centered 24 pixel SVG.
- Surface and on-surface design tokens for light/dark contrast.
- Visible border, hover, active, and keyboard focus states.
- `aria-label`, `aria-haspopup`, and `aria-expanded`.
- Native button keyboard behavior.
- `touch-action: manipulation`.
- No clipping or downloadable icon-font dependency.

## Responsive header improvements

The Technician shell now uses the existing shared `PortalHeader` instead of
maintaining a separate header implementation.

The shared layout provides:

- safe-area top, left, and right padding;
- a minimum 64 pixel content row;
- non-shrinking menu, notification, and profile controls;
- a truncating center/identity section;
- compact spacing on phones and larger spacing from the small breakpoint;
- hidden desktop hamburger when the permanent Technician sidebar is visible;
- a compact availability control from the small breakpoint;
- mobile access to the status sheet through the profile menu;
- stable notification and avatar placement;
- no fixed-width title that can push actions off-screen.

Technician-specific content is preserved:

- FixNow branding;
- current Technician level on mobile/tablet;
- Technician name on desktop;
- remaining applications and Trust score on desktop;
- availability status;
- notifications;
- profile photo/menu.

## Shared header improvements

- `PortalHeader` now owns responsive safe-area spacing for all variants.
- It supports successful availability-change callbacks.
- Its status sheet is controlled centrally and can be opened from the profile
  menu when the visible status chip is hidden on narrow screens.
- `HeaderMenuButton` is the reusable drawer trigger.
- `HamburgerIcon` and `HeaderGlyph` are reusable, font-independent
  header-critical icons.
- Admin uses the same hamburger and close glyphs.
- Customer, Technician, and Admin retain role-specific content while following
  the same principles: 44 pixel targets, token-based contrast, safe areas,
  non-shrinking actions, focus visibility, and responsive truncation.

The Customer shell does not require a hamburger because its primary navigation
is the mobile bottom bar and tablet rail. It was not given a redundant drawer.

## Files modified

- `apps/technician/components/layout/AppShell.tsx`
- `apps/admin/components/AdminShell.tsx`
- `packages/shared/header/HamburgerIcon.tsx`
- `packages/shared/header/HeaderGlyph.tsx`
- `packages/shared/header/HeaderMenuButton.tsx`
- `packages/shared/header/HeaderNotificationsButton.tsx`
- `packages/shared/header/PortalHeader.tsx`
- `packages/shared/header/types.ts`
- `packages/shared/header/index.ts`
- `packages/shared/index.ts`
- `packages/shared/header/header.icons.test.tsx`
- `TECHNICIAN_HEADER_RENDER_AUDIT.md`

## Regression results

Completed:

- TypeScript project type-check passed.
- Lint passed with no errors; existing unrelated warnings remain.
- Component tests passed.
- Added tests verify that the menu and notification controls render actual SVG
  paths without Material Symbols.
- Added a trigger test verifying the menu button includes its accessible name,
  dialog state, 44 pixel minimum classes, and SVG.
- Unauthenticated browser route check confirmed protected Technician routes
  redirect correctly to login without console-visible render failures.

Responsive implementation review:

- Android Chrome and Samsung Internet: standard inline SVG and CSS safe-area
  fallbacks; no font dependency.
- Capacitor Android/iOS: SVG ships inside the application bundle and works
  offline.
- iPhone Safari: `env(safe-area-inset-*)` spacing protects notch and status-bar
  areas.
- Tablet/Desktop: hamburger hides at `lg`, where the permanent sidebar takes
  over.
- Foldables and narrow phones: flexible/truncating title cluster and
  non-shrinking action controls prevent overlap.
- Retina/high-density displays: vector paths remain crisp at all device pixel
  ratios.

Physical-device interaction certification still requires authenticated
Technician test credentials and the project device matrix. The implementation
itself no longer relies on platform-specific icon loading.
