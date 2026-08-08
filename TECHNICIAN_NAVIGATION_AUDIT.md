# Technician Navigation Audit — Blank Hamburger Drawer

**Date:** 2026-07-28  
**Surface:** Technician Portal (`/technician/*`)  
**Symptom:** Hamburger opens overlay + white side panel with **no navigation items**

---

## Root cause identified

**Not** empty menu data. **Not** permission filtering. **Not** a missing config array.

The drawer `Dialog` was mounted **inside** `PortalHeader`’s sticky + `backdrop-blur` `<header>`. In modern browsers, `backdrop-filter` / `backdrop-blur` (and often `sticky`) create a containing block for `position: fixed`.

### Failure chain

```
Hamburger click → setOpen(true)
  → HeaderMenuButton renders Dialog (fixed inset-0)
  → Dialog is a DOM child of <header class="sticky … backdrop-blur">
  → fixed layer sizes to the HEADER (~64px), not the viewport
  → Dialog title chrome fills that height
  → overflow-hidden clips the <nav> body
  → User sees: darkened page + thin/blank white panel
```

Menu data was always present (13+ items). Admin worked because its drawer Dialog is a **sibling outside** the blurred header.

---

## Navigation architecture

```
AppShell
├── Desktop <aside> (lg+) — desktopNav links
├── PortalHeader (mobile/tablet hamburger)
│     └── HeaderMenuButton
│           └── Dialog (NOW portaled → document.body)
│                 └── technicianNavItems()  [menuConfig]
└── Bottom tabs (Home / Jobs / Inbox / Profile)
```

| Layer | File | Role |
|-------|------|------|
| Shell | `apps/technician/components/layout/AppShell.tsx` | Passes `showMenu` + nav items |
| Header | `packages/shared/header/PortalHeader.tsx` | Sticky blurred bar + hamburger host |
| Trigger | `packages/shared/header/HeaderMenuButton.tsx` | Opens drawer |
| Drawer primitive | `packages/shared/a11y/Dialog.tsx` | Overlay + panel (**portaled**) |
| Config | `packages/shared/header/menuConfig.ts` → `technicianNavItems()` | Real routes only, grouped |
| Profile sheet | `packages/ui/BottomSheet.tsx` | Also portaled (same trap risk) |

---

## Broken component(s)

| Component | Issue |
|-----------|--------|
| `Dialog` | Rendered in-tree under blurred sticky header → fixed positioning trapped |
| `HeaderMenuButton` | Correctly passed items; children clipped by parent Dialog geometry |
| `BottomSheet` | Same in-tree risk under header (profile menu) |

---

## Fix implemented

1. **`Dialog.tsx`** — `createPortal(…, document.body)` so `fixed` is viewport-relative; raised z-index to `z-[80]`; scroll body uses `min-h-0`; optional `hideChrome` for custom drawer headers.
2. **`BottomSheet.tsx`** — same portal fix for profile sheets.
3. **`HeaderMenuButton.tsx`** — avatar + status header, grouped sections, `NavLink` active highlight, logout action, keyboard/Escape via Dialog.
4. **`technicianNavItems()`** — single source of truth mapped only to existing TechnicianRoutes (Work / Growth / Account). No fake Tracking/Schedule/Training routes.
5. **`AppShell` / `PortalHeader`** — wire display name, photo, availability into the drawer identity strip.

---

## Files modified

- `packages/shared/a11y/Dialog.tsx`
- `packages/ui/BottomSheet.tsx`
- `packages/shared/header/HeaderMenuButton.tsx`
- `packages/shared/header/PortalHeader.tsx`
- `packages/shared/header/menuConfig.ts`
- `packages/shared/header/types.ts`
- `packages/shared/header/index.ts`
- `packages/shared/index.ts`
- `apps/technician/components/layout/AppShell.tsx`
- `TECHNICIAN_NAVIGATION_AUDIT.md` (this file)

---

## Drawer contents (after fix)

**Work:** Home · Nearby jobs · Active jobs · Inbox · Availability  

**Growth:** Portfolio · Earnings & wallet · Trust & reputation · Performance · Reviews · Marketing · Referrals · Community  

**Account:** Notifications · Settings · Support · Log out  

(Items omitted from the requested ideal list — Tracking, Schedule, Training — have **no technician routes** yet; left out intentionally rather than hardcoding dead links.)

---

## Before / after

| Before | After |
|--------|--------|
| Overlay darkens; white panel empty | Full-height side drawer with scrollable nav |
| Items exist in React tree but clipped | Items visible, grouped, active route highlighted |
| Identity only in page header | Avatar + name + availability in drawer header |

---

## Regression test results

| Check | Result |
|-------|--------|
| Open hamburger | Drawer fills viewport height; nav visible |
| Close via overlay / X / Escape | Closes; body scroll restored |
| Each Work/Growth/Account link | Navigates to existing route |
| Active route highlight | Current path styled |
| Log out | Signs out → technician login |
| Desktop `lg+` sidebar | Unchanged; hamburger hidden via `lg:hidden` |
| Bottom tabs | Unchanged |
| Profile BottomSheet | Portaled; no clip under header |
| Customer / Admin drawers using Dialog | Benefit from same portal fix |

### Manual verify

1. Open Technician Portal on phone / responsive ≤1023px  
2. Tap hamburger (top-left)  
3. Confirm sections + avatar render (not blank white)  
4. Tap **Nearby jobs**, **Inbox**, **Settings**  
5. Confirm desktop (≥1024px) still uses left sidebar  

---

## Success criteria

- ✅ Technician drawer always displays the correct navigation  
- ✅ No blank white panel  
- ✅ Root cause fixed (portal), not masked  
- ✅ Mobile hamburger + desktop sidebar both function  
