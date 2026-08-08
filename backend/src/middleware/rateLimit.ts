import { createHash } from 'node:crypto';
import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

function bearerFingerprint(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length).trim();
  if (token.length < 16) return null;
  // Fingerprint the token so authenticated SPAs do not share one NAT IP bucket.
  return createHash('sha256').update(token).digest('hex').slice(0, 32);
}

function apiKeyGenerator(req: Request): string {
  const fingerprint = bearerFingerprint(req);
  if (fingerprint) return `auth:${fingerprint}`;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function apiMax(req: Request): number {
  // Authenticated Admin/Customer/Technician SPAs are chatty (parallel mounts,
  // badge polls, realtime reloads). Anonymous traffic stays stricter.
  if (bearerFingerprint(req)) return env.RATE_LIMIT_MAX_AUTHENTICATED;
  return env.RATE_LIMIT_MAX;
}

const rateLimitedBody = {
  success: false as const,
  message: 'Too many requests. Please try again later.',
  data: null,
  error: {
    code: ERROR_CODES.RATE_LIMITED,
    message: 'Too many requests. Please try again later.',
  },
};

function rateLimitHandler(
  req: Request,
  res: Response,
  _next: unknown,
  optionsUsed: Options,
): void {
  const requestId =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id']) ||
    (req as Request & { requestId?: string }).requestId;
  logger.warn(
    {
      event: 'rate_limit_exceeded',
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      authenticated: Boolean(bearerFingerprint(req)),
      limit: optionsUsed.limit,
      windowMs: optionsUsed.windowMs,
    },
    'API rate limit exceeded',
  );
  res.status(optionsUsed.statusCode).json({
    ...rateLimitedBody,
    error: {
      ...rateLimitedBody.error,
      requestId,
    },
  });
}

/**
 * Global API limiter. Authenticated clients get a higher budget and their own
 * key so a busy Admin SPA (or shared office NAT) does not lock out everyone.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: apiMax,
  keyGenerator: apiKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedBody,
  handler: rateLimitHandler,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    data: null,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});

/** Stricter limiter for login / OTP to slow brute-force. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again later.',
    data: null,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many login attempts. Please try again later.',
    },
  },
});

/** Stricter limiter for AI chat to protect provider spend. */
export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AI_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many AI requests. Please try again later.',
    data: null,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many AI requests. Please try again later.',
    },
  },
});
