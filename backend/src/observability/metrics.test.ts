import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  recordHttpResult,
  recordErrorCode,
  getMetricsSnapshot,
} from './metrics.js'

describe('observability metrics', () => {
  it('records http classes and latency percentiles', () => {
    recordHttpResult(200, 10)
    recordHttpResult(404, 20)
    recordHttpResult(500, 30)
    recordErrorCode('auth:UNAUTHORIZED')

    const snap = getMetricsSnapshot()
    assert.ok(snap.http['2xx'] >= 1)
    assert.ok(snap.http['4xx'] >= 1)
    assert.ok(snap.http['5xx'] >= 1)
    assert.ok(snap.latency.count >= 3)
    assert.ok(typeof snap.latency.p95Ms === 'number')
    assert.ok(snap.errorsByCode['auth:UNAUTHORIZED'] >= 1)
  })
})
