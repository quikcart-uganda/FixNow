# FixNow Backend Architecture

Production-ready foundation for the FixNow platform. One Express API and one MongoDB database serve the Customer, Technician, and Admin clients.

**Scope of this foundation:** project structure, security middleware, models, route contracts, Socket.IO bootstrap, and operational endpoints. Domain business logic is intentionally **not** implemented yet — service methods return `501 NOT_IMPLEMENTED` so clients never receive fake data.

---

## Goals

| Goal | How it is met |
|------|----------------|
| Single platform backend | One `backend/` package; shared `User` + role-specific profiles |
| Frontend independence | No imports from `apps/` or `packages/`; CORS allow-list only |
| Production posture | Helmet, CORS, rate limits, JWT, compression, request IDs, structured errors |
| Scalable modules | Layered: routes → controllers → services → repositories → models |
| Real contracts, no mocks | OpenAPI-shaped routes exist; handlers refuse fake success responses |
| Local MongoDB | `MONGODB_URI=mongodb://127.0.0.1:27017/fixnow` |

---

## Directory layout

```
backend/
├── package.json              # Scripts: dev, build, start, typecheck
├── tsconfig.json             # Strict TypeScript → dist/
├── .env.example              # Documented environment template
├── .env                      # Local defaults (not for production secrets)
├── BACKEND_ARCHITECTURE.md   # This document
├── README.md
├── uploads/                  # Runtime Multer destination (gitignored contents)
└── src/
    ├── server.ts             # Process entry: DB → HTTP → Socket.IO → jobs
    ├── app.ts                # Express app factory (no listen)
    ├── config/
    │   ├── env.ts            # Zod-validated environment
    │   ├── database.ts       # Mongoose connect / disconnect
    │   ├── cors.ts           # CORS options from env
    │   └── logger.ts         # Console logger + Morgan stream
    ├── constants/
    │   ├── roles.ts          # UserRole enum
    │   ├── status.ts         # Job / application / verification statuses
    │   └── errorCodes.ts     # Stable API error codes
    ├── types/
    │   ├── express.d.ts      # Augments Request with user / requestId
    │   └── api.ts            # ApiSuccess / ApiError shapes
    ├── models/               # Mongoose schemas (data contracts)
    │   ├── user/
    │   ├── job/
    │   ├── messaging/
    │   ├── marketplace/
    │   └── platform/
    ├── repositories/         # Data-access wrappers (no HTTP)
    ├── services/             # Domain orchestration (stubs → 501)
    ├── controllers/          # HTTP adapters
    ├── routes/               # /api/v1 route registration
    ├── middleware/           # Auth, validation, errors, uploads, rate limits
    ├── validators/           # Zod request schemas
    ├── sockets/              # Socket.IO auth + namespaces
    ├── jobs/                 # Background job registry (cron-ready hooks)
    ├── utils/                # AppError, JWT, password, responses
    └── uploads/              # Reserved for upload helpers (disk root is ../uploads)
```

---

## Layer responsibilities

```
Client (apps/customer|technician|admin)
        │  HTTPS / WSS
        ▼
┌───────────────────┐
│  routes + middleware │  Auth, rate limit, Zod validate, Multer
└─────────┬─────────┘
          ▼
┌───────────────────┐
│    controllers     │  Map req/res; no business rules
└─────────┬─────────┘
          ▼
┌───────────────────┐
│     services       │  Use-cases, transactions, events (TO IMPLEMENT)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│   repositories     │  Mongoose queries, pagination helpers
└─────────┬─────────┘
          ▼
┌───────────────────┐
│      models        │  Schema + indexes (single MongoDB)
└───────────────────┘
```

**Why this split**

- Controllers stay thin and testable.
- Services own transactions (e.g. accept application → update job → notify).
- Repositories isolate query details so services stay readable.
- Models define the shared truth for all three apps.

---

## HTTP surface

Base path: **`/api/v1`**

| Area | Prefix | Notes |
|------|--------|--------|
| Auth | `/auth` | register, login, refresh, logout, me, password reset |
| Customers | `/customers` | profile CRUD + nested addresses |
| Technicians | `/technicians` | profile, search, skills, availability |
| Admins | `/admins` | admin profile, user moderation |
| Jobs | `/jobs` | lifecycle + nested applications |
| Applications | `/applications` | technician-owned application views |
| Messages | `/conversations` | threads + messages |
| Notifications | `/notifications` | list / read / read-all |
| Reviews & ratings | `/reviews` | create / list / moderate |
| Trust scores | `/trust-scores` | read reputation aggregates |
| Portfolio | `/portfolio` | technician work samples |
| Categories | `/categories` | service taxonomy |
| Verification | `/verifications` | KYC / document review |
| Referrals | `/referrals` | codes + attribution |
| Achievements | `/achievements` | badges / unlocks |
| Uploads | `/uploads` | Multer single-file pipeline |
| Settings | `/settings` | user + platform settings |
| Analytics | `/analytics` | admin metrics |
| Reports | `/reports` | moderated content reports |
| Audit logs | `/audit-logs` | immutable admin trail |
| Subscriptions | `/subscriptions` | **future** plans / checkout |
| Escrow | `/escrow` | **future** hold / release / dispute |
| Marketplace | `/marketplace` | **future** listings / orders |

Operational (outside `/api/v1`):

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness + Mongo readyState |
| `GET /version` | name, version, env, apiVersion |

All domain routes currently end in **`501`** with `code: NOT_IMPLEMENTED` once validation/auth middleware pass. That is intentional.

---

## Authentication & authorization

1. **JWT access token** (Bearer) — short-lived; payload: `sub`, `role`, `email`.
2. **Refresh token** — longer-lived; hashed and stored on `User.refreshTokenHash`.
3. **`authenticate`** middleware attaches `req.user`.
4. **`authorize(...roles)`** enforces Customer / Technician / Admin boundaries.
5. Socket.IO handshake reuses the same JWT (`auth.token` or `Authorization`).

Password hashing helpers (`bcrypt`) live in `utils/password.ts` for future auth service use.

---

## Real-time (Socket.IO)

| Namespace | Intent |
|-----------|--------|
| `/` (default) | Presence / connection health |
| `/messages` | Conversation rooms (`conversation:{id}`) |
| `/notifications` | Per-user notification push |
| `/jobs` | Job status broadcasts (`job:{id}`) |

Server bootstrap: `attachSockets(httpServer)` after `createServer(app)`.

---

## Data model overview (single database)

```
User (auth identity, role)
 ├── CustomerProfile
 ├── TechnicianProfile  → PortfolioItem, TrustScore, Verification
 └── AdminProfile

Job ←── Application (technician bid)
Conversation ←── Message
Notification
Review (ratings embedded)
Category
Referral / Achievement
AuditLog / PlatformSettings / UserSettings
Upload
Subscription (future) / EscrowHold (future) / MarketplaceListing (future)
```

Geo fields use GeoJSON `Point` for customer defaults and technician location.

---

## Cross-cutting concerns

| Concern | Implementation |
|---------|----------------|
| Config | Zod `env` — fail fast on boot |
| Errors | `AppError` + central `errorHandler` |
| Validation | Zod via `validate({ body, query, params })` |
| Logging | Morgan + `logger` + `X-Request-Id` |
| Security | Helmet, CORS, rate limit, sanitized 500s in production |
| Uploads | Multer disk storage, MIME allow-list, size cap |
| Compression | `compression()` middleware |
| Cookies | `cookie-parser` for future httpOnly refresh cookies |

---

## Background jobs (`src/jobs`)

Registry only — no schedules run until business logic lands:

- Trust score recalculation
- Notification digests
- Escrow auto-release
- Subscription renewals

Wire a scheduler (node-cron / BullMQ) when implementing those services.

---

## Environment

See `.env.example`. Critical variables:

- `PORT` (default `4000`)
- `MONGODB_URI`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `CORS_ORIGINS` (Vite apps on 5173–5175 by default)
- `UPLOAD_DIR`, `UPLOAD_MAX_BYTES`

---

## Scripts

```bash
cd backend
npm install
npm run typecheck
npm run build
npm run dev      # tsx watch
npm start        # node dist/server.js
```

**Prerequisite:** MongoDB listening at `MONGODB_URI`.

---

## What is explicitly out of scope (this phase)

- Business rules (matching, bidding, payouts, trust formulas)
- Connecting Vite apps or `packages/api`
- Fake success payloads / in-memory stores
- Production deployment (Docker/K8s) — structure is ready for it

---

## Implementation order (recommended next)

1. Auth service (register/login/refresh) + real `/auth/me`
2. Customer / Technician profile CRUD
3. Job create + application flow
4. Messages + Socket.IO emit on persist
5. Reviews → trust score job
6. Admin moderation + audit log writes
7. Subscriptions / escrow when product-ready

---

## Design decisions summary

1. **One User, many profiles** — avoids duplicate auth tables per app.
2. **API versioning (`/api/v1`)** — safe evolution without breaking clients.
3. **501 not 200 stubs** — prevents frontend from coding against lies.
4. **Repositories early** — keeps future complex queries out of services.
5. **Zod everywhere** — runtime safety matching TypeScript types.
6. **Socket namespaces by domain** — scales better than one mega-handler.
7. **Future modules as first-class routes** — subscriptions/escrow/marketplace already reserved.
