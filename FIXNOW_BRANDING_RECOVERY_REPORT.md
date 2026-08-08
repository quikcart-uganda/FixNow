# FixNow Branding Recovery Report

**Date:** 2026-07-26  
**Scope:** Restore original FixNow icon proportions across Web, Android, and iOS  
**Constraint:** No redesign — same wrench, same brand blue (`#004AC6`), same corner ratio; only occupancy/padding recovered

---

## 1. Root cause of branding regression

The white wrench was authored as a full 24×24 Material-style path and then placed into brand surfaces **without the original breathing room**.

| Surface | Before recovery | Effect |
|--------|-----------------|--------|
| `public/brand/fixnow-mark.svg` / `favicon.svg` | Path filled nearly the entire 24×24 plate | Login, splash, and browser tab marks looked oversized and cramped |
| `resources/icon-only.svg` | Path viewBox scaled to ~69% of canvas (`translate(160)` / `scale(29.33)`) | Launcher / PWA / iOS masters felt heavy |
| `resources/icon-foreground.svg` | ~70% occupancy | Adaptive foreground crowded the safe zone |
| Adaptive XML | Extra `android:inset="16.7%"` on top of large foreground | Inconsistent double-scaling across OEM masks |
| UI shells | Mark nested inside a second blue rounded square (Platform Landing, Role Select) | Double plate + visually distorted weight |

`scripts/finalize-brand-assets.mjs` also re-emitted the oversized web mark on every `assets:generate`, so the regression was sticky.

---

## 2. Master asset restored

**Single geometry source:** `scripts/brand-geometry.mjs`

| Token | Value |
|------|-------|
| Brand blue | `#004AC6` |
| Wrench path | unchanged Material-style build glyph |
| Path viewBox | 24×24 |
| **Wrench occupancy** | **58%** of canvas (inside 55–60% target) |
| **Padding** | **21%** equal on all sides |
| Corner ratio | `5.25 / 24` (≈21.875%) |

Masters are written by `scripts/write-brand-masters.mjs`:

- `resources/icon-only.svg` — full-bleed launcher/PWA/iOS source
- `resources/icon-foreground.svg` — adaptive white wrench
- `resources/icon-background.svg` — solid brand blue
- `resources/splash.svg` / `splash-dark.svg` — centered plate with same 58% wrench
- `public/brand/fixnow-mark.svg` — web/login/splash mark
- `public/favicon.svg`
- `public/safari-pinned-tab.svg`

Pipeline:

```text
write-brand-masters → prepare-brand-sources → capacitor-assets generate → finalize-brand-assets → assets:verify
```

---

## 3. Assets regenerated

- Android mipmap launcher / round / foreground / background (mdpi → xxxhdpi)
- Android adaptive + monochrome vectors
- Android splash icon plates (`splash_icon`, `splash_logo`) at 58% wrench
- iOS `AppIcon.appiconset` (all slots + 1024 marketing)
- PWA / web: favicon 16/32, apple-touch 180, icon 192/512, maskable 512, mstile 150
- Notification badge + large notification PNG
- Capacitor splash PNGs from restored splash SVGs

---

## 4. Files modified

### Brand pipeline
- `scripts/brand-geometry.mjs` *(new)*
- `scripts/write-brand-masters.mjs` *(new)*
- `scripts/prepare-brand-sources.mjs`
- `scripts/finalize-brand-assets.mjs`
- `scripts/verify-brand-assets.mjs`
- `package.json` (`assets:generate` now starts with `write-brand-masters`)

### Master / derived artwork
- `resources/icon-*.svg`, `resources/splash*.svg` (+ generated PNGs)
- `public/brand/fixnow-mark.svg`, `public/favicon.svg`, `public/safari-pinned-tab.svg`
- `public/assets/icons/*`
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/*`
- `android/app/src/main/res/mipmap-*/*`
- `android/app/src/main/res/drawable/ic_launcher_monochrome.xml`
- `android/app/src/main/res/drawable/splash_icon.xml`
- `android/app/src/main/res/drawable/splash_logo.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml`
- `android/app/src/main/res/mipmap-anydpi-v33/ic_launcher*.xml`

### Screens / shells
- `src/PlatformLanding.tsx` — removed double blue plate
- `packages/shared/auth/RoleSelectPage.tsx` — same
- `apps/admin/pages/LoginPage.tsx` — bootstrap + login use master mark
- `apps/admin/pages/SetupPage.tsx`
- `apps/admin/pages/AcceptInvitePage.tsx`

Auth shells already pointed at `/brand/fixnow-mark.svg` (Customer / Technician / Forgot Password) and now inherit restored proportions automatically.

---

## 5. Screens updated

| Surface | Status |
|--------|--------|
| Customer login / forgot / reset | Master mark via `AuthShell` |
| Technician login / forgot / reset | Master mark via `AuthShell` |
| Admin login / bootstrap / setup / invite | Master mark |
| Platform landing / role select | Single master mark (no nested plate) |
| Web splash (`FixNowSplash`) | Master mark |
| Browser tab / PWA / apple-touch | Regenerated from master |
| AI Assistant FAB | Unchanged decorative glyph (not the app icon); brand mark elsewhere restored |

---

## 6. Platforms verified

`npm run assets:verify` passed:

- 18 iOS AppIcon slots sized correctly, no transparency
- Android mdpi–xxxhdpi launcher + round sizes
- Adaptive foreground within safe zone; ink occupancy in restored range
- Master `icon-only.png` padding/occupancy checks
- Web mark contains `scale(0.58)` and `#004AC6`
- Adaptive XML no longer applies inset (prevents double-shrink)
- PWA manifest 192 / 512 / maskable present
- Notification small icon still wired in `AndroidManifest.xml`

---

## Success criteria

- Branding matches the original padded wrench style (55–60% occupancy)
- Oversized edge-to-edge wrench removed from web mark and masters
- One geometry module drives every regenerated platform asset
- Android, iOS, and Web share the same restored proportions
