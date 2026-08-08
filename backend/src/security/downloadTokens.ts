/**
 * HMAC-signed download tokens for /uploads — uses existing JWT_ACCESS_SECRET.
 * No new env vars. Tokens are query params: ?exp=&sig=
 */

import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { timingSafeEqualStr } from '../utils/crypto.js';

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function hmac(payload: string): string {
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(payload).digest('hex');
}

export function signDownloadToken(
  filename: string,
  ttlSec = DEFAULT_TTL_SEC,
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = hmac(`${filename}:${exp}`);
  return { exp, sig };
}

export function buildSignedUploadPath(filename: string, ttlSec = DEFAULT_TTL_SEC): string {
  const { exp, sig } = signDownloadToken(filename, ttlSec);
  return `/uploads/${encodeURIComponent(filename)}?exp=${exp}&sig=${sig}`;
}

export function verifyDownloadToken(filename: string, expRaw: unknown, sigRaw: unknown): boolean {
  const exp = Number(expRaw);
  const sig = typeof sigRaw === 'string' ? sigRaw : '';
  if (!Number.isFinite(exp) || !sig || sig.length < 32) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const expected = hmac(`${filename}:${exp}`);
  return timingSafeEqualStr(expected, sig);
}
