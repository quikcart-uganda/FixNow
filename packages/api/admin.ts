/**
 * Admin API surface — all data comes from the FixNow backend.
 * Legacy mock exports have been removed.
 */
export { adminApi, dashboardApi } from './adminApi'
export {
  devSettingsApi,
  type DevControls,
  type DevControlsState,
  type DevEnvironment,
} from './devSettingsApi'
export {
  sandboxApi,
  type SandboxOverview,
  type SandboxSettings,
  type SandboxCounts,
  type AvatarItem,
} from './sandboxApi'
export {
  seedPlatformApi,
  developmentSubscriptionSimulatorApi,
  type SeedPlatformOverview,
  type SeedGenerateResult,
  type SeedSubscriptionSimulatorStatus,
  type SeedSimulatorHistoryEntry,
} from './seedPlatformApi'
export {
  developerPreviewApi,
  type DeveloperPreviewAvailability,
  type DeveloperPreviewPlanOption,
} from './developerPreviewApi'
export {
  platformModeApi,
  PLATFORM_MODE_CHANGED_EVENT,
  emitPlatformModeChanged,
  type PlatformMode,
  type PlatformModeView,
} from './platformModeApi'
export {
  launchCentreApi,
  type LaunchCentreOverview,
  type ProductionReadinessReport,
  type ReadinessCheck,
  type PromotionQueueItem,
} from './launchCentreApi'
export {
  recommendationApi,
  type RecommendationSettings,
  type RecommendationWeights,
} from './recommendationApi'
export {
  locationApi,
  type LocationDashboard,
  type LocationPlatformSettings,
  type LocationProviderId,
} from './locationApi'
export { categoriesApi } from './categoriesApi'
export { contentApi, accountDeletionApi, type PublicContentPage, type ContentWriteBody } from './contentApi'
export {
  trackingApi,
  formatTrackingDistance,
  formatTrackingEta,
  type TrackingSession,
  type TrackingPingInput,
} from './trackingApi'
export { formatUgx, mapAdminTechnician, mapAdminCustomer, mapAdminJob, mapCategory } from './mappers'
export { getFriendlyErrorMessage, getFriendlyErrorPresentation, ApiError } from './errors'
export { verificationApi, type VerificationQueueItem } from './verificationApi'

export function freeLimitLabel(limit: number | 'unlimited' | undefined): string {
  if (limit === 'unlimited' || limit == null) return 'Unlimited'
  return String(limit)
}
