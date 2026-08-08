/**
 * Queue-safe mutation helper — graceful degradation when offline.
 * Never use for payments or auth.
 */

import { enqueueRequest, type QueuedRequest } from './offlineQueue'

export type MutationQueueSpec = Omit<QueuedRequest, 'id' | 'createdAt' | 'attempts'> & { id?: string }

export type MutateResult<T> = {
  queued: boolean
  data?: T
}

function isOffline(): boolean {
  try {
    const signal = typeof window !== 'undefined' ? window.__FIXNOW_NET__ : undefined
    if (signal && signal.source === 'native') return signal.connected === false
  } catch {
    /* ignore */
  }
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function isNetworkFailure(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status: unknown }).status)
    return status === 0 || status === 408 || status === 503 || status === 502 || status === 504
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('network') || msg.includes('timeout') || msg.includes('offline') || msg.includes('timed out')
  }
  return false
}

/**
 * Run an online mutation; if offline (or network fails), enqueue for later flush.
 */
export async function mutateWithOfflineFallback<T>(
  online: () => Promise<T>,
  queue: MutationQueueSpec,
): Promise<MutateResult<T>> {
  if (isOffline()) {
    await enqueueRequest(queue)
    return { queued: true }
  }
  try {
    const data = await online()
    return { queued: false, data }
  } catch (err) {
    if (isNetworkFailure(err)) {
      await enqueueRequest(queue)
      return { queued: true }
    }
    throw err
  }
}
