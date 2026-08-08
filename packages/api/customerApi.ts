import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export const customerApi = {
  getProfile() {
    return apiGet<{ user: Record<string, unknown>; profile: Record<string, unknown> }>('/customers/me')
  },

  updateProfile(body: Record<string, unknown>) {
    return apiPatch<{ user: Record<string, unknown>; profile: Record<string, unknown> }>('/customers/me', body)
  },

  /** Offline-safe profile patch. */
  async updateProfileResilient(body: Record<string, unknown>) {
    const { mutateWithOfflineFallback } = await import('@fixnow/native')
    const result = await mutateWithOfflineFallback(
      () => apiPatch<{ user: Record<string, unknown>; profile: Record<string, unknown> }>('/customers/me', body),
      {
        method: 'PATCH',
        url: '/customers/me',
        body,
        label: 'Update profile',
      },
    )
    if (result.queued) {
      return {
        data: { user: {}, profile: body, queued: true },
        message: 'Saved offline — will sync when online',
        meta: { queued: true },
      }
    }
    return result.data!
  },

  listSavedTechnicians(params?: { page?: number; limit?: number }) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/customers/me/saved-technicians', params)
  },

  saveTechnician(id: string) {
    return apiPost(`/customers/me/saved-technicians/${id}`)
  },

  removeSavedTechnician(id: string) {
    return apiDelete(`/customers/me/saved-technicians/${id}`)
  },

  listAddresses() {
    return apiGet<{ items: unknown[] }>('/customers/me/addresses')
  },

  createAddress(body: Record<string, unknown>) {
    return apiPost('/customers/me/addresses', body)
  },

  updateAddress(id: string, body: Record<string, unknown>) {
    return apiPatch(`/customers/me/addresses/${id}`, body)
  },

  deleteAddress(id: string) {
    return apiDelete(`/customers/me/addresses/${id}`)
  },

  jobHistory(params?: { page?: number; limit?: number; status?: string }) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/customers/me/jobs', params)
  },
}
