/**
 * Public subscription trust badge — customer-safe presentation only.
 * Never includes prices, expiry, billing status, or entitlement internals.
 */
import { SubscriptionPlan, DEFAULT_PLAN_BADGES, type PlanBadgeConfig } from '../../models/index.js';
import { hasActivePaidAccess } from './subscription.service.js';

export type PublicBadgeSurface = 'search' | 'profile' | 'chat' | 'card';

export type PublicSubscriptionBadge = {
  text: string;
  icon?: string;
  color?: string;
  borderColor?: string;
  glow?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

function surfaceVisible(badge: PlanBadgeConfig, surface: PublicBadgeSurface): boolean {
  if (surface === 'search' || surface === 'card') return badge.visibleOnSearch !== false;
  if (surface === 'profile') return badge.visibleOnProfile !== false;
  if (surface === 'chat') return badge.visibleOnChat !== false;
  return true;
}

/** Strip admin-only fields — customer DTOs get presentation props only. */
export function sanitizePublicBadge(
  badge: Partial<PlanBadgeConfig> | Record<string, unknown> | null | undefined,
): PublicSubscriptionBadge | null {
  if (!badge || typeof badge !== 'object') return null;
  if ((badge as PlanBadgeConfig).enabled === false) return null;
  const text = String(
    (badge as PlanBadgeConfig).text || (badge as PlanBadgeConfig).name || '',
  ).trim();
  if (!text) return null;
  const sizeRaw = String((badge as PlanBadgeConfig).size || 'sm');
  const size = sizeRaw === 'md' || sizeRaw === 'lg' ? sizeRaw : 'sm';
  return {
    text: text.slice(0, 48),
    icon: (badge as PlanBadgeConfig).icon ? String((badge as PlanBadgeConfig).icon).slice(0, 40) : 'verified',
    color: (badge as PlanBadgeConfig).color
      ? String((badge as PlanBadgeConfig).color).slice(0, 32)
      : '#16A34A',
    borderColor: (badge as PlanBadgeConfig).borderColor
      ? String((badge as PlanBadgeConfig).borderColor).slice(0, 32)
      : undefined,
    glow: Boolean((badge as PlanBadgeConfig).glow),
    size,
  };
}

/**
 * Resolve a public trust badge for a technician profile + optional preloaded plan doc.
 */
export async function resolvePublicSubscriptionBadge(
  profile: {
    subscriptionPlanCode?: string | null;
    subscriptionStatus?: string;
    subscriptionPeriodEnd?: Date | null;
    monetizationSuspended?: boolean;
  },
  surface: PublicBadgeSurface = 'search',
  planDoc?: { badge?: PlanBadgeConfig; gracePeriodDays?: number; code?: string } | null,
): Promise<PublicSubscriptionBadge | null> {
  const code = String(profile.subscriptionPlanCode || '').toUpperCase();
  if (!code || code === 'FREE') return null;

  let plan = planDoc || null;
  if (!plan) {
    plan = (await SubscriptionPlan.findOne({
      code,
      audience: 'technician',
      isActive: true,
      deletedAt: null,
    })
      .select('code badge gracePeriodDays')
      .lean()) as { badge?: PlanBadgeConfig; gracePeriodDays?: number; code?: string } | null;
  }

  const grace = Number(plan?.gracePeriodDays ?? 0);
  if (!hasActivePaidAccess(profile, grace)) return null;

  const fallback =
    DEFAULT_PLAN_BADGES[code as keyof typeof DEFAULT_PLAN_BADGES] || null;
  const merged = {
    ...(fallback || {}),
    ...(plan?.badge || {}),
  } as PlanBadgeConfig;

  if (merged.enabled === false) return null;
  if (!surfaceVisible(merged, surface)) return null;

  return sanitizePublicBadge(merged);
}

/** Batch resolve badges for many profiles (one plan catalogue load). */
export async function resolvePublicBadgesForProfiles(
  profiles: Array<{
    userId: { toString(): string } | string;
    subscriptionPlanCode?: string | null;
    subscriptionStatus?: string;
    subscriptionPeriodEnd?: Date | null;
    monetizationSuspended?: boolean;
  }>,
  surface: PublicBadgeSurface = 'search',
): Promise<Map<string, PublicSubscriptionBadge>> {
  const out = new Map<string, PublicSubscriptionBadge>();
  if (!profiles.length) return out;

  const plans = await SubscriptionPlan.find({
    audience: 'technician',
    isActive: true,
    deletedAt: null,
  })
    .select('code badge gracePeriodDays')
    .lean();
  const planMap = Object.fromEntries(plans.map((p) => [String(p.code).toUpperCase(), p]));

  for (const p of profiles) {
    const code = String(p.subscriptionPlanCode || '').toUpperCase();
    if (!code || code === 'FREE') continue;
    const plan = planMap[code];
    const grace = Number(plan?.gracePeriodDays ?? 0);
    if (!hasActivePaidAccess(p, grace)) continue;
    const fallback = DEFAULT_PLAN_BADGES[code as keyof typeof DEFAULT_PLAN_BADGES] || null;
    const merged = { ...(fallback || {}), ...(plan?.badge || {}) } as PlanBadgeConfig;
    if (merged.enabled === false) continue;
    if (!surfaceVisible(merged, surface)) continue;
    const sanitized = sanitizePublicBadge(merged);
    if (sanitized) out.set(p.userId.toString(), sanitized);
  }
  return out;
}
