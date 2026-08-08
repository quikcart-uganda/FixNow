# Native Branding Icon Report

**Date:** 26 Jul 2026  
**Mission:** Replace Capacitor / Android / iOS / PWA placeholders with the official FixNow blue rounded-square white-wrench mark.

---

## Source of truth

Canonical geometry lives in `scripts/brand-geometry.mjs`:

- Brand blue: `#004AC6`
- Splash navy: `#002A74` / dark `#001A49`
- White wrench path (exact existing login/splash mark)
- Locked occupancy: **58%** canvas with equal padding (~21%)
- No logo redesign — only reuse + rasterization

Masters are written by `scripts/write-brand-masters.mjs` into:

- `resources/icon-only.svg`
- `resources/icon-foreground.svg`
- `resources/icon-background.svg`
- `resources/splash.svg` / `splash-dark.svg`
- `public/brand/fixnow-mark.svg`
- `public/favicon.svg`
- `public/safari-pinned-tab.svg`

---

## What was replaced

| Surface | Before | After |
| --- | --- | --- |
| Android launcher / round / adaptive | Capacitor robot + teal grid | FixNow wrench + `#004AC6` |
| Android 13 monochrome | Missing | `ic_launcher_monochrome.xml` |
| Android notification small icon | Coloured launcher mipmap | Monochrome `ic_stat_fixnow` |
| iOS AppIcon | Capacitor placeholder 1024 | Full AppIcon set + opaque 1024 marketing |
| iOS Splash | Capacitor splash | Branded navy + FixNow plate (light/dark) |
| PWA / favicon | Lightning-bolt mark / wrong purple | Official wrench mark + PNG 192/512/maskable |
| Auth / Admin login logos | Material icon glyphs | `/brand/fixnow-mark.svg` |

---

## Platform coverage

### Android
- Densities: ldpi → xxxhdpi for launcher, round, foreground, background
- Adaptive icons: `mipmap-anydpi-v26` + monochrome in `mipmap-anydpi-v33`
- Splash density + night variants regenerated
- FCM default small icon → `@drawable/ic_stat_fixnow`
- Large notification asset → `drawable-nodpi/ic_notification_large.png`

### iOS
- Full `AppIcon.appiconset` Contents.json (iPhone, iPad, Spotlight, Settings, Notification, App Store)
- Opaque icons (no transparency)
- Splash.imageset light + dark masters

### PWA / Web
- `manifest.webmanifest`: 192 / 512 / maskable 512
- Favicon SVG + 16/32 PNG
- Apple touch icon + Safari pinned tab
- Apple startup images (light/dark)
- Service worker icons bumped to branded PNGs (`fixnow-shell-v2`)

### Capacitor
- `capacitor.config.ts` already points splash to FixNow navy + `splash` resource
- `npx cap copy android|ios` completed after Vite production build

---

## Tooling

```bash
npm run assets:generate   # rewrite masters → Capacitor assets → finalize
npm run assets:verify     # size / transparency / occupancy / manifest checks
```

Latest verify:

> Verified 18 iOS icon slots, Android density icons, adaptive/monochrome resources, PWA icons, and restored 58% wrench proportions.

---

## Device testing status

| Check | Status |
| --- | --- |
| Asset geometry / sizes / no transparency | Pass (`assets:verify`) |
| Vite production build | Pass |
| Capacitor copy android/ios | Pass |
| Android Gradle assembleDebug | Blocked on this machine (no JDK 21 toolchain) |
| Emulator / Pixel / Samsung / iPhone sim / browser install | Needs local device run |

To confirm on device after installing JDK 21:

```bash
npm run assets:generate
npm run assets:verify
npm run cap:run:android
npm run cap:run:ios
```

Then visually confirm launcher, recents, splash, notification tray, and PWA install prompt.
