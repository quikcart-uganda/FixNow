# FixNow Authentication Architecture

Production authentication and RBAC for the shared FixNow API (Customer, Technician, Admin).

---

## 1. Goals

- Real bcrypt password hashing (never plain text)
- JWT access tokens + rotating refresh tokens
- Role-based access control (`customer` | `technician` | `admin`)
- OTP for email/phone verification and password reset
- Brute-force protection, rate limits, audit logging
- Provider interfaces for Email (console / Resend / SMTP) and SMS (console → future gateways)

Non-goals (out of scope for this layer): Jobs, Messaging, Reviews business logic.

---

## 2. Identity model

| Field | Source |
|-------|--------|
| Unique id | `User._id` |
| Email / phone | `User.email`, `User.phone` |
| Password hash | `User.passwordHash` (`select: false`) |
| Role | `User.role` |
| Account status | `pending_verification` \| `active` \| `locked` \| `suspended` \| `deleted` |
| Verification | `emailVerifiedAt`, `phoneVerifiedAt` → derived `verificationStatus` |
| Last login | `lastLoginAt`, `lastLoginIp` |
| Refresh invalidation | `refreshTokenVersion` + `RefreshToken` / `Session` collections |

On register, a role profile is created (`CustomerProfile` or `TechnicianProfile`).

---

## 3. Authentication flow

```
Register (customer|technician)
  → hash password (bcrypt 12)
  → User status = pending_verification
  → issue email OTP
  → (optional) verify-otp → status = active

Login
  → check lock/suspend
  → verify password
  → on failure: increment failedLoginAttempts → lock after N
  → on success: issue access + refresh, create Session
  → rememberMe extends refresh TTL

Access protected route
  → Bearer access JWT
  → authenticate(): verify JWT, load user, check status + token version
  → authorize(...roles)
```

---

## 4. JWT flow

### Access token
- Secret: `JWT_ACCESS_SECRET`
- TTL: `JWT_ACCESS_EXPIRES_IN` (default 15m)
- Claims: `sub`, `role`, `typ: "access"`, `rv` (refreshTokenVersion)

### Refresh token
- Secret: `JWT_REFRESH_SECRET`
- TTL: `JWT_REFRESH_EXPIRES_IN` (7d) or `JWT_REFRESH_REMEMBER_EXPIRES_IN` (30d)
- Claims: `sub`, `role`, `typ: "refresh"`, `rv`, `familyId`, `jti`
- Persisted as SHA-256 hash in `RefreshToken` (raw token never stored)

### Socket.IO
Handshake accepts the same access JWT via `auth.token` or `Authorization`.

---

## 5. Refresh token rotation

```
Client sends refresh JWT
  → verify signature + typ
  → lookup hash in RefreshToken
  → if missing/revoked → revoke entire family (reuse detection) → 401
  → if rv mismatch → revoke family → 401
  → revoke current token
  → issue new refresh (same familyId, new jti) + new access
  → update Session pointer
```

Force logout / password change increments `User.refreshTokenVersion`, invalidating all outstanding tokens.

Optional httpOnly cookie `fixnow_refresh` when `AUTH_COOKIE_ENABLED=true`.

---

## 6. Role system

| Role | Registration | Typical access |
|------|--------------|----------------|
| `customer` | Public register | Customer routes via `authorize('customer')` |
| `technician` | Public register | Technician routes via `authorize('technician')` |
| `admin` | Provisioned (not public register) | Admin routes via `authorize('admin')` |

Middleware:

- `authenticate()` — requires valid access token + usable account
- `authorize(...roles)` — role gate
- `requireVerifiedEmail()` — optional stricter gate

Admin RBAC data model (`AdminUser` / `AdminRole` / `Permission`) is ready for fine-grained permissions; HTTP admin auth controls below use role=`admin`.

---

## 7. Permission system (data + path)

1. **Coarse:** JWT `role` + `authorize()`
2. **Fine (ready):** `Permission.key` → `AdminRole.permissionKeys` → `AdminUser.permissionKeys` denormalized for O(1) checks (service layer can enforce later)

Admin account controls (implemented):

| Endpoint | Effect |
|----------|--------|
| `POST /admin/users/:id/suspend` | Suspend + revoke sessions |
| `POST /admin/users/:id/unlock` | Clear lock / restore active or pending |
| `POST /admin/users/:id/force-logout` | Bump token version + revoke |
| `POST /admin/users/:id/reset-password` | Set new password + revoke |

---

## 8. OTP flow

```
issueOtp(purpose, channel, destination)
  → invalidate prior active OTPs for purpose
  → store SHA-256(code), TTL from OTP_TTL_MINUTES
  → EmailProvider or SmsProvider.send()

verifyOtp / verify-otp
  → load latest unconsumed non-expired challenge
  → attempt counter (max 5)
  → consume on success
  → email_verification → set emailVerifiedAt, activate account
  → phone_verification → set phoneVerifiedAt
```

Purposes: `email_verification`, `phone_verification`, `password_reset`, `login`.

In development, OTP may appear as `debugOtp` in responses (`env.exposeOtp`).

---

## 9. Password flows

| Flow | Behavior |
|------|----------|
| Forgot | Always returns success (no email enumeration); OTP emailed if user exists |
| Reset | OTP + new password; bumps `rv`; revokes sessions |
| Change | Requires current password + auth; bumps `rv` |

---

## 10. Session management

- `Session` linked to `RefreshToken`
- `GET /auth/sessions` — list active
- `DELETE /auth/sessions/:id` — revoke one
- `POST /auth/sessions/revoke-all` — revoke all + bump `rv`

---

## 11. Security measures

| Control | Implementation |
|---------|----------------|
| Helmet | Global in `app.ts` |
| API rate limit | `apiRateLimiter` |
| Auth rate limit | `authRateLimiter` (30 / 15m) |
| Login throttle | `loginRateLimiter` (10 / 15m) |
| Brute-force lock | `AUTH_MAX_FAILED_LOGINS` + `AUTH_LOCKOUT_MINUTES` |
| Password hashing | bcrypt cost 12 |
| Refresh rotation + reuse detection | Family revoke |
| Secure cookies | `COOKIE_SECURE` / production |
| Audit log | `AuditLog` on auth/admin events |
| Zod validation | Every auth request body |

---

## 12. Provider interfaces

```
providers/email/  EmailProvider → console | resend | smtp
providers/sms/    SmsProvider   → console (Twilio / Africa's Talking later)
```

Selected by `EMAIL_PROVIDER` / `SMS_PROVIDER`. No provider SDKs hardcoded into domain logic.

---

## 13. API response shape

Success:

```json
{ "success": true, "message": "Logged in", "data": { } }
```

Error:

```json
{
  "success": false,
  "message": "Invalid email or password",
  "data": null,
  "errors": { },
  "error": { "code": "UNAUTHORIZED", "message": "...", "requestId": "..." }
}
```

---

## 14. Auth endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/auth/register` | Public |
| POST | `/api/v1/auth/login` | Public |
| POST | `/api/v1/auth/logout` | Access |
| POST | `/api/v1/auth/refresh` | Refresh |
| POST | `/api/v1/auth/forgot-password` | Public |
| POST | `/api/v1/auth/reset-password` | Public |
| POST | `/api/v1/auth/change-password` | Access |
| POST | `/api/v1/auth/verify-otp` | Public |
| POST | `/api/v1/auth/resend-otp` | Public |
| GET | `/api/v1/auth/me` | Access |
| GET | `/api/v1/auth/sessions` | Access |
| DELETE | `/api/v1/auth/sessions/:id` | Access |
| POST | `/api/v1/auth/sessions/revoke-all` | Access |

---

## 15. File map

```
src/services/auth/auth.service.ts   # register/login/refresh/OTP/password/sessions
src/services/auth/otp.service.ts    # OTP issue/verify + delivery
src/providers/email|sms/            # delivery interfaces
src/middleware/authenticate.ts      # authenticate / authorize
src/models/auth/OtpChallenge.ts     # OTP persistence
src/utils/jwt.ts | password.ts | crypto.ts | audit.ts
```
