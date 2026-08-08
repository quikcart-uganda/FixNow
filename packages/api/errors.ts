import { isConfidentlyOfflineForTransport } from './connectivity'

export type ApiErrorBody = {
  success: false
  message: string
  data: null
  errors?: unknown
  error?: {
    code: string
    category?: string
    message: string
    details?: unknown
    requestId?: string
  }
}

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  requestId?: string

  constructor(status: number, message: string, code = 'UNKNOWN', details?: unknown, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }

  get isNotFound() {
    return this.status === 404
  }

  get isConflict() {
    return this.status === 409
  }

  get isValidation() {
    return this.status === 422 || this.status === 400
  }

  get isServer() {
    return this.status >= 500
  }
}

const FRIENDLY: Record<number, string> = {
  401: 'Please sign in to continue.',
  403: "You don't have permission to perform this action.",
  404: 'We could not find what you were looking for.',
  408: 'The request took too long. Please try again.',
  409: 'That action conflicts with the current state. Refresh and try again.',
  422: 'Please check your input and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our servers.',
  501: 'This feature is not available yet.',
  502: 'Service temporarily unavailable.',
  503: 'Service temporarily unavailable.',
  504: 'The request took too long. Please try again.',
}

/**
 * Auth-surface + transport copy.
 * NETWORK_ERROR is reserved for genuine offline only.
 */
const AUTH_CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  ACCOUNT_NOT_FOUND: 'Incorrect email or password.',
  INVALID_PASSWORD: 'Incorrect email or password.',
  ACCOUNT_INACTIVE: 'This account is not available. Please contact support.',
  ACCOUNT_SUSPENDED: 'This account is not available. Please contact support.',
  ACCOUNT_LOCKED: 'This account is temporarily locked. Try again later or reset your password.',
  ACCOUNT_DISABLED: 'This account is not available. Please contact support.',
  EMAIL_NOT_VERIFIED: 'Please verify your email before signing in.',
  OTP_INVALID: 'That verification code is invalid or expired. Please try again.',
  OTP_EXPIRED: 'That verification code is invalid or expired. Please try again.',
  OTP_LOCKED: 'Too many incorrect attempts. Please request a new code.',
  VALIDATION_ERROR: 'Please check your details and try again.',
  NETWORK_ERROR: 'No internet connection.',
  SERVER_UNREACHABLE: 'Service temporarily unavailable.',
  AUTH_TIMEOUT: 'The request took too long. Please try again.',
  GOOGLE_IDENTITY_CONFLICT: 'This Google account is already linked to a different FixNow email.',
  ROLE_MISMATCH: 'This email is already registered under a different account type.',
  ROLE_NOT_AVAILABLE: 'That account type is not available for this login.',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable.',
  DATABASE_UNAVAILABLE: 'Service temporarily unavailable. Please try again shortly.',
  TIMEOUT: 'The request took too long. Please try again.',
  REQUEST_CANCELLED: 'Request was cancelled. Pull to refresh or try again.',
  FORBIDDEN_ORIGIN: 'Unable to reach FixNow from this device. Please try again or contact support.',
  GOOGLE_AUTH_UNAVAILABLE:
    'Google Sign-In is currently unavailable. Please sign in using your email and password.',
  PAYMENT_UNAVAILABLE: 'This payment option is currently unavailable. Please choose another payment method.',
  UPLOAD_FAILED: "We couldn't upload your image right now. Please try again.",
  EMAIL_FAILED: "We couldn't send the email at the moment. Please try again later.",
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: "You don't have permission to perform this action.",
}

function looksLikeNetworkFailure(message: string) {
  return /failed to fetch|networkerror|network request|load failed|offline|err_network|econnrefused|enotfound/i.test(
    message,
  )
}

function looksLikeTimeout(message: string) {
  return /timed out|timeout|econnaborted|took too long/i.test(message)
}

/**
 * True when a message looks like an internal/config/diagnostic string that must
 * never reach Customers or Technicians.
 */
export function looksLikeInternalMessage(message: string): boolean {
  return /TypeError|ReferenceError|RangeError|SyntaxError|cannot read (?:properties|property)|is not a function|undefined is not|not configured|misconfigured|feature flag|turned off for this environment|environment|NODE_ENV|APP_ENV|SMTP|Cloudinary|mongodb|mongoose|ECONNREFUSED|ENOTFOUND|stack trace|at\s+\w+\s+\(|localhost:\d+|127\.0\.0\.1|API[_ ]?key|client[_ ]?id|secret|webhook secret|JWT|zod|cast to ObjectId|ValidationError|provider (?:is )?(?:missing|not|disabled)|mock provider|development mode|staging|production only|Sentry|Firebase credentials|WebView|origin is not authorized|console provider|debug otp|dev otp|coming from backend|internal server|\bOAuth\b|Platform Mode|entitlement engine|\bSandbox\b|\bRBAC\b|\bmiddleware\b|\bCORS\b/i.test(
    message,
  )
}

function sanitizeUserMessage(message: string, status?: number): string {
  const trimmed = String(message || '').trim()
  if (!trimmed) return FRIENDLY[status ?? 500] ?? 'Something went wrong. Please try again.'
  if (looksLikeInternalMessage(trimmed)) {
    return FRIENDLY[status ?? 500] ?? 'Something went wrong. Please try again.'
  }
  return trimmed
}

function transportFailurePresentation(err?: { status?: number; message?: string }): FriendlyErrorPresentation {
  // Default: device is online, API/host unreachable — never "No internet".
  if (isConfidentlyOfflineForTransport()) {
    return {
      title: 'No internet connection',
      message: AUTH_CODE_MESSAGES.NETWORK_ERROR,
      status: err?.status ?? 0,
      code: 'NETWORK_ERROR',
    }
  }
  return {
    title: 'Service unavailable',
    message: AUTH_CODE_MESSAGES.SERVER_UNREACHABLE,
    status: err?.status ?? 0,
    code: 'SERVER_UNREACHABLE',
  }
}

export function getFriendlyErrorMessage(err: unknown): string {
  return getFriendlyErrorPresentation(err).message
}

export type FriendlyErrorPresentation = {
  title: string
  message: string
  status: number
  code: string
}

/** Status-aware title + body for AsyncStateView and toasts. Never misleading. */
export function getFriendlyErrorPresentation(err: unknown): FriendlyErrorPresentation {
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'CircuitOpenError') {
    return {
      title: 'Service unavailable',
      message: AUTH_CODE_MESSAGES.SERVICE_UNAVAILABLE,
      status: 503,
      code: 'CIRCUIT_OPEN',
    }
  }

  if (err instanceof ApiError) {
    const code = String(err.code || '').toUpperCase()
    const detailReason =
      err.details && typeof err.details === 'object'
        ? String((err.details as { reason?: string; code?: string }).reason || (err.details as { code?: string }).code || '')
            .toUpperCase()
        : ''

    // Cancelled / aborted — never "no internet"
    if (
      code === 'REQUEST_CANCELLED' ||
      (code === 'HTTP_0' && /cancel|abort/i.test(err.message)) ||
      (/cancel|abort/i.test(err.message) && (err.status === 0 || code === 'ERR_CANCELED'))
    ) {
      return {
        title: "Couldn't finish loading",
        message: AUTH_CODE_MESSAGES.REQUEST_CANCELLED,
        status: 0,
        code: 'REQUEST_CANCELLED',
      }
    }

    // Explicit server unreachable — never reclassify as offline via navigator.onLine
    if (code === 'SERVER_UNREACHABLE' || code === 'SERVICE_UNAVAILABLE') {
      return {
        title: 'Service unavailable',
        message: AUTH_CODE_MESSAGES.SERVER_UNREACHABLE,
        status: err.status || 0,
        code: code === 'SERVICE_UNAVAILABLE' ? 'SERVICE_UNAVAILABLE' : 'SERVER_UNREACHABLE',
      }
    }

    // Timeouts before generic network classification
    if (err.status === 408 || code === 'TIMEOUT' || code === 'HTTP_408' || code === 'AUTH_TIMEOUT' || looksLikeTimeout(err.message)) {
      return {
        title: 'Request timed out',
        message: AUTH_CODE_MESSAGES.TIMEOUT,
        status: 408,
        code: 'TIMEOUT',
      }
    }

    if (err.status === 403 && /origin|cors/i.test(`${code} ${err.message}`)) {
      return {
        title: "Couldn't reach FixNow",
        message: AUTH_CODE_MESSAGES.FORBIDDEN_ORIGIN,
        status: 403,
        code: 'FORBIDDEN_ORIGIN',
      }
    }

    // Genuine offline OR ambiguous transport — re-check confidence
    if (code === 'NETWORK_ERROR' || err.status === 0 || looksLikeNetworkFailure(err.message)) {
      return transportFailurePresentation(err)
    }

    if (AUTH_CODE_MESSAGES[code] || (detailReason && AUTH_CODE_MESSAGES[detailReason])) {
      const message = AUTH_CODE_MESSAGES[code] || AUTH_CODE_MESSAGES[detailReason]!
      return {
        title: titleForStatus(err.status, code),
        message,
        status: err.status,
        code: code || detailReason || `HTTP_${err.status}`,
      }
    }

    if (err.status === 401 && /credential|password|login|email/i.test(`${code} ${err.message}`)) {
      return {
        title: 'Sign-in failed',
        message: AUTH_CODE_MESSAGES.INVALID_CREDENTIALS,
        status: 401,
        code: 'INVALID_CREDENTIALS',
      }
    }

    if (err.status === 401) {
      return {
        title: 'Sign in required',
        message: FRIENDLY[401],
        status: 401,
        code: code || 'UNAUTHORIZED',
      }
    }

    if (err.status === 403) {
      return {
        title: "You don't have permission",
        message: FRIENDLY[403],
        status: 403,
        code: code || 'FORBIDDEN',
      }
    }

    if (err.status === 429 || code === 'RATE_LIMITED') {
      return {
        title: 'Too many requests',
        message: sanitizeUserMessage(err.message || FRIENDLY[429], 429),
        status: 429,
        code: 'RATE_LIMITED',
      }
    }

    if (code === 'DATABASE_UNAVAILABLE') {
      return {
        title: 'Service unavailable',
        message: AUTH_CODE_MESSAGES.DATABASE_UNAVAILABLE,
        status: err.status || 503,
        code,
      }
    }

    if (err.status >= 500) {
      return {
        title: titleForStatus(err.status, code),
        message: FRIENDLY[err.status] ?? FRIENDLY[500],
        status: err.status,
        code: code || `HTTP_${err.status}`,
      }
    }

    const message =
      err.message && err.status !== 500
        ? sanitizeUserMessage(err.message, err.status)
        : FRIENDLY[err.status] ?? 'Something went wrong. Please try again.'

    return {
      title: titleForStatus(err.status, code),
      message,
      status: err.status,
      code: code || `HTTP_${err.status}`,
    }
  }

  if (err instanceof Error) {
    if (err.name === 'AbortError' || /cancel|abort/i.test(err.message)) {
      return {
        title: "Couldn't finish loading",
        message: AUTH_CODE_MESSAGES.REQUEST_CANCELLED,
        status: 0,
        code: 'REQUEST_CANCELLED',
      }
    }
    if (looksLikeTimeout(err.message)) {
      return {
        title: 'Request timed out',
        message: AUTH_CODE_MESSAGES.TIMEOUT,
        status: 408,
        code: 'TIMEOUT',
      }
    }
    if (looksLikeNetworkFailure(err.message)) {
      return transportFailurePresentation()
    }
    return {
      title: "Couldn't load this",
      message: sanitizeUserMessage(err.message),
      status: 0,
      code: 'UNKNOWN',
    }
  }

  return {
    title: "Couldn't load this",
    message: 'Something went wrong. Please try again.',
    status: 0,
    code: 'UNKNOWN',
  }
}

function titleForStatus(status: number, code?: string): string {
  if (code === 'DATABASE_UNAVAILABLE') return 'Service unavailable'
  if (code === 'SERVER_UNREACHABLE' || code === 'SERVICE_UNAVAILABLE' || code === 'FORBIDDEN_ORIGIN') {
    return 'Service unavailable'
  }
  if (code === 'NETWORK_ERROR') return 'No internet connection'
  if (status === 401) return 'Sign in required'
  if (status === 403) return "You don't have permission"
  if (status === 404) return 'Not found'
  if (status === 408 || status === 504) return 'Request timed out'
  if (status === 429) return 'Too many requests'
  if (status === 0) {
    return isConfidentlyOfflineForTransport() ? 'No internet connection' : 'Service unavailable'
  }
  if (status >= 500) return 'Server error'
  return "Couldn't load this"
}

export function toApiError(status: number, body: ApiErrorBody | null, fallback = 'Request failed'): ApiError {
  const message = body?.error?.message || body?.message || FRIENDLY[status] || fallback
  const code = body?.error?.code || `HTTP_${status}`
  return new ApiError(status, message, code, body?.error?.details ?? body?.errors, body?.error?.requestId)
}
