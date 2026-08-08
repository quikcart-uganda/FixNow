/**
 * Technician Starter (and higher) subscription plans — manual Mobile Money + admin verify.
 * Free completed-job accounting remains in freeJob.service.ts; this module only grants paid access.
 */
import {
  PlatformSetting,
  Subscription,
  SubscriptionPayment,
  SubscriptionPlan,
  TechnicianProfile,
  User,
  DEFAULT_BUSINESS_FEATURES,
  DEFAULT_BUSINESS_LIMITS,
  DEFAULT_PROFESSIONAL_FEATURES,
  DEFAULT_PROFESSIONAL_LIMITS,
  DEFAULT_STARTER_FEATURES,
  DEFAULT_STARTER_LIMITS,
  DEFAULT_PLAN_BADGES,
  type ISubscriptionPlanDoc,
  type PlanFeatureFlags,
  type PlanLimits,
  type PlanBadgeConfig,
} from '../../models/index.js';
import { ACCOUNT_STATUS } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { emitFreeJobLimitUpdated, emitTechnicianUnlocked, emitSubscriptionCatalogueUpdated } from '../../sockets/realtime.js';
import { updateFreeJobConfigValue } from './freeJob.service.js';
import {
  SEED_PLAN_PRICES,
  ensureBillingPeriodsSetting,
  getBillingPeriodsConfig,
  getDefaultGracePeriodDays,
  resolvePeriodDays,
  updateBillingPeriodsConfig,
  type SubscriptionBillingPeriodsConfig,
} from './subscriptionBillingConfig.js';

export const SUBSCRIPTION_MOMO_SETTING_KEY = 'marketplace.subscription_momo';
export const SUBSCRIPTION_REMINDER_SETTING_KEY = 'marketplace.subscription_reminders';
export const SUBSCRIPTION_DISCOVERY_SETTING_KEY = 'marketplace.subscription_discovery';
export {
  SUBSCRIPTION_BILLING_PERIODS_SETTING_KEY,
  type SubscriptionBillingPeriodsConfig,
} from './subscriptionBillingConfig.js';

export type SubscriptionDiscoveryConfig = {
  upgradesEnabled: boolean;
  showFreePlan: boolean;
  featuredPlanCode: string | null;
  recommendedPlanCode: string | null;
  popularPlanCode: string | null;
  allowDowngrade: boolean;
  heroTitle: string;
  heroSubtitle: string;
};

const DEFAULT_DISCOVERY: SubscriptionDiscoveryConfig = {
  upgradesEnabled: true,
  showFreePlan: true,
  featuredPlanCode: 'PROFESSIONAL',
  recommendedPlanCode: 'PROFESSIONAL',
  popularPlanCode: 'STARTER',
  allowDowngrade: false,
  heroTitle: 'Choose the plan that fits your business',
  heroSubtitle:
    'Explore Free, Starter, Professional, and Business anytime — you never need to wait until free jobs run out.',
};

export type BillingPeriod = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export type SubscriptionMomoConfig = {
  enabled: boolean;
  currency: string;
  networks: Array<{
    code: 'mtn' | 'airtel';
    label: string;
    accountName: string;
    phoneNumber: string;
    instructions: string;
  }>;
  referenceFormat: string;
  paymentInstructions: string;
};

export type SubscriptionReminderConfig = {
  enabled: boolean;
  frequencyDays: number;
  dismissDurationHours: number;
  maxRemindersPerEvent: number;
  popupEnabled: boolean;
  notificationEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  /** Configurable day offsets before expiry (e.g. 14, 7, 3, 1, 0). Admin-editable. */
  daysBeforeExpiry: number[];
  triggers: {
    oneJobRemaining: boolean;
    freeJobsExhausted: boolean;
    sevenDaysBeforeExpiry: boolean;
    threeDaysBeforeExpiry: boolean;
    oneDayBeforeExpiry: boolean;
    expiryDay: boolean;
    afterExpiry: boolean;
    graceEnding: boolean;
  };
};

const DEFAULT_MOMO: SubscriptionMomoConfig = {
  enabled: true,
  currency: 'UGX',
  networks: [
    {
      code: 'mtn',
      label: 'MTN Mobile Money',
      accountName: 'FixNow Uganda',
      phoneNumber: '0770000000',
      instructions: 'Send the exact amount using MTN MoMo. Use the reference shown in the app.',
    },
    {
      code: 'airtel',
      label: 'Airtel Money',
      accountName: 'FixNow Uganda',
      phoneNumber: '0750000000',
      instructions: 'Send the exact amount using Airtel Money. Use the reference shown in the app.',
    },
  ],
  referenceFormat: 'TECH-{userSeq}',
  paymentInstructions:
    'Pay with Mobile Money, then submit your transaction ID. Your subscription becomes active after FixNow verifies your payment.',
};

const DEFAULT_REMINDERS: SubscriptionReminderConfig = {
  enabled: true,
  frequencyDays: 3,
  dismissDurationHours: 72,
  maxRemindersPerEvent: 3,
  popupEnabled: true,
  notificationEnabled: true,
  emailEnabled: false,
  pushEnabled: true,
  daysBeforeExpiry: [14, 7, 3, 1, 0],
  triggers: {
    oneJobRemaining: true,
    freeJobsExhausted: true,
    sevenDaysBeforeExpiry: true,
    threeDaysBeforeExpiry: true,
    oneDayBeforeExpiry: true,
    expiryDay: true,
    afterExpiry: true,
    graceEnding: true,
  },
};

const STARTER_FEATURE_LIST = [
  'Unlimited job applications',
  'Unlimited completed jobs',
  'Public technician profile',
  'Customer ratings & reviews',
  'Portfolio & basic gallery (up to 20 photos)',
  'Basic profile banner',
  'Company name & business description',
  'Working hours, location & map coverage',
  'Basic availability, analytics & earnings',
  'Chat & push notifications',
  'Job history & certificates',
  'Basic offers (up to 2 active)',
  'One promotional banner',
  'Standard search ranking & support',
  'Referral programme',
];

function priceFor(plan: ISubscriptionPlanDoc, period: BillingPeriod): number {
  if (period === 'yearly') return Number(plan.priceYearly ?? plan.price ?? 0);
  if (period === 'half_yearly') return Number(plan.priceHalfYear ?? plan.priceQuarterly * 2);
  if (period === 'quarterly') return Number(plan.priceQuarterly ?? plan.price ?? 0);
  return Number(plan.priceMonthly ?? plan.price ?? 0);
}

function serializePlan(
  plan: ISubscriptionPlanDoc,
  periods?: SubscriptionBillingPeriodsConfig,
) {
  const code = String(plan.code || '').toUpperCase() as keyof typeof DEFAULT_PLAN_BADGES;
  const defaultBadge = DEFAULT_PLAN_BADGES[code] || DEFAULT_PLAN_BADGES.STARTER;
  const badge = { ...defaultBadge, ...(plan.badge || {}) };
  return {
    id: plan._id.toString(),
    code: plan.code,
    name: plan.name,
    description: plan.description,
    audience: plan.audience,
    sortOrder: plan.sortOrder,
    currency: plan.currency,
    priceMonthly: plan.priceMonthly,
    priceQuarterly: plan.priceQuarterly,
    priceHalfYear: Number(plan.priceHalfYear ?? 0),
    priceYearly: plan.priceYearly,
    price: plan.priceMonthly,
    billingPeriod: plan.billingPeriod,
    gracePeriodDays: plan.gracePeriodDays,
    autoRenew: plan.autoRenew,
    features: plan.features,
    featureFlags: plan.featureFlags,
    limits: plan.limits,
    freeJobLimitBonus: plan.freeJobLimitBonus,
    leadCreditsIncluded: plan.leadCreditsIncluded,
    isActive: plan.isActive,
    isDefault: plan.isDefault,
    isVisible: plan.isVisible !== false,
    badge,
    durationDays: periods
      ? {
          monthly: periods.monthlyDays,
          quarterly: periods.quarterlyDays,
          half_yearly: periods.halfYearlyDays,
          yearly: periods.yearlyDays,
        }
      : undefined,
  };
}

export function hasActivePaidAccess(
  profile: {
    subscriptionStatus?: string;
    subscriptionPeriodEnd?: Date | null;
    monetizationSuspended?: boolean;
  },
  gracePeriodDays = 0,
): boolean {
  if (profile.monetizationSuspended) return true;
  const status = profile.subscriptionStatus;
  const end = profile.subscriptionPeriodEnd ? new Date(profile.subscriptionPeriodEnd).getTime() : null;
  const now = Date.now();
  const graceMs = Math.max(0, Number(gracePeriodDays) || 0) * 24 * 60 * 60 * 1000;

  if (status === 'active' || status === 'trialing') {
    if (end == null) return true;
    if (end >= now) return true;
    // Soft grace: still treat as paid until grace window closes.
    return end + graceMs >= now;
  }
  if (status === 'past_due') {
    if (end == null) return graceMs > 0;
    return end + graceMs >= now;
  }
  return false;
}

const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  BUSINESS: 3,
};

function planRank(code: string | null | undefined): number {
  return PLAN_RANK[String(code || '').toUpperCase()] ?? 0;
}

function clearSubscriptionScheduleFields(sub: {
  cancelAtPeriodEnd: boolean;
  scheduledPlanCode?: string | null;
  scheduledChangeType?: 'downgrade' | 'cancel' | null;
  scheduledChangeAt?: Date | null;
  scheduledAt?: Date | null;
}) {
  sub.cancelAtPeriodEnd = false;
  sub.scheduledPlanCode = null;
  sub.scheduledChangeType = undefined;
  sub.scheduledChangeAt = null;
  sub.scheduledAt = null;
}

function serializeSchedule(sub: {
  cancelAtPeriodEnd?: boolean;
  scheduledPlanCode?: string | null;
  scheduledChangeType?: 'downgrade' | 'cancel' | null;
  scheduledChangeAt?: Date | null;
  scheduledAt?: Date | null;
  currentPeriodEnd?: Date | null;
  planCode?: string;
} | null) {
  if (!sub) return null;
  const type = sub.cancelAtPeriodEnd
    ? ('cancel' as const)
    : sub.scheduledChangeType === 'downgrade'
      ? ('downgrade' as const)
      : null;
  if (!type) return null;
  const effectiveAt = sub.scheduledChangeAt || sub.currentPeriodEnd || null;
  return {
    type,
    planCode: type === 'downgrade' ? String(sub.scheduledPlanCode || '').toUpperCase() || null : null,
    effectiveAt,
    scheduledAt: sub.scheduledAt || null,
    currentPlanCode: sub.planCode ? String(sub.planCode).toUpperCase() : null,
  };
}

async function requireActivePaidSubscription(userId: string) {
  const profile = await TechnicianProfile.findOne({ userId });
  if (!profile || !hasActivePaidAccess(profile)) {
    throw AppError.badRequest('You need an active paid subscription to schedule this change.');
  }
  const sub = await Subscription.findOne({
    userId,
    deletedAt: null,
    status: { $in: ['active', 'trialing', 'past_due'] },
  }).sort({ updatedAt: -1 });
  if (!sub) {
    throw AppError.badRequest('No active subscription found to schedule a change against.');
  }
  return { profile, sub };
}

/**
 * Schedule a downgrade to a lower paid plan at current period end.
 * Paid entitlements stay active until expiry.
 */
export async function scheduleDowngrade(userId: string, planCodeRaw: string) {
  const targetCode = String(planCodeRaw || '').trim().toUpperCase();
  if (!targetCode || targetCode === 'FREE') {
    throw AppError.badRequest('Use cancel subscription to return to Free after the paid period.');
  }
  await ensureSubscriptionCatalogue();
  const target = await SubscriptionPlan.findOne({
    code: targetCode,
    audience: 'technician',
    isActive: true,
    deletedAt: null,
  });
  if (!target) throw AppError.notFound('Plan not found');

  const { profile, sub } = await requireActivePaidSubscription(userId);
  const currentCode = String(profile.subscriptionPlanCode || sub.planCode || '').toUpperCase();
  if (planRank(targetCode) >= planRank(currentCode)) {
    throw AppError.badRequest('Choose a lower plan to schedule a downgrade. Use Upgrade to move up.');
  }

  const effectiveAt = profile.subscriptionPeriodEnd || sub.currentPeriodEnd || new Date();
  sub.cancelAtPeriodEnd = false;
  sub.scheduledChangeType = 'downgrade';
  sub.scheduledPlanCode = targetCode;
  sub.scheduledChangeAt = effectiveAt;
  sub.scheduledAt = new Date();
  await sub.save();

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId,
      type: 'technician.subscription_downgrade_scheduled',
      title: 'Downgrade scheduled',
      body: `You'll keep ${currentCode} benefits until ${effectiveAt.toLocaleDateString()}. Then your account switches to ${target.name}.`,
      bypassQuietHours: true,
    });
  } catch {
    /* ignore */
  }

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'subscription.schedule_downgrade',
    resourceType: 'Subscription',
    resourceId: sub._id.toString(),
    meta: { from: currentCode, to: targetCode, effectiveAt },
  });

  return getMine(userId);
}

/**
 * Schedule unsubscribe / cancel-at-period-end. Access remains until expiry, then Free.
 */
export async function scheduleCancel(userId: string) {
  const { profile, sub } = await requireActivePaidSubscription(userId);
  const currentCode = String(profile.subscriptionPlanCode || sub.planCode || '').toUpperCase();
  const effectiveAt = profile.subscriptionPeriodEnd || sub.currentPeriodEnd || new Date();

  sub.cancelAtPeriodEnd = true;
  sub.scheduledChangeType = 'cancel';
  sub.scheduledPlanCode = null;
  sub.scheduledChangeAt = effectiveAt;
  sub.scheduledAt = new Date();
  await sub.save();

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId,
      type: 'technician.subscription_cancel_scheduled',
      title: 'Cancellation scheduled',
      body: `Your subscription stays active until ${effectiveAt.toLocaleDateString()}. It will not renew automatically.`,
      bypassQuietHours: true,
    });
  } catch {
    /* ignore */
  }

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'subscription.schedule_cancel',
    resourceType: 'Subscription',
    resourceId: sub._id.toString(),
    meta: { planCode: currentCode, effectiveAt },
  });

  return getMine(userId);
}

/** Clear a scheduled downgrade or cancellation; keep current paid plan. */
export async function clearScheduledChange(userId: string) {
  const sub = await Subscription.findOne({
    userId,
    deletedAt: null,
    status: { $in: ['active', 'trialing', 'past_due'] },
  }).sort({ updatedAt: -1 });
  if (!sub) throw AppError.notFound('No active subscription found');
  if (!sub.cancelAtPeriodEnd && !sub.scheduledChangeType) {
    throw AppError.badRequest('There is no scheduled change to cancel.');
  }

  clearSubscriptionScheduleFields(sub);
  await sub.save();

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'subscription.clear_scheduled_change',
    resourceType: 'Subscription',
    resourceId: sub._id.toString(),
  });

  return getMine(userId);
}

async function applyScheduledCancel(userId: string, profile: {
  subscriptionStatus?: string;
  subscriptionPlanCode?: string;
  remainingFreeJobs?: number;
  accountLocked?: boolean;
  lockReason?: string;
  accountStatus?: string;
  save: () => Promise<unknown>;
  userId: { toString: () => string } | string;
}) {
  profile.subscriptionStatus = 'cancelled';
  profile.subscriptionPlanCode = undefined;
  if (Number(profile.remainingFreeJobs) <= 0) {
    profile.accountLocked = true;
    profile.lockReason = 'Subscription ended — free completed jobs exhausted';
    if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
      profile.accountStatus = ACCOUNT_STATUS.LOCKED;
    }
  }
  await profile.save();
  await Subscription.updateMany(
    { userId, status: { $in: ['active', 'trialing', 'past_due'] } },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelAtPeriodEnd: false,
        scheduledPlanCode: null,
        scheduledChangeAt: null,
        scheduledAt: null,
      },
      $unset: { scheduledChangeType: 1 },
    },
  );
  await User.updateOne(
    { _id: userId },
    { $set: { subscriptionStatus: 'cancelled' }, $unset: { subscriptionPlanCode: 1 } },
  );
  emitFreeJobLimitUpdated(userId, profile);
  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId,
      type: 'technician.subscription_cancelled',
      title: 'Subscription ended',
      body: 'Your paid period has ended. Your account is now on the Free plan. Subscribe again anytime.',
      bypassQuietHours: true,
    });
  } catch {
    /* ignore */
  }
}

async function applyScheduledDowngrade(
  userId: string,
  profile: {
    subscriptionStatus?: string;
    subscriptionPlanCode?: string;
    remainingFreeJobs?: number;
    accountLocked?: boolean;
    lockReason?: string;
    accountStatus?: string;
    save: () => Promise<unknown>;
    userId: { toString: () => string } | string;
  },
  scheduledPlanCode: string,
  billingPeriod: BillingPeriod,
) {
  const plan = await SubscriptionPlan.findOne({
    code: String(scheduledPlanCode).toUpperCase(),
    audience: 'technician',
    isActive: true,
    deletedAt: null,
  });
  if (!plan) {
    // Fall back to cancel/expire if target plan missing.
    await applyScheduledCancel(userId, profile);
    return;
  }
  await activateSubscriptionForUser({
    userId,
    plan,
    billingPeriod,
    amount: 0,
    adminId: userId,
    complimentary: true,
    note: `Scheduled downgrade applied to ${plan.code}`,
  });
}

function normalizeMomo(value: Partial<SubscriptionMomoConfig> | null | undefined): SubscriptionMomoConfig {
  const v = value ?? {};
  const networks =
    Array.isArray(v.networks) && v.networks.length > 0
      ? v.networks.map((n) => ({
          code: n.code === 'airtel' ? ('airtel' as const) : ('mtn' as const),
          label: String(n.label || (n.code === 'airtel' ? 'Airtel Money' : 'MTN Mobile Money')),
          accountName: String(n.accountName || 'FixNow Uganda'),
          phoneNumber: String(n.phoneNumber || ''),
          instructions: String(n.instructions || ''),
        }))
      : DEFAULT_MOMO.networks;
  return {
    enabled: v.enabled !== false,
    currency: String(v.currency || DEFAULT_MOMO.currency).toUpperCase().slice(0, 3),
    networks,
    referenceFormat: String(v.referenceFormat || DEFAULT_MOMO.referenceFormat),
    paymentInstructions: String(v.paymentInstructions || DEFAULT_MOMO.paymentInstructions),
  };
}

function normalizeReminders(
  value: Partial<SubscriptionReminderConfig> | null | undefined,
): SubscriptionReminderConfig {
  const v = value ?? {};
  const t = (v.triggers ?? {}) as Partial<SubscriptionReminderConfig['triggers']>;
  const legacyDays: number[] = [];
  if (t.sevenDaysBeforeExpiry !== false) legacyDays.push(7);
  if (t.threeDaysBeforeExpiry !== false) legacyDays.push(3);
  if (t.oneDayBeforeExpiry !== false) legacyDays.push(1);
  if (t.expiryDay !== false) legacyDays.push(0);

  const rawDays = Array.isArray(v.daysBeforeExpiry)
    ? v.daysBeforeExpiry.map((d) => Math.round(Number(d))).filter((d) => Number.isFinite(d) && d >= 0 && d <= 365)
    : legacyDays.length
      ? legacyDays
      : DEFAULT_REMINDERS.daysBeforeExpiry;
  const daysBeforeExpiry = [...new Set(rawDays)].sort((a, b) => b - a);

  return {
    enabled: v.enabled !== false,
    frequencyDays:
      typeof v.frequencyDays === 'number' && v.frequencyDays >= 1 ? v.frequencyDays : DEFAULT_REMINDERS.frequencyDays,
    dismissDurationHours:
      typeof v.dismissDurationHours === 'number' && v.dismissDurationHours >= 0
        ? v.dismissDurationHours
        : DEFAULT_REMINDERS.dismissDurationHours,
    maxRemindersPerEvent:
      typeof v.maxRemindersPerEvent === 'number' && v.maxRemindersPerEvent >= 1
        ? v.maxRemindersPerEvent
        : DEFAULT_REMINDERS.maxRemindersPerEvent,
    popupEnabled: v.popupEnabled !== false,
    notificationEnabled: v.notificationEnabled !== false,
    emailEnabled: v.emailEnabled === true,
    pushEnabled: v.pushEnabled !== false,
    daysBeforeExpiry,
    triggers: {
      oneJobRemaining: t.oneJobRemaining !== false,
      freeJobsExhausted: t.freeJobsExhausted !== false,
      sevenDaysBeforeExpiry: daysBeforeExpiry.includes(7) || t.sevenDaysBeforeExpiry !== false,
      threeDaysBeforeExpiry: daysBeforeExpiry.includes(3) || t.threeDaysBeforeExpiry !== false,
      oneDayBeforeExpiry: daysBeforeExpiry.includes(1) || t.oneDayBeforeExpiry !== false,
      expiryDay: daysBeforeExpiry.includes(0) || t.expiryDay !== false,
      afterExpiry: t.afterExpiry !== false,
      graceEnding: t.graceEnding !== false,
    },
  };
}

export async function getSubscriptionDiscoveryConfig(): Promise<SubscriptionDiscoveryConfig> {
  const setting = await PlatformSetting.findOne({ key: SUBSCRIPTION_DISCOVERY_SETTING_KEY });
  const v = (setting?.value || {}) as Partial<SubscriptionDiscoveryConfig>;
  return {
    upgradesEnabled: v.upgradesEnabled !== false,
    showFreePlan: v.showFreePlan !== false,
    featuredPlanCode: typeof v.featuredPlanCode === 'string' ? v.featuredPlanCode.toUpperCase() : DEFAULT_DISCOVERY.featuredPlanCode,
    recommendedPlanCode:
      typeof v.recommendedPlanCode === 'string'
        ? v.recommendedPlanCode.toUpperCase()
        : DEFAULT_DISCOVERY.recommendedPlanCode,
    popularPlanCode:
      typeof v.popularPlanCode === 'string' ? v.popularPlanCode.toUpperCase() : DEFAULT_DISCOVERY.popularPlanCode,
    allowDowngrade: v.allowDowngrade === true,
    heroTitle: String(v.heroTitle || DEFAULT_DISCOVERY.heroTitle).slice(0, 160),
    heroSubtitle: String(v.heroSubtitle || DEFAULT_DISCOVERY.heroSubtitle).slice(0, 400),
  };
}

export async function updateSubscriptionDiscoveryConfig(
  adminId: string,
  patch: Partial<SubscriptionDiscoveryConfig>,
): Promise<SubscriptionDiscoveryConfig> {
  const current = await getSubscriptionDiscoveryConfig();
  const next: SubscriptionDiscoveryConfig = {
    upgradesEnabled: patch.upgradesEnabled ?? current.upgradesEnabled,
    showFreePlan: patch.showFreePlan ?? current.showFreePlan,
    featuredPlanCode:
      patch.featuredPlanCode !== undefined
        ? patch.featuredPlanCode
          ? String(patch.featuredPlanCode).toUpperCase()
          : null
        : current.featuredPlanCode,
    recommendedPlanCode:
      patch.recommendedPlanCode !== undefined
        ? patch.recommendedPlanCode
          ? String(patch.recommendedPlanCode).toUpperCase()
          : null
        : current.recommendedPlanCode,
    popularPlanCode:
      patch.popularPlanCode !== undefined
        ? patch.popularPlanCode
          ? String(patch.popularPlanCode).toUpperCase()
          : null
        : current.popularPlanCode,
    allowDowngrade: patch.allowDowngrade ?? current.allowDowngrade,
    heroTitle: typeof patch.heroTitle === 'string' ? patch.heroTitle.slice(0, 160) : current.heroTitle,
    heroSubtitle:
      typeof patch.heroSubtitle === 'string' ? patch.heroSubtitle.slice(0, 400) : current.heroSubtitle,
  };
  await PlatformSetting.findOneAndUpdate(
    { key: SUBSCRIPTION_DISCOVERY_SETTING_KEY },
    {
      $set: {
        value: next,
        updatedBy: adminId,
        scope: 'platform',
        description: 'Technician subscription discovery / upgrade experience settings',
      },
    },
    { upsert: true },
  );
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'subscription.discovery_update',
    resourceType: 'PlatformSetting',
    resourceId: SUBSCRIPTION_DISCOVERY_SETTING_KEY,
    meta: next,
  });
  await emitCatalogueLive('discovery');
  return next;
}

function buildFreePlanCard(periods?: SubscriptionBillingPeriodsConfig) {
  return {
    id: 'free',
    code: 'FREE',
    name: 'Free',
    description:
      'Start with a free completed-job quota. Browse jobs, build your profile, and upgrade anytime — no wait required.',
    audience: 'technician',
    sortOrder: 0,
    currency: periods?.currency || 'UGX',
    priceMonthly: 0,
    priceQuarterly: 0,
    priceHalfYear: 0,
    priceYearly: 0,
    price: 0,
    billingPeriod: 'monthly',
    gracePeriodDays: 0,
    autoRenew: false,
    features: [
      'Configurable free completed jobs',
      'Browse jobs & notifications',
      'Public profile & chat on existing jobs',
      'Upgrade anytime from Settings',
    ],
    featureFlags: {
      ...DEFAULT_STARTER_FEATURES,
      unlimitedApplications: false,
      unlimitedCompletedJobs: false,
      uploadVideos: false,
      advertisingSlides: false,
      promotionalAnnouncements: false,
      portfolioCampaigns: false,
      featuredPlacement: false,
      premiumBadge: false,
      marketingCentre: false,
      basicOffers: false,
    },
    limits: {
      ...DEFAULT_STARTER_LIMITS,
      maxVideos: 0,
      maxActiveOffers: 0,
      maxAdvertisingSlides: 0,
      maxHomepageSlides: 0,
      maxPromotionalBanners: 0,
      maxAnnouncements: 0,
      searchPriorityWeight: 0,
    },
    freeJobLimitBonus: 0,
    leadCreditsIncluded: 0,
    isActive: true,
    isDefault: false,
    isVisible: true,
    durationDays: periods
      ? {
          monthly: periods.monthlyDays,
          quarterly: periods.quarterlyDays,
          half_yearly: periods.halfYearlyDays,
          yearly: periods.yearlyDays,
        }
      : undefined,
    badge: {
      enabled: true,
      name: 'Free',
      text: 'Free',
      icon: 'person',
      color: '#64748B',
      borderColor: '#475569',
      glow: false,
      animation: false,
      size: 'sm',
      visibleOnProfile: true,
      visibleOnSearch: false,
      visibleOnChat: false,
      visibleOnAdmin: true,
    },
  };
}

/** Human-readable comparison rows driven by live plan limits/flags — not hardcoded product copy. */
function buildComparisonRows(plans: ReturnType<typeof serializePlan>[], includeFree: boolean) {
  const free = includeFree ? buildFreePlanCard() : null;
  const all = free ? [free, ...plans] : plans;
  const valueFor = (code: string, getter: (p: (typeof all)[0]) => string | number | boolean) => {
    const plan = all.find((p) => p.code === code);
    return plan ? getter(plan) : '—';
  };
  const codes = all.map((p) => p.code);
  const row = (
    key: string,
    label: string,
    getter: (p: (typeof all)[0]) => string | number | boolean,
  ) => ({
    key,
    label,
    values: Object.fromEntries(codes.map((code) => [code, valueFor(code, getter)])),
  });

  return [
    row('completed_jobs', 'Completed jobs', (p) =>
      p.code === 'FREE' ? 'Free quota only' : p.featureFlags.unlimitedCompletedJobs ? 'Unlimited' : 'Limited',
    ),
    row('applications', 'Job applications', (p) =>
      p.featureFlags.unlimitedApplications ? 'Unlimited' : 'Quota / locked when exhausted',
    ),
    row('photos', 'Photo limit', (p) => Number(p.limits.maxPhotos)),
    row('videos', 'Video limit', (p) => Number(p.limits.maxVideos)),
    row('offers', 'Active offers', (p) => Number(p.limits.maxActiveOffers)),
    row('ads', 'Advertising slides', (p) => Number(p.limits.maxAdvertisingSlides)),
    row('homepage', 'Homepage slides', (p) => Number(p.limits.maxHomepageSlides || p.limits.maxAdvertisingSlides)),
    row('banners', 'Promotional banners', (p) => Number(p.limits.maxPromotionalBanners)),
    row('portfolio', 'Portfolio', (p) => Boolean(p.featureFlags.portfolio)),
    row('branding', 'Business branding', (p) =>
      Boolean(p.featureFlags.businessLogo || p.featureFlags.customProfileColours),
    ),
    row('marketing', 'Marketing tools', (p) =>
      Boolean(p.featureFlags.advertisingSlides || p.featureFlags.marketingCentre),
    ),
    row('analytics', 'Advanced analytics', (p) => Boolean(p.featureFlags.advancedEarnings || p.featureFlags.customerInsights)),
    row('support', 'Priority support', (p) => Boolean(p.featureFlags.prioritySupport)),
    row('dashboard', 'Business dashboard', (p) => Boolean(p.featureFlags.marketingCentre || p.code === 'BUSINESS')),
    row('boosts', 'Boost eligibility', (p) => (p.code === 'FREE' ? 'If Admin enables' : 'Yes (Admin rules)')),
    row('search', 'Search priority weight', (p) => Number(p.limits.searchPriorityWeight)),
    row('visibility', 'Featured placement', (p) => Boolean(p.featureFlags.featuredPlacement)),
    row('approval', 'Admin approval for ads/offers', (p) =>
      p.code === 'FREE' ? 'N/A' : 'Required before publish',
    ),
  ];
}

function buildPlanDetail(plan: ReturnType<typeof serializePlan>) {
  return {
    ...plan,
    overview: plan.description,
    idealCustomer:
      plan.code === 'FREE'
        ? 'New technicians exploring FixNow before committing to a paid plan.'
        : plan.code === 'STARTER'
          ? 'Technicians who finished free completed jobs and need unlimited applications.'
          : plan.code === 'PROFESSIONAL'
            ? 'Growing technicians who want advertising, offers, and premium branding.'
            : 'Registered companies and teams that need a company portal and Marketing Centre.',
    whyUpgrade:
      plan.code === 'FREE'
        ? 'Stay on Free while you learn — upgrade the moment you want unlimited applications or marketing tools.'
        : plan.code === 'STARTER'
          ? 'Keep applying after free jobs end without losing your reputation progress.'
          : plan.code === 'PROFESSIONAL'
            ? 'Get discovered with slides, banners, and a stronger customer-facing brand.'
            : 'Run FixNow as your company OS — Marketing Centre, verification, and highest fair visibility.',
    faq: [
      {
        q: 'Does upgrading delete my free-job history?',
        a: 'No. Free completed-job accounting is unchanged. Paid access simply lets you keep working.',
      },
      {
        q: 'When does my plan activate?',
        a: 'After you pay with Mobile Money and FixNow Admin verifies your transaction.',
      },
      {
        q: 'Can I change plans later?',
        a: 'Yes. Open Upgrade Plan anytime to renew or move to another visible plan.',
      },
    ],
    supportLevel: plan.featureFlags.prioritySupport
      ? 'Priority support'
      : plan.featureFlags.standardSupport
        ? 'Standard support'
        : 'Community / Help Centre',
  };
}

export async function getSubscriptionMomoConfig(): Promise<SubscriptionMomoConfig> {
  const setting = await PlatformSetting.findOne({ key: SUBSCRIPTION_MOMO_SETTING_KEY });
  return normalizeMomo(setting?.value as Partial<SubscriptionMomoConfig> | undefined);
}

export async function updateSubscriptionMomoConfig(
  adminId: string,
  patch: Partial<SubscriptionMomoConfig>,
): Promise<SubscriptionMomoConfig> {
  const current = await getSubscriptionMomoConfig();
  const next = normalizeMomo({ ...current, ...patch });
  await PlatformSetting.findOneAndUpdate(
    { key: SUBSCRIPTION_MOMO_SETTING_KEY },
    {
      $set: {
        value: next,
        updatedBy: adminId,
        scope: 'platform',
        description: 'Manual Mobile Money payee details for technician subscription payments',
      },
    },
    { upsert: true },
  );
  await emitCatalogueLive('momo');
  return next;
}

export async function getSubscriptionReminderConfig(): Promise<SubscriptionReminderConfig> {
  const setting = await PlatformSetting.findOne({ key: SUBSCRIPTION_REMINDER_SETTING_KEY });
  return normalizeReminders(setting?.value as Partial<SubscriptionReminderConfig> | undefined);
}

export async function updateSubscriptionReminderConfig(
  adminId: string,
  patch: Partial<SubscriptionReminderConfig>,
): Promise<SubscriptionReminderConfig> {
  const current = await getSubscriptionReminderConfig();
  const next = normalizeReminders({
    ...current,
    ...patch,
    triggers: { ...current.triggers, ...(patch.triggers ?? {}) },
    daysBeforeExpiry: patch.daysBeforeExpiry ?? current.daysBeforeExpiry,
  });
  await PlatformSetting.findOneAndUpdate(
    { key: SUBSCRIPTION_REMINDER_SETTING_KEY },
    {
      $set: {
        value: next,
        updatedBy: adminId,
        scope: 'platform',
        description: 'Technician subscription / free-quota reminder frequency and channels',
      },
    },
    { upsert: true },
  );
  await emitCatalogueLive('reminders');
  return next;
}

async function emitCatalogueLive(reason: string) {
  try {
    emitSubscriptionCatalogueUpdated(reason);
  } catch {
    /* ignore */
  }
}

async function seedPlan(input: {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  isDefault: boolean;
  priceMonthly: number;
  priceQuarterly: number;
  priceYearly: number;
  priceHalfYear?: number;
  currency?: string;
  gracePeriodDays?: number;
  features: string[];
  featureFlags: PlanFeatureFlags;
  limits: PlanLimits;
}): Promise<ISubscriptionPlanDoc> {
  const existing = await SubscriptionPlan.findOne({ code: input.code });
  if (existing) {
    // Phase-3 Business backfill when homepage slides were never configured.
    const needsBusinessPhase3 =
      input.code === 'BUSINESS' &&
      (existing.limits as Partial<PlanLimits>)?.maxHomepageSlides === undefined;

    // Phase-2 one-time backfill: if advertising slides were never configured, refresh
    // Professional recommended defaults (admin can still edit afterwards).
    const needsPhase2Backfill =
      input.code === 'PROFESSIONAL' &&
      (existing.limits as Partial<PlanLimits>)?.maxAdvertisingSlides === undefined;

    if (needsBusinessPhase3 || needsPhase2Backfill) {
      existing.featureFlags = { ...input.featureFlags, ...existing.featureFlags } as PlanFeatureFlags;
      existing.limits = { ...input.limits } as PlanLimits;
      existing.features = input.features;
      existing.description = input.description;
      if (typeof input.priceHalfYear === 'number') existing.priceHalfYear = input.priceHalfYear;
      if (existing.isVisible === undefined) existing.isVisible = true;
      await existing.save();
      return existing;
    }

    // Backfill newly introduced flags/limits only — never overwrite admin-edited prices.
    const nextFlags = { ...input.featureFlags, ...existing.featureFlags } as PlanFeatureFlags;
    const nextLimits = { ...input.limits, ...existing.limits } as PlanLimits;
    for (const key of Object.keys(input.limits) as Array<keyof PlanLimits>) {
      if (existing.limits?.[key] === undefined || existing.limits?.[key] === null) {
        nextLimits[key] = input.limits[key];
      }
    }
    for (const key of Object.keys(input.featureFlags) as Array<keyof PlanFeatureFlags>) {
      if (existing.featureFlags?.[key] === undefined) {
        nextFlags[key] = input.featureFlags[key];
      }
    }
    existing.featureFlags = nextFlags;
    existing.limits = nextLimits;
    if (!existing.features?.length) existing.features = input.features;
    if (!existing.badge?.text && !existing.badge?.name) {
      const code = input.code.toUpperCase() as keyof typeof DEFAULT_PLAN_BADGES;
      existing.badge = { ...(DEFAULT_PLAN_BADGES[code] || DEFAULT_PLAN_BADGES.STARTER) };
    }
    if (existing.priceHalfYear == null && typeof input.priceHalfYear === 'number') {
      existing.priceHalfYear = input.priceHalfYear;
    }
    if (existing.isVisible === undefined) existing.isVisible = true;
    await existing.save();
    return existing;
  }
  return SubscriptionPlan.create({
    code: input.code,
    name: input.name,
    description: input.description,
    audience: 'technician',
    sortOrder: input.sortOrder,
    currency: input.currency || 'UGX',
    priceMonthly: input.priceMonthly,
    priceQuarterly: input.priceQuarterly,
    priceHalfYear: input.priceHalfYear ?? Math.round(input.priceMonthly * 5.5),
    priceYearly: input.priceYearly,
    price: input.priceMonthly,
    billingPeriod: 'monthly',
    gracePeriodDays:
      typeof input.gracePeriodDays === 'number' ? input.gracePeriodDays : 3,
    autoRenew: false,
    features: input.features,
    featureFlags: input.featureFlags,
    limits: input.limits,
    isActive: true,
    isDefault: input.isDefault,
    isVisible: true,
    badge: {
      ...(DEFAULT_PLAN_BADGES[input.code.toUpperCase() as keyof typeof DEFAULT_PLAN_BADGES] ||
        DEFAULT_PLAN_BADGES.STARTER),
    },
  });
}

export async function ensureSubscriptionCatalogue(): Promise<ISubscriptionPlanDoc[]> {
  const billing = await ensureBillingPeriodsSetting();
  await seedPlan({
    code: 'STARTER',
    name: 'Starter',
    description:
      'Continue applying for jobs after your free completed jobs end. Unlimited applications and completed jobs with essential profile tools.',
    sortOrder: 1,
    isDefault: true,
    currency: billing.currency,
    gracePeriodDays: billing.defaultGracePeriodDays,
    ...SEED_PLAN_PRICES.STARTER,
    features: STARTER_FEATURE_LIST,
    featureFlags: { ...DEFAULT_STARTER_FEATURES },
    limits: { ...DEFAULT_STARTER_LIMITS },
  });
  await seedPlan({
    code: 'PROFESSIONAL',
    name: 'Professional',
    description:
      'Grow faster with premium profile branding, advertising slides, more offers, videos, featured visibility, and deeper business analytics.',
    sortOrder: 2,
    isDefault: false,
    currency: billing.currency,
    gracePeriodDays: billing.defaultGracePeriodDays,
    ...SEED_PLAN_PRICES.PROFESSIONAL,
    features: [
      'Everything in Starter',
      'Professional verified badge',
      'Company logo, slogan & custom colours',
      'Unlimited photos · up to 20 videos',
      'Before & after galleries',
      'Up to 4 rotating advertising slides',
      'Up to 5 active promotional offers',
      'Up to 3 advertising banners',
      'Higher search visibility (fair weighting)',
      'Customer insights & advanced earnings',
      'Priority customer support',
    ],
    featureFlags: { ...DEFAULT_PROFESSIONAL_FEATURES },
    limits: { ...DEFAULT_PROFESSIONAL_LIMITS },
  });
  await seedPlan({
    code: 'BUSINESS',
    name: 'Business',
    description:
      'Run your service company inside FixNow — Marketing Centre, homepage advertising, company profile, team-ready tools, and the highest fair search visibility.',
    sortOrder: 3,
    isDefault: false,
    currency: billing.currency,
    gracePeriodDays: billing.defaultGracePeriodDays,
    ...SEED_PLAN_PRICES.BUSINESS,
    features: [
      'Everything in Professional',
      'Verified Business badge',
      'Dedicated Marketing Centre (CMS-style)',
      'Up to 8 homepage advertising slides',
      'Up to 10 active promotional offers',
      'Up to 6 promotional banners',
      'Up to 50 videos · unlimited photos & certificates',
      'Company registration & verification fields',
      'Highest fair search weighting',
      'Team management & dispatch',
      'Lead, advertising & referral analytics',
    ],
    featureFlags: { ...DEFAULT_BUSINESS_FEATURES },
    limits: { ...DEFAULT_BUSINESS_LIMITS },
  });

  // Ensure free-job monetization knows subscriptions are live (only flip false → true once).
  try {
    const { getFreeJobConfig } = await import('./freeJob.service.js');
    const cfg = await getFreeJobConfig();
    if (!cfg.subscriptionEnabled) {
      await updateFreeJobConfigValue('system', { subscriptionEnabled: true });
    }
  } catch {
    /* best-effort */
  }

  // Ensure MoMo + reminder settings exist.
  const momo = await PlatformSetting.findOne({ key: SUBSCRIPTION_MOMO_SETTING_KEY });
  if (!momo) {
    await PlatformSetting.create({
      key: SUBSCRIPTION_MOMO_SETTING_KEY,
      value: { ...DEFAULT_MOMO, currency: billing.currency },
      scope: 'platform',
      description: 'Manual Mobile Money payee details for technician subscription payments',
    });
  }
  const reminders = await PlatformSetting.findOne({ key: SUBSCRIPTION_REMINDER_SETTING_KEY });
  if (!reminders) {
    await PlatformSetting.create({
      key: SUBSCRIPTION_REMINDER_SETTING_KEY,
      value: DEFAULT_REMINDERS,
      scope: 'platform',
      description: 'Technician subscription / free-quota reminder frequency and channels',
    });
  }
  const discovery = await PlatformSetting.findOne({ key: SUBSCRIPTION_DISCOVERY_SETTING_KEY });
  if (!discovery) {
    await PlatformSetting.create({
      key: SUBSCRIPTION_DISCOVERY_SETTING_KEY,
      value: DEFAULT_DISCOVERY,
      scope: 'platform',
      description: 'Technician upgrade discovery / catalogue presentation',
    });
  }

  return SubscriptionPlan.find({ audience: 'technician', deletedAt: null }).sort({ sortOrder: 1 });
}

export async function listPublicPlans() {
  await ensureSubscriptionCatalogue();
  const discovery = await getSubscriptionDiscoveryConfig();
  const periods = await getBillingPeriodsConfig();
  const plans = await SubscriptionPlan.find({
    audience: 'technician',
    isActive: true,
    deletedAt: null,
    $or: [{ isVisible: true }, { isVisible: { $exists: false } }],
  }).sort({ sortOrder: 1 });
  const momo = await getSubscriptionMomoConfig();
  const serialized = plans.map((p) => serializePlan(p, periods));
  const catalogue = discovery.showFreePlan ? [buildFreePlanCard(periods), ...serialized] : serialized;
  return {
    discovery,
    billingPeriods: periods,
    plans: catalogue,
    comparison: buildComparisonRows(serialized, discovery.showFreePlan),
    payment: momo,
    starter: serializePlan(plans.find((p) => p.code === 'STARTER') || plans[0], periods),
    professional: plans.find((p) => p.code === 'PROFESSIONAL')
      ? serializePlan(plans.find((p) => p.code === 'PROFESSIONAL')!, periods)
      : null,
    business: plans.find((p) => p.code === 'BUSINESS')
      ? serializePlan(plans.find((p) => p.code === 'BUSINESS')!, periods)
      : null,
    free: discovery.showFreePlan ? buildFreePlanCard(periods) : null,
  };
}

export async function getPublicPlanDetail(code: string) {
  await ensureSubscriptionCatalogue();
  const discovery = await getSubscriptionDiscoveryConfig();
  const periods = await getBillingPeriodsConfig();
  const normalized = String(code || '').toUpperCase();
  if (normalized === 'FREE') {
    if (!discovery.showFreePlan) throw AppError.notFound('Plan not found');
    return { discovery, billingPeriods: periods, plan: buildPlanDetail(buildFreePlanCard(periods) as never) };
  }
  const plan = await SubscriptionPlan.findOne({
    code: normalized,
    audience: 'technician',
    isActive: true,
    deletedAt: null,
    $or: [{ isVisible: true }, { isVisible: { $exists: false } }],
  });
  if (!plan) throw AppError.notFound('Plan not found');
  return { discovery, billingPeriods: periods, plan: buildPlanDetail(serializePlan(plan, periods)) };
}

export async function listAdminPlans() {
  await ensureSubscriptionCatalogue();
  const periods = await getBillingPeriodsConfig();
  const plans = await SubscriptionPlan.find({ deletedAt: null }).sort({ sortOrder: 1 });
  return {
    plans: plans.map((p) => serializePlan(p, periods)),
    featureMatrix: buildFeatureMatrix(plans),
    momo: await getSubscriptionMomoConfig(),
    reminders: await getSubscriptionReminderConfig(),
    discovery: await getSubscriptionDiscoveryConfig(),
    billingPeriods: periods,
  };
}

function buildFeatureMatrix(plans: ISubscriptionPlanDoc[]) {
  const codes = ['STARTER', 'PROFESSIONAL', 'BUSINESS'] as const;
  const byCode = Object.fromEntries(plans.map((p) => [p.code, p]));
  const flagKeys = Object.keys(DEFAULT_STARTER_FEATURES) as Array<keyof PlanFeatureFlags>;
  const limitKeys = Object.keys(DEFAULT_STARTER_LIMITS) as Array<keyof PlanLimits>;

  return {
    flags: flagKeys.map((key) => ({
      feature: key,
      starter: Boolean(byCode.STARTER?.featureFlags?.[key]),
      professional: Boolean(byCode.PROFESSIONAL?.featureFlags?.[key]),
      business: Boolean(byCode.BUSINESS?.featureFlags?.[key]),
    })),
    limits: limitKeys.map((key) => ({
      feature: key,
      starter: Number(byCode.STARTER?.limits?.[key] ?? 0),
      professional: Number(byCode.PROFESSIONAL?.limits?.[key] ?? 0),
      business: Number(byCode.BUSINESS?.limits?.[key] ?? 0),
    })),
    plans: codes.map((code) => (byCode[code] ? serializePlan(byCode[code]) : null)).filter(Boolean),
  };
}

export async function updatePlan(
  adminId: string,
  planId: string,
  patch: Partial<{
    name: string;
    description: string;
    currency: string;
    priceMonthly: number;
    priceQuarterly: number;
    priceHalfYear: number;
    priceYearly: number;
    gracePeriodDays: number;
    autoRenew: boolean;
    features: string[];
    featureFlags: Partial<PlanFeatureFlags>;
    limits: Partial<PlanLimits>;
    isActive: boolean;
    isDefault: boolean;
    isVisible: boolean;
    sortOrder: number;
    badge: Partial<PlanBadgeConfig>;
  }>,
) {
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) throw AppError.notFound('Subscription plan not found');

  if (typeof patch.name === 'string') plan.name = patch.name.slice(0, 120);
  if (typeof patch.description === 'string') plan.description = patch.description.slice(0, 4000);
  if (typeof patch.currency === 'string') plan.currency = patch.currency.toUpperCase().slice(0, 3);
  if (typeof patch.priceMonthly === 'number') {
    plan.priceMonthly = Math.max(0, patch.priceMonthly);
    plan.price = plan.priceMonthly;
  }
  if (typeof patch.priceQuarterly === 'number') plan.priceQuarterly = Math.max(0, patch.priceQuarterly);
  if (typeof patch.priceHalfYear === 'number') plan.priceHalfYear = Math.max(0, patch.priceHalfYear);
  if (typeof patch.priceYearly === 'number') plan.priceYearly = Math.max(0, patch.priceYearly);
  if (typeof patch.gracePeriodDays === 'number') {
    plan.gracePeriodDays = Math.min(90, Math.max(0, patch.gracePeriodDays));
  }
  if (typeof patch.autoRenew === 'boolean') plan.autoRenew = patch.autoRenew;
  if (Array.isArray(patch.features)) plan.features = patch.features.map(String).slice(0, 100);
  if (patch.featureFlags) {
    plan.featureFlags = { ...plan.featureFlags, ...patch.featureFlags } as PlanFeatureFlags;
  }
  if (patch.limits) {
    plan.limits = { ...plan.limits, ...patch.limits } as PlanLimits;
  }
  if (typeof patch.isActive === 'boolean') plan.isActive = patch.isActive;
  if (typeof patch.isVisible === 'boolean') plan.isVisible = patch.isVisible;
  if (typeof patch.sortOrder === 'number') plan.sortOrder = patch.sortOrder;
  if (patch.badge && typeof patch.badge === 'object') {
    plan.badge = {
      ...(plan.badge || DEFAULT_PLAN_BADGES.STARTER),
      ...patch.badge,
    } as PlanBadgeConfig;
  }
  if (patch.isDefault === true) {
    await SubscriptionPlan.updateMany({ _id: { $ne: plan._id } }, { $set: { isDefault: false } });
    plan.isDefault = true;
  }

  await plan.save();
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'subscription.plan_updated',
    resourceType: 'SubscriptionPlan',
    resourceId: plan._id.toString(),
    meta: { code: plan.code },
  });

  await emitCatalogueLive(`plan:${plan.code}`);

  // Notify active subscribers on this plan that benefits/config changed (capped).
  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    const subscribers = await TechnicianProfile.find({
      subscriptionPlanCode: plan.code,
      subscriptionStatus: { $in: ['active', 'trialing', 'past_due'] },
    })
      .select('userId')
      .limit(200)
      .lean();
    for (const row of subscribers) {
      await createDbNotification({
        userId: row.userId.toString(),
        type: 'technician.subscription_plan_updated',
        title: `${plan.name} plan updated`,
        body: `FixNow Admin updated the ${plan.name} plan. Open Subscription Centre to review your current benefits.`,
        href: '/technician/subscription',
        meta: { planCode: plan.code },
      });
    }
  } catch {
    /* ignore */
  }

  const periods = await getBillingPeriodsConfig();
  return serializePlan(plan, periods);
}

function buildPaymentReference(userId: string, format: string): string {
  const short = userId.slice(-5).toUpperCase();
  return format.replace('{userSeq}', short).replace('{userId}', short);
}

export async function getMine(userId: string) {
  await ensureSubscriptionCatalogue();
  const [profile, sub, payments, plans, momo, reminders, periods] = await Promise.all([
    TechnicianProfile.findOne({ userId }),
    Subscription.findOne({ userId, deletedAt: null }).sort({ updatedAt: -1 }),
    SubscriptionPayment.find({ userId, deletedAt: null }).sort({ createdAt: -1 }).limit(20),
    SubscriptionPlan.find({ audience: 'technician', isActive: true, deletedAt: null }).sort({
      sortOrder: 1,
    }),
    getSubscriptionMomoConfig(),
    getSubscriptionReminderConfig(),
    getBillingPeriodsConfig(),
  ]);

  const { resolveEntitlements, serializeEntitlements } = await import('./entitlements.service.js');
  const entitlementsResolved = await resolveEntitlements(userId);
  // Prefer entitlement engine (includes Developer Preview) — never recompute paid from profile alone.
  const active = entitlementsResolved.hasPaidAccess;
  const periodEnd =
    entitlementsResolved.subscriptionSource === 'developer_preview'
      ? entitlementsResolved.subscriptionPeriodEnd
      : profile?.subscriptionPeriodEnd ?? sub?.currentPeriodEnd ?? null;
  const daysRemaining =
    periodEnd && active
      ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  const starter = plans.find((p) => p.code === 'STARTER') || plans[0];
  const professional = plans.find((p) => p.code === 'PROFESSIONAL') || null;
  const business = plans.find((p) => p.code === 'BUSINESS') || null;
  const serializedEnt = serializeEntitlements(entitlementsResolved);
  const inPreview = entitlementsResolved.subscriptionSource === 'developer_preview';
  const schedule = inPreview ? null : serializeSchedule(sub);
  const lastApprovedPayment = payments.find((p) => p.status === 'approved');
  const subscriptionSource = inPreview
    ? null
    : lastApprovedPayment?.verificationSource === 'development_transaction'
      ? 'development_transaction'
      : lastApprovedPayment
        ? 'mobile_money'
        : sub?.complimentary
          ? 'complimentary'
          : null;

  const displayStatus = inPreview
    ? 'preview'
    : schedule?.type === 'cancel'
      ? 'expiring'
      : schedule?.type === 'downgrade'
        ? 'scheduled_change'
        : entitlementsResolved.hasPaidAccess
          ? 'active'
          : String(profile?.subscriptionStatus || 'none');

  return {
    subscription: inPreview
      ? null
      : sub
        ? {
            id: sub._id.toString(),
            planCode: sub.planCode,
            status: sub.status,
            billingPeriod: sub.billingPeriod,
            amountPaid: sub.amountPaid,
            currency: sub.currency,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            complimentary: sub.complimentary,
            activatedAt: sub.activatedAt,
            cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
            scheduledPlanCode: sub.scheduledPlanCode || null,
            scheduledChangeType: sub.scheduledChangeType || null,
            scheduledChangeAt: sub.scheduledChangeAt || null,
            autoRenew: false,
            source: subscriptionSource,
          }
        : null,
    schedule,
    currentSubscription: inPreview
      ? null
      : {
          planCode: profile?.subscriptionPlanCode || sub?.planCode || null,
          planName:
            entitlementsResolved.planName ||
            plans.find((p) => p.code === (profile?.subscriptionPlanCode || sub?.planCode))?.name ||
            null,
          status: displayStatus,
          activatedOn: sub?.activatedAt || sub?.currentPeriodStart || null,
          expiresOn: periodEnd,
          nextScheduledPlanCode: schedule?.type === 'downgrade' ? schedule.planCode : null,
          nextScheduledAction: schedule?.type || null,
          nextScheduledAt: schedule?.effectiveAt || null,
          autoRenew: false,
          willNotRenew: Boolean(schedule?.type === 'cancel' || sub?.cancelAtPeriodEnd),
          source: subscriptionSource,
        },
    profile: {
      subscriptionPlanCode: inPreview
        ? entitlementsResolved.planCode
        : profile?.subscriptionPlanCode ?? null,
      subscriptionStatus: inPreview ? 'preview' : profile?.subscriptionStatus ?? 'none',
      subscriptionPeriodEnd: periodEnd,
      subscriptionBillingPeriod: profile?.subscriptionBillingPeriod ?? null,
      remainingFreeJobs: profile?.remainingFreeJobs ?? 0,
      freeJobLimit: profile?.freeJobLimit ?? 0,
      freeJobsUsed: profile?.freeJobsUsed ?? 0,
      trialFinished: Boolean(profile?.trialFinished),
      accountLocked: Boolean(profile?.accountLocked),
      companyName: profile?.companyName ?? null,
      businessLogoUrl: profile?.businessLogoUrl ?? null,
      businessSlogan: profile?.businessSlogan ?? null,
      brandPrimaryColor: profile?.brandPrimaryColor ?? null,
      brandSecondaryColor: profile?.brandSecondaryColor ?? null,
    },
    entitlements: {
      ...serializedEnt,
      canApply: entitlementsResolved.capabilities.canApply || Number(profile?.remainingFreeJobs ?? 0) > 0,
      hasActiveSubscription: active,
      unlimitedCompletedJobs: active && Boolean(entitlementsResolved.featureFlags.unlimitedCompletedJobs),
      daysRemaining,
    },
    timeline: inPreview
      ? {
          startedAt: entitlementsResolved.preview?.expiresAt
            ? null
            : null,
          activatedAt: null,
          expiresAt: periodEnd,
          remainingDays: daysRemaining,
          lifecycleStatus: 'active',
          inGracePeriod: false,
          gracePeriodDays: 0,
          simulationOnly: true,
          subscriptionSource: 'developer_preview',
        }
      : {
          startedAt: sub?.createdAt || null,
          activatedAt: sub?.activatedAt || null,
          expiresAt: periodEnd,
          remainingDays: daysRemaining,
          lifecycleStatus: entitlementsResolved.lifecycleStatus,
          inGracePeriod: entitlementsResolved.inGracePeriod,
          gracePeriodDays: entitlementsResolved.gracePeriodDays,
        },
    badge: entitlementsResolved.badge,
    billingPeriods: periods,
    plans: plans.map((p) => serializePlan(p, periods)),
    starter: starter ? serializePlan(starter, periods) : null,
    professional: professional ? serializePlan(professional, periods) : null,
    business: business ? serializePlan(business, periods) : null,
    payment: momo,
    // Hide billing artefacts while preview is active — production payment docs untouched.
    payments: inPreview
      ? []
      : payments.map((p) => ({
          id: p._id.toString(),
          planCode: p.planCode,
          billingPeriod: p.billingPeriod,
          amount: p.amount,
          currency: p.currency,
          network: p.network,
          payerMsisdn: p.payerMsisdn,
          transactionId: p.transactionId,
          paymentReference: p.paymentReference,
          screenshotUrl: p.screenshotUrl,
          status: p.status,
          reviewNote: p.reviewNote,
          createdAt: p.createdAt,
          reviewedAt: p.reviewedAt,
        })),
    reminders: inPreview
      ? { ...reminders, enabled: false, note: 'Billing reminders disabled during Developer Preview' }
      : reminders,
    pendingPayment: inPreview
      ? null
      : payments.find((p) => p.status === 'pending')
        ? {
            id: payments.find((p) => p.status === 'pending')!._id.toString(),
            status: 'pending' as const,
            message: 'Payment pending verification. You will regain applications after FixNow approves.',
          }
        : null,
    developmentTransaction: await (async () => {
      try {
        const { listAvailableForTechnician } = await import(
          '../sandbox/seed/developmentTransaction.service.js'
        );
        return listAvailableForTechnician(userId);
      } catch {
        return { enabled: false, reason: 'unavailable', items: [] };
      }
    })(),
  };
}

export async function submitPayment(
  userId: string,
  input: {
    planCode?: string;
    billingPeriod?: BillingPeriod;
    network: 'mtn' | 'airtel';
    payerMsisdn: string;
    transactionId: string;
    amount?: number;
    screenshotUrl?: string;
  },
) {
  const { getActivePreviewSession } = await import('./developerPreview.service.js');
  if (await getActivePreviewSession(userId)) {
    throw AppError.badRequest(
      'Subscription payments are disabled during Developer Preview. Exit Preview to submit a real payment — Preview never creates payment records.',
    );
  }
  await ensureSubscriptionCatalogue();
  const discovery = await getSubscriptionDiscoveryConfig();
  if (!discovery.upgradesEnabled) {
    throw AppError.badRequest('Subscription upgrades are temporarily unavailable');
  }

  const transactionId = String(input.transactionId || '')
    .trim()
    .toUpperCase()
    .slice(0, 120);
  if (transactionId.length < 4) throw AppError.badRequest('Enter a valid transaction ID');

  const {
    isDevTransactionCode,
    isPermanentDevelopmentTechnician,
    isDevelopmentTransactionVerificationEnabled,
    claimDevelopmentTransaction,
    markDevelopmentTransactionConsumed,
  } = await import('../sandbox/seed/developmentTransaction.service.js');

  const isDevTx = isDevTransactionCode(transactionId);
  const isDevTech = await isPermanentDevelopmentTechnician(userId);

  // Production technicians must never use Development Transaction IDs.
  if (isDevTx && !isDevTech) {
    throw AppError.forbidden(
      'Development Transaction IDs can only be used by the Permanent Development Technician',
    );
  }

  // Production Mode immediately disables Development Transaction verification.
  if (isDevTx) {
    const gate = await isDevelopmentTransactionVerificationEnabled(userId);
    if (!gate.enabled) {
      throw AppError.forbidden(gate.reason || 'Development Transaction verification is unavailable');
    }
  }

  const momo = await getSubscriptionMomoConfig();
  if (!isDevTx && !momo.enabled) {
    throw AppError.badRequest('Subscription payments are temporarily unavailable');
  }

  const planCode = (input.planCode || 'STARTER').toUpperCase();
  if (planCode === 'FREE') throw AppError.badRequest('Free plan does not require payment');
  const plan = await SubscriptionPlan.findOne({ code: planCode, isActive: true, deletedAt: null });
  if (!plan) throw AppError.notFound('Plan not found');
  if (plan.isVisible === false) throw AppError.badRequest('This plan is not available for purchase');

  const billingPeriod: BillingPeriod = input.billingPeriod || 'monthly';
  const expectedAmount = priceFor(plan, billingPeriod);
  const amount = typeof input.amount === 'number' ? input.amount : expectedAmount;
  if (amount <= 0) throw AppError.badRequest('Invalid payment amount');
  if (Math.abs(amount - expectedAmount) > 1) {
    throw AppError.badRequest(`Amount must be ${plan.currency} ${expectedAmount.toLocaleString()} for ${billingPeriod} billing`);
  }

  let payerMsisdn = String(input.payerMsisdn || '').replace(/\s+/g, '').slice(0, 20);
  if (isDevTx && payerMsisdn.length < 9) {
    payerMsisdn = '256700000000';
  }
  if (payerMsisdn.length < 9) throw AppError.badRequest('Enter the phone number used to pay');

  const network = isDevTx ? 'mtn' : input.network;

  if (isDevTx) {
    await claimDevelopmentTransaction({ userId, code: transactionId, planCode: plan.code });
  }

  const existingTx = await SubscriptionPayment.findOne({
    transactionId,
    network,
    deletedAt: null,
  });
  if (existingTx) throw AppError.conflict('This transaction ID was already submitted');

  const pending = await SubscriptionPayment.findOne({
    userId,
    status: 'pending',
    deletedAt: null,
  });
  if (pending) {
    throw AppError.badRequest(
      'You already have a payment pending verification. Wait for approval or contact support.',
    );
  }

  const paymentReference = isDevTx
    ? `DEV-TX-${plan.code}`
    : buildPaymentReference(userId, momo.referenceFormat);

  let subscription = await Subscription.findOne({
    userId,
    planCode: plan.code,
    status: { $in: ['pending_payment', 'expired', 'cancelled', 'past_due'] },
    deletedAt: null,
  }).sort({ updatedAt: -1 });

  if (!subscription) {
    subscription = await Subscription.create({
      userId,
      planId: plan._id,
      planCode: plan.code,
      status: 'pending_payment',
      billingPeriod,
      amountPaid: amount,
      currency: plan.currency,
      cancelAtPeriodEnd: false,
      complimentary: false,
    });
  } else {
    subscription.status = 'pending_payment';
    subscription.billingPeriod = billingPeriod;
    subscription.amountPaid = amount;
    subscription.currency = plan.currency;
    await subscription.save();
  }

  const payment = await SubscriptionPayment.create({
    userId,
    planId: plan._id,
    planCode: plan.code,
    subscriptionId: subscription._id,
    billingPeriod,
    amount,
    currency: plan.currency,
    network,
    payerMsisdn,
    transactionId,
    screenshotUrl: input.screenshotUrl?.slice(0, 1024),
    paymentReference,
    status: 'pending',
    verificationSource: isDevTx ? 'development_transaction' : 'momo_manual',
  });

  subscription.lastPaymentId = payment._id;
  await subscription.save();

  await TechnicianProfile.updateOne(
    { userId },
    {
      $set: {
        subscriptionStatus: 'pending_payment',
        subscriptionPlanCode: plan.code,
        subscriptionBillingPeriod: billingPeriod,
      },
    },
  );

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: isDevTx ? 'subscription.development_transaction_submitted' : 'subscription.payment_submitted',
    resourceType: 'SubscriptionPayment',
    resourceId: payment._id.toString(),
    meta: {
      planCode: plan.code,
      amount,
      network,
      verificationSource: isDevTx ? 'development_transaction' : 'momo_manual',
    },
  });

  // Development Transaction path: automatic verification via the same activator.
  if (isDevTx) {
    const approved = await approvePayment(
      userId,
      payment._id.toString(),
      'Auto-verified Development Transaction ID — same entitlement engine',
    );
    await markDevelopmentTransactionConsumed({
      code: transactionId,
      userId,
      paymentId: payment._id.toString(),
      subscriptionId: approved.subscription?.id,
    });
    return {
      payment: {
        id: payment._id.toString(),
        status: 'approved',
        paymentReference,
        amount,
        currency: plan.currency,
        network,
        transactionId,
        verificationSource: 'development_transaction' as const,
      },
      subscription: approved.subscription,
      message: `${plan.name} activated for testing`,
      autoVerified: true,
    };
  }

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId,
      type: 'technician.subscription_payment_submitted',
      title: 'Payment submitted',
      body: 'Your payment is pending verification. You will be notified when it is approved.',
      bypassQuietHours: true,
    });
    const { notifyAdmins } = await import('../push/push.service.js');
    await notifyAdmins({
      type: 'subscription.payment_pending',
      title: 'Subscription payment pending',
      body: `Technician submitted ${plan.currency} ${amount.toLocaleString()} (${plan.code}).`,
      data: { userId, paymentId: payment._id.toString() },
      bypassQuietHours: true,
    });
  } catch {
    /* best-effort */
  }

  return {
    payment: {
      id: payment._id.toString(),
      status: payment.status,
      paymentReference: payment.paymentReference,
      amount: payment.amount,
      currency: payment.currency,
      network: payment.network,
      transactionId: payment.transactionId,
      verificationSource: 'momo_manual' as const,
    },
    message: 'Payment Pending Verification',
    autoVerified: false,
  };
}

async function activateSubscriptionForUser(input: {
  userId: string;
  plan: ISubscriptionPlanDoc;
  billingPeriod: BillingPeriod;
  amount: number;
  adminId: string;
  complimentary?: boolean;
  monthsOverride?: number;
  paymentId?: string;
  note?: string;
}) {
  const start = new Date();
  const days =
    typeof input.monthsOverride === 'number' && input.monthsOverride > 0
      ? Math.round(input.monthsOverride * (await resolvePeriodDays('monthly')))
      : await resolvePeriodDays(input.billingPeriod);
  // Period end is paid time only — grace is applied separately at expiry / entitlement checks.
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  let subscription = await Subscription.findOne({
    userId: input.userId,
    deletedAt: null,
  }).sort({ updatedAt: -1 });

  if (!subscription) {
    subscription = await Subscription.create({
      userId: input.userId,
      planId: input.plan._id,
      planCode: input.plan.code,
      status: 'active',
      billingPeriod: input.billingPeriod,
      amountPaid: input.amount,
      currency: input.plan.currency,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      activatedAt: start,
      activatedBy: input.adminId,
      complimentary: Boolean(input.complimentary),
      notes: input.note,
      lastPaymentId: input.paymentId,
      cancelAtPeriodEnd: false,
      scheduledPlanCode: null,
      scheduledChangeAt: null,
      scheduledAt: null,
    });
  } else {
    subscription.planId = input.plan._id;
    subscription.planCode = input.plan.code;
    subscription.status = 'active';
    subscription.billingPeriod = input.billingPeriod;
    subscription.amountPaid = input.amount;
    subscription.currency = input.plan.currency;
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    subscription.activatedAt = start;
    subscription.activatedBy = input.adminId as unknown as typeof subscription.activatedBy;
    subscription.complimentary = Boolean(input.complimentary);
    if (input.note) subscription.notes = input.note;
    if (input.paymentId) subscription.lastPaymentId = input.paymentId as unknown as typeof subscription.lastPaymentId;
    clearSubscriptionScheduleFields(subscription);
    await subscription.save();
  }

  const profile = await TechnicianProfile.findOneAndUpdate(
    { userId: input.userId },
    {
      $set: {
        subscriptionPlanCode: input.plan.code,
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: end,
        subscriptionBillingPeriod: input.billingPeriod,
        accountLocked: false,
        lockReason: undefined,
        unlockRequestedAt: undefined,
        unlockRequestNote: undefined,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      },
    },
    { new: true },
  );

  await User.updateOne(
    { _id: input.userId },
    {
      $set: {
        subscriptionPlanCode: input.plan.code,
        subscriptionStatus: 'active',
      },
    },
  );

  if (profile) {
    emitFreeJobLimitUpdated(input.userId, profile);
    emitTechnicianUnlocked(input.userId, profile);
  }

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId: input.userId,
      type: 'technician.subscription_activated',
      title: `${input.plan.name} activated`,
      body: `Your ${input.plan.name} plan is active until ${end.toLocaleDateString()}. You can apply for jobs again.`,
      bypassQuietHours: true,
    });
  } catch {
    /* ignore */
  }

  return { subscription, profile, periodEnd: end };
}

export async function approvePayment(adminId: string, paymentId: string, note?: string) {
  const payment = await SubscriptionPayment.findById(paymentId);
  if (!payment) throw AppError.notFound('Payment not found');
  if (payment.status !== 'pending') throw AppError.badRequest('Payment is not pending');

  const plan = await SubscriptionPlan.findById(payment.planId);
  if (!plan) throw AppError.notFound('Plan not found');

  payment.status = 'approved';
  payment.reviewedBy = adminId as unknown as typeof payment.reviewedBy;
  payment.reviewedAt = new Date();
  payment.reviewNote = note?.slice(0, 1000);
  await payment.save();

  const result = await activateSubscriptionForUser({
    userId: payment.userId.toString(),
    plan,
    billingPeriod: payment.billingPeriod,
    amount: payment.amount,
    adminId,
    paymentId: payment._id.toString(),
    note,
  });

  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'subscription.payment_approved',
    resourceType: 'SubscriptionPayment',
    resourceId: paymentId,
    meta: { userId: payment.userId.toString(), planCode: plan.code },
  });

  return {
    payment: { id: payment._id.toString(), status: payment.status },
    subscription: {
      id: result.subscription._id.toString(),
      status: result.subscription.status,
      currentPeriodEnd: result.periodEnd,
    },
  };
}

export async function rejectPayment(adminId: string, paymentId: string, note?: string) {
  const payment = await SubscriptionPayment.findById(paymentId);
  if (!payment) throw AppError.notFound('Payment not found');
  if (payment.status !== 'pending') throw AppError.badRequest('Payment is not pending');

  payment.status = 'rejected';
  payment.reviewedBy = adminId as unknown as typeof payment.reviewedBy;
  payment.reviewedAt = new Date();
  payment.reviewNote = note?.slice(0, 1000) || 'Payment rejected';
  await payment.save();

  if (payment.subscriptionId) {
    await Subscription.updateOne(
      { _id: payment.subscriptionId },
      { $set: { status: 'cancelled', cancelledAt: new Date(), notes: payment.reviewNote } },
    );
  }

  await TechnicianProfile.updateOne(
    { userId: payment.userId },
    {
      $set: {
        subscriptionStatus: 'required',
      },
    },
  );

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId: payment.userId.toString(),
      type: 'technician.subscription_rejected',
      title: 'Subscription payment rejected',
      body:
        note?.slice(0, 200) ||
        'Your payment could not be verified. Please check the details and submit again, or contact support.',
      bypassQuietHours: true,
    });
  } catch {
    /* ignore */
  }

  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'subscription.payment_rejected',
    resourceType: 'SubscriptionPayment',
    resourceId: paymentId,
    meta: { userId: payment.userId.toString(), note },
  });

  return { payment: { id: payment._id.toString(), status: payment.status } };
}

export async function listAdminPayments(query: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const filter: Record<string, unknown> = { deletedAt: null };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    SubscriptionPayment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SubscriptionPayment.countDocuments(filter),
  ]);

  const userIds = [...new Set(items.map((i) => i.userId.toString()))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('fullName phone email')
    .lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  return {
    items: items.map((p) => ({
      id: p._id.toString(),
      userId: p.userId.toString(),
      technician: userMap[p.userId.toString()]
        ? {
            name: userMap[p.userId.toString()].fullName,
            phone: userMap[p.userId.toString()].phone,
            email: userMap[p.userId.toString()].email,
          }
        : null,
      planCode: p.planCode,
      billingPeriod: p.billingPeriod,
      amount: p.amount,
      currency: p.currency,
      network: p.network,
      payerMsisdn: p.payerMsisdn,
      transactionId: p.transactionId,
      paymentReference: p.paymentReference,
      screenshotUrl: p.screenshotUrl,
      status: p.status,
      reviewNote: p.reviewNote,
      createdAt: p.createdAt,
      reviewedAt: p.reviewedAt,
    })),
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function listAdminSubscriptions(query: { status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const filter: Record<string, unknown> = { deletedAt: null };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Subscription.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Subscription.countDocuments(filter),
  ]);

  const userIds = [...new Set(items.map((i) => i.userId.toString()))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('fullName phone email')
    .lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  return {
    items: items.map((s) => ({
      id: s._id.toString(),
      userId: s.userId.toString(),
      technician: userMap[s.userId.toString()]
        ? {
            name: userMap[s.userId.toString()].fullName,
            phone: userMap[s.userId.toString()].phone,
            email: userMap[s.userId.toString()].email,
          }
        : null,
      planCode: s.planCode,
      status: s.status,
      billingPeriod: s.billingPeriod,
      amountPaid: s.amountPaid,
      currency: s.currency,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      complimentary: s.complimentary,
      notes: s.notes,
      activatedAt: s.activatedAt,
    })),
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function adminManageSubscription(
  adminId: string,
  userId: string,
  action:
    | 'suspend'
    | 'deactivate'
    | 'extend'
    | 'change_expiry'
    | 'refund'
    | 'reset'
    | 'grant_complimentary'
    | 'activate',
  opts: {
    days?: number;
    months?: number;
    expiry?: string;
    note?: string;
    planCode?: string;
    billingPeriod?: BillingPeriod;
  } = {},
) {
  const profile = await TechnicianProfile.findOne({ userId });
  if (!profile) throw AppError.notFound('Technician profile not found');
  const subscription = await Subscription.findOne({ userId, deletedAt: null }).sort({ updatedAt: -1 });

  if (action === 'suspend' || action === 'deactivate') {
    if (subscription) {
      subscription.status = action === 'suspend' ? 'past_due' : 'cancelled';
      subscription.cancelledAt = new Date();
      subscription.notes = opts.note || subscription.notes;
      await subscription.save();
    }
    profile.subscriptionStatus = action === 'suspend' ? 'past_due' : 'cancelled';
    if (Number(profile.remainingFreeJobs) <= 0) {
      profile.accountLocked = true;
      profile.lockReason = 'Subscription inactive — free completed jobs exhausted';
      if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
        profile.accountStatus = ACCOUNT_STATUS.LOCKED;
      }
    }
    await profile.save();
    emitFreeJobLimitUpdated(userId, profile);
  } else if (action === 'extend') {
    const days = Math.max(1, opts.days || (opts.months || 1) * 30);
    const base = profile.subscriptionPeriodEnd && profile.subscriptionPeriodEnd > new Date()
      ? profile.subscriptionPeriodEnd
      : new Date();
    const end = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    profile.subscriptionPeriodEnd = end;
    profile.subscriptionStatus = 'active';
    profile.accountLocked = false;
    profile.lockReason = undefined;
    if (profile.accountStatus === ACCOUNT_STATUS.LOCKED) profile.accountStatus = ACCOUNT_STATUS.ACTIVE;
    await profile.save();
    if (subscription) {
      subscription.status = 'active';
      subscription.currentPeriodEnd = end;
      await subscription.save();
    }
    emitTechnicianUnlocked(userId, profile);
    emitFreeJobLimitUpdated(userId, profile);
  } else if (action === 'change_expiry') {
    if (!opts.expiry) throw AppError.badRequest('expiry required');
    const end = new Date(opts.expiry);
    if (Number.isNaN(end.getTime())) throw AppError.badRequest('Invalid expiry date');
    profile.subscriptionPeriodEnd = end;
    profile.subscriptionStatus = end.getTime() > Date.now() ? 'active' : 'expired';
    await profile.save();
    if (subscription) {
      subscription.currentPeriodEnd = end;
      subscription.status = profile.subscriptionStatus === 'active' ? 'active' : 'expired';
      await subscription.save();
    }
    emitFreeJobLimitUpdated(userId, profile);
  } else if (action === 'refund') {
    const payment = await SubscriptionPayment.findOne({
      userId,
      status: 'approved',
      deletedAt: null,
    }).sort({ reviewedAt: -1 });
    if (payment) {
      payment.status = 'refunded';
      payment.reviewNote = opts.note || 'Refunded by admin';
      payment.reviewedBy = adminId as unknown as typeof payment.reviewedBy;
      payment.reviewedAt = new Date();
      await payment.save();
    }
    profile.subscriptionStatus = 'cancelled';
    if (subscription) {
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
      subscription.notes = opts.note || 'Refunded';
      await subscription.save();
    }
    if (Number(profile.remainingFreeJobs) <= 0) {
      profile.accountLocked = true;
      profile.lockReason = 'Subscription refunded';
    }
    await profile.save();
    emitFreeJobLimitUpdated(userId, profile);
  } else if (action === 'reset') {
    profile.subscriptionStatus = 'none';
    profile.subscriptionPlanCode = undefined;
    profile.subscriptionPeriodEnd = undefined;
    profile.subscriptionBillingPeriod = undefined;
    await profile.save();
    if (subscription) {
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
      await subscription.save();
    }
    emitFreeJobLimitUpdated(userId, profile);
  } else if (action === 'grant_complimentary' || action === 'activate') {
    await ensureSubscriptionCatalogue();
    const planCode = (opts.planCode || profile.subscriptionPlanCode || 'STARTER').toUpperCase();
    const plan = await SubscriptionPlan.findOne({ code: planCode, deletedAt: null });
    if (!plan) throw AppError.notFound('Plan not found');
    await activateSubscriptionForUser({
      userId,
      plan,
      billingPeriod: opts.billingPeriod || 'monthly',
      amount: 0,
      adminId,
      complimentary: action === 'grant_complimentary',
      monthsOverride: opts.months || 1,
      note: opts.note || (action === 'grant_complimentary' ? 'Complimentary grant' : 'Admin activation'),
    });
  }

  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: `subscription.${action}`,
    resourceType: 'User',
    resourceId: userId,
    meta: opts,
  });

  return getMine(userId);
}

/** Expire subscriptions past period end + grace — call from scheduler or on read.
 * Applies scheduled downgrade/cancel at period end before grace expiry path.
 */
export async function expireDueSubscriptions(): Promise<number> {
  const now = new Date();
  const candidates = await TechnicianProfile.find({
    subscriptionStatus: { $in: ['active', 'trialing', 'past_due'] },
    subscriptionPeriodEnd: { $lte: now },
  }).limit(200);

  let count = 0;
  for (const profile of candidates) {
    const userId = profile.userId.toString();
    const sub = await Subscription.findOne({
      userId: profile.userId,
      deletedAt: null,
      status: { $in: ['active', 'trialing', 'past_due'] },
    }).sort({ updatedAt: -1 });

    const scheduledCancel = Boolean(sub?.cancelAtPeriodEnd || sub?.scheduledChangeType === 'cancel');
    const scheduledDowngrade =
      sub?.scheduledChangeType === 'downgrade' && Boolean(sub.scheduledPlanCode);

    // Scheduled transitions apply at period end — do not keep paid benefits in grace.
    if (scheduledCancel && sub) {
      await applyScheduledCancel(userId, profile);
      count += 1;
      continue;
    }
    if (scheduledDowngrade && sub) {
      const billingPeriod = (profile.subscriptionBillingPeriod ||
        sub.billingPeriod ||
        'monthly') as BillingPeriod;
      await applyScheduledDowngrade(userId, profile, String(sub.scheduledPlanCode), billingPeriod);
      count += 1;
      continue;
    }

    const plan = profile.subscriptionPlanCode
      ? await SubscriptionPlan.findOne({ code: String(profile.subscriptionPlanCode).toUpperCase() }).lean()
      : null;
    const defaultGrace = await getDefaultGracePeriodDays();
    const graceDays = Number(plan?.gracePeriodDays ?? defaultGrace);
    const end = profile.subscriptionPeriodEnd ? profile.subscriptionPeriodEnd.getTime() : 0;
    const graceEnd = end + graceDays * 24 * 60 * 60 * 1000;

    if (end <= now.getTime() && now.getTime() < graceEnd) {
      if (profile.subscriptionStatus !== 'past_due') {
        profile.subscriptionStatus = 'past_due';
        await profile.save();
        await Subscription.updateMany(
          { userId: profile.userId, status: { $in: ['active', 'trialing'] } },
          { $set: { status: 'past_due' } },
        );
        try {
          const { createDbNotification } = await import('../../utils/notify.js');
          await createDbNotification({
            userId,
            type: 'technician.subscription_grace',
            title: 'Grace period started',
            body: `Your plan expired. You have ${graceDays} grace day(s) to renew before features are removed.`,
            bypassQuietHours: true,
          });
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    profile.subscriptionStatus = 'expired';
    if (Number(profile.remainingFreeJobs) <= 0) {
      profile.accountLocked = true;
      profile.lockReason = 'Subscription expired — free completed jobs exhausted';
      if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
        profile.accountStatus = ACCOUNT_STATUS.LOCKED;
      }
    }
    await profile.save();
    await Subscription.updateMany(
      { userId: profile.userId, status: { $in: ['active', 'trialing', 'past_due'] } },
      {
        $set: {
          status: 'expired',
          cancelAtPeriodEnd: false,
          scheduledPlanCode: null,
          scheduledChangeAt: null,
          scheduledAt: null,
        },
        $unset: { scheduledChangeType: 1 },
      },
    );
    await User.updateOne({ _id: profile.userId }, { $set: { subscriptionStatus: 'expired' } });
    emitFreeJobLimitUpdated(userId, profile);
    try {
      const { createDbNotification } = await import('../../utils/notify.js');
      await createDbNotification({
        userId,
        type: 'technician.subscription_expired',
        title: 'Subscription expired',
        body: 'Your plan has ended. Renew to keep applying for jobs. You can still browse and manage your account.',
        bypassQuietHours: true,
      });
    } catch {
      /* ignore */
    }
    count += 1;
  }
  return count;
}

/** Smart upgrade reminders — day offsets come from Admin reminder config. */
export async function evaluateSubscriptionReminders(userId: string): Promise<{
  reminders: Array<{ key: string; title: string; body: string; severity: 'info' | 'warning' }>;
}> {
  const config = await getSubscriptionReminderConfig();
  if (!config.enabled) return { reminders: [] };

  const profile = await TechnicianProfile.findOne({ userId });
  if (!profile) return { reminders: [] };

  const planCode = String(profile.subscriptionPlanCode || 'STARTER').toUpperCase();
  const plan = await SubscriptionPlan.findOne({ code: planCode }).select('name gracePeriodDays');
  const planName = plan?.name || planCode;

  const reminders: Array<{ key: string; title: string; body: string; severity: 'info' | 'warning' }> =
    [];
  const remaining = Number(profile.remainingFreeJobs ?? 0);
  const active = hasActivePaidAccess(profile, Number(plan?.gracePeriodDays ?? (await getDefaultGracePeriodDays())));

  if (!active && remaining === 1 && config.triggers.oneJobRemaining) {
    reminders.push({
      key: 'one_job_remaining',
      title: '1 free completed job left',
      body: `After your next customer-confirmed completion, you will need ${planName} to keep applying.`,
      severity: 'info',
    });
  }
  if (!active && remaining <= 0 && config.triggers.freeJobsExhausted) {
    reminders.push({
      key: 'free_jobs_exhausted',
      title: 'Free completed jobs exhausted',
      body: `Browse and notifications still work. Subscribe to keep applying for new jobs.`,
      severity: 'warning',
    });
  }

  if (active && profile.subscriptionPeriodEnd) {
    const days = Math.ceil(
      (profile.subscriptionPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    if (config.daysBeforeExpiry.includes(days)) {
      const label =
        days === 0
          ? 'Plan expires today'
          : days === 1
            ? '1 day until expiry'
            : `${days} days until expiry`;
      reminders.push({
        key: `expiry_${days}d`,
        title: label,
        body:
          days === 0
            ? `Renew ${planName} now to avoid losing the ability to apply for jobs.`
            : `Renew ${planName} early so you keep unlimited applications and plan features.`,
        severity: days <= 3 ? 'warning' : 'info',
      });
    }
  }

  if (profile.subscriptionStatus === 'past_due' && config.triggers.graceEnding) {
    const defaultGrace = await getDefaultGracePeriodDays();
    const graceDays = Number(plan?.gracePeriodDays ?? defaultGrace);
    const end = profile.subscriptionPeriodEnd ? profile.subscriptionPeriodEnd.getTime() : 0;
    const graceLeft = Math.ceil((end + graceDays * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
    if (graceLeft >= 0 && graceLeft <= 1) {
      reminders.push({
        key: 'grace_ending',
        title: 'Grace period ending',
        body: `Your grace period ends soon. Renew ${planName} to keep premium access.`,
        severity: 'warning',
      });
    }
  }

  if (profile.subscriptionStatus === 'expired' && config.triggers.afterExpiry) {
    reminders.push({
      key: 'after_expiry',
      title: 'Subscription expired',
      body: 'Renew to resume applications. Browsing still works.',
      severity: 'warning',
    });
  }

  return { reminders };
}

/**
 * Background fan-out: evaluate reminder thresholds for active/past_due subscribers and notify.
 * Dedupes by creating at most one notification per key per frequencyDays window via type+meta check.
 */
export async function processSubscriptionReminderFanout(): Promise<number> {
  const config = await getSubscriptionReminderConfig();
  if (!config.enabled || !config.notificationEnabled) return 0;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const maxLookahead = Math.max(0, ...config.daysBeforeExpiry, 14);
  const windowStart = new Date(now);
  const windowEnd = new Date(now + (maxLookahead + 1) * dayMs);

  const profiles = await TechnicianProfile.find({
    subscriptionStatus: { $in: ['active', 'trialing', 'past_due'] },
    subscriptionPeriodEnd: { $gte: windowStart, $lte: windowEnd },
  })
    .select('userId subscriptionPlanCode subscriptionPeriodEnd subscriptionStatus')
    .limit(300);

  let sent = 0;
  const { createDbNotification } = await import('../../utils/notify.js');
  const { Notification } = await import('../../models/index.js');

  for (const profile of profiles) {
    const userId = profile.userId.toString();
    const evaluated = await evaluateSubscriptionReminders(userId);
    for (const reminder of evaluated.reminders.filter((r) => r.key.startsWith('expiry_') || r.key === 'grace_ending')) {
      const since = new Date(now - config.frequencyDays * dayMs);
      const existing = await Notification.findOne({
        userId,
        type: 'technician.subscription_expiry_reminder',
        'meta.key': reminder.key,
        createdAt: { $gte: since },
        deletedAt: null,
      }).select('_id');
      if (existing) continue;
      await createDbNotification({
        userId,
        type: 'technician.subscription_expiry_reminder',
        title: reminder.title,
        body: reminder.body,
        href: '/technician/subscription',
        meta: { key: reminder.key },
        bypassQuietHours: reminder.severity === 'warning',
      });
      sent += 1;
    }
  }
  return sent;
}

export async function getSubscriptionAnalytics() {
  await ensureSubscriptionCatalogue();
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeByPlan,
    pendingPayments,
    expiredProfiles,
    graceProfiles,
    approvedPayments,
    boostPurchases,
  ] = await Promise.all([
    TechnicianProfile.aggregate([
      { $match: { subscriptionStatus: { $in: ['active', 'trialing', 'past_due'] } } },
      { $group: { _id: '$subscriptionPlanCode', count: { $sum: 1 } } },
    ]),
    SubscriptionPayment.countDocuments({ status: 'pending', deletedAt: null }),
    TechnicianProfile.countDocuments({ subscriptionStatus: 'expired' }),
    TechnicianProfile.countDocuments({ subscriptionStatus: 'past_due' }),
    SubscriptionPayment.find({
      status: 'approved',
      reviewedAt: { $gte: monthAgo },
      deletedAt: null,
    }).select('amount planCode'),
    (async () => {
      try {
        const { BoostPurchase } = await import('../../models/index.js');
        const [pending, active, revenue] = await Promise.all([
          BoostPurchase.countDocuments({ status: 'pending_payment', deletedAt: null }),
          BoostPurchase.countDocuments({ status: 'active', deletedAt: null }),
          BoostPurchase.aggregate([
            { $match: { status: { $in: ['active', 'expired'] }, deletedAt: null } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        ]);
        return {
          pending,
          active,
          revenue: Number(revenue[0]?.total || 0),
        };
      } catch {
        return { pending: 0, active: 0, revenue: 0 };
      }
    })(),
  ]);

  const revenue30d = approvedPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const planCounts = Object.fromEntries(
    activeByPlan.map((r) => [String(r._id || 'UNKNOWN'), r.count]),
  );
  const popularPlan =
    Object.entries(planCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || null;

  return {
    revenue30d,
    currency: (await getBillingPeriodsConfig()).currency,
    activeSubscriptions: Object.values(planCounts).reduce((a, b) => a + Number(b), 0),
    byPlan: planCounts,
    popularPlan,
    pendingPayments,
    expired: expiredProfiles,
    gracePeriod: graceProfiles,
    renewals30d: approvedPayments.length,
    boosts: boostPurchases,
  };
}

export const subscriptionMarketplaceService = {
  ensureCatalogue: ensureSubscriptionCatalogue,
  listPlans: listPublicPlans,
  listAdminPlans,
  updatePlan,
  getMine,
  submitPayment,
  approvePayment,
  rejectPayment,
  listAdminPayments,
  listAdminSubscriptions,
  adminManageSubscription,
  getMomoConfig: getSubscriptionMomoConfig,
  updateMomoConfig: updateSubscriptionMomoConfig,
  getReminderConfig: getSubscriptionReminderConfig,
  updateReminderConfig: updateSubscriptionReminderConfig,
  getDiscoveryConfig: getSubscriptionDiscoveryConfig,
  updateDiscoveryConfig: updateSubscriptionDiscoveryConfig,
  getBillingPeriodsConfig,
  updateBillingPeriodsConfig,
  getPublicPlanDetail,
  expireDueSubscriptions,
  evaluateReminders: evaluateSubscriptionReminders,
  processReminderFanout: processSubscriptionReminderFanout,
  getAnalytics: getSubscriptionAnalytics,
  hasActivePaidAccess,
  scheduleDowngrade,
  scheduleCancel,
  clearScheduledChange,
};
