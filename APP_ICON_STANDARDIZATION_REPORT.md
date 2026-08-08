# App Icon Standardization Report

**Date:** 2026-07-26  
**Goal:** One master FixNow icon geometry → every platform size  
**Occupancy lock:** wrench path viewBox = **58%** of canvas · padding ≈ **21%**

---

## 1. Previous inconsistencies

| Issue | Detail |
|------|--------|
| Oversized web mark | `fixnow-mark.svg` drew the wrench at ~full 24×24 plate |
| Heavier launcher masters | `icon-only` used ~69% path occupancy |
| Adaptive mismatch | Foreground ~70% **plus** 16.7% XML inset |
| Splash plate drift | Splash SVG wrench ~75% of the blue plate |
| Monochrome drift | 24-unit path inset only 4 units on a 32 viewport (~75%) |
| UI double plating | Landing / role-select nested the mark inside another blue square |
| No single source | SVG numbers were hand-edited in multiple files |

---

## 2. Master icon selected

**Canonical module:** `scripts/brand-geometry.mjs`

- Color: `#004AC6` background, `#FFFFFF` wrench (unchanged)
- Glyph: existing FixNow wrench path (unchanged)
- Corner ratio: `5.25/24` for rounded web marks
- Scale rule: `size = canvas * 0.58`, centered

Do **not** hand-edit derived PNGs or per-platform SVG copies. Change geometry once, then run:

```bash
npm run assets:generate
npm run assets:verify
```

---

## 3. Assets regenerated

### Web / PWA
- `favicon.svg`, `favicon-16.png`, `favicon-32.png`
- `apple-touch-icon.png` (180)
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
- `mstile-150.png`, `notification-badge-96.png`
- `manifest.webmanifest` icon entries

### Android
- `ic_launcher` / `ic_launcher_round` — mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi
- Adaptive background + foreground mipmaps
- `ic_launcher_monochrome.xml` (Android 13+)
- Splash `splash_icon.xml` / `splash_logo.xml` at 58% wrench
- Large notification PNG in `drawable-nodpi`

### iOS
- Full `AppIcon.appiconset` (20–83.5 slots + `AppIcon-512@2x.png` 1024)

### Source masters
- `resources/icon-only.svg|.png`
- `resources/icon-foreground.svg|.png`
- `resources/icon-background.svg|.png`
- `resources/splash.svg|.png`, `splash-dark.svg|.png`

---

## 4. Platforms updated

| Platform | How it consumes the master |
|---------|----------------------------|
| Web login / splash / portals | `public/brand/fixnow-mark.svg` |
| Browser tab | `favicon.svg` + PNG favicons |
| PWA | manifest icons from `icon-only` |
| Android launcher | Capacitor assets from `icon-only` + adaptive layers |
| Android 13 themed icon | `ic_launcher_monochrome.xml` (58%) |
| Android splash | Layer-list plates sizing wrench to 58% |
| iOS home / settings / App Store | AppIcon set from `icon-only` |

---

## 5. Files modified

### New
- `scripts/brand-geometry.mjs`
- `scripts/write-brand-masters.mjs`
- `FIXNOW_BRANDING_RECOVERY_REPORT.md`
- `APP_ICON_STANDARDIZATION_REPORT.md`

### Updated (pipeline + verify)
- `package.json`
- `scripts/prepare-brand-sources.mjs`
- `scripts/finalize-brand-assets.mjs`
- `scripts/verify-brand-assets.mjs`

### Updated (Android proportion wiring)
- `android/.../drawable/ic_launcher_monochrome.xml`
- `android/.../drawable/splash_icon.xml`
- `android/.../drawable/splash_logo.xml`
- `android/.../mipmap-anydpi-v26/ic_launcher.xml` (+ round)
- `android/.../mipmap-anydpi-v33/ic_launcher.xml` (+ round)

### Updated (UI consistency)
- `src/PlatformLanding.tsx`
- `packages/shared/auth/RoleSelectPage.tsx`
- `apps/admin/pages/LoginPage.tsx`
- `apps/admin/pages/SetupPage.tsx`
- `apps/admin/pages/AcceptInvitePage.tsx`

### Regenerated binary/SVG outputs
- `resources/*`, `public/brand/*`, `public/favicon.svg`, `public/assets/icons/*`
- `ios/.../AppIcon.appiconset/*`
- `android/.../mipmap-*/*`

---

## 6. Visual verification

| Check | Result |
|------|--------|
| `npm run assets:verify` | Passed |
| Web mark `scale(0.58)` | Present |
| Master PNG white-ink occupancy | Within restored breathing-room band |
| Adaptive safe zone | Foreground inside 12% margins |
| Adaptive XML inset | Removed (no double-shrink) |
| iOS slots | 18 entries, correct pixel sizes, no alpha |
| Android densities | 48 / 72 / 96 / 144 / 192 |
| Login shells | Share `/brand/fixnow-mark.svg` |
| Double blue plate | Removed from landing + role select |

### Proportion recipe (do not diverge)

```text
canvas
 └── 21% pad
 └── 58% wrench path viewBox (centered)
 └── 21% pad
```

Ink bbox is slightly under 58% because the Material path already includes a little empty space inside its 24×24 box — that is expected and matches the premium padded look.

---

## Success criteria

- Icon matches the original padded reference style
- Oversized wrench removed everywhere the master is used
- Android, iOS, and Web share identical 58% geometry
- Future changes go through `brand-geometry.mjs` only
