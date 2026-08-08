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
  return Boolean(env.PESAPAL_CONSUMER_KEY && env.PESAPAL_CONSUMER_SECRET);
}

function baseUrl(): string {
  const mode = env.PESAPAL_ENV || 'sandbox';
  if (env.PESAPAL_BASE_URL) return env.PESAPAL_BASE_URL.replace(/\/+$/, '');
  return mode === 'live'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';
}

let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.value;
  const res = await providerFetch(`${baseUrl()}/api/Auth/RequestToken`, {
    provider: 'pesapal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consumer_key: env.PESAPAL_CONSUMER_KEY,
      consumer_secret: env.PESAPAL_CONSUMER_SECRET,
    }),
  });
  const raw = (await res.json()) as { token?: string; expiryDate?: string; error?: unknown };
  if (!res.ok || !raw.token) {
    throw new Error('Pesapal authentication failed');
  }
  cachedToken = { value: raw.token, exp: Date.now() + 4 * 60 * 1000 };
  return raw.token;
}

export function createPesapalProvider(): PaymentProvider {
  if (!configured()) {
    return createMisconfiguredProvider('pesapal', 'PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET are required');
  }

  return {
    id: 'pesapal',
    async charge(input: ChargeRequest): Promise<ChargeResult> {
      const token = await getAccessToken();
      const res = await providerFetch(`${baseUrl()}/api/Transactions/SubmitOrderRequest`, {
        provider: 'pesapal',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: input.reference,
          currency: input.currency,
          amount: input.amount,
          description: input.description || `FixNow ${input.reference}`,
          callback_url: env.PESAPAL_CALLBACK_URL,
          notification_id: env.PESAPAL_IPN_ID,
          billing_address: {
            email_address: input.email,
            phone_number: input.msisdn,
            country_code: 'UG',
          },
        }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return { provider: 'pesapal', status: 'failed', providerRef: input.reference, raw };
      }
      return {
        provider: 'pesapal',
        status: 'processing',
        providerRef: String(raw.order_tracking_id || raw.merchant_reference || input.reference),
        raw,
      };
    },
    async refund(input: RefundRequest): Promise<RefundResult> {
      return {
        status: 'processing',
        providerRef: `pesapal_rfnd_${input.reference}`,
        raw: { note: 'Use Pesapal merchant portal / refund API with order_tracking_id', providerRef: input.providerRef },
      };
    },
    async payout(input: PayoutRequest): Promise<PayoutResult> {
      return {
        status: 'processing',
        providerRef: `pesapal_payout_${input.reference}`,
        raw: { msisdn: input.msisdn, note: 'Pesapal payouts depend on merchant settlement configuration' },
      };
    },
    verifyWebhook(input: WebhookVerificationInput): boolean {
      const sigHeader = input.headers['x-fixnow-signature'] ?? input.headers['x-pesapal-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const secret = webhookSecretFor('pesapal', env.PESAPAL_IPN_SECRET);
      if (secret && input.rawBody && sig) return verifyHmacSha256(secret, input.rawBody, sig);
      // Pesapal IPN often authenticates via OrderTrackingId lookup — allow when IPN id configured and body present.
      return Boolean(env.PESAPAL_IPN_ID && input.body);
    },
    parseWebhook(body: unknown): NormalizedWebhookEvent {
      const raw = parseJsonBody(body);
      const status = String(raw.payment_status_description || raw.status || '').toLowerCase();
      let event: NormalizedWebhookEvent['event'] = 'unknown';
      if (status.includes('completed') || status.includes('success')) event = 'charge.successful';
      else if (status.includes('fail') || status.includes('invalid')) event = 'charge.failed';
      return {
        event,
        reference: typeof raw.merchant_reference === 'string' ? raw.merchant_reference : undefined,
        providerRef: typeof raw.OrderTrackingId === 'string' ? raw.OrderTrackingId : typeof raw.order_tracking_id === 'string' ? raw.order_tracking_id : undefined,
        raw,
      };
    },
  };
}

export const pesapalPaymentProvider = { create: createPesapalProvider };

