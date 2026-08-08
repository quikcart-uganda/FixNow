/**
 * Centralized image load diagnostics for FixNow media pipeline.
 * Keeps a ring buffer for debug overlays / support reports.
 */

export type ImageDiagEvent = {
  at: string
  phase: 'start' | 'success' | 'retry' | 'fallback' | 'exhausted'
  requestedUrl: string
  finalUrl?: string
  httpStatus?: number | null
  component?: string
  entityId?: string
  fallbackUsed?: boolean
  durationMs?: number
  error?: string
}

const MAX = 80
const buffer: ImageDiagEvent[] = []
const listeners = new Set<(e: ImageDiagEvent) => void>()

export function logImageDiag(event: Omit<ImageDiagEvent, 'at'> & { at?: string }): ImageDiagEvent {
  const row: ImageDiagEvent = {
    at: event.at || new Date().toISOString(),
    phase: event.phase,
    requestedUrl: event.requestedUrl,
    finalUrl: event.finalUrl,
    httpStatus: event.httpStatus ?? null,
    component: event.component,
    entityId: event.entityId,
    fallbackUsed: event.fallbackUsed,
    durationMs: event.durationMs,
    error: event.error,
  }
  buffer.push(row)
  if (buffer.length > MAX) buffer.shift()
  listeners.forEach((fn) => {
    try {
      fn(row)
    } catch {
      /* ignore */
    }
  })
  if (typeof console !== 'undefined' && (row.phase === 'exhausted' || row.phase === 'fallback')) {
    // Helpful in Android WebView remote debugging without crashing release UX.
    console.warn('[fixnow:image]', row.phase, row.requestedUrl, row.component || '', row.error || '')
  }
  return row
}

export function getImageDiagEvents(): ImageDiagEvent[] {
  return buffer.slice()
}

export function clearImageDiagEvents(): void {
  buffer.length = 0
}

export function subscribeImageDiag(fn: (e: ImageDiagEvent) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
