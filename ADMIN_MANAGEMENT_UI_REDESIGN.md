# Administrator Management UI Redesign

Presentation-layer redesign of the FixNow Command Center **Administrators** screen
(`/admin/admins`) to match modern enterprise admin consoles.

No backend route, controller, service, role, permission, or security rule was changed.
Every action in the new UI maps onto an endpoint that already existed.

---

## 1. Before vs after

### Before

`apps/admin/pages/AdminsPage.tsx` was a single 316-line file rendering one horizontally
scrolling table for every viewport:

- **Seven action buttons rendered inline on every row** (Activate, Suspend, Disable, Lock,
  Archive, Delete, Login history) plus a `<details>` disclosure for permissions. On mobile
  these wrapped into a tall stack of ~24px tap targets.
- **No summary metrics.** There was no way to see how many operators were active, pending,
  locked, or suspended without reading the table.
- **Three filters** (search, status, role), unlabelled, with no department filter and no way
  to clear them.
- **Login history rendered as a second panel below the table**, pushing the table off-screen.
- **Permissions shown as a comma-joined string** clipped to `max-w-xs`.
- Invite form was an inline panel that toggled above the table and shifted all content down.
- Raw status strings (`pending_invitation`) and raw role keys (`super_admin`) shown to users.
- No avatars, no self-account protection, no relative timestamps.

### After

| Area | Result |
| --- | --- |
| Summary | Five metric tiles (Total, Active, Pending, Locked, Suspended) that double as status filters |
| Desktop | Sticky-header table, one `⋮` menu per row, 24px column padding, row click opens details |
| Mobile / tablet | Administrator cards — avatar, name, email, role chip, status badge, last login, single `⋮` |
| Actions | Nine actions inside one contextual menu, grouped Lifecycle / Security / Danger zone |
| Details | Right-side drawer with seven tabs: Profile, Permissions, Login history, Devices, Sessions, Recovery, Audit trail |
| Filters | Search, Role, Status, Department + a Clear control and a live result count |
| Primary CTA | Prominent "Invite administrator" button; invite moved into a focus-trapped modal |

### Screenshots

Captured against the running dev server with the seeded Development Administrator account.

**Desktop — 1440px**

Summary tiles in a four-column grid, sticky table header, single overflow trigger per row,
relative plus absolute last-login, self-account marked "You".

![Desktop administrators directory](c:/Users/KINGJ~1/AppData/Local/Temp/cursor/screenshots/page-2026-07-25T22-36-40-558Z.png)

**Desktop — contextual actions menu open**

All nine actions in one menu, grouped into three labelled sections. Lifecycle and Danger
actions are disabled here because the row is the signed-in operator.

![Overflow actions menu](c:/Users/KINGJ~1/AppData/Local/Temp/cursor/screenshots/page-2026-07-25T23-07-01-281Z.png)

**Mobile — 390px**

Full-width invite CTA, horizontally scrolling metric strip, stacked filters, one
administrator card with a single overflow trigger, and no horizontal page scroll.

![Mobile administrator cards](c:/Users/KINGJ~1/AppData/Local/Temp/cursor/screenshots/page-2026-07-25T23-15-01-372Z.png)

---

## 2. Responsive layout decisions

Breakpoints follow the existing Tailwind scale already used across the admin app
(`md` = 768px, `lg` = 1024px, `xl` = 1280px, `2xl` = 1536px).

### Directory: cards below `lg`, table at `lg` and above

The card list (`lg:hidden`) and the table (`hidden lg:block`) are separate components
rather than one table with responsive cells. A table can only be made to fit a phone by
horizontal scrolling or by hiding columns; a card exposes the same five fields with no
truncation and no scrolling.

`lg` (1024px) is the switch point rather than `md`, because the table needs room for five
columns *plus* the 260px fixed sidebar.

### Summary tiles: scroll → 2-up → 4-up → 5-up

```
-mx-4 flex snap-x overflow-x-auto   →  mobile: horizontal scroll strip, 168px tiles
md:grid md:grid-cols-2              →  tablet: two columns
xl:grid-cols-4                      →  desktop: four columns (as specified)
2xl:grid-cols-5                     →  wide desktop: all five on one row
```

The mobile strip uses `-mx-4 px-4` so tiles bleed to the screen edge, which signals
scrollability, and `snap-x snap-mandatory` so flicks settle on a tile boundary. The
`2xl` rule exists only to avoid a lone orphan tile on the second row of very wide
displays; the required four-column desktop grid is unchanged.

### Sticky table header

`thead th` uses `sticky top-16 z-20 bg-surface-alt`. `top-16` matches the shell app bar
height (`h-16`), so the header parks directly beneath it. This required *removing* the
`overflow-x-auto` wrapper that the shared `DataTable` primitive applies: an
`overflow-x: auto` element computes `overflow-y: auto`, which creates a scrollport with no
vertical scroll and silently defeats `position: sticky`. The desktop table is sized to fit
its container, so no horizontal scroll wrapper is needed.

### Filters

Search takes remaining width; the three selects sit in a `grid-cols-2 sm:grid-cols-3`
grid on small screens and collapse into a single flex row at `lg`. Department spans both
columns on the narrowest layout so its option labels are never clipped.

### Contextual menu positioning

The menu renders through `createPortal` into `document.body` with `position: fixed`
coordinates computed from the trigger rect. An absolutely positioned dropdown would be
clipped by the table container, the `Surface` overflow, or the card boundary. The menu
flips above the trigger when there is less than 240px of space below, clamps to the
viewport horizontally, and caps its height with `maxHeight` plus internal scrolling. It
repositions on `resize` and on capture-phase `scroll`.

### Details drawer

`max-w-[560px]`, full height, slides from the end edge. The panel itself no longer
scrolls; instead the identity header and tab strip stay fixed while only the tab panel
scrolls, and the action footer stays pinned to the bottom. That keeps the tab strip and
the primary actions reachable at any scroll depth. On phones the drawer occupies the full
width (`w-full`) and the tab strip scrolls horizontally.

---

## 3. Accessibility improvements

| Concern | Implementation |
| --- | --- |
| Overflow menu semantics | Trigger has `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`; the popup is `role="menu"` containing `role="group"` sections with `aria-label` and `role="menuitem"` items |
| Menu keyboard support | `ArrowDown`/`ArrowUp` cycle enabled items, `Home`/`End` jump to first/last, `Escape` closes and returns focus to the trigger, `Tab` closes, disabled items are skipped by the roving `tabIndex` |
| Touch targets | Every menu item, filter control, tab, and the `⋮` trigger is at least 44px (`min-h-11` / `h-11 w-11`). Measured live: menu items 44px, trigger 44×44 |
| Disabled actions explain themselves | Unavailable actions carry a `title` hint — "You cannot change your own administrator status." or "Already active." — instead of silently doing nothing |
| Self-account protection | The signed-in operator's row is labelled "You" and all lifecycle/danger actions plus session revocation are disabled, mirroring the server rule that protects the last active Super Administrator |
| Table semantics | `<caption class="sr-only">`, `scope="col"` on every header, and `ClickableRow` for Enter/Space row activation with a visible focus ring |
| Tabs | `role="tablist"` / `role="tab"` / `role="tabpanel"` with `aria-selected`, `aria-controls`, `aria-labelledby`, roving `tabIndex`, and `ArrowLeft`/`ArrowRight` navigation |
| Dialog and drawer | Both use the shared `Dialog` — focus trap, `Escape` to close, `aria-modal`, labelled title and description, body scroll lock — plus an explicit 44px close button |
| Live regions | Result count is `aria-live="polite"`; success messages are `role="status"`; failures are `role="alert"`; the summary strip is `aria-busy` while loading |
| Filter labelling | Every input and select has an `aria-label`; summary tiles are `aria-pressed` toggle buttons |
| Card touch target | The card name button carries a stretched `after:absolute after:inset-0` overlay so the whole card is one activation region, while the `⋮` sits above it in `z-10` as a separate control — one card, two controls, no nested interactive elements |
| Human-readable values | `pending_invitation` → "Pending", `super_admin` → "Super Administrator" (resolved from the API role catalogue), timestamps as "2 minutes ago" alongside the absolute date |

---

## 4. UI components added and updated

### New — `apps/admin/components/admins/`

| File | Purpose |
| --- | --- |
| `adminHelpers.ts` | Status metadata (label/tone/icon), role and permission label resolution from the API catalogue, date and relative-time formatting, user-agent parsing, device grouping, one-time password generation |
| `adminMenu.ts` | The nine contextual actions and their disabled rules, grouped into Lifecycle / Security / Danger zone |
| `AdminActionsMenu.tsx` | Binds one administrator to `OverflowMenu` |
| `AdminSummaryCards.tsx` | Responsive metric strip / grid; tiles act as status filters |
| `AdminCard.tsx` | Mobile and tablet administrator card |
| `AdminTable.tsx` | Desktop directory with sticky header |
| `AdminDetailDrawer.tsx` | Seven-tab details drawer with its own data loading and per-tab actions |
| `InviteAdminDialog.tsx` | Focus-trapped invite modal with role description preview |

### Updated

| File | Change |
| --- | --- |
| `apps/admin/pages/AdminsPage.tsx` | Rewritten as a composition layer: queries, filter state, action dispatch, drawer and dialog orchestration |
| `apps/admin/components/ui.tsx` | Added `OverflowMenu`, `Avatar`, `StatTile`, `SearchField`, `SelectField`, and the exported `BadgeTone` type; `StatusBadge` gained an optional leading icon |
| `packages/shared/a11y/Dialog.tsx` | Added an optional `bodyClassName` so a drawer can own its scroll region instead of scrolling the whole panel |
| `packages/api/adminApi.ts` | Added `auditLogs()` — a typed client wrapper for the pre-existing `GET /audit-logs` endpoint |

All five new `ui.tsx` primitives are generic and reusable by the other admin screens
(Customers, Technicians, Jobs) that still render inline row buttons.

---

## 5. Action mapping — every action uses an existing endpoint

| UI action | Endpoint |
| --- | --- |
| Activate / Suspend / Disable / Lock / Archive / Delete | `PATCH /admin/admins/:id/status` |
| Invite administrator | `POST /admin/admins/invite` |
| View permissions | `GET /admin/identity/catalogue` + the `permissions` field already on the list row |
| Login history | `GET /admin/admins/:id/login-history` |
| Reset password | `POST /admin/users/:userId/reset-password` |
| Revoke all sessions | `POST /admin/users/:userId/force-logout` |
| Audit trail | `GET /audit-logs?actorId=:userId` |
| Directory and counts | `GET /admin/admins` |

Server-side permission gates (`admins.manage`, `users.reset_password`,
`users.force_logout`, `audit.read`) are untouched; an operator lacking a permission sees
the endpoint's error surfaced in the drawer rather than a silent failure.

### Two honest constraints, surfaced in the UI

1. **Department filter is client-side.** `GET /admin/admins` accepts `q`, `status`, and
   `role` but has no department parameter, so department options are derived from the
   directory response and filtering happens in the browser. Search, role, and status still
   filter server-side exactly as before.
2. **Devices and Sessions are derived, not live registries.** `GET /auth/sessions` and
   `GET /devices` are self-scoped, so another operator's active sessions cannot be read.
   Both tabs are reconstructed from login events (IP and user agent) and say so in an
   inline note, rather than presenting invented data. Session revocation still works,
   because `force-logout` is admin-scoped.

Recovery codes are likewise self-service only (`POST /admin/me/recovery-codes`), so the
Recovery tab explains that instead of offering an action that would fail.

---

## 6. Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` | Clean, no diagnostics |
| `oxlint` on all changed files | Clean, zero warnings |
| Desktop render at 1440px | Tiles show live counts (Total 1, Active 1, Pending 0, Locked 0, Suspended 0); filters populate from the role and status catalogue; department options derive from the directory |
| Contextual menu | Nine items across three labelled groups; all items 44px; lifecycle and danger items correctly disabled for the signed-in operator |
| Details drawer | Opens at 560px with all seven tabs; Profile panel renders name, email, phone, department, role, status, MFA state, last login, created date, and identifiers |
| Mobile render at 390px | Cards replace the table, metric strip scrolls horizontally, `documentElement.scrollWidth === clientWidth === 390` so there is no horizontal page scroll |

One environmental note from testing: the long-running Vite dev server intermittently threw
`useAuth must be used within AuthProvider` from `AdminShell` after many hot updates. That is
Vite re-instantiating the `AuthProvider` module so stale consumers read a null context; a
hard reload clears it. It predates and is unrelated to this redesign.
