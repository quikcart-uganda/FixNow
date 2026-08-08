import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export type OfferType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'free_call_out'
  | 'free_inspection'
  | 'bundle'
  | 'seasonal'
  | 'limited_time'
  | 'referral'
  | 'custom'

export type OfferLifecycle =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'active'
  | 'expired'
  | 'archived'

export interface OfferAnalytics {
  views: number
  clicks: number
  bookings: number
  revenueGenerated: number
  redemptionCount: number
  conversionRate: number
  remainingRedemptions: number | null
  expiryCountdownMs: number
  expiryCountdownHours: number
}

export interface TechnicianOffer {
  id: string
  technicianId: string
  type: OfferType
  title: string
  subtitle?: string
  description: string
  terms?: string
  bannerImageUrl?: string
  promotionColor?: string
  badge?: string
  categoryIds: string[]
  serviceNames: string[]
  serviceAreaDistricts: string[]
  availabilityNote?: string
  discountValue?: number
  currency: string
  minimumBookingAmount?: number
  maximumDiscountAmount?: number
  maxRedemptions?: number
  perCustomerLimit?: number
  startsAt: string
  endsAt: string
  timeStart?: string
  timeEnd?: string
  weekdays: string[]
  holidayNotes?: string
  status: string
  lifecycle: OfferLifecycle
  customerVisible: boolean
  featured?: boolean
  rejectionReason?: string
  reviewedAt?: string
  submittedAt?: string
  publishedAt?: string
  analytics: OfferAnalytics
  createdAt?: string
  updatedAt?: string
  /** Enriched on customer public endpoints */
  technician?: {
    id: string
    name: string
    photoUrl?: string
    profileImageUrl?: string
    rating: number
    trustScore: number
    jobsCompleted: number
    district?: string
    trade?: string
    /** Admin-configured plan trust badge — presentation only (no billing). */
    subscriptionBadge?: {
      text: string
      icon?: string
      color?: string
      borderColor?: string
      glow?: boolean
      size?: 'sm' | 'md' | 'lg'
    } | null
  }
  distanceLabel?: string
  saved?: boolean
  remindBeforeExpiry?: boolean
}

export type PublicOfferSort = 'newest' | 'discount' | 'highest_discount' | 'expiring' | 'expiring_soon' | 'popular' | 'most_popular'

export type OfferHomeFeed = {
  featured: TechnicianOffer[]
  nearby: TechnicianOffer[]
  recommended: TechnicianOffer[]
  expiringSoon: TechnicianOffer[]
  popular: TechnicianOffer[]
}

export type OfferModerationAction =
  | 'approve'
  | 'reject'
  | 'archive'
  | 'suspend'
  | 'feature'
  | 'unfeature'
  | 'expire'
  | 'delete'

export type OfferInput = {
  type: OfferType
  title: string
  subtitle?: string
  description: string
  terms?: string
  bannerImageUrl?: string
  promotionColor?: string
  badge?: string
  categoryIds?: string[]
  serviceNames?: string[]
  serviceAreaDistricts?: string[]
  availabilityNote?: string
  discountValue?: number
  currency?: string
  minimumBookingAmount?: number
  maximumDiscountAmount?: number
  maxRedemptions?: number
  perCustomerLimit?: number
  startsAt: string
  endsAt: string
  timeStart?: string
  timeEnd?: string
  weekdays?: string[]
  holidayNotes?: string
}

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  percentage_discount: 'Percentage Discount',
  fixed_discount: 'Fixed Discount',
  free_call_out: 'Free Call-out',
  free_inspection: 'Free Inspection',
  bundle: 'Bundle Offer',
  seasonal: 'Seasonal Offer',
  limited_time: 'Limited Time',
  referral: 'Referral Offer',
  custom: 'Custom Promotion',
}

export const offersApi = {
  dashboard() {
    return apiGet<{
      counts: Record<OfferLifecycle, number>
      totals: {
        offers: number
        views: number
        clicks: number
        bookings: number
        revenueGenerated: number
        conversionRate: number
      }
      recent: TechnicianOffer[]
    }>('/offers/me/dashboard')
  },

  listMine(params?: { lifecycle?: OfferLifecycle | string; q?: string; page?: number; limit?: number }) {
    return apiGet<{ items: TechnicianOffer[]; meta?: Record<string, unknown> }>('/offers/me', params)
  },

  getMine(id: string) {
    return apiGet<{ offer: TechnicianOffer }>(`/offers/me/${id}`)
  },

  create(body: OfferInput) {
    return apiPost<{ offer: TechnicianOffer }>('/offers/me', body)
  },

  update(id: string, body: Partial<OfferInput>) {
    return apiPatch<{ offer: TechnicianOffer }>(`/offers/me/${id}`, body)
  },

  submit(id: string) {
    return apiPost<{ offer: TechnicianOffer }>(`/offers/me/${id}/submit`)
  },

  withdraw(id: string) {
    return apiPost<{ offer: TechnicianOffer }>(`/offers/me/${id}/withdraw`)
  },

  archive(id: string) {
    return apiPost<{ offer: TechnicianOffer }>(`/offers/me/${id}/archive`)
  },

  remove(id: string) {
    return apiDelete<{ ok: boolean }>(`/offers/me/${id}`)
  },

  analytics(offerId?: string) {
    return apiGet<Record<string, unknown>>('/offers/me/analytics', offerId ? { offerId } : undefined)
  },

  listPublic(params?: {
    technicianId?: string
    district?: string
    categoryId?: string
    sort?: PublicOfferSort | string
    section?: string
    page?: number
    limit?: number
  }) {
    return apiGet<{ items: TechnicianOffer[]; meta?: Record<string, unknown> }>('/offers/public', params)
  },

  homeFeed(params?: { district?: string }) {
    return apiGet<OfferHomeFeed>('/offers/public/home', params)
  },

  getPublic(id: string, params?: { district?: string }) {
    return apiGet<{ offer: TechnicianOffer }>(`/offers/public/${id}`, params)
  },

  track(id: string, event: 'view' | 'click' | 'booking', amount?: number) {
    return apiPost<{ offer: TechnicianOffer }>(`/offers/public/${id}/track`, { event, amount })
  },

  listSaved(params?: { page?: number; limit?: number }) {
    return apiGet<{ items: TechnicianOffer[]; meta?: Record<string, unknown> }>('/offers/saved', params)
  },

  save(id: string) {
    return apiPost<{ offer: TechnicianOffer }>(`/offers/saved/${id}`)
  },

  unsave(id: string) {
    return apiDelete<{ ok: boolean }>(`/offers/saved/${id}`)
  },

  setReminder(id: string, remindBeforeExpiry: boolean) {
    return apiPatch<{ remindBeforeExpiry: boolean; saved: boolean }>(`/offers/saved/${id}/reminder`, {
      remindBeforeExpiry,
    })
  },

  adminList(params?: { lifecycle?: string; q?: string; page?: number; limit?: number }) {
    return apiGet<{ items: TechnicianOffer[]; meta?: Record<string, unknown> }>('/admin/offers', params)
  },

  adminModerate(id: string, action: OfferModerationAction, reason?: string) {
    return apiPost<{ offer: TechnicianOffer }>(`/admin/offers/${id}/moderate`, { action, reason })
  },

  adminDuplicate(id: string) {
    return apiPost<{ offer: TechnicianOffer }>(`/admin/offers/${id}/duplicate`)
  },

  /** Banner upload — reuses the shared authenticated upload endpoint (Cloudinary). */
  async uploadBanner(file: File) {
    const { uploadMediaFile } = await import('./uploadMedia')
    return uploadMediaFile(file, 'banner')
  },
}
