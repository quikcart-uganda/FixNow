/**
 * Resolves the API / socket base URL for web and Capacitor.
 *
 * Desktop web can use `http://localhost:4000`.
 * A phone/tablet that opens Vite via the PC's LAN IP must NOT keep `localhost`
 * (that would target the phone itself). We rewrite loopback API hosts to:
 *   1. `VITE_DEV_LAN_HOST` when set
 *   2. `window.location.hostname` when the page is already on a private LAN IP
 *   3. Android emulator alias `10.0.2.2` for Capacitor Android without (1)/(2)
 * Production HTTPS hosts are never rewritten.
 */

type CapBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function capacitor(): CapBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapBridge }).Capacitor
}

export function isCapacitorNative(): boolean {
  try {
    return capacitor()?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

export function isCapacitorAndroid(): boolean {
  try {
    return isCapacitorNative() && capacitor()?.getPlatform?.() === 'android'
  } catch {
    return false
  }
}

export function isCapacitorIos(): boolean {
  try {
    return isCapacitorNative() && capacitor()?.getPlatform?.() === 'ios'
  } catch {
    return false
  }
}

/** True for private / link-local development hosts that Android may need to reach. */
export function isDevLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

export function isPrivateLanHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}

function readDevLanHost(): string | null {
  try {
    const raw =
      (typeof import.meta !== 'undefined' &&
        (import.meta.env?.VITE_DEV_LAN_HOST || import.meta.env?.VITE_ANDROID_API_HOST)) ||
      ''
    const host = String(raw).trim()
    if (!host) return null
    // Accept bare host or full URL; never allow public internet hosts via this override.
    try {
      const asUrl = host.includes('://') ? new URL(host) : new URL(`http://${host}`)
      if (isPrivateLanHost(asUrl.hostname) || asUrl.hostname === '10.0.2.2') {
        return asUrl.hostname
      }
    } catch {
      return null
    }
    return null
  } catch {
    return null
  }
}

function readPageHostname(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.location.hostname || null
  } catch {
    return null
  }
}

export type RewriteDevUrlOptions = {
  /** Override for tests / SSR */
  pageHostname?: string | null
  isNative?: boolean
  isAndroid?: boolean
  lanHost?: string | null
}

/**
 * Rewrite loopback API/socket URLs so remote clients on the LAN reach the host machine.
 *
 * Precedence when the configured host is loopback:
 * 1. Explicit `VITE_DEV_LAN_HOST` / options.lanHost
 * 2. Current page hostname when it is a private LAN address (mobile browser / live-reload)
 * 3. Capacitor Android emulator alias `10.0.2.2`
 * 4. Otherwise leave unchanged (desktop localhost)
 */
export function rewriteDevLoopbackUrl(url: string, options: RewriteDevUrlOptions = {}): string {
  if (!url) return url
  try {
    const parsed = new URL(url)
    if (!isDevLoopbackHost(parsed.hostname)) return url

    const lan = options.lanHost !== undefined ? options.lanHost : readDevLanHost()
    const pageHost = options.pageHostname !== undefined ? options.pageHostname : readPageHostname()
    const native = options.isNative ?? isCapacitorNative()
    const android = options.isAndroid ?? isCapacitorAndroid()

    if (lan) {
      parsed.hostname = lan
    } else if (pageHost && isPrivateLanHost(pageHost)) {
      parsed.hostname = pageHost
    } else if (native && android) {
      parsed.hostname = '10.0.2.2'
    } else {
      return url
    }

    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

/**
 * @deprecated Prefer rewriteDevLoopbackUrl — kept for existing imports.
 * Rewrites loopback hosts for native *and* LAN web clients.
 */
export function rewriteUrlForNativePlatform(url: string): string {
  return rewriteDevLoopbackUrl(url)
}

export function resolveConfiguredApiUrl(): string {
  const configured =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
    'http://localhost:4000/api/v1'
  return rewriteDevLoopbackUrl(String(configured))
}

export function resolveConfiguredSocketUrl(): string {
  const explicit =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SOCKET_URL : undefined
  if (explicit) return rewriteDevLoopbackUrl(String(explicit))
  const fromApi = resolveConfiguredApiUrl().replace(/\/api\/v1\/?$/, '')
  return fromApi || rewriteDevLoopbackUrl('http://localhost:4000')
}
