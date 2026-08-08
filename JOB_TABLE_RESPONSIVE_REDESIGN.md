# Job Table Responsive Redesign

**Date:** 2026-07-28  
**Scope:** Admin Job Management + shared identifier pattern across Admin tables

---

## Problem (before)

On iPhone-width viewports the Jobs **table** compressed the Job column so public references wrapped mid-token:

```
House
fumigation
PST-KLA-
260726-
0004-001
```

Budget headers truncated (`BUDG`), party names wrapped, and scanning/copying references was unreliable.

---

## Solution (after)

### Mobile (`< md`) — stacked cards

```
House fumigation                    [POSTED]
Pest Control
PST-KLA-260726-0004-001  📋

Customer: NYAGO RONALD
Technician: Unassigned

Kampala, Nakawa              UGX 120,000
                                      View
```

- Title wraps naturally  
- Category on its own line  
- **Reference stays on one monospace line** with copy control  
- Parties / location / budget stack below with tight spacing  

### Tablet / desktop (`md+`) — improved table

| Job (wider) | Parties | Location (≥ lg) | Budget | Status | Actions |
|---|---|---|---|---|---|
| Title<br>Category<br>`REF` 📋 | Customer<br>Technician | District, parish | UGX … | badge | View |

- Job column `min-width` ≈ 18–24rem  
- Location demoted below `lg` (still on cards for mobile)  
- Same hierarchy: **title → category → reference**

### Screenshots

- Mobile cards: `docs/job-table/jobs-after-mobile.png`  
- Desktop table: `docs/job-table/jobs-after-desktop.png`

---

## Copyable identifier pattern

New component: `apps/admin/components/CopyableId.tsx`

| Behavior | Detail |
|---|---|
| Typography | `font-mono`, `whitespace-nowrap` |
| Overflow | Horizontal scroll inside the ID (`scrollbar` hidden); full value in `title` |
| Copy | Dedicated icon button → clipboard + `aria-live` “copied” |
| Tap ID | Opens details when `onOpen` is provided; otherwise copies |
| a11y | Labeled buttons (`Copy Job reference`, `Open details for…`) |
| Events | `stopPropagation` so row/card click does not fight copy |

---

## Responsive behavior

| Breakpoint | Jobs UI |
|---|---|
| &lt; 768px | Card list only |
| ≥ 768px | Data table with wider Job column |
| ≥ 1024px | Location column visible |

Payments table: Type / Created columns hide earlier on small widths; Reference uses `CopyableId`.

---

## Applied across Admin identifiers

| Surface | Identifiers |
|---|---|
| **Jobs** list + detail + applications | Job reference, internal ID, application / tech / job IDs |
| **Dashboard** pending applications | Application, technician, job IDs |
| **Payments & escrow** | Payment / refund / payout references |
| **Settlements** table | Settlement ID |
| **Live Tracking** list + detail | Job reference, technician ID, customer ID |
| **Portal production** referrals | Referral code, referrer ID |

Pattern rule: **no important identifier wraps awkwardly**; always monospace + copy.

---

## Accessibility improvements

- Copy success announced via `aria-live="polite"`  
- Copy / open controls are real `<button>`s with clear labels  
- Full ID available via `title` tooltip and clipboard when truncated/scrolled  
- Mobile cards use `role="list"` / `listitem` and an explicit open control  
- Row activation still keyboard-accessible on desktop (`ClickableRow`)

---

## Copied-identifier UX

1. Tap **copy icon** → writes full string to clipboard → icon briefly becomes check  
2. Tap **ID text** on Jobs → opens Job Details (copy remains on the icon)  
3. Screen readers hear “Job reference copied to clipboard”

---

## Validation

| Device / mode | Result |
|---|---|
| Mobile viewport (~390px) | Card layout; `PST-KLA-260726-0004-001` single line + copy |
| Desktop (~1280px) | Table; title → category → ID hierarchy; copy icon present |
| iPhone Safari / Android Chrome | Same responsive CSS (`md` breakpoint) — validated via device metrics in browser tooling |
| Tablet | Table without Location until `lg` |

---

## Files touched

- `apps/admin/components/CopyableId.tsx` *(new)*  
- `apps/admin/pages/JobsPage.tsx`  
- `apps/admin/pages/PaymentsEscrowPage.tsx`  
- `apps/admin/pages/TrackingPage.tsx`  
- `apps/admin/pages/DashboardPage.tsx`  
- `apps/admin/pages/PortalModerationPage.tsx`  
- `apps/admin/components/settlements/SettlementDashboard.tsx`  
- `docs/job-table/*.png`  
- `JOB_TABLE_RESPONSIVE_REDESIGN.md` *(this file)*
