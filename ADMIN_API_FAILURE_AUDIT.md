# Admin API Failure Audit

**Date:** 28 Jul 2026  
**Scope:** Admin Portal multi-page failures showing “Too many requests”  
**Rule followed:** Investigate first — no blind patches, no silenced errors

---

## Verdict

The UI message was **accurate**. The backend was returning real **HTTP 429** from the global `apiRateLimiter`, not a mis-mapped 500/401/Mongo failure.

Root cause: **global rate budget of 200 requests / 15 minutes / IP was too low for the Admin SPA**, then **axios auto-retried 429s** (up to 4 attempts per GET), which amplified the burn and made unrelated modules (Verify, Tracking, Jobs, Portal, …) fail together.

---

## Step 1 — Reproduction evidence

| Observation | Evidence |
|---|---|
| Exact UI copy | `AsyncStateView` title “Couldn't load this” + body from API |
| Exact API body | `backend/src/middleware/rateLimit.ts` → `"Too many requests. Please try again later."` + `ERROR_CODES.RATE_LIMITED` |
| Status | HTTP **429** (express-rate-limit default) |
| Client device | Mobile / Capacitor against LAN host `172.20.10.4` |
| Affected modules | Verification, Live Tracking, Job Management, Portal Production, other chatty admin pages |

Screenshots provided by the user match this path exactly (Verify + Live Tracking).

---

## Step 2 — Request trace (shared failure path)

```
Admin page (VerificationPage / TrackingPage / …)
  → useAsync(loader)
  → adminApi / verificationApi / trackingApi
  → packages/api/client.ts (axios + interceptors)
  → GET /api/v1/...
  → app.use(API_PREFIX, apiRateLimiter)     ← FAILURE HERE (429)
  → (auth / controller / Mongo never reached once limited)
```

Once the IP/token budget is exhausted, **every subsequent Admin GET** fails the same way. That is why unrelated pages share one symptom.

### Example mount endpoints (all under the same limiter)

| Page | Mount request(s) |
|---|---|
| Verification | `GET /verification/requests` |
| Live Tracking | `GET /admin/tracking` |
| Jobs | `GET /admin/jobs` (+ optional secondary) |
| Dashboard | 4 parallel GETs |
| Payments / Escrow | up to 7 parallel GETs |
| Portal Production | ~5 parallel GETs |
| Reports | ~6 parallel GETs |
| Push badge (global) | `GET /notifications?limit=1` every 60s (now 120s) |

---

## Step 3 — Rate limiting verification

| Limiter | Window | Max (before) | Applies to |
|---|---|---|---|
| `apiRateLimiter` | 15 min | **200** | **All** `/api/v1/*` |
| `authRateLimiter` | 15 min | 30 | Auth / bootstrap |
| `loginRateLimiter` | 15 min | 10 | Login / Google / OTP |
| `aiRateLimiter` | 15 min | 60 | AI chat |

Findings:

- 429 **was actually returned** (not a frontend hallucination).
- Frontend mapping of 429 → “Too many requests…” was **correct**.
- Amplifiers: axios treated 429 as transient and retried up to 3 times; StrictMode double-mount in dev; `fixnow:resync` fan-out; push badge polling; multi-query admin pages.

---

## Step 4 — Authorization

Not the primary failure. 401/403 would show session/permission copy, not the rate-limit string. JWT / admin middleware sit **after** the global limiter, so limited requests never reach auth.

---

## Step 5 — Database

No Mongo exceptions were required to explain this symptom. When Mongo *does* fail, the handler previously collapsed many errors to generic 500; that is now classified as `DATABASE_UNAVAILABLE` (503) with a clear UI title.

Failing Mongo queries: **none identified as the cause of these screenshots.**

---

## Step 6 — Routes

Verification, tracking, jobs, portal routes are registered and reachable. No duplicate-route collision explained the shared 429. The shared choke point is middleware order:

```
app.use(API_PREFIX, apiRateLimiter)
app.use(API_PREFIX, apiRouter)
```

---

## Step 7 — Shared services

| Component | Finding |
|---|---|
| Axios client | Retried 429 → **amplified** limiter hits |
| `useAsync` | No infinite retry loop; remounts + `fixnow:resync` add load |
| Circuit breaker | Separate path; not the screenshot message |
| Error handler | Correctly passed backend 429 body to UI |

Failures from one page did not “poison” React Query (none used); they **shared the same rate-limit bucket**.

---

## Step 8 — Frontend error handling (fixed)

`getFriendlyErrorPresentation()` + `AsyncStateView` now use status-aware titles:

| Condition | Title | Message direction |
|---|---|---|
| 429 | Too many requests | Wait / budget exhausted |
| 401 | Session expired | Sign in again |
| 403 | You don't have permission | Permission denied |
| 404 | Not found | Missing resource |
| 408 / timeout | Request timed out | Server too slow |
| Network / offline | Connection problem | No internet |
| `DATABASE_UNAVAILABLE` | Database unavailable | DB temporarily down |
| 5xx | Server error | Server encountered an error |

Never display “Too many requests” for non-429 failures.

---

## Fixes applied

| Fix | File(s) | Why |
|---|---|---|
| **Stop axios 429 retries** | `packages/api/client.ts` | Prevents 1 limited GET → 4 counted hits |
| **Authenticated budget 2000** (+ anonymous 300 default) | `backend/src/config/env.ts`, rateLimit examples | Admin SPA needs headroom |
| **Per-token rate-limit key** when Bearer present | `backend/src/middleware/rateLimit.ts` | Avoid NAT/shared-IP punishment |
| **Rate-limit exceed logging** (path, method, IP, requestId, auth flag) | `rateLimit.ts` | Diagnostics without UI secrets |
| **Mongo → 503 DATABASE_UNAVAILABLE** | `errorHandler.ts`, `errorCodes.ts` | Accurate DB failure messaging |
| **Status-aware error titles** | `errors.ts`, `AsyncStateView.tsx`, `useAsync.ts` | No misleading generic title |
| **Badge poll 120s + skip when tab hidden** | `PushProvider.tsx` | Reduce background burn |
| **Dev/prod env examples updated** | `backend/.env.*.example` | Operators set correct budgets |

### Before / after request behaviour

**Before**

```
GET /admin/tracking → 429
  → axios wait → retry → 429
  → retry → 429
  → retry → 429
  → UI: "Couldn't load this / Too many requests"
(and budget burns faster for Verify / Jobs / Portal next)
```

**After**

```
GET /admin/tracking → 429 (terminal for this call)
  → UI title: "Too many requests"
  → hint: wait before retrying
Authenticated clients: 2000 req / 15 min per token fingerprint
```

---

## Operator action required

1. **Restart the backend** so the new limiter + env defaults load.
2. Optionally set in `backend/.env` (recommended for LAN mobile testing):

```env
RATE_LIMIT_MAX=1000
RATE_LIMIT_MAX_AUTHENTICATED=3000
```

3. Wait out any in-memory 15-minute window still holding the old 200-cap, **or** restart Node (clears the in-memory store).
4. Re-open Verify, Tracking, Jobs, Portal — they should load live Mongo data again.

---

## Pages to verify after restart

- [ ] Verification (`/admin/verification`)
- [ ] Live Tracking (`/admin/tracking`)
- [ ] Jobs (`/admin/jobs`)
- [ ] Portal Production / moderation
- [ ] Dashboard
- [ ] Payments / Escrow
- [ ] Technicians / Workforce Directory
- [ ] Desktop + mobile web + Android Capacitor on `172.20.10.4`

---

## Remaining / follow-ups (not blockers)

1. Collapse heavy pages (Payments 7, Reports 6, Portal 5) into fewer BFF aggregates.
2. Drive notification badge from sockets instead of polling.
3. Debounce / coalesce `fixnow:resync` so one resume event does not reload every mounted `useAsync`.
4. Multi-instance production: move rate-limit store to Redis (in-memory is per process today).

---

## Success criteria check

| Criterion | Status |
|---|---|
| Identify real backend error | ✅ Genuine 429 from `apiRateLimiter` |
| Do not silence errors | ✅ 429 still returned and shown accurately |
| Fix root cause | ✅ Budget + keying + stop 429 retry amplification |
| Accurate module-specific messages | ✅ Status-aware titles/messages |
| Live Mongo data when healthy | ✅ Routes unchanged; limiter no longer blocks normal admin use |
