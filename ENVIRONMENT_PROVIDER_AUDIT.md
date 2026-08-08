# Environment & Provider Audit

**Date:** 2026-07-25  
**Scope:** Entire FixNow monorepo (backend, frontend/Vite, Capacitor/mobile, shared packages, admin/customer/technician apps, scripts)  
**Rule:** Only providers and env vars that exist in code (plus Cloudinary placeholders mandated as official media config).

---

## Deployment readiness score: **82 / 100**

| Area | Score | Notes |
|------|------:|-------|
| Core API (MongoDB, JWT, CORS) | 20/20 | Required + fail-fast |
| Auth extras (Google GIS, OTP, cookies) | 12/15 | Google optional until enabled |
| Email / SMS | 10/12 | Resend live; SMTP stub; SMS console-only |
| Push (FCM) | 10/12 | Backend + Android artifact; web VAPID unused |
| Media (Cloudinary + local uploads) | 8/12 | Cloudinary **documented**; runtime still `UPLOAD_DIR` |
| Payments | 7/10 | Provider modules exist; **no live credential env reads** |
| AI | 8/8 | OpenAI / Gemini / console |
| Observability | 4/5 | Sentry DSN optional; package optional |
| Frontend / Capacitor | 8/8 | Vite vars + native Firebase file |
| Env examples + validation | 5/5 | All example files present |

Deductions: Cloudinary not yet consumed by upload middleware; payment adapters simulate; SMTP does not yet read `SMTP_*`; no Docker/CI templates in repo.

---

## 1. Providers discovered (actual codebase)

| Provider | Where | Status |
|----------|-------|--------|
| **MongoDB** (Mongoose) | `backend/src/config/database.ts` | Required |
| **JWT** (jsonwebtoken) | `backend/src/utils/jwt.ts` | Required |
| **Socket.IO** | backend sockets + `packages/api/socketEvents.ts` | Required for realtime |
| **Resend** | `providers/email/resend.provider.ts` | Optional (`EMAIL_PROVIDER=resend`) |
| **SMTP** | `providers/email/smtp.provider.ts` | Stub (logs only until transport wired) |
| **Console email / SMS** | email + sms providers | Dev default |
| **Firebase Admin / FCM** | `providers/push/fcm.provider.ts` + Capacitor Push | Optional |
| **Google Identity Services** | `googleAuth.service.ts` + frontend GIS bridge | Optional |
| **Google Maps JS** | `packages/shared/tracking/TrackingMap.tsx` | Optional frontend |
| **OpenAI** | `providers/ai/openai.provider.ts` | Optional |
| **Gemini / Google AI** | `providers/ai/gemini.provider.ts` | Optional |
| **Sentry** | `config/monitoring.ts` | Optional (`SENTRY_DSN`; `@sentry/node` may be absent) |
| **Payments: console / MTN / Airtel / Flutterwave / Pesapal / Stripe** | `providers/payments/*` | Modules exist; live mode still simulated |
| **Multer local disk** | `middleware/upload.ts` | **Active** media storage (`UPLOAD_DIR`) |
| **Cloudinary** | Env schema + examples only | **Official target**; **not imported in TS yet** |
| **Capacitor + Firebase Android** | `google-services.json(.example)` | Native push config file |

### Not found (not invented)

Apple Sign In, Facebook Login, Microsoft Login, Firebase Auth (as IdP), Redis, Redis Socket adapter, Twilio / Africa’s Talking / Infobip / Vonage, Paystack / PayPal / DPO / Pesapal live SDKs with keys, AWS S3, Azure Blob, Supabase Storage, Anthropic, DeepSeek, Datadog, New Relic, Logtail, GA / PostHog / Mixpanel / Amplitude, SendGrid / Mailgun / SES.

---

## 2. Environment files

| File | Role |
|------|------|
| `backend/.env.example` | Backend master template |
| `backend/.env.development.example` | Local backend defaults |
| `backend/.env.production.example` | Production backend placeholders |
| `.env.example` | Frontend / Capacitor master template |
| `.env.development.example` | Local Vite defaults |
| `.env.production.example` | Production Vite placeholders |

**Do not commit** filled `.env` / `backend/.env` (gitignored).

---

## 3. Backend variables

### Required at startup

| Variable | Provider |
|----------|----------|
| `MONGODB_URI` | MongoDB |
| `JWT_ACCESS_SECRET` (≥32) | JWT |
| `JWT_REFRESH_SECRET` (≥32) | JWT |

### Optional / conditional

Grouped as in example files: Server, CORS, Local uploads, **Cloudinary**, Email (Resend + SMTP_*), SMS, Firebase/FCM, Google Identity, Payments, AI, domain windows, Sentry.

### Cloudinary (official media — placeholders ready)

```
CLOUDINARY_CLOUD_NAME=YOUR_CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET=YOUR_CLOUDINARY_API_SECRET
CLOUDINARY_UPLOAD_PRESET=YOUR_CLOUDINARY_UPLOAD_PRESET
CLOUDINARY_FOLDER=fixnow   # optional
```

**Runtime today:** profiles, banners, chat attachments, portfolio, documents, etc. go through authenticated `POST /uploads` → Multer → `UPLOAD_DIR` (+ signed `/uploads` downloads). Cloudinary vars are validated/optional and documented for when storage is switched; **upload business logic was not changed**.

### Scripts-only (not API startup)

`API_BASE`, `API_ORIGIN`, `SOCKET_URL`, `FIXNOW_API_URL`, `AI_EVAL_BASE_URL`

---

## 4. Frontend / Capacitor variables

| Variable | Used? | Provider |
|----------|-------|----------|
| `VITE_API_URL` | Yes | FixNow API |
| `VITE_SOCKET_URL` | Yes | Socket.IO |
| `VITE_FCM_WEB_TOKEN` | Yes (optional) | FCM web test inject |
| `VITE_GOOGLE_MAPS_API_KEY` | Yes (optional) | Google Maps |
| `VITE_GOOGLE_AUTH_BRIDGE_ORIGIN` | Yes (optional) | GIS Capacitor bridge |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Example / types only | GIS (ID from API at runtime) |
| `VITE_FCM_VAPID_KEY` | Typed only | Reserved |
| `VITE_SENTRY_DSN` | Typed only | Reserved |
| `CAP_SERVER_URL` | Capacitor config | Live-reload only |

Native (non-Vite): `android/app/google-services.json`, `android/keystore.properties`.

---

## 5. Validation improvements (`backend/src/config/env.ts`)

- Added optional **Cloudinary**, **SMTP_***, `MESSAGE_EDIT_WINDOW_MS`, `TRACKING_RETENTION_DAYS`.
- **Provider guards** (all envs): Resend needs key; SMTP+production needs host; Google auth needs client ID; AI openai/gemini need keys; FCM needs Firebase creds.
- **Production guards** extended: reject `YOUR_` JWT placeholders; incomplete Cloudinary pair if cloud name set.
- Services now read validated `env.*` for message edit window, tracking retention, review edit window, Resend `EMAIL_FROM` (no behavior change — same defaults).

---

## 6. Gap analysis

### Missing from examples (now added)

- Cloudinary block  
- SMTP_*  
- `MESSAGE_EDIT_WINDOW_MS`, `TRACKING_RETENTION_DAYS`  
- Root/backend `.env.development.example` / `.env.production.example`  
- Frontend Google Maps / GIS types in `vite-env.d.ts`

### Unused / legacy / inconsistent

| Item | Finding |
|------|---------|
| `VITE_GOOGLE_WEB_CLIENT_ID` | Documented; **not read** in TS (API supplies client ID) |
| `VITE_FCM_VAPID_KEY` | Typed; **never read** |
| `VITE_SENTRY_DSN` | Typed; **never read**; no frontend Sentry package |
| `FIXNOW_API_URL` vs `API_BASE` | Scripts use both names for the same idea |
| `GOOGLE_AI_API_KEY` vs `GEMINI_API_KEY` | Alias — both valid for Gemini |
| `AI_API_KEY` | Generic fallback for OpenAI/Gemini |
| Payment provider secrets | **No env names in code** — adapters simulate |
| Cloudinary | Env reserved; **no `cloudinary` package import** |

### Duplicates (intentional aliases)

- `PUBLIC_GOOGLE_CLIENT_ID` ↔ `GOOGLE_CLIENT_ID`  
- `GEMINI_API_KEY` ↔ `GOOGLE_AI_API_KEY` ↔ `AI_API_KEY`  
- `OPENAI_API_KEY` ↔ `AI_API_KEY`

---

## 7. Files modified

| File | Change |
|------|--------|
| `backend/src/config/env.ts` | Cloudinary/SMTP/windows + provider fail-fast |
| `backend/src/services/messaging/message.service.ts` | Use `env.MESSAGE_EDIT_WINDOW_MS` |
| `backend/src/services/tracking/tracking.service.ts` | Use `env.TRACKING_RETENTION_DAYS` |
| `backend/src/services/reviews/reputation.math.ts` | Use `env.REVIEW_EDIT_WINDOW_MS` |
| `backend/src/providers/email/resend.provider.ts` | Use `env.EMAIL_FROM` |
| `backend/.env.example` | Full grouped placeholders |
| `backend/.env.development.example` | **Created** |
| `backend/.env.production.example` | **Created** |
| `.env.example` | Full grouped placeholders |
| `.env.development.example` | **Created** |
| `.env.production.example` | **Created** |
| `src/vite-env.d.ts` | Google Maps / GIS types |
| `ENVIRONMENT_PROVIDER_AUDIT.md` | This report |

**Business logic / upload pipeline:** unchanged.

---

## 8. How to apply

```bash
# Backend
cp backend/.env.development.example backend/.env
# edit MONGODB_URI + JWT secrets; add Cloudinary/Resend/FCM when ready

# Frontend
cp .env.development.example .env
# edit VITE_API_URL / Maps / Google as needed
```

Startup fails fast on invalid required config and on inconsistent provider selections (see production notes in `backend/.env.example`).

---

## 9. Remaining work for 100% live readiness (out of scope here)

1. Wire Multer uploads to Cloudinary using existing env vars (without inventing alternate storage).  
2. Implement live payment credential env reads for MTN / Airtel / Flutterwave / Pesapal / Stripe.  
3. Wire SMTP transport to `SMTP_*`.  
4. Optionally consume `VITE_FCM_VAPID_KEY` / frontend Sentry, or remove unused types.  
5. Add Docker/CI secret injection when deployment pipelines exist.
