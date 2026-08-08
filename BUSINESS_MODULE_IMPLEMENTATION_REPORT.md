# BUSINESS_MODULE_IMPLEMENTATION_REPORT

## Summary

Business team modules that previously rendered as **PLACEHOLDER / Coming soon** cards are now operational end-to-end. Employees, Dispatch, Assignments, Performance, Availability, and Company settings load live data, perform real actions, and use meaningful empty states. Subscription plans, entitlement architecture, and payment verification were not redesigned.

---

## Phase 1 — Audit findings

| Area | Before | Gap |
|------|--------|-----|
| `CompanyTeamPlaceholderPage` | Static cards with PLACEHOLDER | No APIs / workflows |
| Employees | Marketing copy only | No invite / roles / status |
| Dispatch | Placeholder card | No queue / assign / recommend |
| Assignments | Placeholder card | No live job list |
| Performance | Placeholder / mock intent | No live analytics |
| Availability | Placeholder card | Not wired to dispatch |
| Company management | Brand profile existed | No team settings / invites |
| Entitlements | `teamManagement`, `dispatcher`, `canUseTeamPlaceholders` ready | UI unused |

**Already real (kept):** Business dashboard, Marketing Centre, Company brand profile (`CompanyProfilePage`).

---

## New lifecycle / workflows

### Employees
Invite → notification (if registered) → accept (email must match) → active member → role / suspend / remove.

### Dispatch
Open posted jobs + team-active jobs → recommendations (availability, skill, district, rating, response score, workload) → manual assign / reassign → notify technician → messaging system note → audit log. Optional auto-assign when company setting enabled.

### Assignments
Live jobs for team members with status filters (assigned, travelling, working, pending confirm, completed, cancelled).

### Performance
Live counts and rankings from jobs + technician profile metrics (no hardcoded stats).

### Availability
Live `isAvailableNow` + working hours; coverage gaps listed; availability heavily weights dispatch scoring.

### Company
Name, auto-assign, dispatch notifications; brand profile remains on existing Company profile page.

---

## Database models

New file: `backend/src/models/marketplace/Company.ts`

| Model | Purpose |
|-------|---------|
| `Company` | Owner company record + settings |
| `CompanyMember` | Roles: `owner` \| `dispatcher` \| `employee`; statuses: active / invited / suspended / removed |
| `CompanyInvite` | Email invite + token + expiry |

Exported from `backend/src/models/index.ts`.

---

## APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/company/team` | Overview (Business entitlement) |
| GET | `/company/team/invites/mine` | Pending invites for signed-in tech (no Business gate) |
| POST | `/company/team/invites` | Invite employee / dispatcher |
| POST | `/company/team/invites/accept` | Accept invite by token |
| PATCH | `/company/team/members/:id` | Role / status / title / notes |
| GET | `/company/team/dispatch` | Queue + recommendations (+ auto-assign) |
| POST | `/company/team/dispatch/assign` | Assign / reassign |
| GET | `/company/team/assignments` | Optional `?status=` |
| GET | `/company/team/performance` | Summary + rankings |
| GET | `/company/team/availability` | Coverage + shifts |
| PATCH | `/company/team/settings` | Name / auto-assign / notify |

**Service:** `backend/src/services/marketplace/companyTeam.service.ts`  
**Controller / routes:** wired in `backend/src/controllers/index.ts`, `backend/src/routes/index.ts`  
**Client:** `packages/api/companyTeamApi.ts` (exported from `packages/api`)

Gating uses existing `assertCapability(..., 'canUseTeamPlaceholders')` — no entitlement redesign.

---

## UI changes

| File | Change |
|------|--------|
| `apps/technician/pages/CompanyTeamPlaceholderPage.tsx` | Replaced placeholder UI with operational Team hub tabs |
| `apps/technician/routes.tsx` | Still `/technician/business/team` (alias `TeamPlaceholderPage` → real hub) |
| `apps/technician/pages/BusinessDashboardPage.tsx` | Quick link: Employees & dispatch |
| `apps/technician/lib/subscriptionPresentation.ts` | Label: Team management |
| `packages/api/index.ts` | Export `companyTeamApi` |

**Tabs:** Employees · Dispatch · Assignments · Performance · Availability · Company  
**Empty states:** actionable copy (e.g. “No employees yet. Invite your first technician…”)  
**No** Coming Soon / PLACEHOLDER / Future Phase messaging on Business team screens.

---

## Integrations

- **Jobs / Assignments:** assign updates `Job`, `Assignment`, applications, status history/timeline  
- **Notifications:** invite, accept, suspend/remove, dispatch  
- **Messaging:** system message on dispatch  
- **Sockets:** `emitTechnicianAssigned`  
- **Audit logs:** invite / accept / member update / dispatch  
- **Subscriptions / RBAC:** Business capability gate; technician auth  
- **Working hours / availability:** feed dispatch scoring  

---

## Validation

| Check | Result |
|-------|--------|
| No PLACEHOLDER / Coming soon on Business team hub | Pass |
| Upgrades / entitlements engine unchanged | Pass (reuse flags only) |
| Invite / accept / suspend / remove / role change | Implemented |
| Dispatch assign + reassign | Implemented |
| Recommendations use availability, skill, district, rating, workload, response | Implemented |
| Auto-assign respects company setting | Implemented |
| Assignments filtered by live job status | Implemented |
| Performance from live job/profile data | Implemented |
| Availability influences scoring | Implemented |
| Company settings functional | Implemented |
| Invitees can accept without Business plan (`/invites/mine`) | Implemented |
| Payment / Development Transaction / plan catalogue | Unchanged |

**Note:** Branches / departments calendars as separate org units remain out of scope (not previously advertised as live modules). Brand verification remains on existing company profile fields.

---

## Files modified / added

**Added**
- `backend/src/models/marketplace/Company.ts`
- `backend/src/services/marketplace/companyTeam.service.ts`
- `packages/api/companyTeamApi.ts`
- `BUSINESS_MODULE_IMPLEMENTATION_REPORT.md`

**Modified**
- `backend/src/models/index.ts`
- `backend/src/services/index.ts`
- `backend/src/controllers/index.ts`
- `backend/src/routes/index.ts`
- `packages/api/index.ts`
- `apps/technician/pages/CompanyTeamPlaceholderPage.tsx`
- `apps/technician/pages/BusinessDashboardPage.tsx` (earlier)
- `apps/technician/lib/subscriptionPresentation.ts`

---

## Related work

Subscription graceful downgrade / unsubscribe scheduling is documented separately in `SUBSCRIPTION_LIFECYCLE_ENHANCEMENT_REPORT.md` and is complete independently of this Business module work.
