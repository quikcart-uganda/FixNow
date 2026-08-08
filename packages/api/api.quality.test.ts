import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeSocketPayload, clearSocketDedupe, orderByCreatedAt } from './eventDedupe.ts'
import { ApiError, toApiError, getFriendlyErrorMessage, getFriendlyErrorPresentation } from './errors.ts'
import { categorizeClientError } from './diagnostics.ts'
import { publishNetworkSignal } from './connectivity.ts'

describe('eventDedupe', () => {
  beforeEach(() => {
    clearSocketDedupe()
  })

  it('accepts first payload and rejects duplicate', () => {
    const payload = { id: 'msg-1', createdAt: '2026-01-01T00:00:00.000Z' }
    assert.equal(dedupeSocketPayload('message:new', payload), true)
    assert.equal(dedupeSocketPayload('message:new', payload), false)
  })

  it('orders by createdAt', () => {
    const items = orderByCreatedAt([
      { id: 'b', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
    ])
    assert.equal(items[0]?.id, 'a')
  })
})

describe('ApiError', () => {
  it('classifies statuses', () => {
    const err = new ApiError(401, 'nope', 'UNAUTHORIZED')
    assert.equal(err.isUnauthorized, true)
    assert.equal(err.isServer, false)
  })

  it('maps body via toApiError', () => {
    const err = toApiError(422, {
      success: false,
      message: 'bad',
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'bad', requestId: 'r1' },
    })
    assert.equal(err.code, 'VALIDATION_ERROR')
    assert.equal(err.requestId, 'r1')
  })

  it('friendly messages for auth codes', () => {
    const msg = getFriendlyErrorMessage(new ApiError(401, 'x', 'INVALID_CREDENTIALS'))
    assert.match(msg, /Incorrect email or password/i)
  })

  it('presents rate-limit errors with an accurate title', () => {
    const view = getFriendlyErrorPresentation(
      new ApiError(429, 'Too many requests. Please try again later.', 'RATE_LIMITED'),
    )
    assert.equal(view.title, 'Too many requests')
    assert.match(view.message, /too many requests/i)
  })

  it('does not call transport failures "No internet" when online', () => {
    publishNetworkSignal(true, 'browser')
    const view = getFriendlyErrorPresentation(new ApiError(0, 'Network Error', 'NETWORK_ERROR'))
    assert.equal(view.code, 'SERVER_UNREACHABLE')
    assert.equal(view.title, 'Service unavailable')
    assert.match(view.message, /temporarily unavailable/i)
    assert.doesNotMatch(view.message, /no internet/i)
  })

  it('uses No internet only when confidently offline', () => {
    publishNetworkSignal(false, 'browser')
    const view = getFriendlyErrorPresentation(new ApiError(0, 'Network Error', 'NETWORK_ERROR'))
    assert.equal(view.code, 'NETWORK_ERROR')
    assert.match(view.message, /no internet/i)
  })

  it('never reclassifies SERVER_UNREACHABLE as offline', () => {
    publishNetworkSignal(false, 'browser')
    const view = getFriendlyErrorPresentation(
      new ApiError(0, 'Service temporarily unavailable.', 'SERVER_UNREACHABLE'),
    )
    assert.equal(view.code, 'SERVER_UNREACHABLE')
    assert.doesNotMatch(view.message, /no internet/i)
  })

  it('maps 401/403/500 distinctly from offline', () => {
    assert.match(getFriendlyErrorMessage(new ApiError(401, 'x', 'UNAUTHORIZED')), /sign in/i)
    assert.match(getFriendlyErrorMessage(new ApiError(403, 'x', 'FORBIDDEN')), /permission/i)
    assert.match(getFriendlyErrorMessage(new ApiError(500, 'x', 'INTERNAL')), /servers/i)
  })

  it('maps timeouts without offline copy', () => {
    const view = getFriendlyErrorPresentation(new ApiError(408, 'timeout', 'TIMEOUT'))
    assert.equal(view.code, 'TIMEOUT')
    assert.match(view.message, /took too long/i)
    assert.doesNotMatch(view.message, /no internet/i)
  })
})

describe('categorizeClientError', () => {
  it('buckets common codes', () => {
    assert.equal(categorizeClientError('UNAUTHORIZED', 401), 'auth')
    assert.equal(categorizeClientError('TIMEOUT', 408), 'timeout')
    assert.equal(categorizeClientError('CIRCUIT_OPEN', 503), 'dependency')
  })
})
