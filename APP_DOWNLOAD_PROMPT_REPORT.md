# App Download Prompt Report

**Date:** 2026-07-26  
**Feature:** Mobile-web App Download Reminder  
**Surfaces:** Customer + Technician authenticated shells  

---

## 1. Trigger logic

The reminder never appears on cold launch. It requires **meaningful engagement** and an eligible surface.

| Trigger | Condition |
|---------|-----------|
| Deferred active use | ~**4 minutes** (+ 90s stagger vs location education) inside the shell |
| Page views | **≥ 3** distinct non-blocked routes; may fire earlier after ~90s |
| Post a job | Customer navigates to `/customer/tracking/:id` or `signalEngagement('post_job')` |
| Open chat | Conversation open (`ChatThread`) or `/…/messages/:id` |
| Technician jobs / availability | Path heuristics for nearby jobs / go-online |

**Hard exclusions (never show):**

- Capacitor Android / iOS native apps (`isNativePlatform()`)
- Desktop browsers (non-mobile UA)
- Installed PWA (`display-mode: standalone` / iOS `navigator.standalone`)
- Auth, onboarding, payments, account-delete, splash / role-select, Admin
- Kill switch `VITE_APP_DOWNLOAD_PROMPT_ENABLED=false`
- Active suppression prefs (see §5)

**UI:** polished `BottomSheet` (non-blocking). Backdrop dismiss = “Maybe Later”.

---

## 2. Platform detection

| Check | Implementation |
|-------|----------------|
| Native app | `isNativePlatform()` → **suppress** |
| PWA installed | `isPwaStandalone()` → **suppress** |
| Mobile web | `isMobileWebBrowser()` (UA / `userAgentData.mobile` / iPadOS desktop UA) |
| Store target | `detectStorePlatform()` → `android` \| `ios` \| `unknown` |

**Routing:**

- Android mobile web → Google Play URL  
- iOS mobile web → Apple App Store URL  
- Unknown → first available configured store URL, else Coming Soon  

Module: `packages/native/mobileWeb.ts`

---

## 3. Deep-link flow

On **Download the App**:

1. Analytics: `download_clicked`
2. Build deep link from `VITE_APP_DOWNLOAD_DEEP_LINK` (default `fixnow://`) + role path (`customer/home` or `technician/dashboard`)
3. Attempt open via hidden iframe + `location.href`
4. If the page hides/blurs within ~1.6s → treat as **app opened** (`deep_link_opened`)
5. Otherwise fall back to store URL (`store_opened`)

Universal / custom-scheme hosts already match FixNow’s `APP_SCHEME` / App Links story (`packages/native/deepLinks.ts`).

---

## 4. Store redirection

| Env var | Purpose |
|---------|---------|
| `VITE_PLAY_STORE_URL` | Google Play listing |
| `VITE_APP_STORE_URL` | Apple App Store listing |
| `VITE_ANDROID_STORE_URL` / `VITE_IOS_STORE_URL` | Optional aliases |
| `VITE_APP_DOWNLOAD_DEEP_LINK` | Scheme/base for installed-app open |
| `VITE_APP_DOWNLOAD_PROMPT_ENABLED` | Feature kill switch (default on) |
| `VITE_APP_RELEASE_VERSION` | Invalidates “Don’t show again” on major bump |

**Unpublished stores:** if the platform URL is empty → sheet mode **Coming Soon** (no broken links). No redirect attempted.

---

## 5. Reminder suppression rules

| Choice | Behavior |
|--------|----------|
| Maybe Later | Suppress **7 days** (`laterUntil`) |
| Don’t show again | Suppress until `VITE_APP_RELEASE_VERSION` changes |
| Backdrop close | Same as Maybe Later |
| Session | At most **one** prompt per browser session |
| Prefs keys | `fixnow.app.download.prompt.{customer\|technician}.v1` |

---

## 6. Analytics events

Recorded via `recordInfoDiagnostic` → `window.__FIXNOW_DIAG__` ring (`category: 'app_download'`).

| Event | When |
|-------|------|
| `prompt_displayed` | Sheet opens (store available) |
| `coming_soon_shown` | Sheet opens without store URLs / fallback |
| `download_clicked` | Primary CTA tapped |
| `deep_link_opened` | Heuristic success opening native app |
| `store_opened` | Navigated to Play / App Store |
| `prompt_dismissed_later` | Maybe Later / Got it / backdrop |
| `prompt_dismissed_never` | Don’t show again |

Meta includes `role`, `platform`, `trigger`, `storePublished` where relevant. **Not** shown in the UI.

---

## 7. Accessibility review

- Uses shared `BottomSheet` (dialog, focus trap, Escape, restore focus)
- Primary / secondary controls ≥ **44–56px** touch targets
- `aria-label` on Download includes store name
- Don’t show again is a clear text control (not icon-only)
- Copy is high-contrast on canvas white
- Non-modal sheet: user can dismiss without losing page context
- Reduced-motion: inherits sheet / focus-trap behavior from design system

---

## 8. Production deployment checklist

- [ ] Set real `VITE_PLAY_STORE_URL` and `VITE_APP_STORE_URL` only when listings are live  
- [ ] Until then, leave URLs empty → Coming Soon (safe)  
- [ ] Confirm `VITE_APP_DOWNLOAD_PROMPT_ENABLED=true` in production `.env`  
- [ ] Set `VITE_APP_RELEASE_VERSION` for this release train  
- [ ] Verify `fixnow://` / App Links open the installed app on Android & iOS  
- [ ] QA matrix:
  - [ ] Android Chrome mobile web → Play path  
  - [ ] iOS Safari mobile web → App Store path  
  - [ ] Desktop Chrome/Safari → **no** prompt  
  - [ ] Capacitor Android/iOS builds → **no** prompt  
  - [ ] PWA standalone → **no** prompt  
  - [ ] Payments / login → **no** prompt  
  - [ ] Maybe Later → suppressed 7 days  
  - [ ] Don’t show again → suppressed until version bump  
- [ ] Confirm diagnostics events appear in `__FIXNOW_DIAG__`  
- [ ] Visual check vs AI FAB / bottom nav (sheet `z-[70]`)

---

## Files added / updated

| Path | Change |
|------|--------|
| `packages/native/mobileWeb.ts` | Mobile web / PWA / store platform detection |
| `packages/shared/appDownload/*` | Policy, prefs, analytics, deep-link opener, sheet, host |
| `apps/customer/components/CustomerShell.tsx` | Host mount |
| `apps/technician/components/layout/AppShell.tsx` | Host mount |
| `apps/customer/pages/PostJobPage.tsx` | `post_job` signal |
| `packages/shared/ChatThread.tsx` | `open_chat` signal |
| `src/vite-env.d.ts` | Env typings |
| `.env.example` / `.env.*.example` | Documented store + prompt vars |

---

## Copy (summary)

**Customer:** “Get the FixNow app” — booking, live tracking, payments.  
**Technician:** “Work better in the FixNow app” — alerts, navigation, tracking.  
**Unpublished:** “Native app coming soon” / technician variant.
