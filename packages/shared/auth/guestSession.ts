/**
 * Local-only Guest Mode session.
 * No JWT, no backend User, no password — anonymous discovery identity.
 */

const GUEST_SESSION_KEY = 'fixnow_guest_session_v1'
const PENDING_ACTION_KEY = 'fixnow_guest_pending_action_v1'
const ANALYTICS_KEY = 'fixnow_guest_analytics_id'

export type GuestSession = {
  active: true
  sessionId: string
  deviceId: string
  analyticsId: string
  enteredAt: string
  role: 'customer'
}

export type GuestPendingAction = {
  type: string
  path: string
  intent?: string
  payload?: Record<string, unknown>
  createdAt: string
}

function randomId(prefix: string): string {
  const part =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${part.slice(0, 24)}`
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function ensureAnalyticsId(): string {
  try {
    const existing = localStorage.getItem(ANALYTICS_KEY)
    if (existing) return existing
    const id = randomId('ga')
    localStorage.setItem(ANALYTICS_KEY, id)
    return id
  } catch {
    return randomId('ga')
  }
}

function ensureDeviceId(): string {
  try {
    const key = 'fixnow_device_id'
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id = randomId('dev')
    localStorage.setItem(key, id)
    return id
  } catch {
    return randomId('dev')
  }
}

export function getGuestSession(): GuestSession | null {
  const session = readJson<GuestSession>(GUEST_SESSION_KEY)
  if (!session?.active || !session.sessionId) return null
  return session
}

export function isGuestSession(): boolean {
  return Boolean(getGuestSession()?.active)
}

export function enterGuestSession(): GuestSession {
  const existing = getGuestSession()
  if (existing) return existing
  const session: GuestSession = {
    active: true,
    sessionId: randomId('gst'),
    deviceId: ensureDeviceId(),
    analyticsId: ensureAnalyticsId(),
    enteredAt: new Date().toISOString(),
    role: 'customer',
  }
  writeJson(GUEST_SESSION_KEY, session)
  trackGuestEvent('guest_session_start', { sessionId: session.sessionId })
  return session
}

export function clearGuestSession() {
  removeKey(GUEST_SESSION_KEY)
}

export function setGuestPendingAction(action: Omit<GuestPendingAction, 'createdAt'>) {
  writeJson(PENDING_ACTION_KEY, { ...action, createdAt: new Date().toISOString() })
}

export function getGuestPendingAction(): GuestPendingAction | null {
  return readJson<GuestPendingAction>(PENDING_ACTION_KEY)
}

export function clearGuestPendingAction() {
  removeKey(PENDING_ACTION_KEY)
}

/** Lightweight client analytics ring for guest funnels (no PII). */
export function trackGuestEvent(name: string, meta?: Record<string, unknown>) {
  try {
    const key = 'fixnow_guest_events_v1'
    const prev = readJson<Array<{ name: string; at: string; meta?: Record<string, unknown> }>>(key) || []
    prev.push({ name, at: new Date().toISOString(), meta })
    writeJson(key, prev.slice(-80))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fixnow:guest-analytics', { detail: { name, meta } }))
    }
  } catch {
    /* ignore */
  }
}

export const GUEST_BROWSE_PREFIXES = [
  '/customer/home',
  '/customer/categories',
  '/customer/search',
  '/customer/technician/',
  '/customer/offers',
  '/customer/help',
  '/customer/content/',
  '/customer/legal/',
] as const

export const GUEST_PROTECTED_PREFIXES = [
  '/customer/post-job',
  '/customer/jobs',
  '/customer/tracking',
  '/customer/messages',
  '/customer/notifications',
  '/customer/profile',
  '/customer/payments',
  '/customer/offers/saved',
  '/customer/account',
] as const

export function isGuestProtectedPath(pathname: string): boolean {
  const path = pathname.split('?')[0]
  if (path.startsWith('/customer/offers/saved')) return true
  if (path.startsWith('/customer/account')) return true
  return GUEST_PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

/** Any customer shell path that is not explicitly protected is browseable as guest. */
export function isGuestBrowsePath(pathname: string): boolean {
  const path = pathname.split('?')[0]
  if (!path.startsWith('/customer/')) return false
  if (isGuestProtectedPath(path)) return false
  return true
}
