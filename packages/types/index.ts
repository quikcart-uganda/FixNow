export type ReputationLevel =
  | 'New Professional'
  | 'Active'
  | 'Trusted'
  | 'Preferred'
  | 'Top Performer'
  | 'Elite Partner'
  /** @deprecated legacy aliases — mapped in mappers */
  | 'Beginner'
  | 'Rising'
  | 'Expert'
  | 'Elite'
  | 'Master'

export type JobStatus =
  | 'Open'
  | 'Assigned'
  | 'En Route'
  | 'Started'
  | 'Awaiting Confirmation'
  | 'Completed'
  | 'Skipped'

export type AccountStatus = 'active' | 'locked'

export interface TrustScores {
  trust: number
  reliability: number
  completion: number
  response: number
  punctuality: number
}

export interface BadgeItem {
  id: string
  label: string
  icon: string
  tone?: 'primary' | 'success' | 'secondary' | 'tertiary' | 'warning'
}

export interface PortfolioItem {
  id: string
  title: string
  description: string
  beforeImage: string
  afterImage: string
  category: string
  type: 'photo' | 'video' | 'certificate' | 'case-study'
}

export interface ReviewItem {
  id: string
  author: string
  avatar: string
  rating: number
  comment: string
  date: string
  jobTitle: string
  categories: {
    quality: number
    professionalism: number
    communication: number
    timeliness: number
  }
}

export interface NearbyJob {
  id: string
  category: string
  title: string
  description: string
  distanceKm: number
  etaMinutes?: number
  etaLabel?: string
  postedAgo: string
  budget: string
  parish: string
  district: string
  photos: string[]
  customerName: string
  customerRating: number
  customerJobs: number
  matchScore: number
  successScore: number
  matchReasons: string[]
  urgent?: boolean
  bestMatch?: boolean
}

export interface AssignedJob {
  id: string
  category: string
  title: string
  description: string
  status: JobStatus
  address: string
  parish: string
  district: string
  customerName: string
  customerAvatar: string
  customerRating: number
  photos: string[]
  budget: string
  scheduledAt: string
  contactHidden?: boolean
}

export interface NotificationItem {
  id: string
  type: 'job' | 'assigned' | 'message' | 'completion' | 'lock' | 'achievement' | 'referral'
  title: string
  body: string
  time: string
  read: boolean
  href?: string
}

export interface Conversation {
  id: string
  customerName: string
  customerAvatar: string
  jobTitle: string
  lastMessage: string
  time: string
  unread: number
}

export interface ChatMessage {
  id: string
  sender: 'me' | 'them'
  text: string
  time: string
  type?: 'text' | 'image' | 'location'
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  progress: number
  target: number
  unlocked: boolean
}

export interface TechnicianProfile {
  id: string
  name: string
  phone: string
  email: string
  photo: string
  /** Canonical signed/public profile image URL from API */
  profileImageUrl?: string
  category: string
  subcategories: string[]
  experienceYears: number
  skills: string[]
  certifications: string[]
  serviceAreas: string[]
  parish: string
  district: string
  level: ReputationLevel
  trust: TrustScores
  badges: BadgeItem[]
  rating: number
  reviewCount: number
  jobsWon: number
  jobsCompleted: number
  freeJobsUsed: number
  freeJobLimit: number
  accountStatus: AccountStatus
  subscriptionPlanCode?: string | null
  subscriptionStatus?:
    | 'none'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'cancelled'
    | 'expired'
    | 'required'
    | 'pending_payment'
  subscriptionPeriodEnd?: string | null
  companyName?: string | null
  businessLogoUrl?: string | null
  businessSlogan?: string | null
  brandPrimaryColor?: string | null
  brandSecondaryColor?: string | null
  companyMission?: string | null
  companyVision?: string | null
  businessRegistrationNumber?: string | null
  taxIdentificationNumber?: string | null
  businessVerificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected' | null
  businessVerificationNote?: string | null
  responseRate: number
  completionRate: number
  repeatCustomerPct: number
  earningsWeek: number
  mobileMoney: string
  mobileMoneyName: string
  availability: string
  workingHours: string
  bio: string
  points: number
  nextLevel: ReputationLevel
  nextLevelProgress: number
}
