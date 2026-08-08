import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

export type VerifiedGoogleIdentity = {
  googleId: string;
  email: string;
  fullName: string;
  picture?: string;
  emailVerified: boolean;
};

type TokenInfoPayload = {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string;
  error?: string;
  error_description?: string;
};

type HandoffRecord = {
  credential: string;
  role: 'customer' | 'technician';
  expiresAt: number;
};

const HANDOFF_TTL_MS = 2 * 60 * 1000;
const handoffStore = new Map<string, HandoffRecord>();

function pruneHandoffs() {
  const now = Date.now();
  for (const [code, record] of handoffStore) {
    if (record.expiresAt <= now) handoffStore.delete(code);
  }
}

export function getGoogleAuthPublicConfig() {
  const enabled = env.GOOGLE_AUTH_ENABLED;
  const clientId = (env.PUBLIC_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim();
  const ready = enabled && Boolean(clientId);
  return {
    enabled,
    ready,
    clientId: ready ? clientId : null,
    provider: 'google' as const,
  };
}

export function assertGoogleAuthReady() {
  const cfg = getGoogleAuthPublicConfig();
  if (!cfg.enabled) {
    throw AppError.serviceUnavailable(
      'Google Sign-In is currently unavailable. Please sign in using your email and password.',
    );
  }
  if (!cfg.ready || !cfg.clientId) {
    throw AppError.serviceUnavailable(
      'Google Sign-In is currently unavailable. Please sign in using your email and password.',
    );
  }
  return cfg;
}

export async function verifyGoogleIdToken(credential: string): Promise<VerifiedGoogleIdentity> {
  const cfg = assertGoogleAuthReady();
  const token = credential.trim();
  if (!token || token.length < 20) {
    throw AppError.unauthorized('Invalid Google credential');
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;
  let payload: TokenInfoPayload;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    payload = (await response.json()) as TokenInfoPayload;
    if (!response.ok) {
      throw AppError.unauthorized(payload.error_description || payload.error || 'Invalid Google credential');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.dependencyFailed('Unable to verify Google credential');
  }

  const issuer = String(payload.iss || '');
  if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
    throw AppError.unauthorized('Invalid Google token issuer');
  }
  if (String(payload.aud || '') !== cfg.clientId) {
    throw AppError.unauthorized('Invalid Google token audience');
  }

  const expSec = Number(payload.exp || 0);
  if (!Number.isFinite(expSec) || expSec * 1000 <= Date.now()) {
    throw AppError.unauthorized('Google credential has expired');
  }

  const emailVerified =
    payload.email_verified === true || String(payload.email_verified).toLowerCase() === 'true';
  if (!emailVerified) {
    throw AppError.unauthorized('Google email is not verified');
  }

  const email = String(payload.email || '')
    .toLowerCase()
    .trim();
  const googleId = String(payload.sub || '').trim();
  if (!email || !googleId) {
    throw AppError.unauthorized('Google credential is missing identity claims');
  }

  const fullName =
    String(payload.name || '')
      .trim()
      .slice(0, 120) || email.split('@')[0] || 'FixNow User';

  return {
    googleId,
    email,
    fullName,
    picture: payload.picture ? String(payload.picture).slice(0, 1024) : undefined,
    emailVerified: true,
  };
}

/**
 * Issue a short-lived one-time handoff code after verifying the ID token.
 * Used by the Capacitor system-browser bridge so the WebView never hosts GIS.
 */
export async function issueNativeHandoffCode(input: {
  credential: string;
  role: 'customer' | 'technician';
}) {
  await verifyGoogleIdToken(input.credential);
  pruneHandoffs();
  const code = crypto.randomBytes(24).toString('hex');
  handoffStore.set(code, {
    credential: input.credential.trim(),
    role: input.role,
    expiresAt: Date.now() + HANDOFF_TTL_MS,
  });
  return { code, expiresInSec: Math.floor(HANDOFF_TTL_MS / 1000) };
}

export function consumeNativeHandoffCode(code: string) {
  pruneHandoffs();
  const record = handoffStore.get(code);
  if (!record) {
    throw AppError.unauthorized('Google handoff code is invalid or expired');
  }
  handoffStore.delete(code);
  if (record.expiresAt <= Date.now()) {
    throw AppError.unauthorized('Google handoff code is invalid or expired');
  }
  return { credential: record.credential, role: record.role };
}
