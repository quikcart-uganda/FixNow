export { http, apiGet, apiPost, apiPatch, apiPut, apiDelete, apiRequest, getApiBaseUrl, refreshApiBaseUrl, setAuthFailureHandler, queueRefresh } from './client'
export type { ApiRequestOptions } from './client'
export {
  isCapacitorNative,
  isCapacitorAndroid,
  isCapacitorIos,
  resolveConfiguredApiUrl,
  resolveConfiguredSocketUrl,
  rewriteUrlForNativePlatform,
  rewriteDevLoopbackUrl,
  isDevLoopbackHost,
  isPrivateLanHost,
} from './resolveBaseUrl'
export {
  computeBackoffMs,
  sleep,
  withRetry,
  getCircuitBreaker,
  CircuitOpenError,
  aiStatusCircuit,
  apiReadCircuit,
  paymentIdempotencyKey,
  clearPaymentIdempotencyKey,
  newClientMessageId,
} from './reliability'
export { ApiError, getFriendlyErrorMessage, getFriendlyErrorPresentation, toApiError, looksLikeInternalMessage } from './errors'
export {
  publishNetworkSignal,
  readNetworkSignal,
  isConfidentlyOffline,
  isConfidentlyOfflineForTransport,
} from './connectivity'
export {
  categorizeClientError,
  createClientRequestId,
  clearFrontendDiagnostics,
  getFrontendDiagnostics,
  getSocketDiagnostics,
  installWindowDiagnostics,
  recordClientError,
  recordHttpDiagnostic,
  recordInfoDiagnostic,
  recordQueueDiagnostic,
  recordSocketDiagnostic,
  recordUiError,
  registerMobileDiagnostics,
  registerQueueDiagnostics,
  registerSocketDiagnostics,
  type DiagnosticEvent,
} from './diagnostics'
export { tokenStorage, type StoredUser, getLastSelectedRole, setLastSelectedRole } from './tokenStorage'
export { authApi, type AuthResult, type AuthTokens } from './authApi'
export { customerApi } from './customerApi'
export { technicianApi } from './technicianApi'
export { subscriptionsApi } from './subscriptionsApi'
export type { BillingPeriod, SubscriptionPlanDto, MomoNetworkDto } from './subscriptionsApi'
export { companyTeamApi } from './companyTeamApi'
export { boostsApi, adminBoostsApi } from './boostsApi'
export type { BoostProductDto } from './boostsApi'
export { technicianMarketingApi } from './technicianMarketingApi'
export type { MarketingCreative, MarketingCreativeKind } from './technicianMarketingApi'
export { jobsApi, type CreateJobInput } from './jobsApi'
export { applicationsApi } from './applicationsApi'
export { contentApi, accountDeletionApi, type PublicContentPage, type ContentWriteBody } from './contentApi'
export {
  contentBlocksApi,
  type ContentBlockType,
  type ContentBlockAudience,
  type ContentBlockStatus,
  type DeliveredContentBlock,
  type ContentDeliveryResponse,
  type AdminContentBlock,
  type ContentBlockWriteBody,
} from './contentBlocksApi'
export {
  trackingApi,
  formatTrackingDistance,
  formatTrackingEta,
  type TrackingSession,
  type TrackingPingInput,
} from './trackingApi'
export { categoriesApi } from './categoriesApi'
export { adminApi, dashboardApi } from './adminApi'
export {
  devSettingsApi,
  type DevControls,
  type DevControlsState,
  type DevEnvironment,
  type PublicDevSettings,
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
export {
  providersApi,
  type ProviderType,
  type ProviderStatusRow,
  type ProviderTypeSummary,
  type ProvidersListResponse,
  type ProviderCatalogResponse,
  type ProviderSnapshotResponse,
  type ProviderSnapshotType,
  type ProviderActivateResponse,
  type ProviderTestResponse,
} from './providersApi'
export { notificationsApi } from './notificationsApi'
export { messagesApi } from './messagesApi'
export { uploadMediaFile, type UploadResponse, type UploadMediaOptions } from './uploadMedia'
export { reviewsApi, achievementsApi } from './reviewsApi'
export { paymentsApi } from './paymentsApi'
export {
  aiApi,
  type AiAssistantRole,
  type AiChatContext,
  type AiChatResult,
  type AiChatRequest,
  type AiChatAttachment,
  type AiInputMode,
  type AiStatus,
} from './aiApi'
export { marketingApi, type PlatformPromotion, type SponsoredContent, type SponsoredContentType, type MarketingAnalytics, type MarketingDelivery, type MarketingDeliveryItem } from './marketingApi'
export {
  portfolioApi,
  referralApi,
  communityApi,
  type PortfolioFeed,
  type PortfolioMediaItem,
  type CaseStudyItem,
  type CertificateItem,
  type Discussion,
  type CommunityReply,
} from './portalProductionApi'
export {
  offersApi,
  OFFER_TYPE_LABELS,
  type OfferType,
  type OfferLifecycle,
  type OfferAnalytics,
  type TechnicianOffer,
  type OfferInput,
  type OfferModerationAction,
  type OfferHomeFeed,
  type PublicOfferSort,
} from './offersApi'
export {
  connectSocket,
  disconnectSocket,
  forceReconnectSocket,
  getSocket,
  getSocketStatus,
  subscribeSocketStatus,
  updateSocketAuth,
  joinJobRoom,
  leaveJobRoom,
  joinConversationRoom,
  leaveConversationRoom,
  emitTypingStart,
  emitTypingStop,
  onSocketEvent,
  type SocketConnectionStatus,
} from './socketClient'
export { SOCKET_EVENTS, getSocketUrl, type SocketEventName } from './socketEvents'
export { dedupeSocketPayload, clearSocketDedupe, orderByCreatedAt } from './eventDedupe'
export {
  formatUgx,
  formatBudget,
  timeAgo,
  mapJobStatus,
  mapApiStatusToUi,
  mapNearbyJob,
  mapAssignedJob,
  mapTechnicianProfile,
  mapCustomerTechnicianCard,
  mapCategory,
  mapAdminTechnician,
  mapAdminCustomer,
  mapAdminJob,
} from './mappers'

import { jobsApi } from './jobsApi'
import { technicianApi } from './technicianApi'
import { notificationsApi } from './notificationsApi'
import { mapAssignedJob, mapNearbyJob, mapTechnicianProfile } from './mappers'
import type { AssignedJob, NearbyJob } from '@fixnow/types'
import { safeArray } from '@fixnow/utils'

export async function getNearbyJobs(params?: Record<string, unknown>): Promise<NearbyJob[]> {
  const res = await jobsApi.nearby(params)
  return safeArray(res.data?.items).map(mapNearbyJob)
}

export async function getAssignedJobs(params?: Record<string, unknown>): Promise<AssignedJob[]> {
  const res = await jobsApi.list({ ...params, mine: 'true' })
  return safeArray(res.data?.items).map((j: unknown) => mapAssignedJob(j))
}

export async function getTechnicianProfile() {
  const res = await technicianApi.getProfile()
  return mapTechnicianProfile({
    user: res.data.user,
    profile: res.data.profile,
    trust: res.data.trust,
  })
}

export async function getNotifications() {
  try {
    const res = await notificationsApi.list()
    return safeArray(res.data?.items)
  } catch {
    return []
  }
}

export async function getReviews() {
  return [] as unknown[]
}

export async function getPortfolio() {
  try {
    const { portfolioApi } = await import('./portalProductionApi')
    const res = await portfolioApi.feedMine()
    return res.data
  } catch {
    return { portfolio: null, media: [], caseStudies: [], certificates: [], counts: { media: 0, photos: 0, videos: 0, caseStudies: 0, certificates: 0, featured: 0, total: 0 } }
  }
}

export async function getConversations() {
  return [] as unknown[]
}

export async function getChatMessages() {
  return [] as unknown[]
}

export async function getAchievements() {
  try {
    const { achievementsApi } = await import('./reviewsApi')
    const res = await achievementsApi.mine()
    return safeArray(res.data?.items)
  } catch {
    return []
  }
}

export function getNearbyJob(id: string) {
  return getNearbyJobs().then((jobs) => jobs.find((j) => j.id === id))
}

export function getAssignedJob(id: string) {
  return getAssignedJobs().then((jobs) => jobs.find((j) => j.id === id))
}
