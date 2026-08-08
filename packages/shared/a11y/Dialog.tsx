/**
 * Accessible modal dialog with focus trap, Escape, and labelled title.
 * Always portaled to document.body so position:fixed is never trapped by
 * sticky / backdrop-blur ancestors (e.g. PortalHeader).
 */

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@fixnow/ui'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** alertdialog for destructive / blocking errors */
  role?: 'dialog' | 'alertdialog'
  className?: string
  panelClassName?: string
  /** Applied to the content wrapper — lets drawers own their scroll region. */
  bodyClassName?: string
  /** side drawer from the left or right */
  placement?: 'center' | 'start' | 'end'
  /** Hide built-in title chrome when the child provides its own header. */
  hideChrome?: boolean
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  role = 'dialog',
  className = '',
  panelClassName = '',
  bodyClassName = '',
  placement = 'center',
  hideChrome = false,
}: Props) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusTrap(open, panelRef)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const isDrawer = placement === 'end' || placement === 'start'

  const node = (
    <div
      className={
        isDrawer
          ? `fixed inset-0 z-[80] flex items-end sm:items-stretch ${
              placement === 'start' ? 'sm:justify-start' : 'sm:justify-end'
            } ${className}`
          : `fixed inset-0 z-[80] flex items-center justify-center p-4 ${className}`
      }
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink-primary/40 transition-opacity duration-200"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description && !hideChrome ? descId : undefined}
        tabIndex={-1}
        className={
          isDrawer
            ? `relative z-10 flex h-[min(96dvh,100%)] w-full max-w-full min-h-0 flex-col overflow-hidden rounded-t-2xl bg-canvas shadow-2xl outline-none sm:h-full sm:max-w-md sm:rounded-none md:max-w-lg ${panelClassName}`
            : `relative z-10 flex w-full max-w-md max-h-[min(92dvh,920px)] min-h-0 flex-col overflow-hidden rounded-2xl bg-canvas shadow-float outline-none ${panelClassName}`
        }
      >
        {hideChrome ? (
          <span id={titleId} className="sr-only">
            {title}
          </span>
        ) : (
          <div
            className={
              isDrawer
                ? 'shrink-0 border-b border-border/60 px-6 pb-3 pt-[max(1.5rem,env(safe-area-inset-top))]'
                : 'shrink-0 border-b border-border/60 px-6 pb-3 pt-6'
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold text-ink-primary text-on-surface">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-1 text-sm text-ink-muted text-on-surface-variant">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-alt hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[22px]" aria-hidden>
                  close
                </span>
              </button>
            </div>
          </div>
        )}
        <div
          className={`${
            isDrawer
              ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]'
              : 'mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-6 pt-4'
          } ${bodyClassName}`}
        >
          {children}
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
