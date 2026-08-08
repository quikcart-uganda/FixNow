import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export type ContentBlockType =
  | 'hero_headline'
  | 'hero_description'
  | 'welcome_message'
  | 'promo_banner'
  | 'announcement'
  | 'sponsored_campaign'
  | 'advertisement'
  | 'educational'
  | 'safety_tip'
  | 'service_awareness'
  | 'referral_campaign'
  | 'seasonal_campaign'
  | 'recruitment_campaign'
  | 'technician_onboarding'
  | 'customer_onboarding'
  | 'feature_announcement'
  | 'feature_card'

export type ContentBlockAudience =
  | 'customers'
  | 'technicians'
  | 'both'
  | 'guests'
  | 'logged_in'
  | 'new_users'
  | 'returning_users'

export type ContentBlockStatus = 'draft' | 'scheduled' | 'published' | 'expired' | 'archived'

export type DeliveredContentBlock = {
  id: string
  type: ContentBlockType
  page: string
  section: string
  title?: string
  subtitle?: string
  body?: string
  imageUrl?: string
  icon?: string
  ctaLabel?: string
  ctaHref?: string
  color?: string
  badge?: string
  priority: number
  displayOrder: number
  weight: number
}

export type ContentDeliveryResponse = {
  items: DeliveredContentBlock[]
  bySection: Record<string, DeliveredContentBlock[]>
  channel: string
  audiences: string[]
}

export type AdminContentBlock = DeliveredContentBlock & {
  audience: ContentBlockAudience
  locale: string
  status: ContentBlockStatus
  startsAt?: string | null
  endsAt?: string | null
  maxImpressions?: number | null
  frequencyCapPerDay?: number | null
  analytics: { impressions: number; clicks: number; ctr: number }
  createdByAdminId?: string
  createdAt?: string
  updatedAt?: string
}

export type ContentBlockWriteBody = {
  type?: ContentBlockType
  audience?: ContentBlockAudience
  page?: string
  section?: string
  locale?: string
  title?: string
  subtitle?: string
  body?: string
  imageUrl?: string
  icon?: string
  ctaLabel?: string
  ctaHref?: string
  color?: string
  badge?: string
  status?: ContentBlockStatus
  startsAt?: string | null
  endsAt?: string | null
  priority?: number
  displayOrder?: number
  weight?: number
  maxImpressions?: number | null
  frequencyCapPerDay?: number | null
  publish?: boolean
}

type DeliveryParams = { page?: string; section?: string; locale?: string; segment?: 'new' | 'returning' }

export const contentBlocksApi = {
  // --- Delivery (audience filtered server-side) ---
  deliverPublic(params?: DeliveryParams) {
    return apiGet<ContentDeliveryResponse>('/content/public', params)
  },
  deliverCustomer(params?: DeliveryParams) {
    return apiGet<ContentDeliveryResponse>('/content/customer', params)
  },
  deliverTechnician(params?: DeliveryParams) {
    return apiGet<ContentDeliveryResponse>('/content/technician', params)
  },
  track(id: string, event: 'impression' | 'click') {
    return apiPost<{ ok: boolean }>(`/content/blocks/${id}/track`, { event })
  },

  // --- Admin ---
  listAdmin(params?: Record<string, unknown>) {
    return apiGet<{ items: AdminContentBlock[]; meta?: Record<string, unknown> }>('/admin/content-blocks', params)
  },
  analytics() {
    return apiGet<{
      totals: {
        blocks: number
        live: number
        scheduled: number
        draft: number
        impressions: number
        clicks: number
        ctr: number
      }
      topPerforming: Array<{
        id: string
        title: string
        page: string
        section: string
        impressions: number
        clicks: number
      }>
    }>('/admin/content-blocks/analytics')
  },
  getAdmin(id: string) {
    return apiGet<{ block: AdminContentBlock }>(`/admin/content-blocks/${id}`)
  },
  create(body: ContentBlockWriteBody) {
    return apiPost<{ block: AdminContentBlock }>('/admin/content-blocks', body)
  },
  update(id: string, body: ContentBlockWriteBody) {
    return apiPatch<{ block: AdminContentBlock }>(`/admin/content-blocks/${id}`, body)
  },
  setStatus(id: string, status: ContentBlockStatus) {
    return apiPost<{ block: AdminContentBlock }>(`/admin/content-blocks/${id}/status`, { status })
  },
  duplicate(id: string) {
    return apiPost<{ block: AdminContentBlock }>(`/admin/content-blocks/${id}/duplicate`, {})
  },
  remove(id: string) {
    return apiDelete<{ ok: boolean }>(`/admin/content-blocks/${id}`)
  },
  seed() {
    return apiPost<{ created: number; total: number }>('/admin/content-blocks/seed', {})
  },
}
