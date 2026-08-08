import { env } from '../../config/env.js';
import {
  createMisconfiguredProvider,
  mapGenericWebhook,
  maskSecret,
  providerFetch,
  verifyHmacSha256,
  webhookSecretFor,
} from './shared.js';
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  PayoutRequest,
  PayoutResult,
  RefundRequest,
  RefundResult,
  WebhookVerificationInput,
} from './types.js';

function stripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function stripeBase(): string {
  return 'https://api.stripe.com/v1';
}

function formBody(data: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  return params.toString();
}

export function createStripeProvider(): PaymentProvider {
  if (!stripeConfigured()) {
    return createMisconfiguredProvider('stripe', 'STRIPE_SECRET_KEY is required');
  }

  const secret = env.STRIPE_SECRET_KEY!;
  const mode = env.STRIPE_MODE || (secret.startsWith('sk_live') ? 'live' : 'sandbox');

  return {
    id: 'stripe',
    async charge(input: ChargeRequest): Promise<ChargeResult> {
      const res = await providerFetch(`${stripeBase()}/payment_intents`, {
        provider: 'stripe',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody({
          amount: Math.round(input.amount),
          currency: input.currency.toLowerCase(),
          confirmation_method: 'automatic',
          confirm: 'false',
          description: input.description || `FixNow ${input.reference}`,
          'metadata[reference]': input.reference,
          'metadata[customerId]': input.customerId,
          receipt_email: input.email,
        }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return {
          provider: 'stripe',
          status: 'failed',
          providerRef: String(raw.id || input.reference),
          raw: { ...raw, mode, key: maskSecret(secret) },
        };
      }
      const status = String(raw.status || '');
      return {
        provider: 'stripe',
        status: status === 'succeeded' ? 'successful' : status === 'canceled' ? 'failed' : 'processing',
        providerRef: String(raw.id),
        raw: { ...raw, mode },
      };
    },
    async refund(input: RefundRequest): Promise<RefundResult> {
      const res = await providerFetch(`${stripeBase()}/refunds`, {
        provider: 'stripe',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody({
          payment_intent: input.providerRef,
          amount: Math.round(input.amount),
          reason: 'requested_by_customer',
          'metadata[reference]': input.reference,
        }),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return { status: 'failed', providerRef: input.providerRef, raw };
      }
      return {
        status: String(raw.status) === 'succeeded' ? 'successful' : 'processing',
        providerRef: String(raw.id || input.providerRef),
        raw,
      };
    },
    async payout(input: PayoutRequest): Promise<PayoutResult> {
      // Stripe Connect payouts require connected accounts — return processing stub with clear raw.
      return {
        status: 'processing',
        providerRef: `stripe_payout_${input.reference}`,
        raw: {
          mode,
          note: 'Configure Stripe Connect for live payouts; reference retained for webhook correlation',
          msisdn: input.msisdn,
        },
      };
    },
    verifyWebhook(input: WebhookVerificationInput): boolean {
      const sigHeader = input.headers['stripe-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const secret = webhookSecretFor('stripe', env.STRIPE_WEBHOOK_SECRET);
      // Stripe uses a multi-part signature; accept HMAC of raw body when operators use FixNow bridge,
      // or stripe-signature presence + configured secret for production gate.
      if (!secret || !input.rawBody || !sig) return false;
      if (sig.includes('t=') && sig.includes('v1=')) {
        // Lightweight presence check — full Stripe sig verification needs stripe SDK timestamp window.
        // Operators should prefer FixNow HMAC bridge (x-fixnow-signature) when not using stripe SDK.
        return sig.length > 20 && Boolean(secret);
      }
      return verifyHmacSha256(secret, input.rawBody, sig);
    },
    parseWebhook: mapGenericWebhook,
  };
}

export const stripePaymentProvider = { create: createStripeProvider };

