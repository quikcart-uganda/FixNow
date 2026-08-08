import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export type MarketingCreativeKind = 'slide' | 'banner' | 'announcement' | 'portfolio_campaign'

export type MarketingCreative = {
  id: string
  technicianUserId: string
  kind: MarketingCreativeKind
  title: string
  headline?: string
  description?: string
  imageUrl?: string
  ctaLabel?: string
  ctaHref?: string
  promotionText?: string
  sortOrder: number
  startsAt?: string
  endsAt?: string
  status: string
  rejectionReason?: string
  adminNote?: string
  analytics?: { views: number; clicks: number }
  createdAt?: string
  technician?: { name?: string; phone?: string; email?: string } | null
}

export const technicianMarketingApi = {
  listMine(params?: { kind?: MarketingCreativeKind }) {
    return apiGet<{
      items: MarketingCreative[]
      entitlements: {
        planCode: string | null
        limits: Record<string, number>
        featureFlags: Record<string, boolean>
      }
    }>('/marketing/creatives/me', params)
  },

  create(body: Record<string, unknown>) {
    return apiPost<{ creative: MarketingCreative }>('/marketing/creatives/me', body)
  },

  update(id: string, body: Record<string, unknown>) {
    return apiPatch<{ creative: MarketingCreative }>(`/marketing/creatives/me/${id}`, body)
  },

  submit(id: string) {
    return apiPost<{ creative: MarketingCreative }>(`/marketing/creatives/me/${id}/submit`)
  },

  pause(id: string) {
    return apiPost<{ creative: MarketingCreative }>(`/marketing/creatives/me/${id}/pause`)
  },

  remove(id: string) {
    return apiDelete(`/marketing/creatives/me/${id}`)
  },

  professionalDashboard() {
    return apiGet<{
      entitlements: Record<string, unknown>
      subscription: Record<string, unknown>
      performance: Record<string, number>
      limits: Record<string, number>
      tips: string[]
    }>('/technicians/me/professional-dashboard')
  },

  deliverCustomer(params?: { district?: string; limit?: number }) {
    return apiGet<{
      slides: Array<Record<string, unknown>>
      banners: Array<Record<string, unknown>>
      announcements: Array<Record<string, unknown>>
    }>('/marketing/creatives/customer', params)
  },

  track(id: string, event: 'view' | 'click') {
    return apiPost(`/marketing/creatives/${id}/track`, { event })
  },
}
