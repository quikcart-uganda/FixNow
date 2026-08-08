/**
 * Presentation helpers for the Administrator Management console.
 *
 * These only shape data the API already returns — no status, role, or
 * permission semantics are invented here.
 */

import type { BadgeTone } from '../ui'

export type AdminOperator = {
  id: string
  userId: string
  email: string
  fullName: string
  phone: string
  department: string
  role: string
  permissions: string[]
  status: string
  isActive: boolean
  mfaEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
}

export type AdminRoleOption = {
  key: string
  name: string
  description: string
  permissionKeys: string[]
}

export type AdminPermissionOption = {
  key: string
  name: string
  description: string
  module: string
}

export type LoginEvent = {
  id: string
  success: boolean
  reason: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string | null
}

export const ADMIN_STATUS = {
  pendingInvitation: 'pending_invitation',
  active: 'active',
  suspended: 'suspended',
  disabled: 'disabled',
  locked: 'locked',
  archived: 'archived',
  deleted: 'deleted',
} as const

type StatusMeta = { label: string; tone: BadgeTone; icon: string }

const STATUS_META: Record<string, StatusMeta> = {
  [ADMIN_STATUS.active]: { label: 'Active', tone: 'success', icon: 'check_circle' },
  [ADMIN_STATUS.pendingInvitation]: { label: 'Pending', tone: 'info', icon: 'hourglass_top' },
  [ADMIN_STATUS.suspended]: { label: 'Suspended', tone: 'warning', icon: 'pause_circle' },
  [ADMIN_STATUS.disabled]: { label: 'Disabled', tone: 'neutral', icon: 'block' },
  [ADMIN_STATUS.locked]: { label: 'Locked', tone: 'locked', icon: 'lock' },
  [ADMIN_STATUS.archived]: { label: 'Archived', tone: 'neutral', icon: 'inventory_2' },
  [ADMIN_STATUS.deleted]: { label: 'Deleted', tone: 'danger', icon: 'delete' },
}

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: humanize(status), tone: 'neutral', icon: 'help' }
}

export function humanize(value: string): string {
  if (!value) return '—'
  const spaced = value.replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function roleLabel(role: string, roles: AdminRoleOption[]): string {
  return roles.find((r) => r.key === role)?.name ?? humanize(role)
}

export function permissionLabel(key: string, permissions: AdminPermissionOption[]): string {
  return permissions.find((p) => p.key === key)?.name ?? humanize(key)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function relativeTime(value: string | null | undefined): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  const diff = date.getTime() - Date.now()
  const abs = Math.abs(diff)
  if (abs < 60_000) return 'Just now'
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit)
  }
  return 'Just now'
}

/** Derives a readable device label from a login event user agent string. */
export function describeUserAgent(userAgent: string | null | undefined): {
  device: string
  platform: string
  browser: string
} {
  const ua = userAgent ?? ''
  if (!ua.trim()) {
    return { device: 'Unknown device', platform: 'Unknown platform', browser: 'Unknown browser' }
  }

  const platform = /Windows NT/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua)
        ? 'iOS'
        : /Mac OS X/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Unknown platform'

  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : /Firefox\//i.test(ua)
            ? 'Firefox'
            : 'Unknown browser'

  const isMobile = /Mobile|Android|iPhone|iPod/i.test(ua)
  const isTablet = /iPad|Tablet/i.test(ua)
  const device = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop'

  return { device, platform, browser }
}

export function deviceIcon(device: string): string {
  if (device === 'Mobile') return 'smartphone'
  if (device === 'Tablet') return 'tablet_mac'
  return 'computer'
}

export type DeviceSummary = {
  key: string
  device: string
  platform: string
  browser: string
  ips: string[]
  lastSeenAt: string | null
  signIns: number
  failures: number
}

/** Groups login events into distinct devices so the drawer can list them. */
export function summarizeDevices(events: LoginEvent[]): DeviceSummary[] {
  const map = new Map<string, DeviceSummary>()

  for (const event of events) {
    const { device, platform, browser } = describeUserAgent(event.userAgent)
    const key = `${device}·${platform}·${browser}`
    const existing = map.get(key)
    const entry: DeviceSummary = existing ?? {
      key,
      device,
      platform,
      browser,
      ips: [],
      lastSeenAt: null,
      signIns: 0,
      failures: 0,
    }

    if (event.success) entry.signIns += 1
    else entry.failures += 1
    if (event.ip && !entry.ips.includes(event.ip)) entry.ips.push(event.ip)
    if (event.createdAt) {
      const current = entry.lastSeenAt ? new Date(entry.lastSeenAt).getTime() : 0
      if (new Date(event.createdAt).getTime() > current) entry.lastSeenAt = event.createdAt
    }

    map.set(key, entry)
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime(),
  )
}

export function toLoginEvents(items: Array<Record<string, unknown>> | undefined): LoginEvent[] {
  return (items ?? []).map((raw, index) => ({
    id: typeof raw.id === 'string' ? raw.id : `login-${index}`,
    success: Boolean(raw.success),
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    ip: typeof raw.ip === 'string' ? raw.ip : null,
    userAgent: typeof raw.userAgent === 'string' ? raw.userAgent : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
  }))
}

/** Generates a shareable one-time password that satisfies the API policy. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const pick = (source: string, count: number) => {
    const values = new Uint32Array(count)
    crypto.getRandomValues(values)
    return Array.from(values, (value) => source[value % source.length]).join('')
  }
  return `${pick(alphabet, 4)}-${pick(digits, 4)}-${pick(alphabet, 4)}`
}
