import { apiGet, apiPatch, apiPost } from './client'

export type CreateJobInput = {
  title: string
  description: string
  categoryId?: string
  subcategoryId?: string
  categoryName?: string
  parish?: string
  district?: string
  budgetMin?: number
  budgetMax?: number
  currency?: string
  preferredDate?: string
  location?: Record<string, unknown>
  photoUrls?: string[]
  videoUrls?: string[]
  publish?: boolean
}

export const jobsApi = {
  create(input: CreateJobInput) {
    return apiPost<{ job: Record<string, unknown> }>('/jobs', input)
  },

  list(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/jobs', params)
  },

  nearby(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/jobs/nearby', params)
  },

  getById(id: string) {
    return apiGet<{ job: Record<string, unknown>; customer?: Record<string, unknown> }>(`/jobs/${id}`)
  },

  update(id: string, body: Record<string, unknown>) {
    return apiPatch<{ job: Record<string, unknown> }>(`/jobs/${id}`, body)
  },

  updateStatus(id: string, status: string, note?: string) {
    return apiPatch<{ job: Record<string, unknown> }>(`/jobs/${id}/status`, { status, note })
  },

  requestCompletion(
    id: string,
    body: {
      notes?: string
      photoUrls?: string[]
      materialsUsed?: string
      completedAtEstimate?: string
      confirmedByTechnician: true
    },
  ) {
    return apiPost<{ job: Record<string, unknown> }>(`/jobs/${id}/request-completion`, body)
  },

  confirmCompletion(id: string, note?: string) {
    return apiPost<{ job: Record<string, unknown> }>(`/jobs/${id}/confirm-completion`, { note })
  },

  reportCompletionIssue(
    id: string,
    body: {
      category: string
      description: string
      photoUrls?: string[]
      comments?: string
    },
  ) {
    return apiPost<{ job: Record<string, unknown> }>(`/jobs/${id}/report-completion-issue`, body)
  },

  reopen(id: string, reason?: string) {
    return apiPost<{ job: Record<string, unknown> }>(`/jobs/${id}/reopen`, { reason })
  },

  publish(id: string) {
    return apiPost<{ job: Record<string, unknown> }>(`/jobs/${id}/publish`)
  },

  cancel(id: string) {
    return apiPost<{ job: Record<string, unknown> }>(`/jobs/${id}/cancel`)
  },

  archive(id: string) {
    return apiPost<{ job: Record<string, unknown> }>(`/jobs/${id}/archive`)
  },
}
