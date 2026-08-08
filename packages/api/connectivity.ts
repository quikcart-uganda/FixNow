/**
 * Connectivity signals for error classification.
 *
 * Rule: "No internet connection" only when we are confidently offline.
 * Axios ERR_NETWORK / CORS / refused TCP while the radio is up must NOT use
 * that copy — they are SERVER_UNREACHABLE / service failures.
 *
 * Capacitor WebView `navigator.onLine` is unreliable; prefer the native
 * Network plugin state when published on `__FIXNOW_NET__`.
 */

export type FixNowNetSignal = {
  /** True when the device radio has a usable link. */
  connected: boolean
  /** Source of the last update. */
  source: 'native' | 'browser' | 'unknown'
  updatedAt: number
}

type NetHost = {
  __FIXNOW_NET__?: FixNowNetSignal
  Capacitor?: { isNativePlatform?: () => boolean }
}

function netHost(): NetHost | null {
  if (typeof globalThis === 'undefined') return null
  // Prefer window when present (browser / Capacitor WebView).
  const w = (globalThis as { window?: NetHost }).window
  if (w) return w
  return globalThis as NetHost
}

declare global {
  interface Window {
    __FIXNOW_NET__?: FixNowNetSignal
  }
}

export function publishNetworkSignal(connected: boolean, source: FixNowNetSignal['source'] = 'browser') {
  const host = netHost()
  if (!host) return
  host.__FIXNOW_NET__ = {
    connected,
    source,
    updatedAt: Date.now(),
  }
}

export function readNetworkSignal(): FixNowNetSignal | null {
  return netHost()?.__FIXNOW_NET__ ?? null
}

function isCapacitorHost(): boolean {
  try {
    return Boolean(netHost()?.Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

/**
 * High-confidence offline only (banners / splash).
 */
export function isConfidentlyOffline(): boolean {
  const signal = readNetworkSignal()
  if (signal?.source === 'native') return signal.connected === false
  if (signal?.source === 'browser') return signal.connected === false
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    return false
  }
}

/**
 * For Axios transport failures (no HTTP response): only claim offline when
 * confident. On Capacitor, never trust navigator.onLine alone.
 * Default when unsure: online → classify as SERVER_UNREACHABLE.
 */
export function isConfidentlyOfflineForTransport(): boolean {
  const signal = readNetworkSignal()
  if (signal?.source === 'native') {
    return signal.connected === false
  }
  if (isCapacitorHost()) {
    // Native plugin not ready yet, or only a browser signal — do not claim offline.
    return false
  }
  if (signal?.source === 'browser') {
    return signal.connected === false
  }
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    return false
  }
}
