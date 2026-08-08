# False Offline Detection Report

## 1. Root cause

The UI string **"No internet connection. Check your network and try again."** was shown for **any Axios transport failure** (no HTTP response), not only real offline.

Typical real causes while the device was online:

| Cause | What the browser sees | Misclassified as |
| --- | --- | --- |
| CORS blocked LAN origin (`http://172.20.10.4:5173`) | Opaque failure, no status | Offline |
| API process down / wrong host | `ERR_NETWORK` / `ECONNREFUSED` | Offline |
| Capacitor WebView flaky `navigator.onLine` | `false` while 5G/Wi‑Fi works | Offline |
| Request abort / Strict Mode remount | Status `0` | Offline (sometimes) |

Static assets and the Vite shell still loaded because they do not go through the API client. Home sections that hit `/api/v1/...` failed at transport layer → `getFriendlyErrorPresentation` / interceptor mapped them to **NETWORK_ERROR**.

**Proven earlier (Guest Home):** LAN Origin → API returned **403 CORS** without `Access-Control-Allow-Origin`. The browser hid the body; Axios reported a network error; UI said “No internet.” Offers often still painted from cache.

## 2. Incorrect error mapping

### Before

```
Axios no-response
  → code NETWORK_ERROR (always, in diagnostics)
  → if navigator.onLine === false → "No internet…"
  → else → long SERVER_UNREACHABLE copy
```

Problems:

1. **`navigator.onLine` alone** is unreliable on Capacitor Android; it can report offline while 5G works.
2. Presentation layer re-checked `deviceAppearsOnline()` for **every** `status === 0`, including errors already tagged `SERVER_UNREACHABLE`, and could flip them back to offline copy.
3. Auth / HTTP failures that never reached the network classifier were generally fine, but **any** transport failure was still labeled as a connectivity problem in titles (“Connection problem”) and AsyncStateView offline hints.

### After

```
Axios no-response
  → if confidently offline (native Network plugin, or browser signal on web)
       → NETWORK_ERROR → "No internet connection."
  → else
       → SERVER_UNREACHABLE → "Service temporarily unavailable."

HTTP 401 → "Please sign in to continue."
HTTP 403 → "You don't have permission to perform this action."
HTTP 404 → not-found copy
HTTP 422 → validation copy
HTTP 429 → rate-limit copy
HTTP 5xx → "Something went wrong on our servers." / service unavailable
Timeout → "The request took too long. Please try again."
Cancel → REQUEST_CANCELLED (never offline)
```

**Confident offline for transport** never uses Capacitor `navigator.onLine` alone. Native plugin state is published on `window.__FIXNOW_NET__`.

## 3. Requests affected

Any client call that fails **without an HTTP response**, including (not limited to):

- `GET /api/v1/categories`
- `GET /api/v1/technicians` / recommendations
- `GET /api/v1/offers` (when not served from cache)
- Auth login / refresh / Google handoff backend exchange
- Guest AI `POST /api/v1/ai/guest/chat`
- Technician portal reads/writes
- Shared uploads / messaging / payments when the host is unreachable

CORS misconfiguration and dead API host were the primary **false** offline triggers in LAN phone testing.

## 4. Files modified

| File | Change |
| --- | --- |
| `packages/api/connectivity.ts` | **New** — publish/read `__FIXNOW_NET__`; `isConfidentlyOfflineForTransport()` |
| `packages/api/errors.ts` | Status/code matrix; never reclassify `SERVER_UNREACHABLE` as offline |
| `packages/api/client.ts` | Interceptor defaults transport failures to `SERVER_UNREACHABLE`; timeouts/cancels get proper codes |
| `packages/api/index.ts` | Export connectivity helpers |
| `packages/api/api.quality.test.ts` | Assert online transport ≠ “No internet”; offline only when signal says so |
| `packages/native/nativeNetwork.ts` | Publish native connected state to `__FIXNOW_NET__` |
| `packages/shared/splash/useNetworkStatus.ts` | Publish browser online/offline signal |
| `packages/shared/AsyncStateView.tsx` | Titles/hints distinguish offline vs service unavailable |
| `packages/native/socialAuth.ts` | Google backend transport copy no longer implies “check internet” |
| `packages/native/queueMutation.ts` | Prefer native net signal for queue offline gate |

Related (prior turn, still required for LAN): `backend/src/config/cors.ts` + `CORS_ORIGINS` allowlist for `http://172.20.10.4:5173`.

**Not suppressed:** `OfflineBanner` still shows when connectivity is actually lost.

## 5. Correct error classifications

| Situation | Code | User-facing message |
| --- | --- | --- |
| Genuine offline | `NETWORK_ERROR` | No internet connection. |
| API/CORS/host unreachable (device online) | `SERVER_UNREACHABLE` | Service temporarily unavailable. |
| Auth required | `401` / `UNAUTHORIZED` | Please sign in to continue. |
| Permission denied | `403` / `FORBIDDEN` | You don't have permission to perform this action. |
| Missing endpoint | `404` | We could not find what you were looking for. |
| Validation | `422` | Please check your input and try again. |
| Rate limit | `429` | Too many requests… |
| Server error | `5xx` | Something went wrong on our servers. / Service temporarily unavailable. |
| Timeout | `TIMEOUT` | The request took too long. Please try again. |
| Cancelled | `REQUEST_CANCELLED` | Request was cancelled… |

## 6. Validation results

### Automated

```
node --import tsx --test packages/api/api.quality.test.ts
→ 12 passed, 0 failed
```

Covers: online transport ≠ No internet; offline signal → No internet; `SERVER_UNREACHABLE` never flipped by offline signal; 401/403/500/timeout distinct.

### Manual / surface coverage

| Surface | Expected |
| --- | --- |
| Customer Home (guest or signed-in) | Section failures show **Service unavailable** (or HTTP-specific copy), not No internet, while online |
| Technician portal | Same shared API client / presentation |
| Shared authentication | 401 → sign in; transport → service unavailable |
| Guest Mode | Same public GETs; no JWT involved in the false offline path |
| OfflineBanner | Still appears only when network status is offline |
| Local API up + CORS OK | Sections load; no offline banner |

### How to re-verify on LAN phone

1. Backend reachable with Origin allowed (CORS).
2. Open customer Home on phone — sections should load.
3. Stop API only — expect **Service temporarily unavailable**, not No internet.
4. Enable airplane mode — expect **No internet connection.** / OfflineBanner.
5. Force 401 (expired session on protected call) — expect sign-in copy, not offline.

## Verdict

False “No internet” came from **mapping every transport failure (and trusting Capacitor `navigator.onLine`) to NETWORK_ERROR**. That mapping is fixed: only confident offline uses “No internet connection.” Backend, CORS, auth, permission, timeout, and server errors use distinct messages. The offline banner is still shown for real offline; it is not suppressed.
