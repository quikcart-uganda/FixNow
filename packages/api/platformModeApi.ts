import { apiGet, apiPost } from './client'

export type PlatformMode = 'development' | 'production'

export type PlatformModeView = {
  mode: PlatformMode
  developerUxVisible: boolean
  hasProductionSuperAdmin: boolean
  productionOwnerSetupRequired: boolean
  canEnterProduction: boolean
  canReturnToDevelopment: boolean
  lockUntil: string | null
  locked: boolean
  modes: PlatformMode[]
  state?: Record<string, unknown>
  history?: Array<{
    id: string
    previousMode: PlatformMode
    newMode: PlatformMode
    administratorEmail: string
    administratorName: string
    reason: string | null
    ipAddress: string | null
    createdAt: string
    affectedVisibility?: Record<string, unknown>
  }>
}

/** Broadcast so Command Center nav / guards refresh without a full page reload. */
export const PLATFORM_MODE_CHANGED_EVENT = 'fixnow:platform-mode-changed'

export function emitPlatformModeChanged(view?: Partial<PlatformModeView>) {
  try {
    window.dispatchEvent(new CustomEvent(PLATFORM_MODE_CHANGED_EVENT, { detail: view ?? null }))
  } catch {
    /* non-browser */
  }
}

export const platformModeApi = {
  publicStatus() {
    return apiGet<PlatformModeView>('/public/platform-mode')
  },
  overview() {
    return apiGet<PlatformModeView>('/admin/governance')
  },
  history(limit = 50) {
    return apiGet<{ items: PlatformModeView['history'] }>('/admin/governance/history', {
      limit: String(limit),
    })
  },
  async enterProduction(body: {
    reason?: string
    confirmPhrase: string
    confirmAgain: boolean
    mfaToken?: string
    device?: string
  }) {
    const res = await apiPost('/admin/governance/enter-production', body)
    emitPlatformModeChanged({ mode: 'production', developerUxVisible: false })
    return res
  },
  async returnDevelopment(body: {
    reason?: string
    confirmPhrase: string
    confirmAgain: boolean
    mfaToken?: string
    device?: string
  }) {
    const res = await apiPost('/admin/governance/return-development', body)
    emitPlatformModeChanged({ mode: 'development', developerUxVisible: true })
    return res
  },
  createProductionOwner(body: {
    fullName: string
    email: string
    password: string
    recoveryEmail: string
    recoveryPhone?: string
    phone?: string
    enableMfaIntent?: boolean
  }) {
    return apiPost('/admin/governance/production-owner', body)
  },
  designateProductionOwner() {
    return apiPost('/admin/governance/designate-production-owner', {})
  },
}
