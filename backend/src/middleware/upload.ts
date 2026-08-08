import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { assertFileMagic } from '../security/fileMagic.js';
import { AppError } from '../utils/AppError.js';

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadRoot);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
    const id = crypto.randomUUID();
    cb(null, ext ? `${id}${ext}` : id);
  },
});

const allowedMime = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/opus',
  'audio/wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
]);

export const upload = multer({
  storage,
  limits: {
    fileSize: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!allowedMime.has(file.mimetype)) {
      cb(AppError.badRequest(`Unsupported file type: ${file.mimetype}`));
      return;
    }
    // Normalize originalname — strip path segments from client.
    file.originalname = path.basename(file.originalname).slice(0, 200);
    cb(null, true);
  },
});

/**
 * Post-multer magic-byte verification. Deletes the file and fails the request
 * when the claimed MIME does not match the file signature.
 */
export function validateUploadedFileMagic(req: Request, _res: Response, next: NextFunction): void {
  const file = req.file;
  if (!file) {
    next();
    return;
  }
  const result = assertFileMagic(file.path, file.mimetype);
  if (!result.ok) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
    next(AppError.badRequest(`File validation failed: ${result.reason}`));
    return;
  }
  next();
}

export { uploadRoot };
