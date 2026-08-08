import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { aiApi, type AiAssistantRole, type AiChatContext } from '@fixnow/api'
import { useAuth } from '@fixnow/hooks'
import { useFocusTrap } from '@fixnow/ui'
import { useReducedMotion } from './a11y'
import { AiAssistantPanel } from './AiAssistantPanel'
import { AppErrorBoundary } from './AppErrorBoundary'
import { roleCopy } from './ai/roleCopy'

function inferContextFromRoute(
  pathname: string,
  params: Record<string, string | undefined>,
  extra?: AiChatContext,
): AiChatContext {
  const ctx: AiChatContext = {
    screen: pathname,
    ...extra,
  }

  const id = params.id || params.jobId || params.technicianId
  if (id) {
    if (/technician|profile/i.test(pathname) && !/job/i.test(pathname)) {
      ctx.technicianId = ctx.technicianId || id
    } else if (/job|track|pay|application|assigned|active/i.test(pathname)) {
      ctx.jobId = ctx.jobId || id
    } else if (/categor/i.test(pathname)) {
      ctx.categoryId = ctx.categoryId || id
    } else {
      ctx.jobId = ctx.jobId || id
    }
  }

  return ctx
}

/**
 * Floating, role-aware AI launcher (circular FAB).
 * Self-hides when unauthenticated or when `/ai/status` reports the subsystem / role off.
 * Safe-area aware for Capacitor; sits above bottom nav on mobile.
 * Content clearance is handled by `.fixnow-ai-fab-pad` on shell main areas.
 */
export function AiAssistantLauncher({
  role,
  context,
  label,
  allowGuest = false,
}: {
  role: AiAssistantRole
  context?: AiChatContext
  label?: string
  /** When true, guests (no JWT) may open customer AI discovery chat. */
  allowGuest?: boolean
  /** @deprecated AI is always a FAB — bottom-nav embedding was removed to reduce clutter. */
  embedded?: boolean
}) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const params = useParams()
  const copy = roleCopy(role)
  const resolvedLabel = label ?? copy.shortLabel
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  )
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const reducedMotion = useReducedMotion()
  const guestOk = allowGuest && role === 'customer'

  const mergedContext = useMemo(
    () => inferContextFromRoute(location.pathname, params as Record<string, string | undefined>, context),
    [location.pathname, params, context],
  )

  useFocusTrap(open && !minimized, panelRef)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const apply = () => setIsCompact(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    if (!isAuthenticated && !guestOk) {
      setAvailable(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await aiApi.status()
        if (!cancelled) setAvailable(res.data.enabled && res.data.roles[role])
      } catch {
        if (!cancelled) setAvailable(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, role, guestOk])

  useEffect(() => {
    if (!open || minimized) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, minimized])

  useEffect(() => {
    if (!open) setMinimized(false)
  }, [open])

  if ((!isAuthenticated && !guestOk) || !available) return null

  return (
    <>
      {!open || minimized ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setMinimized(false)
          }}
          className={
            minimized
              ? 'fixnow-ai-fab fixed z-[55] flex h-12 min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white shadow-float transition-transform active:scale-95'
              : 'fixnow-ai-fab fixed z-[55] flex h-14 w-14 min-h-14 min-w-14 items-center justify-center rounded-full bg-primary text-white shadow-float transition-transform active:scale-95'
          }
          aria-label={minimized ? `Continue ${resolvedLabel}` : `Open ${resolvedLabel}`}
          aria-haspopup="dialog"
          aria-expanded={open && !minimized}
          title={resolvedLabel}
        >
          <span className="material-symbols-outlined text-[1.5rem]" aria-hidden="true">
            auto_awesome
          </span>
          {minimized ? <span>Continue</span> : <span className="sr-only">{resolvedLabel}</span>}
        </button>
      ) : null}

      {open && !minimized ? (
        <div
          className={`fixnow-ai-overlay fixed inset-0 z-[65] flex items-stretch justify-center p-0 sm:items-end sm:justify-end sm:p-4 md:p-6 ${
            reducedMotion ? '' : 'fixnow-ai-overlay-animate'
          }`}
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink-primary/45"
            onClick={() => {
              if (isCompact) {
                setOpen(false)
                return
              }
              setMinimized(true)
            }}
            aria-label={isCompact ? 'Close assistant' : 'Minimise assistant'}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`fixnow-ai-shell relative flex w-full max-w-none outline-none sm:max-w-xl md:max-w-3xl lg:max-w-5xl ${
              reducedMotion ? '' : 'fixnow-ai-shell-animate'
            }`}
          >
            <h2 id={titleId} className="sr-only">
              {resolvedLabel}
            </h2>
            <AppErrorBoundary title="We couldn't open the assistant" compact onReset={() => setOpen(false)}>
              <AiAssistantPanel
                role={role}
                context={mergedContext}
                guestMode={!isAuthenticated && guestOk}
                onClose={() => setOpen(false)}
                onMinimize={isCompact ? undefined : () => setMinimized(true)}
                className="h-[100dvh] rounded-none border-0 sm:h-[min(88dvh,820px)] sm:rounded-2xl sm:border sm:border-border-subtle sm:shadow-2xl"
              />
            </AppErrorBoundary>
          </div>
        </div>
      ) : null}
    </>
  )
}
