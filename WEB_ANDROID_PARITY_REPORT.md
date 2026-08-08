# Web & Capacitor Android Parity Report

**Scope:** Ensure the Capacitor Android app stays functionally and visually aligned with the Web app. The Web React SPA is the single source of truth; Android must never maintain a parallel UI or business layer.

**Verdict:** Architecture already uses **one shared Vite SPA** wrapped by Capacitor. No duplicated Customer/Technician/Admin pages exist under `android/`. Divergences found were **env/network/sync-process** issues — now fixed. Native capabilities remain plugin bridges only.

---

## 1. Shared architecture

```
index.html
  → src/main.tsx
      → bootstrapNative(tokenStorage)     # no-op on web; plugins on device
      → src/App.tsx
          /              PlatformLanding
          /customer/*    apps/customer    (same on Web + Android)
          /technician/*  apps/technician
          /admin/*       apps/admin
  → npm run build → dist/
  → npx cap sync android
  → android/app/src/main/assets/public/   (gitignored copy of dist)
  → MainActivity (BridgeActivity) loads WebView
```

| Layer | Location | Shared? |
|---|---|---|
| Pages / routes | `apps/{customer,technician,admin}`, `src/App.tsx` | ✅ One implementation |
| Components / UI | `packages/ui`, `packages/shared` | ✅ |
| API / auth / sockets | `packages/api`, `packages/hooks` | ✅ |
| Content / marketing | Same delivery APIs | ✅ |
| Capacitor config | `capacitor.config.ts` → `webDir: 'dist'` | ✅ |
| Vite base | `base: './'` (Capacitor-safe relative assets) | ✅ |
| Android shell | `MainActivity.java` only | ✅ No React forks |

**There is only one React application.** Capacitor does not host a second copy of screens.

---

## 2. Native-only features (plugins, not forks)

Implemented in `packages/native/*` behind `isNativePlatform()`:

| Capability | Module |
|---|---|
| Secure session mirror (Keystore) | `secureStorage.ts` |
| Push (FCM) | `nativePush.ts` |
| Splash / StatusBar / Keyboard | `nativeApp.ts` |
| Hardware back | `nativeApp.ts` |
| Deep links / App Links | `deepLinks.ts`, `useNativeDeepLinks.ts` |
| Camera / gallery / GPS | `nativeDevice.ts` (web fallbacks where possible) |
| Share / haptics / clipboard | `nativeDevice.ts` |
| Hosted payments (Custom Tabs) | `hostedPayments.ts` |
| Google auth system-browser bridge | `socialAuth.ts` |
| Network accuracy | `nativeNetwork.ts` |
| Biometric availability probe | `nativeDevice.ts` |
| Offline cache / mutation queue | `offlineCache.ts`, `offlineQueue.ts` (also usable on web) |
| Pull-to-refresh / offline banner | Shared components; haptic extras on native |

These **integrate into** the shared app; they do not replace pages.

---

## 3. Feature parity matrix

| Feature | Web | Android (Capacitor) | Notes |
|---|---|---|---|
| Auth (email/OTP/password) | ✅ | ✅ | Same screens |
| Google Sign-In | GIS popup | System browser bridge | Intentional native path |
| Customer / Technician portals | ✅ | ✅ | Same routes |
| Admin portal | ✅ | ❌ (gated) | `AdminPortalGate` redirects native `/admin/*` → `/`; intentional web-only |
| Categories, search, bookings | ✅ | ✅ | Same APIs |
| Messaging, offers, campaigns, ads | ✅ | ✅ | Same marketing delivery |
| Notifications inbox | ✅ | ✅ | Push delivery native-only |
| Live tracking | ✅ | ✅ | GPS plugin on device |
| Payments | `window.open` | Capacitor Browser | Same backend |
| CMS / content blocks | ✅ | ✅ | Same backend |
| Responsive layouts | ✅ | ✅ | Same CSS; `html.fixnow-native` polish |

No Android-only or Web-only **content** sources. Content always comes from the FixNow API.

---

## 4. Divergences found

| Severity | Issue | Impact |
|---|---|---|
| Critical | Debug cleartext blocked despite docs recommending `http://10.0.2.2` | Emulator/LAN API calls failed on Android |
| High | Capacitor origin `https://app.fixnow.local` not allowed by default CORS | Authenticated API/cookie requests could fail from WebView |
| High | `cap:copy` / `cap:run:*` did not rebuild | Stale `dist` could ship into the APK |
| Medium | Splash mark used absolute `/brand/...` | Fragile under Capacitor relative `base` |
| Medium | Live-reload via `CAP_SERVER_URL` | Intentional; Android then tracks Vite, not `dist` |
| Low | Native chrome CSS / haptics / offline banner | Expected platform polish |

**Not found:** Duplicate Login/Home pages under Android; separate Android HTML entry; Android-only business services.

---

## 5. Divergences fixed

1. **Debug cleartext (emulator/LAN)**  
   - Release: `android/app/src/main/res/xml/network_security_config.xml` keeps `cleartextTrafficPermitted="false"`.  
   - Debug: `android/app/src/debug/res/xml/network_security_config.xml` allows cleartext for local API testing only.

2. **CORS for Capacitor WebView**  
   - `backend/src/config/cors.ts` allows `https://app.fixnow.local` (and capacitor/ionic schemes) in non-production.  
   - `backend/.env.development.example` documents the origin.

3. **Stale asset prevention**  
   - `cap:copy`, `cap:run:android`, `cap:run:ios` now run `npm run build` (and sync) before Capacitor.  
   - Added `npm run parity:android` → `scripts/web-android-parity.mjs`.

4. **Splash asset path**  
   - `FixNowSplash` mark resolves via `import.meta.env.BASE_URL` so Capacitor `base: './'` works.

5. **Env docs**  
   - `.env.development.example` clarifies emulator (`10.0.2.2`) vs device LAN vs release HTTPS.

---

## 6. Build process (required path)

```
npm run build
    ↓
npx cap sync android          # copies dist → android/.../assets/public
    ↓
Android Studio / cap run      # packages WebView + plugins
```

| Script | Behaviour |
|---|---|
| `npm run mobile:sync` | build + `cap sync` |
| `npm run mobile:android` | build + sync android + open Studio |
| `npm run cap:sync` | build + sync |
| `npm run cap:copy` | **build + copy** (was copy-only) |
| `npm run cap:run:android` | **build + sync + run** (was run-only) |
| `npm run parity:android` | Static parity gate |
| `npm run parity:android -- --require-sync` | Also assert synced `assets/public` is fresh |

`android/app/src/main/assets/public` is **gitignored** — always regenerate via sync. Never edit Web assets inside the Android project by hand.

---

## 7. Quality gates (ongoing)

Before marking any feature complete:

1. Works on Web (`npm run dev` / production build).  
2. Works in Capacitor after `npm run mobile:sync` (or `parity:android -- --require-sync`).  
3. Responsive behaviour checked (mobile width + WebView).  
4. Auth + navigation + API integration verified on both.  
5. No new absolute `/assets/...` or `/brand/...` paths — use `BASE_URL` / `packages/assets`.  
6. No new screens under `android/` — only Capacitor plugins for native capability.

Suggested CI step:

```bash
npm run parity:android
npm run build
npx cap sync android
npm run parity:android -- --require-sync
```

---

## 8. Remaining platform-specific limitations

| Limitation | Guidance |
|---|---|
| Release APKs require HTTPS API | Use production TLS URLs in CI release builds; never bake `localhost` into store APKs |
| Google Sign-In UX differs | Same account system; native uses system browser bridge |
| Push requires FCM device setup | Web can use VAPID; Android needs google-services |
| External fonts need network on first load | Consider self-hosting Material Symbols for offline-first APKs |
| Admin portal reachable in same APK | Product decision: optionally hide `/admin` when `isNativePlatform()` if Play Store APK should be customer/tech only |
| `CAP_SERVER_URL` live-reload | Dev-only; release builds must omit it so `webDir: dist` is used |

---

## 9. Recommendations for maintaining parity

1. Treat **Web as source of truth** — implement features once in `apps/` + `packages/`.  
2. Add native behaviour only in `packages/native` behind `isNativePlatform()`.  
3. Always ship Android via `mobile:sync` / `cap:run:android` (never raw `npx cap copy`).  
4. Run `parity:android` in CI.  
5. Keep CORS + Capacitor hostname (`app.fixnow.local`) in sync when changing `capacitor.config.ts`.  
6. For device testing, build with `VITE_API_URL=http://10.0.2.2:4000/api/v1` (emulator) or LAN IP (device) into the Vite bundle, then sync.  
7. Document any intentional platform difference in the PR (Google auth, payments browser, push).

---

## 10. Success criteria

| Criterion | Status |
|---|---|
| Android reflects latest Web implementation | ✅ via `webDir: dist` + rebuild-gated scripts |
| No duplicated UI or business logic | ✅ only `MainActivity` on Android |
| Shared React codebase is single source of truth | ✅ |
| Native functionality only through Capacitor plugins | ✅ `packages/native` |
| Future features work on both unless platform-specific | ✅ same routes/APIs; gate with `parity:android` |

---

## 11. Files touched in this pass

- `android/app/src/main/res/xml/network_security_config.xml` — release cleartext off  
- `android/app/src/debug/res/xml/network_security_config.xml` — debug cleartext on  
- `backend/src/config/cors.ts` — Capacitor origin allowed in non-prod  
- `backend/.env.development.example` — document Capacitor CORS origin  
- `.env.development.example` — emulator/LAN API guidance  
- `package.json` — rebuild gates + `parity:android`  
- `scripts/web-android-parity.mjs` — automated parity gate  
- `packages/shared/splash/FixNowSplash.tsx` — BASE_URL-relative brand mark  

**Parity gate:** `npm run parity:android` → **PASSED**.
