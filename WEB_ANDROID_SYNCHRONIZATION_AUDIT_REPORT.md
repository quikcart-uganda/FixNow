# Web ↔ Android Synchronization Audit Report

**Product:** FixNow Unified Platform  
**Date:** 2026-07-28  
**Scope:** Customer Web · Technician Web · Admin Web · Customer Android (Capacitor) · Technician Android (Capacitor) · Admin Android (policy)  
**Method:** Codebase audit of shared SPA, Capacitor shell, backend engines, native bridges, and automated parity gate — **no assumption that Web and Android were already synchronized.**

---

## 1. Executive summary

**Verdict: FixNow is already a single-implementation platform.** Capacitor Android is a presentation shell that loads the same Vite React SPA (`webDir: 'dist'`) used on the web. There is **no second Customer/Technician UI codebase** under `android/`. Business rules, APIs, entitlements, subscriptions, RBAC, messaging, jobs, payments, CMS, offers, ads, and AI all live in the shared frontend packages and the Node/Express backend.

| Question | Answer |
|---|---|
| Same React app on Web + Android? | **Yes** — one `src/App.tsx` + `apps/{customer,technician,admin}` |
| Same backend / APIs? | **Yes** — `packages/api` + `VITE_API_URL` / LAN rewrite |
| Android-only business rules? | **None found** |
| Admin on Android? | **Intentionally disabled** (`AdminPortalGate` → `/`) |
| Feature drift risk? | **Operational** (APK ships a static `dist` snapshot; needs `mobile:sync` / store release) — not a dual-codebase drift |
| Automated gate? | **Yes** — `npm run parity:android` / `parity:web-android` |

**Functional parity (Customer + Technician):** Complete for shared screens and APIs.  
**Admin parity on Android:** N/A by product policy (web-only operations console).  
**Remaining gaps:** push channel differs (FCM vs VAPID), no OTA live-update, biometric is probe-only, release APK can lag web until rebuilt.

---

## 2. Feature parity matrix

Status legend: **Complete** · **Partial** · **Missing** · **Broken** · **N/A (by design)**

| Feature | Backend | Web | Android | Status | Notes |
|---|---|---|---|---|---|
| Shared SPA shell | — | Yes | Yes (Capacitor WebView) | Complete | `capacitor.config.ts` → `dist` |
| Auth (email / password / OTP) | Yes | Yes | Yes | Complete | Same screens + token storage |
| Google login | Yes | GIS | System browser bridge | Complete | Intentional native path |
| Guest mode | Yes | Yes | Yes | Complete | Shared guest session + AI guest |
| Password reset | Yes | Yes | Yes | Complete | |
| Remember me / sessions / JWT | Yes | Yes | Yes + Keystore mirror | Complete | `secureStorage` on native |
| Role resolution | Yes | Yes | Yes | Complete | Same AuthProvider |
| Subscription / entitlement engine | Yes | Yes | Yes | Complete | `entitlements.service` + same APIs |
| Customer home / categories / search | Yes | Yes | Yes | Complete | |
| Technician profiles / post job / applications | Yes | Yes | Yes | Complete | |
| Messaging | Yes | Yes | Yes | Complete | Socket + offline queue |
| Payments / escrow flows | Yes | Yes | Yes + Custom Tabs | Complete | Same checkout APIs |
| Reviews / notifications inbox | Yes | Yes | Yes | Complete | |
| Offers / ads / CMS content | Yes | Yes | Yes | Complete | Same delivery APIs |
| AI assistant | Yes | Yes | Yes | Complete | Shared panel + orchestration |
| Maps / location | Yes | Yes | Yes + Geolocation plugin | Complete | |
| Saved offers / favourites | Yes | Yes | Yes | Complete | |
| Technician dashboards (starter / pro / business) | Yes | Yes | Yes | Complete | |
| Jobs / portfolio / gallery / marketing | Yes | Yes | Yes | Complete | |
| Upgrade / plans / subscription centre / boosts / billing | Yes | Yes | Yes | Complete | Same router paths |
| Availability / settings | Yes | Yes | Yes | Complete | |
| Admin dashboard & modules | Yes | Yes | Gated off | N/A (by design) | Web operations console |
| Admin RBAC / capabilities | Yes | Yes | N/A | Complete (web) | |
| Development sandbox / Dev Admin | Yes | Yes | N/A | Complete (web) | Auto-disable after Super Admin |
| Push notifications | Yes | VAPID | FCM | Partial | Same inbox + deep links; transport differs |
| Deep links / App Links | Yes | URL | Yes | Complete | Admin paths → `/` on native |
| Offline queue / resume resync | Yes | Partial | Yes | Complete | `offlineQueue` + `fixnow:resync` |
| Biometric login | — | No | Probe only | Partial | Availability API only; no unlock UX |
| OTA / live update | — | CDN | No | Missing | Requires rebuild + store/APK sync |
| Hardcoded Android marketplace data | — | — | None found | Complete | |

Automated snapshot: run `npm run parity:android` (writes `scripts/.web-android-parity-latest.json`).

---

## 3. Customer parity

| Screen / capability | Web | Android | Same API? |
|---|---|---|---|
| Onboarding / login / register / forgot password | ✅ | ✅ | ✅ |
| Guest browse + guest AI | ✅ | ✅ | ✅ |
| Home | ✅ | ✅ | ✅ |
| Categories | ✅ | ✅ | ✅ |
| Search + technician profile | ✅ | ✅ | ✅ |
| Post job / my jobs / applications | ✅ | ✅ | ✅ |
| Tracking | ✅ | ✅ | ✅ |
| Messages / chat | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ |
| Offers / saved offers / offer detail | ✅ | ✅ | ✅ |
| Payments / pay / success / receipt | ✅ | ✅ | ✅ |
| Profile / settings / help / delete account | ✅ | ✅ | ✅ |
| CMS / legal content documents | ✅ | ✅ | ✅ |
| Bookmarks (as “saved technicians/offers”) | ✅ | ✅ | ✅ |
| Maps / location permission UX | ✅ | ✅ + native GPS | ✅ |

**Mismatch:** None for customer product features. Native uses camera/gallery/GPS plugins where the shared screens request device capabilities.

---

## 4. Technician parity

| Screen / capability | Web | Android | Same API? |
|---|---|---|---|
| Dashboard / professional / business | ✅ | ✅ | ✅ |
| Jobs feed / details / active / complete | ✅ | ✅ | ✅ |
| Portfolio / reviews / earnings | ✅ | ✅ | ✅ |
| Upgrade / plans / plan detail | ✅ | ✅ | ✅ |
| Subscription centre / boosts | ✅ | ✅ | ✅ |
| Settings / billing / privacy | ✅ | ✅ | ✅ |
| Availability / service areas / services | ✅ | ✅ | ✅ |
| Marketing (offers, creatives, analytics) | ✅ | ✅ | ✅ |
| Messages / notifications / profile | ✅ | ✅ | ✅ |
| Locked / free-job exhaustion flows | ✅ | ✅ | ✅ |
| Developer preview / entitlement-gated UI | ✅ | ✅ | ✅ |

**Mismatch:** None. Subscription upgrade experience added on web is automatically present on Android after `npm run mobile:sync` because it is the same router (`apps/technician/routes.tsx`).

---

## 5. Admin parity

| Module | Web | Android | Status |
|---|---|---|---|
| Login / setup / invite / forgot password | ✅ | Redirect `/` | N/A by design |
| Dashboard, users, jobs, tracking | ✅ | Not mounted | N/A |
| CMS, marketing, ads, offers approvals | ✅ | Not mounted | N/A |
| Subscriptions, boosts, payments escrow | ✅ | Not mounted | N/A |
| Providers, realtime diagnostics | ✅ | Not mounted | N/A |
| Development controls / Development Access | ✅ | Not mounted | N/A |
| Role management / audit | ✅ | Not mounted | N/A |

**Policy:** Admin is an operations console for desktop browsers. Enforced in:

- `src/App.tsx` — `AdminPortalGate`
- `src/PlatformLanding.tsx` — Admin card hidden when `isNativePlatform()`
- `packages/native/deepLinks.ts` — `/admin/*` → `/` on native

This is **not** a synchronization defect; shipping Admin inside the consumer APK would expand attack surface and UX complexity without marketplace benefit.

---

## 6. Authentication parity

| Flow | Web | Android | Notes |
|---|---|---|---|
| Login / logout / register | Same | Same | Shared auth pages |
| Guest mode | Same | Same | Shared guest session helpers |
| Google login | GIS popup | Hosted browser + `fixnow://google-auth` | Same backend tokens |
| Password reset | Same | Same | |
| Remember me | local/session storage | + secure Keystore mirror | `bootstrap.ts` rehydrate |
| JWT access/refresh | Same interceptors | Same | |
| Role resolution | Same | Same | customer / technician / admin |
| Subscription resolution | Same entitlement APIs | Same | |
| Admin auth | Web only | N/A | Gate prevents native mount |

---

## 7. Subscription parity

| Behaviour | Source of truth | Web | Android |
|---|---|---|---|
| Plan catalogue / comparison | Backend subscription APIs | ✅ | ✅ |
| Upgrade checkout (e.g. MoMo) | Backend payments | ✅ | ✅ (hosted browser) |
| Entitlement checks | `entitlements.service.ts` | ✅ | ✅ |
| Free-job locks / upgrade CTAs | Shared technician UI | ✅ | ✅ |
| Billing settings | `/technician/settings/billing` | ✅ | ✅ |
| Boost marketplace | Same routes + APIs | ✅ | ✅ |
| Admin plan discovery controls | Admin web | ✅ | N/A |

**No Android-only pricing or entitlement logic found.**

---

## 8. Role and permission parity

| Engine | Location | Consumed by Android? |
|---|---|---|
| User roles (customer/technician/admin) | Auth + JWT claims | Yes (customer/technician) |
| Feature entitlements | Marketplace entitlement service | Yes |
| Admin capabilities | `adminCapabilities.ts` + `requireCapability` | Web only (Admin gated) |
| Development Access / Dev Admin | `developmentAccess.service.ts` | Web only |

Permissions are enforced on the **backend**. Frontends only hide UI; Android cannot bypass rules the web cannot bypass.

---

## 9. Native feature audit

| Capability | Module | Integrates with backend? | Status |
|---|---|---|---|
| Push (FCM) | `nativePush.ts` | Device token registration + same notification payloads | Complete |
| Deep links / App Links | `deepLinks.ts` | Routes into shared React Router | Complete |
| Camera / gallery | `nativeDevice.ts` | Upload APIs | Complete |
| Geolocation | `nativeDevice` / location host | Job location / tracking | Complete |
| Permissions UX | `locationPermission.ts` | Same flows | Complete |
| File upload / offline uploads | `offlineUpload.ts` | Same upload endpoints | Complete |
| Share / clipboard / haptics | `nativeDevice.ts` | UX only | Complete |
| Hosted payments | `hostedPayments.ts` | Same payment URLs | Complete |
| Secure session | `secureStorage.ts` | Same tokens | Complete |
| Offline mutation queue | `offlineQueue.ts` | Replays to same APIs | Complete |
| Resume / online resync | `nativeApp` + `resync.ts` | Socket reconnect + screen reload | Complete |
| Biometrics | Probe in `nativeDevice` | Not wired to login | Partial |
| Filesystem plugin | Dependency present | No dedicated product flow | Partial / unused surface |
| Service worker | `public/sw.js` | Not registered in app entry | Partial (web) |

---

## 10. Performance findings

| Area | Finding |
|---|---|
| Architecture | Single SPA avoids dual-render cost of a native rewrite |
| Lists | Shared infinite lists listen for `fixnow:resync` |
| Images | Shared image pipeline (Cloudinary / CMS); no Android fork |
| Caching | `offlineCache` / `dataCache` + API client retries |
| Duplicate requests | Same React Query / `useAsync` patterns as web |
| Startup | Native bootstrap rehydrates tokens before React mount |
| Background sync | Resume → `fixnow:app-resume` → queue flush + `fixnow:resync` |
| Risk | Large `dist` inside APK increases install size; mitigate with periodic release discipline |
| Risk | Without OTA, Android can serve an older SPA until store update |

---

## 11. Missing implementations

1. **OTA / Capgo-style live updates** — Android cannot pick up web deploys without rebuild + sync / store release.  
2. **Biometric unlock UX** — availability probe only.  
3. **Admin Android app** — not shipped (intentional).  
4. **Automated “APK behind CDN” in-app banner** — operators compare versions manually / via CI.  
5. **Service worker registration** — unused; no “new version available” prompt on web or WebView.

---

## 12. Critical issues

| Severity | Issue | Disposition |
|---|---|---|
| High (ops) | APK embeds static SPA — feature drift if store builds skip `mobile:sync` | Mitigated by scripts that **always rebuild** before sync (`cap:sync`, `mobile:sync`, etc.) + `parity:android --require-sync` |
| Medium | Push transport differs (FCM vs VAPID) | Acceptable; inbox + deep-link resolver shared |
| Medium | No OTA | Documented; recommend Capgo/signed live update later |
| Low | Biometric not productized | Document; do not advertise as shipped |
| Low (fixed) | Stale docs claimed Admin parity on Android | Corrected in `WEB_ANDROID_PARITY_REPORT.md` |
| Info | Admin deep links neutralized on native | Working as designed |

**No critical dual-implementation bugs found** (no separate Android business layer inventing rules).

---

## 13. Fixes applied (this audit)

1. **Extended automated parity gate** (`scripts/web-android-parity.mjs`):
   - Asserts Admin native gate
   - Asserts Customer + Technician critical routes (including subscription/upgrade/billing)
   - Asserts entitlement + admin capability engines exist
   - Asserts native bridge modules present
   - Emits matrix + writes `scripts/.web-android-parity-latest.json`
2. **Alias script** `scripts/check-web-android-parity.mjs` + npm `parity:web-android`
3. **Quality gate** — `npm run test:quality` now includes `parity:android`
4. **package.json** — removed invalid trailing comma that broke JSON parse for the parity script
5. **Docs** — corrected Admin Android status in `WEB_ANDROID_PARITY_REPORT.md`
6. **This report** — `WEB_ANDROID_SYNCHRONIZATION_AUDIT_REPORT.md` as the canonical sync audit

No duplicate Android UI or Android-only business rules required removal — none existed.

---

## 14. Validation results

```
npm run parity:android
→ PASSED — shared SPA is the single source of truth for Capacitor Android.
```

Manual architecture checks:

- [x] Android Java tree limited to `MainActivity` bridge (no React forks)
- [x] `webDir: 'dist'` + Vite `base: './'`
- [x] CORS allows `https://app.fixnow.local`
- [x] Debug cleartext overlay for emulator/LAN; release cleartext denied
- [x] Customer + Technician routes shared
- [x] Admin gated on native
- [x] Deep links strip `/admin`
- [x] Same entitlement + subscription APIs
- [x] Resume dispatches `fixnow:resume` **and** `fixnow:app-resume` (resync + sockets)
- [x] Offline queue flushes into shared HTTP client

**Release sync checklist (strict):**

```bash
npm run build
npx cap sync android
npm run parity:android -- --require-sync
```

---

## 15. Recommendations for long-term parity

### Feature release rule (mandatory)

A feature is **not complete** until all applicable boxes are checked:

- [ ] Backend implemented (API + validation + permissions)
- [ ] Web implemented (Customer and/or Technician and/or Admin as required)
- [ ] Android covered automatically via shared SPA **or** explicitly gated with documented policy (Admin)
- [ ] Entitlements / roles enforced server-side
- [ ] APIs tested (unit / smoke)
- [ ] `npm run parity:android` passes
- [ ] Store/APK rebuilt with `npm run mobile:sync` when native packaging is affected
- [ ] Docs / this audit section updated if policy changes

### Process

1. Treat **React SPA + backend** as the only product surface; Capacitor is packaging.  
2. Run `parity:android` in CI (`test:quality`).  
3. For production Android releases, always `mobile:sync` then assemble; never ship an unsynced WebView.  
4. Prefer shared packages (`packages/api`, `packages/shared`, `packages/native` bridges) over portal-local forks.  
5. Never add Kotlin/Java screens for marketplace features.  
6. When adding routes, ensure Customer/Technician paths remain under the shared routers so Android inherits them.  
7. Revisit OTA (signed live updates) when release cadence demands same-day Android + web.  
8. If Admin-on-mobile is ever required, remove the gate deliberately and extend the parity matrix — do not quietly fork an Admin APK.

### Architecture (source of truth)

```
Browser / Capacitor WebView
        │
        ▼
  Vite React SPA (src + apps/* + packages/*)
        │
        ▼
  FixNow Backend (auth, entitlements, jobs, messaging, payments, CMS, AI, admin)
```

Android must remain **another presentation layer**, not a second implementation.

---

## Appendix A — How to re-audit

```bash
npm run parity:android
npm run parity:web-android
npm run parity:android -- --require-sync   # after mobile:sync
```

Related docs:

- `WEB_ANDROID_PARITY_REPORT.md`
- `WEB_ANDROID_SYNCHRONIZATION_AUDIT.md` (ops / OTA notes)
- `MOBILE_PLATFORM_AUDIT.md` / `NATIVE_QA_CERTIFICATION.md` (native QA)

---

## Appendix B — Screen inventory (shared SPA)

**Customer (Android + Web):** onboarding, login, register, forgot-password, home, offers (+ saved/detail), categories, search, technician profile, post-job, jobs, applications, tracking, messages, notifications, profile, payments (+ pay/success/receipt), help, account delete, CMS/legal.

**Technician (Android + Web):** onboarding, auth, dashboard, professional, business (+ marketing/company/team), jobs, active, complete, portfolio, reviews, earnings, locked, upgrade, plans, plan detail, subscription, boosts, notifications, messages, profile, profile-setup, settings, billing, privacy, availability, service-areas, services, reputation, achievements, community, referrals, marketing suite, guarantee, help, account delete.

**Admin (Web only):** login, setup, dev entry, invite, forgot-password, dashboard, admins, technicians, customers, jobs, tracking, verification, portal, free-jobs, locks, categories, reports, notifications, content, audit, settings (providers/realtime/development/development-access), subscriptions, boosts, trust, reviews, marketing suite, payments, messages.

---

*End of report. Implementation is considered synchronized when Customer and Technician capabilities match across Web and Android via the shared SPA, Admin remains intentionally web-only, and the automated parity gate remains green.*
