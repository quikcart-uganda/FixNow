export {
  installClientDiagnostics,
  noteQueueFlush,
} from './diagnostics'

export {
  getPlatform,
  isNativePlatform,
  isAndroid,
  isIOS,
  isPluginAvailable,
  platformTag,
  type NativePlatform,
} from './platform'

export {
  isPwaStandalone,
  isMobileWebBrowser,
  detectStorePlatform,
  canShowAppDownloadPromptSurface,
  type StorePlatform,
} from './mobileWeb'

export { secureStorage } from './secureStorage'

export {
  initNativeNetwork,
  getNetworkState,
  subscribeNetwork,
  type NativeNetworkState,
  type ConnectionType,
} from './nativeNetwork'

export {
  APP_SCHEME,
  APP_LINK_HOSTS,
  resolveDeepLink,
  resolvePushTarget,
  isRoutableAppPath,
} from './deepLinks'

export {
  initNativePush,
  requestNativePushPermission,
  getNativePushPermission,
  getNativePushToken,
  takePendingPushTap,
  clearNativeNotifications,
  type NativePushPermission,
  type NativePushPayload,
} from './nativePush'

export {
  initNativeApp,
  hideNativeSplash,
  exitNativeApp,
  type AppLifecycleHandlers,
} from './nativeApp'

export {
  getLocationPermissionStatus,
  requestLocationPermission,
  loadLocationPermissionPrefs,
  saveLocationPermissionPrefs,
  markLocationPromptShown,
  markLocationPromptDismissed,
  openAppLocationSettings,
  subscribeLocationPermission,
  isLocationGranted,
  canRequestLocationPermission,
  type LocationPermissionStatus,
  type LocationPermissionRole,
  type LocationPermissionPrefs,
} from './locationPermission'

export {
  takePhoto,
  pickFromGallery,
  pickImage,
  pickedImageToFile,
  getCurrentPosition,
  watchPositionAdaptive,
  openNavigation,
  dialPhone,
  sendEmail,
  openExternal,
  shareContent,
  copyToClipboard,
  haptic,
  probeBiometrics,
  type PickedImage,
  type Coordinates,
  type LocationWatchHandle,
  type LocationWatchOptions,
  type GetCurrentPositionOptions,
  type BiometricAvailability,
} from './nativeDevice'

export {
  paymentReturnUrl,
  openHostedPayment,
  extractHostedCheckoutUrl,
  type HostedPaymentResult,
} from './hostedPayments'

export {
  getSocialProviderAvailability,
  signInWithGoogle,
  signInWithApple,
  type SocialProvider,
  type SocialSignInResult,
  type SocialProviderAvailability,
} from './socialAuth'

export {
  cacheSet,
  cacheGet,
  cacheRemove,
  CACHE_KEYS,
  isNativeCachePreferred,
} from './offlineCache'

export {
  DATA_CACHE_KEYS,
  saveCachedData,
  readCachedData,
  clearCachedData,
  clearRoleCaches,
  withCachedLoader,
  type CachedRead,
} from './dataCache'

export {
  enqueueRequest,
  listQueued,
  removeQueued,
  clearOfflineQueue,
  flushOfflineQueue,
  subscribeOfflineQueue,
  type QueuedRequest,
} from './offlineQueue'

export {
  enqueueOfflineUpload,
  listOfflineUploads,
  flushOfflineUploads,
  subscribeOfflineUploads,
  type QueuedUpload,
} from './offlineUpload'

export { mutateWithOfflineFallback, type MutateResult, type MutationQueueSpec } from './queueMutation'

export {
  initAutoResync,
  setOfflineQueueExecutor,
  setOfflineUploadExecutor,
  triggerResync,
} from './resync'

export {
  rememberNotification,
  listLocalNotifications,
  markLocalNotificationRead,
  markAllLocalNotificationsRead,
  groupNotifications,
  type LocalNotification,
} from './notificationInbox'

export {
  bootstrapNative,
  rehydrateSecureSession,
  mirrorSessionToSecureStorage,
  clearSecureSession,
  type BootstrapHandlers,
} from './bootstrap'

export { useNativeDeepLinks } from './useNativeDeepLinks'
export { NativeShellHost } from './NativeShellHost'
export { OfflineBanner } from './OfflineBanner'
export { OfflineQueueHost } from './OfflineQueueHost'
export { PullToRefresh } from './PullToRefresh'
export { BottomSheet, LazyImage, ProfileAvatar } from '@fixnow/ui'
export { NativeErrorHost, showNativeError } from './NativeErrorHost'
export { useRouteFocus, announce } from './a11y'
