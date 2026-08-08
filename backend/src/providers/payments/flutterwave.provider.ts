import { env } from '../../config/env.js';
import {
  createMisconfiguredProvider,
  parseJsonBody,
  providerFetch,
  verifyHmacSha256,
  webhookSecretFor,
} from './shared.js';
import type {
  ChargeRequest,
  ChargeResult,
  NormalizedWebhookEvent,
  PaymentProvider,
  PayoutRequest,
  PayoutResult,
  RefundRequest,
  RefundResult,
  WebhookVerificationInput,
} from './types.js';

function configured(): boolean {
  return Boolean(env.FLUTTERWAVE_SECRET_KEY);
}

function baseUrl(): string {
  return env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3';
}

export function createFlutterwaveProvider(): PaymentProvider {
  if (!configured()) {
    return createMisconfiguredProvider('flutterwave', 'FLUTTERWAVE_SECRET_KEY is required');
  }
  const secret = env.FLUTTERWAVE_SECRET_KEY!;
  const mode = env.FLUTTERWAVE_MODE || 'sandbox';

  return {
    id: 'flutterwave',
    async charge(input: ChargeRequest): Promise<ChargeResult> {
      const res = await providerFetch(`${baseUrl()}/charges?type=mobile_money_uganda`, {
        provider: 'flutterwave',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: input.reference,
          amount: input.amount,
          currency: input.currency,
          email: input.email,
          phone_number: input.msisdn,
          fullname: input.customerId,
          meta: input.metadata,
          redirect_url: env.FLUTTERWAVE_REDIRECT_URL,
        }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      const data = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
      const statusRaw = String(data.status || raw.status || '').toLowerCase();
      if (!res.ok || statusRaw === 'failed' || statusRaw === 'error') {
        return { provider: 'flutterwave', status: 'failed', providerRef: String(data.id || input.reference), raw: { ...raw, mode } };
      }
      if (statusRaw === 'successful' || statusRaw === 'success') {
        return { provider: 'flutterwave', status: 'successful', providerRef: String(data.id || input.reference), raw: { ...raw, mode } };
      }
      return {
        provider: 'flutterwave',
        status: 'processing',
        providerRef: String(data.id || data.flw_ref || input.reference),
        raw: { ...raw, mode },
      };
    },
    async refund(input: RefundRequest): Promise<RefundResult> {
      const res = await providerFetch(`${baseUrl()}/transactions/${encodeURIComponent(input.providerRef)}/refund`, {
        provider: 'flutterwave',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: input.amount }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return { status: 'failed', providerRef: input.providerRef, raw };
      return { status: 'processing', providerRef: String((raw.data as { id?: string } | undefined)?.id || input.providerRef), raw };
    },
    async payout(input: PayoutRequest): Promise<PayoutResult> {
      const res = await providerFetch(`${baseUrl()}/transfers`, {
        provider: 'flutterwave',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_bank: 'MPS',
          account_number: input.msisdn,
          amount: input.amount,
          currency: input.currency,
          narration: `FixNow payout ${input.reference}`,
          reference: input.reference,
          beneficiary_name: input.accountName,
        }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return { status: 'failed', providerRef: input.reference, raw };
      const data = (raw.data && typeof raw.data === 'object' ? raw.data : {}) as Record<string, unknown>;
      return { status: 'processing', providerRef: String(data.id || input.reference), raw };
    },
    verifyWebhook(input: WebhookVerificationInput): boolean {
      const hashHeader = input.headers['verif-hash'] ?? input.headers['x-fixnow-signature'];
      const hash = Array.isArray(hashHeader) ? hashHeader[0] : hashHeader;
      const secret = webhookSecretFor('flutterwave', env.FLUTTERWAVE_SECRET_HASH || env.FLUTTERWAVE_WEBHOOK_SECRET);
      if (!secret || !hash) return false;
      // Flutterwave compares verif-hash header to secret directly.
      if (hash === secret) return true;
      return verifyHmacSha256(secret, input.rawBody, hash);
    },
    parseWebhook(body: unknown): NormalizedWebhookEvent {
      const raw = parseJsonBody(body);
      const data = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
      const status = String(data.status || raw.event || '').toLowerCase();
      let event: NormalizedWebhookEvent['event'] = 'unknown';
      if (status.includes('success') || String(raw.event).includes('success')) event = 'charge.successful';
      else if (status.includes('fail')) event = 'charge.failed';
      return {
        event,
        reference: typeof data.tx_ref === 'string' ? data.tx_ref : undefined,
        providerRef: typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : undefined,
        amount: typeof data.amount === 'number' ? data.amount : undefined,
        raw,
      };
    },
  };
}

export const flutterwavePaymentProvider = { create: createFlutterwaveProvider };

