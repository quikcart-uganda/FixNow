# FixNow Realtime Location Tracking & Navigation Architecture

**Date:** 2026-07-25  
**Reference:** QuikCart (read-only) — session gating, throttle, status-first UX, external Navigate, privacy stop-on-terminal.  
**Constraint:** QuikCart was not modified. FixNow auth, jobs, sockets, Cap GPS, and Stitch UI preserved.

---

## Executive verdict

FixNow already had geo **foundations** (`GeoPoint`, job `technician_en_route`, Cap Geolocation, job rooms, `LiveTrackingSession` schema, `JobTrackingPage` status UI, `openNavigation`).  

**Missing:** live GPS stream, tracking APIs/sockets, ETA/distance, customer/tech map panel, admin monitoring.  

This delivery **extends** those foundations; it does not duplicate Maps/Auth/Jobs/Socket stacks.

---

## Existing features reused

| Existing | Reuse |
|----------|--------|
| `LiveTrackingSession` / `VisitVerification` models | Extended + activated |
| Job status `technician_en_route` → `in_progress` → `completed`/`cancelled` | Auto start/arrive/stop hooks |
| Socket.IO `job:{id}` rooms + `joinJob` | Tracking fan-out to participants |
| Push / `createDbNotification` | En route, nearby, arrived, paused/resumed |
| `@capacitor/geolocation` + `getCurrentPosition` | Adaptive watch publisher |
| `openNavigation()` | Technician Navigate CTA |
| `JobTrackingPage` / `AssignedJobPage` | Live panel integrated |
| Admin shell / Stitch UI | New Tracking module only |

---

## New components

### Backend
- `backend/src/services/tracking/tracking.service.ts`
- `backend/src/services/tracking/geo.util.ts` (haversine ETA/distance)
- Routes under `/jobs/:jobId/tracking/*` + `/admin/tracking`
- Socket events: `tracking:started|update|paused|resumed|arrived|completed|stopped`
- Job `transitionStatus` hooks for session lifecycle
- Retention purge in CMS maintenance job

### Frontend / native
- `packages/api/trackingApi.ts`
- `packages/native` `watchPositionAdaptive` (offline queue + move/stationary intervals)
- `packages/shared/tracking/{TrackingMap,LiveTrackingPanel,useTrackingPublisher}`
- Admin `TrackingPage`
- Customer + technician live panels
- Post-job geo write fix (`location.geo`)

---

## Tracking lifecycle

```
Customer posts job (optional GPS → Job.geo)
  → Technician assigned
  → Status → technician_en_route
       → trackingService.startForJob
       → technician watchPositionAdaptive → POST /tracking/location
       → sockets tracking:update → customer LiveTrackingPanel
  → Nearby (~120m) notification
  → Arrived (~60m or manual) → VisitVerification check-in
  → Status → in_progress (work) → tracking slows / arrived state
  → completed | cancelled → stop + trim history
```

---

## Socket events

| Event | When |
|-------|------|
| `tracking:started` | Session created / resumed |
| `tracking:update` | Accepted GPS ping |
| `tracking:paused` / `tracking:resumed` | Tech pause controls |
| `tracking:arrived` | Auto or manual arrival |
| `tracking:stopped` / `tracking:completed` | Terminal stop |

Emitted to `job:{id}`, customer user room, technician user room, admin room.

---

## API endpoints

Base: `/api/v1`

| Method | Path | Who |
|--------|------|-----|
| GET | `/jobs/:jobId/tracking` | Job participants |
| POST | `/jobs/:jobId/tracking/start` | Tech / admin |
| POST | `/jobs/:jobId/tracking/pause\|resume` | Tech / admin |
| POST | `/jobs/:jobId/tracking/location` | Tech / admin (throttled) |
| POST | `/jobs/:jobId/tracking/arrived` | Tech / admin |
| POST | `/jobs/:jobId/tracking/stop` | Participant |
| GET | `/admin/tracking` | Admin list + analytics |
| POST | `/admin/tracking/purge` | Admin retention cleanup |

---

## Database model (`LiveTrackingSession`)

Extended fields: `destinationGeo`, `destinationLabel`, `etaSeconds`, `distanceMeters`, `routePolyline`, `heading/speed/accuracy`, capped `history[]`, `retentionDays`, `arrivedAt`, `pausedAt`, `endReason`, statuses `active|paused|arrived|ended|cancelled`.

Privacy: history trimmed on complete/cancel; expired ended sessions purged after retention (default **7 days**, `TRACKING_RETENTION_DAYS`).

---

## Google Maps

- Interactive map when `VITE_GOOGLE_MAPS_API_KEY` is set (Maps JS loader).
- Without key: status-first fallback panel (ETA/distance/coords) — tracking still works.
- Directions/traffic: external Navigate via existing `openNavigation` (platform Maps apps).
- Server ETA: haversine + urban speed model (no hard dependency on Directions billing).

---

## Privacy & security

- Only job customer, assigned technician, or admin can read/write session.
- Tech-only location publish; customers cannot spoof pings.
- Audit logs on start/stop.
- Tracking auto-stops on complete/cancel.
- Server throttle (~4s min), stationary suppression, offline client queue.
- No unbounded history (max 120 points live; trimmed on end).

---

## Performance strategy

| Concern | Approach |
|---------|----------|
| Battery | Adaptive intervals (8s moving / 20s stationary) |
| Network | Throttle + skip tiny moves |
| Sockets | Emit only accepted pings to job rooms |
| Maps | Optional Maps JS; fallback panel otherwise |
| Storage | Cap history; purge ended sessions |

---

## Offline

- Publisher queues latest sample while offline; flushes on `online`.
- Customer panel keeps last known session until reconnect + socket reload.
- External Navigate still works with destination label when coords missing.

---

## Testing checklist

- [ ] Tech sets En Route → session starts → customer sees ETA panel  
- [ ] GPS permission denied → friendly publisher error, status still works  
- [ ] Pause / Resume updates customer via socket  
- [ ] Arrive auto or manual → notification + VisitVerification upsert  
- [ ] Complete / cancel stops session  
- [ ] Admin `/admin/tracking` lists live sessions + map preview  
- [ ] Without Maps key → fallback UI  
- [ ] With Maps key → markers + polyline  
- [ ] Android/iOS Cap GPS path via `watchPositionAdaptive`  
- [ ] Network loss → queued ping recovers  

---

## Files modified / added (summary)

**Added:** tracking service/utils, trackingApi, TrackingMap/LiveTrackingPanel/useTrackingPublisher, Admin TrackingPage, architecture doc  

**Modified:** Safety model, job.service (hooks + geo write), sockets events/realtime, routes/controllers/validators/jobs, AssignedJobPage, JobTrackingPage, PostJobPage, AdminRoutes/AdminShell, native watch helper, `.env.example`

---

## Regression analysis

| Area | Risk | Mitigation |
|------|------|------------|
| Job status transitions | Tracking hook failure | Wrapped in try/catch; non-fatal |
| Socket payload volume | Too many pings | Server + client throttle |
| Schema change on LiveTrackingSession | Existing empty collection | Additive fields with defaults |
| Maps key missing | Blank map | Explicit fallback panel |
| Marketing copy “live tracking” | Was false | Now wired on En Route |

---

## Design principles carried from QuikCart (architecture only)

1. Status always works; live GPS is additive  
2. Explicit session start gated on assignment / en route  
3. Throttle GPS posts aggressively  
4. External Navigate for true turn-by-turn  
5. Stop sharing on terminal job states  
6. Improve on QuikCart with Socket.IO fan-out + optional real map markers  
