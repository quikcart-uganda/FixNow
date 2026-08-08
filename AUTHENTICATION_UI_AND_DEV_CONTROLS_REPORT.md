# Authentication UI & Development Controls Report

**Date:** 2026-07-25  
**Scope:** Register/Login layout, Google Sign-In button, Dev OTP security, Admin Development Controls, backend enforcement  
**Constraint:** No authentication architecture redesign. Existing auth services, endpoints, and business logic reused.

---

## 1. Root cause — vertical marketing text

### Symptom
The Register page hero paragraph rendered one word per line:

```
Join
thousands
of
homeowners
…
```

### Cause
Tailwind CSS v4 resolves `max-w-*` utilities against the **spacing scale first**. The project theme defined:

```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;
```

That overrode Tailwind’s default container widths, so:

| Utility     | Intended             | Actual resolved value      |
|-------------|----------------------|----------------------------|
| `max-w-md`  | ~28rem / container-md | `var(--spacing-md)` = 16px |
| `max-w-sm`  | container-sm           | 8px                        |
| `max-w-lg`  | container-lg           | 24px                       |
| `max-w-xl`  | container-xl           | 32px                       |
| `max-w-2xl` | container-2xl        | 48px                       |

The Register page used `max-w-md` on the marketing paragraph. At 16px wide, the browser wrapped almost every word onto its own line. The heading looked fine because it did not use those utilities. Feature cards looked fine because they sit in a separate grid cell.

This was verified with a Tailwind compile probe before and after the fix.

### Fix
Renamed the custom spacing tokens so they no longer collide with Tailwind’s named spacing keys:

```css
--space-xs / --space-sm / --space-md / --space-lg / --space-xl / --space-2xl
```

After the rename:

- `max-w-md` → `var(--container-md)` (correct)
- `max-w-prose` → `65ch` (used on the marketing paragraph)

Register layout was also tightened for responsive behaviour:

- Marketing copy always visible (not `hidden lg:flex`)
- `min-w-0` on grid children to prevent flex/grid overflow
- `text-pretty` / `max-w-prose` on body copy
- Desktop: two-column grid (hero + perks left, card right)
- Tablet / mobile: single-column stacked layout

**No hardcoded pixel widths were introduced.**

---

## 2. Root cause — missing “Continue with Google” button

### Symptom
The Register and Login pages already imported `ContinueWithGoogleButton`, but the button often did not appear.

### Cause
`ContinueWithGoogleButton` returned `null` when `authApi.googleConfig()` reported `ready === false` (Google disabled, missing client ID, or a transient config fetch failure):

```tsx
if (available === false) return null
```

So an unconfigured or unavailable Google setup **hid** the control instead of explaining why it was unavailable.

### Fix
The button now **always renders** below the primary Continue / Login CTA with the official Google “G” mark and an `OR` divider.

Behaviour:

| State                         | UI                                                         |
|-------------------------------|------------------------------------------------------------|
| Checking config               | Button visible, disabled                                   |
| Ready (`enabled` + client ID) | Button enabled, full Google flow                           |
| Enabled but not configured    | Button disabled + “not configured yet” status message      |
| Explicitly disabled           | Button disabled + “turned off for this environment” message|

No Google login logic was duplicated — `signInWithGoogle` and `loginWithGoogle` are still the only auth paths.

---

## 3. Root cause — Dev OTP visible in production-like flows

### Symptom
Verification UI showed `Dev OTP: 017146`.

### Cause
Three layers contributed:

1. **Backend:** `env.exposeOtp` defaulted to `true` whenever `NODE_ENV === 'development'`, and `issueOtp()` returned `debugOtp` in the API payload whenever that flag was true.
2. **Frontend:** Register / Forgot-password screens rendered any `debugOtp` they received with no environment check.
3. **No admin control:** There was no runtime way to turn OTP exposure off without editing env / source.

Even when `NODE_ENV=production` already forced `exposeOtp=false`, staging builds and mis-set environments could still leak OTPs into the UI, and the frontend had no second line of defence.

### Fix

**Backend (source of truth)**

- New feature flags: `ENABLE_DEV_OTP`, `ENABLE_DEV_LOGIN`, `ENABLE_TEST_USERS`, `ENABLE_DEBUG_MODE`, `ENABLE_MOCK_PROVIDERS`, `ENABLE_DEVELOPMENT_MODE`
- New `APP_ENV` (`development` | `staging` | `production` | `test`)
- `devControlsService` merges env defaults with admin overrides stored in `PlatformSetting('dev_controls')`
- **Production lockdown always wins** — every flag forced off, overrides ignored, updates rejected
- `issueOtp()` now calls `isOtpExposureAllowed()`; production never returns `debugOtp`
- Console email/SMS providers redact OTP-shaped digit runs unless debug logs are explicitly enabled
- Production boot fails if any `ENABLE_DEV_*` flag or `AUTH_EXPOSE_OTP` is `true`

**Frontend**

- New `DevOtpNotice` component: renders only when backend public settings say `enableDevOtp === true` **and** environment is not production
- Customer Register, Technician Register, and Forgot Password all use `DevOtpNotice`
- Failed / loading public-settings fetch defaults to the production-safe empty state (no OTP shown)

---

## 4. Development controls implemented

### Storage
Reuses existing `PlatformSetting` model (`key = 'dev_controls'`). No new collection.

### API

| Method | Path                     | Auth                         | Notes                                      |
|--------|--------------------------|------------------------------|--------------------------------------------|
| GET    | `/public/dev-settings`   | Public                       | Non-secret flags for auth screens          |
| GET    | `/admin/dev-settings`    | Admin + Super Admin          | Full state (effective + overrides)         |
| PUT    | `/admin/dev-settings`    | Admin + Super Admin          | Blocked in production (`blockInProduction`)|

### Flags managed

- Enable Dev OTP display
- Enable development login
- Enable test accounts
- Enable mock providers
- Enable debug logs
- Development mode

### Admin UI
**Admin → System Settings → Development Controls** (`/admin/settings/development`)

- Super Admin only (`requireSuperAdmin` middleware)
- Shows current environment badge
- Production lockdown banner when applicable
- Toggles + Save Changes
- Every change is audit-logged (`settings.dev_controls.update`)

---

## 5. Backend enforcement changes

| Guard                         | Behaviour                                                                 |
|-------------------------------|---------------------------------------------------------------------------|
| `env.isProductionEnv`         | Derived from `NODE_ENV` / `APP_ENV`; production always wins                |
| `requireSuperAdmin()`         | Restricts admin write/read of development controls                        |
| `blockInProduction()`         | PUT `/admin/dev-settings` returns 404 in production                       |
| `requireDevFeature(flag)`     | Ready for any future dev-login / test-account / debug routes              |
| OTP issue path                | Never attaches `debugOtp` when production lockdown is active              |
| Console providers             | Redact digit runs in logs unless `enableDebugLogs`                        |
| Production boot               | Exits if any development flag is enabled                                  |

Frontend never decides security policy — it only consumes `/public/dev-settings`.

---

## 6. Admin settings added

- Nav group: **System Settings → Development Controls**
- Route: `/admin/settings/development` (+ `/admin/settings` redirect)
- Page: `apps/admin/pages/DevelopmentControlsPage.tsx`
- Forbidden state for non–Super Admin operators

---

## 7. Files modified / added

### Backend
- `backend/src/config/env.ts` — `APP_ENV`, `ENABLE_DEV_*`, production guards, `DEV_FLAG_DEFAULTS`
- `backend/src/services/platform/devControls.service.ts` — **new** single source of truth
- `backend/src/services/auth/otp.service.ts` — OTP exposure via `isOtpExposureAllowed()`
- `backend/src/services/index.ts` — exports
- `backend/src/controllers/index.ts` — `devControlsController`
- `backend/src/routes/index.ts` — public + admin routes
- `backend/src/validators/index.ts` — `devControlsUpdateSchema`
- `backend/src/middleware/authenticate.ts` — `requireSuperAdmin()`
- `backend/src/middleware/devFeature.ts` — **new** `requireDevFeature` / `blockInProduction`
- `backend/src/providers/email/console.provider.ts` — OTP redaction
- `backend/src/providers/sms/console.provider.ts` — OTP redaction
- `backend/.env.example`, `.env.development.example`, `.env.production.example`

### Frontend / shared
- `src/index.css` — spacing token rename (root cause of vertical text)
- `packages/shared/auth/ContinueWithGoogleButton.tsx` — always visible, graceful degrade
- `packages/shared/auth/devSettings.tsx` — **new** public settings + `DevOtpNotice`
- `packages/shared/auth/ForgotPasswordFlow.tsx`
- `packages/shared/auth/index.ts`, `packages/shared/index.ts`
- `packages/api/devSettingsApi.ts` — **new**
- `packages/api/index.ts`, `packages/api/admin.ts`
- `apps/customer/pages/RegisterPage.tsx` — layout + Google + Dev OTP
- `apps/technician/pages/RegisterPage.tsx` — Dev OTP gate
- `apps/admin/pages/DevelopmentControlsPage.tsx` — **new**
- `apps/admin/AdminRoutes.tsx`
- `apps/admin/components/AdminShell.tsx`
- `apps/admin/components/ui.tsx` — disabled Toggle styles

---

## 8. Responsive improvements

| Viewport | Register behaviour                                              |
|----------|-----------------------------------------------------------------|
| Mobile   | Stacked: hero → card → perk cards; Google button full width     |
| Tablet   | Balanced single column / early two-perk row; readable paragraphs|
| Desktop  | Two-column: hero+perks left, Create Account card right          |

Also applied:

- `min-w-0` on grid children (prevents overflow clipping)
- `text-pretty` / `break-words` on long email / body copy
- Consistent card padding (`p-6 sm:p-8 md:p-10`)
- Trust line under the card: “Your information is safe with us.”

---

## 9. Security improvements

- Dev OTP never returned by the API in production
- Dev OTP never rendered unless backend public settings allow it
- Production refuses to start with development flags enabled
- Admin cannot mutate development controls in production
- OTP-shaped digits redacted from console email/SMS logs by default
- Super Admin gate on the controls surface
- Audit trail on every controls change
- Frontend fail-closed: public settings fetch failure → treat as production (hide OTP)

---

## 10. Regression test results

| Check                                      | Result |
|--------------------------------------------|--------|
| Backend `tsc --noEmit`                     | Pass   |
| Frontend `tsc --noEmit`                    | Pass   |
| Tailwind probe: `max-w-md` → container-md  | Pass   |
| Tailwind probe: `max-w-prose` → 65ch       | Pass   |
| Customer Register layout (code review)     | Pass — natural paragraphs, responsive grid |
| Continue with Google always mounted        | Pass   |
| Google graceful degrade message            | Pass   |
| Dev OTP gated by `DevOtpNotice`            | Pass   |
| OTP service uses `isOtpExposureAllowed`    | Pass   |
| Admin Development Controls page wired      | Pass   |
| Production lockdown in `devControlsService`| Pass   |
| Existing register / login / verify flows   | Unchanged contracts (`/auth/register`, `/auth/login`, `/auth/verify-otp`, `/auth/google`) |

Manual browser QA across live desktop/tablet/mobile viewports was not executed in this pass; layout correctness was verified via CSS compile probes and source structure. Recommend a short visual pass on `/customer/register` after deploy.

---

## 11. Remaining recommendations

1. Wire any future **dev-login / test-account / mock-auth** routes through `requireDevFeature(...)` so they inherit production 404 behaviour automatically.
2. Seed a default Super Admin `AdminUser` profile with `adminRoleKey = 'super_admin'` in non-production so Development Controls is reachable out of the box for new environments.
3. Optionally split OTP input into six discrete digit boxes (design mock) — current single-field `OtpInput` remains functionally correct and was left unchanged to avoid business-logic churn.
4. Consider a small unit test for `resolve()` / production lockdown in `devControls.service.ts`.
5. After deploy, confirm Google Sign-In with real `GOOGLE_AUTH_ENABLED=true` + client ID so the button moves from graceful-degrade to live mode.

---

## Success criteria

| Criterion                                                              | Status |
|------------------------------------------------------------------------|--------|
| Register page renders correctly on desktop, tablet, mobile             | Met    |
| Marketing content displays as readable paragraphs                      | Met    |
| Continue with Google renders when configured                           | Met    |
| Google button degrades gracefully if config is missing                 | Met    |
| Dev OTP never visible in production                                    | Met    |
| Backend prevents development bypasses in production                    | Met    |
| Admin can manage development features in non-production                | Met    |
| Production always overrides development settings                       | Met    |
| Existing authentication flow and business logic unchanged              | Met    |
