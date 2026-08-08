/**
 * Offline media upload queue.
 *
 * FormData cannot be JSON-serialized into the generic offline mutation queue.
 * This module stores small files as base64 and flushes them to POST /uploads
 * when connectivity returns. Large files (>4MB) are not queued.
 */

import { cacheGet, cacheSet } from './offlineCache'

const QUEUE_KEY = 'offline.uploads.v1'
const MAX_ITEMS = 12
const MAX_BYTES = 4 * 1024 * 1024
const MAX_ATTEMPTS = 5

export type QueuedUpload = {
  id: string
  purpose?: string
  fileName: string
  mimeType: string
  base64: string
  createdAt: number
  attempts: number
  lastError?: string
  nextAttemptAt?: number
  label?: string
}

type FlushResult = { flushed: number; remaining: number; failures: number }

type Listener = (items: QueuedUpload[]) => void
const listeners = new Set<Listener>()

function emit(items: QueuedUpload[]) {
  listeners.forEach((fn) => fn(items))
}

export function subscribeOfflineUploads(listener: Listener): () => void {
  listeners.add(listener)
  void listOfflineUploads().then(listener)
  return () => listeners.delete(listener)
}

export async function listOfflineUploads(): Promise<QueuedUpload[]> {
  return (await cacheGet<QueuedUpload[]>(QUEUE_KEY)) ?? []
}

async function persist(items: QueuedUpload[]) {
  const next = items.slice(-MAX_ITEMS)
  await cacheSet(QUEUE_KEY, next, 7 * 24 * 60 * 60_000)
  emit(next)
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file for offline queue'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export async function enqueueOfflineUpload(input: {
  file: File | Blob
  purpose?: string
  fileName?: string
  label?: string
}): Promise<{ queued: true; id: string } | { queued: false; reason: string }> {
  const size = input.file.size
  if (size > MAX_BYTES) {
    return { queued: false, reason: 'File too large to queue offline (max 4MB)' }
  }
  const mimeType = input.file.type || 'application/octet-stream'
  const fileName =
    input.fileName ||
    (input.file instanceof File ? input.file.name : `upload-${Date.now()}`)
  const base64 = await fileToBase64(input.file)
  const items = await listOfflineUploads()
  const item: QueuedUpload = {
    id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    purpose: input.purpose,
    fileName,
    mimeType,
    base64,
    createdAt: Date.now(),
    attempts: 0,
    label: input.label,
  }
  items.push(item)
  await persist(items)
  return { queued: true, id: item.id }
}

export async function flushOfflineUploads(
  uploader: (file: File, purpose?: string) => Promise<unknown>,
): Promise<FlushResult> {
  const items = await listOfflineUploads()
  if (!items.length) return { flushed: 0, remaining: 0, failures: 0 }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { flushed: 0, remaining: items.length, failures: 0 }
  }

  const remaining: QueuedUpload[] = []
  let flushed = 0
  let failures = 0
  const now = Date.now()

  for (const item of items) {
    if (item.nextAttemptAt && item.nextAttemptAt > now) {
      remaining.push(item)
      continue
    }
    try {
      const blob = base64ToBlob(item.base64, item.mimeType)
      const file = new File([blob], item.fileName, { type: item.mimeType })
      await uploader(file, item.purpose)
      flushed += 1
    } catch (err) {
      failures += 1
      const attempts = item.attempts + 1
      if (attempts < MAX_ATTEMPTS) {
        remaining.push({
          ...item,
          attempts,
          lastError: err instanceof Error ? err.message : 'Upload failed',
          nextAttemptAt: Date.now() + Math.min(60_000, 1000 * 2 ** attempts),
        })
      }
    }
  }

  await persist(remaining)
  return { flushed, remaining: remaining.length, failures }
}
