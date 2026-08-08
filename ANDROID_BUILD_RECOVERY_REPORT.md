# Android Build Recovery Report

**Date:** 28 July 2026  
**Repo root:** `D:\FixNow\FIXNOW APP\FIXNOW APP`  
**App ID:** `com.fixnow.app`

---

## Verdict

Gradle sync and **debug assemble succeed** with JDK 21. Capacitor Android doctor is clean. No physical device was attached during this recovery session, so USB install/launch was not exercised live — the APK is built and ready. Remaining gaps are secrets (FCM, release keystore) and connecting a device.

---

## Current issues (before recovery)

| Issue | Severity | Root cause |
|-------|----------|------------|
| Gradle / assemble failed on Java 21 toolchain | Critical | Shell `JAVA_HOME` pointed at **JDK 17**; Capacitor 8 requires **21** |
| Physical device API “Network error” | High | Packaged WebView rewrote localhost → `10.0.2.2` (emulator-only) without `VITE_DEV_LAN_HOST` |
| Push deep links 404 | High | `/customer/pay/:id` and `/technician/chat/:id` did not match routes |
| Generic Gradle failures | Medium | No preflight; wrong cwd common with nested `FIXNOW APP\FIXNOW APP` |
| FCM / release signing | Medium | Example files only (expected for open repo) |
| No ADB device | Ops | USB debugging device not connected at audit time |

---

## Root causes

1. **JDK mismatch** — AGP 8.13 + `capacitor.build.gradle` compile with `VERSION_21`, while Windows defaulted to Microsoft JDK 17.  
2. **LAN host not baked into the web bundle** for physical devices.  
3. **Stale push path aliases** in `packages/native/deepLinks.ts`.  
4. **Operational friction** — no single validate/assemble entrypoint that auto-selects Studio JBR.

---

## Fixes implemented

### Toolchain / Gradle
- Set `org.gradle.java.home` to Android Studio JBR 21 in `android/gradle.properties`
- Raised Gradle JVM heap to 2048m; enabled caching + parallel
- Added `pluginManagement { google(); mavenCentral(); gradlePluginPortal() }` in `settings.gradle`
- Explicit Java 21 `compileOptions` in `android/app/build.gradle`
- Hardened release signing load (clearer logs when keystore missing)

### Capacitor / networking
- `CAP_WEB_DEBUG` / live-reload enables WebView debugging in `capacitor.config.ts`
- `npm run android:lan:write` → `.env.local` with `VITE_DEV_LAN_HOST=<detected LAN>`
- Debug cleartext overlay already present; release remains HTTPS-only

### Deep links
- Push / legacy aliases now map to `/customer/payments/pay/:id` and `/technician/messages/:id`

### Hardening scripts
| Script | Role |
|--------|------|
| `scripts/android-jdk.mjs` | Discover JDK 21 (Studio JBR, FIXNOW_JAVA_HOME, …) |
| `scripts/android-validate.mjs` | Actionable preflight (JDK, SDK, Cap, env, ADB) |
| `scripts/android-assemble.mjs` | `assembleDebug` with forced JDK 21 |
| `scripts/android-lan-host.mjs` | Detect / write LAN host for phones |

### npm scripts
- `android:validate`, `android:validate:strict`, `android:assemble`, `android:lan`, `android:lan:write`

---

## Gradle audit

| Item | Value |
|------|-------|
| Wrapper | Gradle **8.14.3** |
| AGP | **8.13.0** |
| Google Services plugin | **4.4.4** (applied only if `google-services.json` exists) |
| Repositories | `google()`, `mavenCentral()`, Gradle Plugin Portal |
| Offline mode | Not forced |
| Sync result | Succeeds with JDK 21 |
| `assembleDebug` | **BUILD SUCCESSFUL** |

---

## Dependency audit

| Area | Status |
|------|--------|
| Capacitor core/android/cli | 8.4.2 aligned (`cap doctor` success on Android) |
| 16 Capacitor plugins | Present and synced |
| AndroidX (variables.gradle) | Current Capacitor 8 defaults |
| Kotlin | Not used (Java MainActivity only) |
| Unused deps | None removed — all plugins are referenced by Capacitor |

---

## Network audit

| Build | Cleartext | Use case |
|-------|-----------|----------|
| Debug | Allowed (`src/debug/...`) | Emulator `10.0.2.2`, LAN `http://192.168.x.x` / `172.x` |
| Release | Blocked | Production HTTPS only |

| Client | API host resolution |
|--------|---------------------|
| Emulator | `localhost` → `10.0.2.2` |
| Physical device | Requires `VITE_DEV_LAN_HOST` (written this session: `172.20.10.4`) |
| CORS | Allows `https://app.fixnow.local` + private LAN in non-prod |

---

## Capacitor audit

| Check | Result |
|-------|--------|
| `webDir` | `dist` |
| `appId` | `com.fixnow.app` |
| Hostname | `app.fixnow.local` |
| `npx cap sync android` | **OK** (16 plugins) |
| `npx cap doctor` | Android **success**; Xcode missing expected on Windows |
| MainActivity | SplashScreen + BridgeActivity |

---

## Android audit

| Item | Value |
|------|-------|
| min / compile / target SDK | 24 / 36 / 36 |
| versionName / versionCode | 1.0.0 / 10000 |
| Permissions | Internet, network state, notifications, camera, mic, media, location, biometric |
| Deep links | `fixnow://` + App Links hosts |
| `google-services.json` | Missing (push disabled until added) |
| `keystore.properties` | Missing (debug signing OK) |

---

## Device deployment results

| Step | Result |
|------|--------|
| `npm run android:validate` | **PASS** (warnings: FCM, keystore, no device) |
| `npm run android:assemble` | **PASS** → `android/app/build/outputs/apk/debug/app-debug.apk` |
| `npx cap sync android` | **PASS** |
| `adb devices` | Empty — no phone/emulator attached |
| Install / launch on hardware | **Not run** — connect device, then `adb install -r …` or Studio Run |

### To finish hardware validation

```powershell
npm run android:validate
adb devices                          # accept RSA prompt on phone
npm run android:assemble
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.fixnow.app/.MainActivity
# Backend: HOST=0.0.0.0, phone on same Wi‑Fi, VITE_DEV_LAN_HOST set, then rebuild+sync if needed
```

---

## Remaining issues

| Item | Impact | Action |
|------|--------|--------|
| No USB device during audit | Cannot certify launch on hardware in-session | Plug in phone / start emulator |
| No `google-services.json` | Push notifications off | Add Firebase Android app config |
| No release keystore | Play / release unsigned | Create JKS + `keystore.properties` |
| Admin portal | Intentionally web-only on native | Use browser for admin |
| App Links `autoVerify` | Needs hosted `assetlinks.json` | Production DNS/hosting follow-up |
| `org.gradle.java.home` path | Machine-specific | Update on other PCs or use `android:assemble` |

---

## Production readiness assessment

| Criterion | Status |
|-----------|--------|
| Gradle Sync succeeds | **Met** (with JDK 21) |
| Build succeeds | **Met** (`assembleDebug`) |
| APK installs | Ready (APK produced); hardware install pending device |
| Application launches | Expected OK; confirm on device |
| Customer / Technician | Supported in SPA |
| Admin | Web-only by design |
| Backend connection | Emulator ready; physical needs LAN host (configured) |
| AI / Maps / Notifications | Maps need `VITE_GOOGLE_MAPS_API_KEY`; FCM needs `google-services.json` |
| No manual Studio workarounds | Largely met via validate/assemble + gradle.properties JDK |

**Overall:** Debug Android pipeline is recovered and production-*oriented*. Store release + push + live device QA remain checklist items.

---

## Docs

- [ANDROID_SETUP_GUIDE.md](./ANDROID_SETUP_GUIDE.md) — install, JDK, workflow, common fixes  
- This report — audit, root causes, validation evidence  

---

## Success criteria checklist

- [x] Android Studio can import `android/` without JDK/repo blockers (JDK 21 configured)
- [x] `app` module / run configuration present (`MainActivity` launcher)
- [x] Project builds successfully (`assembleDebug`)
- [ ] APK installed on a physical device *(pending USB device)*
- [ ] Customer / Technician / Admin verified on device *(pending)*
- [x] Capacitor sync succeeds
- [x] Actionable validation instead of opaque Gradle errors (`android:validate`)
