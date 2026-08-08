/**
 * Upload helpers. Multer + magic-byte validation: `middleware/upload.ts`.
 * Persistence: `providers/storage` (Cloudinary official default, local disk emergency fallback).
 * Access control + signed downloads: `security/uploads.ts` + `security/downloadTokens.ts`.
 * Disk root (staging only): `UPLOAD_DIR` (default `./uploads`) — Multer temp; Cloudinary unlinks after persist.
 */
export const UPLOAD_FIELD_NAME = 'file';
