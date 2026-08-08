# Guest Home Data Loading Report

## 1. Root cause

Guest Home was **not** blocked by Guest Mode auth. Categories and technicians are public endpoints.

The phone opens the app at `http://172.20.10.4:5173`. The client rewrites `VITE_API_URL` from `localhost:4000` → `http://172.20.10.4:4000/api/v1`.

Live API probe with that Origin returned:

```json
{
  "success": false,
  "message": "Origin http://172.20.10.4:5173 is not allowed by CORS",
  "error": { "code": "FORBIDDEN" }
}
```

Browsers hide cross-origin 403 bodies when `Access-Control-Allow-Origin` is missing, so Axios reports a **transport failure**. The UI mapped every transport failure to **"Connection problem / No internet"** even though 5G was online.

**Why Offers / some widgets still worked:** those sections used stale-while-revalidate / offline cache (`withCachedLoader` / offers `cacheGet` fallback). Categories and technicians had no usable cache on that device, so they showed the error state. Header, nav, Post a job, and Recent activity are local/static for guests.

## 2. Failing endpoints (observed)

| Request | Method | Auth required | Guest OK | Observed from LAN Origin |
|---------|--------|---------------|----------|--------------------------|
| `/api/v1/categories?limit=100` | GET | No | Yes | 403 CORS → browser Network Error |
| `/api/v1/technicians/search?...&placement=homepage` | GET | No | Yes | 403 CORS → browser Network Error |
| `/api/v1/offers/public/home?district=Kampala` | GET | No | Yes | Same CORS, often painted from cache |
| `/api/v1/marketing/...` (customer deliver) | GET | No | Yes | Same pattern |
| Guest profile / Recent activity | — | Local | Yes | Always OK |

Without Origin (server-side / curl), categories and technicians return **200**.

## 3. Backend fixes

- Hardened `backend/src/config/cors.ts`:
  - Shared `isAllowedRequestOrigin()` for private LAN + Capacitor in non-production (`!isProduction && !isProductionEnv`).
  - Deny with `callback(null, false)` instead of throwing (avoids empty/opaque 403s).
  - Dev warn log for denied origins.
- CSRF allowlist now uses the same helper (`backend/src/security/csrf.ts`).
- Socket.IO CORS uses the same helper (`backend/src/sockets/index.ts`).
- Documented LAN behaviour in `backend/.env.example`.

**Action required:** restart the backend so CORS + env load. Prefer `npx tsx src/server.ts` (or `npm run dev`) from `backend/` — a stale `node dist/server.js` process may still reject LAN origins until rebuilt.

Also fixed broken relative imports in `pendingAction.service.ts` that prevented `tsx` startup.

## 4. Frontend fixes

- `packages/api/errors.ts` + `client.ts`:
  - Distinguish **offline** vs **server unreachable** vs **timeout** vs **cancelled** vs **CORS/forbidden origin**.
  - Timeouts no longer classified as “No internet” (previously matched `/timed out/`).
  - Abort/cancel no longer classified as connection outage.
- `AsyncStateView`: section-specific helper copy; “Connection problem” only when genuinely offline.
- Guest Home passes `errorTitle` / `fromCache` per section; Recommended technician shows its own independent error state (no silent blank).

## 5. Authorization audit

| Surface | JWT required? | Guest may call? |
|---------|---------------|-----------------|
| Categories list | No | Yes |
| Technician search / public profile | No | Yes |
| Offers public home | No | Yes |
| Marketing customer deliver | No | Yes |
| Customer profile / jobs / messages | Yes | No (gated in UI) |

Guest Mode did **not** incorrectly protect public browse APIs.

## 6. Error handling improvements

| Condition | Before | After |
|-----------|--------|-------|
| Device offline | Connection problem | Connection problem |
| Online but API/CORS unreachable | Connection problem / No internet | Couldn't reach FixNow + accurate body |
| Timeout | Often “No internet” | Request timed out |
| Abort / cancel | Could show Connection problem | Couldn't finish loading |
| 401 / 403 / 404 / 500 | Mixed | Status-aware titles (unchanged intent, clearer paths) |
| Empty list | Empty UI | Empty UI (unchanged) |

## 7. Validation results

| Check | Result |
|-------|--------|
| Categories public without JWT | ✓ (200 without Origin) |
| Technicians public without JWT | ✓ |
| LAN Origin rejected before fix | ✓ reproduced 403 CORS |
| CORS allows private LAN in development after fix | ✓ code path; requires backend restart |
| Offers independent of categories failure | ✓ already sectional; cache explained success |
| Guest permissions respected | ✓ |
| “Connection problem” only when offline | ✓ after error-classification fix |
| Android / Web share client packages | ✓ |

### Manual verification after backend restart

1. From the phone, open `http://<PC-LAN-IP>:5173`.
2. Continue as Guest → Home.
3. Confirm Categories, Recommended, Top rated, and Offers all load.
4. Turn on airplane mode → only then expect “Connection problem” / offline messaging; cached sections may still paint.

## Files touched

- `backend/src/config/cors.ts`
- `backend/src/security/csrf.ts`
- `backend/src/sockets/index.ts`
- `backend/.env.example`
- `packages/api/errors.ts`
- `packages/api/client.ts`
- `packages/shared/AsyncStateView.tsx`
- `apps/customer/pages/HomePage.tsx`
- `GUEST_HOME_DATA_LOADING_REPORT.md`
