# FixNow Realtime Architecture

Production Socket.IO synchronization for Customer, Technician, and Admin portals.  
This layer does **not** change authentication, JWT issuance, RBAC rules, MongoDB schemas, marketplace business rules, or REST contracts. Emits are post-success side effects only.

## Overview

```
Marketplace / auth controller (after successful mutation)
                    │
                    ▼
         sockets/realtime.ts  (targeted rooms)
                    │
                    ▼
         Socket.IO (/socket.io) + Engine.IO heartbeats
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 Customer      Technician        Admin
     │
     ▼
 useRealtimeReload → REST reload / refreshProfile (debounced)
```

## JWT socket authentication

Every connection must present an access token:

- `handshake.auth.token`, or
- `Authorization: Bearer <token>`

Server checks (aligned with HTTP session validity, without changing auth services):

1. Token verifies via existing `verifyAccessToken`
2. User exists and is not deleted
3. Account is not suspended
4. `payload.rv === user.refreshTokenVersion` (session invalidation)
5. Locked technicians **may** connect (so lock/job UI can update live)

Unauthorized clients are rejected and never join rooms.

## Room architecture

| Room | Who joins | Purpose |
|------|-----------|---------|
| `user:{userId}` | That user (auto) | Personal events |
| `role:customer` | Customers (auto) | Category updates |
| `role:technician` | Technicians (auto) | Feed: published/assigned jobs |
| `role:admin` | Admins (auto) | Metrics, presence, locks, registrations |
| `job:{jobId}` | Owner, assignee, or admin via `job:join` | Job-scoped application/status traffic |

`job:join` is authorized against Mongo ownership/assignment — strangers cannot subscribe.

## Event catalog

### Presence / connection

| Event | Audience | When |
|-------|----------|------|
| `connection:ready` | Connecting socket | After auth + room join |
| `user:online` | Admin + self | First socket for user connects |
| `user:offline` | Admin + self | Last socket for user disconnects |
| `heartbeat` / `heartbeat:ack` | Self | Client probe (~20s) + Engine.IO ping |

### Auth / growth

| Event | Audience | When |
|-------|----------|------|
| `user:registered` | Admin | After successful register (controller side-effect) |

### Jobs

| Event | Audience | When |
|-------|----------|------|
| `job:created` | Parties + admin (+ techs if posted) | Job create |
| `job:updated` | Parties (+ techs if posted) | Job edit |
| `job:published` | Technicians + parties + admin | Publish |
| `job:cancelled` | Parties + techs + admin | Status → cancelled |
| `job:assigned` | Parties + techs + admin | Assignment |
| `job:status_changed` | Parties + admin (+ techs when feed-relevant) | Any status transition |
| `job:completed` | Parties + admin | Status → completed |

### Applications

| Event | Audience | When |
|-------|----------|------|
| `application:submitted` | Customer, technician, job room, admin | Apply |
| `application:withdrawn` | Same | Withdraw |
| `application:accepted` | Same (+ tech role feed) | Accept / assign |
| `application:rejected` | Parties + admin | Reject |

### Technicians

| Event | Audience | When |
|-------|----------|------|
| `technician:assigned` | Parties + tech role + admin | Accept |
| `technician:availability_changed` | Technician + admin | Availability update |
| `technician:free_job_limit_updated` | Technician + admin | Free-job counter / override |
| `technician:locked` / `unlocked` | Technician + admin | Lock state changes |
| `trust:updated` | Technician + admin | Trust recompute |

### Admin / marketplace

| Event | Audience | When |
|-------|----------|------|
| `dashboard:metrics_updated` | Admin | Debounced (~400ms) after marketplace mutations |
| `marketplace:stats_updated` | Admin | Same payload as metrics (alias for dashboards) |
| `category:updated` | Customer + technician + admin | Category/subcategory CRUD |

## Performance

- **Targeted rooms only** — no global `io.emit` for domain events
- **Draft jobs** are not broadcast to all technicians
- **Admin metrics** coalesced with a 400ms debounce
- **Clients** debounce reloads (~250ms) via `useRealtimeReload`
- Prefer **REST refetch** on signal (source of truth) over mutating lists from payloads (avoids duplicates)

## Client lifecycle

1. `AuthProvider` authenticates
2. `SocketProvider` connects with access token
3. Auto-join role + user rooms on server
4. Pages subscribe with ref-stable handlers (no duplicate listeners)
5. Job detail pages call `job:join` / `job:leave`
6. Logout / hard 401 → `disconnectSocket()`
7. Browser `offline` / `online` + tab visibility refresh connection
8. Application heartbeat every 20s; Engine.IO pingInterval 25s / pingTimeout 20s
9. `ConnectionStatus` chip: Live / Connecting / Offline / No network / Reconnect

### Env

| Variable | Default |
|----------|---------|
| `VITE_API_URL` | `http://localhost:4000/api/v1` |
| `VITE_SOCKET_URL` | API host without `/api/v1` |

## Reconnection strategy

- Socket.IO client: infinite reconnect, backoff 0.8s → 8s
- Token refreshed into `socket.auth` periodically while logged in
- Connection state recovery window (2 minutes) on server
- Subscriptions re-bind when status returns to `connected`
- Job rooms re-joined by mounted page effects after reconnect

## Emit sources (side effects only)

- `job.service.ts` — jobs & applications
- `freeJob.service.ts` — free-job + lock signals
- `trust.service.ts` — trust updates
- `category.service.ts` — categories
- `technician.service.ts` — availability
- `authController.register` — `user:registered` (does not alter auth logic)

## Out of scope

- Chat / messaging product features
- Push notifications
- Payments / reviews
- Changing JWT, RBAC, schemas, or marketplace transitions

## Verification

```bash
# Frontend
npm install
npm run build

# Backend
cd backend && npm run build && npm start

# Realtime smoke (API must be running)
cd backend && node scripts/realtime-e2e.mjs
```

Manual checks:

1. Customer creates/publishes job → Technician feed updates live  
2. Technician applies → Customer applications update live  
3. Customer assigns → Technician active jobs update immediately  
4. Status changes → Customer, Technician, Admin refresh without reload  
5. Admin lock/unlock → Technician profile + admin locks update live  
6. Connection chip shows **Live** when authenticated  
