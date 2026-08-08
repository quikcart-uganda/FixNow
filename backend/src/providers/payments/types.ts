export type PaymentProviderId =
  | 'console'
  | 'mtn'
  | 'airtel'
  | 'flutterwave'
  | 'pesapal'
  | 'stripe';

export type ProviderChargeStatus = 'pending' | 'processing' | 'successful' | 'failed';

export interface ChargeRequest {
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  customerId: string;
  msisdn?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface ChargeResult {
  provider: PaymentProviderId;
  status: ProviderChargeStatus;
  providerRef: string;
  raw?: Record<string, unknown>;
}

export interface RefundRequest {
  amount: number;
  currency: string;
  providerRef: string;
  reference: string;
  reason?: string;
}

export interface RefundResult {
  status: ProviderChargeStatus;
  providerRef: string;
  raw?: Record<string, unknown>;
}

export interface PayoutRequest {
  amount: number;
  currency: string;
  reference: string;
  msisdn: string;
  accountName?: string;
  providerHint?: string;
}

export interface PayoutResult {
  status: ProviderChargeStatus;
  providerRef: string;
  raw?: Record<string, unknown>;
}

export interface WebhookVerificationInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: string;
  body: unknown;
  secret?: string;
}

export interface NormalizedWebhookEvent {
  event: 'charge.successful' | 'charge.failed' | 'refund.successful' | 'payout.successful' | 'unknown';
  reference?: string;
  providerRef?: string;
  amount?: number;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  charge(input: ChargeRequest): Promise<ChargeResult>;
  refund(input: RefundRequest): Promise<RefundResult>;
  payout(input: PayoutRequest): Promise<PayoutResult>;
  verifyWebhook(input: WebhookVerificationInput): boolean;
  parseWebhook(body: unknown): NormalizedWebhookEvent;
}
