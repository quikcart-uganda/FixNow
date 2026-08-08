# FixNow Auth UX Implementation

**Date:** 2026-07-24 (updated with focus/caret polish round)  
**Scope:** Frontend authentication experience only  
**Constraint:** No changes to backend auth, JWT issuance/refresh, API contracts, or RBAC.

QuikCart (`D:\QQCART\QuikCart APP VND cursor`) was used **read-only** as UX inspiration. FixNow branding, layout, and palette are preserved — no redesign.

---

## 1. Goals

Improve splash → login transition, login, registration, forgot password, OTP verification, Remember Me, validation, loading states, animations, error messages, and accessibility — without touching authentication logic.

---

## 2. What shipped

### Shared auth UX kit — `packages/shared/auth/`

| Module | Role |
|--------|------|
| `AuthShell` | Brand header + card + calm entrance animation |
| `ForgotPasswordFlow` | Reusable 3-step reset wizard (used by customer and technician) |
| `AuthAlert` | Error / success / info banners with `role="alert"` / `role="status"` |
| `AuthTextField` | Labeled input with field-level error wiring |
| `PasswordField` | Show/hide toggle with `aria-pressed` + `aria-label` |
| `AuthSubmitButton` | Spinner + `aria-busy`, avoids sticky native `disabled` |
| `OtpInput` | Numeric, `autocomplete="one-time-code"`, digits-only filter |
| `ResendCodeButton` | Countdown-aware resend CTA |
| `RememberMeCheckbox` | Labeled "Remember me on this device" |
| `useAuthSubmit` | Double-submit lock + busy flag |
| `useResendCountdown` | 60s resend timer with server-value override |
| `authUx.ts` | Password rules, email masking, remembered email, onboarded flag |

All are re-exported from `@fixnow/shared`. Field components accept `labelClassName` so each app keeps its own label styling (admin `ink-*` tokens, technician `text-label`, customer caps labels).

### Error messaging — `packages/api/errors.ts`

Display-only mapping added for auth codes (`INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, OTP codes, network failures). Credential failures are deliberately **non-enumerating**: wrong password and unknown account both render “Incorrect email or password.” No request/response shapes changed.

### Motion — `src/index.css`

- `auth-screen-enter` — short entrance for auth surfaces
- `auth-submitting` — pointer lock while a submit is in flight
- `prefers-reduced-motion` disables auth and fade/scale animations

Splash motion itself is owned by the shared splash stylesheet (`packages/shared/splash/fixnowSplash.css`).

### Screens updated

| App | Pages |
|-----|--------|
| Customer | `SplashPage`, `OnboardingPage`, `LoginPage`, `RegisterPage`, `ForgotPasswordPage` |
| Technician | `LoginPage`, `RegisterPage`, new `ForgotPasswordPage` + route |
| Admin | `LoginPage` |

### Focus & caret polish round (QuikCart-inspired)

| Improvement | Where |
|-------------|-------|
| Password visibility toggle keeps focus and restores the caret/selection (no lost cursor when switching `password` ↔ `text`) | `PasswordField` — used by all logins, registers, and the reset flow |
| OTP field auto-focused when a verification step opens | Customer register OTP step, technician register Verify step, `ForgotPasswordFlow` code step |
| New-password field auto-focused when the reset flow reaches the password step | `ForgotPasswordFlow` |
| First invalid field receives focus on submit-validation failure | Customer, technician, and admin logins |
| Admin login upgraded to field-level errors: email now uses `AuthTextField`, both fields show inline errors that clear as the user types (Command Center styling preserved) | `apps/admin/pages/LoginPage.tsx` |

**Considered and skipped:** honoring a server resend cooldown (`retryAfterSeconds`) — the existing API response carries no such field, and backend changes are out of scope. The 60s client countdown stands; 429s already map to friendly copy.

---

## 3. Flow improvements

### Splash → login

The customer splash now uses the same shared splash system as technician (`FixNowSplash` + `useSplashController` + `useNetworkStatus`), so both role splash routes behave identically: brand dwell, backend health status, Retry when offline, then a single hand-off.

Routing decided on finish:

| Condition | Destination |
|-----------|-------------|
| Authenticated in role | `/customer/home` (or `/technician/dashboard`) |
| Remembered email or completed onboarding | `/customer/login` |
| First-time visitor | `/customer/onboarding` |

`AppSplashGate` already skips `/customer` and `/technician`, so there is no stacked brand moment. Onboarding writes the onboarded flag and now also offers a direct **Sign In** link.

### Login (customer / technician / admin)

- Remembered email prefilled
- Client-side field validation before any request
- Field-level errors clear as the user types
- Busy submit with spinner and `aria-busy`
- Shared password toggle and alert components
- Forgot-password link present in customer and technician

### Registration

- Password strength hint plus confirm-password (customer)
- OTP step shows masked email (`jo****@example.com`)
- Resend uses existing `authApi.resendOtp` with a 60s countdown
- Back returns to the form without losing entered values
- Technician's 4-step wizard keeps its progress bar; verification uploads labeled optional

### Forgot password (`ForgotPasswordFlow`)

1. **Request** → `authApi.forgotPassword`, replies with non-enumerating copy
2. **Code** → `authApi.verifyOtp({ purpose: 'password_reset' })` + resend countdown
3. **Password** → strength + match checks → `authApi.resetPassword`
4. **Done** → success state + back to login

Technician reuses the same component with Pro branding at `/technician/forgot-password`.

### Remember Me

Copy clarified, and on success the email is stored (`fixnow_remembered_email`) or cleared. Token persistence is unchanged — `rememberMe` still drives `tokenStorage` local vs session storage exactly as before.

---

## 4. Accessibility

- [x] Every input has an associated `<label htmlFor>`
- [x] Password toggle exposes `aria-label` + `aria-pressed`
- [x] Errors announced via `role="alert"` / `aria-live`
- [x] `aria-invalid` + `aria-describedby` on invalid fields
- [x] Submit buttons expose `aria-busy` during async work
- [x] OTP fields use `inputMode="numeric"` + `autocomplete="one-time-code"`
- [x] Splash announces status through the shared splash `role="status"` region
- [x] Reduced-motion honored
- [x] Focus moves to the first invalid field on failed submit (login screens)
- [x] Password visibility toggle preserves keyboard focus and caret position
- [x] OTP / new-password steps place focus in the field on entry

---

## 5. Explicitly unchanged

- Backend routes, validators, OTP issuance, password hashing
- JWT access/refresh behavior, session records, RBAC checks
- `AuthProvider` contracts (`login`, `register`, `verifyOtp`, `logout`)
- API request/response shapes — only error **display** mapping was added

---

## 6. QuikCart inspiration → FixNow application

| QuikCart pattern | FixNow application |
|------------------|--------------------|
| Deliberate splash leave, calm forms | Shared splash leave + `auth-screen-enter` only |
| Friendly, anti-enumeration errors | Extended `getFriendlyErrorMessage` |
| Busy submit without sticky `disabled` | `AuthSubmitButton` + `useAuthSubmit` |
| OTP countdown + masked contact | `useResendCountdown` + `maskEmail` |
| 3-step reset wizard | `ForgotPasswordFlow` |
| Remembered identity | `fixnow_remembered_email` |
| Role-shared modules, role-specific copy | `packages/shared/auth` + per-app props |

---

## 7. Manual test plan

1. **Customer cold start** — `/customer` shows brand splash with health status; first visit → onboarding, later visits → login; signed-in session → home.
2. **Offline splash** — disable network: status shows offline and Retry appears; Get started still proceeds.
3. **Login** — empty submit shows inline field errors; wrong password shows “Incorrect email or password.”; Remember me prefills email next visit; unchecking clears it.
4. **Register** — weak password blocked client-side; mismatch caught; OTP shows masked email; resend disabled during countdown; verify signs in.
5. **Forgot password** — request → code → new password → done; bad code shows friendly error; `/technician/forgot-password` behaves the same with Pro branding.
6. **Admin login** — busy state, alert banner, password toggle, remembered device.
7. **Accessibility** — keyboard-only pass through each form; screen reader announces errors; OS reduced-motion disables auth animations.
8. **Focus behavior** — submit an empty login: focus lands in the email field; toggle password visibility mid-typing: caret stays put; reach an OTP step: the code field is already focused.

> Verified: `npm run typecheck`, `npm run build`, and `npm run lint` all pass (exit 0). Lint warnings that remain are pre-existing and outside the auth surfaces.

---

## 8. Files touched

```
packages/shared/auth/*                       (new kit incl. ForgotPasswordFlow)
packages/shared/index.ts                     (exports)
packages/api/errors.ts                       (auth error copy)
src/index.css                                (auth entrance + busy lock, reduced motion)
apps/customer/pages/SplashPage.tsx           (shared splash + auth-aware routing)
apps/customer/pages/OnboardingPage.tsx       (onboarded flag + Sign In link)
apps/customer/pages/LoginPage.tsx
apps/customer/pages/RegisterPage.tsx
apps/customer/pages/ForgotPasswordPage.tsx   (thin wrapper)
apps/technician/pages/LoginPage.tsx
apps/technician/pages/RegisterPage.tsx
apps/technician/pages/ForgotPasswordPage.tsx (new)
apps/technician/routes.tsx                   (forgot-password route)
apps/admin/pages/LoginPage.tsx
AUTH_UX_IMPLEMENTATION.md                    (this file)
```
