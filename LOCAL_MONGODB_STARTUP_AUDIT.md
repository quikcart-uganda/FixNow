# Local MongoDB Startup Audit

**Date:** 2026-07-28  
**Scope:** FixNow backend bootstrap + local MongoDB recovery  
**Policy:** Development uses **local** MongoDB (`127.0.0.1:27017`). Atlas was not introduced.

---

## Root cause

| Finding | Detail |
|---------|--------|
| URI source | `backend/.env` → `MONGODB_URI=mongodb://127.0.0.1:27017/FixNow` |
| Code fallback? | **No.** `env.ts` requires `MONGODB_URI` via Zod; `database.ts` has no localhost default |
| Why `127.0.0.1:27017` | That is the **configured** development URI (matches `.env.development.example`) |
| Why `ECONNREFUSED` | At failure time, nothing was accepting TCP on `127.0.0.1:27017` (mongod not reachable) |
| Current state | Windows service `MongoDB` is **Running**; port **27017** listens on `127.0.0.1`; backend connects |

Localhost was **expected**, not a mis-resolution of a remote/Atlas URI.

---

## Environment audit

| Mechanism | Used? | Notes |
|-----------|-------|-------|
| `dotenv.config()` | Yes | `backend/src/config/env.ts` — loads `.env` from **process cwd** |
| `backend/.env` | **Active** | Contains local `MONGODB_URI` |
| `.env.local` | Not loaded | File absent; backend does not load Vite-style variants |
| `.env.development` | Not loaded | Only `.env.development.example` exists |
| `.env.production` | Not loaded | Only example template |
| Render / host env | Supported | Pre-set `process.env` wins (dotenv does not override) |

**Variable used:** `MONGODB_URI` only.  
**Not used:** `DATABASE_URL`, `MONGO_URI`.

---

## Startup sequence

```
npm run dev  (cwd = backend/)
  → tsx watch src/server.ts
  → import env.ts → dotenv.config() → Zod parse process.env
  → bootstrap()
       → initMonitoring()
       → assertPortAvailable(PORT, HOST)
       → connectDatabase()
            → mongoose.connect(env.MONGODB_URI, { dbName: 'FixNow', serverSelectionTimeoutMS: 10000 })
       → seed CMS / content-block defaults
       → createApp() + listen(HOST:PORT)
```

`database.ts` always forces `dbName: 'FixNow'`.

---

## MongoDB installation & service status

| Check | Result |
|-------|--------|
| `mongod` / `mongosh` on PATH | **Not found** |
| Windows service | `MongoDB` — **Running**, StartType **Automatic** |
| Process | `mongod` PID matched listener |
| Port 27017 | `127.0.0.1:27017` **Listen** |
| `Test-NetConnection 127.0.0.1:27017` | **TcpTestSucceeded: True** |

Phase 3 action: **none required** — service already running; no reinstall.

---

## Commands executed (user-approved / continue-all)

1. `Get-Command mongod, mongo, mongosh -ErrorAction SilentlyContinue | Format-Table Name, Source -AutoSize`  
   → empty (binaries not on PATH)

2. `Get-Service -Name "*mongo*" ...`  
   → `MongoDB` Running / Automatic

3. Port / process / TCP probe on `27017`  
   → listening on `127.0.0.1`, `TcpTestSucceeded: True`

4. Node mongoose probe (URI host redacted in logs)  
   → `db FixNow`, **94** collections, `ping ok`, `CONNECT_OK`

5. `npm run dev` in `backend/`  
   → MongoDB connected; listening `0.0.0.0:4000`

6. Health probes  
   → `/health`, `/readyz`, `/livez` all success; `mongodb: connected`

---

## Duplicate index fixes

### Warnings addressed

| Field | Model | Cause | Fix |
|-------|-------|-------|-----|
| `publicJobReference` | `Job` (`marketplace/Job.ts`) | Path option `sparse: true` **and** `jobSchema.index({ publicJobReference: 1 }, { unique: true, sparse: true })` | Removed path-level `sparse`; kept unique+sparse `schema.index` |
| `referredUserId` | `Referral` (`growth/Growth.ts`) | Path `index: true` **and** `referralSchema.index({ referredUserId: 1 }, { sparse: true })` | Removed path `index: true`; kept sparse `schema.index` |

### Verification

Backend startup log after fix showed **no** `Duplicate schema index` warnings for these fields.

---

## Startup hardening

Updated `backend/src/config/database.ts`:

- Reject empty `MONGODB_URI` with a clear message
- On connect failure, log actionable diagnostics (service status, port, `.env` URI alignment)
- Re-throw a readable `Error` (with cause) instead of only a raw stack dump

Local development configuration is preserved (still uses `backend/.env` local URI).

---

## Bootstrap verification

| Check | Status |
|-------|--------|
| MongoDB connected | ✓ `mongodb://127.0.0.1:27017/FixNow` |
| Database name | ✓ `FixNow` |
| Collections accessible | ✓ 94 collections |
| Indexes / no duplicate warnings | ✓ |
| Backend listening | ✓ `0.0.0.0:4000` |
| `/health` | ✓ `status: ok`, `mongodb: connected` |
| `/readyz` | ✓ `status: ready`, `mongodb: connected` |
| `/livez` | ✓ `status: ok` |

### Sample health payload

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "FixNow API",
    "env": "development",
    "mongodb": "connected"
  }
}
```

---

## Final startup status

**PASS** — Local MongoDB is running and reachable; FixNow backend boots, connects to `FixNow`, and serves health endpoints without duplicate-index warnings.

### If `ECONNREFUSED` returns

```powershell
Get-Service MongoDB
Start-Service MongoDB
Get-NetTCPConnection -LocalPort 27017 -State Listen
```

Confirm `backend/.env` still has:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/FixNow
```

Then from `backend/`:

```powershell
npm run dev
```
