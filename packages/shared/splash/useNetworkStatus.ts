import { useEffect, useState } from 'react'
import { publishNetworkSignal } from '@fixnow/api'

/**
 * Connectivity presentation model for splash / banners.
 *
 * - `unknown` / `checking`: startup — never treat as offline UI
 * - `online` / `poor`: connected (poor is advisory only)
 * - `offline`: conclusive device offline
 */
export type NetworkStatus = 'unknown' | 'checking' | 'online' | 'offline' | 'poor'

/** True only after connectivity has been conclusively determined as offline. */
export function isConclusiveOffline(status: NetworkStatus): boolean {
  return status === 'offline'
}

/** Device is usable for online UX (includes unknown/checking so splash does not flash). */
export function isNetworkUsable(status: NetworkStatus): boolean {
  return status !== 'offline'
}

/**
 * Online/offline signal shared by splash, banners and request UX.
 * On native, also listens to the Capacitor Network plugin via the
 * re-dispatched `online`/`offline` window events from `@fixnow/native`.
 *
 * Startup always begins in `checking`, never `offline`, so Unknown/Checking
 * cannot mount Offline UI before the first real status is known.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>('checking')

  useEffect(() => {
    let cancelled = false
    let settleTimer = 0
    let resolvedOnce = false

    const applyConnected = (next: Exclude<NetworkStatus, 'unknown' | 'checking'>) => {
      if (cancelled) return
      window.clearTimeout(settleTimer)
      resolvedOnce = true
      setStatus(next)
      publishNetworkSignal(next !== 'offline', 'browser')
    }

    const applyOfflineDeferred = () => {
      // Android WebView often reports navigator.onLine=false for a beat at cold
      // start before Capacitor Network confirms connectivity. Defer conclusive
      // offline so we never flash Offline UI during a successful launch.
      if (cancelled) return
      setStatus((prev) => (prev === 'offline' ? prev : 'checking'))
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (cancelled) return
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          applyConnected(readOnlineQuality())
          return
        }
        resolvedOnce = true
        setStatus('offline')
        publishNetworkSignal(false, 'browser')
      }, resolvedOnce ? 0 : 700)
    }

    const readOnlineQuality = (): 'online' | 'poor' => {
      const connection =
        typeof navigator !== 'undefined'
          ? (
              navigator as Navigator & {
                connection?: { effectiveType?: string }
              }
            ).connection
          : undefined
      const effective = connection?.effectiveType
      if (effective === 'slow-2g' || effective === '2g') return 'poor'
      return 'online'
    }

    const applyBrowser = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        applyOfflineDeferred()
        return
      }
      applyConnected(readOnlineQuality())
    }

    applyBrowser()

    const onOnline = () => applyConnected(readOnlineQuality())
    const onOffline = () => applyOfflineDeferred()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const connection =
      typeof navigator !== 'undefined'
        ? (
            navigator as Navigator & {
              connection?: {
                addEventListener?: (type: string, listener: () => void) => void
                removeEventListener?: (type: string, listener: () => void) => void
                effectiveType?: string
              }
            }
          ).connection
        : undefined

    const onConnectionChange = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        applyOfflineDeferred()
        return
      }
      applyConnected(readOnlineQuality())
    }
    connection?.addEventListener?.('change', onConnectionChange)

    return () => {
      cancelled = true
      window.clearTimeout(settleTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      connection?.removeEventListener?.('change', onConnectionChange)
    }
  }, [])

  return status
}
