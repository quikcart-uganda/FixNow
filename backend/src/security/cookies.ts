/**
 * Secure cookie abstraction for optional httpOnly refresh cookies.
 * Callers gate on AUTH_COOKIE_ENABLED; this module only builds safe options.
 */

import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'fixnow_refresh';

export type SecureCookieFlags = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  expires?: Date;
  maxAge?: number;
};

/** Baseline flags for auth cookies (httpOnly + SameSite=Lax; Secure in production). */
export function secureCookieFlags(overrides: Partial<SecureCookieFlags> = {}): SecureCookieFlags {
  return {
    httpOnly: true,
    secure: Boolean(env.COOKIE_SECURE || env.isProduction),
    sameSite: 'lax',
    path: `${env.API_PREFIX}/auth`,
    ...overrides,
  };
}

export function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return secureCookieFlags({ expires: expiresAt });
}

export function setSecureCookie(
  res: Response,
  name: string,
  value: string,
  options: CookieOptions,
): void {
  res.cookie(name, value, options);
}

export function clearSecureCookie(res: Response, name: string, path?: string): void {
  const flags = secureCookieFlags(path ? { path } : {});
  res.clearCookie(name, {
    httpOnly: flags.httpOnly,
    secure: flags.secure,
    sameSite: flags.sameSite,
    path: flags.path,
  });
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  if (!env.AUTH_COOKIE_ENABLED) return;
  setSecureCookie(res, REFRESH_COOKIE_NAME, token, refreshCookieOptions(expiresAt));
}

export function clearRefreshCookie(res: Response): void {
  if (!env.AUTH_COOKIE_ENABLED) return;
  clearSecureCookie(res, REFRESH_COOKIE_NAME);
}

export function readRefreshCookie(req: { cookies?: Record<string, unknown> }): string | undefined {
  const value = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
