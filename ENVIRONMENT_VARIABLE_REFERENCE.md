# Environment Variable Reference

**Date:** 2026-07-28  
**Templates:** `.env.example`, `.env.development.example`, `.env.production.example` (repo root) and `backend/.env.example` (+ development/production variants).

Credentials always live in environment variables. Admin **Provider Manager** only chooses which configured provider is active — it never writes secrets.

---

## How to use

| File | Purpose |
|------|---------|
| `backend/.env` | API runtime (copy from `backend/.env.example`) |
| Repo root `.env` | Vite / Capacitor frontend |
| `*.development.example` | Local defaults |
| `*.production.example` | Production checklist |

Legend: **Required** = needed for that mode; **Optional** = feature-gated; **Dev-only** = forced off in production; **Planned** = documented for upcoming adapters.

---

## Application / server (backend)

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Yes | `development` \| `production` \| `test` |
| `APP_ENV` | Optional | Defaults to `NODE_ENV` |
| `PORT` | Yes | Default `4000` |
| `HOST` | Optional | Default `0.0.0.0` for LAN |
| `API_PREFIX` | Optional | Default `/api/v1` |
| `APP_NAME` | Optional | |
| `APP_VERSION` | Optional | Exposed on `/version` |
| `MONGODB_URI` | Yes | Local or Atlas |

## Auth / JWT / Google

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_ACCESS_SECRET` | Yes | Non-placeholder in production |
| `JWT_REFRESH_SECRET` | Yes | |
| `JWT_*_EXPIRES_IN` | Optional | |
| `CORS_ORIGINS` | Yes (prod) | Comma-separated; no localhost in prod |
| `GOOGLE_AUTH_ENABLED` | Optional | |
| `GOOGLE_CLIENT_ID` / `PUBLIC_GOOGLE_CLIENT_ID` | If Google on | |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Frontend | |
| Dev flags `ENABLE_*` / `ALLOW_DEV_ADMIN_LOGIN` | Dev-only | Forced off in production |

## AI

| Variable | Required when | Notes |
|----------|---------------|-------|
| `AI_ENABLED` | — | `false` → local knowledge only |
| `AI_PROVIDER` | AI on | `console` \| `openai` \| `gemini` |
| `OPENAI_API_KEY` | openai | Or `AI_API_KEY` |
| `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` | gemini | |
| `AI_MODEL*` / `AI_TEMPERATURE` / `AI_MAX_TOKENS` | Optional | |
| `AI_REQUEST_TIMEOUT_MS` | Optional | Default 30000 |
| `AI_PROVIDER_RETRY_COUNT` | Optional | Default 1 |
| Role enable flags | Optional | Per-assistant kill switches |
| `ANTHROPIC_*` / `AZURE_*` / `OLLAMA_*` | Planned | Catalog only |

## Email

| Variable | Required when | Notes |
|----------|---------------|-------|
| `EMAIL_PROVIDER` | — | `console` \| `resend` \| `smtp` (console forbidden in prod) |
| `RESEND_API_KEY` | resend | |
| `SMTP_HOST` | smtp | |
| `EMAIL_FROM` / `SMTP_*` | Optional | |
| SendGrid / Mailgun / SES keys | Planned | |

## SMS

| Variable | Required when | Notes |
|----------|---------------|-------|
| `SMS_PROVIDER` | — | Currently `console` only |
| Twilio / Africa's Talking / Infobip | Planned | |

## Push / Firebase

| Variable | Required when | Notes |
|----------|---------------|-------|
| `PUSH_PROVIDER` | — | `console` \| `fcm` |
| `FIREBASE_PROJECT_ID` + service account | fcm | |
| `VITE_FCM_VAPID_KEY` | Web push | |
| Native | — | `android/app/google-services.json` |

## Storage

| Variable | Required when | Notes |
|----------|---------------|-------|
| `MEDIA_STORAGE_PROVIDER` | — | `auto` \| `cloudinary` \| `local` |
| `CLOUDINARY_*` | cloudinary/auto | |
| S3 / R2 | Planned | |

## Payments

| Variable | Required when | Notes |
|----------|---------------|-------|
| `PAYMENT_DEFAULT_PROVIDER` | — | Env default; Admin may override active |
| `PAYMENTS_LIVE` | Live charges | |
| MTN / Airtel / Flutterwave / Pesapal / Stripe blocks | Per provider | |
| DPO / PayPal | Planned | |

## Maps / Monitoring / Analytics

| Variable | Notes |
|----------|-------|
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JS tiles (TrackingMap); empty → text fallback |
| `GOOGLE_MAPS_SERVER_API_KEY` | Backend Location Platform — Geocoding, Places, Directions, Distance Matrix |
| `GOOGLE_MAPS_API_KEY` | Optional alias for server key |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Optional monitoring |
| GA / PostHog / Plausible / CAPTCHA | Planned placeholders in examples |

## Frontend / Capacitor

| Variable | Notes |
|----------|-------|
| `VITE_API_URL` / `VITE_SOCKET_URL` | API + realtime |
| `VITE_DEV_LAN_HOST` | Phone → PC LAN |
| `CAP_SERVER_URL` | Dev live-reload only |
| `VITE_APP_RELEASE_VERSION` | Download prompt / release marker |

---

## Validation rules

- Provider-specific keys are only **required at activation / live use**, not when the type is `None` / `console`.
- Production startup refuses unsafe combinations (console email, placeholder JWTs, live payments without webhook secret, AI without keys when enabled, etc.).
- See Admin → **Provider Manager** for missing-env messages per provider.
