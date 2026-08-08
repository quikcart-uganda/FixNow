# FixNow Production Deployment Validation Report

**Date:** 2026-08-08  
**Method:** Runtime probes (not template-only). Configuration updates alone were treated as insufficient.  
**Constraint:** No business/UI/DB logic changes except a secret-free Mongo target field on `/diagnostics` for deployment proof.

---

## Executive verdict

**Not production-ready.**  
Production readiness score: **22 / 100**

| Area | Result |
|------|--------|
| Local `.env` Atlas URI loaded | **Pass** (not localhost) |
| Local runtime Atlas connect | **Fail** — `querySrv ECONNREFUSED` |
| Render API serving | **Fail** — cold-start / “Application loading” only; `/livez` never returns JSON |
| Web production pointing at Render | **Templates Pass** / **Runtime Fail** (local `.env` still localhost) |
| Android production pointing at Render | **Not verified** — no release build with Render `VITE_*` proven |
| GitHub fully synced to `master` | **Fail** — remote has **`clean-master` only**; local ahead + dirty WIP |

---

## 1. Atlas validation

### Runtime evidence (local machine)

| Check | Result |
|-------|--------|
| `MONGODB_URI` loaded from `backend/.env` | **Pass** |
| URI kind | **Atlas** (`mongodb+srv://…@cluster0.r3huhap.mongodb.net/FixNow`) |
| Accidentally using `127.0.0.1` | **No** — Local URI is commented alternate only |
| Database name | `FixNow` (path + `dbName: 'FixNow'` in `connectDatabase`) |
| Windows DNS SRV lookup | **Pass** — `Resolve-DnsName` returns shard hosts |
| Node/Mongoose connect | **Fail** — `querySrv ECONNREFUSED _mongodb._tcp.cluster0.r3huhap.mongodb.net` |
| Read / write / indexes | **Not executed** (connection never established) |

### Why Atlas fails from this workstation

The URI is correct. Failure is **runtime DNS/SRV from Node**, not a wrong `.env` falling back to localhost.  
PowerShell can resolve the SRV record; Node’s `querySrv` refuses connection — common on restricted networks / DNS filters / VPN. That does **not** prove Render can or cannot reach Atlas; it only proves **this agent host cannot**.

### Localhost fallback?

**Not in effect.** Active line:

`MONGODB_URI=mongodb+srv://…@cluster0.r3huhap.mongodb.net/FixNow?appName=Cluster0`

Commented alternate:

`# MONGODB_URI=mongodb://127.0.0.1:27017/FixNow`

---

## 2. Render validation

**Host:** `https://fixnow-dpjg.onrender.com`

| Endpoint | Result |
|----------|--------|
| `/livez` | **Fail** — HTTP timeout (90–120s) via PowerShell; WebFetch shows Render **“Application loading”** placeholder, not Express JSON |
| `/readyz` | **Fail** — timeout |
| `/health` | **Fail** — timeout |
| `/version` | **Fail** — not reached / not serving |
| `/diagnostics` | **Fail** — app never becomes ready |
| `/api/v1/...` | **Fail** — cannot validate auth/customer/technician/admin/subscription APIs |
| Atlas connected on Render | **Unknown / blocked** — cannot inspect because process never answers |
| No localhost in Render responses | **N/A** — no API responses |

### Interpretation

Render’s edge receives traffic and starts a wake cycle, but the **Node application never serves** `/livez`. Combined with the prior audit (`RENDER_DEPLOYMENT_AUDIT.md`):

1. GitHub default branch is **`clean-master`**; **`master` does not exist** on origin.
2. If the service still deploys from `master`, Git fetch fails before build — matching “failed to fetch commit or branch from GitHub”.
3. A never-healthy deploy explains perpetual “Application loading”.

**Operator action still required:** Render Settings → Branch = **`clean-master`**, then Manual Deploy, then re-check `/livez` and `/readyz`.

---

## 3. Web validation

| Check | Result |
|-------|--------|
| Local root `.env` `VITE_API_URL` | `http://localhost:4000/api/v1` — **local only** |
| Local root `.env` `VITE_SOCKET_URL` | `http://localhost:4000` — **local only** |
| `.env.production.example` / `.env.render.example` | Point at `https://fixnow-dpjg.onrender.com` — **Pass (templates)** |
| Production SPA actually built & hosted with those values | **Not verified** |
| Live requests to Render from a production web build | **Fail** (backend not serving) |
| Google / Maps / Resend / Payments from web | **Blocked** on backend availability |

**Conclusion:** Production *templates* are correct. Day-to-day local web still correctly uses localhost. No evidence of a production web deploy hitting Render successfully.

---

## 4. Android validation

| Check | Result |
|-------|--------|
| Capacitor release uses baked `VITE_*` from build | By design (`packages/api/resolveBaseUrl.ts`) |
| `CAP_SERVER_URL` | Must be unset for release (`capacitor.config.ts`) |
| Hardcoded production Render URL in Android sources | **None found** (good) |
| Release APK/AAB built with Render `VITE_API_URL` | **Not verified in this audit** |
| Runtime Android → Render | **Blocked** (backend not serving) |

To validate later:

```bash
# use production Vite env, then
npm run build && npx cap sync android
```

with `.env.production` / `.env.render.example` values.

---

## 5. Synchronization validation (Android ↔ Web ↔ Atlas)

| Flow | Result |
|------|--------|
| Account / login / jobs / chats / notifications / subscriptions | **Not demonstrated** |
| Shared Atlas as sync backbone | **Not demonstrated** (local Atlas connect fail; Render API fail) |

Root blockers: workstation Atlas SRV failure + Render app not serving.

---

## 6. Socket validation

| Check | Result |
|-------|--------|
| Socket.IO on Render | **Fail** — HTTP origin never becomes ready |
| Web / Android reconnect, presence, typing, receipts | **Not tested** |

---

## 7. Google services validation

| Check | Result |
|-------|--------|
| Runtime `GET /api/v1/auth/google/config` on Render | **Fail** (unreachable) |
| Maps / tracking / Places on production | **Not verified** |
| Env placeholders in templates | Present in example files |

---

## 8. Resend validation

| Check | Result |
|-------|--------|
| Production email send from Render | **Not verified** (API down) |
| Templates document `EMAIL_PROVIDER=resend` | Yes (render/production examples) |

---

## 9. Environment audit

| File | Notes |
|------|-------|
| `backend/.env` | Atlas active; Local commented; secrets preserved |
| `backend/.env.render.example` | Render public URLs; no localhost |
| `.env.production.example` / `.env.render.example` | Render API/socket; no localhost |
| Root `.env` | Localhost — **correct for local Vite**, not for production builds |
| Duplicate authoritative DB vars | None (`MONGODB_URI` only) |

---

## 10. Files modified (this validation)

| File | Change |
|------|--------|
| `backend/src/observability/diagnostics.ts` | Add secret-free `mongodb.target` `{ kind, host, dbName }` for deploy proof |
| `PRODUCTION_DEPLOYMENT_VALIDATION_REPORT.md` | This report |

No business logic, UI, or marketplace behaviour changed.

---

## 11. GitHub commit hash

| Item | Value |
|------|--------|
| Intended branch for deploys | **`clean-master`** (not `master`) |
| Remote branches | `clean-master` only @ `3172484…` (before local commits push) |
| Local HEAD (pre-push of this validation) | Includes unpushed `3d0447e` (Render audit) + dirty WIP |
| Push to `origin/master` | **Impossible** — ref does not exist on GitHub |

After this validation commit is created, push target must be:

```bash
git push origin clean-master
```

---

## 12. Remaining issues (ordered)

1. **Render not serving the API** (critical) — fix Dashboard branch → `clean-master`, redeploy, confirm `/livez` JSON.
2. **Cannot prove Render↔Atlas** until (1) works; then check `/readyz` + `/diagnostics.mongodb.target.kind === "atlas"`.
3. **Local Node cannot `querySrv` Atlas** on this network — use Local Mongo alternate for laptop work, or fix DNS/VPN; do not silently rewrite Atlas URI.
4. **No production web/Android build verified** against Render.
5. **Git dirty / unpushed** — large unrelated WIP; deploy branch mismatch with requested `master`.
6. Google / Resend / sockets / E2E sync — blocked on (1).

---

## 13. Production readiness score: **22 / 100**

| Bucket | Score | Cap |
|--------|-------|-----|
| Env templates / docs | 12 | 15 |
| Local Atlas URI correctness | 8 | 10 |
| Local Atlas runtime | 0 | 15 |
| Render serving + health | 0 | 25 |
| Render↔Atlas proven | 0 | 15 |
| Web/Android prod clients | 2 | 10 |
| GitHub sync / deploy branch | 0 | 10 |

---

## Required next actions (external)

1. Render → Settings → **Branch = `clean-master`** → Manual Deploy.  
2. Confirm `GET https://fixnow-dpjg.onrender.com/livez` returns JSON `{ status: "ok", ... }`.  
3. Confirm `GET …/readyz` → `mongodb: "connected"` and `GET …/diagnostics` → `mongodb.target.kind: "atlas"`.  
4. Build web/Android with `.env.render.example` Vite URLs; retest login/chat.  
5. Push validated commits to **`origin/clean-master`** (not `master`).

**Do not mark production deployment validated until steps 1–3 pass with runtime evidence.**
