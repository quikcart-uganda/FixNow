import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { aiApi } from '@fixnow/api'
import { useFocusTrap } from '@fixnow/ui'
import { useReducedMotion } from './a11y'

const GUEST_STARTERS = [
  { icon: 'search', label: 'Find trusted technicians near me' },
  { icon: 'event_available', label: 'How does FixNow booking work?' },
  { icon: 'shield', label: 'Is payment protected by escrow?' },
]

/**
 * Optional pre-auth welcome assistant.
 * Shows only when AI is enabled; never opens authenticated chat or admin tools.
 * Guests get a short orientation and a path to sign in for the full assistant.
 */
export function AiGuestWelcome({ label = 'Ask FixNow' }: { label?: string } = {}) {
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const reducedMotion = useReducedMotion()

  useFocusTrap(open, panelRef)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await aiApi.status()
        if (!cancelled) setAvailable(Boolean(res.data.enabled))
      } catch {
        if (!cancelled) setAvailable(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!available) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixnow-ai-fab fixed z-[55] flex h-14 w-14 min-h-14 min-w-14 items-center justify-center rounded-full bg-primary text-white shadow-float transition-transform active:scale-95"
        aria-label={`Open ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
      >
        <span className="material-symbols-outlined text-[1.5rem]" aria-hidden="true">
          auto_awesome
        </span>
        <span className="sr-only">{label}</span>
      </button>

      {open ? (
        <div
          className={`fixnow-ai-overlay fixed inset-0 z-[65] flex items-stretch justify-center p-0 sm:items-end sm:justify-end sm:p-4 ${
            reducedMotion ? '' : 'fixnow-ai-overlay-animate'
          }`}
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink-primary/45"
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`fixnow-ai-shell relative w-full max-w-none overflow-hidden bg-canvas-white outline-none sm:max-w-md sm:rounded-2xl sm:border sm:border-border-subtle sm:shadow-2xl ${
              reducedMotion ? '' : 'fixnow-ai-shell-animate'
            }`}
          >
            <div className="flex h-[100dvh] flex-col sm:h-auto sm:max-h-[min(88dvh,720px)]">
              <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="fixnow-ai-avatar mt-0.5 flex h-10 w-10 items-center justify-center rounded-full">
                    <span className="material-symbols-outlined text-white">auto_awesome</span>
                  </div>
                  <div>
                    <h2 id={titleId} className="text-title-md text-on-surface">
                      Welcome to FixNow
                    </h2>
                    <p className="text-label text-on-surface-variant">Sign in for your role-aware assistant</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1 text-on-surface-variant hover:text-on-surface"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  FixNow’s assistant adapts to your role — customers find services, technicians grow their
                  business, and admins run the platform. Sign in to start a private conversation.
                </p>
                <ul className="space-y-2">
                  {GUEST_STARTERS.map((prompt) => (
                    <li
                      key={prompt.label}
                      className="flex items-center gap-3 rounded-xl border border-border-subtle px-3 py-2.5"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                        <span className="material-symbols-outlined text-[1.15rem]">{prompt.icon}</span>
                      </span>
                      <span className="text-xs font-semibold text-on-surface">{prompt.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    to="/customer/login"
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                    onClick={() => setOpen(false)}
                  >
                    Continue as customer
                  </Link>
                  <Link
                    to="/technician/login"
                    className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-on-surface"
                    onClick={() => setOpen(false)}
                  >
                    Technician login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
