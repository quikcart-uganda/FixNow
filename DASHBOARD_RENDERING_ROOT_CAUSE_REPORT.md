# Dashboard Rendering Root Cause Report

**Date:** 2026-07-25  
**Scope:** Customer Home + Technician dashboard loading pipeline (not cosmetics)  
**Constraint:** Auth, payments, notifications, messaging, maps, and admin left untouched  

---

## 1. Root cause(s)

### Primary (confirmed live)

**Dashboard `useAsync` settle is gated on Capacitor Preferences-backed cache I/O (`withCachedLoader` → `cacheGet` → `prefs()` → `import('@capacitor/preferences')`). On web, that Preferences dynamic import / bridge path hung indefinitely.**

Observed chain:

```
HTTP 200 (categories / offers / marketing / technicians)
  → axios resolves
  → withCachedLoader still awaiting cacheGet/prefs()
  → useAsync never calls settle()
  → status stays "loading"
  → AsyncStateView keeps skeletons forever
```

Live CDP evidence (before fix):

| Probe | Result |
|-------|--------|
| Customer Home UI | 5× `aria-busy` regions: promotions, offers, campaigns, categories, technicians; **35** `.skeleton` nodes |
| Auth | Working — “Hello, Demo Customer” |
| Direct `fetch` to same APIs | **200** with populated `items` / rails |
| Performance XHR for Home | Completed (~1.3s) with `transferSize: 0` (cached/completed) |
| `cacheGet('categories.v1')` | **Hung >3s** (Promise.race timeout) |
| `Preferences.get` called? | **Never** — hang was inside `prefs()` before `get` |
| Direct Preferences import + `get` | Instant OK |
| `withCachedLoader` simple loader | **Hung >3s** |

So the backend and envelope mapping were fine. The UI never left loading because **status never settled**.

### Secondary (aggravators)

1. **Previous “timeouts” around Preferences did not protect settle** — `withTimeout(import('@capacitor/preferences'))` still failed to return in the running Vite graph while Home had many concurrent `useAsync(cacheKey)` mounts (Strict Mode × 5 rails).
2. **Home hero remapped `idle` → `loading`** — could reintroduce a promo skeleton in edge cases.
3. **`useAsync.reload` identity was unstable** (`reload: () => reload(...)` every render) — noisy for technician `useCallback` deps (not the primary hang).
4. **AbortSignal not passed into `apiGet`** — Strict Mode aborts do not cancel HTTP; settle relied on `requestId` bookkeeping (safe once cache no longer hangs).

### Not root causes

- Empty Mongo / missing seeds (content present)
- `items` vs `data` / `results` envelope mismatches on Home endpoints
- React Query (apps use custom `useAsync` only)
- Auth shell spinner (different UI; Home was already mounted)
- Service worker API caching (`sw.js` skips `/api`)

---

## 2. Why previous fixes failed

Prior audits (`DASHBOARD_DATA_PIPELINE_AUDIT.md`, `CUSTOMER_DASHBOARD_CONTENT_AUDIT.md`) correctly identified **settle-path** issues and shipped:

- Fire-and-forget `persistCache` (stop awaiting Preferences **writes**)
- `useAsync` abort/supersede settle improvements
- Empty marketing cache treated as unusable
- Offers abort rethrow

Those fixes addressed **write stalls** and **abort discard**, but left the **read path** still doing:

```ts
await prefs() // dynamic import('@capacitor/preferences') on web
await withTimeout(p.get(...), 1500)
```

In the live browser session, **`prefs()` itself never reached `get`**, so write-side fixes could not clear skeletons. Timeouts on `get`/`set` never ran. Cosmetic skeleton / empty-state UI changes also could not help while `status === 'loading'`.

---

## 3. Exact files responsible

| File | Role in failure |
|------|-----------------|
| `packages/native/offlineCache.ts` | Web used Capacitor Preferences; `prefs()` hang blocked all cache reads |
| `packages/native/dataCache.ts` | `withCachedLoader` awaited `readCachedData` with no outer race → blocked loaders |
| `packages/hooks/useAsync.ts` | `cacheKey` path awaited hung `withCachedLoader` before settle |
| `packages/shared/AsyncStateView.tsx` | Correctly shows skeletons while `status === 'loading'` (symptom, not cause) |
| `apps/customer/pages/HomePage.tsx` | All rails use `useAsync` + `cacheKey` + `AsyncStateView` |
| `apps/technician/pages/JobsFeedPage.tsx` (and other tech lists) | Same shared settle path for skeleton surfaces |

---

## 4. Exact code changes

### A. `packages/native/offlineCache.ts` — architectural fix

- **Web:** sync `localStorage` + in-memory map only — **never** dynamic-import Capacitor Preferences.
- **Native:** Preferences still used, single-flight plugin resolve, hard timeouts.
- Every `cacheGet` / `cacheSet` / `cacheRemove` wrapped in an absolute **1s budget**.

### B. `packages/native/dataCache.ts`

- `withCachedLoader` races `readCachedData` against a **1s** null fallback so a wedged read cannot block the network loader.
- Registered `technician.dashboard.marketing.v1` and `technician.assigned.v1` on `DATA_CACHE_KEYS` for logout cache clear.

### C. `packages/hooks/useAsync.ts`

- Budget only the dynamic `import('@fixnow/native')` (not the network).
- On cache-layer failure → direct `loader()` so Home still settles after HTTP 200.
- Stable `reload` function identity via ref (stops consumer dep thrash).

### D. `apps/customer/pages/HomePage.tsx`

- Removed hero `idle` → `loading` remap (idle no longer paints promo skeletons).

---

## 5. API mismatches found

| Endpoint | Backend | Frontend | Verdict |
|----------|---------|----------|---------|
| `GET /categories` | `{ items, meta }` | `res.data.items` | Match |
| `GET /technicians/search` | `{ items, meta }` | `res.data.items` | Match |
| `GET /offers/public/home` | `{ featured, nearby, recommended, expiringSoon, popular }` | normalized arrays | Match |
| `GET /marketing/customer` | `{ channel, promotions, sponsored, advertisements, educational }` | rails + hero | Match |
| `GET /content/customer` | content blocks | **Not used on Home** (splash/onboarding) | N/A |
| `GET /jobs/nearby` | `{ items, meta, canApply }` (auth tech) | `res.data.items` | Match |
| `GET /marketing/technician` | delivery object | `res.data` | Match |
| Envelope | `{ success, data }` | `apiGet` unwraps to `res.data` | Match |

No contract rename fixes were required for dashboard paint.

---

## 6. State management issues

- No Redux / Zustand / React Query on these surfaces.
- Custom `useAsync` is the state machine; infinite skeletons = `status` stuck at `'loading'`.
- Auth `status === 'loading'` only gates `ProtectedRoute` (full-page spinner), not Home rails — ruled out once “Demo Customer” greeting was visible.
- Technician `AppContext.profileLoading` is unused by Home UI (does not explain skeletons).

---

## 7. Cache issues

| Layer | Finding |
|-------|---------|
| Capacitor Preferences (web) | **Hung** inside `prefs()` / module import under Home load — primary break |
| `withCachedLoader` | Awaited hung `readCachedData` before calling network loader from useAsync’s perspective |
| Browser HTTP cache | XHRs completed; did not prevent hang |
| Service worker | Does not cache `/api` |
| React Query cache | N/A |
| Empty marketing cache | Previously sticky; already mitigated by `isEmptyCacheValue` |

---

## 8. Query issues

- No TanStack Query.
- `useAsync` flags: `isLoading === (status === 'loading')` — correct; problem was status never advancing.
- `enabled` always true on Home.
- Strict Mode double-mount amplifies concurrent cache reads (made Preferences hang more likely).
- `fixnow:resync` not the live hang trigger on web.

---

## 9. Seed / content issues

Live probes against `localhost:4000` (Mongo connected):

| Dataset | Status |
|---------|--------|
| Categories | Populated |
| Technicians search | Populated |
| Offers home rails | Populated (featured, nearby, …) |
| Customer marketing | promotions=6 (+ ads/edu) |
| Content blocks `/content/customer` | Present; not required for Home rails |
| Technician marketing | Present |
| Nearby jobs for demo tech | Endpoint OK; feed may be empty (empty state, not skeleton) |

No new seeds required for this incident.

---

## 10. Final verification

### Before (Customer Home)

- Greeting rendered (auth OK).
- All content rails stuck on skeletons (`Loading promotions/offers/campaigns/categories/technicians…`).
- Screenshot evidence: endless skeleton blocks under search.

### After (Customer Home)

| Check | Result |
|-------|--------|
| `aria-busy` regions | **0** |
| `.skeleton` count | **0** |
| Hero promo | Emergency Home Repairs |
| Featured tech | GardenPro AI recommendation |
| Offers rails | Featured / nearby promotions visible |
| Categories | **16** category links |
| Technicians | **35** technician card links |
| `cacheGet` after fix | **~29ms**, hit OK |
| `withCachedLoader` after fix | settles with network data |

### Technician

Same settle pipeline (`useAsync` + `withCachedLoader` + `offlineCache`). Jobs/Messages/Notifications skeletons share this path; Home subtitle “Loading jobs…” clears when nearby query settles. Browser login to technician was not re-driven after session reset; API probes confirm technician marketing/dashboard endpoints return 200 with expected shapes.

### Regression scope

No changes to authentication flows, payments, notifications, messaging, maps, or admin feature logic — only cache settle + `useAsync` hardening + Home hero idle remap.

---

## Pipeline map (break point marked)

```
Backend 200
  → apiGet unwrap { success, data }
  → Home loader maps items
  → withCachedLoader
       → readCachedData / cacheGet
            → prefs() / Capacitor Preferences   ← BROKE HERE (hung)
       → loader()                               ← never reached from settle’s POV
  → useAsync settle(success|empty|error)        ← never called
  → AsyncStateView                              ← stuck on loading skeletons
```

**Fixed pipeline:** web cache reads are sync localStorage; cache reads are time-boxed; network loader always runs if cache is slow/empty; `useAsync` settles after HTTP success.

---

## Recommended follow-ups (optional)

1. Pass `AbortSignal` from `useAsync` into `apiGet` options on Home/Jobs loaders.
2. Prefetch technician feed behind splash (today prefetch is customer-only).
3. After Capacitor Android QA, confirm native Preferences path under the new single-flight + budget behavior.
