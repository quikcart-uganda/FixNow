# Admin Header Responsive Audit

**Date:** 2026-07-26
**Scope:** Admin portal top header (`AdminShell`) + shared header primitives used by it.
**Constraint honored:** presentation-layer only — no backend, API, role, or permission changes.

---

## 1. Root cause of the overflow

The old header packed every toolbar control into a single row with the wrong
breakpoints and no shrink protection:

1. **`sm` used where `md`/`lg` was needed.** The full-width search form
   (`max-w-md` ≈ 448px), the Live/Platform chip, the Help button, and the
   Sign-out button all appeared at `sm` (≥640px). Between 640–767px the
   sidebar is still hidden, so the row contained:
   `hamburger + 448px search + chip + bell + help + sign-out + divider + avatar`
   — more than the viewport could hold. Controls were pushed past the right
   edge (clipping) or forced horizontal page scroll.
2. **No shrink/grow contract.** The right toolbar cluster had no `shrink-0`
   and the left cluster's search had no `min-w-0`, so flexbox resolved the
   conflict by letting fixed-size icons render off-screen instead of letting
   the search field compress.
3. **Fixed `h-16` + `pt-safe` conflict.** The header was `h-16` *and*
   `pt-safe`. On devices with a top safe-area inset (notch/status bar), the
   inset padding ate into the fixed 64px height and vertically clipped the
   44px controls.
4. **No horizontal safe-area padding.** `px-4` ignored
   `env(safe-area-inset-left/right)`, so in landscape on notched phones the
   hamburger/avatar could sit under the sensor housing.
5. **No mobile brand.** Below `sm` the header showed only a hamburger and
   icons — no FixNow identity at all.
6. **Live chip was under-sized.** The chip used `min-h-9` (36px), below the
   44px touch-target minimum.

## 2. Changes made

### `apps/admin/components/AdminShell.tsx` (header rewrite)

- **Three explicit breakpoint tiers** (documented inline in the JSX):
  - `<md` (mobile): hamburger · **FixNow / Admin brand** · notification bell · avatar.
    Live badge is hidden; it is reachable from the profile menu ("Platform status").
  - `md–lg` (tablet): sidebar owns branding; compact **Live** chip · search · bell · avatar.
  - `≥lg` (desktop): complete toolbar — search · full **Platform** chip · bell · help · sign-out · divider · avatar.
- **Flex contract:** left cluster is `flex-1 min-w-0` (search is the only
  element allowed to compress); right toolbar is `shrink-0` with every icon
  `shrink-0`, so controls can never be pushed off-screen.
- **`min-h-16` instead of `h-16`** so `pt-safe` (notch inset) grows the bar
  instead of clipping the controls inside it.
- **Horizontal safe-area:** inner row uses
  `pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]`
  (1.5rem at `md+`) — correct landscape rendering on notched iOS/Android.
- **`overflow-x-hidden`** on the header and `min-w-0` on the content column as
  a final guarantee against page-level horizontal scroll.
- Help button now appears at `lg+` (was `sm+`), matching the desktop-only tier.

### `packages/shared/header/HeaderStatusControl.tsx`

- New `density` prop: `full` | `compact` | `responsive`. The admin header uses
  `responsive` — a single mounted control that renders the short "Live" label
  (capped `max-w-[5.5rem]`, truncating) on tablet and the full "Platform"
  label on `lg+`. One instance → one bottom sheet → no duplicated health
  fetches.
- New controlled mode (`open` / `onOpenChange`) + `hideTrigger` +
  `visibleFrom` props so the same status sheet can be opened from the profile
  menu when the chip is hidden on mobile.
- Chip upgraded from `min-h-9` (36px) → `min-h-11` (44px) touch target; the
  status dot is `shrink-0` and the label truncates instead of wrapping.

### `packages/shared/header/HeaderProfileMenu.tsx` + `menuConfig.ts`

- New `onStatus` callback and support for `action: 'status'` menu items.
- Admin profile menu now starts with **"Platform status — realtime connection
  and platform health"**, which opens the same status sheet. This is where the
  Live badge "moves" on mobile, per spec.

### `packages/shared/header/HeaderAdminSearch.tsx`

- Inline search form now renders at `md+` only (was `sm+` — the trigger of the
  640–767px overflow). Below `md`, search remains fully available through the
  bottom sheet (quick targets + keyword form, no longer gated to `sm:hidden`).
- Removed the standalone mobile search icon (mobile tier is intentionally
  hamburger · brand · bell · avatar); form gained `min-w-0` and a 44px-tall
  input.

### `packages/shared/header/PortalHeader.tsx`

- Status chip hiding migrated from `className="hidden sm:inline-flex"` to the
  new `visibleFrom="sm"` prop (same behavior, now component-owned).

## 3. Responsive behavior at each breakpoint

| Breakpoint | Layout |
|---|---|
| **≤767px (mobile, portrait & landscape)** | Hamburger (44px) · FixNow/Admin wordmark (truncates) · bell (44px) · avatar (44px). Live badge lives in the profile menu as "Platform status". Bottom nav + drawer navigation. |
| **768–1023px (tablet)** | Dark sidebar owns branding. Header: search (flexes, `max-w-md`) · compact **Live** chip (dot + short label, max 5.5rem) · bell · avatar. |
| **≥1024px (desktop)** | Complete toolbar: search · full **Platform** chip · bell · help · sign-out · divider · avatar. |

Verified guarantees at every tier: no `document` horizontal scroll, no control
with `rect.right > viewport` or `rect.x < 0`, all interactive controls ≥44×44px,
header grows under safe-area insets instead of clipping.

## 4. Verification (Chrome DevTools emulation)

| Device | Viewport | docOverflowX | Off-screen controls | <44px targets |
|---|---|---|---|---|
| iPhone SE | 375×667 | none | none | none |
| iPhone 15 Pro | 390×852 @3x | none | none | none |
| Galaxy A / Pixel | 412×915 | none | none | none |
| Phone landscape | 667×375 | none | none | none |
| iPad portrait (md boundary) | 768×1024 | none | none | none |
| iPad Air | 820×1180 | none | none | none |
| Desktop | 1440×900 | none | none | none |

Functional checks:
- 375px: profile menu lists "Platform status" first; tapping it opens the
  platform-status sheet (Realtime: Connected, health check, refresh action).
- 768–820px: compact "● Live" chip visible next to search; opens the same sheet.
- 1440px: full toolbar order confirmed — search · Platform · bell · help ·
  sign-out · avatar.
- `tsc --noEmit` and `oxlint` clean on all six changed files.

### Screenshots (after)

- Mobile 375px — hamburger · FixNow/Admin · bell · avatar, zero overflow.
- Tablet 820px — sidebar + search + compact Live chip, balanced spacing.
- Desktop 1440px — complete toolbar with full Platform chip.

(Before-state screenshots were not captured prior to the fix; the pre-fix
overflow is reproducible from the git history: `sm:`-gated search + toolbar at
640–767px.)

## 5. Files changed

| File | Change |
|---|---|
| `apps/admin/components/AdminShell.tsx` | Header rewritten with 3 breakpoint tiers, flex shrink/grow contract, mobile brand, safe-area padding, `min-h-16` |
| `packages/shared/header/HeaderStatusControl.tsx` | `density` / controlled-open / `hideTrigger` / `visibleFrom` props, 44px chip, truncating label |
| `packages/shared/header/HeaderProfileMenu.tsx` | `onStatus` callback, `action: 'status'` handling, description rendering |
| `packages/shared/header/menuConfig.ts` | Admin menu gains "Platform status" entry |
| `packages/shared/header/HeaderAdminSearch.tsx` | Inline form `md+` only, sheet search always available, 44px input |
| `packages/shared/header/PortalHeader.tsx` | Migrated to `visibleFrom="sm"` (behavior unchanged for customer/technician) |
