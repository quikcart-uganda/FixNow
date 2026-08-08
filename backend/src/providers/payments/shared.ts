import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { NormalizedWebhookEvent, PaymentProvider, PaymentProviderId } from './types.js';

export function maskSecret(value: string | undefined, keep = 4): string {
  if (!value) return '(unset)';
  if (value.length <= keep * 2) return '***';
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function verifyHmacSha256(
  secret: string | undefined,
  rawBody: string | undefined,
  signature: string | undefined,
): boolean {
  if (!secret || !rawBody || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const cleaned = signature.replace(/^sha256=/i, '').trim();
  const b = Buffer.from(cleaned);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseJsonBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

export async function providerFetch(
  url: string,
  init: RequestInit & { provider: PaymentProviderId },
): Promise<Response> {
  const started = Date.now();
  const { provider, ...rest } = init;
  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(rest.headers || {}),
      },
    });
    logger.info(`[payments:${provider}] ${rest.method || 'GET'} ${url} → ${res.status} (${Date.now() - started}ms)`);
    return res;
  } catch (err) {
    logger.error(`[payments:${provider}] request failed`, {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function webhookSecretFor(_provider: PaymentProviderId, specific?: string): string | undefined {
  return specific || env.PAYMENT_WEBHOOK_SECRET;
}

export function mapGenericWebhook(body: unknown): NormalizedWebhookEvent {
  const raw = parseJsonBody(body);
  const eventRaw = String(raw.event ?? raw.type ?? raw.status ?? 'unknown').toLowerCase();
  const map: Record<string, NormalizedWebhookEvent['event']> = {
    'charge.successful': 'charge.successful',
    'payment.successful': 'charge.successful',
    successful: 'charge.successful',
    success: 'charge.successful',
    completed: 'charge.successful',
    'charge.failed': 'charge.failed',
    'payment.failed': 'charge.failed',
    failed: 'charge.failed',
    'refund.successful': 'refund.successful',
    'payout.successful': 'payout.successful',
    'payout.completed': 'payout.successful',
  };
  return {
    event: map[eventRaw] ?? 'unknown',
    reference:
      typeof raw.reference === 'string'
        ? raw.reference
        : typeof raw.tx_ref === 'string'
          ? raw.tx_ref
          : typeof raw.externalId === 'string'
            ? raw.externalId
            : undefined,
    providerRef:
      typeof raw.providerRef === 'string'
        ? raw.providerRef
        : typeof raw.id === 'string'
          ? raw.id
          : typeof raw.transaction_id === 'string'
            ? raw.transaction_id
            : undefined,
    amount: typeof raw.amount === 'number' ? raw.amount : undefined,
    raw,
  };
}

/** Provider that fails closed with a clear error when live credentials are missing. */
export function createMisconfiguredProvider(id: PaymentProviderId, reason: string): PaymentProvider {
  const fail = async (): Promise<never> => {
    throw new Error(`${id} payment provider is misconfigured: ${reason}`);
  };
  return {
    id,
    charge: fail,
    refund: fail,
    payout: fail,
    verifyWebhook: () => false,
    parseWebhook: mapGenericWebhook,
  };
}
