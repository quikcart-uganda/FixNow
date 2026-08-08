# Image Pipeline Audit — Admin Leaderboard & Global Avatars

**Date:** 2026-07-26  
**Scope:** Admin Trust Centre Leaderboard + Customer / Technician / Admin avatar surfaces

---

## 1. Root cause identified

Broken browser image icons on the Admin Leaderboard were **not** a CSS issue.

### Failure chain

```
DB: TechnicianProfile.photoUrl
  → often marketing placeholder paths (/uploads/placeholders/…)
     or unsigned /uploads/<uuid> relative paths
  → Admin listTechnicians returned RAW Mongo fields (no publicMediaUrl)
  → mapAdminTechnician set avatar = truthy but unloadable string
  → TrustEnginePage rendered <img src={t.avatar}> with NO onError
  → Browser showed the native broken-image glyph
```

### Why Customer Home looked “OK” earlier but Admin did not

Customer surfaces had already been moved toward `ProfileAvatar` / `resolveMediaUrl`.  
**Admin Trust / Technicians / Locks / Free Jobs still used bare `<img>` tags** and the admin list API never re-signed or stripped invalid URLs.

---

## 2. Backend fixes

| Change | File |
|--------|------|
| `publicMediaUrl()` — only emit https/data or **re-signed** `/uploads/<uuid>`; reject marketing placeholders, relative junk, path traversal | `backend/src/utils/mediaUrl.ts` |
| Admin technician list/detail serialize `photoUrl` + canonical `profileImageUrl` via `publicMediaUrl` | `backend/src/services/marketplace/admin.service.ts` |
| Select trust dimension fields for richer leaderboard rows | same |
| Seed: assign Dicebear HTTPS demos; repair empty/banner `photoUrl`s on re-seed | `backend/scripts/seed-marketing.ts` |

Trust recompute path verified:

- `POST /technicians/:id/trust-score/recompute` (admin auth)
- `trustService.recompute` → `recomputeTrustForTechnician`
- Updates `TechnicianProfile` + `TrustScore`, emits realtime event
- Leaderboard menu action calls `adminApi.recomputeTrust`, disables while in-flight, reloads list, surfaces success/error

---

## 3. Frontend / component fixes

| Change | File |
|--------|------|
| `LazyImage` — skeleton, one retry, fallback, `onExhausted` (never leave broken `<img>`) | `packages/ui/LazyImage.tsx` |
| `ProfileAvatar` — real photo → branded role default → initials; roles: technician/customer/admin/support/ai/vendor/shopper | `packages/ui/ProfileAvatar.tsx` |
| Branded default SVG set | `public/assets/images/avatars/*.svg` |
| Asset catalog keys `avatars.*` | `packages/assets/index.ts` |

### Admin pages updated

- `TrustEnginePage.tsx` — ProfileAvatar + overflow menu leaderboard
- `TechniciansPage.tsx`
- `CustomersPage.tsx`
- `LocksPage.tsx`
- `FreeJobsPage.tsx`

### Customer

- `ProfileSettingsPage.tsx` — ProfileAvatar (no bare `<img>`)

---

## 4. Fallback strategy (production)

1. **Real** `profileImageUrl` / signed upload / Cloudinary / Google / Dicebear HTTPS  
2. Else **branded role default** SVG (`avatars.technician`, etc.)  
3. Else **initials** on FixNow-coloured disc (e.g. `JD`)  
4. Optional verification badge overlay  

A broken browser placeholder must never appear.

---

## 5. Leaderboard UX improvements

Each row now shows:

- Rank  
- Profile image (hardened)  
- Verification badge  
- Name + speciality  
- Trust gauge  
- Trend indicator  
- Completed jobs + average rating  
- Level badge  
- **⋮ Overflow menu** instead of a permanent Recompute button  

Menu actions:

- View Profile  
- Trust History  
- Recompute Trust Score (with busy lock)  
- Open Technician  
- Suspend / Disable  

Responsive: stacks cleanly on mobile; side-by-side on desktop.

---

## 6. Security

- Upload paths re-validated; `..` rejected in `publicMediaUrl`  
- Marketing / non-UUID upload paths never exposed as face URLs  
- Existing upload MIME + magic-byte checks remain in place for new uploads  

---

## 7. Performance

- Lazy loading via `LazyImage`  
- Fixed avatar boxes (`h-9`/`h-10`) to limit layout shift  
- Skeleton while decoding  

---

## 8. Verification checklist

| Check | Expected |
|-------|----------|
| Admin → Trust Centre → Leaderboard | Faces or branded/initials — **no** broken icons |
| Technicians / Locks / Free Jobs | Same |
| Recompute via ⋮ | Scores refresh; button disabled while running |
| Missing photo | Initials or branded default |
| Invalid `/uploads/placeholders/…` in DB | API omits URL; UI falls back |
| Re-run `seed:marketing` | Demo Dicebear URLs assigned |

---

## 9. Files modified (summary)

**Backend:** `mediaUrl.ts`, `admin.service.ts`, `seed-marketing.ts`  

**UI:** `LazyImage.tsx`, `ProfileAvatar.tsx`, `packages/assets/index.ts`, `public/assets/images/avatars/*`  

**Admin:** `TrustEnginePage.tsx`, `TechniciansPage.tsx`, `CustomersPage.tsx`, `LocksPage.tsx`, `FreeJobsPage.tsx`  

**Customer:** `ProfileSettingsPage.tsx`  

**Docs:** `IMAGE_PIPELINE_AUDIT.md` (this file)
