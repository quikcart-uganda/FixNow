/**
 * Client-side diagnostics ring — correlation, HTTP timings, errors, sockets, queue.
 * Exposed as `window.__FIXNOW_DIAG__` for support without operator dashboards.
 */

import { apiReadCircuit, aiStatusCircuit } from './reliability/circuitBreaker'

export type DiagnosticEvent = {
  ts: string
  kind: 'http' | 'error' | 'ui' | 'socket' | 'queue' | 'info'
  message: string
  requestId?: string
  code?: string
  category?: string
  status?: number
  durationMs?: number
  path?: string
  meta?: Record<string, unknown>
}

const MAX_EVENTS = 80
const events: DiagnosticEvent[] = []
let httpOk = 0
let httpErr = 0
let socketConnects = 0
let socketDisconnects = 0
let socketErrors = 0
let startedAt = Date.now()

type QueueSnapProvider = () => Promise<{
  depth: number
  flushing: boolean
  oldestAgeSec?: number
  items?: Array<{ id: string; method: string; url: string; attempts: number; label?: string }>
}>

type MobileSnapProvider = () => Record<string, unknown> | Promise<Record<string, unknown>>

type SocketSnapProvider = () => {
  status: string
  connected: boolean
  id?: string
}

let queueProvider: QueueSnapProvider | null = null
let mobileProvider: MobileSnapProvider | null = null
let socketProvider: SocketSnapProvider | null = null

function pushEvent(event: DiagnosticEvent) {
  events.push(event)
  if (events.length > MAX_EVENTS) events.shift()
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createClientRequestId(): string {
  return newRequestId()
}

export function recordHttpDiagnostic(input: {
  requestId?: string
  method?: string
  path?: string
  status?: number
  durationMs?: number
  code?: string
  category?: string
  ok?: boolean
}) {
  const ok = input.ok ?? (typeof input.status === 'number' ? input.status < 400 : true)
  if (ok) httpOk += 1
  else httpErr += 1
  pushEvent({
    ts: new Date().toISOString(),
    kind: 'http',
    message: `${(input.method || 'GET').toUpperCase()} ${input.path || '?'} → ${input.status ?? '?'}`,
    requestId: input.requestId,
    status: input.status,
    durationMs: input.durationMs,
    path: input.path,
    code: input.code,
    category: input.category,
  })
}

export function recordClientError(input: {
  message: string
  requestId?: string
  code?: string
  category?: string
  status?: number
  path?: string
  meta?: Record<string, unknown>
}) {
  httpErr += 1
  pushEvent({
    ts: new Date().toISOString(),
    kind: 'error',
    message: input.message.slice(0, 240),
    requestId: input.requestId,
    code: input.code,
    category: input.category,
    status: input.status,
    path: input.path,
    meta: input.meta,
  })
}

export function recordUiError(message: string, meta?: Record<string, unknown>) {
  pushEvent({
    ts: new Date().toISOString(),
    kind: 'ui',
    message: message.slice(0, 240),
    category: 'ui',
    meta,
  })
}

/** Non-error diagnostic breadcrumb (permissions, lifecycle, etc.). */
export function recordInfoDiagnostic(message: string, meta?: Record<string, unknown>) {
  pushEvent({
    ts: new Date().toISOString(),
    kind: 'info',
    message: message.slice(0, 240),
    category: typeof meta?.category === 'string' ? meta.category : 'info',
    meta,
  })
}

export function recordSocketDiagnostic(
  kind: 'connect' | 'disconnect' | 'error',
  message?: string,
) {
  if (kind === 'connect') socketConnects += 1
  else if (kind === 'disconnect') socketDisconnects += 1
  else socketErrors += 1
  pushEvent({
    ts: new Date().toISOString(),
    kind: 'socket',
    message: message || `socket:${kind}`,
    category: 'socket',
  })
}

export function recordQueueDiagnostic(message: string, meta?: Record<string, unknown>) {
  pushEvent({
    ts: new Date().toISOString(),
    kind: 'queue',
    message: message.slice(0, 240),
    category: 'queue',
    meta,
  })
}

export function registerQueueDiagnostics(provider: QueueSnapProvider) {
  queueProvider = provider
}

export function registerMobileDiagnostics(provider: MobileSnapProvider) {
  mobileProvider = provider
}

export function registerSocketDiagnostics(provider: SocketSnapProvider) {
  socketProvider = provider
}

function circuitSnap() {
  return [
    { name: 'api.read', state: apiReadCircuit().state() },
    { name: 'ai.status', state: aiStatusCircuit().state() },
  ]
}

export function getSocketDiagnostics() {
  const live = socketProvider?.() ?? { status: 'disconnected', connected: false }
  return {
    ...live,
    connects: socketConnects,
    disconnects: socketDisconnects,
    errors: socketErrors,
  }
}

/** Wipe the in-memory diagnostic ring (call on logout so the next session starts clean). */
export function clearFrontendDiagnostics(): void {
  events.length = 0
  httpOk = 0
  httpErr = 0
  socketConnects = 0
  socketDisconnects = 0
  socketErrors = 0
  startedAt = Date.now()
}

export async function getFrontendDiagnostics() {
  const queue = queueProvider
    ? await queueProvider()
    : { depth: 0, flushing: false }
  const mobile = mobileProvider ? await mobileProvider() : { platform: 'web' }

  return {
    service: 'fixnow-client',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    http: { ok: httpOk, errors: httpErr },
    sockets: getSocketDiagnostics(),
    queue,
    circuits: circuitSnap(),
    mobile,
    recent: [...events].slice(-40).reverse(),
  }
}

export function installWindowDiagnostics(): void {
  if (typeof window === 'undefined') return
  // Never attach the raw dump API on production builds — use Developer Diagnostics in Admin instead.
  if (typeof import.meta !== 'undefined' && import.meta.env && !import.meta.env.DEV) return
  const api = {
    dump: () => getFrontendDiagnostics(),
    events: () => [...events],
    sockets: getSocketDiagnostics,
    clear: () => clearFrontendDiagnostics(),
  }
  ;(window as unknown as { __FIXNOW_DIAG__?: typeof api }).__FIXNOW_DIAG__ = api
}

/** Categorize client/API errors for the diagnostics ring. */
export function categorizeClientError(code?: string, status?: number): string {
  const c = String(code || '').toUpperCase()
  if (/AUTH|UNAUTHORIZED|OTP|LOCKED|SUSPENDED|CREDENTIAL/.test(c) || status === 401) return 'auth'
  if (/FORBIDDEN|PERMISSION/.test(c) || status === 403) return 'authorization'
  if (/VALIDAT|BAD_REQUEST/.test(c) || status === 422 || status === 400) return 'validation'
  if (/NOT_FOUND/.test(c) || status === 404) return 'not_found'
  if (/CONFLICT|IDEMPOTENCY/.test(c) || status === 409) return 'conflict'
  if (/RATE/.test(c) || status === 429) return 'rate_limit'
  if (/TIMEOUT|ECONNABORTED|408|504/.test(c) || status === 408 || status === 504) return 'timeout'
  if (/CIRCUIT|DEPENDENCY|UNAVAILABLE|NETWORK|502|503/.test(c) || status === 502 || status === 503)
    return 'dependency'
  if (status && status >= 500) return 'internal'
  if (status && status >= 400) return 'client'
  return 'internal'
}
