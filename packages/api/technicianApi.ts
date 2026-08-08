import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client'

export const technicianApi = {
  search(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/technicians/search', params)
  },

  getPublicProfile(id: string) {
    return apiGet<{ technician: Record<string, unknown> }>(`/technicians/${id}`)
  },

  getProfile() {
    return apiGet<{
      user: Record<string, unknown>
      profile: Record<string, unknown>
      availability?: Record<string, unknown>
      workingHours?: unknown[]
      coverageAreas?: unknown[]
      services?: unknown[]
      trust?: Record<string, unknown>
      portfolio?: Record<string, unknown>
    }>('/technicians/me/profile')
  },

  updateProfile(body: Record<string, unknown>) {
    return apiPatch('/technicians/me/profile', body)
  },

  /** Offline-safe availability update — queues when the device has no network. */
  async updateAvailability(body: Record<string, unknown>) {
    const { mutateWithOfflineFallback } = await import('@fixnow/native')
    const result = await mutateWithOfflineFallback(
      () => apiPatch('/technicians/me/availability', body),
      {
        method: 'PATCH',
        url: '/technicians/me/availability',
        body,
        label: 'Update availability',
      },
    )
    if (result.queued) {
      return { data: { queued: true, availability: body }, message: 'Saved offline — will sync when online', meta: { queued: true } }
    }
    return result.data!
  },

  setWorkingHours(body: unknown) {
    return apiPut('/technicians/me/working-hours', body)
  },

  listCoverage() {
    return apiGet<{ items: unknown[] }>('/technicians/me/coverage')
  },

  addCoverage(body: Record<string, unknown>) {
    return apiPost('/technicians/me/coverage', body)
  },

  deleteCoverage(id: string) {
    return apiDelete(`/technicians/me/coverage/${id}`)
  },

  addService(body: Record<string, unknown>) {
    return apiPost('/technicians/me/services', body)
  },

  dashboard() {
    return apiGet<Record<string, unknown>>('/technicians/me/dashboard')
  },

  getQuota() {
    return apiGet<{
      quota: Record<string, unknown>
      config: Record<string, unknown>
      completedJobHistory: unknown[]
    }>('/technicians/me/quota')
  },

  getProfileCompletion() {
    return apiGet<{
      percent: number
      threshold: number
      belowThreshold: boolean
      canApply: boolean
      requireMinCompletionToApply: boolean
      minApplyPercent: number
      reminderFrequencyDays: number
      sections: Array<{
        id: string
        label: string
        weight: number
        complete: boolean
        hint: string
        href: string
      }>
      nextActions: Array<{ id: string; label: string; hint: string; href: string }>
      benefits: string[]
    }>('/technicians/me/profile-completion')
  },

  dismissProfileReminder() {
    return apiPost<{ dismissed: boolean }>('/technicians/me/profile-completion/dismiss')
  },

  getTrustScore(id: string) {
    return apiGet(`/technicians/${id}/trust-score`)
  },
}
