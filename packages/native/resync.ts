/**
 * Automatic resynchronisation when the device returns online.
 *
 * Listens for the canonical `online` / `fixnow:app-resume` events (also
 * re-dispatched by the Capacitor Network bridge) and:
 *   1. Flushes the offline mutation queue.
 *   2. Broadcasts `fixnow:resync` so mounted screens can reload.
 */

import { flushOfflineQueue, type QueuedRequest } from './offlineQueue'
import { flushOfflineUploads } from './offlineUpload'
import { noteQueueFlush } from './diagnostics'
import { isNativePlatform } from './platform'

type HttpExecutor = (item: QueuedRequest) => Promise<void>
type UploadExecutor = (file: File, purpose?: string) => Promise<unknown>

let started = false
let httpExecutor: HttpExecutor | null = null
let uploadExecutor: UploadExecutor | null = null

export function setOfflineQueueExecutor(executor: HttpExecutor) {
  httpExecutor = executor
}

export function setOfflineUploadExecutor(executor: UploadExecutor) {
  uploadExecutor = executor
}

export async function triggerResync(reason: 'online' | 'resume' | 'manual' = 'manual'): Promise<void> {
  if (httpExecutor) {
    try {
      const result = await flushOfflineQueue(httpExecutor)
      noteQueueFlush(result)
    } catch {
      /* keep going — screens still need a refresh */
    }
  }
  if (uploadExecutor) {
    try {
      await flushOfflineUploads(uploadExecutor)
    } catch {
      /* ignore — will retry on next online */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fixnow:resync', { detail: { reason } }))
  }
}

export function initAutoResync(): void {
  if (started || typeof window === 'undefined') return
  started = true

  const run = () => {
    void triggerResync(document.visibilityState === 'visible' ? 'online' : 'online')
  }

  window.addEventListener('online', run)
  window.addEventListener('fixnow:app-resume', () => {
    void triggerResync('resume')
  })

  // Native Network already re-dispatches `online`; this is a belt-and-braces
  // kick after bootstrap in case the first online event was missed.
  if (isNativePlatform() && typeof navigator !== 'undefined' && navigator.onLine) {
    window.setTimeout(() => void triggerResync('online'), 1_200)
  }
}
