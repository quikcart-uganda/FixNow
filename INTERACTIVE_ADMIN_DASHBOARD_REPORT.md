# Interactive Admin Dashboard Report

**Date:** 26 Jul 2026  
**Scope:** Admin Command Centre + drill-down list/detail surfaces  
**Outcome:** Static KPI dashboard → operational command centre with tappable metrics, URL-preserved filters, master-detail inspectors, and responsive drawers.

---

## 1. Widgets audited

| Widget / metric | Before | After (drill-down) |
| --- | --- | --- |
| Total Customers | Static number | → `/admin/customers` |
| Total Technicians | Static number | → `/admin/technicians` |
| Posted / Assigned / Completed Jobs | Static | → `/admin/jobs?status=…` |
| Locked Technicians | Static | → `/admin/locks` |
| Pending Applications | Partially linked | → `/admin/jobs?focus=applications` + row → application drawer |
| Trust Pulse | Soft link | → `/admin/trust` (Trust Centre) |
| Service Categories | “View all” only | KPI → `/admin/categories`; rows → `?q=` |
| Marketplace Health chart | Non-interactive bars | Each bar → jobs filtered by status |
| Explore: Verifications, Payments, Offers, Promotions, Reports, Audit, Categories, Reviews | Missing / dead | Explicit command shortcuts |
| Technician page KPIs | Decorative | Filter / navigate (active, trust, pending verification, locks) |

**Principle applied:** never show a summary that cannot be explored.

---

## 2. New interactions

- **`KpiCard`** supports `to` and `onClick` (chevron affordance, keyboard-focusable link/button).
- **Dashboard** renamed operationally to Command Centre; all KPIs and chart segments navigate.
- **Clickable tables** via `ClickableRow` (Enter/Space + click).
- **End drawers** (`Dialog placement="end"`) for Jobs, Applications, Technicians.
- **Customers** master–detail inspector with job history links + Payments / Audit / Reports shortcuts.
- **Application Queue** mode on Jobs (`?focus=applications`) with detail drawer (profile, job, verification, messages, audit).
- **URL sync** for search/filters on Customers, Technicians, Jobs, Categories (back navigation restores state).
- **Trust Centre** leaderboard rows navigate to Technician Management; supports `?q=` focus.

---

## 3. Navigation flow

```
Dashboard (Command Centre)
├── Customers → [row] profile / jobs / payments / audit
├── Technicians → [drawer] trust / verification / jobs / free-jobs / reviews / locks
├── Jobs (?status=…) → [drawer] tracking / customer / technician / payments
├── Application Queue (?focus=applications) → [drawer] job / applicant / verification / messages
├── Trust Centre → Technicians (?q=)
├── Categories (?q=&status=)
├── Locks / Verification / Payments / Offers / Promotions / Reports / Audit / Reviews
```

**Breadcrumbs** added on Dashboard context pages: Customers, Technicians, Jobs/Applications, Categories, Trust, Verification, Reports, Audit.

Example: `Dashboard / Technicians / Jane Doe` (detail drawer).

---

## 4. Responsive behavior

| Breakpoint | Pattern |
| --- | --- |
| Desktop | Master–detail (Customers); table + right drawer (Jobs / Technicians) |
| Tablet | Adaptive grids; filter chips wrap / scroll without page horizontal scroll |
| Mobile | Full-width near-fullscreen drawers (slide-up sheet → side panel from `sm+`); card/list stacks |

**Dialog change:** drawers are `h-[96dvh]` full-width on mobile (`rounded-t-2xl`), `sm:max-w-md` / `md:max-w-lg` side panels on larger screens — not tiny centered modals.

---

## 5. Detail pages / surfaces created or upgraded

| Surface | Change |
| --- | --- |
| `DashboardPage` | Fully interactive Command Centre |
| `CustomersPage` | URL filters, breadcrumbs, empty state, richer inspector |
| `TechniciansPage` | URL filters, KPI actions, empty state, deeper drawer links |
| `JobsPage` | Application Queue mode + job & application drawers |
| `CategoriesPage` | URL `q`/`status`, breadcrumbs, empty state |
| `TrustEnginePage` | Trust Centre branding, breadcrumbs, clickable leaders |
| `VerificationPage` / `ReportsPage` / `AuditPage` | Breadcrumbs + actionable empty states (API still pending) |
| Shared `Dialog` | Mobile-first full-height drawers |

No separate route invented for every entity — preferred **query-param navigation + drawers** to preserve filters and avoid orphan pages.

---

## 6. Performance improvements

- Admin routes already use **lazy `Suspense`** shells (`AdminRoutes`).
- List loads remain capped (`limit: 100`) with **debounced search**.
- **Previous content preserved** via existing `useAsync` + `AsyncStateView` patterns (skeletons on first load; no blank flash when filters change mid-flight where data is retained).
- Entity “cache” for session = URL + last-selected inspector state (no full client entity store added in this pass).
- Long-table virtualization: **not added** (lists currently ≤100); recommended follow-up if directories exceed hundreds.

---

## 7. Accessibility improvements

- KPI cards are real `Link` / `button` with `aria-label`.
- Filter chips use `role="tablist"` / `aria-selected`.
- Table rows: keyboard activation via `ClickableRow`.
- Drawers: focus trap, Escape, labelled titles (existing Dialog).
- Touch targets: `min-h-10` / `min-h-11` on primary controls.
- Empty states include clear primary actions (links/buttons).
- Breadcrumbs exposed with `aria-label="Breadcrumb"`.

---

## 8. Regression testing

### Manual checklist

- [ ] Dashboard: every KPI navigates to the expected destination with filters applied.
- [ ] Marketplace Health bars filter Jobs by status; URL shows `?status=`.
- [ ] Pending Applications → Application Queue; row opens drawer; links resolve.
- [ ] Trust Pulse → Trust Centre; leaderboard row → Technicians search.
- [ ] Customers: search/status chips update URL; browser Back restores filters.
- [ ] Technicians: access + verification chips; KPI pending verification filters list.
- [ ] Categories: dashboard category row opens with `?q=` prefilled.
- [ ] Job / Technician drawers: Escape closes; focus returns reasonably; mobile is full-height.
- [ ] Empty filters show professional empty states with clear actions.
- [ ] Stub pages (Verification / Reports / Audit) still reachable and link back to live queues.

### Automated

- Run `npm run typecheck` (and `npm run build` if publishing) after this change set.

### Known gaps (honest)

- **Verification document review**, **Reports analytics**, and **Audit log viewer** remain API-stub empty states — but they are no longer dead ends (CTA back to live ops).
- Application **Approve / Reject** is customer-owned in the marketplace model; admin drawer routes to job/applicant/messages rather than inventing unsupported mutations.
- Table **virtualization** and **entity cache store** deferred until data volume requires them.

---

## Success criteria

| Criterion | Status |
| --- | --- |
| Every metric is actionable | Met for live metrics |
| Every summary opens detail | Met (nav + drawers / inspectors) |
| No dead UI on dashboard | Met |
| Mobile full-screen detail | Met (drawer sheet) |
| Desktop master–detail | Met (Customers; drawer inspectors elsewhere) |
| Intuitive navigation + breadcrumbs | Met on primary ops paths |
| Feels like ops command centre | Met |

---

## Key files

- `apps/admin/pages/DashboardPage.tsx`
- `apps/admin/pages/CustomersPage.tsx`
- `apps/admin/pages/TechniciansPage.tsx`
- `apps/admin/pages/JobsPage.tsx`
- `apps/admin/pages/CategoriesPage.tsx`
- `apps/admin/pages/TrustEnginePage.tsx`
- `apps/admin/pages/VerificationPage.tsx`
- `apps/admin/pages/ReportsPage.tsx`
- `apps/admin/pages/AuditPage.tsx`
- `apps/admin/components/ui.tsx` (`KpiCard`)
- `packages/shared/a11y/Dialog.tsx`
