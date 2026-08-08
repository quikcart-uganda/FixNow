/**
 * Feature Entitlement Engine — single source of truth for plan permissions.
 * Screens must NOT hardcode subscription gates; call resolveEntitlements / can / assert*.
 * Free completed-job accounting remains in freeJob.service.ts.
 */
import {
  SubscriptionPlan,
  TechnicianProfile,
  DEFAULT_STARTER_FEATURES,
  DEFAULT_STARTER_LIMITS,
  DEFAULT_PLAN_BADGES,
  type PlanFeatureFlags,
  type PlanLimits,
  type PlanBadgeConfig,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { hasActivePaidAccess } from './subscription.service.js';

export type SubscriptionLifecycleStatus =
  | 'none'
  | 'trial'
  | 'pending_payment'
  | 'pending_verification'
  | 'active'
  | 'grace_period'
  | 'expired'
  | 'suspended'
  | 'cancelled'
  | 'rejected';

export type EntitlementCapabilities = {
  canApply: boolean;
  canUploadPhotos: boolean;
  canUploadVideos: boolean;
  canCreateOffers: boolean;
  canAdvertise: boolean;
  canUseHomepageSlides: boolean;
  canUseBanners: boolean;
  canUseAnnouncements: boolean;
  canUsePortfolioCampaigns: boolean;
  canUseBusinessBranding: boolean;
  canUseMarketingCentre: boolean;
  canUseBusinessDashboard: boolean;
  canReceivePrioritySupport: boolean;
  canUseCertificates: boolean;
  canUseTeamPlaceholders: boolean;
};

export type TechnicianEntitlements = {
  planCode: string | null;
  planName: string | null;
  hasPaidAccess: boolean;
  isProfessional: boolean;
  isBusiness: boolean;
  showPremiumBadge: boolean;
  verifiedBusinessBadge?: boolean;
  marketingCentre?: boolean;
  featuredPlacement: boolean;
  searchPriorityWeight: number;
  featureFlags: PlanFeatureFlags;
  limits: PlanLimits;
  subscriptionStatus: string;
  lifecycleStatus: SubscriptionLifecycleStatus;
  subscriptionPeriodEnd: Date | null;
  gracePeriodDays: number;
  inGracePeriod: boolean;
  daysRemaining: number | null;
  badge: PlanBadgeConfig | null;
  capabilities: EntitlementCapabilities;
  /** production = real subscription/profile; developer_preview = temporary session only */
  subscriptionSource: 'production' | 'developer_preview';
  preview?: {
    active: true;
    sessionId: string;
    planCode: string;
    expiresAt: Date;
    activeBoosts: boolean;
    simulationOnly: true;
  } | null;
};

function buildCapabilities(
  flags: PlanFeatureFlags,
  limits: PlanLimits,
  hasPaidAccess: boolean,
  isBusiness: boolean,
): EntitlementCapabilities {
  return {
    canApply: Boolean(flags.unlimitedApplications) && hasPaidAccess,
    canUploadPhotos: Boolean(flags.uploadPhotos) && Number(limits.maxPhotos) > 0,
    canUploadVideos: Boolean(flags.uploadVideos) && Number(limits.maxVideos) > 0,
    canCreateOffers: Boolean(flags.basicOffers) && Number(limits.maxActiveOffers) > 0,
    canAdvertise: Boolean(flags.advertisingSlides) && Number(limits.maxAdvertisingSlides) > 0,
    canUseHomepageSlides:
      Boolean(flags.advertisingSlides || flags.homepagePromotions) &&
      (Number(limits.maxHomepageSlides) > 0 || Number(limits.maxAdvertisingSlides) > 0),
    canUseBanners:
      Boolean(flags.promotionalBanner || flags.advertisingBanner) &&
      Number(limits.maxPromotionalBanners) > 0,
    canUseAnnouncements:
      Boolean(flags.promotionalAnnouncements) && Number(limits.maxAnnouncements) > 0,
    canUsePortfolioCampaigns: Boolean(flags.portfolioCampaigns),
    canUseBusinessBranding: Boolean(
      flags.businessLogo || flags.businessSlogan || flags.customProfileColours || flags.customCoverImage,
    ),
    canUseMarketingCentre: Boolean(flags.marketingCentre),
    canUseBusinessDashboard: isBusiness,
    canReceivePrioritySupport: Boolean(flags.prioritySupport),
    canUseCertificates: Boolean(flags.certificates) && Number(limits.maxCertificates) > 0,
    canUseTeamPlaceholders: Boolean(flags.teamManagement || flags.dispatcher),
  };
}

function defaultBadgeForCode(code: string | null): PlanBadgeConfig | null {
  if (!code) return null;
  const key = code.toUpperCase() as keyof typeof DEFAULT_PLAN_BADGES;
  return DEFAULT_PLAN_BADGES[key] ? { ...DEFAULT_PLAN_BADGES[key] } : null;
}

function resolveLifecycle(input: {
  status: string;
  hasPaidAccess: boolean;
  inGracePeriod?: boolean;
}): SubscriptionLifecycleStatus {
  const status = String(input.status || 'none').toLowerCase();
  if (input.inGracePeriod) return 'grace_period';
  if (status === 'pending_payment') return 'pending_verification';
  if (status === 'trialing') return 'trial';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'rejected') return 'rejected';
  if (status === 'past_due') return 'grace_period';
  if (status === 'expired') return 'expired';
  if (status === 'required' || status === 'suspended') return 'suspended';
  if (input.hasPaidAccess && (status === 'active' || status === 'trialing')) return 'active';
  if (input.hasPaidAccess) return 'active';
  return 'none';
}

function freePlanEntitlements(): TechnicianEntitlements {
  const flags = {
    ...DEFAULT_STARTER_FEATURES,
    unlimitedApplications: false,
    unlimitedCompletedJobs: false,
    advertisingSlides: false,
    promotionalAnnouncements: false,
    portfolioCampaigns: false,
    uploadVideos: false,
    featuredPlacement: false,
    premiumBadge: false,
    businessLogo: false,
    customProfileColours: false,
  } as PlanFeatureFlags;
  const limits = {
    ...DEFAULT_STARTER_LIMITS,
    maxActiveOffers: 0,
    maxAdvertisingSlides: 0,
    maxPromotionalBanners: 0,
    maxHomepageSlides: 0,
    maxAnnouncements: 0,
    maxVideos: 0,
    searchPriorityWeight: 0,
  } as PlanLimits;
  return {
    planCode: null,
    planName: 'Free',
    hasPaidAccess: false,
    isProfessional: false,
    isBusiness: false,
    showPremiumBadge: false,
    featuredPlacement: false,
    searchPriorityWeight: 0,
    featureFlags: flags,
    limits,
    subscriptionStatus: 'none',
    lifecycleStatus: 'none',
    subscriptionPeriodEnd: null,
    gracePeriodDays: 0,
    inGracePeriod: false,
    daysRemaining: null,
    badge: null,
    capabilities: buildCapabilities(flags, limits, false, false),
    subscriptionSource: 'production',
    preview: null,
  };
}

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

async function entitlementsFromPlanCode(
  planCode: string,
  opts: {
    paid: boolean;
    subscriptionStatus: string;
    periodEnd: Date | null;
    gracePeriodDays?: number;
    inGracePeriod?: boolean;
    subscriptionSource: 'production' | 'developer_preview';
    preview?: TechnicianEntitlements['preview'];
  },
): Promise<TechnicianEntitlements> {
  const code = planCode.toUpperCase();
  const plan = await SubscriptionPlan.findOne({ code, isActive: true }).lean();
  if (!plan && opts.subscriptionSource === 'production' && !opts.paid) {
    return freePlanEntitlements();
  }

  const flags = {
    ...DEFAULT_STARTER_FEATURES,
    ...(plan?.featureFlags ?? {}),
  } as PlanFeatureFlags;
  const limits = {
    ...DEFAULT_STARTER_LIMITS,
    ...(plan?.limits ?? {}),
  } as PlanLimits;

  // Preview Business + Boost: elevate search weight slightly for visibility testing
  if (opts.preview?.activeBoosts) {
    limits.searchPriorityWeight = Math.max(Number(limits.searchPriorityWeight || 0), 25);
    flags.featuredPlacement = true;
  }

  const isBusiness = code === 'BUSINESS';
  const isProfessional = code === 'PROFESSIONAL' || isBusiness;
  const badgeRaw = (plan?.badge as PlanBadgeConfig | undefined) || defaultBadgeForCode(code);
  const badge =
    badgeRaw && badgeRaw.enabled !== false
      ? {
          ...defaultBadgeForCode(code)!,
          ...badgeRaw,
          text:
            opts.subscriptionSource === 'developer_preview'
              ? `Preview · ${badgeRaw.text || badgeRaw.name || code}`
              : badgeRaw.text || badgeRaw.name || code,
        }
      : null;

  const gracePeriodDays = Number(opts.gracePeriodDays ?? plan?.gracePeriodDays ?? 0);
  const paid = opts.paid;
  const lifecycleStatus =
    opts.subscriptionSource === 'developer_preview'
      ? ('active' as const)
      : resolveLifecycle({
          status: opts.subscriptionStatus,
          hasPaidAccess: paid,
          inGracePeriod: opts.inGracePeriod,
        });

  return {
    planCode: code || null,
    planName:
      opts.subscriptionSource === 'developer_preview'
        ? `Preview ${plan?.name || code}`
        : plan?.name || code || null,
    hasPaidAccess: paid,
    isProfessional,
    isBusiness,
    showPremiumBadge: Boolean(flags.premiumBadge) || Boolean(flags.verifiedBusinessBadge),
    featuredPlacement: Boolean(flags.featuredPlacement),
    searchPriorityWeight: Number(limits.searchPriorityWeight ?? 0),
    featureFlags: flags,
    limits,
    subscriptionStatus:
      opts.subscriptionSource === 'developer_preview' ? 'preview' : opts.subscriptionStatus,
    lifecycleStatus,
    subscriptionPeriodEnd: opts.periodEnd,
    gracePeriodDays,
    inGracePeriod: Boolean(opts.inGracePeriod),
    daysRemaining: paid ? daysUntil(opts.periodEnd) : null,
    badge,
    capabilities: buildCapabilities(flags, limits, paid, isBusiness),
    marketingCentre: Boolean(flags.marketingCentre),
    verifiedBusinessBadge: Boolean(flags.verifiedBusinessBadge),
    subscriptionSource: opts.subscriptionSource,
    preview: opts.preview ?? null,
  };
}

export async function resolveEntitlements(userId: string): Promise<TechnicianEntitlements> {
  // Phase 3: temporary Developer Preview session overrides production entitlement source.
  const { getActivePreviewSession, cataloguePlanCodeForPreview } = await import(
    './developerPreview.service.js'
  );
  const previewSession = await getActivePreviewSession(userId);
  if (previewSession) {
    const catalogueCode = cataloguePlanCodeForPreview(previewSession.planCode);
    return entitlementsFromPlanCode(catalogueCode, {
      paid: true,
      subscriptionStatus: 'preview',
      periodEnd: previewSession.expiresAt,
      gracePeriodDays: 0,
      inGracePeriod: false,
      subscriptionSource: 'developer_preview',
      preview: {
        active: true,
        sessionId: previewSession._id.toString(),
        planCode: previewSession.planCode,
        expiresAt: previewSession.expiresAt,
        activeBoosts: Boolean(previewSession.activeBoosts),
        simulationOnly: true,
      },
    });
  }

  const profile = await TechnicianProfile.findOne({ userId }).lean();
  if (!profile) return freePlanEntitlements();

  const planCode = profile.subscriptionPlanCode
    ? String(profile.subscriptionPlanCode).toUpperCase()
    : null;
  const plan = planCode
    ? await SubscriptionPlan.findOne({ code: planCode, isActive: true }).lean()
    : null;
  const { getDefaultGracePeriodDays } = await import('./subscriptionBillingConfig.js');
  const gracePeriodDays = Number(plan?.gracePeriodDays ?? (await getDefaultGracePeriodDays()));
  const paid = hasActivePaidAccess(profile, gracePeriodDays);
  const periodEnd = profile.subscriptionPeriodEnd ?? null;
  const inGracePeriod =
    Boolean(periodEnd) &&
    periodEnd!.getTime() < Date.now() &&
    periodEnd!.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000 >= Date.now() &&
    ['active', 'trialing', 'past_due'].includes(String(profile.subscriptionStatus || ''));

  if (!paid || !planCode) {
    const free = freePlanEntitlements();
    const flags = {
      ...DEFAULT_STARTER_FEATURES,
      unlimitedApplications: false,
      unlimitedCompletedJobs: false,
      advertisingSlides: false,
      promotionalAnnouncements: false,
      portfolioCampaigns: false,
      uploadVideos: false,
      featuredPlacement: false,
      premiumBadge: false,
      businessLogo: false,
      customProfileColours: false,
      marketingCentre: false,
    } as PlanFeatureFlags;
    const limits = {
      ...DEFAULT_STARTER_LIMITS,
      maxActiveOffers: 0,
      maxAdvertisingSlides: 0,
      maxHomepageSlides: 0,
      maxAnnouncements: 0,
      maxPromotionalBanners: 0,
      maxVideos: 0,
      searchPriorityWeight: 0,
    } as PlanLimits;
    return {
      ...free,
      featureFlags: flags,
      limits,
      subscriptionStatus: profile.subscriptionStatus ?? 'none',
      lifecycleStatus: resolveLifecycle({
        status: profile.subscriptionStatus ?? 'none',
        hasPaidAccess: false,
        inGracePeriod: false,
      }),
      subscriptionPeriodEnd: periodEnd,
      gracePeriodDays,
      inGracePeriod: false,
      daysRemaining: null,
      capabilities: buildCapabilities(flags, limits, false, false),
      subscriptionSource: 'production',
      preview: null,
    };
  }

  return entitlementsFromPlanCode(planCode, {
    paid,
    subscriptionStatus: profile.subscriptionStatus ?? 'active',
    periodEnd,
    gracePeriodDays,
    inGracePeriod,
    subscriptionSource: 'production',
    preview: null,
  });
}

/** Capability check — prefer this over reading featureFlags in UI/services. */
export function can(
  ent: TechnicianEntitlements,
  capability: keyof EntitlementCapabilities,
): boolean {
  return Boolean(ent.capabilities[capability]);
}

export async function assertCapability(
  userId: string,
  capability: keyof EntitlementCapabilities,
  message?: string,
): Promise<TechnicianEntitlements> {
  const ent = await resolveEntitlements(userId);
  if (!can(ent, capability)) {
    throw AppError.forbidden(
      message || `This action requires a plan entitlement (${capability}). Upgrade or renew to continue.`,
    );
  }
  return ent;
}

export async function assertOfferAllowed(userId: string): Promise<TechnicianEntitlements> {
  return assertCapability(
    userId,
    'canCreateOffers',
    'Offers are disabled on your current plan. Upgrade or contact FixNow support.',
  );
}

export async function assertMediaUploadAllowed(
  userId: string,
  kind: 'photo' | 'video' | 'before_after' | 'certificate',
): Promise<TechnicianEntitlements> {
  const ent = await resolveEntitlements(userId);
  if (kind === 'video' && !can(ent, 'canUploadVideos')) {
    throw AppError.forbidden('Video uploads require Professional or a plan with videos enabled.');
  }
  if (kind === 'photo' && !can(ent, 'canUploadPhotos')) {
    throw AppError.forbidden('Photo uploads are disabled on your plan.');
  }
  if (kind === 'before_after' && !ent.featureFlags.beforeAfterGalleries) {
    throw AppError.forbidden('Before & after galleries are not enabled on your plan.');
  }
  if (kind === 'certificate' && !can(ent, 'canUseCertificates')) {
    throw AppError.forbidden('Certificates are not enabled on your plan.');
  }
  return ent;
}

export async function assertCreativeAllowed(
  userId: string,
  kind: 'slide' | 'banner' | 'announcement' | 'portfolio_campaign',
): Promise<TechnicianEntitlements> {
  const ent = await resolveEntitlements(userId);
  if (kind === 'slide') {
    if (!can(ent, 'canAdvertise') && !can(ent, 'canUseHomepageSlides')) {
      throw AppError.forbidden('Advertising slides require Professional/Business (or Admin-enabled slides).');
    }
  }
  if (kind === 'banner' && !can(ent, 'canUseBanners')) {
    throw AppError.forbidden('Promotional banners are not enabled on your plan.');
  }
  if (kind === 'announcement' && !can(ent, 'canUseAnnouncements')) {
    throw AppError.forbidden('Announcements are not enabled on your plan.');
  }
  if (kind === 'portfolio_campaign' && !can(ent, 'canUsePortfolioCampaigns')) {
    throw AppError.forbidden('Portfolio campaigns are not enabled on your plan.');
  }
  return ent;
}

/** Slide slot limit — prefers maxHomepageSlides when configured, else maxAdvertisingSlides. */
export function slideLimitFor(ent: TechnicianEntitlements): number {
  const homepage = Number(ent.limits.maxHomepageSlides || 0);
  const ads = Number(ent.limits.maxAdvertisingSlides || 0);
  return homepage > 0 ? homepage : ads;
}

export function serializeEntitlements(ent: TechnicianEntitlements) {
  return {
    planCode: ent.planCode,
    planName: ent.planName,
    hasPaidAccess: ent.hasPaidAccess,
    hasActiveSubscription: ent.hasPaidAccess,
    isProfessional: ent.isProfessional,
    isBusiness: ent.isBusiness,
    showPremiumBadge: ent.showPremiumBadge,
    verifiedBusinessBadge: ent.verifiedBusinessBadge,
    marketingCentre: ent.marketingCentre,
    featuredPlacement: ent.featuredPlacement,
    searchPriorityWeight: ent.searchPriorityWeight,
    featureFlags: ent.featureFlags,
    limits: ent.limits,
    subscriptionStatus: ent.subscriptionStatus,
    lifecycleStatus: ent.lifecycleStatus,
    subscriptionPeriodEnd: ent.subscriptionPeriodEnd,
    gracePeriodDays: ent.gracePeriodDays,
    inGracePeriod: ent.inGracePeriod,
    daysRemaining: ent.daysRemaining,
    badge: ent.badge,
    capabilities: ent.capabilities,
    canApply: ent.capabilities.canApply || ent.hasPaidAccess,
    unlimitedCompletedJobs: Boolean(ent.featureFlags.unlimitedCompletedJobs) && ent.hasPaidAccess,
    subscriptionSource: ent.subscriptionSource || 'production',
    preview: ent.preview || null,
    simulationOnly: Boolean(ent.preview?.simulationOnly),
  };
}
