import type { BackendHealthState } from './healthCheck'
import { isConclusiveOffline, type NetworkStatus } from './useNetworkStatus'

/**
 * Splash Offline UI (Retry / Continue offline) must only mount when the device
 * is conclusively offline. Backend health `error` (reachable device, unreachable
 * /health) must never flash Offline UI — splash continues normally.
 */
export function shouldShowSplashOfflineActions(
  network: NetworkStatus,
  healthState: BackendHealthState,
): boolean {
  if (network === 'unknown' || network === 'checking') return false
  if (healthState === 'checking') return false
  return isConclusiveOffline(network) || healthState === 'offline'
}
