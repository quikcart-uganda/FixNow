# Cloudinary Storage Audit & Migration Report

**Date:** 2026-07-28  
**Scope:** FixNow backend, admin, customer, technician, shared packages, native (Android / iOS / web)  
**Status:** Complete — Cloudinary is the default storage provider

---

## Executive verdict

| Criterion | Status |
|-----------|--------|
| No production upload writes permanently to local filesystem | ✅ Multer stages to `UPLOAD_DIR`; Cloudinary persist unlinks staging file |
| Historical media available | ✅ Local `/uploads/placeholders/*` remapped to `asset:` catalog (or Cloudinary when real files exist) |
| New uploads go to Cloudinary | ✅ `MEDIA_STORAGE_PROVIDER=cloudinary` |
| DB references safe | ✅ No records broken; placeholders remapped; HTTPS/Dicebear left untouched |
| Migration idempotent / resumable | ✅ State file + deterministic public IDs + content-hash dedupe |
| Existing content still renders | ✅ `resolveMediaUrl` / `asset:` / Cloudinary HTTPS all supported |

---

## 1. Storage inventory

### Providers

| Provider | Path | Role |
|----------|------|------|
| **Cloudinary** (default) | `backend/src/providers/storage/cloudinary.provider.ts` | Official persistence + CDN delivery |
| Local (emergency) | `backend/src/providers/storage/local.provider.ts` | Only when `MEDIA_STORAGE_PROVIDER=local` or credentials missing under `auto` |
| Resolver | `backend/src/providers/storage/index.ts` | `getMediaStorage()` |
| Transforms | `backend/src/providers/storage/transforms.ts` | Responsive presets, video poster/stream helpers |

### Upload pipeline

```
Client FormData
  → POST /api/v1/uploads (authenticated)
  → multer.diskStorage → UPLOAD_DIR (staging only)
  → validateUploadedFileMagic (incl. SVG)
  → uploadService.registerUpload
       → SHA-256 duplicate check
       → getMediaStorage().persist() → Cloudinary
       → Upload document (provider, publicId, url, dimensions, hash)
  → staging file unlinked
```

AI voice: `POST /ai/transcribe` now **transcribes before** Cloudinary persist (fixes race where Whisper lost the staging file).

### Routes

| Method | Path | Notes |
|--------|------|-------|
| POST | `/uploads` | All role uploads |
| DELETE | `/uploads/:id` | Owner or admin; destroys Cloudinary asset |
| GET | `/uploads/:file` | Signed/auth gate; Cloudinary rows 302 to CDN |
| POST | `/ai/transcribe` | Voice notes |

### Frontend upload callers (all → Cloudinary)

| Surface | API helper | Purpose |
|---------|------------|---------|
| Admin MediaLibrary | `/uploads` `cms-*` | CMS / marketing |
| Admin banners | `cms-banners` | Banner crops |
| Categories | `category` | Category images |
| Technician offers | `banner` | Offer banners |
| Portfolio | `portfolio` | Photos / video / PDF |
| Community | `community` | Discussion images |
| Chat / AI attachments | `chat` | Message media |
| Shared | `packages/api/uploadMedia.ts` | Offline-aware wrapper |

### Not used

- S3 / MinIO / Azure Blob / Firebase Storage
- `express.static` for uploads (replaced by signed gate)
- `public/uploads` folder (does not exist)

---

## 2. Local asset inventory (pre-migration)

| Location | Count | Action |
|----------|-------|--------|
| `backend/uploads/placeholders/*.svg` | 3 seed SVGs | Kept on disk as seed helpers; DB no longer references them |
| `backend/uploads/<uuid>.*` | **0** | No real user files on disk |
| `public/assets/images/**` | Catalog SVGs | Remain Vite static via `asset:` keys (not UGC) |
| DB `technicianoffers.bannerImageUrl` | 8 × `/uploads/placeholders/offer-banner.svg` | → `asset:promotions.weekend` |
| DB `categories.bannerImageUrl` | 16 × missing JPG placeholders | → nearest `asset:categories.*` |
| DB profiles / jobs / chat / KYC | 0 local paths | Technician photos already HTTPS (Dicebear) |
| `uploads` collection | 0 docs | Ready for new Cloudinary-backed rows |

---

## 3. Database field mapping

### Upload registry (enriched)

| Field | Purpose |
|-------|---------|
| `provider` | `local` \| `cloudinary` |
| `publicId` | Cloudinary public_id |
| `path` | `cloudinary://…` or local abs path |
| `url` | Delivery HTTPS (f_auto/q_auto for images) |
| `format` / `width` / `height` / `resourceType` | Media metadata |
| `contentHash` | SHA-256 dedupe |
| `migratedAt` | Migration stamp |

### Domain collections scanned

`technicianprofiles`, `customerprofiles`, `jobs`, `jobattachments`, `messageattachments`, `portfoliomedias`, `casestudies`, `certificates`, `identityverifications`, `skillverifications`, `certifications`, `discussions`, `communityreplies`, `platformpromotions`, `sponsoredcontents`, `technicianoffers`, `contentblocks`, `contentpages`, `categories`, `visitverifications`, `marketplacelistings`, `uploads`

**Skip forever:** `asset:*`, external HTTPS (Dicebear/Unsplash), Lucide `icon` keys.

---

## 4. Migration summary

**Script:** `backend/scripts/migrate-to-cloudinary.ts`  
**Command:** `npm run migrate:cloudinary` (`--dry-run`, `--delete-local`)  
**State:** `backend/uploads/.cloudinary-migration-state.json`  
**JSON report:** `CLOUDINARY_MIGRATION_REPORT.json`

### Latest successful run

| Metric | Value |
|--------|-------|
| Scanned refs | 96 |
| Remapped to `asset:` | 24 (16 categories + 8 offers across runs) |
| Uploaded to Cloudinary | 0 real UGC files (none on disk) |
| Failed | 0 (after placeholder remap + metadata fix) |
| Local deletes | 0 (verification-first; `--delete-local` not used) |

### Idempotency / resume

- Deterministic `public_id` = `{CLOUDINARY_FOLDER}/migrated/{path}-{hash12}`
- State file records verified URLs
- Re-run skips `asset:`, Cloudinary HTTPS, and already-verified keys
- Content-hash dedupe on new uploads prevents duplicate Cloudinary objects

### Note on first failed attempt

Initial uploads failed when sending Cloudinary **structured metadata** (`content_hash`) without predefined metadata fields. Removed from upload options; content hash is stored only in MongoDB.

Cloudinary connectivity verified: `ping` OK; diagnostic SVG upload OK.

---

## 5. Cloudinary folders

Root: `CLOUDINARY_FOLDER` (default `fixnow`)

| Purpose | Folder |
|---------|--------|
| profile / avatar | `fixnow/profiles` |
| logos | `fixnow/logos` |
| banners / promotions / ads | `fixnow/marketing/*` |
| categories | `fixnow/categories` |
| portfolio | `fixnow/portfolio` |
| chat | `fixnow/chat` |
| verification / KYC | `fixnow/verification` |
| documents / certificates | `fixnow/documents`, `fixnow/certificates` |
| community | `fixnow/community` |
| AI voice | `fixnow/ai/voice` |
| CMS (`cms-*`) | `fixnow/cms/{folder}` |
| migration | `fixnow/migrated` |

---

## 6. Upload pipeline changes

| Change | Detail |
|--------|--------|
| Default provider | `MEDIA_STORAGE_PROVIDER=cloudinary` in `.env` + examples |
| Upload model | provider, publicId, dimensions, hash, migratedAt |
| Dedupe | Hash before upload; reuse existing Cloudinary URL |
| Destroy API | `DELETE /uploads/:id` + Cloudinary `destroy` |
| SVG allowed | MIME + magic-byte text detection |
| Transforms | Server presets + client `packages/assets/cloudinary.ts` |
| Offline queue | `packages/native/offlineUpload.ts` (≤4MB); flushed on reconnect |
| Shared client | `packages/api/uploadMedia.ts` used by messages/portfolio/offers/categories |
| Admin MediaLibrary | Preview, Cloudinary URL, public_id, dimensions, size, replace, delete |
| Seed marketing | Uses `asset:` banners (no new local placeholder DB refs) |
| AI transcribe | Whisper before Cloudinary persist |

---

## 7. Image optimisation

| Feature | Implementation |
|---------|----------------|
| Auto format / quality | `f_auto,q_auto` on image delivery |
| Presets | avatar, avatar@2x, thumbnail, gallery, hero, banner, bannerMobile, blur, poster |
| Client helpers | `cloudinaryPresetUrl`, `cloudinarySrcSet`, `withCloudinaryTransform` |
| Lazy loading | Existing `LazyImage` |
| Blur placeholder | `blur` preset (w_40 + blur:800) |
| Eager transforms | Applied at delivery URL build time (CDN-cached) |

---

## 8. Video support

| Feature | Status |
|---------|--------|
| Upload `video/mp4` | Allowed via multer → Cloudinary `resource_type: video` |
| Audio (voice) | Stored as Cloudinary video resource type |
| Streaming URL + poster | `cloudinaryVideoUrls(publicId)` in transforms |
| Adaptive quality | `q_auto` / `f_auto` on video delivery |

---

## 9. Cleanup

| Item | Status |
|------|--------|
| Local permanent store for new uploads | Disabled when Cloudinary configured |
| Placeholder DB paths | Removed via remap |
| Seed writing `/uploads/placeholders` into DB | Stopped (asset keys) |
| Disk placeholders | Retained for optional seed tooling; not served as product media |
| Obsolete `express.static` uploads | Already absent |

---

## 10. Error handling & security

| Control | Detail |
|---------|--------|
| Retry | 3 attempts with backoff on Cloudinary upload |
| Resume | Migration state file |
| Rollback | DB update only after CDN HEAD/GET verify |
| Duplicate detection | SHA-256 on Upload collection |
| MIME allowlist | jpeg/png/webp/svg/pdf/mp4/audio |
| Magic bytes | `fileMagic.ts` (SVG via XML marker) |
| AuthZ | Upload requires auth; delete owner-or-admin |
| Signed local downloads | HMAC tokens still for legacy local files |
| Virus scanning | Hook point: post-magic middleware (not enabled) |
| Signed uploads | Server-side API secret (no unsigned client uploads) |

---

## 11. Admin

MediaLibrary now shows:

- Optimised thumbnail preview  
- Full Cloudinary URL  
- `public_id`  
- Dimensions + file size + format + upload date  
- Replace image  
- Delete image (Cloudinary destroy when id is a Mongo Upload id)

Crop remains via existing `ImageCropDialog` before upload.

---

## 12. Mobile / platform verification

| Platform | Upload path | Offline |
|----------|-------------|---------|
| Android (Capacitor) | Same `POST /uploads` → Cloudinary | Queued via `offlineUpload` ≤4MB |
| iOS (Capacitor) | Same | Same |
| Mobile web | Same | Same |
| Desktop web | Same | Same |

`OfflineQueueHost` flushes mutation queue **and** media upload queue on `online` / app resume.

---

## 13. Performance

- CDN delivery via `res.cloudinary.com`
- `f_auto` / `q_auto` reduces payload
- Responsive presets avoid shipping full-res to avatars/lists
- Staging disk I/O only during upload request

---

## 14. Testing checklist

| Workflow | Expected |
|----------|----------|
| Admin MediaLibrary upload | Returns `storage: cloudinary`, HTTPS URL, dimensions |
| Technician portfolio upload | Cloudinary URL persisted on PortfolioMedia |
| Chat image attach | Cloudinary URL on MessageAttachment |
| Category banner upload | Cloudinary URL on Category |
| Offer banner upload | Cloudinary URL on TechnicianOffer |
| AI voice note | Transcript OK + Cloudinary voice asset |
| Migrated category banners | Render via `asset:categories.*` |
| Migrated offer banners | Render via `asset:promotions.weekend` |
| Technician avatars | Existing Dicebear HTTPS unchanged |
| Re-run `npm run migrate:cloudinary` | No duplicates / no failures |
| Offline upload then reconnect | Flush uploads to Cloudinary |

---

## 15. Files touched (primary)

**Backend:** storage providers, transforms, Upload model, uploadService, upload middleware, fileMagic, uploads security, AI transcribe order, routes, env examples, `migrate-to-cloudinary.ts`, seed-marketing  

**Packages:** `assets/cloudinary.ts`, `api/uploadMedia.ts`, messages/offers/categories/portalProduction APIs, native offlineUpload + resync + OfflineQueueHost  

**Admin:** `MediaLibrary.tsx`  

**Docs:** this file + `CLOUDINARY_MIGRATION_REPORT.json`

---

## 16. Operational notes

1. Keep `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` set in every deployed environment.
2. Use `MEDIA_STORAGE_PROVIDER=cloudinary` in production (already set).
3. Re-run migration anytime after restoring backups: `npm run migrate:cloudinary`.
4. Only pass `--delete-local` after confirming CDN URLs in production.
5. Brand/catalog SVGs under `public/assets/images` intentionally stay on the app CDN / Vite host — they are not user media.
6. Do not commit real `.env` secrets; examples use placeholders only.

---

## Success criteria — final

- ✅ No production upload permanently lands on local disk when Cloudinary is configured  
- ✅ Historical placeholder refs remapped without broken images  
- ✅ New uploads persist to Cloudinary with public IDs + secure URLs  
- ✅ Migration is safe, resumable, and idempotent  
- ✅ Admin, mobile, and web share one Cloudinary-backed upload path  
