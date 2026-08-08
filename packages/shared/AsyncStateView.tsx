import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { AsyncStatus } from '@fixnow/hooks'
import { Icon, Skeleton } from '@fixnow/ui'

const actionBtnClass =
  'tap-target touch-manip inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-[transform,opacity] duration-100 ease-out [-webkit-tap-highlight-color:transparent] hover:bg-primary-container active:scale-[0.97] active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70 disabled:active:scale-100'

const linkActionClass =
  'tap-target touch-manip mt-2 inline-flex min-h-11 select-none items-center justify-center gap-2 text-sm font-semibold text-primary underline transition-[transform,opacity] duration-100 ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.97] active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70 disabled:no-underline disabled:active:scale-100'

function InlineSpinner({ light }: { light?: boolean }) {
  return (
    <span
      className={
        light
          ? 'inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white'
          : 'inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary'
      }
      aria-hidden="true"
    />
  )
}

function BusyActionButton({
  label,
  busyLabel,
  onClick,
  variant = 'solid',
}: {
  label: string
  busyLabel: string
  onClick: () => void
  variant?: 'solid' | 'link'
}) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      className={variant === 'link' ? linkActionClass : `${actionBtnClass} mt-2`}
      disabled={busy}
      aria-busy={busy ? 'true' : undefined}
      onClick={() => {
        if (busy) return
        setBusy(true)
        requestAnimationFrame(() => {
          try {
            onClick()
          } catch {
            setBusy(false)
            return
          }
          window.setTimeout(() => setBusy(false), 600)
        })
      }}
    >
      {busy ? (
        <>
          <InlineSpinner light={variant === 'solid'} />
          <span>{busyLabel}</span>
        </>
      ) : (
        label
      )}
    </button>
  )
}

type Props = {
  status: AsyncStatus
  error?: string | null
  /** Status-aware title (e.g. "Too many requests", "Session expired"). */
  errorTitle?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyHint?: string
  emptyIcon?: string
  emptyActionLabel?: string
  emptyActionHref?: string
  onEmptyAction?: () => void
  loadingLabel?: string
  children?: ReactNode
  className?: string
  /** When true, show a subtle offline/cache hint above successful content. */
  fromCache?: boolean
}

function deriveErrorTitle(error?: string | null, explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim()
  const text = String(error || '')
  if (/too many requests/i.test(text)) return 'Too many requests'
  if (/session (has )?expired|sign in again/i.test(text)) return 'Session expired'
  if (/don'?t have permission|do not have permission/i.test(text)) return "You don't have permission"
  if (/could not find|not found/i.test(text)) return 'Not found'
  if (/timed out|took too long/i.test(text)) return 'Request timed out'
  if (/please sign in to continue|sign in required/i.test(text)) return 'Sign in required'
  if (/could not reach the fixnow server|couldn't reach fixnow|api is running/i.test(text)) {
    return 'Service unavailable'
  }
  if (/origin is not allowed|lan url in cors/i.test(text)) return 'Service unavailable'
  if (/^no internet connection\.?$/i.test(text.trim()) || /connection problem|you(?:'re| are) offline/i.test(text)) {
    return 'No internet connection'
  }
  if (/database temporarily unavailable/i.test(text)) return 'Service unavailable'
  if (/went wrong on our servers|server encountered|went wrong on our side|server error/i.test(text)) {
    return 'Server error'
  }
  if (/temporarily unavailable|service unavailable/i.test(text)) return 'Service unavailable'
  return "Couldn't load this"
}

export function AsyncStateView({
  status,
  error,
  errorTitle,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyHint = 'Check back soon or try a different filter.',
  emptyIcon = 'inbox',
  emptyActionLabel,
  emptyActionHref,
  onEmptyAction,
  loadingLabel = 'Loading…',
  children,
  className = '',
  fromCache = false,
}: Props) {
  if (status === 'loading') {
    return (
      <div
        className={`flex min-h-[240px] flex-col justify-center gap-4 p-6 ${className}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={loadingLabel}
      >
        <div className="flex items-center gap-3">
          <Skeleton circle className="h-12 w-12 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <p className="sr-only">{loadingLabel}</p>
      </div>
    )
  }

  if (status === 'idle') {
    return null
  }

  if (status === 'error') {
    const title = deriveErrorTitle(error, errorTitle)
    const isRateLimited = /too many requests/i.test(`${title} ${error || ''}`)
    const isOffline = /no internet connection/i.test(`${title} ${error || ''}`)
    const isUnreachable =
      /service unavailable|couldn't reach|could not reach|api is running/i.test(`${title} ${error || ''}`) &&
      !isOffline
    return (
      <div
        className={`flex min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-center ${className}`}
        role="alert"
      >
        <Icon name="error" className="text-3xl text-error" />
        <p className="text-base font-semibold">{title}</p>
        <p className="max-w-prose text-pretty text-sm opacity-70">{error ?? 'Please try again.'}</p>
        <p className="max-w-prose text-pretty text-xs opacity-60">
          {isRateLimited
            ? 'Wait a short moment before retrying. Opening many admin pages quickly can exhaust the request budget.'
            : isOffline
              ? 'If you’re offline, reconnect and tap Try again. Cached screens may still work elsewhere.'
              : isUnreachable
                ? 'Other sections on this page may still work. Confirm the API host is reachable from this device, then retry.'
                : 'This section failed independently — other parts of the page may still work. Tap Try again to reload it.'}
        </p>
        {onRetry ? (
          <BusyActionButton label="Try again" busyLabel="Trying…" onClick={onRetry} />
        ) : null}
      </div>
    )
  }

  if (status === 'empty') {
    const action = emptyActionLabel ? (
      emptyActionHref ? (
        <Link
          to={emptyActionHref}
          className={`${actionBtnClass} mt-2`}
        >
          {emptyActionLabel}
        </Link>
      ) : onEmptyAction || onRetry ? (
        <BusyActionButton
          label={emptyActionLabel}
          busyLabel="Working…"
          onClick={onEmptyAction || onRetry!}
        />
      ) : null
    ) : onRetry ? (
      <BusyActionButton label="Refresh" busyLabel="Refreshing…" onClick={onRetry} variant="link" />
    ) : null

    return (
      <div className={`flex min-h-[240px] flex-col items-center justify-center gap-2 p-8 text-center ${className}`}>
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-primary">
          <Icon name={emptyIcon} className="text-2xl" />
        </div>
        <p className="text-base font-semibold">{emptyTitle}</p>
        <p className="max-w-prose text-pretty text-sm opacity-70">{emptyHint}</p>
        {action}
      </div>
    )
  }

  return (
    <>
      {fromCache ? (
        <p className="px-1 pb-2 text-[11px] font-medium text-on-surface-variant" role="status">
          Showing saved data · will refresh when online
        </p>
      ) : null}
      {error ? (
        <p className="px-1 pb-2 text-[11px] font-medium text-warning" role="status">
          {error} · showing last known data
        </p>
      ) : null}
      {children}
    </>
  )
}
