// Customer-facing display types — data comes from @fixnow/api at runtime.

export interface CustomerCategory {
  id: string
  name: string
  icon: string
  bannerImageUrl?: string
  slug?: string
}

export interface CustomerTechnician {
  id: string
  name: string
  trade: string
  tier: 'Elite' | 'Pro'
  rating: number
  trustScore: number
  jobs: string
  jobsCompleted?: number
  startingFrom: string
  online: boolean
  photo: string
  profileImageUrl?: string
  neighborsHired: number
  primaryCategoryId?: string
  district?: string
  verified?: boolean
  latitude?: number
  longitude?: number
  distanceLabel?: string
  distanceKm?: number
  etaMinutes?: number
  etaLabel?: string
  indicators?: string[]
  responseTimeLabel?: string
  rankingScore?: number
  featuredPlacement?: boolean
  businessSpotlight?: boolean
  boostActive?: boolean
  subscriptionPlanCode?: string | null
  subscriptionBadge?: {
    text: string
    icon?: string
    color?: string
    borderColor?: string
    glow?: boolean
    size?: 'sm' | 'md' | 'lg'
  } | null
}
