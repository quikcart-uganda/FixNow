/**
 * Deep link + notification-tap routing.
 *
 * A single resolver is shared by three entry points so the destination logic
 * cannot drift between them:
 *   1. Android App Links / iOS Universal Links  (`appUrlOpen`)
 *   2. Custom scheme returns from hosted payments (`fixnow://payments/...`)
 *   3. Push notification taps (`pushNotificationActionPerformed`)
 *
 * The resolver only ever produces an *in-app router path*; navigation itself is
 * performed by `useNativeDeepLinks` via react-router, so the existing route
 * tree and Stitch screens stay authoritative.
 */

import { isNativePlatform } from './platform'

export const APP_SCHEME = 'fixnow'

/** Hosts accepted as FixNow universal/app links. */
export const APP_LINK_HOSTS = ['fixnow.app', 'www.fixnow.app', 'app.fixnow.ug', 'fixnow.ug']

const MARKETPLACE_ROOTS = ['customer', 'technician']
const WEB_ONLY_ROOTS = ['admin']
const KNOWN_ROOTS = [...MARKETPLACE_ROOTS, ...WEB_ONLY_ROOTS]

function sanitizePath(pathname: string, search: string, hash: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${path}${search ?? ''}${hash ?? ''}`
}

/**
 * Convert an external URL into an internal router path.
 * Returns `null` when the URL is not addressable inside the app.
 */
export function resolveDeepLink(rawUrl: string): string | null {
  if (!rawUrl) return null

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    // Bare path (e.g. push payload `href: "/customer/jobs/123"`).
    if (!rawUrl.startsWith('/')) return null
    return normalizeAppPath(rawUrl)
  }

  const scheme = url.protocol.replace(':', '').toLowerCase()

  if (scheme === APP_SCHEME) {
    // Auth handoff from the native Google bridge — consumed by socialAuth, not routed.
    if (url.hostname === 'google-auth') return null

    // fixnow://customer/tracking/123  -> host carries the first segment.
    const host = url.hostname
    const rest = url.pathname.replace(/^\/+/, '')
    const combined = host ? `/${host}${rest ? `/${rest}` : ''}` : `/${rest}`
    return normalizeAppPath(sanitizePath(combined, url.search, url.hash))
  }

  if (scheme === 'http' || scheme === 'https') {
    if (!APP_LINK_HOSTS.includes(url.hostname.toLowerCase())) return null
    return normalizeAppPath(sanitizePath(url.pathname, url.search, url.hash))
  }

  return null
}

/** Map a few historical / provider-friendly aliases onto the real route tree. */
function normalizeAppPath(path: string): string {
  if (path.startsWith('/payments/')) {
    return `/customer${path}`
  }
  // Legacy push / deep-link aliases → current route tree
  if (/^\/customer\/pay\//.test(path)) {
    return path.replace('/customer/pay/', '/customer/payments/pay/')
  }
  if (/^\/technician\/chat\//.test(path)) {
    return path.replace('/technician/chat/', '/technician/messages/')
  }
  // Admin is web-only — never open admin surfaces inside Capacitor.
  if (isNativePlatform() && path.split('/').filter(Boolean)[0] === 'admin') {
    return '/'
  }
  return path
}

/**
 * Destination for a tapped push notification.
 * Falls back to the role notification inbox when the payload has no target.
 */
export function resolvePushTarget(
  data: Record<string, unknown> | undefined,
  role: 'customer' | 'technician' | 'admin' | null,
): string {
  const candidate =
    firstString(data?.href) ??
    firstString(data?.url) ??
    firstString(data?.deepLink) ??
    firstString(data?.path)

  if (candidate) {
    const resolved = resolveDeepLink(candidate)
    if (resolved) return resolved
  }

  const type = firstString(data?.type) ?? ''
  const jobId = firstString(data?.jobId)
  const conversationId = firstString(data?.conversationId)

  if (role === 'customer') {
    if (conversationId) return `/customer/messages/${conversationId}`
    if (jobId && type.startsWith('payment')) return `/customer/payments/pay/${jobId}`
    if (jobId) return `/customer/tracking/${jobId}`
    return '/customer/notifications'
  }
  if (role === 'technician') {
    if (conversationId) return `/technician/messages/${conversationId}`
    if (jobId) return `/technician/jobs/${jobId}`
    return '/technician/notifications'
  }
  if (role === 'admin') {
    // Admin inbox is web-only; native falls through to the marketplace landing.
    return isNativePlatform() ? '/' : '/admin/notifications'
  }
  return '/'
}

function firstString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** True when the path belongs to a role area the app can route into. */
export function isRoutableAppPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (path === '/' || path === '/select-role') return true
  const root = path.split('/').filter(Boolean)[0] ?? ''
  if (isNativePlatform()) return MARKETPLACE_ROOTS.includes(root)
  return KNOWN_ROOTS.includes(root)
}
