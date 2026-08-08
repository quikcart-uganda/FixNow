# Web + Android Synchronization Audit

**Date:** 2026-07-28  
**Model:** Single SPA in Capacitor WebView (`capacitor.config.ts` → `webDir: dist`)

---

## Current architecture

| Layer | Behaviour |
|-------|-----------|
| Build | `npm run mobile:sync` / `cap:sync` builds web then copies into Android assets |
| API/Socket | `VITE_API_URL` / `VITE_SOCKET_URL` + LAN rewrite helpers |
| Auth | Shared token storage; socket reconnect on resume |
| Push | FCM native + `resolvePushTarget` deep links |
| Offline | `offlineQueue` + `fixnow:resync` |
| Service worker | `public/sw.js` present but **not registered** in app entry |

---

## Synchronization issues

1. **No OTA** — Android ships a static `dist` snapshot; web deploys do not appear until rebuild + sync / store release.  
2. **SW unused** — no automatic “new version available” prompt for web or WebView.  
3. **Home/marketing stale** — mitigated with realtime reload (see realtime audit).  
4. **Infinite lists** skipped resume resync — fixed.  
5. Web `notificationclick` in `sw.js` opens `/` only (low impact while SW unregistered).

---

## Cache strategy

Prefer targeted `useAsync` / list reload over WebView full reload. On `appStateChange` → `fixnow:resume` → socket + resync. Do not force complete reload on every resume.

---

## Deployment strategy

1. Ship web to CDN/host.  
2. For Android store builds: `npm run mobile:sync` → assemble release.  
3. Optional future: Capgo / live update with signed bundles.  
4. `VITE_APP_RELEASE_VERSION` + backend `APP_VERSION` for diagnostics comparison.

---

## Version synchronization

Admin **Realtime diagnostics** shows frontend diagnostics dump (includes build-related client info when available) and active providers. Backend `/version` remains source for API version. **Gap:** automated “APK assets behind web” banner not yet shipped — operators compare versions manually / via CI parity script (`parity:android`).

---

## Offline recovery

Reconnect automatically; flush offline queue; prevent duplicate message ids via existing client message ids. Payments should not queue blindly — keep server idempotency keys.

---

## Performance impact

Shared SPA avoids dual codebases. Asset sync cost is build-time, not runtime. Avoid registering aggressive SW caching until update UX is defined.

---

## Regression testing

| Test | Expect |
|------|--------|
| Login web + Android same user | Sessions independent tokens; data via API consistent |
| Push tap | Opens correct deep link route |
| Background → foreground | Socket reconnect; lists refresh without full white reload |
| After `mobile:sync` | New UI visible in emulator/device |
| Slow network | Socket falls back to polling transport |

---

## Production readiness assessment

**Parity of features: strong** (one SPA).  
**Deploy sync without rebuild: not ready** — document as operational requirement until OTA is adopted.  
**Realtime data sync: good** for core flows; continue wiring remaining screens.

**Recommended next:** polite in-app version check against `/version` + embedded build hash; register SW only for pure web with update prompt; evaluate Capgo for staged Android asset updates.
