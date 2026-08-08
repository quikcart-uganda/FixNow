# Admin Debug Artifact Audit

**Date:** 2026-07-28  
**Scope:** FixNow Admin Portal (frontend + related settlement API)  
**Goal:** No production-facing raw JSON, API payloads, Mongo dumps, or unfinished developer UI.

---

## Verdict

The primary production leak — **Settlement report (30d)** rendering `JSON.stringify` of the `/admin/settlements` payload — has been removed and replaced with a professional settlement dashboard. Remaining `JSON.stringify` usages are non-UI (session cache / file export). Community stats no longer show raw API field names. Escrow rows no longer surface raw Mongo IDs to administrators.

---

## Step 1–2 — Artifacts found

| Artifact | Location | Severity | Disposition |
|---|---|---|---|
| Raw settlement JSON in `<pre>` via `JSON.stringify` | `apps/admin/pages/PaymentsEscrowPage.tsx` | **Critical** | **Removed** — replaced with `SettlementDashboard` |
| Community stats labeled with raw keys (`discussions`, `openReports`, …) | `apps/admin/pages/PortalModerationPage.tsx` | Medium | **Fixed** — human labels |
| Escrow rows showing `Job {ObjectId}`, `Customer {ObjectId}`, `Tech {ObjectId}` | `apps/admin/pages/PaymentsEscrowPage.tsx` + escrow list API | Medium | **Fixed** — backend enrich + UI uses names/titles |
| Pending refund/payout rows appending raw `jobId` / `technicianId` | `apps/admin/pages/PaymentsEscrowPage.tsx` | Low | **Fixed** — show reference/status only |
| “Temporary fallback active” developer copy | `apps/admin/pages/VerificationPage.tsx` | Low | Softened to operator-facing language |
| `JSON.stringify` for media sessionStorage | `apps/admin/pages/ContentPage.tsx` | None (not rendered) | Retained |
| `JSON.stringify` for technician export download | `apps/admin/pages/TechniciansPage.tsx` | None (download only) | Retained |
| `<pre>` recovery / setup secrets | Setup / invite flows (if present historically) | N/A | No `<pre>` remaining under `apps/admin` |
| `console.log` in Admin SPA | `apps/admin/**` | — | **None found** |
| Development Controls nav + `/admin/dev` | `AdminShell.tsx`, `AdminRoutes.tsx`, `DevelopmentControlsPage.tsx` | Intentional | **Kept** — production-locked server flags; not a JSON dump |
| Dynamic Pricing “not available yet” empty state | `apps/admin/pages/marketing/DynamicPricingPage.tsx` | Low | Kept — honest empty state, no mock JSON |

### Pages audited (sample)

Dashboard, Jobs, Payments & Escrow, Verification, Tracking, Marketing modules, Analytics/Reports, Users (Customers/Technicians/Admins), Community/Portal moderation, Portfolio tab, Categories, Configuration/Dev settings, Notifications, Messages, Content, Locks, Free Jobs, Audit.

---

## Step 3 — Settlement dashboard

### Backend (`backend/src/services/payments/payment.service.ts`)

`settlementReport` no longer returns Mongo-shaped aggregations (`byType: [{ _id, count, amount }]`) for UI consumption. It now returns a production report:

- **summary** — total settlements, released, held, refunded, debits, credits, payouts, fees  
- **series** — daily / weekly / monthly amount+count series  
- **breakdowns** — by type, payment method, technician, customer, category, district, status  
- **recent** — up to 200 rows with human labels (settlement reference, job title, names) — **no Mongo `_id` fields in the client-facing row shape**

Escrow `list` for admins now attaches `jobTitle`, `customerName`, `technicianName`.

### Frontend

| Component | Path | Role |
|---|---|---|
| `SettlementDashboard` | `apps/admin/components/settlements/SettlementDashboard.tsx` | Full settlement workspace |
| `MetricCards` | `apps/admin/components/analytics/MetricCards.tsx` | Reusable KPI strip |
| `SimpleBarChart` | `apps/admin/components/analytics/SimpleBarChart.tsx` | Reusable bar series |
| `BreakdownList` | `apps/admin/components/analytics/BreakdownList.tsx` | Reusable breakdown panels |
| `TimelineList` | `apps/admin/components/analytics/TimelineList.tsx` | Reusable activity timeline |

**Settlement UI includes:**

- Summary cards (Total Settlements, Released, Held, Refunded, Debits, Credits)  
- Daily / weekly / monthly charts  
- Breakdowns by payment method, technician, customer, category, district, status  
- Recent settlements table with columns: Settlement ID, Job, Customer, Technician, Amount, Fee, Platform commission, Release date, Status, Actions  
- Sorting, filtering, search, pagination  
- CSV, Excel (HTML `.xls`), and PDF (print) export  

Wired from `PaymentsEscrowPage` → `/admin/settlements` (no raw JSON).

---

## Step 4 — No developer data (UI policy)

| Must not show | Status |
|---|---|
| Mongo ObjectIds as labels | Cleared from settlement + escrow list UI |
| Aggregation `_id` keys | Transformed to `key` / `label` in API |
| Stack traces / API payloads | Not rendered in Admin SPA |
| Internal schema dumps | Settlement dump removed |

Note: Internal React `key={tx._id}` remains for list stability and is not visible to users. Approve actions still use transaction IDs in API calls (required).

---

## Step 5 — Reusable analytics components

Exported from `apps/admin/components/analytics/index.ts` for reuse across Admin (Reports, Dashboard widgets, etc.).

---

## Step 6 — Production cleanup summary

1. Removed production-facing settlement JSON dump.  
2. Replaced with interactive settlement dashboard + enriched API.  
3. Humanized community moderation metrics.  
4. Humanized escrow / refund / payout list copy.  
5. Softened verification degraded-state messaging.  
6. Confirmed no Admin `console.log` and no remaining Admin `<pre>` JSON viewers.  
7. Development Controls remain admin-gated and production-locked (by design).

---

## Step 7 — Validation checklist

| Check | Expected |
|---|---|
| Desktop Payments & Escrow | Settlement section shows cards/charts/table — **no JSON** |
| Tablet / narrow | Metric grid collapses; table scrolls horizontally |
| Android / iPhone (mobile browser) | Same; export buttons wrap; charts stack |
| Community tab | Labels: Discussions, Replies, Open reports, Helpful votes |
| Escrow rows | Job title + people names, not ObjectIds |
| Responsive | Settlement dashboard uses `sm`/`lg`/`xl` grids |

**Operator note:** Restart the API server so the new `settlementReport` shape is live, then hard-refresh the Admin SPA.

---

## Files touched

- `backend/src/services/payments/payment.service.ts`  
- `packages/api/paymentsApi.ts`  
- `apps/admin/pages/PaymentsEscrowPage.tsx`  
- `apps/admin/pages/PortalModerationPage.tsx`  
- `apps/admin/pages/VerificationPage.tsx`  
- `apps/admin/components/analytics/*` (new)  
- `apps/admin/components/settlements/SettlementDashboard.tsx` (new)  
- `ADMIN_DEBUG_ARTIFACT_AUDIT.md` (this file)

---

## Success criteria

Administrators no longer see raw settlement JSON, Mongo aggregation dumps, or unfinished debug panels on Payments & Escrow. Settlement activity is presented as polished metrics, charts, breakdowns, and an exportable table consistent with the FixNow admin experience.
