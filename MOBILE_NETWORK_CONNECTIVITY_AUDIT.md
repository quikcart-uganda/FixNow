# Mobile Network Connectivity Audit

## Root cause

Physical mobile clients loaded the Vite frontend over the LAN (`http://<PC_LAN_IP>:5173`) but the bundled API base URL stayed pinned to `http://localhost:4000/api/v1`.

On a phone, `localhost` is the phone itself — not the development PC. Login therefore failed immediately with:

> We could not connect to the service.

The backend logged nothing because no TCP connection ever reached the host machine.

Desktop login continued to work because the browser and API both lived on the same loopback interface.

## API URL resolution (before → after)

| Client | Before | After |
|---|---|---|
| Desktop web (`localhost:5173`) | `http://localhost:4000/api/v1` | unchanged |
| Mobile browser (`192.168.x.x:5173`) | `http://localhost:4000/api/v1` ❌ | `http://192.168.x.x:4000/api/v1` ✓ |
| Capacitor Android emulator | `http://10.0.2.2:4000/api/v1` | unchanged |
| Capacitor physical (packaged) | needs `VITE_DEV_LAN_HOST` | still requires `VITE_DEV_LAN_HOST` |
| Capacitor live-reload on LAN Vite | localhost ❌ | rewrites to page LAN IP ✓ |
| Production HTTPS | never rewritten | never rewritten |

Rewrite precedence when the configured host is loopback:

1. `VITE_DEV_LAN_HOST` / `VITE_ANDROID_API_HOST`
2. `window.location.hostname` when it is a private LAN address
3. Capacitor Android emulator alias `10.0.2.2`
4. Otherwise leave localhost (desktop)

Socket URL and splash health checks derive from the same resolver, so they follow automatically.

## Backend binding

- Backend now binds explicitly to `HOST` (default `0.0.0.0`) so LAN devices can reach port `4000`.
- Startup logs include local and LAN health URL hints.
- MongoDB may remain on `127.0.0.1` (host-local only) — that is correct.

## CORS

Non-production CORS previously allowed only `localhost` / `127.0.0.1` / Capacitor origins. After fixing the API host, a phone origin such as `http://192.168.1.20:5173` would have failed preflight.

Non-production now also allows private LAN origins (`10/8`, `172.16/12`, `192.168/16`) in addition to the explicit `CORS_ORIGINS` list. Production behaviour is unchanged.

## Firewall findings

Code cannot open Windows Firewall. If `http://<LAN_IP>:4000/health` is still unreachable from the phone after this fix:

1. Confirm the PC LAN IP matches the Vite Network URL.
2. From the phone browser open `http://<LAN_IP>:4000/health`.
3. If that fails, allow inbound TCP `4000` (and `5173` if needed) for Node/Vite on Private networks in Windows Defender Firewall.
4. Avoid guest/client Wi‑Fi isolation modes that block device-to-device traffic.

## Files modified

| File | Change |
|---|---|
| `packages/api/resolveBaseUrl.ts` | LAN-aware loopback rewrite for web + Capacitor |
| `packages/api/resolveBaseUrl.test.ts` | Unit coverage for rewrite cases |
| `packages/api/client.ts` | DEV-only `console.debug` of real network failure details |
| `packages/api/index.ts` | Export `rewriteDevLoopbackUrl` helpers |
| `backend/src/config/cors.ts` | Allow private LAN origins in non-production |
| `backend/src/config/env.ts` | `HOST` env (default `0.0.0.0`) |
| `backend/src/server.ts` | Listen on `HOST`, clearer LAN health logs |
| `.env.development.example` | Document phone LAN usage |
| `.env.example` | Document automatic LAN rewrite |
| `backend/.env.development.example` | `HOST=0.0.0.0` + CORS note |
| `backend/.env.example` | `HOST=0.0.0.0` |
| `MOBILE_NETWORK_CONNECTIVITY_AUDIT.md` | This audit |

## Error handling

- User-facing copy remains friendly (`NETWORK_ERROR`).
- Actual failure details (`baseURL`, `axiosCode`, `axiosMessage`, `pageHost`) go to:
  - `window.__FIXNOW_DIAG__` via `recordClientError`
  - `console.debug('[fixnow:api] network failure', …)` in Vite DEV only

## Tests performed

| Test | Result focus |
|---|---|
| Unit: desktop localhost unchanged | `rewriteDevLoopbackUrl` keeps localhost |
| Unit: mobile LAN page rewrites API host | `192.168.x.x` / `10.x` / `172.16-31.x` |
| Unit: explicit LAN host wins | `VITE_DEV_LAN_HOST` precedence |
| Unit: Android emulator alias | `10.0.2.2` when native + no LAN context |
| Unit: production HTTPS untouched | no rewrite |

### Manual verification checklist

1. Restart backend and Vite after pulling these changes.
2. On the PC: confirm logs show listening on `0.0.0.0:4000`.
3. Desktop: open `http://localhost:5173` → login still succeeds.
4. Phone (same Wi‑Fi): open the Vite **Network** URL (`http://<LAN_IP>:5173`), not localhost.
5. Phone browser: open `http://<LAN_IP>:4000/health` → JSON health payload.
6. Phone: sign in → backend should now log the `/auth/login` (or equivalent) request.
7. Optional Capacitor physical device: set `VITE_DEV_LAN_HOST=<LAN_IP>` before rebuild/sync.

## Regression testing

| Surface | Expectation |
|---|---|
| Desktop web login | Unchanged — still uses localhost API |
| Mobile web on LAN | Authenticates against `http://<LAN_IP>:4000` |
| Capacitor emulator | Still uses `10.0.2.2` without env changes |
| Capacitor packaged device | Requires `VITE_DEV_LAN_HOST` (documented) |
| Production CORS | Still deny-by-default except configured origins |
| Auth flows / JWT / RBAC | Untouched |

## Success criteria

- Desktop login continues to work
- Physical mobile device can authenticate when using the Vite LAN URL
- Web and Capacitor resolve a reachable backend API in development
- No unrelated auth redesign or module churn
