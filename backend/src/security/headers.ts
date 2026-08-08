/**
 * Security headers abstraction (Helmet + clickjacking + CSP readiness).
 * Works with zero extra env configuration.
 */

import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';

/** Content-Security-Policy for the API surface (no HTML execution expected). */
export function apiCspDirectives(): Record<string, string[]> {
  return {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
    objectSrc: ["'none'"],
  };
}

/**
 * Helmet middleware with:
 * - Clickjacking: frameguard DENY + CSP frame-ancestors 'none'
 * - nosniff / referrer-policy via Helmet
 * - CSP enforced in production; report-only in non-production (readiness without breakage)
 */
export function securityHeadersMiddleware(): RequestHandler {
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: apiCspDirectives(),
      reportOnly: !env.isProduction,
    },
  });
}

/** Extra headers for file downloads (defense in depth). */
export function setDownloadSecurityHeaders(
  res: { setHeader: (k: string, v: string) => void },
  opts: { mimeType?: string; filename?: string; forceAttachment?: boolean } = {},
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', env.isProduction ? 'private, max-age=604800' : 'no-store');

  const mime = opts.mimeType || '';
  const isPdf = /\.pdf$/i.test(opts.filename || '') || mime === 'application/pdf';
  const isVideo = mime.startsWith('video/');
  if (opts.forceAttachment || isPdf || isVideo) {
    const safeName = (opts.filename || 'download').replace(/[^\w.\-]+/g, '_').slice(0, 180);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  }
}
