import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCircuitBreaker, CircuitOpenError } from './circuitBreaker.js'

describe('circuitBreaker', () => {
  it('opens after failure threshold and rejects', async () => {
    const name = `unit-breaker-${Date.now()}-${Math.random()}`
    const breaker = createCircuitBreaker({ name, failureThreshold: 2, resetMs: 60_000 })

    await assert.rejects(() => breaker.exec(async () => {
      throw new Error('boom')
    }))
    await assert.rejects(() => breaker.exec(async () => {
      throw new Error('boom')
    }))

    assert.equal(breaker.state(), 'open')
    await assert.rejects(() => breaker.exec(async () => 'ok'), (err: unknown) => {
      assert.ok(err instanceof CircuitOpenError)
      return true
    })
  })

  it('returns same instance for same name', () => {
    const name = `unit-shared-${Date.now()}`
    const a = createCircuitBreaker({ name })
    const b = createCircuitBreaker({ name })
    assert.equal(a, b)
  })
})
