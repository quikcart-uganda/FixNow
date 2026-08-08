/**
 * Optional frontend Sentry init — mirrors backend monitoring.ts.
 * Loads `@sentry/react` only when VITE_SENTRY_DSN is set and the package is installed.
 */

let initialized = false
type SentryLike = {
  init: (opts: Record<string, unknown>) => void
  captureException?: (error: unknown, context?: Record<string, unknown>) => void
}
let sentry: SentryLike | null = null

export async function initFrontendMonitoring(): Promise<void> {
  if (initialized) return
  initialized = true

  const dsn =
    typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SENTRY_DSN as string | undefined) : undefined
  if (!dsn) return

  const moduleId = '@sentry/react'
  try {
    const mod = (await import(/* @vite-ignore */ moduleId)) as SentryLike
    mod.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
    })
    sentry = mod
  } catch {
    if (import.meta.env.DEV) {
      console.warn('[sentry] VITE_SENTRY_DSN is set but @sentry/react is not installed — monitoring disabled')
    }
  }
}

/** Production diagnostics for unexpected UI failures (never shown to customers). */
export function captureFrontendException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    sentry?.captureException?.(error, context ? { extra: context } : undefined)
  } catch {
    /* monitoring must never throw */
  }
}
