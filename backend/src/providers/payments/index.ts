import { env } from '../../config/env.js';
import { createAirtelProvider } from './airtel.provider.js';
import { consolePaymentProvider, createSimulatedProvider } from './console.provider.js';
import { createFlutterwaveProvider } from './flutterwave.provider.js';
import { createMtnProvider } from './mtn.provider.js';
import { createPesapalProvider } from './pesapal.provider.js';
import { createStripeProvider } from './stripe.provider.js';
import type { PaymentProvider, PaymentProviderId } from './types.js';

const liveCache = new Map<PaymentProviderId, PaymentProvider>();
/** Runtime override from Provider Manager (null = use env default). */
let activeOverride: PaymentProviderId | null = null;

export function setPaymentProviderOverride(id: string | null) {
  if (id === 'none' || id === 'console') activeOverride = 'console';
  else activeOverride = id ? (id as PaymentProviderId) : null;
  liveCache.clear();
}

function buildLiveProvider(id: Exclude<PaymentProviderId, 'console'>): PaymentProvider {
  switch (id) {
    case 'mtn':
      return createMtnProvider();
    case 'airtel':
      return createAirtelProvider();
    case 'flutterwave':
      return createFlutterwaveProvider();
    case 'pesapal':
      return createPesapalProvider();
    case 'stripe':
      return createStripeProvider();
    default:
      return createSimulatedProvider(id, false);
  }
}

/**
 * Provider factory — interchangeable adapters.
 * Active default comes from Provider Manager override (when set) or env.
 * When PAYMENTS_LIVE=false (default), all providers use the simulated adapter.
 */
export function getPaymentProvider(id?: string): PaymentProvider {
  const requested = (id || activeOverride || env.PAYMENT_DEFAULT_PROVIDER || 'console') as PaymentProviderId;

  if (!env.PAYMENTS_LIVE || requested === 'console') {
    return requested === 'console'
      ? consolePaymentProvider
      : createSimulatedProvider(requested, true);
  }

  const cached = liveCache.get(requested);
  if (cached) return cached;
  const live = buildLiveProvider(requested as Exclude<PaymentProviderId, 'console'>);
  liveCache.set(requested, live);
  return live;
}

export async function getPaymentProviderAsync(id?: string): Promise<PaymentProvider> {
  if (id) return getPaymentProvider(id);
  try {
    const { providerManager } = await import('../../services/providers/provider.manager.js');
    const active = await providerManager.resolveRuntimeId('payments');
    setPaymentProviderOverride(active);
    return getPaymentProvider(active);
  } catch {
    return getPaymentProvider();
  }
}

export function listPaymentProviders(): PaymentProviderId[] {
  return ['console', 'mtn', 'airtel', 'flutterwave', 'pesapal', 'stripe'];
}

export function clearPaymentProviderCache(): void {
  liveCache.clear();
}

export type { PaymentProvider, PaymentProviderId } from './types.js';
