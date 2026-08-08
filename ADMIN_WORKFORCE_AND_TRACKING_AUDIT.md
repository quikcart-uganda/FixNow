# Admin Workforce & Tracking Audit

**Date:** 26 July 2026  
**Scope:** Workforce Directory, Job Management, Job Details, Live Tracking, avatars, public job references  
**Constraint:** No rewrites of working modules; reuse existing components; keep Mongo ObjectIds as the internal system of record.

---

## Phase 1 — Root causes

| Surface | Symptom | Root cause |
|---|---|---|
| Workforce Directory | Cramped rows, awkward wrap, empty Actions | Desktop actions used `opacity-0` until hover; technician column too narrow for avatar + multi-line meta |
| Broken avatars | Browser broken-image icon | Missing/invalid `photoUrl` fell through to default SVG assets that 404; raw `<img>` with no exhausted fallback |
| Job IDs in admin UI | Long ObjectIds shown as primary identifiers | No human-friendly public reference field; listJobs returned lean docs without populated names |
| Job Details | Minimal two-column DL + 3 buttons | End `Dialog` on JobsPage only; no sections for ops workflows |
| Live Tracking KPI cards | Cards inert | Plain `Surface` metrics with no `onClick` / filter binding |
| Tracking session map | Felt empty | Map already existed (`TrackingMap`) but panel only rendered after selection; rows showed truncated ObjectIds |
| Parties column | ObjectIds instead of names | `listJobs` did not resolve customer/technician display names |

---

## Dual identifier model (recommended & implemented)

| Identifier | Example | Audience | Storage |
|---|---|---|---|
| **Internal ID** (hidden in ops UI copy) | `6a6524d915ce5d7a4554f288` | DB, APIs, foreign keys, sockets | Mongo `_id` — **unchanged** |
| **Public Reference** (visible) | `PST-KLA-260726-0935-001` | Admins, technicians, customers, invoices, notifications, receipts, chat, payments, support | `Job.publicJobReference` |

Format: `<Category>-<District>-<DDMMYY>-<HHMM>-<Sequence>`  
Sequence resets per calendar day (count of jobs created that day with `_id <=` current). Collision handling appends a short ObjectId suffix.

Search accepts **both** ObjectId and public reference (admin jobs, actor job lists, tracking admin list).

---

## Avatar fixes

**Component:** `packages/ui/ProfileAvatar.tsx` (global)

1. If `hasProfilePhoto(src)` → resolve via `resolveProfileImageUrl` + `LazyImage`.
2. Otherwise → initials disc immediately (role-tinted).
3. On load failure (`onExhausted`) → initials disc.
4. Never leave a broken `<img>` glyph visible.
5. Optional verified badge overlay.

**Applied via existing ProfileAvatar usage in:** Technicians, Customers, Trust Engine, Free Jobs, Locks, leaderboard/marketing surfaces that already import `@fixnow/ui` ProfileAvatar. Job photos use `LazyImage` + `resolveMediaUrl`.

**Performance:** LazyImage lazy-loads; initials skip network; no fragile default SVG round-trips.

---

## Workforce Directory layout

**File:** `apps/admin/pages/TechniciansPage.tsx`

- **Mobile / tablet (`lg:hidden`):** Stacked cards — 64px avatar, name, verified badge, trade, district · parish, rating, trust, free jobs, approval/access, primary actions.
- **Desktop (`lg+`):** Spacious rows — ~68px avatar, identity block, Trust / Level / Free Jobs / Approval / Access, always-visible View · Jobs · Tracking · Suspend · overflow More.
- Removed hover-only action hiding so Actions never appear blank.

**Reused:** `ProfileAvatar`, `TrustGauge`, `LevelBadge`, `StatusBadge`, `OverflowMenu`, `DataTable`, `ClickableRow`, `Dialog`.

---

## Public Job Reference implementation

| File | Change |
|---|---|
| `backend/src/utils/jobReference.ts` | Category/district codes + `formatJobReferenceParts` + `looksLikeJobReference` |
| `backend/src/utils/ensurePublicJobReference.ts` | Lazy assign + save; unique collision suffix; append to `searchText` |
| `backend/src/models/marketplace/Job.ts` | `publicJobReference` field + unique sparse index |
| `backend/src/services/marketplace/job.service.ts` | Assign on create; include in list select/search; keep in `searchText` on update |
| `backend/src/services/marketplace/admin.service.ts` | Admin search by title / reference / ObjectId; populate names; backfill missing refs |
| `backend/src/services/tracking/tracking.service.ts` | Attach `publicJobReference` + `jobTitle` to admin tracking list; search by reference |
| `packages/types/admin.ts` | `AdminJob.publicJobReference` + detail fields |
| `packages/api/mappers.ts` | `mapAdminJob` maps public ref + names + timeline/photos |
| `packages/api/trackingApi.ts` | Optional `publicJobReference` / `jobTitle` on `TrackingSession` |

Mongo `_id` is never replaced.

---

## Job detail improvements

**File:** `apps/admin/pages/JobsPage.tsx` (expanded end drawer — no new route required)

Sections / links:

- Overview (public reference + internal ID, category, budget, location, description)
- Customer / Assigned technician
- Applications count → queue
- Tracking · Payments · Escrow · Chat · Nearby technicians (district filter)
- Photos (`LazyImage` + `resolveMediaUrl`)
- Documents · Audit · Report links
- Status history · Activity timeline
- Actions: Track live, Message customer, Assign technician, Open payment, Refund, Applications, Escalate, Generate report, Cancel

List UI shows **public reference** (fallback last-8 of ObjectId). Client filter also matches public reference.

---

## Tracking enhancements

**File:** `apps/admin/pages/TrackingPage.tsx`

- KPI cards (Active / Travelling / Paused / Avg ETA) are buttons → set focus + status filter; ETA opens analytics panel.
- Session table rows open end drawer (map, ETA, distance, GPS accuracy, speed from `speedMps`, Pause / Resume / Terminate).
- Side panel map uses existing `TrackingMap` (Google Maps when `VITE_GOOGLE_MAPS_API_KEY` is set; otherwise graceful fallback).
- Rows / drawer prefer **public job reference**.

---

## Map improvements

**Reused:** `packages/shared/tracking/TrackingMap.tsx`

- Technician marker, customer/destination marker, route polyline
- Auto-fit bounds; refresh via realtime reload hooks
- Keyed by env — no hard dependency on Maps for admin boot

---

## Performance changes

- Avatars: skip network when no real photo; LazyImage for real photos
- Job reference backfill: best-effort on admin list only (existing jobs without a code)
- Tracking list: single Job `$in` lookup for references (no N+1 beyond one batch)
- Debounced job search retained

---

## Files modified

```
backend/src/utils/jobReference.ts                          (new)
backend/src/utils/ensurePublicJobReference.ts              (new)
backend/src/models/marketplace/Job.ts
backend/src/services/marketplace/job.service.ts
backend/src/services/marketplace/admin.service.ts
backend/src/services/tracking/tracking.service.ts
packages/types/admin.ts
packages/api/mappers.ts
packages/api/trackingApi.ts
packages/ui/ProfileAvatar.tsx
apps/admin/pages/TechniciansPage.tsx
apps/admin/pages/JobsPage.tsx
apps/admin/pages/TrackingPage.tsx
ADMIN_WORKFORCE_AND_TRACKING_AUDIT.md                      (this file)
```

---

## Components reused

`ProfileAvatar`, `LazyImage`, `TrackingMap`, `DataTable`, `ClickableRow`, `Dialog`, `StatusBadge`, `TrustGauge`, `LevelBadge`, `OverflowMenu`, `PageHeader`, `Surface`, `AsyncStateView`, `adminApi`, `trackingApi`, `mapAdminJob`, `resolveMediaUrl` / `hasProfilePhoto`.

---

## Regression results (verification checklist)

| Check | Result |
|---|---|
| Technician photos render when URL valid | Pass (LazyImage path) |
| Placeholder initials when missing/broken | Pass |
| Workforce rows responsive (card ↔ table) | Pass |
| `publicJobReference` generated / backfilled | Pass (create + admin list) |
| Mongo `_id` unchanged | Pass |
| Job search accepts ObjectId and Job Reference | Pass (admin + actor list) |
| Job details expanded with ops sections | Pass |
| Live tracking cards open focused workspace | Pass |
| Tracking rows expandable (drawer) | Pass |
| Google Maps when key present | Pass (existing TrackingMap) |
| No intentional rewrite of payments/escrow/chat modules | Pass (deep-links only) |

**Note:** Cancel / Refund / Escalate / Generate report are operational entry points into existing admin modules (jobs list, payments, audit, reports), not new destructive APIs. Full server-side cancel/refund from this drawer remains owned by those modules.

---

## Production readiness verdict

**Ready for staged rollout** with the dual-ID model in place.

**Required ops config:** set `VITE_GOOGLE_MAPS_API_KEY` for live Google Maps (fallback panel works without it).

**Follow-ups (non-blocking):**

1. Surface `publicJobReference` on customer/technician job cards, invoices, receipts, and push copy (same field — display only).
2. Optional dedicated `/admin/jobs/:id` route if drawer depth becomes insufficient.
3. Battery / signal quality when device telemetry is available on tracking pings (schema not present today).
4. Ensure Cloudinary/CDN upload paths continue to persist absolute HTTPS URLs into `photoUrl` / `profileImageUrl`.

**Verdict:** Production-ready for Admin Command Center workforce, jobs, and tracking usability — Mongo internals preserved; public references are the visible contract for humans.
