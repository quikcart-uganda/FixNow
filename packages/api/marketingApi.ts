import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export type PlatformPromoKind =
  | 'holiday'
  | 'welcome'
  | 'referral'
  | 'seasonal'
  | 'announcement'
  | 'custom'

export type MarketingStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired' | 'archived'

export interface PlatformPromotion {
  id: string
  kind: PlatformPromoKind
  title: string
  subtitle?: string
  description: string
  terms?: string
  bannerImageUrl?: string
  badge?: string
  promotionColor?: string
  code?: string
  discountType: string
  discountValue: number
  currency: string
  audience: string
  startsAt: string
  endsAt: string
  maxRedemptions?: number
  redemptionCount: number
  status: MarketingStatus
  featured: boolean
  analytics: {
    views: number
    clicks: number
    redemptions: number
    revenueGenerated: number
    ctr: number
    conversion: number
  }
}

export type SponsoredContentType =
  | 'educational_banner'
  | 'safety_campaign'
  | 'tip'
  | 'partner_ad'
  | 'announcement'
  | 'community_notice'
  | 'sponsored_advertisement'
  | 'platform_announcement'
  | 'government_campaign'
  | 'seasonal_promotion'
  | 'technician_recruitment'
  | 'partner_promotion'
  | 'emergency_awareness'
  | 'referral_campaign'

export interface SponsoredContent {
  id: string
  type: SponsoredContentType
  title: string
  subtitle?: string
  body: string
  bannerImageUrl?: string
  desktopImageUrl?: string
  mobileImageUrl?: string
  sponsorLogoUrl?: string
  badge?: string
  ctaLabel?: string
  ctaHref?: string
  placement: string
  audience?: string
  sponsorName?: string
  startsAt: string
  endsAt: string
  status: MarketingStatus
  priority: number
  displayOrder?: number
  analytics: { impressions: number; clicks: number; dismissals?: number; ctr: number }
}

export type MarketingDeliveryItem = {
  id: string
  type?: string
  kind?: string
  title: string
  subtitle?: string
  description?: string
  body?: string
  bannerImageUrl?: string
  desktopImageUrl?: string
  mobileImageUrl?: string
  sponsorLogoUrl?: string
  badge?: string
  promotionColor?: string
  code?: string
  discountType?: string
  discountValue?: number
  currency?: string
  featured?: boolean
  ctaLabel?: string
  ctaHref?: string
  placement?: string
  sponsorName?: string
  priority?: number
  displayOrder?: number
  startsAt?: string
  endsAt?: string
}

export type MarketingDelivery = {
  channel: string
  promotions: MarketingDeliveryItem[]
  sponsored: MarketingDeliveryItem[]
  /** Premium rotating hero banners (placement home_hero / dashboard_hero). */
  hero?: MarketingDeliveryItem[]
  advertisements: MarketingDeliveryItem[]
  educational: MarketingDeliveryItem[]
}

export interface MarketingAnalytics {
  totals: {
    liveOffers: number
    pendingOffers: number
    platformPromotions: number
    sponsoredActive: number
    views: number
    clicks: number
    redemptions: number
    revenueGenerated: number
    ctr: number
    conversion: number
    customerEngagement: number
  }
  mostViewed: Array<{ id: string; title: string; technicianId: string; views: number; clicks: number; bookings: number }>
  mostRedeemed: Array<{ id: string; title: string; technicianId: string; bookings: number; revenue: number }>
  topTechnicians: Array<{
    technicianId: string
    name: string
    views: number
    bookings: number
    revenue: number
    offers: number
  }>
}

export const marketingApi = {
  deliverCustomer(params?: { placement?: string }) {
    return apiGet<MarketingDelivery>('/marketing/customer', params)
  },
  deliverTechnician(params?: { placement?: string }) {
    return apiGet<MarketingDelivery>('/marketing/technician', params)
  },
  deliverPublic(params?: { placement?: string }) {
    return apiGet<MarketingDelivery>('/marketing/public', params)
  },
  trackPromotion(id: string, event: 'view' | 'click') {
    return apiPost<{ ok: boolean }>(`/marketing/promotions/${id}/track`, { event })
  },
  trackSponsored(id: string, event: 'impression' | 'click' | 'dismissal') {
    return apiPost<{ ok: boolean }>(`/marketing/sponsored/${id}/track`, { event })
  },

  analytics() {
    return apiGet<MarketingAnalytics>('/admin/marketing/analytics')
  },

  listPlatformPromotions(params?: { status?: string; kind?: string; q?: string; page?: number; limit?: number }) {
    return apiGet<{ items: PlatformPromotion[]; meta?: Record<string, unknown> }>(
      '/admin/marketing/platform-promotions',
      params,
    )
  },

  createPlatformPromotion(body: Record<string, unknown>) {
    return apiPost<{ promotion: PlatformPromotion }>('/admin/marketing/platform-promotions', body)
  },

  updatePlatformPromotion(id: string, body: Record<string, unknown>) {
    return apiPatch<{ promotion: PlatformPromotion }>(`/admin/marketing/platform-promotions/${id}`, body)
  },

  statusPlatformPromotion(id: string, status: MarketingStatus) {
    return apiPost<{ promotion: PlatformPromotion }>(`/admin/marketing/platform-promotions/${id}/status`, { status })
  },

  deletePlatformPromotion(id: string) {
    return apiDelete(`/admin/marketing/platform-promotions/${id}`)
  },

  listSponsored(params?: { status?: string; type?: string; placement?: string; page?: number; limit?: number }) {
    return apiGet<{ items: SponsoredContent[]; meta?: Record<string, unknown> }>(
      '/admin/marketing/sponsored',
      params,
    )
  },

  createSponsored(body: Record<string, unknown>) {
    return apiPost<{ content: SponsoredContent }>('/admin/marketing/sponsored', body)
  },

  updateSponsored(id: string, body: Record<string, unknown>) {
    return apiPatch<{ content: SponsoredContent }>(`/admin/marketing/sponsored/${id}`, body)
  },

  statusSponsored(id: string, status: MarketingStatus) {
    return apiPost<{ content: SponsoredContent }>(`/admin/marketing/sponsored/${id}/status`, { status })
  },

  deleteSponsored(id: string) {
    return apiDelete(`/admin/marketing/sponsored/${id}`)
  },
}
