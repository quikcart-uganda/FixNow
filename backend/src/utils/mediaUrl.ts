/**
 * Normalize stored media references for API responses.
 * Local uploads are stored as `/uploads/<file>?exp=&sig=` (7-day signed).
 * Re-sign on read so profile photos stay loadable in <img> tags (no Bearer header).
 */

import path from 'node:path';
import { buildSignedUploadPath } from '../security/downloadTokens.js';

const UPLOAD_FILE =
  /(?:^|\/)uploads\/([a-f0-9-]{36}(?:\.[a-z0-9]+)?)/i;

/**
 * Returns a browser-loadable URL for a stored media reference.
 * - Absolute http(s)/data URLs pass through (Cloudinary, Google, Dicebear).
 * - Local `/uploads/<uuid>.ext` paths are re-signed for anonymous <img> loads.
 * - Empty / marketing placeholders / non-upload relative paths → undefined
 *   (clients must render branded fallbacks — never broken browser icons).
 */
export function publicMediaUrl(raw?: string | null): string | undefined {
  const value = String(raw || '').trim();
  if (!value) return undefined;

  // Seeded marketing banners must never be treated as profile photos.
  if (/uploads\/placeholders\//i.test(value)) return undefined;
  if (/^(asset:)?(promotions|campaigns|advertisements|marketing)\b/i.test(value)) {
    return undefined;
  }

  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
    try {
      // Reject obviously dangerous / traversal-like URL payloads.
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
      if (parsed.pathname.includes('..')) return undefined;
      return value;
    } catch {
      return undefined;
    }
  }

  const match = value.match(UPLOAD_FILE);
  if (match?.[1]) {
    const filename = path.basename(match[1]);
    if (filename.includes('..')) return undefined;
    return buildSignedUploadPath(filename);
  }

  // Non-upload relative paths are not browser-safe for <img> across hosts.
  return undefined;
}
