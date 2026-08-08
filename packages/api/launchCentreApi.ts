import { apiGet, apiPost } from './client'

export type ReadinessCheck = {
  id: string
  category: string
  label: string
  severity: 'blocker' | 'warning' | 'pass'
  score: number
  maxScore: number
  message: string
  guidance?: string
}

export type ProductionReadinessReport = {
  evaluatedAt: string
  overallPercent: number
  categoryScores: Array<{
    key: string
    label: string
    score: number
    maxScore: number
    percent: number
  }>
  checks: ReadinessCheck[]
  blockers: ReadinessCheck[]
  warnings: ReadinessCheck[]
  canLaunch: boolean
  recommendations: string[]
}

export type LaunchCentreOverview = {
  mode: {
    mode: 'development' | 'production'
    developerUxVisible: boolean
    hasProductionSuperAdmin: boolean
    locked: boolean
    canEnterProduction: boolean
    canReturnToDevelopment: boolean
  }
  readiness: ProductionReadinessReport
  history: Array<Record<string, unknown>>
  modeTransitions: Array<Record<string, unknown>>
  launchAllowed: boolean
  rollbackAllowed: boolean
  sections: string[]
}

export type PromotionQueueItem = {
  id: string
  resourceType: string
  title: string
  status: string
  dataEnvironment: string
  updatedAt?: string
  preview?: Record<string, unknown>
}

export const launchCentreApi = {
  overview() {
    return apiGet<LaunchCentreOverview>('/admin/launch-centre')
  },
  readiness() {
    return apiGet<ProductionReadinessReport>('/admin/launch-centre/readiness')
  },
  snapshotReadiness(reason?: string) {
    return apiPost('/admin/launch-centre/readiness/snapshot', { reason })
  },
  launch(body: {
    reason?: string
    confirmPhrase: string
    confirmAgain: boolean
    acknowledgeWarnings: boolean
    mfaToken?: string
    device?: string
  }) {
    return apiPost('/admin/launch-centre/launch', body)
  },
  rollback(body: {
    reason?: string
    confirmPhrase: string
    confirmAgain: boolean
    mfaToken?: string
    device?: string
  }) {
    return apiPost('/admin/launch-centre/rollback', body)
  },
  history() {
    return apiGet('/admin/launch-centre/history')
  },
  promotionQueue(limit = 40) {
    return apiGet<{ items: PromotionQueueItem[]; supportedTypes: string[] }>(
      '/admin/launch-centre/promotion-queue',
      { limit: String(limit) },
    )
  },
  promote(body: { resourceType: string; resourceId: string; note?: string }) {
    return apiPost('/admin/launch-centre/promote', body)
  },
  rejectPromote(body: { resourceType: string; resourceId: string; reason?: string }) {
    return apiPost('/admin/launch-centre/promote/reject', body)
  },
}
