import { apiGet, apiPatch, apiPost } from './client'

export type DeveloperPreviewPlanOption = {
  code: string
  label: string
  simulationOnly: boolean
  includesBoost: boolean
  cataloguePlanCode: string
}

export type DeveloperPreviewAvailability = {
  eligible: boolean
  reason: string | null
  sandboxEnabled: boolean
  settings: {
    enablePreview: boolean
    suspendPreview: boolean
    enabledPlans: Record<string, boolean>
    defaultDurationHours: number
  }
  activeSession: {
    id: string
    planCode: string
    environment: string
    activatedAt: string
    expiresAt: string
    activeBoosts: boolean
    simulationOnly: boolean
    subscriptionSource: 'developer_preview'
  } | null
  plans: DeveloperPreviewPlanOption[]
}

export const developerPreviewApi = {
  availability() {
    return apiGet<DeveloperPreviewAvailability>('/subscriptions/developer-preview')
  },
  activate(planCode: string, durationHours?: number) {
    return apiPost<{ session: DeveloperPreviewAvailability['activeSession'] }>(
      '/subscriptions/developer-preview/activate',
      { planCode, durationHours },
    )
  },
  exit() {
    return apiPost<{ exited: boolean }>('/subscriptions/developer-preview/exit', {})
  },
  adminOverview() {
    return apiGet<{
      settings: Record<string, unknown>
      activeSessions: unknown[]
      analytics: Record<string, unknown>
    }>('/admin/developer-preview')
  },
  adminUpdateSettings(body: Record<string, unknown>) {
    return apiPatch('/admin/developer-preview/settings', body)
  },
  adminSessions(history = false) {
    return apiGet<{ items: unknown[] }>('/admin/developer-preview/sessions', {
      history: history ? 'true' : undefined,
    })
  },
  adminTerminate(id: string) {
    return apiPost(`/admin/developer-preview/sessions/${id}/terminate`, {})
  },
  adminTerminateAll() {
    return apiPost('/admin/developer-preview/sessions/terminate-all', {})
  },
  adminAnalytics() {
    return apiGet('/admin/developer-preview/analytics')
  },
}
