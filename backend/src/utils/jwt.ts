import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../constants/roles.js';
import { AppError } from './AppError.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  typ: 'access';
  /** refreshTokenVersion — force-logout / password-change invalidation */
  rv: number;
}

export interface RefreshTokenPayload {
  sub: string;
  role: Role;
  typ: 'refresh';
  rv: number;
  familyId: string;
  jti: string;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'typ'>,
  expiresIn?: string,
): string {
  return jwt.sign({ ...payload, typ: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: (expiresIn ?? env.JWT_REFRESH_EXPIRES_IN) as jwt.SignOptions['expiresIn'],
  });
}

const VERIFY_OPTS: jwt.VerifyOptions = { algorithms: ['HS256'] };

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, VERIFY_OPTS) as AccessTokenPayload;
    if (decoded.typ !== 'access') throw AppError.unauthorized('Invalid access token');
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, VERIFY_OPTS) as RefreshTokenPayload;
    if (decoded.typ !== 'refresh') throw AppError.unauthorized('Invalid refresh token');
    if (!decoded.familyId || !decoded.jti) throw AppError.unauthorized('Invalid refresh token');
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
}

export function decodeRefreshExp(token: string): Date {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(decoded.exp * 1000);
}
