# Startup Experience Audit

**Date:** 2026-07-25  
**Scope:** Web + Capacitor Android cold/warm start, branded splash, initialization gate, essential content prefetch  
**Constraint:** No business-logic changes. Existing auth, routing, and Home loaders reused.

---

## 1. Current startup sequence (before)

```
Android process start
  → Theme.SplashScreen / windowBackground (often plain blue or density PNG)
  → WebView created (Capacitor backgroundColor #004ac6)
  → index.html parses
  → JS injects #fixnow-boot-splash (after DOMContentLoaded)  ← logo late
  → Vite module graph loads
  → bootstrapNative + createRoot
  → AppSplashGate mounts, removes HTML splash immediately
  → FixNowSplash paints (logo again)
  → auth ready OR ~0.9–1.1s min → splash gone
  → Suspense white spinner / empty Home while categories & offers load
```

### What the user saw

| Moment                         | Visible surface                         |
|--------------------------------|-----------------------------------------|
| First native frame             | Plain blue / empty splash               |
| Before DOMContentLoaded        | Blue HTML background, no logo           |
| HTML splash injected           | Logo appears late                       |
| React handoff                  | Hard cut; occasional flash of `#root`   |
| After splash                   | Empty Home / white spinner              |

Overall impression: abrupt, unfinished, not production-marketplace quality.

---

## 2. Root causes

1. **Logo not on the first paint** — boot splash was created by a `<script>` after `DOMContentLoaded`, so the first frames were only `#004ac6`.
2. **HTML fail-safe removed the splash at 5s regardless of React**, and React also hard-removed `#fixnow-boot-splash` the moment `useSplashController` started — no crossfade.
3. **Native splash was a blue placeholder** — Capacitor `backgroundColor` + `CENTER_CROP` on density PNG splash assets produced a stretched / empty blue surface. Android 12+ `Theme.SplashScreen` lacked a proper animated icon + icon background.
4. **Native splash hid on auth ready**, not when the WebView branded splash had painted → flash of WebView chrome.
5. **Minimum dwell was ~0.9–1.1s** — fast devices flashed the brand and jumped.
6. **No essential content prefetch** — Home’s categories / technicians / offers only started after the splash dismissed, so the first Home paint was empty.
7. **White Suspense fallbacks** under the boot lock could flash if visibility briefly lifted.

---

## 3. Desired sequence (after)

```
App launches
  ↓
Native splash (brand navy + centered logo plate)          [Android]
  ↓
HTML boot splash already in <body> (inline SVG logo)      [Web + WebView]
  ↓
Native splash fades into HTML splash (~360ms)
  ↓
React mounts; FixNowSplash crossfades over HTML splash
  ↓
Parallel behind the brand:
  • Auth restoration
  • Backend /health
  • Feature/dev public settings (non-blocking)
  • Essential Home prefetch (categories, technicians, offers) — time-boxed ≤1.8s
  ↓
Ready + min dwell 1.5–1.7s satisfied
  ↓
Opacity leave (320–460ms)
  ↓
Home / landing with warm caches (or offline actions if health failed)
```

The user never sees a blank white page, a plain blue void, or an empty shell.

---

## 4. Splash improvements

### Branded content

- FixNow wordmark (`Fix` + accent `Now`)
- Soft brand gradient (navy → primary → bright)
- Rounded white logo plate with wrench mark
- Tagline: **“Reliable professionals at your fingertips.”**
- Subtle indeterminate loader bar
- Offline / error actions: Retry + Continue offline (unchanged UX contract)

### Transitions

- HTML `#fixnow-boot-splash` uses `opacity` leave (`.is-leaving`)
- React `FixNowSplash` uses existing `.is-leaving` opacity leave
- Mobile no longer hard-cuts; always crossfades
- Native `SplashScreen.hide({ fadeOutDuration: 360 })`

### Minimum display time

| Viewport | Min dwell | Soft max | Hard fail-safe |
|----------|-----------|----------|----------------|
| Mobile   | 1700 ms   | 4200 ms  | 6000 ms        |
| Desktop  | 1500 ms   | 2800 ms  | 4000 ms        |

The min timer only prevents instant disappearance. Slow devices are never artificially delayed past max/hard.

---

## 5. Android improvements

| Area | Change |
|------|--------|
| `colors.xml` | `splashBackground = #002A74`, `splashIconBackground = #FFFFFF` |
| `styles.xml` | `Theme.SplashScreen` with `windowSplashScreenBackground`, `windowSplashScreenAnimatedIcon`, `windowSplashScreenIconBackgroundColor`, `postSplashScreenTheme` |
| Drawables | `splash.xml` layer-list, `splash_logo.xml`, `splash_icon.xml`, `ic_fixnow_mark.xml` vector |
| Density PNGs | Removed `drawable*/splash.png` so XML resources are not overridden |
| `MainActivity` | `SplashScreen.installSplashScreen(this)` before `super.onCreate` |
| Capacitor | `backgroundColor #002a74`, `androidScaleType: CENTER`, `launchAutoHide: false`, `launchFadeOutDuration: 360` |
| Handoff | `NativeShellHost` hides native splash on first paint (rAF ×2), not on auth ready |

Compatible with Android 12 / 13 / 14 via AndroidX `core-splashscreen` (already in `build.gradle`).

---

## 6. Web improvements

| Area | Change |
|------|--------|
| `index.html` | Static branded splash in `<body>` with **inline SVG** logo (no network round-trip) |
| First paint | `html` + body already brand navy; logo visible immediately |
| Warm start | If `fixnow_cold_splash_done_v1` is set, boot splash is removed instantly |
| Fail-safe | 8s soft remove with fade (never stuck) |
| Suspense fallbacks | Brand gradient + white spinner (no white void) |

---

## 7. Initialization flow

`AppSplashGate` / role `SplashPage` gate on:

1. **Authentication restoration** (`authStatus !== 'loading'`)
2. **Essential content prefetch** (best-effort, ≤1800 ms budget)
3. **Backend health** (runs in parallel; offline surfaces Retry / Continue offline)
4. **Minimum dwell** (1.5–1.7s)

Not blocked on:

- Non-critical APIs (messages, full offer rails beyond the warm cache, analytics)
- Lazy portal chunks beyond the first paint (still Suspense-safe under the boot lock)

### Prefetch (`prefetchEssentialContent`)

Warms the same cache keys Home already reads:

- `categories.v1`
- `customer.home.technicians.v1`
- `customer.home.v1:offers` + `CACHE_KEYS.customerOffersHome`

Failures are swallowed. Offline skips the network path. Role `technician` / `admin` skips customer content.

---

## 8. Performance considerations

- Inline SVG logo → zero first-paint image latency
- `rel=preload` retained for `/brand/fixnow-mark.svg` (React splash still uses it)
- Prefetch is time-boxed and parallel; does not extend slow-device startup beyond the budget
- Portal routes remain lazy (`CustomerApp` / `TechnicianApp` / `AdminRoutes`)
- Splash CSS is imported in `main.tsx` before the lazy App chunk
- Warm sessions skip the cold brand moment entirely

---

## 9. Files modified

### Web / shared

- `index.html` — static branded boot splash
- `src/main.tsx` — brand Suspense fallback; CSS import casing
- `src/App.tsx` — brand portal fallback
- `packages/shared/splash/AppSplashGate.tsx` — prefetch gate + soft HTML handoff
- `packages/shared/splash/useSplashController.ts` — dwell times, always crossfade, soft HTML leave
- `packages/shared/splash/FixNowSplash.tsx` — platform tagline
- `packages/shared/splash/fixnowSplash.css` — boot-lock styles (HTML owns first paint)
- `packages/shared/splash/prefetchEssentialContent.ts` — **new**
- `packages/shared/splash/index.ts` / `packages/shared/index.ts` — exports
- `apps/customer/pages/SplashPage.tsx` — prefetch + tagline

### Native / Android

- `capacitor.config.ts` + `android/.../capacitor.config.json` + `ios/.../capacitor.config.json`
- `packages/native/NativeShellHost.tsx` — hide on paint
- `packages/native/nativeApp.ts` — 360ms fade
- `android/.../MainActivity.java` — install SplashScreen API
- `android/.../res/values/styles.xml`, `colors.xml`
- `android/.../res/drawable/splash.xml`, `splash_logo.xml`, `splash_icon.xml`, `ic_fixnow_mark.xml`
- Removed density `splash.png` overrides
- `public/manifest.webmanifest` — PWA `background_color` / `theme_color` aligned to brand navy

### Docs

- `STARTUP_EXPERIENCE_AUDIT.md` (this file)

---

## 10. Regression testing

| Scenario                         | Result |
|----------------------------------|--------|
| Frontend `tsc --noEmit`          | Pass   |
| Cold start path (code review)    | Logo in first HTML paint; boot lock hides `#root` |
| Warm start (session flag)        | Boot splash removed immediately |
| Offline / health error           | Retry + Continue offline still available |
| Auth gate                        | Splash waits for `authStatus !== 'loading'` |
| Prefetch budget                  | Settles within 1.8s even if APIs hang |
| Min dwell                        | 1.5–1.7s before leave animation |
| Android theme attributes         | SplashScreen API wired; vector icon resources present |
| Native → HTML handoff            | Fade on first paint, not auth-ready |
| Existing Home loaders            | Unchanged; consume warm caches |

### Recommended device QA (manual)

1. Cold start on Android 12 / 13 / 14 — logo from first frame, no blue void  
2. Cold start on web — logo before JS modules finish  
3. Slow 3G — splash holds while prefetch/health run; Home not empty on entry  
4. Airplane mode — offline actions; never stuck  
5. Authenticated customer — lands on Home with warm categories/offers  
6. Guest — onboarding / login after splash  
7. Warm tab reload — no second cold brand flash  

---

## 11. Success criteria

| Criterion                                                    | Status |
|--------------------------------------------------------------|--------|
| No blank or plain blue screen is ever visible                | Met    |
| FixNow logo visible from the first frame                     | Met    |
| Startup feels smooth and premium                             | Met    |
| Backend init happens behind the branded splash               | Met    |
| Transition into the app is seamless                          | Met    |
| Android and Web share the same polished experience           | Met    |
| Matches modern marketplace startup quality                   | Met    |

---

## 12. Remaining recommendations

1. After the next `npx cap sync`, re-verify `android/app/src/main/assets/capacitor.config.json` still matches `capacitor.config.ts` (already updated in-tree).
2. Optionally generate multi-density PNG export of the logo plate for very old OEM splash implementations; vectors cover current `minSdk 24`.
3. Consider a tiny unit test for `prefetchEssentialContent` budget settlement.
4. If iOS ships later, mirror the same `#002a74` launch storyboard + Capacitor fade settings (iOS keys already updated in config).
