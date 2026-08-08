# Customer Dashboard Data Pipeline Audit

**Date:** 2026-07-25  
**Scope:** Customer Home (`apps/customer/pages/HomePage.tsx`) end-to-end: API → client envelope → mappers → `useAsync` / cache → `AsyncStateView`  
**Constraint:** Surgical fixes only; no redesign of auth, payments, messaging, or Home layout.

---

## 1. Verdict

Backend marketplace content is **present and correctly shaped**. Live probes against `localhost:4000` returned non-empty categories, technicians (`/technicians/search`), offers home feed, and marketing delivery with `success: true`.

The UI symptom (skeletons / empty rails while Network shows 200s) is explained primarily by the **client cache settle path**, not missing API contracts or an empty database:

1. **`withCachedLoader` awaited Preferences writes after a successful fetch** — a stalled Capacitor Preferences bridge leaves `useAsync` on `loading` forever even though the HTTP response already completed (prefetch/Network still show 200).
2. **Offers loader swallowed all errors (including abort) and returned an empty feed** — that painted “empty” and could poison SWR cache after Strict Mode / superseded requests.
3. **`clearRoleCaches()` missed Home-specific keys** (`customer.profile.v1`, `customer.home.technicians.v1`, `customer.home.v1:offers`, `customer.home.v1:marketing`), so role switch / logout could leave stale empty entries in place longer than intended.

Invalid health URLs (`/api/v1/health`, `/api/health`) **are not called by current app code**. They 404 as expected. Splash uses `GET ${origin}/health`.

---

## 2. Live API verification (2026-07-25)

| Endpoint | Result |
|----------|--------|
| `GET /health` | `ok`, MongoDB `connected` |
| `GET /api/v1/health` | **404** (not a real route) |
| `GET /api/health` | **404** |
| `GET /api/v1/categories?limit=5` | `data.items` populated (`id` + `_id`) |
| `GET /api/v1/technicians` | **404** — list is `/technicians/search` |
| `GET /api/v1/technicians/search?limit=3&sort=-trustScore` | items OK |
| `GET /api/v1/offers/public/home` | `featured` / `nearby` / `recommended` / `expiringSoon` / `popular` populated |
| `GET /api/v1/marketing/customer?placement=home` | promotions=6, educational=2, advertisements=5 |

Home already calls the correct technician path via `technicianApi.search` → `/technicians/search`.

---

## 3. Pipeline map

```
Splash prefetchEssentialContent
  → same public endpoints + saveCachedData(DATA_CACHE_KEYS.*)
HomePage useAsync(cacheKey)
  → withCachedLoader → loader (API) → map* → AsyncStateView / rails
```

| Rail | API | Mapper / normalize | Cache key |
|------|-----|--------------------|-----------|
| Profile greeting | `GET /customers/me` | inline | `customer.profile.v1` |
| Categories | `GET /categories` | `mapCategory` | `categories.v1` |
| Technicians | `GET /technicians/search` | `mapCustomerTechnicianCard` | `customer.home.technicians.v1` |
| Offers | `GET /offers/public/home` | array normalize | `customer.home.v1:offers` (+ `customer.offers.home.v1`) |
| Marketing | `GET /marketing/customer?placement=home` | envelope as-is | `customer.home.v1:marketing` |

Envelope contract: axios `apiGet` unwraps `{ success, data }` → callers use `res.data`. **No mismatch found.**

---

## 4. Root causes (ranked)

### P0 — Cache write blocked UI settle
`withCachedLoader` did `await saveCachedData(...)` after `loader()` resolved. Preferences I/O is supposed to be best-effort; awaiting it couples UI status to the native bridge. Prefetch can still complete the same GETs (Network 200) while Home stays on skeletons.

**Fix:** fire-and-forget `persistCache`; Preferences get/set/remove/import time-boxed to 1.5s; `useAsync` falls back to a direct fetch if the cache layer throws non-abort errors.

### P1 — Offers `catch` → fake empty
Any failure (including cancel) returned `EMPTY_OFFERS`, which `isEmpty: isOffersEmpty` treated as a settled empty state.

**Fix:** rethrow aborts; on real errors use offline `cacheGet` only; otherwise rethrow so `AsyncStateView` shows error + retry instead of a lying empty state.

### P2 — Incomplete role cache clear
Logout / role switch cleared `DATA_CACHE_KEYS` but not the Home suffix keys above.

**Fix:** register those keys on `DATA_CACHE_KEYS` and clear the deduped set.

### Not root causes (this environment)
- Empty Mongo / missing seeds — content is seeded and live.
- Wrong response envelope / mapper field names for categories & technicians.
- Splash health check using `/api/v1/health` — current code uses `/health`. Observed bad URLs are external/stale/proxy, not this repo’s splash path.

---

## 5. Health URL findings

| URL | App usage | Live |
|-----|-----------|------|
| `/health` | `packages/shared/splash/healthCheck.ts` | 200 OK |
| `/livez`, `/readyz` | backend only | available on API |
| `/api/v1/health`, `/api/health` | **none in app/packages** | 404 |

If DevTools still shows invalid health calls, clear an old WebView bundle / hard-refresh, or inspect proxies — they are not emitted by the current splash gate.

---

## 6. Files changed

| File | Change |
|------|--------|
| `packages/native/offlineCache.ts` | Preferences I/O timeouts; safe `JSON.stringify` |
| `packages/native/dataCache.ts` | Home cache key constants; non-blocking persist; fuller `clearRoleCaches` |
| `packages/hooks/useAsync.ts` | Fallback direct fetch if cache layer fails |
| `apps/customer/pages/HomePage.tsx` | Shared cache keys; offers abort/error handling |
| `packages/shared/splash/prefetchEssentialContent.ts` | Prefetch writes via `DATA_CACHE_KEYS` |

---

## 7. Verification / test plan

1. Soft-refresh customer Home (web): categories, top technicians, offer rails, marketing rails paint after settle (no permanent skeletons).
2. Chrome Network: confirm `/categories`, `/technicians/search`, `/offers/public/home`, `/marketing/customer` → 200 and UI matches counts.
3. Pull-to-refresh: rails reload; no stuck loading.
4. Android emulator: cold start → splash prefetch → Home; if Preferences stalls, UI still settles from network.
5. Logout / switch role → login as customer: Home does not keep another role’s empty home cache.
6. Confirm no requests to `/api/v1/health` from app code (only `/health` during splash).

---

## 8. Recommendations (out of scope / follow-ups)

- Pass `AbortSignal` through `categoriesApi` / `technicianApi` / `offersApi` list helpers so Strict Mode cancels HTTP cleanly.
- Optionally strip heavy nested `analytics` docs before caching offer feeds to shrink Preferences payloads.
- Document for ops: seed scripts (`seed:marketing`, UX content seeds) if a fresh DB is empty — not required on this verified environment.
- Add a small Home integration smoke test that mocks 200 envelopes and asserts `useAsync` reaches `success` even when `cacheSet` hangs.
