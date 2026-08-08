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
  return Boolean(env.AIRTEL_MONEY_CLIENT_ID && env.AIRTEL_MONEY_CLIENT_SECRET);
}

function baseUrl(): string {
  if (env.AIRTEL_MONEY_BASE_URL) return env.AIRTEL_MONEY_BASE_URL.replace(/\/+$/, '');
  const mode = env.AIRTEL_MONEY_ENV || 'sandbox';
  return mode === 'production'
    ? 'https://openapi.airtel.africa'
    : 'https://openapiuat.airtel.africa';
}

let cachedToken: { value: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.value;
  const res = await providerFetch(`${baseUrl()}/auth/oauth2/token`, {
    provider: 'airtel',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({
      client_id: env.AIRTEL_MONEY_CLIENT_ID,
      client_secret: env.AIRTEL_MONEY_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const raw = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !raw.access_token) throw new Error('Airtel Money token request failed');
  cachedToken = {
    value: raw.access_token,
    exp: Date.now() + (Number(raw.expires_in || 3600) - 60) * 1000,
  };
  return raw.access_token;
}

export function createAirtelProvider(): PaymentProvider {
  if (!configured()) {
    return createMisconfiguredProvider(
      'airtel',
      'AIRTEL_MONEY_CLIENT_ID and AIRTEL_MONEY_CLIENT_SECRET are required',
    );
  }

  const country = env.AIRTEL_MONEY_COUNTRY || 'UG';
  const currency = env.AIRTEL_MONEY_CURRENCY || 'UGX';

  return {
    id: 'airtel',
    async charge(input: ChargeRequest): Promise<ChargeResult> {
      if (!input.msisdn) {
        return { provider: 'airtel', status: 'failed', providerRef: input.reference, raw: { error: 'msisdn required' } };
      }
      const token = await getToken();
      const res = await providerFetch(`${baseUrl()}/merchant/v1/payments/`, {
        provider: 'airtel',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Country': country,
          'X-Currency': currency,
          ...(env.AIRTEL_MONEY_API_KEY ? { 'X-API-Key': env.AIRTEL_MONEY_API_KEY } : {}),
        },
        body: JSON.stringify({
          reference: input.reference,
          subscriber: {
            country,
            currency,
            msisdn: input.msisdn.replace(/\D/g, ''),
          },
          transaction: {
            amount: input.amount,
            country,
            currency,
            id: input.reference,
          },
        }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      const status = String(
        (raw.data as { transaction?: { status?: string } } | undefined)?.transaction?.status ||
          (raw.status as { response_code?: string } | undefined)?.response_code ||
          '',
      ).toLowerCase();
      if (!res.ok || status.includes('fail')) {
        return { provider: 'airtel', status: 'failed', providerRef: input.reference, raw };
      }
      if (status.includes('success') || status === 'ts') {
        return { provider: 'airtel', status: 'successful', providerRef: input.reference, raw };
      }
      return { provider: 'airtel', status: 'processing', providerRef: input.reference, raw };
    },
    async refund(input: RefundRequest): Promise<RefundResult> {
      return {
        status: 'processing',
        providerRef: `airtel_rfnd_${input.reference}`,
        raw: { providerRef: input.providerRef, note: 'Airtel refund APIs vary by market — correlate via reference' },
      };
    },
    async payout(input: PayoutRequest): Promise<PayoutResult> {
      const token = await getToken();
      const res = await providerFetch(`${baseUrl()}/standard/v1/disbursements/`, {
        provider: 'airtel',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Country': country,
          'X-Currency': currency,
          ...(env.AIRTEL_MONEY_API_KEY ? { 'X-API-Key': env.AIRTEL_MONEY_API_KEY } : {}),
        },
        body: JSON.stringify({
          payee: { msisdn: input.msisdn.replace(/\D/g, ''), currency, country },
          reference: input.reference,
          pin: env.AIRTEL_MONEY_DISBURSEMENT_PIN,
          transaction: { amount: input.amount, id: input.reference, type: 'B2C' },
        }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return { status: 'failed', providerRef: input.reference, raw };
      return { status: 'processing', providerRef: input.reference, raw };
    },
    verifyWebhook(input: WebhookVerificationInput): boolean {
      const sigHeader = input.headers['x-fixnow-signature'] ?? input.headers['x-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const secret = webhookSecretFor('airtel', env.AIRTEL_MONEY_WEBHOOK_SECRET);
      if (secret && input.rawBody && sig) return verifyHmacSha256(secret, input.rawBody, sig);
      return Boolean(input.body && env.AIRTEL_MONEY_CLIENT_ID);
    },
    parseWebhook(body: unknown): NormalizedWebhookEvent {
      const raw = parseJsonBody(body);
      const txn = (raw.transaction && typeof raw.transaction === 'object'
        ? raw.transaction
        : raw) as Record<string, unknown>;
      const status = String(txn.status || raw.status || '').toLowerCase();
      let event: NormalizedWebhookEvent['event'] = 'unknown';
      if (status.includes('success') || status === 'ts') event = 'charge.successful';
      else if (status.includes('fail')) event = 'charge.failed';
      return {
        event,
        reference: typeof txn.id === 'string' ? txn.id : typeof raw.reference === 'string' ? raw.reference : undefined,
        providerRef: typeof txn.airtel_money_id === 'string' ? txn.airtel_money_id : undefined,
        amount: typeof txn.amount === 'number' ? txn.amount : undefined,
        raw,
      };
    },
  };
}

export const airtelPaymentProvider = { create: createAirtelProvider };

