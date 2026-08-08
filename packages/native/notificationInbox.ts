/**
 * Client-side notification dedupe / grouping / history helpers.
 *
 * Does not replace the backend notification store — it only prevents the
 * foreground toast / in-app banner from repeating the same push when both
 * Socket.IO and FCM deliver the same event, and keeps a short local history
 * for the offline notifications surface.
 */

import { cacheGet, cacheSet } from './offlineCache'

const HISTORY_KEY = 'notifications.history.v1'
const DEDUPE_KEY = 'notifications.dedupe.v1'
const MAX_HISTORY = 80

export type LocalNotification = {
  id: string
  title: string
  body: string
  group?: string
  href?: string
  read: boolean
  createdAt: number
  data?: Record<string, unknown>
}

function groupFor(data?: Record<string, unknown>): string {
  const type = String(data?.type ?? data?.category ?? 'general')
  const jobId = data?.jobId ? String(data.jobId) : ''
  const conversationId = data?.conversationId ? String(data.conversationId) : ''
  if (conversationId) return `chat:${conversationId}`
  if (jobId) return `job:${jobId}:${type}`
  return type
}

function notificationId(payload: {
  title?: string
  body?: string
  data?: Record<string, unknown>
}): string {
  const data = payload.data ?? {}
  const explicit = data.id ?? data.notificationId ?? data._id
  if (explicit) return String(explicit)
  return `${payload.title ?? ''}|${payload.body ?? ''}|${data.jobId ?? ''}|${data.conversationId ?? ''}|${data.type ?? ''}`
}

export async function rememberNotification(payload: {
  title?: string
  body?: string
  data?: Record<string, unknown>
}): Promise<{ accepted: boolean; item: LocalNotification | null }> {
  const id = notificationId(payload)
  const recent = (await cacheGet<string[]>(DEDUPE_KEY)) ?? []
  if (recent.includes(id)) {
    return { accepted: false, item: null }
  }
  const nextDedupe = [...recent, id].slice(-120)
  await cacheSet(DEDUPE_KEY, nextDedupe, 24 * 60 * 60_000)

  const item: LocalNotification = {
    id,
    title: payload.title ?? 'FixNow',
    body: payload.body ?? '',
    group: groupFor(payload.data),
    href: typeof payload.data?.href === 'string' ? payload.data.href : undefined,
    read: false,
    createdAt: Date.now(),
    data: payload.data,
  }
  const history = (await cacheGet<LocalNotification[]>(HISTORY_KEY)) ?? []
  const without = history.filter((h) => h.id !== id)
  without.unshift(item)
  await cacheSet(HISTORY_KEY, without.slice(0, MAX_HISTORY), 7 * 24 * 60 * 60_000)
  return { accepted: true, item }
}

export async function listLocalNotifications(): Promise<LocalNotification[]> {
  return (await cacheGet<LocalNotification[]>(HISTORY_KEY)) ?? []
}

export async function markLocalNotificationRead(id: string): Promise<void> {
  const history = await listLocalNotifications()
  await cacheSet(
    HISTORY_KEY,
    history.map((h) => (h.id === id ? { ...h, read: true } : h)),
    7 * 24 * 60 * 60_000,
  )
}

export async function markAllLocalNotificationsRead(): Promise<void> {
  const history = await listLocalNotifications()
  await cacheSet(
    HISTORY_KEY,
    history.map((h) => ({ ...h, read: true })),
    7 * 24 * 60 * 60_000,
  )
}

/** Collapse consecutive items in the same group for inbox display. */
export function groupNotifications(items: LocalNotification[]): Array<{
  group: string
  latest: LocalNotification
  count: number
}> {
  const map = new Map<string, { latest: LocalNotification; count: number }>()
  for (const item of items) {
    const key = item.group ?? 'general'
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { latest: item, count: 1 })
    } else {
      existing.count += 1
      if (item.createdAt > existing.latest.createdAt) existing.latest = item
    }
  }
  return [...map.entries()]
    .map(([group, value]) => ({ group, ...value }))
    .sort((a, b) => b.latest.createdAt - a.latest.createdAt)
}
