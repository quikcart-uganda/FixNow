import { Component, useCallback, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

type Props = {
  children: ReactNode
  /** Optional title for scoped boundaries (shell/route). */
  title?: string
  /** When set, shows Try again without full page reload. */
  onReset?: () => void
  /** Compact layout for nested shells */
  compact?: boolean
}

type State = { hasError: boolean; errorMessage?: string; errorName?: string }

function currentRoute(): string {
  try {
    return `${window.location.pathname}${window.location.search}`
  } catch {
    return '(unknown)'
  }
}

const recoveryBtnBase =
  'tap-target touch-manip inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-[transform,opacity,background-color,box-shadow] duration-100 ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.97] active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70 disabled:active:scale-100'

function BusySpinner({ light }: { light?: boolean }) {
  return (
    <span
      className={
        light
          ? 'inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white'
          : 'inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-on-surface/25 border-t-on-surface'
      }
      aria-hidden="true"
    />
  )
}

/** Recovery actions with press feedback, loading, and double-tap guard. */
function ErrorRecoveryActions({ onTryAgain }: { onTryAgain: () => void }) {
  const [busy, setBusy] = useState<'retry' | 'refresh' | null>(null)
  const unlockTimer = useRef<number | null>(null)

  const clearUnlockTimer = () => {
    if (unlockTimer.current != null) {
      window.clearTimeout(unlockTimer.current)
      unlockTimer.current = null
    }
  }

  const scheduleUnlock = useCallback((ms: number) => {
    clearUnlockTimer()
    unlockTimer.current = window.setTimeout(() => {
      setBusy(null)
      unlockTimer.current = null
    }, ms)
  }, [])

  const handleTryAgain = () => {
    if (busy) return
    setBusy('retry')
    // Let the pressed/busy paint land before reset work.
    requestAnimationFrame(() => {
      try {
        onTryAgain()
      } catch {
        setBusy(null)
        return
      }
      // If the boundary stays mounted (reset failed to clear error), re-enable.
      scheduleUnlock(900)
    })
  }

  const handleRefresh = () => {
    if (busy) return
    setBusy('refresh')
    requestAnimationFrame(() => {
      try {
        window.location.reload()
      } catch {
        setBusy(null)
        return
      }
      // Reload usually navigates away; unlock if the browser blocks it.
      scheduleUnlock(5000)
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        className={`${recoveryBtnBase} bg-primary text-white shadow-sm hover:bg-primary-container`}
        onClick={handleTryAgain}
        disabled={busy !== null}
        aria-busy={busy === 'retry' ? 'true' : undefined}
      >
        {busy === 'retry' ? (
          <>
            <BusySpinner light />
            <span>Trying…</span>
          </>
        ) : (
          'Try again'
        )}
      </button>
      <button
        type="button"
        className={`${recoveryBtnBase} border border-border-subtle bg-canvas-white text-on-surface hover:bg-surface-container-low`}
        onClick={handleRefresh}
        disabled={busy !== null}
        aria-busy={busy === 'refresh' ? 'true' : undefined}
      >
        {busy === 'refresh' ? (
          <>
            <BusySpinner />
            <span>Refreshing…</span>
          </>
        ) : (
          'Refresh'
        )}
      </button>
    </div>
  )
}

/** Top-level / section boundary — never dumps stacks to end users in production. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ? String(error.message).slice(0, 280) : undefined,
      errorName: error?.name ? String(error.name).slice(0, 80) : undefined,
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const route = currentRoute()
    const componentStack = info.componentStack?.slice(0, 2000) || ''
    const stack = error?.stack?.slice(0, 2000) || ''

    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.error('[FixNow] Uncaught UI error', {
        message: error?.message,
        name: error?.name,
        route,
        stack,
        componentStack,
        error,
      })
    }

    void import('@fixnow/api')
      .then((api) => {
        api.recordUiError?.(error.message || 'Uncaught UI error', {
          name: error.name,
          route,
          stack: stack.slice(0, 800),
          componentStack: componentStack.slice(0, 800),
        })
      })
      .catch(() => undefined)

    void import('./monitoring')
      .then((mon) => {
        mon.captureFrontendException?.(error, {
          route,
          componentStack: componentStack.slice(0, 800),
        })
      })
      .catch(() => undefined)
  }

  private reset = () => {
    this.setState({ hasError: false, errorMessage: undefined, errorName: undefined })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      const title = this.props.title ?? 'Something went wrong'
      const compact = this.props.compact
      return (
        <main
          className={
            compact
              ? 'flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center'
              : 'flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas-white p-6 text-center'
          }
          role="alert"
        >
          <h1 className={compact ? 'text-title text-on-surface' : 'text-headline text-on-surface'}>{title}</h1>
          <p className="max-w-md text-body text-on-surface-variant">
            FixNow hit an unexpected error. You can try again, or refresh the page. If it keeps happening, contact
            support.
          </p>
          <ErrorRecoveryActions onTryAgain={this.reset} />
        </main>
      )
    }
    return this.props.children
  }
}

/** Nested boundary for portal shells — isolates page crashes from chrome. */
export function SectionErrorBoundary({
  children,
  title = "We couldn't display this screen",
}: {
  children: ReactNode
  title?: string
}) {
  const location = useLocation()
  return (
    <AppErrorBoundary key={`${location.pathname}${location.search}`} title={title} compact>
      {children}
    </AppErrorBoundary>
  )
}
