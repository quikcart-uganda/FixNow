import type { NextFunction, Request, Response } from 'express';
import { isAllowedRequestOrigin } from '../config/cors.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function extractOrigin(req: Request): string | null {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * No-op unless AUTH_COOKIE_ENABLED. Exempts payment webhooks (HMAC-authenticated).
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!env.AUTH_COOKIE_ENABLED) {
    next();
    return;
  }
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (req.originalUrl.includes('/webhooks/')) {
    next();
    return;
  }

  const origin = extractOrigin(req);
  const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
  if (!origin) {
    if (hasBearer) {
      next();
      return;
    }
    next(AppError.forbidden('CSRF validation failed: missing Origin'));
    return;
  }
  if (!isAllowedRequestOrigin(origin)) {
    next(AppError.forbidden('CSRF validation failed: origin not allowed'));
    return;
  }
  next();
}
