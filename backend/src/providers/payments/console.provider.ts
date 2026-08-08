import { createHmac, timingSafeEqual } from 'crypto';
import type {
  ChargeRequest,
  ChargeResult,
  NormalizedWebhookEvent,
  PaymentProvider,
  PaymentProviderId,
  PayoutRequest,
  PayoutResult,
  RefundRequest,
  RefundResult,
  WebhookVerificationInput,
} from './types.js';

function verifyHmac(secret: string | undefined, rawBody: string | undefined, signature: string | undefined): boolean {
  // Fail closed — unsigned / secretless webhooks must never be accepted.
  if (!secret || !rawBody || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.replace(/^sha256=/, ''));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

export function createSimulatedProvider(id: PaymentProviderId, autoSucceed = true): PaymentProvider {
  return {
    id,
    async charge(input: ChargeRequest): Promise<ChargeResult> {
      return {
        provider: id,
        status: autoSucceed ? 'successful' : 'processing',
        providerRef: `${id}_${input.reference}`,
        raw: { simulated: true, autoSucceed },
      };
    },
    async refund(input: RefundRequest): Promise<RefundResult> {
      return {
        status: autoSucceed ? 'successful' : 'processing',
        providerRef: `rfnd_${input.reference}`,
        raw: { simulated: true },
      };
    },
    async payout(input: PayoutRequest): Promise<PayoutResult> {
      return {
        status: autoSucceed ? 'successful' : 'processing',
        providerRef: `payout_${input.reference}`,
        raw: { simulated: true, msisdn: input.msisdn },
      };
    },
    verifyWebhook(input: WebhookVerificationInput): boolean {
      const sigHeader = input.headers['x-fixnow-signature'] ?? input.headers['x-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      return verifyHmac(input.secret, input.rawBody, sig);
    },
    parseWebhook(body: unknown): NormalizedWebhookEvent {
      const raw = parseBody(body);
      const eventRaw = String(raw.event ?? raw.type ?? 'unknown');
      const map: Record<string, NormalizedWebhookEvent['event']> = {
        'charge.successful': 'charge.successful',
        'payment.successful': 'charge.successful',
        'charge.failed': 'charge.failed',
        'payment.failed': 'charge.failed',
        'refund.successful': 'refund.successful',
        'payout.successful': 'payout.successful',
        'payout.completed': 'payout.successful',
      };
      return {
        event: map[eventRaw] ?? 'unknown',
        reference: typeof raw.reference === 'string' ? raw.reference : undefined,
        providerRef: typeof raw.providerRef === 'string' ? raw.providerRef : undefined,
        amount: typeof raw.amount === 'number' ? raw.amount : undefined,
        raw,
      };
    },
  };
}

export const consolePaymentProvider = createSimulatedProvider('console', true);
