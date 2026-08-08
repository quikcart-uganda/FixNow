/**
 * Technician-facing presentation for subscription entitlements.
 * Maps engine fields → plain language. Never surfaces raw camelCase keys,
 * ranking weights, or developer terminology in the UI.
 *
 * Does not change entitlement logic — display only.
 */

const CAPABILITY_LABELS: Record<string, string> = {
  canApply: 'Job applications',
  unlimitedApplications: 'Unlimited job applications',
  unlimitedCompletedJobs: 'Unlimited completed jobs',
  canUploadPhotos: 'Upload photos',
  uploadPhotos: 'Upload photos',
  canUploadVideos: 'Upload videos',
  uploadVideos: 'Upload videos',
  canCreateOffers: 'Create promotional offers',
  canAdvertise: 'Advertising tools',
  canUseHomepageSlides: 'Homepage advertising',
  canUseBanners: 'Promotional banners',
  canUseAnnouncements: 'Announcements',
  canUseCampaigns: 'Marketing campaigns',
  canUseCertificates: 'Certificates & qualifications',
  canUseTeamPlaceholders: 'Team management',
  publicProfile: 'Public profile',
  customerRatings: 'Customer ratings',
  customerReviews: 'Customer reviews',
  portfolio: 'Portfolio',
  basicGallery: 'Photo gallery',
  beforeAfterGalleries: 'Before & after galleries',
  basicProfileBanner: 'Profile banner',
  standardSupport: 'Standard support',
  prioritySupport: 'Priority support',
  referralProgramme: 'Referral programme',
  referralRewards: 'Referral rewards',
  advancedReferralRewards: 'Advanced referral rewards',
  businessBranding: 'Business branding',
  marketingTools: 'Marketing Centre',
  advancedAnalytics: 'Advanced analytics',
  businessDashboard: 'Business dashboard',
  featuredPlacement: 'Featured placement',
  boostEligibility: 'Boost eligibility',
}

const LIMIT_LABELS: Record<string, string> = {
  maxPhotos: 'Photos allowed',
  maxVideos: 'Videos allowed',
  maxCertificates: 'Certificates allowed',
  maxGalleryItems: 'Gallery items',
  maxActiveOffers: 'Active offers',
  maxPromotionalBanners: 'Promotional banners',
  maxProfileBanners: 'Profile banners',
  maxAdvertisingSlides: 'Advertising slides',
  maxHomepageSlides: 'Homepage slides',
  maxAnnouncements: 'Announcements',
  maxCampaigns: 'Campaigns',
}

/** Ranking / algorithm keys — never show to technicians. */
const HIDDEN_LIMIT_KEYS = new Set([
  'searchPriorityWeight',
  'featuredWeighting',
  'recommendationWeighting',
  'searchWeight',
  'rankingWeight',
  'priorityScore',
  'boostWeight',
])

const HIDDEN_COMPARISON_KEYS = new Set([
  'searchPriorityWeight',
  'featuredWeighting',
  'recommendationWeighting',
  'search_priority_weight',
  'featured_weighting',
  'recommendation_weighting',
])

export type BenefitRow = {
  key: string
  label: string
  included: boolean
}

export type LimitRow = {
  key: string
  label: string
  display: string
}

export function capabilityLabel(key: string): string | null {
  if (CAPABILITY_LABELS[key]) return CAPABILITY_LABELS[key]
  // Unknown camelCase keys stay internal — do not invent raw labels.
  if (/^[a-z]+[A-Z]/.test(key) || key.startsWith('can') || key.startsWith('max')) return null
  return key
}

export function limitLabel(key: string): string | null {
  if (HIDDEN_LIMIT_KEYS.has(key)) return null
  if (LIMIT_LABELS[key]) return LIMIT_LABELS[key]
  if (/Weight|weight|Score|score|Priority$/.test(key)) return null
  if (/^[a-z]+[A-Z]/.test(key) || key.startsWith('max')) return null
  return key
}

/** Translate ranking weights into plain visibility labels (never show the number). */
export function visibilityLabelFromWeight(weight: number): string {
  const n = Number(weight) || 0
  if (n <= 0) return 'Standard visibility'
  if (n <= 10) return 'Enhanced visibility'
  if (n <= 20) return 'High visibility'
  return 'Premium placement'
}

export function formatLimitValue(key: string, value: number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n >= 9999) return 'Unlimited'
  if (n <= 0) return 'Not included'
  return String(n)
}

export function presentCapabilities(flags: Record<string, boolean> | null | undefined): BenefitRow[] {
  const rows: BenefitRow[] = []
  for (const [key, value] of Object.entries(flags || {})) {
    const label = capabilityLabel(key)
    if (!label) continue
    rows.push({ key, label, included: Boolean(value) })
  }
  // Prefer showing included benefits first; keep locked secondary for "what's missing".
  return rows.sort((a, b) => Number(b.included) - Number(a.included) || a.label.localeCompare(b.label))
}

export function presentLimits(limits: Record<string, number> | null | undefined): LimitRow[] {
  const rows: LimitRow[] = []
  for (const [key, value] of Object.entries(limits || {})) {
    const label = limitLabel(key)
    if (!label) continue
    rows.push({ key, label, display: formatLimitValue(key, Number(value)) })
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}

/** Aggregate search/featured weights into a single visibility benefit line. */
export function presentVisibilityBenefit(limits: Record<string, number> | null | undefined): string | null {
  const search = Number(limits?.searchPriorityWeight)
  const featured = Number(limits?.featuredWeighting)
  const rec = Number(limits?.recommendationWeighting)
  const best = Math.max(
    Number.isFinite(search) ? search : 0,
    Number.isFinite(featured) ? featured : 0,
    Number.isFinite(rec) ? rec : 0,
  )
  if (!limits || (!('searchPriorityWeight' in limits) && !('featuredWeighting' in limits))) {
    return null
  }
  return visibilityLabelFromWeight(best)
}

export function humanizeComparisonLabel(key: string, label: string): string | null {
  if (HIDDEN_COMPARISON_KEYS.has(key) || HIDDEN_LIMIT_KEYS.has(key)) return null
  if (/search priority weight|featured weight|recommendation weight|ranking|algorithm/i.test(label)) {
    return null
  }
  if (/admin rules|admin enables|admin approval/i.test(label) && /boost/i.test(label)) {
    return 'Boosts (when available)'
  }
  if (/admin approval/i.test(label)) return 'Review before publishing ads & offers'
  return label
}

export function formatComparisonCell(value: string | number | boolean, rowKey?: string): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    if (rowKey && HIDDEN_LIMIT_KEYS.has(rowKey)) return visibilityLabelFromWeight(value)
    if (value >= 9999) return 'Unlimited'
    if (value <= 0 && rowKey?.startsWith('max')) return 'Not included'
    // Never dump raw ranking weights into the matrix.
    if (rowKey && /weight|score|priority/i.test(rowKey)) return visibilityLabelFromWeight(value)
    return String(value)
  }
  const s = String(value)
  if (/if admin enables/i.test(s)) return 'When available'
  if (/yes \(admin rules\)/i.test(s)) return 'Yes'
  if (/required before publish/i.test(s)) return 'Reviewed before publish'
  if (/^n\/?a$/i.test(s.trim())) return '—'
  return s
}

export type ComparisonRowView = {
  key: string
  label: string
  values: Record<string, string>
}

export function presentComparisonRows(
  rows: Array<{ key?: string; label?: string; values?: Record<string, string | number | boolean> }>,
  planCodes: string[],
): ComparisonRowView[] {
  const out: ComparisonRowView[] = []
  for (const row of rows) {
    const key = String(row.key || '')
    const label = humanizeComparisonLabel(key, String(row.label || key))
    if (!label) continue
    const values: Record<string, string> = {}
    for (const code of planCodes) {
      const raw = row.values?.[code]
      values[code] = raw === undefined || raw === null ? '—' : formatComparisonCell(raw as string | number | boolean, key)
    }
    out.push({ key, label, values })
  }
  return out
}

export const TECHNICIAN_SUBSCRIPTION_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What happens when my subscription expires?',
    a: 'You keep your profile, reviews, and past job history. Paid features such as unlimited applications, offers, and advertising pause until you renew. A short grace period may apply so you can renew without interruption.',
  },
  {
    q: 'Will my profile disappear?',
    a: 'No. Your public profile, ratings, and reviews stay on FixNow. Customers can still find your history — only premium tools pause when a paid plan ends.',
  },
  {
    q: 'Can I downgrade later?',
    a: 'Yes. You can schedule a downgrade anytime. Your current plan stays active until the period you already paid for ends, then the lower plan starts automatically.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes. Cancelling schedules the end of auto-continuation. You keep paid benefits until the expiry date, then your account returns to the Free plan.',
  },
  {
    q: 'Do I lose customer reviews?',
    a: 'Never. Reviews and ratings stay with your account regardless of plan.',
  },
  {
    q: 'Can I renew before expiry?',
    a: 'Yes. Renew anytime from Upgrade Plan or Subscription Centre so your access continues without a gap.',
  },
  {
    q: 'What features stop immediately after expiry?',
    a: 'After the grace period ends, paid-only tools stop: unlimited applications (if your free quota is used), new promotional offers, advertising slides, and Marketing Centre tools tied to your plan.',
  },
  {
    q: 'What happens during the grace period?',
    a: 'You usually keep current paid access for a few days after expiry so you can renew. Renew during grace to avoid any interruption.',
  },
]

export function lifecycleLabel(raw: string | null | undefined): string {
  const v = String(raw || 'none').toLowerCase()
  if (v === 'none' || v === 'inactive') return 'No paid plan'
  if (v === 'active') return 'Active'
  if (v === 'grace' || v === 'grace_period') return 'Grace period'
  if (v === 'expired') return 'Expired'
  if (v === 'pending' || v === 'pending_verification') return 'Payment pending'
  if (v === 'cancelled' || v === 'canceled') return 'Cancelled'
  return v.replace(/_/g, ' ')
}
