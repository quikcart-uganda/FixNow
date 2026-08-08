# USER_SAFE_MESSAGING_AUDIT.md

**Date:** 2026-07-25  
**Scope:** Customer and Technician UX — eliminate exposure of internal configuration, development state, and implementation details.  
**Constraint:** Presentation, feature availability, and user messaging only. No authentication, payment, or provider redesign.

---

## 1. Executive summary

Customers and Technicians must only see polished product language. Internal configuration, environment names, feature-flag wording, provider diagnostics, and development notices must never appear in those portals.

This audit found several real UI leaks (most importantly Google Sign-In configuration copy and a customer payment “Dev / console” option), plus a systemic risk that raw backend `Error` / `ApiError` messages could reach the UI unchanged.

Admin diagnostics (Development Controls, logs, monitoring) were retained.

---

## 2. Error classification applied

| Category | Audience | Disposition |
|----------|----------|-------------|
| 1. Internal / Developer / Administrator | Admins, engineers | Kept in admin tools, server logs, Sentry |
| 2. Operational logs | Server, monitoring | Unchanged (`console`, structured logger, monitoring hooks) |
| 3. Customer-facing | Customers & Technicians | Friendly, actionable, no implementation detail |

Only category 3 reaches Customer / Technician UI after this work.

---

## 3. Internal messages discovered

| # | Location | Current / prior text or behaviour | Why inappropriate | Replacement / rule |
|---|----------|-----------------------------------|-------------------|--------------------|
| 1 | `packages/shared/auth/ContinueWithGoogleButton.tsx` | “Google Sign-In is turned off for this environment…” | Exposes environment / ops state | **Hide** Google control when unavailable |
| 2 | Same | “Google Sign-In is not configured yet…” | Exposes configuration | **Hide** when not ready; runtime failures use friendly copy |
| 3 | `packages/native/socialAuth.ts` | “Google Sign-In is not configured yet.” | Configuration leak | “Google Sign-In is currently unavailable. Please sign in using your email and password.” |
| 4 | Same | “blocked in this WebView. Use the system browser bridge.” | Implementation / platform detail | Friendly unavailable + email/password alternative |
| 5 | Same | “This app origin is not authorized for Google Sign-In.” | Infra / OAuth setup detail | Same friendly unavailable message |
| 6 | `packages/shared/auth/devSettings.tsx` (`DevOtpNotice`) | “{environment} only · Dev OTP: …” | Development / environment labels on auth screens | “Your verification code: {code}” (still gated off in production) |
| 7 | `apps/customer/pages/PayJobPage.tsx` | Payment option “Dev / console (auto)” with “DEV” badge | Exposes mock/dev payment provider | **Removed** from Customer UI; only MTN / Airtel shown |
| 8 | Same | “The provider declined this charge…” | “Provider” reads as integration jargon | “This payment was declined. Try another number or payment method.” |
| 9 | `apps/customer/pages/PaymentSuccessPage.tsx` | “Waiting for the provider confirmation…” | Same jargon | “Waiting for payment confirmation…” |
| 10 | `packages/shared/AiAssistantPanel.tsx` | Rendered backend `aiStatus.note` (“AI is an optional FixNow subsystem…”, “disabled… auth, messaging, push…”) | Architecture / subsystem dump | Fixed product copy: assistant unavailable; everything else works |
| 11 | `backend/src/services/ai/ai.service.ts` | “Customer/Technician AI Assistant is currently disabled…” | Feature-flag tone | “The assistant is currently unavailable…” |
| 12 | Same | “…once a live AI provider is enabled” | Provider configuration leak in assistant replies | Follow-up-friendly wording without “provider” |
| 13 | Same | `error: 'AI provider temporarily unavailable'` | Provider name | “The assistant is temporarily unavailable” |
| 14 | `backend/src/services/ai/ai.config.ts` | Status note listing marketplace/auth/messaging/push when AI disabled | Internal subsystem inventory | Softened product note |
| 15 | `packages/api/errors.ts` | Passed through raw `ApiError.message` / `Error.message` for many non-500 failures | Channel for SMTP/Cloudinary/Mongo/config strings | Sanitize via `looksLikeInternalMessage`; map known codes; never show internals |

| 16 | `packages/shared/tracking/TrackingMap.tsx` | `VITE_GOOGLE_MAPS_API_KEY` + raw GPS coords | Config / precise location dump | Friendly map-unavailable copy; “Technician nearby” / address label |
| 17 | `packages/shared/splash/FixNowSplash.tsx` + `useSplashController.ts` | “Checking backend…”, “Backend degraded/unreachable”, “Services degraded” | Infra vocabulary | Product outcome copy (“Getting things ready…”, “Running a little slow”) |
| 18 | `packages/api/reliability/circuitBreaker.ts` | `Service temporarily unavailable (api.read)` | Internal circuit id | Generic unavailable message; name kept on `circuit` field only |
| 19 | `packages/api/errors.ts` | `SERVICE_UNAVAILABLE` mapped to Google-only copy | Wrong product attribution | Generic service-unavailable; Google uses dedicated code/local copy |
| 20 | Raw `err.message` sinks | `CmsDocumentView`, `LiveTrackingPanel`, `useTrackingPublisher`, `PushProvider`, technician `AppContext` | Bypassed friendly mapper | Now use `getFriendlyErrorMessage` / fixed push copy |
| 21 | `backend/src/providers/ai/console.provider.ts` | “console mode… Enable AI_PROVIDER=… API key…” | Provider/config ops guidance in chat | Friendly help text without providers/keys |
| 22 | `packages/shared/ConnectionStatus.tsx` | `title="Realtime: ${status}"` | Raw enum on hover | Friendly `LABEL[status]` |
| 23 | `packages/shared/content/CmsDocumentView.tsx` | “Version N · Updated …” | CMS versioning metadata | Published date only |

---

## Follow-up from parallel audits

Additional findings from [Audit provider availability](364d8470-375e-4191-8eef-9c9dcddb40ca), [Audit shared error boundaries](bb912377-5dbb-447e-b7a5-6612352de2d7), [Audit customer messaging](d2833353-5fd6-4f56-82d8-a872d823bd7d), and [Audit technician messaging](45f11a02-e1c6-466e-8cc7-3c2b1247c8a7) were merged into the fixes above where they were presentation-only and customer/technician facing.

Deferred (documented, not fixed in this pass — larger surface or product copy outside strict config leakage):

- Earnings / DeleteAccount raw status enums
- Technician marketing/roadmap copy (“Phase 2”, “Architected for…”)
- Public `/health` / `/diagnostics` response shaping
- Backend `errorHandler` production redaction keyed to `APP_ENV`
- Binding Customer pay methods to `/payments/providers` readiness DTO

---

| Feature | Prior behaviour | New behaviour |
|---------|-----------------|---------------|
| **Google Sign-In** | Button always shown; disabled with config/environment message | Render **only** when backend reports `enabled` + `ready` + `clientId`. Otherwise **hidden**. Failures during sign-in use friendly copy + email/password guidance |
| **Apple Sign-In** | Already unavailable (`signInWithApple`); not rendered in Customer/Technician auth UI | No change (already hidden) |
| **Payments (Customer pay flow)** | Offered “Dev / console (auto)” alongside MTN/Airtel | Console/dev method **hidden**; MTN and Airtel only |
| **AI Assistant launcher** | Already hidden when `aiApi.status()` reports disabled for role | Retained. Off-state panel no longer dumps backend diagnostic notes |
| **Push / Maps / Uploads** | No Customer/Technician UI found that advertised “not configured” | No UI change. Upload/payment failures now map through safer `getFriendlyErrorMessage` |
| **Admin Development Controls** | Shows environment, mock providers, lockdown | **Retained** (admin-only) |

---

## 5. Admin-only diagnostics retained

- `apps/admin/pages/DevelopmentControlsPage.tsx` — environment, mock providers, lockdown (admin)
- Backend structured logs, Sentry/`captureException`, `console.error` in error boundaries (not rendered in UI)
- `AppErrorBoundary` still logs stacks to console / diagnostics APIs; UI shows only the generic recovery screen
- Payment provider registry may still include `console` server-side for non-live simulation — not exposed in Customer pay UI

---

## 6. Files modified

| File | Why necessary |
|------|----------------|
| `packages/shared/auth/ContinueWithGoogleButton.tsx` | Hide unusable Google Sign-In; remove environment/config messages |
| `packages/native/socialAuth.ts` | Friendly Google failure map; strip config/WebView/origin diagnostics |
| `packages/api/errors.ts` | Safe-by-default sanitization; generic `SERVICE_UNAVAILABLE` (not Google-only) |
| `packages/api/index.ts` | Export `looksLikeInternalMessage` |
| `packages/api/reliability/circuitBreaker.ts` | Stop embedding circuit names in user-facing `CircuitOpenError` messages |
| `packages/shared/auth/devSettings.tsx` | Remove environment / “Dev OTP” labels from OTP notice |
| `apps/customer/pages/PayJobPage.tsx` | Hide console/dev payment method; friendlier decline copy |
| `apps/customer/pages/PaymentSuccessPage.tsx` | Remove “provider confirmation” wording |
| `packages/shared/AiAssistantPanel.tsx` | Stop rendering backend diagnostic `note` |
| `packages/shared/tracking/TrackingMap.tsx` | Remove env-var name and raw GPS dump from map fallback |
| `packages/shared/splash/FixNowSplash.tsx` | Replace “backend” health vocabulary with product copy |
| `packages/shared/splash/useSplashController.ts` | Soften degraded/offline loader labels |
| `packages/shared/content/CmsDocumentView.tsx` | Friendly errors; hide CMS version metadata |
| `packages/shared/tracking/LiveTrackingPanel.tsx` | Route errors through `getFriendlyErrorMessage` |
| `packages/shared/tracking/useTrackingPublisher.ts` | Same |
| `packages/hooks/PushProvider.tsx` | Fixed friendly push-registration failure copy |
| `packages/shared/ConnectionStatus.tsx` | Friendly tooltip instead of raw socket enum |
| `apps/technician/context/AppContext.tsx` | Profile errors via friendly mapper (latent leak) |
| `backend/src/services/ai/ai.service.ts` | Soften disabled / fallback / error strings that reach non-admin users |
| `backend/src/services/ai/ai.config.ts` | Soften public AI status note |
| `backend/src/providers/ai/console.provider.ts` | Remove console-mode / API-key guidance from assistant replies |

### Files created

| File | Why |
|------|-----|
| `USER_SAFE_MESSAGING_AUDIT.md` | Required audit / implementation report |

### Files deleted

None.

---

## 7. Regression checks performed

| Check | Result |
|-------|--------|
| Frontend Vite production build | **Pass** (`npx vite build`) |
| Backend TypeScript build | **Pass** (`npm run build` in `backend/`) |
| Unit / package tests | **Pass** (`npm run test:unit` — 39 tests, 0 failures) |
| Capacitor Android sync | **Pass** (earlier in this workstream) |
| Full `tsc -b` typecheck | **Pre-existing failures** unrelated to this change (`node:test` typings, `TrackingMap` Google namespace conflict, `healthCheck` circuits typing). Not fixed per isolation rules |
| Auth flows | Google button hidden when unusable; email/password unchanged |
| Customer pay | MTN/Airtel only; API `pay` contract unchanged |
| Technician portal | Shared splash/map/error fixes; no route/business logic redesign |
| Admin portal | Development Controls unchanged |
| Public API shapes | Unchanged (`googleConfig`, payments, AI status payloads still returned; only presentation differs) |

---

## 8. Unrelated issues discovered (not fixed)

1. **`listPaymentProviders()` always returns `console`** (`backend/src/providers/payments/index.ts`) — fine for server-side simulation, but any future Customer UI that blindly maps this list would re-expose it. Recommendation: filter `console` (and other non-customer brands) in a dedicated public DTO later.
2. **`AppErrorBoundary` stores `errorMessage` in state but does not render it** — safe today; ensure future UI never prints `state.errorMessage` to end users.
3. **AI status payload still includes `provider` / `model` fields** — used by admin/ops; Customer UI no longer displays the diagnostic `note`. Recommendation: add an admin-only status view if deeper AI diagnostics are needed in Command Center.
4. **Technician “Coming soon” badges** (Portfolio / Upgrade) — product placeholders, not config leaks; left alone.
5. **Shell / PowerShell `&&` failures** in some agent terminals — tooling issue only.

---

## 9. Risk assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Hiding Google Sign-In when config fetch fails | Low | Transient failures clear the config cache so a later mount retries; email/password remains available |
| Over-aggressive `looksLikeInternalMessage` | Low–Med | Curated allowlist via status/code maps first; regex only sanitizes leftover messages. Monitor false positives on validation copy |
| Removing console payment from Customer UI | Low | Non-live backends still simulate MTN/Airtel via existing payment adapters |
| Softening AI disabled copy | None | Behaviour unchanged; only strings |

**Overall residual risk:** Low. Changes are presentation- and availability-gated; public interfaces and business logic paths are preserved.

---

## 10. Success criteria

- [x] Customers never see environment / configuration / feature-flag / provider-setup messages for Google Sign-In
- [x] Technicians share the same Google / error / OTP / AI presentation fixes
- [x] Unusable Google Sign-In is hidden
- [x] Dev/console payment method hidden from Customer pay UI
- [x] Friendly messages only when user action needs feedback
- [x] Admin diagnostics retained
- [x] Implementation isolated; no auth/payment architecture redesign
