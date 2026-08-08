# Realtime State Synchronization Audit

**Date:** 2026-07-28

---

## Current architecture

- **Transport:** Socket.IO (`backend/src/sockets/*`), JWT rooms `user:`, `role:`, `job:`, `conversation:`.
- **Client:** `SocketProvider` + `useRealtimeReload` (debounced REST reload) — **no React Query**.
- **Cache:** `useAsync` stale-while-revalidate + `fixnow:resync` on resume/online.
- **Source of truth:** REST after event — not optimistic full payload patching.

---

## Refresh-dependent workflows (before → after)

| Area | Before | After / status |
|------|--------|----------------|
| Customer Home offers/marketing/techs | Manual / pull | `useRealtimeReload` on `content:updated`, metrics, categories |
| Infinite lists | Missed `fixnow:resync` | `useInfiniteList` listens to `fixnow:resync` |
| Jobs / apps / payments / tracking / chat | Already wired | Unchanged |
| Admin marketing pages | Often manual | Still gap — prefer attaching `CONTENT_UPDATED` |
| Tech JobDetails / portfolio / community | Often manual | Documented gap |

---

## Real-time event map

Canonical list in `packages/api/socketEvents.ts` / `backend/src/sockets/events.ts` — jobs, applications, payments, escrow, tracking, messaging, categories, content, dashboard metrics, trust/reviews.

---

## Socket architecture

Reuse existing rooms and emit helpers in `realtime.ts` / `messaging.ts`. Connection recovery window ~2 minutes. Heartbeats via client.

---

## Cache strategy

Invalidate by **reload of affected `useAsync` loaders** only. Avoid full page reloads. Offline queue + `initAutoResync` retained.

---

## State synchronization improvements

1. Home marketing/offers auto-refresh.  
2. Infinite list resync parity with `useAsync`.  
3. Admin **Realtime diagnostics** page for operators.  
4. Remaining pages: attach `useRealtimeReload` to verification, marketing queues, JobDetails (tracked as follow-up).

---

## Performance impact

No new polling loops. Debounced reload (~250ms) unchanged. Diagnostics page samples every 4s while open only.

---

## Regression testing

| Scenario | Expect |
|----------|--------|
| Publish CMS/content | Customer home marketing refreshes |
| Resume app offline→online | Lists + infinite lists reload |
| Dual tabs same user | Room fan-out updates both |
| Disconnect | UI shows reconnecting via existing status |

---

## Production readiness assessment

**Core marketplace realtime: production-ready.**  
**Full portal coverage: partial** — marketing/admin specialty pages still need event wiring. Prefer sockets over polling; do not introduce React Query unless migrating deliberately.
