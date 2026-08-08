import { apiGet, apiPatch, apiPost } from './client'

export const reviewsApi = {
  create(body: {
    jobId: string
    rating: number
    comment?: string
    categories?: {
      quality?: number
      professionalism?: number
      communication?: number
      timeliness?: number
      valueForMoney?: number
    }
  }) {
    return apiPost<Record<string, unknown>>('/reviews', body)
  },

  edit(
    id: string,
    body: {
      rating?: number
      comment?: string
      categories?: Record<string, number>
    },
  ) {
    return apiPatch<Record<string, unknown>>(`/reviews/${id}`, body)
  },

  listForTechnician(technicianId: string, params?: Record<string, unknown>) {
    return apiGet<{
      items: unknown[]
      summary?: { ratingAverage: number; reviewCount: number; distribution: Record<string, number> }
      meta?: Record<string, unknown>
    }>(`/technicians/${technicianId}/reviews`, params)
  },

  forJob(jobId: string) {
    return apiGet<{
      canCustomerReview?: boolean
      canTechnicianReview?: boolean
      customerToTechnician?: { review: Record<string, unknown>; rating?: Record<string, unknown> } | null
      technicianToCustomer?: { review: Record<string, unknown> } | null
      editWindowMs?: number
    }>(`/jobs/${jobId}/reviews`)
  },

  flag(id: string, reason?: string) {
    return apiPost(`/reviews/${id}/flag`, { reason })
  },

  reputationMe(role?: 'customer' | 'technician') {
    return apiGet<Record<string, unknown>>('/reputation/me', role ? { role } : undefined)
  },

  adminList(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/admin/reviews', params)
  },

  moderate(id: string, action: 'approve' | 'hide' | 'remove') {
    return apiPost(`/admin/reviews/${id}/moderate`, { action })
  },

  analytics() {
    return apiGet<Record<string, unknown>>('/admin/reviews/analytics')
  },
}

export const achievementsApi = {
  catalog() {
    return apiGet<{ achievements: unknown[]; badges: unknown[] }>('/achievements')
  },
  mine() {
    return apiGet<{ items: unknown[]; badges: unknown[] }>('/achievements/me')
  },
}
