import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import {
  categorizeClientError,
  createClientRequestId,
  recordClientError,
  recordHttpDiagnostic,
} from './diagnostics'
import { tokenStorage } from './tokenStorage'
import { isConfidentlyOfflineForTransport, readNetworkSignal } from './connectivity'
import { toApiError, type ApiErrorBody } from './errors'
import { computeBackoffMs, sleep } from './reliability/backoff'
import { apiReadCircuit, CircuitOpenError } from './reliability/circuitBreaker'
import {
  isCapacitorAndroid,
  isCapacitorNative,
  resolveConfiguredApiUrl,
} from './resolveBaseUrl'

export type ApiSuccess<T> = {
  success: true
  message: string
  data: T
  meta?: Record<string, unknown>
}

const ARRAY_CONTRACT_KEYS = new Set([
  'items',
  'applications',
  'badges',
  'categories',
  'conversations',
  'history',
  'messages',
  'methods',
  'notifications',
  'offers',
  'recent',
  'transactions',
])

/**
 * Compatibility guard for collection contracts. The backend contract remains
 * `{ success, data }`; malformed plural fields degrade to an empty list and are
 * recorded for diagnostics instead of crashing React render paths.
 */
function normalizeApiData<T>(value: T, path?: string, requestId?: string): T {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  let normalized: Record<string, unknown> | null = null
  for (const key of ARRAY_CONTRACT_KEYS) {
    if (key in source && !Array.isArray(source[key])) {
      normalized ??= { ...source }
      normalized[key] = []
      recordClientError({
        message: 'API collection contract mismatch',
        requestId,
        code: 'INVALID_RESPONSE_SHAPE',
        category: 'validation',
        path,
        meta: { field: key, receivedType: source[key] === null ? 'null' : typeof source[key] },
      })
    }
  }
  return (normalized ?? source) as T
}

type RetriableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
  _retryCount?: number
  /** Skip transport retries for this request */
  skipRetry?: boolean
  /** Override timeout ms */
  timeoutMs?: number
  /** Correlation id for logs / diagnostics */
  _requestId?: string
  _startedAt?: number
}

/** Resolved once at module load; Capacitor is available before the bundle runs. */
let API_URL = resolveConfiguredApiUrl()

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TRANSPORT_RETRIES = 3

let refreshPromise: Promise<string | null> | null = null
let onAuthFailure: (() => void) | null = null

export function setAuthFailureHandler(handler: (() => void) | null) {
  onAuthFailure = handler
}

export function getApiBaseUrl() {
  return API_URL
}

/**
 * Re-resolve the API base URL (e.g. after Capacitor bridge is confirmed ready).
 * Safe to call multiple times; updates the shared axios instance.
 */
export function refreshApiBaseUrl(): string {
  API_URL = resolveConfiguredApiUrl()
  http.defaults.baseURL = API_URL
  return API_URL
}

export const http: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  withCredentials: true,
})

http.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const cfg = config as RetriableConfig
  if (typeof cfg.timeoutMs === 'number') {
    config.timeout = cfg.timeoutMs
  }
  const requestId =
    (typeof config.headers?.['X-Request-Id'] === 'string' && config.headers['X-Request-Id']) ||
    createClientRequestId()
  cfg._requestId = requestId
  cfg._startedAt = Date.now()
  config.headers['X-Request-Id'] = requestId
  return config
})

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken()
  try {
    const { data } = await axios.post<ApiSuccess<{ tokens: { accessToken: string; refreshToken: string } }>>(
      `${getApiBaseUrl()}/auth/refresh`,
      refreshToken ? { refreshToken } : {},
      { withCredentials: true, headers: { 'Content-Type': 'application/json' }, timeout: 15_000 },
    )
    const tokens = data.data.tokens
    tokenStorage.updateTokens(tokens)
    return tokens.accessToken
  } catch (err) {
    const ax = err as AxiosError
    const status = ax.response?.status
    // Only revoke local session on definitive auth failures — not network blips.
    if (status === 401 || status === 403) {
      tokenStorage.clear()
      onAuthFailure?.()
      return null
    }
    // Signal transport failure without clearing the refresh session.
    throw err
  }
}

/** Single-flight refresh used by interceptors and AuthProvider bootstrap. */
export function queueRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken()
      .catch((err) => {
        const ax = err as AxiosError
        if (ax.response?.status === 401 || ax.response?.status === 403) return null
        // Re-throw network errors so callers can retry without logging the user out.
        throw err
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function isIdempotentMethod(method?: string) {
  const m = (method || 'get').toUpperCase()
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS'
}

function isTransientStatus(status?: number) {
  // Do NOT retry 429 — retries amplify the rate limiter and cascade failures
  // across unrelated Admin pages sharing the same client budget.
  return status === 408 || status === 502 || status === 503 || status === 504
}

function isNetworkError(error: AxiosError) {
  return !error.response && (error.code === 'ECONNABORTED' || error.message === 'Network Error' || error.code === 'ERR_NETWORK')
}

function shouldTransportRetry(error: AxiosError, config?: RetriableConfig) {
  if (!config || config.skipRetry) return false
  if (config.signal?.aborted) return false
  const count = config._retryCount ?? 0
  if (count >= MAX_TRANSPORT_RETRIES) return false
  // Never auto-retry non-idempotent mutations (payments/auth side effects).
  if (!isIdempotentMethod(config.method)) return false
  const status = error.response?.status
  return isNetworkError(error) || isTransientStatus(status)
}

http.interceptors.response.use(
  (response) => {
    if (isIdempotentMethod(response.config.method)) {
      apiReadCircuit().recordSuccess()
    }
    const cfg = response.config as RetriableConfig
    const durationMs = cfg._startedAt ? Date.now() - cfg._startedAt : undefined
    const serverId = response.headers?.['x-request-id'] as string | undefined
    recordHttpDiagnostic({
      requestId: serverId || cfg._requestId,
      method: response.config.method,
      path: response.config.url,
      status: response.status,
      durationMs,
      ok: true,
    })
    return response
  },
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status

    if (
      status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retry = true
      try {
        const access = await queueRefresh()
        if (access) {
          original.headers.Authorization = `Bearer ${access}`
          return http.request(original)
        }
      } catch {
        // Network failure during refresh — leave session intact; surface original 401.
      }
    }

    if (status === 401 && !original?.url?.includes('/auth/refresh')) {
      tokenStorage.clear()
      onAuthFailure?.()
    }

    if (shouldTransportRetry(error, original) && original) {
      const attempt = original._retryCount ?? 0
      original._retryCount = attempt + 1
      const delay = computeBackoffMs({
        attempt,
        baseMs: 400,
        maxMs: 6_000,
      })
      const retryAfter = Number(error.response?.headers?.['retry-after'])
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay
      try {
        await sleep(waitMs, (original.signal as AbortSignal | undefined) ?? undefined)
        return http.request(original)
      } catch {
        /* fall through to error mapping */
      }
    }

    if (isNetworkError(error) || (status && status >= 500)) {
      if (isIdempotentMethod(original?.method)) {
        apiReadCircuit().recordFailure()
      }
    }

    if (error.code === 'ERR_CANCELED' || original?.signal?.aborted) {
      throw toApiError(0, {
        success: false,
        message: 'Request was cancelled. Pull to refresh or try again.',
        data: null,
        error: { code: 'REQUEST_CANCELLED', message: 'Request was cancelled. Pull to refresh or try again.' },
      })
    }

    const durationMs = original?._startedAt ? Date.now() - original._startedAt : undefined
    const body = error.response?.data ?? null
    const requestId =
      (error.response?.headers?.['x-request-id'] as string | undefined) ||
      body?.error?.requestId ||
      original?._requestId

    if (error.code === 'ECONNABORTED') {
      recordClientError({
        message: 'Request timed out',
        requestId,
        code: 'TIMEOUT',
        category: categorizeClientError('TIMEOUT', 408),
        status: 408,
        path: original?.url,
        meta: {
          durationMs,
          baseURL: getApiBaseUrl(),
          platform: isCapacitorAndroid() ? 'android' : isCapacitorNative() ? 'native' : 'web',
          axiosCode: error.code,
        },
      })
      throw toApiError(
        408,
        {
          success: false,
          message: 'The request took too long. Please try again.',
          data: null,
          error: { code: 'TIMEOUT', message: 'The request took too long. Please try again.', requestId },
        },
        'The request took too long. Please try again.',
      )
    }

    if (error.response) {
      const apiErr = toApiError(error.response.status, error.response.data ?? null)
      recordHttpDiagnostic({
        requestId: apiErr.requestId || requestId,
        method: original?.method,
        path: original?.url,
        status: apiErr.status,
        durationMs,
        code: apiErr.code,
        category: categorizeClientError(apiErr.code, apiErr.status),
        ok: false,
      })
      throw apiErr
    }

    // Transport failure: no HTTP response (DNS, SSL, refused, CORS, offline, cleartext).
    // Default to SERVER_UNREACHABLE. Only NETWORK_ERROR when confidently offline.
    const axiosCode = error.code || 'ERR_NETWORK'
    const axiosMessage = error.message || 'Network Error'
    const baseURL = getApiBaseUrl()
    const netSignal = readNetworkSignal()
    const offline = isConfidentlyOfflineForTransport()
    const transportCode = offline ? 'NETWORK_ERROR' : 'SERVER_UNREACHABLE'
    const transportMessage = offline
      ? 'No internet connection.'
      : 'Service temporarily unavailable.'
    recordClientError({
      message: 'Network transport failure',
      requestId,
      code: transportCode,
      category: categorizeClientError(transportCode, 0),
      path: original?.url,
      meta: {
        durationMs,
        baseURL,
        method: original?.method,
        platform: isCapacitorAndroid() ? 'android' : isCapacitorNative() ? 'native' : 'web',
        axiosCode,
        axiosMessage,
        online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
        netSignal,
        confidentlyOffline: offline,
        pageHost: typeof window === 'undefined' ? undefined : window.location.hostname,
      },
    })
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.debug('[fixnow:api] transport failure', {
        baseURL,
        path: original?.url,
        method: original?.method,
        axiosCode,
        axiosMessage,
        pageHost: typeof window === 'undefined' ? undefined : window.location.hostname,
        requestId,
        online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
        netSignal,
        transportCode,
      })
    }
    throw toApiError(
      0,
      {
        success: false,
        message: transportMessage,
        data: null,
        error: {
          code: transportCode,
          message: transportMessage,
          requestId,
        },
      },
      transportMessage,
    )
  },
)

export type ApiRequestOptions = AxiosRequestConfig & {
  skipRetry?: boolean
  timeoutMs?: number
  signal?: AbortSignal
  /** When true, refuse to call if the read circuit is open (graceful degradation). */
  respectCircuit?: boolean
}

export async function apiRequest<T>(
  config: ApiRequestOptions,
): Promise<{ data: T; meta?: Record<string, unknown>; message: string }> {
  if (config.respectCircuit && isIdempotentMethod(config.method) && !apiReadCircuit().allow()) {
    throw new CircuitOpenError('api.read')
  }
  const res = await http.request<ApiSuccess<T>>({
    ...config,
    skipRetry: config.skipRetry,
    timeoutMs: config.timeoutMs,
    signal: config.signal,
  } as AxiosRequestConfig)
  if (res.status === 204) {
    return { data: undefined as T, message: 'Success' }
  }
  const envelope = res.data
  if (!envelope || envelope.success !== true || !('data' in envelope)) {
    recordClientError({
      message: 'Malformed API response envelope',
      code: 'INVALID_RESPONSE_SHAPE',
      category: 'validation',
      path: config.url,
      meta: { status: res.status },
    })
    throw toApiError(502, null, 'Service temporarily unavailable. Please try again.')
  }
  const requestId = res.headers?.['x-request-id'] as string | undefined
  return {
    data: normalizeApiData(envelope.data, config.url, requestId),
    meta: envelope.meta,
    message: typeof envelope.message === 'string' ? envelope.message : 'Success',
  }
}

export async function apiGet<T>(url: string, params?: Record<string, unknown>, options?: ApiRequestOptions) {
  return apiRequest<T>({ ...options, method: 'GET', url, params })
}

export async function apiPost<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>({ ...options, method: 'POST', url, data: body, skipRetry: options?.skipRetry ?? true })
}

export async function apiPatch<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>({ ...options, method: 'PATCH', url, data: body, skipRetry: options?.skipRetry ?? true })
}

export async function apiPut<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
  return apiRequest<T>({ ...options, method: 'PUT', url, data: body, skipRetry: options?.skipRetry ?? true })
}

export async function apiDelete<T>(url: string, options?: ApiRequestOptions) {
  return apiRequest<T>({ ...options, method: 'DELETE', url, skipRetry: options?.skipRetry ?? true })
}
