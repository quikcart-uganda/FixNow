# FRONTEND DEV SERVER ROOT CAUSE REPORT

**Date:** 2026-07-28  
**Symptom:** `http://localhost:5173` and `http://172.20.10.4:5173` → `ERR_CONNECTION_REFUSED`  
**Status:** Restored. Vite is serving localhost + LAN; Customer / Technician / Admin path portals respond.

---

## 1. Exact root cause

Two stacked failure modes produced the outage. Neither was a Guest Mode / Google Sign-In React crash.

### Primary (true `ERR_CONNECTION_REFUSED`)

**Vite was not running.** Nothing was listening on port 5173.

Evidence at diagnosis start:

| Check | Result |
|---|---|
| Port 5173 / 5174 / 5175 | **Free** |
| Port 4000 (API) | **Free** |
| `node.exe` processes | **None** |
| `http://127.0.0.1:5173/` | Unable to connect |
| `http://127.0.0.1:4000/api/v1/health` | Unable to connect |

`ERR_CONNECTION_REFUSED` means TCP rejected the connection because no process owned the port. The frontend was simply down.

### Secondary (Vite “looks up” but browsers hang / appear dead)

When Vite **was** started after recent `vite.config.ts` changes, it:

1. Printed `ready` and bound `0.0.0.0:5173` / `[::]:5173`
2. Triggered **dependency re-optimization** (`Re-optimizing dependencies because vite config has changed`)
3. With Vite’s default `optimizeDeps.holdUntilCrawlEnd: true`, **held HTTP requests** while scanning/bundling deps
4. Scan alone took ~4 minutes in this monorepo; HTML requests timed out even though the port was listening

That state is easy to misread as “Vite is running but refusing connections”: the process exists, the port is open, TCP connects, but HTTP never completes → browsers show failures / timeouts. Android devices hitting the LAN IP hit the same wall.

Contributing factors:

- Monorepo noise: ~**10,088** `backend/` files + ~**1,496** `android/` files on the same machine as Vite.
- Uncommitted `vite.config.ts` growth (`@fixnow/native`, `@fixnow/assets`, `base: './'`, `manualChunks`) invalidated the dep cache and forced cold re-optimize.
- There are **no separate Customer / Technician / Admin Vite servers**. One SPA serves all three path portals. UI/process lists that look like “four frontends + backend” were misleading; at audit time **even the backend was down**.

### Ruled out

| Hypothesis | Verdict |
|---|---|
| Guest Mode / Google Sign-In crash on mount | **No** — `AuthProvider.tsx` transforms `200`; Google button modules load; routes serve HTML |
| Router infinite redirect / invalid portal imports | **No** — `/`, `/customer`, `/technician`, `/admin`, `/select-role` all HTTP `200` |
| Port stolen by another app | **No** — ports were free when refused |
| Firewall/VPN blocking only LAN | **No** — localhost was also refused (primary); after restore LAN `172.20.10.4:5173` returned `200` |
| Auth/Google/Guest change as the process killer | **No causal link** — regression coincided with config/cache churn and stopped Vite processes, not a startup exception in those features |

---

## 2. Files responsible

| File | Role |
|---|---|
| `vite.config.ts` | Server bind + (previously missing) cold-start safeguards |
| `package.json` | `"dev": "vite"` alone gave no readiness check / no portal script clarity |
| `scripts/dev-frontend.mjs` | **New** launcher: starts Vite, aborts hung probes, validates HTTP `200`, prints LAN URLs |
| `src/main.tsx` | Already had `BootFailure` / startup catch (app-level; not the connection-refused cause) |
| `src/App.tsx` | Single SPA router for `/customer/*`, `/technician/*`, `/admin/*` |

Not root-cause files (present and healthy for this incident):

- `packages/hooks/AuthProvider.tsx` (incl. `loginWithGoogle`)
- `packages/shared/auth/ContinueWithGoogleButton.tsx`
- Guest header / AI guest paths under `packages/shared/header/*`, `AiAssistantPanel.tsx`

---

## 3. Why localhost stopped responding

1. No Vite process → nothing on `5173` → **connection refused**.
2. After a start, cold dep optimize + `holdUntilCrawlEnd: true` → port listens, TCP succeeds, **HTTP stalls for minutes** → timeouts that feel like “site down”.
3. Config-change restarts during the audit also hung Vite mid-restart (`vite.config.ts changed, restarting server…` with no subsequent ready) until the process was replaced.

---

## 4. Why Android could not connect

Android (Capacitor / device browser) uses the **LAN URL** (`http://172.20.10.4:5173`), not `localhost`.

- With Vite stopped: same refused connection as desktop.
- With Vite stuck in dep hold: device could open TCP to the phone’s Wi‑Fi IP but get no timely HTTP body.
- Vite already used `server.host: true` (correct for LAN). The failure was process/availability, not a missing `host` flag.

---

## 5. Why Vite appeared to be running while refusing connections

| Illusion | Reality |
|---|---|
| “Customer / Technician / Admin processes running” | One SPA; no per-portal Vite scripts existed before this fix |
| “Vite ready” banner / IDE terminal still open | Process may have exited later, or was hung after printing ready |
| Port listening (`LISTENING` on 5173) | Listening ≠ serving; default hold-until-crawl blocked responses |
| Backend still “up” in someone’s mental model | Port 4000 was also free at diagnosis |

TCP probe during the hang: **connect OK**, HTTP response delayed/missing → classic “zombie listener” UX.

---

## 6. Fixes implemented

### `vite.config.ts`

- `server.host: true`, `port: 5173`, **`strictPort: true`**
- `optimizeDeps.holdUntilCrawlEnd: false` — serve HTML/JS immediately on cold start
- Explicit `optimizeDeps.entries` + `include` for React/router/axios/socket
- `server.watch.ignored` for `android/**`, `ios/**`, `backend/**`, `dist/**`, `.git/**`
- `hmr.protocol: 'ws'` for LAN HMR
- `preview.host/port/strictPort` aligned

### `scripts/dev-frontend.mjs` (new)

- Spawns Vite
- Probes `http://127.0.0.1:5173/` with **per-request AbortController** (prevents forever-hung `fetch`)
- Prints a clear Local/Network/Customer/Technician/Admin banner only after HTTP success
- If port occupied but not serving → exit with clear error
- If Vite exits → logs unexpected exit (no silent death)

### `package.json`

- `"dev": "node scripts/dev-frontend.mjs"`
- `"dev:vite": "vite"` (raw escape hatch)
- `"customer" | "technician" | "admin" | "mobile"` → same launcher (documents single SPA)
- `"preview"` → `--host --port 4173 --strictPort`

### App startup (already present; kept)

- `src/main.tsx` catches startup failures, logs `[FixNow] Startup failed`, renders `BootFailure` without tearing down Vite.

---

## 7. Validation evidence

Vite process after recovery:

```
VITE v8.1.5  ready in 710 ms
➜  Local:   http://localhost:5173/
➜  Network: http://172.20.10.4:5173/
```

HTTP checks (representative):

| URL | Result |
|---|---|
| `http://127.0.0.1:5173/` | **200** (~5s first hit, then fast) |
| `http://127.0.0.1:5173/customer` | **200** |
| `http://127.0.0.1:5173/technician` | **200** |
| `http://127.0.0.1:5173/admin` | **200** |
| `http://127.0.0.1:5173/select-role` | **200** |
| `http://172.20.10.4:5173/` | **200** |
| `http://127.0.0.1:5173/src/main.tsx` | **200** |
| `http://127.0.0.1:5173/src/App.tsx` | **200** |
| `http://127.0.0.1:5173/packages/hooks/AuthProvider.tsx` | **200** |
| Static `/favicon.svg`, `/brand/fixnow-mark.svg` | **200** |

HMR: Vite log showed ongoing `hmr update` events while the server stayed alive.

Typecheck: `npm run typecheck` reported one existing unused-local warning in `apps/customer/pages/RegisterPage.tsx` at one point during the audit; Guest/Google modules themselves transform and are wired (`ContinueWithGoogleButton`, `guestMode` header/AI paths). That TS unused-local is **not** what took the dev server offline.

---

## 8. Recurrence prevention

1. Prefer `npm run dev` (launcher) over raw IDE “ghost” terminals that may have already exited.
2. Remember: **one Vite** serves Customer + Technician + Admin. Backend is a separate process (`backend` on `:4000`).
3. After editing `vite.config.ts`, expect a one-time re-optimize; with `holdUntilCrawlEnd: false` the page should still load.
4. If `ERR_CONNECTION_REFUSED` returns: check `netstat`/listeners on `5173` before assuming auth/router bugs.
5. For Android LAN: keep `VITE_DEV_LAN_HOST=172.20.10.4` (or current Wi‑Fi IP) when building the native shell against the dev server; Vite must actually be running and reachable on that IP.
6. Avoid watching/crawling `backend/` and `android/` from the frontend Vite process (now ignored).

---

## 9. Operator checklist (healthy env)

```bash
npm run dev
# expect banner: FixNow frontend is reachable
# Local http://localhost:5173/
# Network http://<LAN-IP>:5173/
```

Then open:

- `/` landing  
- `/customer`  
- `/technician`  
- `/admin`  
- Guest browse + Google button render on login/register  
- Phone on same Wi‑Fi → `http://<LAN-IP>:5173/`  

Backend (separate): start the API so auth/Google/guest APIs work; frontend serving does not require it, but product flows do.
