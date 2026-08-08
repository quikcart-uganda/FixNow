# Admin Reports, Analytics & Marketing — Audit Report

**Date:** July 26, 2026  
**Scope:** Admin Command Center — Reports & Analytics, Marketing, Trust advantages, related APIs  
**Approach:** Audit first → reuse existing APIs/components → implement only what was genuinely missing

---

## 1. Current Architecture (discovered)

| Surface | Route | Pre-audit status | Data source |
|---|---|---|---|
| Command Centre | `/admin/dashboard` | **Completed** | `GET /admin/dashboard`, `/admin/marketplace/metrics` |
| Reports & Analytics | `/admin/reports` | **Placeholder only** | None (hard-coded empty state) |
| Marketing Analytics | `/admin/marketing` | **Completed** | `GET /admin/marketing/analytics` |
| Offer queues | `/admin/marketing/{pending,approved,rejected}` | **Completed** | `offersApi.adminList` + moderate |
| Platform Promotions | `/admin/marketing/platform` | **Completed** | CRUD APIs |
| Sponsored / Ads | `/admin/marketing/{campaigns,ads}` | **Completed** | Same sponsored API; ads filters `partner_ad` |
| Dynamic Content | `/admin/marketing/content-blocks` | **Completed** | content blocks API |
| Dynamic Pricing | — | **Missing** | No API / UI |
| Trust Centre | `/admin/trust` | **Partial** | Live tech scores + static platform advantage cards |
| Payments & Escrow | `/admin/payments` | **Completed** | Payment/escrow dashboards + CSV export |
| Reviews | `/admin/reviews` | **Completed** | Reviews analytics |
| Subscriptions | `/admin/subscriptions` | Placeholder | Future revenue scaffolding |

**Charts:** No chart library (recharts/Chart.js). Dashboard and Reports use CSS bar widgets + existing `KpiCard` / `TrustGauge`.

**Exports:** Only client-side CSV existed (Payments). Reports now has summary CSV export. PDF/Excel generators do not exist server-side — not invented.

---

## 2. Root Causes Found

### Reports showed “Analytics workspace coming soon”
**Not** a missing backend, bad route, or feature flag.

`apps/admin/pages/ReportsPage.tsx` hard-coded `AsyncStateView status="empty"` while live metrics already existed on:
- Command Centre (`/admin/dashboard`, `/admin/marketplace/metrics`)
- Marketing Analytics
- Payments / Escrow dashboards
- Reviews analytics
- Thin aliases: `GET /analytics/platform`, `GET /reports/jobs`, `GET /reports/users`

`dashboardApi.platformAnalytics()` existed in the client and was unused by Reports.

### Platform advantage cards
Located on **Trust Centre**, not Reports. They are static capability copy (Mobile Money, Parish discovery, LC1, Neighbours recommend) — correct domain for Trust / marketplace positioning, not analytics KPIs.

### Marketing “Dynamic Pricing” tab in screenshots
Product expectation exceeded code: no tab, route, or pricing engine existed. Other marketing tabs were already real.

### Marketing KPI cards
Rendered as static `Stat` tiles — no drill-down into offer manager, approval queue, traffic, CTR, conversion, or revenue workspaces.

---

## 3. Features Reused

- `adminApi.getDashboard()` / `marketplaceMetrics()`
- `marketingApi.analytics()` + existing marketing CRUD pages
- `paymentsApi.adminPaymentDashboard()` / `adminEscrowDashboard()`
- `reviewsApi.analytics()`
- Shared `KpiCard`, `PageHeader`, `Surface`, `AsyncStateView`, `Button`, `Icon`
- Existing CSS bar pattern from Command Centre (no new chart library)
- Existing offer moderation API (`adminModerate`) for bulk actions
- Payments CSV pattern adapted for Reports summary export

---

## 4. Features Implemented

| Change | Detail |
|---|---|
| **Reports workspace** | Replaced placeholder with live multi-section analytics |
| **Marketplace metrics API** | Additive fields: `newCustomers`, `cancelledInWindow`, `jobsByDistrict`, `topTechnicians`; window up to 365 days |
| **Marketing drill-downs** | KPI cards open contextual focus panels + deep-links to workspaces |
| **Offer queue workspace** | Search, multi-select, bulk approve / reject / restore / archive |
| **Marketplace advantages** | Kept on Trust Centre; retitled; linked to Payments / Jobs / Verification / Reviews |
| **Dynamic Pricing tab** | Honest “not available yet” workspace (no mock numbers) |

---

## 5. APIs Audited

| API | Verdict |
|---|---|
| `GET /admin/dashboard` | Real — reused by Reports |
| `GET /admin/marketplace/metrics` | Real — extended additively |
| `GET /analytics/platform` | Alias of marketplace metrics — available |
| `GET /reports/jobs`, `/reports/users` | Thin list wrappers — not file exporters |
| `GET /admin/marketing/analytics` | Real — reused |
| Marketing / offers / sponsored CRUD | Real |
| `GET /admin/payments/dashboard`, escrow | Real — reused |
| `GET /admin/reviews/analytics` | Real — reused |
| `GET /analytics/technicians/me` | Stub `notImplemented` — unchanged |
| Dynamic pricing | Does not exist — not fabricated |
| `DailyMetric` / `UserActivity` models | Schema only; no admin pipeline — left alone |

---

## 6. Routes Audited

| Route | Action |
|---|---|
| `/admin/reports` | **Restored** to live workspace (same path) |
| `/admin/marketing` (+ `/analytics`) | Enhanced drill-downs; paths unchanged |
| `/admin/marketing/pending|approved|rejected` | Enhanced workspace; paths unchanged |
| `/admin/marketing/pricing` | **Added** (honest unimplemented state) |
| `/admin/offers` | Still redirects to pending |
| `/admin/trust` | Advantages upgraded in place |
| No routes deleted |

---

## 7. Database Models Used

- `Job` (+ `location.district` aggregation)
- `JobApplication`
- `User` (customer / technician counts)
- `TechnicianProfile` (trust leaderboard)
- `TechnicianOffer`, `PlatformPromotion`, `SponsoredContent` (marketing analytics)
- Payment / escrow aggregates via existing payment services
- Reviews analytics via existing review service

No breaking schema migrations.

---

## 8. Placeholder Pages Removed / Clarified

| Page | Outcome |
|---|---|
| Reports “coming soon” | **Removed** — live data workspace |
| Dynamic Pricing | **Explicit** “not available yet” (genuinely unimplemented) |
| Empty metric holes | Show **“No data available”** instead of fake numbers |

Still placeholders elsewhere (intentionally untouched this pass): Audit viewer, Verification queue, Subscriptions Phase-2.

---

## 9. Interactive Cards Added

### Reports
Every major KPI uses `KpiCard` with `to=` drill-downs into Customers, Technicians, Jobs, Trust, Locks, Marketing queues, Payments, Reviews.

### Marketing Analytics
Cards for Live Offers, Pending Approval, Platform Promotions, Sponsored Active, Views, Clicks, Redemptions, Revenue:
- Select a contextual drill-down panel (`?focus=`)
- Link into Offer Manager, Approval Queue, Promotion Manager, Campaign Manager, Payments when appropriate
- Ranked inventory for traffic / conversion focuses

---

## 10. Marketing Improvements

- Interactive analytics cards with contextual workspaces
- Offer queues: search, select-all, bulk approve/reject/restore/archive, rejection reason visibility
- Dynamic Pricing tab added without inventing fake rules/engines
- Existing Platform / Sponsored / Ads / Content Blocks left intact

---

## 11. Analytics Improvements (Reports)

Sections now live:
1. Marketplace overview  
2. Job analytics (+ status bars)  
3. Technician analytics (trust leaders)  
4. Customer analytics  
5. Revenue & escrow (payment dashboards)  
6. Trust analytics  
7. Marketing analytics  
8. Geographic analytics (district bar list)  
9. Related workspaces  

Filters: Today / 7 / 30 / 90 / This year  
Export: Summary CSV  

Parish/village heatmaps: not available — labeled clearly; district aggregation only.

---

## 12. Performance Optimisations

- Reports loads six APIs in parallel; marketing/payments/reviews failures soft-degrade
- Heavy admin pages remain lazy-loaded via `AdminRoutes`
- Offer search filters client-side on the current page (avoids per-keystroke API thrash)
- Marketplace metrics district aggregation capped at top 12; tech leaderboard capped at 8
- No new chart library bundle weight

---

## 13. Security Verification

- Reports / marketing / payments routes remain behind `authenticate` + `authorize(ROLES.ADMIN)`
- No new public endpoints
- Bulk moderation reuses existing admin moderate endpoint (same auth)
- Additive metrics response fields only — no schema break
- Revenue deep-links stay on admin-only Payments workspace

---

## 14. Responsive Verification

- KPI grids: 1 → 2 → 3–4 columns
- Marketing drill cards and offer dual-pane remain usable on tablet/mobile
- Range chips and export wrap on narrow widths
- Trust advantage cards stack on mobile

---

## 15. Regression Testing Results

| Check | Result |
|---|---|
| Reports no longer shows “coming soon” when APIs respond | ✅ |
| Reports cards navigate to correct workspaces | ✅ |
| Marketing cards open focus panels / managers | ✅ |
| Pending/Approved/Rejected tabs still load | ✅ |
| Platform / Sponsored / Ads / Content Blocks unchanged | ✅ |
| Dynamic Pricing tab honest empty state | ✅ |
| Trust advantages retained (relocated conceptually, not deleted) | ✅ |
| Command Centre still works | ✅ |
| Bulk offer actions call existing moderate API | ✅ |
| CSV export downloads summary | ✅ |
| Empty datasets show “No data available” | ✅ |
| No routes deleted | ✅ |

---

## 16. Production Readiness Assessment

**Ready for production as an ops analytics overlay** that consolidates existing live systems.

**Still out of scope / future:**
- Server PDF / Excel exporters
- Parish/village heatmap telemetry pipeline
- Dynamic pricing engine
- Dedicated RBAC `reports.view` enforcement on every analytics route (permission key exists; routes still use role=admin)
- `DailyMetric` time-series warehouse

**Verdict:** The “coming soon” Reports gap was UI debt, not missing core data. Marketing was largely complete and now has proper card drill-downs. Platform advantages correctly remain on Trust Centre as capability cards, not fake report metrics.
