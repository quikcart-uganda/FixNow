import { apiGet, apiPost } from './client'

export type ProviderType =
  | 'ai'
  | 'email'
  | 'sms'
  | 'maps'
  | 'push'
  | 'monitoring'
  | 'storage'
  | 'payments'
  | 'analytics'
  | 'search'
  | 'captcha'

export type ProviderStatusRow = {
  type: ProviderType
  typeLabel: string
  id: string
  label: string
  status: 'implemented' | 'planned'
  isNone: boolean
  configured: boolean
  active: boolean
  credentialStatus: 'ok' | 'missing' | 'partial' | 'n/a'
  missingEnv: string[]
  connectionStatus: 'unknown' | 'healthy' | 'degraded' | 'failed' | 'disabled'
  lastTestAt?: string
  lastTestOk?: boolean
  lastTestMessage?: string
  guidance: string
  requiresRestart: boolean
  supportsFailover: boolean
  version?: string
}

export type ProviderTypeSummary = {
  type: ProviderType
  label: string
  description: string
  activeId: string
  failoverId?: string
  providers: ProviderStatusRow[]
}

export type ProvidersListResponse = {
  types: ProviderTypeSummary[]
  discoveredAt: string
}

export type ProviderCatalogEntry = {
  type: ProviderType
  id: string
  label: string
  status: 'implemented' | 'planned'
  isNone: boolean
  requiredEnv: string[]
  optionalEnv: string[]
  guidance: string
  requiresRestart: boolean
}

export type ProviderCatalogResponse = {
  types: Array<{ type: ProviderType; label: string; description: string }>
  providers: ProviderCatalogEntry[]
}

export type ProviderSnapshotRow = {
  id: string
  configured: boolean
  active: boolean
  credentialStatus: ProviderStatusRow['credentialStatus']
  connectionStatus: ProviderStatusRow['connectionStatus']
  status: 'implemented' | 'planned'
  missingEnvCount: number
}

export type ProviderSnapshotType = {
  type: ProviderType
  activeId: string
  failoverId?: string
  providers: ProviderSnapshotRow[]
}

export type ProviderSnapshotResponse = {
  types: ProviderSnapshotType[]
  discoveredAt: string
}

export type ProviderActivateResponse = {
  ok: boolean
  type: ProviderType
  activeId: string
  requiresRestart: boolean
  message: string
}

export type ProviderTestResponse = {
  ok: boolean
  message: string
  latencyMs: number
  testedAt: string
}

export const providersApi = {
  list() {
    return apiGet<ProvidersListResponse>('/admin/providers')
  },
  catalog() {
    return apiGet<ProviderCatalogResponse>('/admin/providers/catalog')
  },
  snapshot() {
    return apiGet<ProviderSnapshotResponse>('/admin/providers/snapshot')
  },
  activate(body: { type: ProviderType; providerId: string; failoverId?: string | null }) {
    return apiPost<ProviderActivateResponse>('/admin/providers/activate', body)
  },
  deactivate(body: { type: ProviderType }) {
    return apiPost<ProviderActivateResponse>('/admin/providers/deactivate', body)
  },
  test(body: { type: ProviderType; providerId: string }) {
    return apiPost<ProviderTestResponse>('/admin/providers/test', body)
  },
}
