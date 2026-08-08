/**
 * Wire native / offline diagnostics into the shared client diagnostics ring.
 * Safe on web — registers lightweight providers without Capacitor.
 */

import {
  installWindowDiagnostics,
  registerMobileDiagnostics,
  registerQueueDiagnostics,
  recordQueueDiagnostic,
} from '@fixnow/api'
import { getNetworkState } from './nativeNetwork'
import { listQueued } from './offlineQueue'
import { isNativePlatform, platformTag } from './platform'
import { getNativePushPermission, getNativePushToken } from './nativePush'
import { getLocationPermissionStatus } from './locationPermission'

let installed = false

export async function installClientDiagnostics(): Promise<void> {
  if (installed) return
  installed = true

  registerQueueDiagnostics(async () => {
    const items = await listQueued()
    const now = Date.now()
    const oldest = items.reduce((min, i) => Math.min(min, i.createdAt), now)
    return {
      depth: items.length,
      flushing: false,
      oldestAgeSec: items.length ? Math.round((now - oldest) / 1000) : undefined,
      items: items.slice(0, 8).map((i) => ({
        id: i.id,
        method: i.method,
        url: i.url,
        attempts: i.attempts,
        label: i.label,
      })),
    }
  })

  registerMobileDiagnostics(async () => {
    const network = getNetworkState()
    const base: Record<string, unknown> = {
      platform: platformTag(),
      isNative: isNativePlatform(),
      online: network.connected,
      connectionType: network.connectionType,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : undefined,
    }
    try {
      const [customerLocation, technicianLocation] = await Promise.all([
        getLocationPermissionStatus('customer'),
        getLocationPermissionStatus('technician'),
      ])
      Object.assign(base, {
        locationPermissionCustomer: customerLocation,
        locationPermissionTechnician: technicianLocation,
      })
    } catch {
      /* ignore */
    }
    if (!isNativePlatform()) return base
    try {
      const permission = await getNativePushPermission()
      const token = getNativePushToken()
      return {
        ...base,
        pushPermission: permission,
        hasPushToken: Boolean(token),
      }
    } catch {
      return base
    }
  })

  installWindowDiagnostics()
}

/** Call after a queue flush for the diagnostics event ring. */
export function noteQueueFlush(result: {
  flushed: number
  remaining: number
  failures: number
  deferred: number
}): void {
  recordQueueDiagnostic(
    `flush flushed=${result.flushed} remaining=${result.remaining} failures=${result.failures}`,
    result,
  )
}
