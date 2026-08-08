import { useCallback, useEffect, useRef, useState } from 'react'
import { checkBackendHealth, type BackendHealthResult, type BackendHealthState } from './healthCheck'

export type SplashThemeMode = 'brand' | 'light' | 'dark'
export type SplashRole = 'platform' | 'customer' | 'technician' | 'admin'

export type SplashControllerOptions = {
  /** Minimum brand dwell before dismiss. Default adapts to viewport. */
  minDurationMs?: number
  /** Soft timeout that triggers finish. */
  maxDurationMs?: number
  /** Absolute fail-safe clear. */
  hardFailSafeMs?: number
  /** Run GET /health during splash. Default true. */
  checkHealth?: boolean
  /** Extra readiness gate (e.g. auth finished loading). */
  ready?: boolean
  /** Auto-start controller on mount. Default true. */
  autoStart?: boolean
  /** Called once when splash should begin leaving. */
  onFinish?: (reason: string) => void
}

export type SplashController = {
  phase: 'booting' | 'ready' | 'leaving' | 'done'
  finished: boolean
  leaving: boolean
  health: BackendHealthResult | null
  healthState: BackendHealthState
  label: string
  finish: (reason?: string) => void
  forceFinish: (reason?: string) => void
  retryHealth: () => Promise<void>
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
}

// Minimum brand dwell (1.5–2.5s window). Prevents a harsh flash when startup is
// instant; it never delays a slow device beyond the max/hard timeouts below.
function defaultMinMs() {
  return isMobileViewport() ? 1700 : 1500
}

function defaultMaxMs() {
  return isMobileViewport() ? 4200 : 2800
}

function defaultHardMs() {
  return isMobileViewport() ? 6000 : 4000
}

export function resolveSplashTheme(explicit?: SplashThemeMode): SplashThemeMode {
  if (explicit) return explicit
  if (typeof document === 'undefined') return 'brand'
  const root = document.documentElement
  if (root.classList.contains('dark') || root.dataset.theme === 'dark') return 'dark'
  if (root.classList.contains('light') || root.dataset.theme === 'light') return 'brand'
  if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark'
  return 'brand'
}

export function useSplashController(options: SplashControllerOptions = {}): SplashController {
  const {
    minDurationMs,
    maxDurationMs,
    hardFailSafeMs,
    checkHealth = true,
    ready = true,
    autoStart = true,
    onFinish,
  } = options

  const startedAt = useRef(performance.now())
  const finishedRef = useRef(false)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const [phase, setPhase] = useState<SplashController['phase']>('booting')
  const [health, setHealth] = useState<BackendHealthResult | null>(null)
  const finishTimer = useRef(0)
  const hardTimer = useRef(0)
  const maxTimer = useRef(0)

  const clearTimers = useCallback(() => {
    window.clearTimeout(finishTimer.current)
    window.clearTimeout(hardTimer.current)
    window.clearTimeout(maxTimer.current)
  }, [])

  const forceFinish = useCallback(
    (reason = 'force') => {
      if (finishedRef.current) {
        setPhase('done')
        return
      }
      finishedRef.current = true
      clearTimers()
      setPhase('done')
      document.documentElement.classList.remove('fixnow-splash-boot')
      document.body?.classList.remove('fixnow-splash-boot')
      document.documentElement.style.background = ''
      if (document.body) document.body.style.background = ''
      const boot = document.getElementById('fixnow-boot-splash')
      if (boot) {
        boot.classList.add('is-leaving')
        window.setTimeout(() => boot.remove(), 420)
      }
      onFinishRef.current?.(reason)
    },
    [clearTimers],
  )

  const finish = useCallback(
    (reason = 'ready') => {
      if (finishedRef.current) return
      const minMs = minDurationMs ?? defaultMinMs()
      const remaining = Math.max(0, minMs - (performance.now() - startedAt.current))
      const mobile = isMobileViewport()

      window.clearTimeout(finishTimer.current)
      finishTimer.current = window.setTimeout(() => {
        if (finishedRef.current) return
        // Always crossfade out (shorter on mobile) — never an abrupt cut.
        setPhase('leaving')
        finishTimer.current = window.setTimeout(() => forceFinish(reason), mobile ? 320 : 460)
      }, remaining)
    },
    [forceFinish, minDurationMs],
  )

  const runHealth = useCallback(async () => {
    if (!checkHealth) return
    setHealth({
      state: 'checking',
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      message: 'Checking FixNow services…',
      checkedAt: Date.now(),
    })
    const result = await checkBackendHealth()
    setHealth(result)
  }, [checkHealth])

  useEffect(() => {
    if (!autoStart) return

    document.documentElement.classList.add('fixnow-splash-boot')
    document.body?.classList.add('fixnow-splash-boot')
    // Soft handoff: fade the HTML prime once React owns the surface, so there
    // is never a blank frame between the two branded layers.
    const boot = document.getElementById('fixnow-boot-splash')
    if (boot) {
      boot.classList.add('is-leaving')
      window.setTimeout(() => boot.remove(), 420)
    }

    void runHealth()

    const maxMs = maxDurationMs ?? defaultMaxMs()
    const hardMs = hardFailSafeMs ?? defaultHardMs()

    maxTimer.current = window.setTimeout(() => finish('timeout'), maxMs)
    hardTimer.current = window.setTimeout(() => forceFinish('fail-safe'), hardMs)

    return () => clearTimers()
  }, [autoStart, clearTimers, finish, forceFinish, hardFailSafeMs, maxDurationMs, runHealth])

  useEffect(() => {
    if (!autoStart || !ready || finishedRef.current) return
    setPhase((current) => (current === 'booting' ? 'ready' : current))
    finish('ready')
  }, [autoStart, finish, ready])

  // Offline → online during splash: re-check backend without blocking dismiss.
  useEffect(() => {
    if (!autoStart || !checkHealth || finishedRef.current) return
    const onOnline = () => {
      void runHealth()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [autoStart, checkHealth, runHealth])

  const healthState: BackendHealthState = health?.state ?? (checkHealth ? 'checking' : 'ok')

  const label =
    healthState === 'checking'
      ? 'Connecting to FixNow…'
      : healthState === 'offline'
        ? 'Offline mode'
        : healthState === 'ok'
          ? 'Starting FixNow'
          : healthState === 'degraded'
            ? 'Running a little slow'
            : // Device online but /health failed — soft continue (no Offline flash).
              'Starting FixNow'

  return {
    phase,
    finished: phase === 'done',
    leaving: phase === 'leaving',
    health,
    healthState,
    label,
    finish,
    forceFinish,
    retryHealth: runHealth,
  }
}
