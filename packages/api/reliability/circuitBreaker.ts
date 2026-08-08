/**
 * In-memory circuit breaker for client & shared packages.
 * States: closed → open (after failures) → half-open (probe) → closed.
 */

export type CircuitState = 'closed' | 'open' | 'half_open'

export type CircuitBreakerOptions = {
  name: string
  /** Failures before opening (default 5) */
  failureThreshold?: number
  /** Successes in half-open before closing (default 2) */
  successThreshold?: number
  /** Time open before allowing a probe (default 30s) */
  resetMs?: number
}

export type CircuitBreaker = {
  name: string
  state: () => CircuitState
  allow: () => boolean
  recordSuccess: () => void
  recordFailure: () => void
  /** Run fn if circuit allows; throws CircuitOpenError when open */
  exec: <T>(fn: () => Promise<T>) => Promise<T>
}

export class CircuitOpenError extends Error {
  circuit: string
  constructor(name: string) {
    super('Service temporarily unavailable. Please try again shortly.')
    this.name = 'CircuitOpenError'
    this.circuit = name
  }
}

const registry = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const existing = registry.get(options.name)
  if (existing) return existing

  const failureThreshold = options.failureThreshold ?? 5
  const successThreshold = options.successThreshold ?? 2
  const resetMs = options.resetMs ?? 30_000

  let state: CircuitState = 'closed'
  let failures = 0
  let successes = 0
  let openedAt = 0

  const breaker: CircuitBreaker = {
    name: options.name,
    state: () => {
      if (state === 'open' && Date.now() - openedAt >= resetMs) {
        state = 'half_open'
        successes = 0
      }
      return state
    },
    allow: () => {
      const s = breaker.state()
      return s === 'closed' || s === 'half_open'
    },
    recordSuccess: () => {
      if (state === 'half_open') {
        successes += 1
        if (successes >= successThreshold) {
          state = 'closed'
          failures = 0
          successes = 0
        }
      } else {
        failures = 0
        state = 'closed'
      }
    },
    recordFailure: () => {
      failures += 1
      successes = 0
      if (state === 'half_open' || failures >= failureThreshold) {
        state = 'open'
        openedAt = Date.now()
      }
    },
    exec: async <T>(fn: () => Promise<T>) => {
      if (!breaker.allow()) throw new CircuitOpenError(options.name)
      try {
        const result = await fn()
        breaker.recordSuccess()
        return result
      } catch (err) {
        breaker.recordFailure()
        throw err
      }
    },
  }

  registry.set(options.name, breaker)
  return breaker
}

/** Named breakers used by the SPA */
export const aiStatusCircuit = () =>
  getCircuitBreaker({ name: 'ai.status', failureThreshold: 3, resetMs: 60_000 })

export const apiReadCircuit = () =>
  getCircuitBreaker({ name: 'api.read', failureThreshold: 8, resetMs: 20_000 })
