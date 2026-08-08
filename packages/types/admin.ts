export type ReputationLevel =
  | 'New Professional'
  | 'Active'
  | 'Trusted'
  | 'Preferred'
  | 'Top Performer'
  | 'Elite Partner'
  | 'Beginner'
  | 'Rising'
  | 'Expert'
  | 'Elite'
  | 'Master'

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'unverified'
export type LockStatus = 'active' | 'locked' | 'suspended' | 'unlock_requested'
export type JobStatus =
  | 'posted'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled'
  | 'disputed'

export type FreeLimitMode = number | 'unlimited'

export interface TrustScores {
  trust: number
  reliability: number
  completion: number
  response: number
  punctuality: number
}

export interface AdminTechnician {
  id: string
  name: string
  avatar: string
  profileImageUrl?: string
  trade: string
  categoryName?: string
  district: string
  parish: string
  phone: string
  email: string
  rating: number
  completedJobs: number
  cancelledJobs: number
  openJobs: number
  successRate: number | null
  freeJobsUsed: number
  freeLimit: FreeLimitMode
  remainingFreeJobs: number
  verification: VerificationStatus
  lockStatus: LockStatus
  lockReason?: string
  unlockRequestedAt?: string
  unlockRequestNote?: string
  level: ReputationLevel
  scores: TrustScores
  badges: string[]
  joinedAt: string
  lastActive: string
  repeatCustomerPct: number
  portfolioCount: number
  availableNow: boolean
  responseTimeMinutesAvg: number | null
  subscriptionPlanCode: string | null
  leadCredits: number
}

export interface AdminCustomer {
  id: string
  name: string
  avatar: string
  phone: string
  email: string
  district: string
  parish: string
  jobsPosted: number
  jobsCompleted: number
  totalSpent: number
  status: 'active' | 'suspended'
  joinedAt: string
  lastJobAt: string
}

export interface AdminJob {
  id: string
  /** Human-friendly public reference (e.g. PST-KLA-260726-0935-001). */
  publicJobReference?: string
  title: string
  category: string
  customer: string
  customerId?: string
  technician?: string
  technicianId?: string
  district: string
  parish: string
  status: JobStatus
  budget: number
  createdAt: string
  matchScore?: number
  successScore?: number
  disputed?: boolean
  description?: string
  currency?: string
  applicationCount?: number
  photoUrls?: string[]
  statusHistory?: Array<{ status: string; changedAt?: string; note?: string }>
  timeline?: Array<{ type: string; at?: string }>
}

export interface VerificationRequest {
  id: string
  technicianId: string
  technicianName: string
  avatar: string
  trade: string
  type: 'national_id' | 'selfie' | 'certificate' | 'lc1' | 'combined'
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected'
  docs: { label: string; preview: string }[]
  district: string
}

export interface ServiceCategory {
  id: string
  name: string
  icon: string
  activeJobs: number
  technicians: number
  growth: number
  active: boolean
  status: 'active' | 'suspended' | 'archived'
  description: string
  sortOrder: number
  bannerImageUrl: string
  accentColor: string
  slug: string
}

export interface AuditLog {
  id: string
  admin: string
  action: string
  target: string
  detail: string
  timestamp: string
  ip: string
}

export interface Broadcast {
  id: string
  title: string
  body: string
  audience: 'all' | 'technicians' | 'customers'
  type: 'broadcast' | 'maintenance' | 'policy'
  sentAt: string
  status: 'draft' | 'sent' | 'scheduled'
}

export interface UnlockRequest {
  id: string
  technicianId: string
  technicianName: string
  reason: string
  requestedAt: string
  freeJobsUsed: number
  freeLimit: FreeLimitMode
}

export interface FreeJobSettings {
  enabled: boolean
  defaultLimit: number
  lockAfterLimit: boolean
  adminOverride: boolean
  requireCustomerConfirmation?: boolean
  autoCompleteTimeoutHours?: number
  subscriptionEnabled?: boolean
  gracePeriodDays?: number
  freePlanEnabled?: boolean
  monetizationSuspended?: boolean
}

export interface ContentDoc {
  id: string
  title: string
  type: 'faq' | 'terms' | 'privacy'
  updatedAt: string
  status: 'published' | 'draft'
  excerpt: string
}

export interface SubscriptionPlan {
  id: string
  name: string
  priceUgx: number
  jobsIncluded: number | 'unlimited'
  featured: boolean
  leadCredits: number
  status: 'ready' | 'coming_soon'
}
