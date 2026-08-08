import { randomUUID } from 'node:crypto';
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
  return Boolean(env.MTN_MOMO_SUBSCRIPTION_KEY && env.MTN_MOMO_API_USER && env.MTN_MOMO_API_KEY);
}

function baseUrl(): string {
  if (env.MTN_MOMO_BASE_URL) return env.MTN_MOMO_BASE_URL.replace(/\/+$/, '');
  const target = env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox';
  return target === 'production'
    ? 'https://proxy.momoapi.mtn.com'
    : 'https://sandbox.momodeveloper.mtn.com';
}

let cachedToken: { value: string; exp: number } | null = null;

async function getCollectionToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.value;
  const basic = Buffer.from(`${env.MTN_MOMO_API_USER}:${env.MTN_MOMO_API_KEY}`).toString('base64');
  const res = await providerFetch(`${baseUrl()}/collection/token/`, {
    provider: 'mtn',
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': env.MTN_MOMO_SUBSCRIPTION_KEY!,
    },
  });
  const raw = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !raw.access_token) throw new Error('MTN MoMo token request failed');
  cachedToken = {
    value: raw.access_token,
    exp: Date.now() + (Number(raw.expires_in || 3600) - 60) * 1000,
  };
  return raw.access_token;
}

export function createMtnProvider(): PaymentProvider {
  if (!configured()) {
    return createMisconfiguredProvider(
      'mtn',
      'MTN_MOMO_SUBSCRIPTION_KEY, MTN_MOMO_API_USER, and MTN_MOMO_API_KEY are required',
    );
  }

  const target = env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox';
  const currency = env.MTN_MOMO_CURRENCY || 'UGX';

  return {
    id: 'mtn',
    async charge(input: ChargeRequest): Promise<ChargeResult> {
      if (!input.msisdn) {
        return { provider: 'mtn', status: 'failed', providerRef: input.reference, raw: { error: 'msisdn required' } };
      }
      const token = await getCollectionToken();
      const referenceId = randomUUID();
      const res = await providerFetch(`${baseUrl()}/collection/v1_0/requesttopay`, {
        provider: 'mtn',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': target,
          'Ocp-Apim-Subscription-Key': env.MTN_MOMO_SUBSCRIPTION_KEY!,
          'Content-Type': 'application/json',
          ...(env.MTN_MOMO_CALLBACK_HOST ? { 'X-Callback-Url': env.MTN_MOMO_CALLBACK_HOST } : {}),
        },
        body: JSON.stringify({
          amount: String(input.amount),
          currency: input.currency || currency,
          externalId: input.reference,
          payer: { partyIdType: 'MSISDN', partyId: input.msisdn.replace(/\D/g, '') },
          payerMessage: input.description || 'FixNow payment',
          payeeNote: input.reference,
        }),
      });
      if (res.status === 202) {
        return { provider: 'mtn', status: 'processing', providerRef: referenceId, raw: { target, referenceId } };
      }
      const raw = parseJsonBody(await res.json().catch(() => ({})));
      return { provider: 'mtn', status: 'failed', providerRef: referenceId, raw };
    },
    async refund(input: RefundRequest): Promise<RefundResult> {
      return {
        status: 'processing',
        providerRef: `mtn_rfnd_${input.reference}`,
        raw: { note: 'Use MoMo refund product when enabled on subscription', providerRef: input.providerRef },
      };
    },
    async payout(input: PayoutRequest): Promise<PayoutResult> {
      const token = await getCollectionToken();
      const referenceId = randomUUID();
      // Disbursement uses a separate product; attempt disbursement path when subscription supports it.
      const res = await providerFetch(`${baseUrl()}/disbursement/v1_0/transfer`, {
        provider: 'mtn',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': target,
          'Ocp-Apim-Subscription-Key': env.MTN_MOMO_SUBSCRIPTION_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: String(input.amount),
          currency: input.currency || currency,
          externalId: input.reference,
          payee: { partyIdType: 'MSISDN', partyId: input.msisdn.replace(/\D/g, '') },
          payerMessage: 'FixNow payout',
          payeeNote: input.accountName || input.reference,
        }),
      });
      if (res.status === 202) {
        return { status: 'processing', providerRef: referenceId, raw: { target } };
      }
      const raw = parseJsonBody(await res.json().catch(() => ({})));
      return { status: 'failed', providerRef: referenceId, raw };
    },
    verifyWebhook(input: WebhookVerificationInput): boolean {
      const sigHeader = input.headers['x-fixnow-signature'] ?? input.headers['x-callback-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const secret = webhookSecretFor('mtn', env.MTN_MOMO_WEBHOOK_SECRET);
      if (secret && input.rawBody && sig) return verifyHmacSha256(secret, input.rawBody, sig);
      return Boolean(input.body && env.MTN_MOMO_SUBSCRIPTION_KEY);
    },
    parseWebhook(body: unknown): NormalizedWebhookEvent {
      const raw = parseJsonBody(body);
      const status = String(raw.status || '').toLowerCase();
      let event: NormalizedWebhookEvent['event'] = 'unknown';
      if (status === 'successful') event = 'charge.successful';
      else if (status === 'failed' || status === 'rejected') event = 'charge.failed';
      return {
        event,
        reference: typeof raw.externalId === 'string' ? raw.externalId : undefined,
        providerRef: typeof raw.financialTransactionId === 'string' ? raw.financialTransactionId : undefined,
        amount: typeof raw.amount === 'string' ? Number(raw.amount) : typeof raw.amount === 'number' ? raw.amount : undefined,
        raw,
      };
    },
  };
}

export const mtnPaymentProvider = { create: createMtnProvider };

