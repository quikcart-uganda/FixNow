import type {
  AssignedJob,
  JobStatus,
  NearbyJob,
  ReputationLevel,
  TechnicianProfile,
  TrustScores,
} from '@fixnow/types'

export function formatUgx(amount: number): string {
  return `UGX ${Math.round(amount).toLocaleString('en-UG')}`
}

export function formatBudget(min?: number | null, max?: number | null, currency = 'UGX'): string {
  if (min == null && max == null) return 'Budget flexible'
  if (min != null && max != null) return `${currency} ${min.toLocaleString()} – ${max.toLocaleString()}`
  if (min != null) return `From ${currency} ${min.toLocaleString()}`
  return `Up to ${currency} ${Number(max).toLocaleString()}`
}

export function timeAgo(date?: string | Date | null): string {
  if (!date) return ''
  const t = new Date(date).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const STATUS_MAP: Record<string, JobStatus> = {
  draft: 'Open',
  posted: 'Open',
  assigned: 'Assigned',
  technician_en_route: 'En Route',
  in_progress: 'Started',
  awaiting_confirmation: 'Awaiting Confirmation',
  completed: 'Completed',
  cancelled: 'Skipped',
  disputed: 'Awaiting Confirmation',
  archived: 'Completed',
}

export function mapJobStatus(status?: string): JobStatus {
  return STATUS_MAP[status ?? ''] ?? 'Open'
}

export function mapApiStatusToUi(status: JobStatus): string {
  const reverse: Record<JobStatus, string> = {
    Open: 'posted',
    Assigned: 'assigned',
    'En Route': 'technician_en_route',
    Started: 'in_progress',
    'Awaiting Confirmation': 'awaiting_confirmation',
    Completed: 'completed',
    Skipped: 'cancelled',
  }
  return reverse[status]
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v)
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function idOf(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  const r = asRecord(v)
  return str(r._id ?? r.id)
}

export function mapNearbyJob(raw: unknown): NearbyJob {
  const j = asRecord(raw)
  const loc = asRecord(j.location)
  return {
    id: idOf(j),
    category: str(j.categoryName || j.category || 'General'),
    title: str(j.title, 'Untitled job'),
    description: str(j.description),
    distanceKm: num(j.distanceKm, 0),
    etaMinutes: j.etaMinutes != null ? num(j.etaMinutes) : undefined,
    etaLabel: str(j.etaLabel) || undefined,
    postedAgo: timeAgo(j.createdAt as string),
    budget: formatBudget(num(j.budgetMin, NaN) || null, num(j.budgetMax, NaN) || null, str(j.currency, 'UGX')),
    parish: str(loc.parish || j.parish, '—'),
    district: str(loc.district || j.district, 'Kampala'),
    photos: Array.isArray(j.photoUrls) ? (j.photoUrls as string[]) : [],
    customerName: str(asRecord(j.customer).fullName || j.customerName, 'Customer'),
    customerRating: num(j.customerRating, 5),
    customerJobs: num(j.customerJobs, 0),
    matchScore: num(j.matchScore, 0),
    successScore: num(j.successScore, num(j.matchScore, 0)),
    matchReasons: Array.isArray(j.matchReasons) ? (j.matchReasons as string[]) : [],
    urgent: Boolean(j.urgent),
    bestMatch: Boolean(j.bestMatch),
  }
}

export function mapAssignedJob(raw: unknown, customer?: Record<string, unknown>): AssignedJob {
  const j = asRecord(raw)
  const loc = asRecord(j.location)
  const c = customer ?? asRecord(j.customer)
  return {
    id: idOf(j),
    category: str(j.categoryName || 'General'),
    title: str(j.title, 'Untitled job'),
    description: str(j.description),
    status: mapJobStatus(str(j.status)),
    address: str(loc.address || loc.parish || 'Address shared after accept'),
    parish: str(loc.parish, '—'),
    district: str(loc.district, 'Kampala'),
    customerName: str(c.fullName, 'Customer'),
    customerAvatar: str(c.photoUrl, ''),
    customerRating: num(c.rating, 5),
    photos: Array.isArray(j.photoUrls) ? (j.photoUrls as string[]) : [],
    budget: formatBudget(num(j.budgetMin, NaN) || null, num(j.budgetMax, NaN) || null),
    scheduledAt: str(j.preferredDate || j.assignedAt || j.createdAt),
    contactHidden: !c.email && !c.phone,
  }
}

const RANK_MAP: Record<string, ReputationLevel> = {
  beginner: 'New Professional',
  rising: 'Active',
  trusted: 'Trusted',
  expert: 'Preferred',
  elite: 'Top Performer',
  master: 'Elite Partner',
  // Display aliases (if already refined server-side)
  'new professional': 'New Professional',
  active: 'Active',
  preferred: 'Preferred',
  'top performer': 'Top Performer',
  'elite partner': 'Elite Partner',
}

export function mapTechnicianProfile(payload: {
  user?: Record<string, unknown>
  profile?: Record<string, unknown>
  trust?: Record<string, unknown> | null
}): TechnicianProfile {
  const user = asRecord(payload.user)
  const profile = asRecord(payload.profile)
  const free = asRecord(profile.freeJobs)
  const trustDoc = asRecord(payload.trust)
  const loc = asRecord(profile.location)
  const trust: TrustScores = {
    trust: Math.round(num(profile.trustScore ?? trustDoc.overall ?? trustDoc.trust, 0)),
    reliability: Math.round(num(profile.reliabilityScore ?? trustDoc.reliability, 0)),
    completion: Math.round(num(profile.completionScore ?? trustDoc.completion, 0)),
    response: Math.round(num(profile.responseScore ?? trustDoc.response, 0)),
    punctuality: Math.round(num(profile.punctualityScore ?? trustDoc.punctuality, 0)),
  }
  const rank = str(profile.currentRank || profile.experienceLevel, 'beginner').toLowerCase()
  const used = num(free.used ?? profile.freeJobsUsed, 0)
  const limit = num(free.limit ?? profile.freeJobLimit, 20)
  const subscriptionStatus = str(profile.subscriptionStatus, 'none') as TechnicianProfile['subscriptionStatus']
  const subscriptionPeriodEnd = profile.subscriptionPeriodEnd
    ? String(profile.subscriptionPeriodEnd)
    : null
  const periodEndMs = subscriptionPeriodEnd ? Date.parse(subscriptionPeriodEnd) : NaN
  const hasActiveSubscription =
    (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') &&
    (!Number.isFinite(periodEndMs) || periodEndMs > Date.now())
  const locked =
    !hasActiveSubscription &&
    (Boolean(free.locked ?? profile.accountLocked) ||
      str(user.accountStatus) === 'locked' ||
      str(profile.accountStatus) === 'locked')

  const profileImageUrl = str(profile.profileImageUrl ?? profile.photoUrl, '')
  return {
    id: str(user.id || profile.userId),
    name: str(user.fullName || profile.fullName, 'Technician'),
    phone: str(user.phone || profile.phone, ''),
    email: str(user.email, ''),
    photo: profileImageUrl,
    profileImageUrl,
    category: str(profile.primaryCategoryName || 'General'),
    subcategories: Array.isArray(profile.skills) ? (profile.skills as string[]).slice(0, 6) : [],
    experienceYears: num(profile.experienceYears, 0),
    skills: Array.isArray(profile.skills) ? (profile.skills as string[]) : [],
    certifications: [],
    serviceAreas: [],
    parish: str(loc.parish, '—'),
    district: str(loc.district, 'Kampala'),
    level: RANK_MAP[rank] ?? 'New Professional',
    trust,
    badges: [],
    rating: num(profile.ratingAverage, 0),
    reviewCount: num(profile.reviewCount, 0),
    jobsWon: num(profile.jobsWon ?? profile.jobsCompleted, 0),
    jobsCompleted: num(profile.jobsCompleted, 0),
    freeJobsUsed: used,
    freeJobLimit: limit,
    accountStatus: locked ? 'locked' : 'active',
    subscriptionPlanCode: str(profile.subscriptionPlanCode, '') || null,
    subscriptionStatus,
    subscriptionPeriodEnd,
    companyName: str(profile.companyName, '') || null,
    businessLogoUrl: str(profile.businessLogoUrl, '') || null,
    businessSlogan: str(profile.businessSlogan, '') || null,
    brandPrimaryColor: str(profile.brandPrimaryColor, '') || null,
    brandSecondaryColor: str(profile.brandSecondaryColor, '') || null,
    companyMission: str(profile.companyMission, '') || null,
    companyVision: str(profile.companyVision, '') || null,
    businessRegistrationNumber: str(profile.businessRegistrationNumber, '') || null,
    taxIdentificationNumber: str(profile.taxIdentificationNumber, '') || null,
    businessVerificationStatus: (str(profile.businessVerificationStatus, 'unverified') ||
      'unverified') as TechnicianProfile['businessVerificationStatus'],
    businessVerificationNote: str(profile.businessVerificationNote, '') || null,
    responseRate: Math.round(num(profile.responseScore, 0)),
    completionRate: Math.round(num(profile.completionScore, 0)),
    repeatCustomerPct: num(profile.repeatCustomerPct, 0),
    earningsWeek: num(profile.earningsWeek, 0),
    mobileMoney: str(user.phone, ''),
    mobileMoneyName: str(user.fullName, ''),
    availability: profile.isAvailableNow ? 'Available now' : 'Unavailable',
    workingHours: 'See availability settings',
    bio: str(profile.bio || profile.headline, ''),
    points: num(profile.loyaltyPoints ?? profile.points, 0),
    nextLevel: RANK_MAP[rank] ?? 'Active',
    nextLevelProgress: Math.min(100, Math.round(trust.trust)),
  }
}

export function mapCustomerTechnicianCard(raw: unknown) {
  const t = asRecord(raw)
  const profile = asRecord(t.profile ?? t)
  const user = asRecord(t.user ?? t)
  const id = idOf(user.id ? user : profile) || idOf(t)
  const trust = Math.round(num(profile.trustScore ?? t.trustScore, 0))
  const rating = num(profile.ratingAverage ?? t.ratingAverage ?? t.rating, 0)
  const jobs = num(profile.jobsCompleted ?? t.jobsCompleted, 0)
  const profileImageUrl = str(
    profile.profileImageUrl ?? t.profileImageUrl ?? profile.photoUrl ?? t.photoUrl,
    '',
  )
  const location = asRecord(profile.location ?? t.location)
  const geo = asRecord(location.geo)
  const coords = Array.isArray(geo.coordinates) ? geo.coordinates : null
  const longitude = coords && Number.isFinite(Number(coords[0])) ? Number(coords[0]) : undefined
  const latitude = coords && Number.isFinite(Number(coords[1])) ? Number(coords[1]) : undefined
  const verified =
    Boolean(profile.identityVerified ?? t.identityVerified) ||
    Boolean(profile.skillVerified ?? t.skillVerified)
  return {
    id,
    name: str(user.fullName ?? t.fullName ?? profile.fullName, 'Technician'),
    trade: str(profile.headline ?? t.headline ?? profile.bio, 'Service professional'),
    tier: (trust >= 90 ? 'Elite' : 'Pro') as 'Elite' | 'Pro',
    rating,
    trustScore: trust,
    jobs: jobs > 0 ? `${jobs}+` : 'New',
    startingFrom: 'On quote',
    online: Boolean(profile.isAvailableNow ?? t.isAvailableNow),
    neighborsHired: 0,
    photo: profileImageUrl,
    profileImageUrl,
    primaryCategoryId: str(profile.primaryCategoryId ?? t.primaryCategoryId, '') || undefined,
    district: str(location.district ?? profile.district ?? t.district, '') || undefined,
    verified,
    latitude,
    longitude,
    rankingScore: num(t.rankingScore ?? profile.rankingScore, trust),
    featuredPlacement: Boolean(t.featuredPlacement ?? profile.featuredPlacement),
    businessSpotlight: Boolean(t.businessSpotlight ?? profile.businessSpotlight),
    boostActive: Boolean(t.boostActive ?? profile.boostActive),
    distanceKm: t.distanceKm != null ? num(t.distanceKm) : undefined,
    etaMinutes: t.etaMinutes != null ? num(t.etaMinutes) : undefined,
    etaLabel: str(t.etaLabel) || undefined,
    indicators: Array.isArray(t.indicators) ? (t.indicators as string[]) : [],
    responseTimeMinutesAvg:
      t.responseTimeMinutesAvg != null ? num(t.responseTimeMinutesAvg) : undefined,
    responseTimeLabel: str(t.responseTimeLabel) || undefined,
    jobsCompleted: jobs,
    subscriptionPlanCode: str(t.subscriptionPlanCode ?? profile.subscriptionPlanCode, '') || null,
    subscriptionBadge: (() => {
      const badge = asRecord(t.subscriptionBadge ?? profile.subscriptionBadge ?? t.badge)
      if (!badge || badge.enabled === false) return null
      const text = str(badge.text ?? badge.name, '')
      if (!text) return null
      return {
        text,
        icon: str(badge.icon, 'verified'),
        color: str(badge.color, '#16A34A'),
        borderColor: str(badge.borderColor, ''),
        glow: Boolean(badge.glow),
        size: (str(badge.size, 'sm') as 'sm' | 'md' | 'lg') || 'sm',
      }
    })(),
  }
}

export function mapCategory(raw: unknown) {
  const c = asRecord(raw)
  const statusRaw = str(c.status)
  const isActive = c.isActive !== false && statusRaw !== 'suspended' && statusRaw !== 'archived'
  return {
    id: idOf(c),
    name: str(c.name, 'Category'),
    icon: str(c.icon, 'build'),
    slug: str(c.slug),
    description: str(c.description),
    bannerImageUrl: str(c.bannerImageUrl),
    accentColor: str(c.accentColor),
    sortOrder: num(c.sortOrder, 0),
    isActive,
    status: (statusRaw === 'suspended' || statusRaw === 'archived' || statusRaw === 'active'
      ? statusRaw
      : isActive
        ? 'active'
        : 'suspended') as 'active' | 'suspended' | 'archived',
    subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
    usage: asRecord(c.usage),
  }
}

export function mapAdminTechnician(raw: unknown) {
  const row = asRecord(raw)
  const user = asRecord(row.user ?? row)
  const profile = asRecord(row.profile ?? row)
  const free = asRecord(profile.freeJobs)
  const loc = asRecord(profile.location)
  const locked = Boolean(profile.accountLocked ?? free.locked)
  const suspended = str(user.accountStatus) === 'suspended' || str(profile.accountStatus) === 'suspended'
  const unlockRequested = Boolean(profile.unlockRequestedAt) && locked
  const profileImageUrl = str(profile.profileImageUrl ?? profile.photoUrl, '')
  const completedJobs = num(profile.jobsCompleted, 0)
  const cancelledJobs = num(profile.jobsCancelled, 0)
  const decided = completedJobs + cancelledJobs
  const successRateRaw = profile.successRate
  const successRate =
    successRateRaw == null || successRateRaw === ''
      ? decided > 0
        ? Math.round((completedJobs / decided) * 100)
        : null
      : num(successRateRaw, 0)
  const categoryName = str(profile.primaryCategoryName, '')
  const headline = str(profile.headline, '')
  return {
    id: str(user.id || profile.userId || idOf(row)),
    name: str(user.fullName || row.fullName, 'Technician'),
    avatar: profileImageUrl,
    profileImageUrl,
    trade: headline || categoryName || 'Technician',
    categoryName: categoryName || undefined,
    district: str(loc.district, '—'),
    parish: str(loc.parish, '—'),
    phone: str(user.phone, ''),
    email: str(user.email, ''),
    rating: num(profile.ratingAverage, 0),
    completedJobs,
    cancelledJobs,
    openJobs: num(profile.openJobs, 0),
    successRate,
    freeJobsUsed: num(free.used ?? profile.freeJobsUsed, 0),
    freeLimit: num(free.limit ?? profile.freeJobLimit, 20),
    remainingFreeJobs: num(profile.remainingFreeJobs ?? free.remaining, 0),
    verification: (() => {
      const raw = str(profile.verificationStatus, 'unverified')
      if (raw === 'approved') return 'verified' as const
      if (raw === 'under_review') return 'pending' as const
      return raw as 'pending' | 'verified' | 'rejected' | 'unverified'
    })(),
    lockStatus: (suspended
      ? 'suspended'
      : unlockRequested
        ? 'unlock_requested'
        : locked
          ? 'locked'
          : 'active') as 'active' | 'locked' | 'suspended' | 'unlock_requested',
    lockReason: str(profile.lockReason, '') || undefined,
    unlockRequestedAt: profile.unlockRequestedAt ? String(profile.unlockRequestedAt) : undefined,
    unlockRequestNote: str(profile.unlockRequestNote, '') || undefined,
    level: (RANK_MAP[str(profile.currentRank, 'beginner').toLowerCase()] ??
      'New Professional') as ReputationLevel,
    scores: {
      trust: Math.round(num(profile.trustScore, 0)),
      reliability: Math.round(num(profile.reliabilityScore, 0)),
      completion: Math.round(num(profile.completionScore, 0)),
      response: Math.round(num(profile.responseScore, 0)),
      punctuality: Math.round(num(profile.punctualityScore, 0)),
    },
    badges: [],
    joinedAt: str(user.createdAt || profile.createdAt, ''),
    lastActive: str(user.lastLoginAt || profile.updatedAt, ''),
    repeatCustomerPct: 0,
    portfolioCount: 0,
    availableNow: Boolean(profile.isAvailableNow),
    responseTimeMinutesAvg:
      profile.responseTimeMinutesAvg == null || profile.responseTimeMinutesAvg === ''
        ? null
        : num(profile.responseTimeMinutesAvg, 0),
    subscriptionPlanCode: str(profile.subscriptionPlanCode, '') || null,
    leadCredits: num(profile.leadCredits, 0),
  }
}

export function mapAdminCustomer(raw: unknown) {
  const row = asRecord(raw)
  const user = asRecord(row.user ?? row)
  const profile = asRecord(row.profile ?? {})
  const loc = asRecord(profile.location ?? row.location)
  return {
    id: str(user.id || idOf(row)),
    name: str(user.fullName || row.fullName, 'Customer'),
    avatar: str(profile.photoUrl, ''),
    phone: str(user.phone, ''),
    email: str(user.email, ''),
    district: str(loc.district, '—'),
    parish: str(loc.parish, '—'),
    jobsPosted: num(row.jobsPosted ?? profile.jobsPosted, 0),
    jobsCompleted: num(row.jobsCompleted ?? profile.jobsCompleted, 0),
    totalSpent: num(row.totalSpent, 0),
    status: (str(user.accountStatus) === 'suspended' ? 'suspended' : 'active') as 'active' | 'suspended',
    joinedAt: str(user.createdAt, ''),
    lastJobAt: str(row.lastJobAt, ''),
  }
}

export function mapAdminJob(raw: unknown) {
  const j = asRecord(raw)
  const loc = asRecord(j.location)
  const statusRaw = str(j.status, 'posted')
  const status = (
    ['posted', 'assigned', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed'].includes(
      statusRaw,
    )
      ? statusRaw
      : statusRaw === 'technician_en_route'
        ? 'in_progress'
        : 'posted'
  ) as
    | 'posted'
    | 'assigned'
    | 'in_progress'
    | 'awaiting_confirmation'
    | 'completed'
    | 'cancelled'
    | 'disputed'

  return {
    id: idOf(j),
    publicJobReference: str(j.publicJobReference, '') || undefined,
    title: str(j.title),
    category: str(j.categoryName, 'General'),
    customer: str(asRecord(j.customer).fullName || j.customerName, 'Customer'),
    customerId: j.customerId ? String(j.customerId) : undefined,
    technician: j.assignedTechnicianId
      ? str(asRecord(j.technician).fullName || j.technicianName || j.assignedTechnicianId)
      : undefined,
    technicianId: j.assignedTechnicianId ? String(j.assignedTechnicianId) : undefined,
    district: str(loc.district, '—'),
    parish: str(loc.parish, '—'),
    status,
    budget: num(j.budgetMax ?? j.budgetMin, 0),
    createdAt: str(j.createdAt),
    matchScore: num(j.aiMatchScore, 0) || undefined,
    successScore: num(j.successPrediction, 0) || undefined,
    disputed: status === 'disputed',
    description: str(j.description, ''),
    currency: str(j.currency, 'UGX'),
    applicationCount: num(j.applicationCount, 0),
    photoUrls: Array.isArray(j.photoUrls) ? (j.photoUrls as unknown[]).map(String) : [],
    statusHistory: Array.isArray(j.statusHistory)
      ? (j.statusHistory as Array<Record<string, unknown>>).map((h) => ({
          status: str(h.status),
          changedAt: str(h.changedAt),
          note: str(h.note, ''),
        }))
      : [],
    timeline: Array.isArray(j.timeline)
      ? (j.timeline as Array<Record<string, unknown>>).map((t) => ({
          type: str(t.type),
          at: str(t.at),
        }))
      : [],
  }
}
