/**
 * Shared retry / backoff helpers — no infra required.
 */

export type BackoffOptions = {
  /** Attempt index starting at 0 */
  attempt: number
  baseMs?: number
  maxMs?: number
  /** 0–1 randomness factor (default 0.3) */
  jitter?: number
}

/** Exponential backoff with full jitter: random(0, min(max, base * 2^attempt)). */
export function computeBackoffMs(opts: BackoffOptions): number {
  const base = opts.baseMs ?? 400
  const max = opts.maxMs ?? 8_000
  const jitter = opts.jitter ?? 0.35
  const exp = Math.min(max, base * 2 ** Math.max(0, opts.attempt))
  const spread = exp * jitter
  return Math.round(exp - spread + Math.random() * spread * 2)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export type RetryOptions = {
  maxAttempts?: number
  baseMs?: number
  maxMs?: number
  signal?: AbortSignal
  /** Return true to retry this error */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err
      const retryable = options.shouldRetry?.(err, attempt) ?? true
      if (!retryable || attempt >= maxAttempts - 1) break
      const delay = computeBackoffMs({
        attempt,
        baseMs: options.baseMs,
        maxMs: options.maxMs,
      })
      options.onRetry?.(err, attempt, delay)
      await sleep(delay, options.signal)
    }
  }
  throw lastError
}
