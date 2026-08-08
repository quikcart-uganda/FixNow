# Provider Configuration Guide

**Date:** 2026-07-28  
**Admin UI:** System Settings → **Provider Manager** (`/admin/settings/providers`)

---

## Principles

1. **Environment variables** hold all credentials and default selectors (`AI_PROVIDER`, `EMAIL_PROVIDER`, …).
2. **Provider Manager** discovers what is configured and lets Super Admins choose the **active** provider per type.
3. Selecting **None** disables that integration and forces graceful fallbacks.
4. Secrets are **never** shown in the Admin UI or API responses.
5. Switching active providers does **not** rewrite `.env` files.

---

## Quick start

1. Copy `backend/.env.example` → `backend/.env` and fill credentials for the vendors you use.
2. Copy root `.env.example` → `.env` for Vite keys (maps, Sentry, FCM VAPID, Google client).
3. Restart the API so discovery picks up new env vars.
4. Sign in as Super Admin → **Provider Manager**.
5. Click **Test connection**, then **Activate** on a green “Configured” provider.
6. If the UI warns about restart (maps / Sentry), rebuild frontend or restart the process.

---

## Provider types

| Type | Implemented today | None behaviour |
|------|-------------------|----------------|
| AI | none, console, OpenAI, Gemini | Local FixNow knowledge only |
| Email | none, console, Resend, SMTP | Console log / no send |
| SMS | none, console | Console log |
| Maps | none, Google | Status/text tracking panels |
| Push | none, console, FCM | In-app notifications only |
| Monitoring | none, Sentry | Structured logs only |
| Storage | none/local, Cloudinary | Local disk uploads |
| Payments | console + MTN/Airtel/Flutterwave/Pesapal/Stripe | Simulated when live off |
| Analytics / Search / CAPTCHA | none (+ planned vendors) | First-party / Mongo only |

Planned vendors appear in the catalog as **Planned** and cannot be activated until adapters ship — but their env placeholders are documented so keys can be prepared.

---

## Failover

For AI (and catalog-flagged types), set a secondary via activate payload `failoverId` (Admin UI can be extended; API supports it). If the primary is missing credentials at runtime, the manager resolves to the failover when configured.

---

## Module integration

| Module | Factory / entry |
|--------|-----------------|
| AI chat | `getAiProviderAsync()` → Provider Manager |
| Email | `getEmailProvider()` + cache clear on activate |
| Payments | `getPaymentProvider` / override from Manager |
| Storage | `getMediaStorage()` |
| Push | `PUSH_PROVIDER` / FCM env (Manager status + activate) |
| Maps | Frontend `VITE_GOOGLE_MAPS_API_KEY` (restart/rebuild) |

---

## Security

- Activate / deactivate / test require **Super Admin**.
- Changes write **AuditLog** (`providers.activate`, `providers.test`).
- Responses expose `missingEnv` names only — never values.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Activate disabled | Missing env listed on the card |
| AI still console | Set `AI_ENABLED=true` and activate openai/gemini |
| Email blocked in prod | Do not leave `EMAIL_PROVIDER=console` |
| Maps blank | Set `VITE_GOOGLE_MAPS_API_KEY` and rebuild |
| Android stale media/API | `npm run mobile:sync` after web deploy |
