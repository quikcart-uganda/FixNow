/**
 * In-memory circuit breaker for outbound providers (email, SMS, push, AI).
 * No Redis required — per-process protection against cascading failures.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

type Options = {
  name: string
  failureThreshold?: number
  successThreshold?: number
  resetMs?: number
}

export class CircuitOpenError extends Error {
  circuit: string
  constructor(name: string) {
    super(`Circuit open: ${name}`);
    this.name = 'CircuitOpenError';
    this.circuit = name;
  }
}

type Breaker = {
  name: string
  state: () => CircuitState
  allow: () => boolean
  recordSuccess: () => void
  recordFailure: () => void
  exec: <T>(fn: () => Promise<T>) => Promise<T>
}

const registry = new Map<string, Breaker>();

export function createCircuitBreaker(options: Options): Breaker {
  const existing = registry.get(options.name);
  if (existing) return existing;

  const failureThreshold = options.failureThreshold ?? 5;
  const successThreshold = options.successThreshold ?? 2;
  const resetMs = options.resetMs ?? 60_000;

  let state: CircuitState = 'closed';
  let failures = 0;
  let successes = 0;
  let openedAt = 0;

  const breaker: Breaker = {
    name: options.name,
    state: () => {
      if (state === 'open' && Date.now() - openedAt >= resetMs) {
        state = 'half_open';
        successes = 0;
      }
      return state;
    },
    allow: () => {
      const s = breaker.state();
      return s === 'closed' || s === 'half_open';
    },
    recordSuccess: () => {
      if (state === 'half_open') {
        successes += 1;
        if (successes >= successThreshold) {
          state = 'closed';
          failures = 0;
          successes = 0;
        }
      } else {
        failures = 0;
        state = 'closed';
      }
    },
    recordFailure: () => {
      failures += 1;
      successes = 0;
      if (state === 'half_open' || failures >= failureThreshold) {
        state = 'open';
        openedAt = Date.now();
      }
    },
    exec: async <T>(fn: () => Promise<T>) => {
      if (!breaker.allow()) throw new CircuitOpenError(options.name);
      try {
        const result = await fn();
        breaker.recordSuccess();
        return result;
      } catch (err) {
        breaker.recordFailure();
        throw err;
      }
    },
  };

  registry.set(options.name, breaker);
  return breaker;
}

export const emailCircuit = createCircuitBreaker({ name: 'email', failureThreshold: 5, resetMs: 60_000 });
export const smsCircuit = createCircuitBreaker({ name: 'sms', failureThreshold: 5, resetMs: 60_000 });
export const pushCircuit = createCircuitBreaker({ name: 'push', failureThreshold: 8, resetMs: 45_000 });
export const aiCircuit = createCircuitBreaker({ name: 'ai', failureThreshold: 4, resetMs: 90_000 });
