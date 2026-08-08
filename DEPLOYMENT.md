# FixNow Deployment Guide

Covers environment separation, build, run, health probes, backups, and recovery for the FixNow platform (API + SPA portals).

---

## 1. Topology

```
Browser (customer / technician / admin SPA)
  → CDN or nginx (static dist/)
  → FixNow API (Node 20+, Express + Socket.IO)
      → MongoDB (replica set required in production)
      → Providers: email (Resend/SMTP), SMS, FCM push, payment gateways
```

Single SPA build serves all three portals by route (`/customer`, `/technician`, `/admin`). Each portal is a separate JS chunk (lazy-loaded).

---

## 2. Environments

| Environment | NODE_ENV | Mongo | Providers | OTP in API |
|-------------|----------|-------|-----------|------------|
| Development | `development` | local single node | `console` | exposed (dev only) |
| Staging | `production` | replica set | real, test keys | never |
| Production | `production` | replica set | real, live keys | never |

Production startup **fails fast** (`backend/src/config/env.ts`) if:

- `AUTH_EXPOSE_OTP=true`
- `EMAIL_PROVIDER=console`
- `PAYMENTS_LIVE=true` without `PAYMENT_WEBHOOK_SECRET` (min 16 chars)
- JWT secrets still contain placeholder text
- `CORS_ORIGINS` empty or containing localhost
- FCM enabled without Firebase credentials

---

## 3. Backend deploy

```bash
cd backend
npm ci
npm run build          # tsc → dist/
NODE_ENV=production node dist/server.js
```

Required env (see `backend/.env.example` for the full list):

```
NODE_ENV=production
PORT=4000
API_PREFIX=/api/v1
MONGODB_URI=mongodb+srv://user:pass@cluster/FixNow?retryWrites=true&w=majority
JWT_ACCESS_SECRET=<32+ random chars>
JWT_REFRESH_SECRET=<32+ random chars, different>
CORS_ORIGINS=https://app.fixnow.example,https://admin.fixnow.example
EMAIL_PROVIDER=resend
RESEND_API_KEY=...
EMAIL_FROM=FixNow <noreply@fixnow.example>
PUSH_PROVIDER=fcm
FCM_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_JSON={...}
PAYMENT_DEFAULT_PROVIDER=mtn
PAYMENTS_LIVE=true
PAYMENT_WEBHOOK_SECRET=<32+ random chars>
COOKIE_SECURE=true
```

Secrets come from the platform secret store (never committed). Rotate JWT secrets by bumping them and forcing re-login (`refreshTokenVersion` invalidates sessions).

### Probes

| Path | Purpose | Behavior |
|------|---------|----------|
| `/livez` | Kubernetes liveness | 200 while the process is alive (never checks Mongo) |
| `/readyz` | Readiness / load-balancer | 503 when Mongo is not connected |
| `/health` | Ops dashboards | detailed status (`ok` / `degraded`) |
| `/version` | Build identification | name, version, API prefix |

Probes are excluded from the API rate limiter.

Example:

```yaml
livenessProbe:  { httpGet: { path: /livez,  port: 4000 }, periodSeconds: 10 }
readinessProbe: { httpGet: { path: /readyz, port: 4000 }, periodSeconds: 5 }
```

### Scaling notes

- Interval workers (push retry, escrow auto-release) use a Mongo **job lease** (`backend/src/jobs/lease.ts`), so running N replicas will not double-fire.
- Rate limiting is in-memory per instance. For strict global limits behind multiple replicas, move to a Redis store.
- Socket.IO with multiple replicas needs sticky sessions **or** a Socket.IO Redis adapter.

---

## 4. Frontend deploy

```bash
npm ci
npm run build          # tsc -b && vite build → dist/
```

`VITE_*` values are baked at build time:

```
VITE_API_URL=https://api.fixnow.example/api/v1
VITE_SOCKET_URL=https://api.fixnow.example
```

Serve `dist/` with SPA fallback to `index.html`.

nginx example:

```nginx
location / {
  try_files $uri /index.html;
  add_header Cache-Control "no-cache" always;
}
location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

Recommended response headers at the edge:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.fixnow.example wss://api.fixnow.example; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'
```

PWA: `public/manifest.webmanifest` + `public/sw.js` (registered in production only). The service worker caches the app shell and never caches `/api` or `/socket.io`.

---

## 5. Database

Production requires a **replica set** (transactions + change reliability). `backend/src/utils/transaction.ts` degrades gracefully on standalone Mongo, but monetary flows should run with transactions available.

Index creation is model-driven (Mongoose). Verify after deploy:

```js
db.jobs.getIndexes()
db.users.getIndexes()
db.paymenttransactions.getIndexes()
db.refreshtokens.getIndexes()
```

Seed data is development-only. Never run seeds against production.

---

## 6. Backups & recovery

### Backup strategy

| Asset | Method | Frequency | Retention |
|-------|--------|-----------|-----------|
| MongoDB | Atlas continuous backup (or `mongodump`) | continuous / daily | 30 days (7 daily + 4 weekly) |
| Uploads (`backend/uploads`) | object-storage sync or volume snapshot | daily | 30 days |
| Secrets/env | secret manager versioning | on change | last 10 versions |

Manual dump/restore:

```bash
mongodump  --uri "$MONGODB_URI" --archive=fixnow-$(date +%F).gz --gzip
mongorestore --uri "$MONGODB_URI_TARGET" --archive=fixnow-2026-07-24.gz --gzip --drop
```

### Restore drill (quarterly)

1. Provision an empty staging cluster.
2. Restore the latest archive into it.
3. Point a staging API at it (`NODE_ENV=production`, staging CORS/secrets).
4. Verify: login, job create → accept → complete, payment + escrow release, reviews, admin dashboard.
5. Record restore duration → feeds RTO.

### Disaster recovery targets

| Metric | Target |
|--------|--------|
| RPO | ≤ 15 min (continuous backup) / ≤ 24 h (daily dumps) |
| RTO | ≤ 2 h (restore + redeploy) |

Recovery order: MongoDB → API (verify `/readyz`) → frontend → providers/webhooks re-verified.

Escalation: if payment webhooks were missed during downtime, replay them from the provider dashboard; payment writes are idempotent by `reference` / `idempotencyKey`.

---

## 7. Release checklist

- [ ] `npm ci` clean on backend and frontend (lockfiles committed)
- [ ] `npm run build` green in both
- [ ] `npm run typecheck` and `npm run lint` green
- [ ] Production env vars set; startup guards pass
- [ ] Mongo replica set reachable; indexes present
- [ ] `/livez`, `/readyz`, `/version` verified post-deploy
- [ ] Payment webhook secret configured and a signed test event accepted
- [ ] Rollback plan: previous image tag + last known-good build artifact
