import { apiGet, apiPost } from './client'

export const applicationsApi = {
  apply(jobId: string, body?: { message?: string; proposedAmount?: number }) {
    return apiPost<{ application: Record<string, unknown> }>(`/jobs/${jobId}/applications`, body ?? {})
  },

  listForJob(jobId: string, params?: Record<string, unknown>) {
    return apiGet<{
      items: unknown[]
      comparison?: unknown[]
      meta?: Record<string, unknown>
    }>(`/jobs/${jobId}/applications`, params)
  },

  listMine(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/applications/me', params)
  },

  accept(id: string) {
    return apiPost<{ application: Record<string, unknown>; job: Record<string, unknown> }>(
      `/applications/${id}/accept`,
    )
  },

  reject(id: string) {
    return apiPost<{ application: Record<string, unknown> }>(`/applications/${id}/reject`)
  },

  withdraw(id: string) {
    return apiPost<{ application: Record<string, unknown> }>(`/applications/${id}/withdraw`)
  },
}
