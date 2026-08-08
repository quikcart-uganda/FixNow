# FIXNOW CURRENT UI DESIGN AUDIT

**Date:** 2026-07-29  
**Scope:** Customer Web, Technician Web, Admin Web, Customer Android (Capacitor WebView), Technician Android (Capacitor WebView), Shared Components  
**Method:** Reverse-engineered from the live implementation (`src/`, `apps/`, `packages/`). No code was modified.  
**Purpose:** Master visual-language reference so QuikCart can adopt the same professional UI system while correcting inconsistencies deliberately.

---

## 1. Executive Summary

FixNow is a single React + Vite SPA with three path portals (`/customer`, `/technician`, `/admin`) sharing one design foundation in `src/index.css` (Tailwind CSS v4 `@theme` tokens) and shared primitives in `packages/ui` and `packages/shared`.

### Visual identity (as implemented)

| Pillar | Current standard |
|---|---|
| Typeface | **Inter** (400–800) + **Material Symbols Outlined** for icons |
| Brand blues | `#002a74` → `#004ac6` → `#2563eb` (+ `#ffcc00` accent) |
| Theme model | Three scoped palettes: default, `.customer-theme` (indigo “Elite”), `.admin-theme` (Command Center) |
| Card radius | Dominant **16px** (`rounded-2xl`) on shared cards; admin often **12px** (`rounded-xl`) |
| Button radius | Dominant **8px** (`rounded-lg`) |
| Touch target | **44px** minimum (`.tap-target`) |
| Elevation | Soft blue-tinted card shadow + stronger float shadow for overlays |
| Motion | Soft scale on press (`0.98`), fade-up entrances, sheet/drawer slides; respects `prefers-reduced-motion` |
| Native | Same UI in Capacitor WebView; safe-area and keyboard insets applied |

### Architectural reality for QuikCart

- There is **one** frontend design system, not three separate product UIs.
- Android Customer/Technician reuse the web SPA via Capacitor (`base: './'`). Admin is web-only.
- Shared chrome (`PortalHeader`, Dialog, BottomSheet, Button, Card, Field, Badge, Icon, ProfileAvatar) is the strongest consistency layer.
- Portal shells diverge (customer icon rail vs technician 256px sidebar vs admin 260px dark sidebar; three different bottom-nav treatments).

### Highest-value baseline for QuikCart

Adopt the **token layer** (`@theme` colours, typography utilities, spacing, shadows) and **shared primitives** (`Button`, `Card`, `Field`, `Dialog`, `BottomSheet`, `PortalHeader` patterns). Treat portal shell differences and ad-hoc sizes as known debt, not accidental “features.”

---

## 2. Typography Catalogue

### 2.1 Font families

| Role | Family | Fallbacks | Source |
|---|---|---|---|
| UI text | Inter | `ui-sans-serif, system-ui, sans-serif` | Google Fonts CDN + `--font-sans` |
| Icons | Material Symbols Outlined | `FixNow Icon Fallback`, sans-serif | `material-symbols` package + injected `@font-face` |
| Mono | — | Not used as a product font | — |

**Loaded Inter weights:** 400, 500, 600, 700, 800.

### 2.2 Formal type scale (`src/index.css` utilities)

| Token | Size | Line-height | Tracking | Weight | Typical use |
|---|---|---|---|---|---|
| `text-display-lg` | 48px (3rem) | 56px | -0.04em | 700 | Desktop hero |
| `text-display-mobile` | 32px (2rem) | 40px | -0.02em | 700 | Mobile hero / brand |
| `text-display-lg-mobile` | 28px (1.75rem) | 1.15 | -0.03em | 700 | Auth brand |
| `text-headline-lg` | 32px (2rem) | 1.2 | -0.02em | 600 | Large section heads |
| `text-headline-lg-mobile` | 28px (1.75rem) | 1.2 | -0.02em | 600 | Mobile section heads |
| `text-headline` | 24px (1.5rem) | 32px | -0.01em | 600 | Page titles / KPI values |
| `text-title-md` | 20px (1.25rem) | 1.4 | -0.01em | 600 | Dialog / sheet titles |
| `text-title` | 18px (1.125rem) | 24px | — | 600 | Card / section titles |
| `text-body-lg` | 16px (1rem) | 1.6 | — | 400 | Comfortable body / button md+lg |
| `text-body` | 16px (1rem) | 24px | — | 400 | Standard body / inputs |
| `text-body-sm` | 14px (0.875rem) | 1.5 | — | 400 | Secondary copy / errors |
| `text-label` | 14px (0.875rem) | 20px | — | 500 | Form labels / nav labels |
| `text-label-caps` | 12px (0.75rem) | 1 | 0.05em | 600 | Bottom-nav labels / overlines |
| `text-mono-label` | 13px (0.8125rem) | 1 | 0.02em | 500 | Divider labels (“or”) |
| `text-caps` | 12px (0.75rem) | 16px | 0.05em | 700 + uppercase | Badges / meta |
| `text-trust` | 32px (2rem) | 32px | -0.02em | 700 + tabular-nums | Trust / large metrics |

### 2.3 Element mapping (standard vs exceptions)

| Element | Standard | Exceptions / inconsistencies |
|---|---|---|
| Page title | `text-headline` (24/600) | Raw `text-2xl font-bold`; admin often `text-xl font-semibold` |
| Card title | `text-title` (18/600) | Some `text-sm font-semibold` / `text-title-md` |
| Section title | `text-title` / `text-title-md` | Mixed |
| Body | `text-body` / `text-body-sm` | Heavy use of raw `text-sm` |
| Form label | `text-label` | Auth uses `text-label-caps uppercase` |
| Button text | Shared: `text-sm` (sm) / `text-body-lg` (md/lg) | Auth submit uses `text-title-md`; many inline CTAs use `text-sm font-bold` |
| Nav / drawer text | Drawer: `text-sm font-semibold` | Tech sidebar: `text-title`; Admin sidebar: `text-[13px] font-medium` |
| Table header | `text-xs font-semibold uppercase tracking-[0.05em]` | Admin table: `tracking-[0.06em]` |
| Table body | `text-sm` | — |
| Chip / badge | `text-caps` or `text-[11px] uppercase` | SubscriptionBadge: 10–12px variants |
| Notification badge | `text-[9px] font-bold` | — |
| Profile name | `text-sm font-bold` (drawer) / header brand `text-base font-bold` | — |
| Large numbers / stats | `text-headline` / `text-trust` / admin `text-5xl` | Mixed |
| Boot wordmark | `clamp(42px, 11vw, 60px)` weight 800 | Outside product scale |

### 2.4 Font weights — where used

| Weight | Usage |
|---|---|
| **400** | Body text (`text-body*`), default paragraph |
| **500** | Labels (`text-label`), secondary meta, some admin controls |
| **600** | Titles, section heads, most buttons (`font-semibold`), sheet titles |
| **700** | Brand, badges (`text-caps`), many CTAs (`font-bold`), KPI emphasis |
| **800** | Splash / boot wordmark only (`font-extrabold` / CSS 800) |

### 2.5 Known typography debt

1. `text-title-sm` is referenced in places but **not defined** in `index.css`.
2. ~40 ad-hoc sizes (`text-[9px]`–`text-[42px]`, rem variants) bypass the scale.
3. Admin pages lean on raw Tailwind (`text-xs`/`text-sm`) instead of tokens.
4. Same visual role often mixes weight 600 vs 700.

---

## 3. Spacing Catalogue

### 3.1 Named spacing tokens

| Token | Value |
|---|---|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |

### 3.2 De facto Tailwind spacing scale (by frequency)

**Workhorses:** `2` (8px), `3` (12px), `4` (16px).

| Category | Dominant values | Notes |
|---|---|---|
| Padding | `p-2`, `p-3`, `p-4`, `p-5`, `p-6`; `px-3`/`px-4`; `py-2`/`py-3` | Cards often `p-4`/`p-5`; admin KPI `p-6` |
| Margin | `mt-1`–`mt-4` dominate vertical rhythm | Large section gaps `mb-8` / `mt-12` on landing |
| Gap | `gap-2`, `gap-3`, then `gap-4` | Grids commonly `gap-3`/`gap-4` |
| Stack | `space-y-2`, `space-y-3`, `space-y-4`, `space-y-6` | Forms often `space-y-5` |
| Page gutters | Mobile 16px (`px-4` / `px-gutter-mobile`); desktop 24px at `md:` | Technician `px-4 py-6`; Admin `p-4 md:p-8` |
| Safe areas | `pt-safe`, `pb-safe`, `px-safe`, env(safe-area-inset-*) | Native + mobile chrome |

### 3.3 Vertical rhythm (standard)

| Context | Standard rhythm |
|---|---|
| Form fields | `space-y-2` label→control; form groups `space-y-5` |
| Card internals | `gap-2`/`gap-3`; footer actions `pt-3`/`pt-4` + top border |
| Page sections | `space-y-6` / `mb-8`–`mb-12` |
| Drawer groups | `space-y-4` between sections; `space-y-0.5` between items |

### 3.4 Spacing inconsistencies

- Named `--space-*` tokens exist but most UI uses Tailwind numeric spacing directly.
- Card padding mixes `p-3` / `p-4` / `p-5` / `p-6` for similar card types.
- Bottom nav item min-widths differ: Customer `52px`, Technician `72px`.
- Main content padding differs by portal (see Layout).

---

## 4. Component Catalogue

### 4.1 Shared primitives (`packages/ui`)

| Component | File | Role |
|---|---|---|
| `Button` | `Button.tsx` | Primary design-system button |
| `Card` / `StatCard` | `Card.tsx` | Surface card + metric card |
| `Input` / `TextArea` / `Select` / `Field` | `Field.tsx` | Form controls |
| `Badge` / `Pill` | `Badge.tsx` | Status + filter chips |
| `SubscriptionBadge` | `SubscriptionBadge.tsx` | Plan / boost badges |
| `BottomSheet` | `BottomSheet.tsx` | Mobile action sheet |
| `ProfileAvatar` | `ProfileAvatar.tsx` | Avatar + online/verified |
| `Icon` | `Icon.tsx` | Material Symbols wrapper |
| `Skeleton` | `Skeleton.tsx` | Loading placeholders |
| `LazyImage` | `LazyImage.tsx` | Image pipeline UI |

### 4.2 Shared chrome (`packages/shared`)

| Component | Role |
|---|---|
| `PortalHeader` | Sticky top bar (customer / technician / admin variants) |
| `HeaderMenuButton` | Hamburger + left drawer |
| `HeaderNotificationsButton` | Bell + unread badge |
| `HeaderProfileMenu` | Avatar → account bottom sheet |
| `HeaderStatusControl` | Connection / availability chip |
| `Dialog` | Modal + side drawer |
| `Auth*` fields / Google button | Auth form language |
| Tracking / location suite | Map card, ETA, permission sheets |

### 4.3 Portal-local systems

| Portal | Local UI kit |
|---|---|
| Admin | `apps/admin/components/ui.tsx` — second Button, Surface, KpiCard, StatTile, StatusBadge, LevelBadge, SearchField, etc. |
| Customer | Shell + offer cards + marketing rails |
| Technician | Shell + JobCard + marketing OfferCard + mobile-money cards |

---

## 5. Navigation System

### 5.1 Portal comparison

| Concern | Customer | Technician | Admin |
|---|---|---|---|
| Theme class | `.customer-theme` | Default tokens | `.admin-theme` |
| Desktop nav | Icon rail `w-20` from `md:` | Sidebar `w-64` from `lg:` | Dark sidebar `w-[260px]` from `md:` |
| Mobile nav | Fixed bottom `h-16` (`md:hidden`) | Fixed bottom (`lg:hidden`) | Sticky bottom (`md:hidden`) |
| Header | Often page-owned + shared pieces | `PortalHeader` variant=technician | Custom admin header + search |
| Content offset | `md:pl-20` | `lg:pl-64` | `md:ml-[260px]` |
| Max content width | Page-specific | `max-w-7xl` | `max-w-[1440px]` |

### 5.2 Shared header action grid

Right cluster order: **[Status] [Notifications] [Profile]**  
Guest mode replaces private actions with Sign In / Create Account + Guest avatar.

### 5.3 AI FAB (cross-portal)

- Size: `h-14 w-14`
- Position utility: `.fixnow-ai-fab` (clears bottom nav + safe area)
- Content pad: `.fixnow-ai-fab-pad`
- Overlay z-index higher than chrome (`z-[65]` panel family)

---

## 6. Card Catalogue

### 6.1 Standards

| Property | Shared standard | Admin common | Landing / special |
|---|---|---|---|
| Radius | `rounded-2xl` (16px) | `rounded-xl` (12px) | `rounded-3xl` (24px) role cards |
| Border | `border-border-subtle` | `border-border` | same |
| Background | `bg-surface` / `bg-canvas-white` | `bg-canvas` | `bg-surface` |
| Shadow | none or `shadow-card` on hover | custom 1px slate shadow | `shadow-card` → `shadow-float` |
| Padding | `p-4`–`p-5` | `p-4`–`p-6` | `p-6` |

### 6.2 Card types (measured)

| Card | Radius | Padding | Shadow | Notes |
|---|---|---|---|---|
| Base `Card` | 16 | child-owned | optional hover `shadow-card` | Shared |
| `StatCard` | 16 | `p-5` | hover card | Shared metrics |
| Admin `Surface` | 12 | child-owned | `0 1px 2px rgba(15,23,42,0.05)` | Admin kit |
| `KpiCard` | 12 | `p-6` | same + hover | `min-h-[140px]` |
| `StatTile` | 12 | `p-4` | none | `min-h-[84px]`; active ring |
| `TechnicianCard` (admin) | 16 | `p-4 sm:p-5` | multi-layer soft | Avatar 64–72 |
| `AdminCard` | 12 | `p-4` | none | — |
| MetricCards item | 16 | `p-4` | none | Analytics grid |
| `CustomerOfferCard` | 12 | `p-4` / compact `p-3` | `shadow-sm` | Compact width 220–240 |
| Tech `JobCard` | 16 | `p-5` | hover card | Uses shared Card |
| Tech marketing `OfferCard` | 16 | `p-4` | none | 4px coloured top border |
| Mobile money provider | 16 | `p-4` | brand glow when selected | MTN/Airtel colours |
| Location settings | 16 | `p-4` | none | Row layout |
| Platform role card | 24 | `p-6` | card → float | Hover lift `-translate-y-1` |

### 6.3 Internal card patterns

- Title: `text-title` / `text-sm font-semibold`
- Meta: `text-body-sm` / `text-xs` muted
- Action row: top border + `pt-3`/`pt-4`, buttons right-aligned or full-width primary
- Images: rounded corners matching card or `rounded-xl` thumbs

---

## 7. Form Catalogue

### 7.1 Control standards

| Control | Height | Radius | Border | Background | Focus | Text |
|---|---|---|---|---|---|---|
| Shared `Input`/`Select` | `min-h-11` (44) | 8 (`rounded-lg`) | `border-border-subtle` | `bg-surface` | border-2 primary, ring-0 | `text-base` |
| Shared `TextArea` | `min-h-28` | 8 | same | same | same | same |
| Auth fields | `h-12` (48) | 8 | same | `bg-surface-container-lowest` | border primary + `ring-4 ring-primary/10` | `text-body-lg` |
| Admin Search/Select | `min-h-11` | 8 | `border-border` | `bg-canvas` | `ring-2 ring-primary/25` | `text-sm` |
| Customer search bar | `h-12` | **full pill** | subtle | `bg-surface-container-low` | `ring-2 ring-primary/20` | `text-body-lg` |

### 7.2 Special fields

| Field | Spec |
|---|---|
| OTP | Auth field + `tracking-[0.35em]` |
| Password | Auth field + right toggle `h-9`, icon ~20px |
| Checkbox (Remember me) | 18×18, `rounded`, primary accent |
| Admin toggle | Track `w-10 h-5`; knob `w-4 h-4`; on = primary |

### 7.3 Labels & validation

| Element | Standard |
|---|---|
| Label | `text-label text-on-surface-variant` (auth: caps variant) |
| Required | `text-error` asterisk |
| Hint | `text-caps` or `text-body-sm` muted |
| Error | `text-body-sm text-error`, `role="alert"` |
| Field stack | `space-y-2` |

### 7.4 Form inconsistencies (document only)

- Four focus-ring languages (ring-0 / ring-2 / ring-4 / border-only).
- Two standard heights (44 vs 48).
- Search is the only common pill-shaped input.

---

## 8. Sidebar Specification

### 8.1 Hamburger drawer (shared `HeaderMenuButton`)

| Property | Value |
|---|---|
| Trigger | Circle `h-11 w-11`, border, `shadow-sm` |
| Panel width | `max-w-[320px]`, `rounded-none` |
| Placement | Start (left) via `Dialog` |
| Header | Safe-area top; title `text-[11px] font-bold uppercase tracking-widest` |
| Profile block | Avatar `h-11 w-11`; name `text-sm font-bold`; status `text-xs` |
| Section label | `text-[10px] font-bold uppercase tracking-[0.14em]` |
| Item | `rounded-xl px-3 py-3 text-sm font-semibold`, icon+gap-3 |
| Active | `bg-secondary-container text-on-secondary-container` |
| Hover | `hover:bg-surface-container-low` |
| Logout | `text-error`, `hover:bg-error/5` |
| Footer | Logout lives in nav list (not a fixed footer chrome) |

Visibility of hamburger: Customer/Admin `md:hidden`; Technician `lg:hidden`.

### 8.2 Desktop sidebars

#### Customer icon rail

| Property | Value |
|---|---|
| Width | 80px (`w-20`) |
| From | `md:` |
| Item | `rounded-xl p-3`, muted → `hover:text-primary` |
| Icons | Material default (~1.25em) |

#### Technician sidebar

| Property | Value |
|---|---|
| Width | 256px (`w-64`) |
| From | `lg:` |
| Brand | `text-display-mobile text-primary` + `text-label` subtitle |
| Item | `rounded-lg px-3 py-2.5 text-title` |
| Active | `translate-x-1 bg-secondary-container …` |
| Footer card | FreeJobsMeter + Upgrade link in `rounded-2xl` bordered card |

#### Admin sidebar

| Property | Value |
|---|---|
| Width | 260px |
| From | `md:` |
| Surface | Dark `bg-inverse-surface` |
| Brand | ~22px black/heavy primary-fixed |
| Section labels | `text-xs uppercase tracking-[0.08em]` |
| Item | `text-[13px] font-medium`, `py-2.5`, icon `!text-[20px]` |
| Active | primary text + `border-l-4 border-primary` + alt surface |
| Mobile drawer alt | `max-w-[280px]` light canvas (`md:hidden`) |

### 8.3 Consistency verdict

Shared drawer language is strong. Desktop sidebars are **three different products** (icon rail vs light list vs dark command nav). QuikCart should pick one desktop pattern and map roles onto it.

---

## 9. Top Navigation Specification

### 9.1 `PortalHeader` variants

| Property | Customer (default) | Technician | Admin (shared variant / shell) |
|---|---|---|---|
| Position | sticky top | sticky top | sticky top |
| Min height | 56 (`min-h-14`) | 64 (`min-h-16`) | 64 (`min-h-16`) |
| Z-index | 40 | 30 | 40 |
| Background | `canvas-white/95` | `surface/95` | `surface/95` (+ admin shell `/80`) |
| Blur | `backdrop-blur` | `backdrop-blur` | `backdrop-blur-md` |
| Border | `border-border-subtle` | same | `outline-variant` (stricter) |
| Max width | full | `max-w-7xl` | `max-w-[1440px]` |
| Safe area | `pt-safe` | `pt-safe` | `pt-safe` |

### 9.2 Header elements

| Element | Spec |
|---|---|
| Brand | `text-base font-bold text-primary sm:text-lg` |
| Subtitle | `text-[11px] font-medium uppercase tracking-wide` muted |
| Hamburger | 44×44 circle |
| Notifications | 44×44 circle; badge `h-4 min-w-4` `text-[9px]` error |
| Profile | ~40–44 circle; guest shows “Guest” glyph |
| Status chip | Responsive density; connection colour dots 8px |
| Admin extras | Search field, help, logout icon (lg+), vertical divider |

### 9.3 Account sheet (profile menu)

- Opens `BottomSheet`
- Rows: icon tile `h-10 w-10 rounded-xl` + `text-sm font-semibold` + chevron
- Guest copy: “Browsing as Guest” / auth CTAs in menu config

---

## 10. Bottom Navigation Specification

### 10.1 Customer

| Property | Value |
|---|---|
| Height | 64px (`h-16`) + `pb-safe` |
| Position | `fixed` bottom, `z-50` |
| Background | `bg-canvas-white`, `shadow-sm`, top border |
| Breakpoint | hidden from `md:` |
| Tabs | Home, Search, Post, Jobs, Chat |
| Item | `min-h-12 min-w-[52px] rounded-xl` |
| Label | `text-label-caps` |
| Active | `font-semibold text-primary` + icon FILL=1 |
| Inactive | `text-on-surface-variant` |
| Press | `active:scale-95` |

### 10.2 Technician

| Property | Value |
|---|---|
| Height | content + `pt-2` + `pb-safe` (not fixed h-16) |
| Position | `fixed`, `z-40`, `shadow-float` |
| Breakpoint | hidden from `lg:` |
| Tabs | Home, Jobs, Inbox, Profile |
| Item | `min-w-[72px] rounded-xl px-3 py-2 text-label` |
| Active | `scale-90 bg-trust-blue-subtle text-primary` + filled icon |
| Inactive | muted |

### 10.3 Admin

| Property | Value |
|---|---|
| Position | `sticky` bottom, `z-40` |
| Background | `bg-canvas/90 backdrop-blur-md` |
| Breakpoint | hidden from `md:` |
| Icon | `!text-[22px]` |
| Label | `text-[10px] font-medium` |
| Active | `text-primary` |
| Inactive | `text-ink-muted` |

### 10.4 Consistency findings

Three different active treatments (fill+weight vs scale+tint chip vs colour-only). Heights and shadows differ. QuikCart should standardize on one mobile tab pattern.

---

## 11. Responsive Behaviour

### 11.1 Breakpoints in practice

| Breakpoint | Typical FixNow use |
|---|---|
| `sm:` (~640) | Gap/text tweaks; guest header CTAs; AI overlay padding |
| `md:` (~768) | Customer rail + hide customer bottom nav; Admin sidebar + hide admin bottom nav; AI FAB position |
| `lg:` (~1024) | Technician sidebar + hide tech bottom nav; admin full toolbar |
| Custom | Native foldable clamp `#root` max 900px between 900–1400 coarse pointer |
| Landscape short | Native reduces `pb-safe` when `max-height: 500px` |

### 11.2 Layout adaptation

| Surface | Mobile | Tablet / Desktop |
|---|---|---|
| Customer | Bottom tabs + full-width pages | 80px icon rail |
| Technician | Bottom tabs + hamburger | 256px sidebar |
| Admin | Bottom tabs + drawer | 260px dark sidebar + search header |
| Grids | 1 col | `sm:2`, `md:2–3`, `lg:3+`, analytics up to `xl:6` |
| Dialogs | Center card or bottom sheet | Side drawers expand (`sm:max-w-md` → `md:max-w-lg`) |
| Marketing / offers | Compact cards, sticky purchase bars | Multi-column rails |

### 11.3 Android note

Customer and Technician Android are the same responsive web layouts inside Capacitor. There is no separate native widget design system. Admin is blocked on native (`AdminPortalGate`).

---

## 12. Design Tokens

### 12.1 Colour system (default `@theme`)

**Primary**

| Token | Hex |
|---|---|
| primary | `#004ac6` |
| primary-container | `#2563eb` |
| on-primary | `#ffffff` |
| primary-fixed | `#dbe1ff` |
| primary-fixed-dim | `#b4c5ff` |
| brand navy (gradients) | `#002a74` |

**Secondary / tertiary / status**

| Token | Hex |
|---|---|
| secondary | `#565e74` |
| secondary-container | `#dae2fd` |
| tertiary | `#006242` |
| error | `#ef4444` |
| warning | `#f59e0b` |
| success-green | `#1aae39` |
| trust-high / mid / low | `#00c853` / `#f59e0b` / `#ef4444` |
| mtn-yellow | `#ffcc00` |
| airtel-red token | `#ff0000` (component also uses `#E60000`) |

**Surfaces / ink / borders**

| Token | Hex |
|---|---|
| background | `#f7f9fb` |
| surface | `#ffffff` |
| surface-container-low | `#f2f4f6` |
| on-surface | `#191c1e` |
| on-surface-variant | `#434655` |
| canvas-white | `#ffffff` |
| border-subtle / border | `#e2e8f0` |
| border-strong | `#cbd5e1` |
| outline / outline-variant | `#737686` / `#c3c6d7` |
| ink-primary / secondary / muted | `#0f172a` / `#475569` / `#64748b` |

### 12.2 Theme overrides

| Theme | Primary | Character |
|---|---|---|
| `.customer-theme` | `#3d27bc` | Indigo “Elite”, warmer neutrals, orange tertiary |
| `.admin-theme` | `#003ec7` | Command Center; green secondary; tabular nums |

**No dark mode** implementation (`dark:` / `prefers-color-scheme: dark` absent).

### 12.3 Elevation / shadow tokens

| Token | Value | Use |
|---|---|---|
| `shadow-card` | soft blue-tinted dual layer | Cards / hover |
| `shadow-float` | deep neutral 20/40 | Sheets, tech bottom nav, overlays |
| `shadow-glow` | blue glow | Brand mark / emphasis |
| Tailwind `shadow-sm`–`2xl` | also used | Buttons, dialogs |

### 12.4 Radius standards (recommended reading of current usage)

| Element | Dominant radius |
|---|---|
| Buttons | 8px (`rounded-lg`) |
| Inputs | 8px |
| Shared cards | 16px |
| Admin surfaces | 12px |
| Modals | 16px |
| Bottom sheets | top 24px (`rounded-t-3xl`) |
| Avatars / pills / FABs | full |

### 12.5 Motion / opacity tokens (behavioral)

| Behavior | Spec |
|---|---|
| Button press | `active:scale-[0.98]` (~120–150ms feel) |
| Press utility | `.press-effect` scale 0.97 / 120ms |
| Page enter | `animate-fade-up` (~550ms); native route `fixnowRouteIn` 220ms |
| Sheet | fade 180ms + slide-up 260ms |
| Drawer | translateX 220ms cubic |
| Skeleton | shimmer 1.4s |
| Disabled | often `opacity-50`–`70` |
| Overlays | `bg-black/40` or `bg-ink-primary/40` |

### 12.6 Borders

- Default hairline: `border` + `border-border-subtle` / `border-border`
- Emphasis: `border-2` (selected money cards, focus)
- Dividers: `divide-y divide-border(-subtle)` or `border-t … pt-*`

---

## 13. Consistency Findings

### 13.1 Duplicate / parallel systems

1. **Two Button components** — `packages/ui/Button` vs `apps/admin/components/ui.Button` (different sizes/colours).
2. **Two badge languages** — shared `Badge` (4px radius) vs admin `StatusBadge`/`LevelBadge` (pills).
3. **Three theme primaries** — default blue, customer indigo, admin deep blue.
4. **Three bottom-nav active styles**.
5. **Three desktop nav architectures**.

### 13.2 Conflicting measurements

| Topic | Conflict |
|---|---|
| Card radius | 12 / 16 / 24 |
| Input height | 44 vs 48 |
| Input focus | ring-0 / ring-2 / ring-4 |
| Header height | 56 vs 64 |
| Sidebar width | 80 / 256 / 260 / drawer 280–320 |
| Button height | 40 / 44 / 48 / 56 |
| Icon sizes | 9–48px ad hoc |
| Type scale | tokens vs raw Tailwind vs arbitrary px |

### 13.3 Pages / areas less aligned to shared patterns

- Admin Command Center (local kit + ink-* tokens)
- AI assistant surfaces (many `text-[11px]` / rem sizes)
- Marketing / sponsor heroes (display sizes + one-off radii)
- Mobile money brand cards (literal brand colours/shadows)
- Auth screens (taller fields, stronger focus rings)

### 13.4 What is already consistent enough to copy

- Inter + Material Symbols
- Primary action colour language (tokenized)
- Shared Button/Card/Field/Dialog/BottomSheet primitives
- 44px touch targets + safe-area utilities
- PortalHeader action ordering
- Reduced-motion safeguards

---

## 14. UI Screens Inventory

### 14.1 Platform shell

| Route | Screen |
|---|---|
| `/` | Platform landing (role cards) |
| `/select-role` | Role select |
| `/customer/*` | Customer portal |
| `/technician/*` | Technician portal |
| `/admin/*` | Admin portal (web only on native) |

### 14.2 Customer (~25 routes)

Splash, Onboarding, Login, Register, Forgot Password, Home, Categories, Search, Offers (+ saved/detail), Technician Profile, Post Job, My Jobs, Applications, Tracking, Messages/Chat, Notifications, Profile Settings, Payments (+ pay/success/receipt), Help, Content/Legal docs, Delete Account.

**Chrome:** `CustomerShell` — bottom tabs + md icon rail + AI FAB (`allowGuest`).

### 14.3 Technician (~40+ routes)

Auth/onboarding, Dashboard (+ professional/business variants), Jobs feed/details, Active/Assigned/Complete, Portfolio, Reviews, Earnings, Reputation, Achievements, Community, Referrals, Marketing suite, Boosts, Upgrade/Plans/Subscription/Billing, Profile (+ setup), Settings, Availability, Service Areas, Services, Messages, Notifications, Locked, Guarantee, Help, Delete Account.

**Chrome:** `AppShell` — lg sidebar + mobile tabs + PortalHeader + AI FAB.

### 14.4 Admin (~45+ routes)

Login/Setup/Dev/Invite/Forgot Password, Dashboard, Admins, Technicians, Customers, Jobs, Tracking, Verification, Portal moderation, Free Jobs, Locks, Categories, Reports, Notifications, Content, Audit, Providers, Realtime, Development controls/access, Sandbox, Subscriptions, Boosts, Trust, Reviews, Payments/Escrow, Messages, Marketing suite (offers queues, banners, campaigns, ads, blocks, pricing, categories, analytics).

**Chrome:** `AdminShell` — dark sidebar + search header + mobile sticky tabs + AI FAB.

### 14.5 Shared experiential screens / modules

- Auth Google continue button
- Guest browsing mode (customer)
- Live tracking map + ETA panel
- Location permission/education sheets
- AI assistant overlay / side panel
- Splash / boot failure / offline banners

### 14.6 Profile / status / map / loading (component inventory)

| Area | Spec summary |
|---|---|
| Avatar sizes | 40–44 header; 44 drawer; 64–72 cards; 80 picker default; cover full-bleed |
| Verified badge | 16px primary circle, 10px icon |
| Online dot | 10px success green + white ring |
| Subscription badge | sm/md/lg; dynamic colour; boost purple `#7C3AED` |
| Map card | `h-64`, `rounded-2xl`; route `#2563eb` weight 4 |
| Skeleton | `.skeleton` shimmer; circle option; `SkeletonText` lines `h-3` |
| Spinners | 28–32px ring on brand gradient for route fallbacks |

---

## 15. Recommendations for QuikCart Baseline

### 15.1 Adopt as-is (source of truth)

1. **Token layer** from `src/index.css` `@theme` (colours, shadows, font, spacing names).
2. **Typography utilities** (`text-headline`, `text-title`, `text-body*`, `text-label*`, `text-caps`).
3. **Shared primitives:** Button, Card, Field, Badge/Pill, Dialog, BottomSheet, Icon, ProfileAvatar, Skeleton.
4. **Interaction rules:** 44px targets, `active:scale-[0.98]`, focus-visible primary ring/outline, reduced-motion.
5. **Header action order:** Status → Notifications → Profile.
6. **Overlay rules:** portaled dialogs/sheets at `z-[80]`; dim overlay ~40% black/ink.

### 15.2 Choose deliberately (do not accidentally inherit all three)

| Decision | Options present in FixNow | Suggested QuikCart pick |
|---|---|---|
| Product primary | Blue / Indigo / Admin blue | One primary; optional role accents |
| Desktop nav | Rail / light sidebar / dark sidebar | One pattern |
| Mobile tabs | Customer vs Technician vs Admin treatments | Customer-like fill+label OR tech chip — not both |
| Card radius | 12 vs 16 | **16px** shared; 12 only for dense admin tables if needed |
| Input height | 44 vs 48 | **44** default; 48 for auth if desired as exception |
| Button kit | Shared vs Admin | **Shared Button** only |

### 15.3 Clean up before copying (known debt)

1. Remove / replace undefined `text-title-sm`.
2. Collapse ad-hoc `text-[10px]`/`[11px]` into tokens (e.g. `text-micro`, `text-meta`).
3. Unify focus rings to one recipe.
4. Unify badge radius language (pill vs 4px).
5. Avoid a second portal-local Button/Surface kit unless QuikCart truly needs an “ops console” mode.

### 15.4 Mapping FixNow → QuikCart domains

| FixNow | QuikCart analogue |
|---|---|
| Customer portal | Shopper app |
| Technician portal | Merchant / rider / partner app |
| Admin portal | Ops console |
| Job cards | Order cards |
| Offer cards | Promo / product cards |
| Tracking map | Delivery tracking |
| Subscription badges | Plan / membership badges |
| Trust scores | Ratings / reliability metrics |

### 15.5 Documentation usage rule

When redesigning QuikCart:

- Prefer values marked **Standard** in this audit.
- Treat **Exceptions** as intentional only if product requires them.
- Treat **Inconsistencies** as defects to resolve in QuikCart, not features to clone.

---

## Appendix A — Key source files

| Area | Path |
|---|---|
| Tokens + type + motion | `src/index.css` |
| Boot / fonts | `index.html`, `src/main.tsx` |
| Buttons / cards / fields | `packages/ui/Button.tsx`, `Card.tsx`, `Field.tsx`, `Badge.tsx`, `BottomSheet.tsx` |
| Header / drawer | `packages/shared/header/*` |
| Dialog | `packages/shared/a11y/Dialog.tsx` |
| Customer shell | `apps/customer/components/CustomerShell.tsx` |
| Technician shell | `apps/technician/components/layout/AppShell.tsx` |
| Admin shell + kit | `apps/admin/components/AdminShell.tsx`, `apps/admin/components/ui.tsx` |
| Landing | `src/PlatformLanding.tsx` |

## Appendix B — Audit method notes

- Values were measured from implementation classes and CSS tokens, not from a separate design file.
- Frequency counts are approximate ripgrep tallies across `apps/` + `packages/` + `src/` and should be treated as ordinal (what dominates), not exact telemetry.
- Android UI = responsive web UI in Capacitor; native splash/icons are outside this SPA visual-language audit except where CSS safe-area/native classes apply.

---

*End of FIXNOW_CURRENT_UI_DESIGN_AUDIT.md — documentation only; no implementation changes were made.*
