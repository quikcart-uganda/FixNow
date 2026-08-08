/**
 * Sensitive-field masking for logs, audit meta, and API error details.
 * No env / secrets required — pure in-process redaction.
 */

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|password|passwordhash|passwd|pwd|token|refreshtoken|accesstoken|idtoken|otp|code|secret|apikey|api_key|privatekey|private_key|clientsecret|client_secret|webhooksecret|pin|cvv|cvc|cardnumber|card_number|accountnumber|account_number|nationalid|ssn|nin|bvn|sessionid|session_id)$/i;

const EMAIL_RE = /([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})/gi;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function maskEmail(value: string): string {
  return String(value).replace(EMAIL_RE, (_m, user: string, domain: string) => {
    const keep = user.slice(0, Math.min(2, user.length));
    return `${keep}***@${domain}`;
  });
}

export function maskPhone(value: string): string {
  return String(value).replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 6) return '***';
    return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
  });
}

export function maskString(value: string): string {
  return maskPhone(maskEmail(value));
}

/** Deep-clone with sensitive keys replaced and PII patterns masked in strings. */
export function maskSensitive<T = unknown>(value: T, depth = 0): T {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') return maskString(value) as T;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1)) as T;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = maskSensitive(v, depth + 1);
    }
  }
  return out as T;
}

/** Sanitize user-facing error messages — strip absolute paths and stack fragments. */
export function sanitizeErrorMessage(message: string, isProduction: boolean): string {
  let msg = String(message || 'Unexpected error');
  if (isProduction) {
    msg = msg
      .replace(/[A-Za-z]:\\[^\s]+/g, '[path]')
      .replace(/\/(?:home|Users|var|tmp|app)\/[^\s]+/g, '[path]')
      .replace(/\s+at\s+\S+.*/g, '');
  }
  return msg.slice(0, 500);
}
