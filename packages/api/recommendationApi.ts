import { apiGet, apiPut } from './client'

export type RecommendationWeights = {
  distance: number
  rating: number
  completedJobs: number
  trustScore: number
  responseTime: number
  availability: number
  verification: number
  subscription: number
  categoryMatch: number
  acceptanceRate: number
  completionRate: number
  recentActivity: number
  urgency: number
  workload: number
}

export type RecommendationSettings = {
  enabled: boolean
  weights: RecommendationWeights
  maxSubscriptionInfluence: number
  maxBoostInfluence: number
  maxSearchRadiusKm: number
  averageTravelSpeedKmh: number
  roadDistanceFactor: number
  fairnessEnabled: boolean
  fairnessStrength: number
  showDecisionIndicators: boolean
  showEstimatedArrival: boolean
}

export const recommendationApi = {
  getSettings() {
    return apiGet<{ settings: RecommendationSettings; defaults: RecommendationSettings }>(
      '/admin/recommendations/settings',
    )
  },
  updateSettings(body: Partial<RecommendationSettings> & { weights?: Partial<RecommendationWeights> }) {
    return apiPut<{ settings: RecommendationSettings }>('/admin/recommendations/settings', body)
  },
  /** Same ranking engine as technician search — for invite / discovery UIs. */
  recommendTechnicians(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[]; meta?: Record<string, unknown> }>(
      '/recommendations/technicians',
      params,
    )
  },
}
