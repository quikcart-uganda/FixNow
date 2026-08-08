/**
 * Authenticated / signed download gate for /uploads.
 * Replaces public express.static open access.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { Upload } from '../models/index.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { verifyDownloadToken } from './downloadTokens.js';
import { setDownloadSecurityHeaders } from './headers.js';

const SAFE_NAME = /^[a-f0-9-]{36}(?:\.[a-z0-9]+)?$/i;

function uploadRoot(): string {
  return path.resolve(process.cwd(), env.UPLOAD_DIR);
}

function resolveSafeFile(filename: string): string | null {
  if (!SAFE_NAME.test(filename)) return null;
  const root = uploadRoot();
  const full = path.resolve(root, filename);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

async function actorMayAccess(req: Request, filename: string): Promise<boolean> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    if (payload.role === ROLES.ADMIN) return true;
    const doc = await Upload.findOne({ filename, isDeleted: { $ne: true } }).select('uploadedBy').lean();
    if (!doc) {
      // Legacy file without DB row: allow any authenticated user (not anonymous).
      return true;
    }
    return String(doc.uploadedBy) === payload.sub;
  } catch {
    return false;
  }
}

export async function secureUploadDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next(AppError.badRequest('Method not allowed'));
      return;
    }
    const raw = req.path.replace(/^\/+/, '');
    const filename = path.basename(decodeURIComponent(raw));

    const cloudDoc = await Upload.findOne({ filename, isDeleted: { $ne: true } })
      .select('uploadedBy url path publicId provider')
      .lean();
    const cloudUrl =
      cloudDoc?.url?.startsWith('http') &&
      (cloudDoc.path?.startsWith('cloudinary://') || cloudDoc.provider === 'cloudinary' || cloudDoc.publicId)
        ? cloudDoc.url
        : null;
    if (cloudUrl) {
      const signedOk = verifyDownloadToken(filename, req.query.exp, req.query.sig);
      const authOk = signedOk ? true : await actorMayAccess(req, filename);
      if (!authOk) {
        next(AppError.unauthorized('Valid download signature or authentication required'));
        return;
      }
      res.redirect(302, cloudUrl);
      return;
    }

    const full = resolveSafeFile(filename);
    if (!full) {
      next(AppError.notFound('File not found'));
      return;
    }

    const signedOk = verifyDownloadToken(filename, req.query.exp, req.query.sig);
    const authOk = signedOk ? true : await actorMayAccess(req, filename);
    if (!authOk) {
      next(AppError.unauthorized('Valid download signature or authentication required'));
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeGuess =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.pdf'
              ? 'application/pdf'
              : ext === '.mp4' || ext === '.m4a'
                ? 'video/mp4'
                : ext === '.webm'
                  ? 'audio/webm'
                  : ext === '.ogg' || ext === '.opus'
                    ? 'audio/ogg'
                    : ext === '.wav'
                      ? 'audio/wav'
                      : ext === '.mp3'
                        ? 'audio/mpeg'
                        : 'application/octet-stream';

    setDownloadSecurityHeaders(res, { mimeType: mimeGuess, filename, forceAttachment: mimeGuess === 'application/pdf' });
    res.type(mimeGuess);
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.sendFile(full);
  } catch (err) {
    next(err);
  }
}
