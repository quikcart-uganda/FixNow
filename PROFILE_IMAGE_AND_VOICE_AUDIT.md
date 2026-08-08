# Profile Image Pipeline & AI Voice Recording — Root Cause Audit

**Date:** 2026-07-26  
**Scope:** End-to-end technician profile images + AI hold-to-record voice

---

## PART 1 — Profile images: where they stopped flowing

### Pipeline (intended)

```
TechnicianProfile.photoUrl (Mongo)
  → publicMediaUrl() / API serializers (photoUrl + profileImageUrl)
  → mapCustomerTechnicianCard / mapTechnicianProfile (photo, profileImageUrl)
  → resolveProfileImageUrl / resolveMediaUrl (API origin for /uploads)
  → ProfileAvatar / LazyImage (skeleton → retry → placeholder)
```

### Root causes (ranked)

| # | Break | Effect |
|---|--------|--------|
| 1 | `resolveMediaUrl` absolutized `/uploads/...` against the **Vite app** `BASE_URL`, not the **API** origin | Local/LAN/Capacitor `<img>` requests hit the frontend host → 404 → immediate placeholder look |
| 2 | Local uploads require HMAC `?exp=&sig=` (or Bearer). Unsigned/expired DB paths fail in `<img>` (no auth header) | Real photos stored as `/uploads/<uuid>` without fresh signature never load |
| 3 | Marketing seed set `photoUrl: BANNER_OFFER` (`/uploads/placeholders/offer-banner.svg`) | Frontend treated marketing paths as non-faces when using technician fallback, so every seeded tech showed the generic avatar |
| 4 | `LazyImage` jumped to fallback on first `onError` with no skeleton / no retry | Failures looked like “designed placeholders,” not load errors |
| 5 | Some screens used raw `<img src={tech.photo}>` without URL normalization | Broken relative paths on profile hero |

### Not the primary cause

- CORS does not block normal `<img>` display (only canvas reads).
- Field-name drift (`photo` vs `photoUrl` vs `avatar`) contributed confusion but mappers already mapped `photoUrl`; the missing piece was **canonical `profileImageUrl` + signed, API-absolute URLs**.

---

## PART 2 — Database

- Schema field: `TechnicianProfile.photoUrl` (string, optional).
- Google auth can set `photoUrl` from `identity.picture` (absolute HTTPS) — those URLs work when present.
- Seeded demo technicians previously stored **marketing banner paths** as `photoUrl` (invalid for faces).
- Fix: new seeds omit `photoUrl`; seed script also `$unset`s known banner values on re-run.

---

## PART 3 — Storage

- Local provider writes under `UPLOAD_DIR`; downloads gated by `secureUploadDownload` + `buildSignedUploadPath`.
- Cloudinary redirects when `path` is `cloudinary://…` and signature/auth is valid.
- API responses now **re-sign** `/uploads/<uuid>` via `publicMediaUrl()` so `<img>` can load without Bearer.

---

## PART 4 — API normalization

Every public technician payload should expose:

- `photoUrl` (legacy)
- `profileImageUrl` (canonical) — same signed/public value

Wired in:

- `technician.service.ts` → `publicTechnician()`
- `offer.service.ts` → technician snaps + `enrichOffer`

Frontend mappers prefer `profileImageUrl` then `photoUrl`.

---

## PART 5 — Frontend

- New `ProfileAvatar` (`packages/ui/ProfileAvatar.tsx`): real photo only when `hasProfilePhoto`; else initials (not marketing art).
- `LazyImage`: skeleton while loading; **one cache-bust retry**; then fallback; then empty person glyph.
- `resolveMediaUrl` / `resolveProfileImageUrl`: `/uploads` → `resolveConfiguredSocketUrl()` origin (LAN/Capacitor-safe).
- Customer Home / Search / Offers / Technician profile use `ProfileAvatar`.

---

## PART 6 — Image loading UX

1. Skeleton shimmer while decoding  
2. Retry once on error  
3. Designed placeholder / initials only after failure or when no photo was uploaded  

---

## AI voice — root causes & fix

### Before

- Tap-to-record → edit transcript → send **text only**
- Audio never uploaded; `/uploads` rejected audio MIME
- No `/ai/transcribe`
- Android missing `RECORD_AUDIO`

### After

| Layer | Change |
|-------|--------|
| UX | Hold-to-record, slide-left cancel, release-to-send; mic↔send toggle; waveform + timer; transcribing state |
| Web | `MediaRecorder` + optional on-device SpeechRecognition |
| Native | `RECORD_AUDIO` (+ iOS mic usage string for AI voice notes) |
| Upload | Audio MIME + magic bytes (webm/ogg/wav/mp4 aliases) |
| API | `POST /ai/transcribe` → store upload + Whisper when OpenAI configured; else client falls back to on-device transcript |
| FAB | Unchanged — AI stays a floating launcher, not bottom nav |

---

## Regression checks

### Profile images

1. Technician with Google `picture` or uploaded photo → face shows on Home “Recommended”, Top Rated, Search, Offer cards, Profile.
2. Technician with null `photoUrl` → initials only (not a broken image icon flash).
3. Web localhost + phone on LAN Vite URL → `/uploads/...` requests go to API host (e.g. `http://192.168.x.x:4000`), not the Vite port.
4. Capacitor Android → same via loopback rewrite (`10.0.2.2` / LAN).
5. Re-run `npm run seed:marketing` → clears banner `photoUrl`s.

### Voice

1. Empty composer → hold mic → waveform → release → “Transcribing…” → message sends.
2. Slide left past threshold → release cancels.
3. Deny mic permission → explanation + typing still works.
4. With `AI_ENABLED` + OpenAI key → Whisper transcript; without key → on-device text if available.

---

## Key files

- `backend/src/utils/mediaUrl.ts`
- `backend/src/services/marketplace/technician.service.ts`
- `backend/src/services/marketing/offer.service.ts`
- `backend/src/services/ai/transcribe.service.ts`
- `backend/src/middleware/upload.ts` / `security/fileMagic.ts`
- `packages/assets/index.ts`
- `packages/ui/LazyImage.tsx` / `ProfileAvatar.tsx`
- `packages/api/mappers.ts` / `aiApi.ts`
- `packages/shared/ai/useAiVoice.ts` / `AiComposer.tsx`
- `android/.../AndroidManifest.xml`
