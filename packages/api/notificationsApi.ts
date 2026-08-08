import { apiGet, apiPost, apiPut } from './client'

export const notificationsApi = {
  list(params?: Record<string, unknown>) {
    return apiGet<{
      items: unknown[]
      unreadCount?: number
      meta?: Record<string, unknown>
    }>('/notifications', params)
  },

  markRead(id: string) {
    return apiPost<{ notification: unknown; unreadCount?: number }>(`/notifications/${id}/read`)
  },

  markAllRead() {
    return apiPost<{ updated: number; unreadCount: number }>('/notifications/read-all')
  },

  getPreferences() {
    return apiGet<{ preferences: Record<string, unknown> }>('/notifications/preferences')
  },

  updatePreferences(body: Record<string, unknown>) {
    return apiPut<{ preferences: Record<string, unknown> }>('/notifications/preferences', body)
  },

  async updatePreferencesResilient(body: Record<string, unknown>) {
    const { mutateWithOfflineFallback } = await import('@fixnow/native')
    const result = await mutateWithOfflineFallback(
      () => apiPut<{ preferences: Record<string, unknown> }>('/notifications/preferences', body),
      {
        method: 'PUT',
        url: '/notifications/preferences',
        body,
        label: 'Update notification preferences',
      },
    )
    if (result.queued) {
      return {
        data: { preferences: body, queued: true },
        message: 'Saved offline — will sync when online',
        meta: { queued: true },
      }
    }
    return result.data!
  },

  listDevices(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>('/devices', params)
  },

  registerDevice(body: {
    token: string
    platform: 'web' | 'android' | 'ios'
    deviceId?: string
    appVersion?: string
    locale?: string
    timezone?: string
    meta?: Record<string, unknown>
  }) {
    return apiPost<{ device: Record<string, unknown> }>('/devices', body)
  },

  refreshDevice(body: {
    oldToken?: string
    newToken: string
    platform: 'web' | 'android' | 'ios'
    deviceId?: string
  }) {
    return apiPost<{ device: Record<string, unknown> }>('/devices/refresh', body)
  },

  removeDevice(body: { token?: string; deviceId?: string }) {
    return apiPost<{ removed: number }>('/devices/remove', body)
  },

  pushStats(days = 7) {
    return apiGet<Record<string, unknown>>('/admin/push/stats', { days })
  },

  retryDelivery(id: string) {
    return apiPost(`/admin/push/retry/${id}`)
  },

  processRetries() {
    return apiPost<{ processed: number }>('/admin/push/process-retries')
  },

  broadcast(body: {
    title: string
    body: string
    roles?: string[]
    userIds?: string[]
    href?: string
  }) {
    return apiPost<{ recipients: number }>('/admin/notifications/broadcast', body)
  },
}