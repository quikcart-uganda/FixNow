# FixNow Android Setup Guide

## Requirements

| Component | Version / notes |
|-----------|-----------------|
| Node.js | ≥ 20 |
| JDK | **21** (Android Studio JetBrains Runtime recommended) |
| Android Studio | Ladybug / Meerkat or newer (AGP 8.13 compatible) |
| Android SDK | Platform **36**, Build-Tools matching Studio |
| Gradle Wrapper | **8.14.3** (do not install a global Gradle) |
| Android Gradle Plugin | **8.13.0** |
| Capacitor | **8.4.2** |
| minSdk / targetSdk / compileSdk | **24 / 36 / 36** |
| Application ID | `com.fixnow.app` |

> System `JAVA_HOME` on many Windows machines is still JDK 17. FixNow overrides this via `android/gradle.properties` (`org.gradle.java.home`) and `npm run android:assemble`.

---

## One-time setup

### 1. Clone and install

```powershell
cd "D:\FixNow\FIXNOW APP\FIXNOW APP"   # nested repo root — required
npm install
cd backend
npm install
cd ..
```

### 2. Android SDK + local.properties

Open the `android/` folder once in Android Studio (**Open**, not “New Project”). Studio writes `android/local.properties` with `sdk.dir=...`.

Or create it manually:

```properties
sdk.dir=D\:\\ANDROID\\Sdk
```

### 3. JDK 21

Preferred: Android Studio’s bundled JBR:

`C:\Program Files\Android\Android Studio\jbr`

Confirm:

```powershell
npm run android:validate
```

If validation cannot find JDK 21:

```powershell
$env:FIXNOW_JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
```

In Android Studio: **Settings → Build → Build Tools → Gradle → Gradle JDK → 21**.

### 4. Frontend env

Copy `.env.development.example` → `.env` (or keep an existing `.env`).

For a **physical phone** on Wi‑Fi:

```powershell
npm run android:lan:write   # writes VITE_DEV_LAN_HOST into .env.local
```

Emulators do not need this (API host rewrites to `10.0.2.2`).

### 5. Backend

```powershell
cd backend
# HOST=0.0.0.0 in .env so phones can reach the PC
npm run dev
```

### 6. Optional: Firebase + release signing

| File | Purpose |
|------|---------|
| `android/app/google-services.json` | FCM push (from Firebase console; example provided) |
| `android/keystore.properties` | Release signing (see `keystore.properties.example`) |

Debug builds work without either file.

---

## Daily development workflow

### Validate toolchain

```powershell
npm run android:validate
```

### Build web + sync native

```powershell
npm run build
npx cap sync android
# or one shot:
npm run mobile:sync
```

### Assemble debug APK (CLI)

```powershell
npm run android:assemble
# → android/app/build/outputs/apk/debug/app-debug.apk
```

### Open in Android Studio

```powershell
npm run mobile:android
# = build + cap sync android + cap open android
```

Use the **app** run configuration → pick a device → Run.

### Install on a USB device

1. Enable **Developer options** → **USB debugging**
2. Accept the RSA prompt on the phone
3. `adb devices` should list the device
4. Run from Android Studio, or:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.fixnow.app/.MainActivity
```

### Live-reload (optional)

```powershell
$env:CAP_SERVER_URL="http://<PC-LAN-IP>:5173"
$env:CAP_WEB_DEBUG="1"
npm run build
npx cap sync android
# start Vite: npm run dev -- --host
```

Debug APKs allow cleartext HTTP (`src/debug/network_security_config.xml`). Release APKs require HTTPS.

---

## Portals on Android

| Portal | Native support |
|--------|----------------|
| Customer | Full |
| Technician | Full |
| Admin | Web-only — deep links to `/admin/*` redirect to `/` inside Capacitor |

Pick a role at `/select-role` after install.

---

## Common fixes

| Symptom | Fix |
|---------|-----|
| Gradle sync fails / “invalid source release 21” | Point Gradle JDK to 21; run `npm run android:validate` |
| Unknown host / could not resolve dependency | Check internet, disable Gradle offline mode, confirm `google()` + `mavenCentral()` |
| `cap` “android platform not found” | You are in the wrong folder — use nested `FIXNOW APP\FIXNOW APP` |
| App launches but API “Network error” on phone | `npm run android:lan:write`, rebuild + sync; backend `HOST=0.0.0.0` |
| Emulator API OK, phone not | Phone cannot use `10.0.2.2` — set `VITE_DEV_LAN_HOST` |
| Push never arrives | Add real `google-services.json` |
| Release build unsigned | Add `keystore.properties` + `.jks` |
| Blank / white screen | Rebuild web assets: `npm run build && npx cap sync android` |
| Stale UI after code change | Always rebuild before sync (`cap:sync` already does) |

---

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run android:validate` | Preflight (JDK, SDK, Capacitor, env) |
| `npm run android:validate:strict` | Preflight + Gradle `:app:tasks` |
| `npm run android:assemble` | `assembleDebug` with JDK 21 |
| `npm run android:lan` / `:write` | Detect / persist LAN host |
| `npm run parity:android` | Web ↔ Android config gate |
| `npm run mobile:android` | Build, sync, open Studio |
| `npx cap doctor` | Capacitor health (Android OK; Xcode warning expected on Windows) |

---

## Version matrix (locked by project files)

- `android/gradle/wrapper/gradle-wrapper.properties` → Gradle 8.14.3  
- `android/build.gradle` → AGP 8.13.0, Google Services 4.4.4  
- `android/variables.gradle` → SDK 24/36/36  
- `android/app/capacitor.build.gradle` → Java 21  
- `package.json` → Capacitor 8.4.2  
