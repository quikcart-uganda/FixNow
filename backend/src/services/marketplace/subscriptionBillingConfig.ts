/**
 * Subscription billing-period configuration (PlatformSetting).
 * Seed defaults are used ONLY when the setting is missing — never as runtime hardcodes after first boot.
 */
import { PlatformSetting } from '../../models/index.js';
import { writeAuditLog } from '../../utils/audit.js';

export const SUBSCRIPTION_BILLING_PERIODS_SETTING_KEY = 'marketplace.subscription_billing_periods';

export type SubscriptionBillingPeriodsConfig = {
  /** Days granted for a monthly billing period. */
  monthlyDays: number;
  quarterlyDays: number;
  halfYearlyDays: number;
  yearlyDays: number;
  /** Used when seeding new plans / fallback if a plan has no gracePeriodDays. */
  defaultGracePeriodDays: number;
  /** Default currency for newly seeded plans. */
  currency: string;
};

/** First-install seed values only — administrators edit these in Admin → Subscriptions. */
export const SEED_BILLING_PERIODS: SubscriptionBillingPeriodsConfig = {
  monthlyDays: 30,
  quarterlyDays: 90,
  halfYearlyDays: 182,
  yearlyDays: 365,
  defaultGracePeriodDays: 3,
  currency: 'UGX',
};

/** First-install plan price seeds — stored on SubscriptionPlan docs; never overwrite on re-seed. */
export const SEED_PLAN_PRICES = {
  STARTER: {
    priceMonthly: 45000,
    priceQuarterly: 120000,
    priceHalfYear: 240000,
    priceYearly: 420000,
  },
  PROFESSIONAL: {
    priceMonthly: 85000,
    priceQuarterly: 230000,
    priceHalfYear: 450000,
    priceYearly: 800000,
  },
  BUSINESS: {
    priceMonthly: 150000,
    priceQuarterly: 400000,
    priceHalfYear: 780000,
    priceYearly: 1400000,
  },
} as const;

type BillingPeriod = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

let cache: { at: number; value: SubscriptionBillingPeriodsConfig } | null = null;
const CACHE_MS = 15_000;

function clampDays(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(3660, Math.round(v));
}

function clampGrace(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.min(90, Math.round(v));
}

export function normalizeBillingPeriods(
  value: Partial<SubscriptionBillingPeriodsConfig> | null | undefined,
): SubscriptionBillingPeriodsConfig {
  const v = value ?? {};
  return {
    monthlyDays: clampDays(v.monthlyDays, SEED_BILLING_PERIODS.monthlyDays),
    quarterlyDays: clampDays(v.quarterlyDays, SEED_BILLING_PERIODS.quarterlyDays),
    halfYearlyDays: clampDays(v.halfYearlyDays, SEED_BILLING_PERIODS.halfYearlyDays),
    yearlyDays: clampDays(v.yearlyDays, SEED_BILLING_PERIODS.yearlyDays),
    defaultGracePeriodDays: clampGrace(
      v.defaultGracePeriodDays,
      SEED_BILLING_PERIODS.defaultGracePeriodDays,
    ),
    currency: String(v.currency || SEED_BILLING_PERIODS.currency)
      .toUpperCase()
      .slice(0, 3),
  };
}

export function invalidateBillingPeriodsCache() {
  cache = null;
}

export async function ensureBillingPeriodsSetting(): Promise<SubscriptionBillingPeriodsConfig> {
  const existing = await PlatformSetting.findOne({ key: SUBSCRIPTION_BILLING_PERIODS_SETTING_KEY });
  if (existing) {
    const normalized = normalizeBillingPeriods(existing.value as Partial<SubscriptionBillingPeriodsConfig>);
    cache = { at: Date.now(), value: normalized };
    return normalized;
  }
  await PlatformSetting.create({
    key: SUBSCRIPTION_BILLING_PERIODS_SETTING_KEY,
    value: SEED_BILLING_PERIODS,
    scope: 'platform',
    description:
      'Subscription billing period lengths (days), default grace, and seed currency. Admin-editable; seed only when missing.',
  });
  cache = { at: Date.now(), value: { ...SEED_BILLING_PERIODS } };
  return { ...SEED_BILLING_PERIODS };
}

export async function getBillingPeriodsConfig(): Promise<SubscriptionBillingPeriodsConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  return ensureBillingPeriodsSetting();
}

export async function updateBillingPeriodsConfig(
  adminId: string,
  patch: Partial<SubscriptionBillingPeriodsConfig>,
): Promise<SubscriptionBillingPeriodsConfig> {
  const current = await getBillingPeriodsConfig();
  const next = normalizeBillingPeriods({ ...current, ...patch });
  await PlatformSetting.findOneAndUpdate(
    { key: SUBSCRIPTION_BILLING_PERIODS_SETTING_KEY },
    {
      $set: {
        value: next,
        updatedBy: adminId,
        scope: 'platform',
        description:
          'Subscription billing period lengths (days), default grace, and seed currency. Admin-editable; seed only when missing.',
      },
    },
    { upsert: true },
  );
  invalidateBillingPeriodsCache();
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'subscription.billing_periods_updated',
    resourceType: 'PlatformSetting',
    resourceId: SUBSCRIPTION_BILLING_PERIODS_SETTING_KEY,
    meta: next as unknown as Record<string, unknown>,
  });
  return next;
}

export async function resolvePeriodDays(period: BillingPeriod): Promise<number> {
  const cfg = await getBillingPeriodsConfig();
  if (period === 'yearly') return cfg.yearlyDays;
  if (period === 'half_yearly') return cfg.halfYearlyDays;
  if (period === 'quarterly') return cfg.quarterlyDays;
  return cfg.monthlyDays;
}

export async function getDefaultGracePeriodDays(): Promise<number> {
  const cfg = await getBillingPeriodsConfig();
  return cfg.defaultGracePeriodDays;
}
