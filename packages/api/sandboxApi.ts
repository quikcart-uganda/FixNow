import { apiGet, apiPatch, apiPost } from './client'

export type SandboxSettings = {
  enableSandbox: boolean
  hideSandboxFromReports: boolean
  allowAvatars: boolean
  requireRealPhotos: boolean
  defaultAvatarId: string
  availableAvatarCollections: string[]
}

export type SandboxCounts = {
  users: number
  customers: number
  technicians: number
  jobs: number
  offers: number
  applications: number
}

export type SandboxOverview = {
  settings: SandboxSettings
  environments: string[]
  counts: { sandbox: SandboxCounts; production: SandboxCounts; demo: SandboxCounts }
  demoLoginHint: { emailDomain: string; password: string; tag: string } | null
  neverPromote: string[]
  promotable: string[]
  /** Phase 1 — only these promote handlers work today. */
  promoteImplemented?: string[]
  promoteUnimplemented?: string[]
}

export type AvatarItem = {
  id: string
  label: string
  collection: string
  style: string
  gender: string
  ageGroup: string
  professionHint?: string
  skinTone: string
  url: string
}

export const sandboxApi = {
  overview() {
    return apiGet<SandboxOverview>('/admin/sandbox')
  },
  updateSettings(body: Partial<SandboxSettings>) {
    return apiPatch<SandboxSettings>('/admin/sandbox/settings', body)
  },
  createDemo(body?: { environment?: string; regenerate?: boolean }) {
    return apiPost('/admin/sandbox/demo/create', body ?? {})
  },
  regenerate() {
    return apiPost('/admin/sandbox/demo/regenerate', {})
  },
  deleteDemo(environment = 'sandbox') {
    return apiPost('/admin/sandbox/demo/delete', { environment })
  },
  archive(environment = 'sandbox') {
    return apiPost('/admin/sandbox/demo/archive', { environment })
  },
  suspend() {
    return apiPost('/admin/sandbox/demo/suspend', {})
  },
  reactivate() {
    return apiPost('/admin/sandbox/demo/reactivate', {})
  },
  reset() {
    return apiPost('/admin/sandbox/demo/reset', {})
  },
  exportData(environment = 'sandbox') {
    return apiGet(`/admin/sandbox/export?environment=${encodeURIComponent(environment)}`)
  },
  listSection(section: string, environment = 'sandbox') {
    return apiGet<{ items: unknown[] }>(
      `/admin/sandbox/sections/${encodeURIComponent(section)}?environment=${encodeURIComponent(environment)}`,
    )
  },
  promote(resourceType: string, resourceId: string) {
    return apiPost('/admin/sandbox/promote', { resourceType, resourceId })
  },
  analytics(view: 'production' | 'sandbox' | 'combined' = 'production') {
    return apiGet(`/admin/sandbox/analytics?view=${encodeURIComponent(view)}`)
  },
  listAvatars(collection?: string) {
    const q = collection ? `?collection=${encodeURIComponent(collection)}` : ''
    return apiGet<{ items: AvatarItem[] }>(`/public/avatars${q}`)
  },
}
