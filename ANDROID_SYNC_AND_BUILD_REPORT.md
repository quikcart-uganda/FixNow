# Android Sync and Build Report

**Date:** 2026-07-28  
**Product:** FixNow Capacitor Android  
**App ID:** `com.fixnow.app`  
**Version:** `1.0.0` (versionCode `10000`)

---

## Executive status

| Checkpoint | Result |
|---|---|
| Capacitor audit | **Pass** (see §1) |
| Web production build | **Pass** (`tsc -b` + Vite) |
| Capacitor sync | **Pass** (android + ios + web) |
| Android Studio open | **Pass** (`npm run cap:open:android`) |
| Gradle `assembleDebug` | **Pass** (after Java 21 toolchain fix) |
| Debug APK | **Pass** — `app-debug.apk` **15.90 MB** |
| Runtime device validation | **Not executed on device/emulator in this session** (build-ready; see §6) |

The Android project now contains the latest Vite `dist` assets (Customer + Technician portals, shared packages). Admin remains **web-only** by design inside Capacitor (`AdminPortalGate` redirects native `/admin/*`).

---

## Commands executed

Package manager detected: **npm** (`package-lock.json`). Project scripts used (no hard-coded ad-hoc Capacitor CLI assumptions beyond what `package.json` already defines):

| Step | Command |
|---|---|
| Package manager detect | Presence of `package-lock.json` → npm |
| Web build + Capacitor sync | `npm run mobile:sync` → `npm run build && npx cap sync` |
| Open Android Studio | `npm run cap:open:android` → `npx cap open android` |
| Debug APK (failed first) | `android\gradlew.bat assembleDebug --no-daemon` with system `JAVA_HOME` = JDK **17** |
| Debug APK (succeeded) | Same Gradle task with `JAVA_HOME` = Android Studio **JBR 21** |

### Fix applied before successful web build

- Exported missing type `SponsoredContentType` from `packages/api/index.ts` (blocked `tsc -b`).

### Fix applied for Gradle toolchain

- System `JAVA_HOME` pointed at Microsoft JDK **17**; Capacitor 8 plugins require **Java 21**.
- Rebuilt with Android Studio JBR: `C:\Program Files\Android\Android Studio\jbr`.
- Persisted preference in `android/gradle.properties`:
  - `org.gradle.java.home=C:\\Program Files\\Android\\Android Studio\\jbr`

---

## 1. Capacitor / Android audit

| Item | Status | Notes |
|---|---|---|
| `capacitor.config.ts` | OK | `appId` `com.fixnow.app`, `webDir` `dist`, hostname `app.fixnow.local`, splash/status/push plugins |
| `AndroidManifest.xml` | OK | Internet, camera, location, notifications, media; `fixnow://` + App Links hosts |
| Gradle | OK | AGP/Capacitor 8, `compileSdk`/`targetSdk` **36**, `minSdk` **24**, Java **21** |
| Package IDs | OK | `applicationId` / `namespace` `com.fixnow.app` |
| Icons / splash | OK | mipmaps + splash drawables; SplashScreen plugin `androidSplashResourceName: splash` |
| Permissions | OK | Camera, location, notifications, biometric, storage (scoped) |
| Firebase | **Warn** | `android/app/google-services.json` **missing** (example present). Plugin not applied → **FCM push not fully wired** until JSON is added |
| Google Maps | App-side | Uses `VITE_GOOGLE_MAPS_API_KEY` in WebView JS (`TrackingMap`) — not a native Maps SDK key in Gradle |
| Cloudinary | App-side | Upload/CDN via backend + web client; no Android-specific Cloudinary SDK |
| Deep links | OK | Custom scheme + HTTPS hosts `fixnow.app` / `www.fixnow.app` / `app.fixnow.ug` |
| Network security | OK | Release: cleartext **blocked**; Debug overlay: cleartext **allowed** for LAN/`10.0.2.2` |
| ProGuard / R8 | Partial | `minifyEnabled false` on release today; rules file present for future enablement |

### Synced Capacitor plugins (16)

`@aparajita/capacitor-secure-storage`, `@capacitor/app`, `browser`, `camera`, `clipboard`, `device`, `filesystem`, `geolocation`, `haptics`, `keyboard`, `network`, `preferences`, `push-notifications`, `share`, `splash-screen`, `status-bar`.

---

## 2. Web build status

| Check | Result |
|---|---|
| `tsc -b` | Pass (after `SponsoredContentType` export) |
| Vite production build | Pass (~486 modules, ~3s) |
| Lint (`oxlint`) | Not re-run as gate for this sync (build uses `tsc` + Vite) |
| Vite warnings | Ineffective dynamic import notes + plugin timings — non-blocking |

`dist/` copied into `android/app/src/main/assets/public` (**207** files; `index.html` present).

---

## 3. Capacitor sync status

```
√ Copying web assets from dist → android/app/src/main/assets/public
√ Creating capacitor.config.json
√ Updating Android plugins (16 found)
√ iOS copy/update also completed
Sync finished successfully
```

---

## 4. Android Studio sync status

| Check | Result |
|---|---|
| `npm run cap:open:android` | **Succeeded** — opened `android/` project |
| Indexing / IDE Gradle sync | Launched successfully from CLI; further IDE sync uses Studio’s JDK (JBR 21). If Studio still reports toolchain errors, confirm Gradle JDK = 21 in Settings → Build → Gradle |

---

## 5. Gradle / APK status

| Check | Result |
|---|---|
| First assembleDebug | **Failed** — no Java 21 (`languageVersion=21`) |
| Second assembleDebug | **BUILD SUCCESSFUL in 18m 1s** (579 tasks) |
| Output | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Size | **15.90 MB** |

### Remaining Gradle warnings

- `Using flatDir should be avoided` (Capacitor cordova plugins template)
- Deprecated Gradle features → Gradle 9 incompatibility warning
- Kotlin unchecked / always-false condition notes inside Capacitor plugin sources (upstream)

---

## 6. Functional validation

### Confirmed by build / packaging

| Item | Status |
|---|---|
| Web assets include Customer routes | Yes (synced `dist`) |
| Web assets include Technician routes | Yes |
| Admin on native | **Intentionally unavailable** — `AdminPortalGate` redirects; use desktop web for Admin |
| Debug cleartext for local API | Yes (`src/debug` network security) |
| Plugins compiled into APK | Yes (camera, geolocation, push, filesystem, etc.) |
| Deep link intent filters | Present in manifest |
| No Java/Kotlin/manifest merge failure | Confirmed by successful assemble |

### Requires device/emulator + backend (not run here)

| Item | Status |
|---|---|
| Customer / Technician portals load against live API | Pending on-device |
| Cloudinary upload / image load | Pending |
| Google auth | Pending (needs bridge + client IDs) |
| Push init | **Blocked** until `google-services.json` installed |
| Google Maps render | Pending (`VITE_GOOGLE_MAPS_API_KEY` in build env) |
| Camera / gallery / file upload | Pending permission grant on device |
| Offline queue / live tracking / deep links runtime | Pending |
| Console / crash-free session | Pending |

**Recommendation:** Install debug APK on emulator/device with `CAP_SERVER_URL` unset (embedded assets) or set for live reload; point `VITE_API_URL` at a reachable host for the **next** web rebuild if testing against LAN API.

---

## 7. Optimisation notes

| Topic | Current | Notes |
|---|---|---|
| Release minify | `minifyEnabled false` | Enable R8 carefully before Play store; expand ProGuard for WebView/Capacitor |
| APK size | ~15.9 MB debug | Material Symbols woff2 dominates web assets (~4 MB gzipped source in dist); consider subsetting later |
| Startup | Splash handoff configured | `launchAutoHide: false` until React hides splash |
| Image caching | Web / Cloudinary | No native Coil/Glide layer — WebView HTTP cache |
| WebView | `androidScheme: https`, mixed content off | Matches production posture |
| Push | Needs Firebase JSON | Copy from Firebase console to `android/app/google-services.json` (see `.example`) |

---

## 8. Fixes applied (this session)

1. **`SponsoredContentType` export** — unblocked production TypeScript build.  
2. **Java 21 for Gradle** — used Android Studio JBR; set `org.gradle.java.home` in `android/gradle.properties`.  
3. **Full `npm run mobile:sync`** — latest web → Android/iOS assets + plugin update.  
4. **Opened Android Studio** via project script.  
5. **Successful `assembleDebug`**.

---

## 9. Final APK

```
D:\FixNow\FIXNOW APP\FIXNOW APP\android\app\build\outputs\apk\debug\app-debug.apk
Size: 15.90 MB
Build type: debug
Status: SUCCESS
```

---

## 10. Confirmation

| Statement | Verdict |
|---|---|
| Android app reflects latest FixNow web build (Customer + Technician + shared native stack) | **Yes** — assets synced from current `dist` |
| Admin portal inside Android APK | **No (by design)** — use web Admin |
| Build / sync errors remaining | **None** for debug assemble |
| Production push-ready | **No** until `google-services.json` is added |
| On-device QA of Cloudinary / Maps / Auth / tracking | **Outstanding** — APK is ready to install and validate |

---

## Next actions (operator)

1. Place Firebase `google-services.json` in `android/app/` for FCM.  
2. In Android Studio: Run ▶ on emulator/device (Gradle JDK 21).  
3. Smoke-test Customer + Technician flows against a reachable API.  
4. Before Play release: enable minify with tested ProGuard, signing via `keystore.properties`, verify App Link host ownership.
