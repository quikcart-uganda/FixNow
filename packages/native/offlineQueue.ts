/**
 * Offline mutation queue.
 *
 * Read surfaces use the Preferences cache; write surfaces that fail while
 * offline are enqueued here and flushed automatically when connectivity
 * returns. Only idempotent-safe JSON POSTs/PATCHes should be queued —
 * payments and auth mutations are never queued by callers.
 */

import { cacheGet, cacheSet } from './offlineCache'

const QUEUE_KEY = 'offline.queue.v1'
const MAX_ITEMS = 40
const MAX_ATTEMPTS = 5

function backoffMs(attempt: number): number {
  const base = 1_000
  const max = 60_000
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt))
  const jitter = exp * 0.3
  return Math.round(exp - jitter + Math.random() * jitter * 2)
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type QueuedRequest = {
  id: string
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  url: string
  body?: unknown
  createdAt: number
  attempts: number
  lastError?: string
  label?: string
  /** Earliest time this item may be retried (epoch ms) */
  nextAttemptAt?: number
}

type FlushResult = {
  flushed: number
  remaining: number
  failures: number
  deferred: number
}

type QueueListener = (items: QueuedRequest[]) => void

const listeners = new Set<QueueListener>()
let flushing = false

function emit(items: QueuedRequest[]) {
  listeners.forEach((fn) => fn(items))
}

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener)
  void listQueued().then(listener)
  return () => listeners.delete(listener)
}

export async function listQueued(): Promise<QueuedRequest[]> {
  return (await cacheGet<QueuedRequest[]>(QUEUE_KEY)) ?? []
}

async function persist(items: QueuedRequest[]) {
  const next = items.slice(-MAX_ITEMS)
  await cacheSet(QUEUE_KEY, next, 7 * 24 * 60 * 60_000)
  emit(next)
}

export async function enqueueRequest(
  input: Omit<QueuedRequest, 'id' | 'createdAt' | 'attempts'> & { id?: string },
): Promise<QueuedRequest> {
  const items = await listQueued()
  const item: QueuedRequest = {
    id: input.id ?? `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method: input.method,
    url: input.url,
    body: input.body,
    label: input.label,
    createdAt: Date.now(),
    attempts: 0,
  }
  // Deduplicate identical in-flight mutations (same method+url+body).
  const signature = JSON.stringify([item.method, item.url, item.body])
  const withoutDupes = items.filter(
    (existing) => JSON.stringify([existing.method, existing.url, existing.body]) !== signature,
  )
  withoutDupes.push(item)
  await persist(withoutDupes)
  return item
}

export async function removeQueued(id: string): Promise<void> {
  const items = await listQueued()
  await persist(items.filter((i) => i.id !== id))
}

export async function clearOfflineQueue(): Promise<void> {
  await persist([])
}

/**
 * Flush the queue using the provided executor (normally the axios api layer).
 * Applies exponential backoff between failed attempts.
 */
export async function flushOfflineQueue(
  executor: (item: QueuedRequest) => Promise<void>,
): Promise<FlushResult> {
  if (flushing) return { flushed: 0, remaining: (await listQueued()).length, failures: 0, deferred: 0 }
  flushing = true
  let flushed = 0
  let failures = 0
  let deferred = 0
  try {
    const items = await listQueued()
    const remaining: QueuedRequest[] = []
    const now = Date.now()

    for (const item of items) {
      if (item.nextAttemptAt && item.nextAttemptAt > now) {
        deferred += 1
        remaining.push(item)
        continue
      }
      try {
        await executor(item)
        flushed += 1
      } catch (err) {
        failures += 1
        const attempts = item.attempts + 1
        const delay = backoffMs(attempts - 1)
        const next: QueuedRequest = {
          ...item,
          attempts,
          lastError: err instanceof Error ? err.message : 'Request failed',
          nextAttemptAt: Date.now() + delay,
        }
        if (attempts < MAX_ATTEMPTS) remaining.push(next)
      }
      // Small pause between items to avoid thundering herd on reconnect.
      if (items.length > 1) await pause(80)
    }
    await persist(remaining)
    return { flushed, remaining: remaining.length, failures, deferred }
  } finally {
    flushing = false
  }
}
