import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { computeBackoffMs, withRetry } from './backoff.ts'
import { getCircuitBreaker, CircuitOpenError } from './circuitBreaker.ts'
import { paymentIdempotencyKey, clearPaymentIdempotencyKey, newClientMessageId } from './idempotency.ts'

function installSessionStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v))
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
    },
    configurable: true,
  })
}

describe('computeBackoffMs', () => {
  it('stays within expanded range', () => {
    for (let i = 0; i < 20; i += 1) {
      const ms = computeBackoffMs({ attempt: 2, baseMs: 100, maxMs: 1000, jitter: 0.3 })
      assert.ok(ms >= 0 && ms <= 1000)
    }
  })
})

describe('withRetry', () => {
  it('retries then succeeds', async () => {
    let n = 0
    const value = await withRetry(
      async () => {
        n += 1
        if (n < 3) throw new Error('transient')
        return 'ok'
      },
      { maxAttempts: 3, baseMs: 1, maxMs: 5 },
    )
    assert.equal(value, 'ok')
    assert.equal(n, 3)
  })
})

describe('client circuitBreaker', () => {
  it('opens and throws CircuitOpenError', async () => {
    const name = `client-cb-${Date.now()}-${Math.random()}`
    const breaker = getCircuitBreaker({ name, failureThreshold: 1, resetMs: 60_000 })
    await assert.rejects(() => breaker.exec(async () => {
      throw new Error('fail')
    }))
    await assert.rejects(() => breaker.exec(async () => 'x'), (err: unknown) => err instanceof CircuitOpenError)
  })
})

describe('idempotency helpers', () => {
  beforeEach(() => {
    installSessionStorage()
  })

  it('reuses stable payment key per job', () => {
    const a = paymentIdempotencyKey('job-1')
    const b = paymentIdempotencyKey('job-1')
    assert.equal(a, b)
    assert.equal(a, 'ui-pay-job-1')
    clearPaymentIdempotencyKey('job-1')
    assert.equal(paymentIdempotencyKey('job-1'), 'ui-pay-job-1')
  })

  it('mints unique client message ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newClientMessageId('m')))
    assert.equal(ids.size, 20)
  })
})
