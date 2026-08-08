/**
 * Accessible native-feel error dialog. Replaces window.alert on mobile paths
 * without redesigning Stitch screens — screens can keep calling the helper.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { useFocusTrap } from '@fixnow/ui'

export type ErrorDialogOptions = {
  title?: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

type DialogState = ErrorDialogOptions & { open: boolean }

let externalSetter: ((state: DialogState) => void) | null = null

export function showNativeError(options: ErrorDialogOptions | string) {
  const next: DialogState =
    typeof options === 'string'
      ? { open: true, title: 'Something went wrong', message: options, actionLabel: 'OK' }
      : {
          open: true,
          title: options.title ?? 'Something went wrong',
          message: options.message,
          actionLabel: options.actionLabel ?? 'OK',
          onAction: options.onAction,
        }
  if (externalSetter) {
    externalSetter(next)
    return
  }
  // Fallback before the host mounts.
  if (typeof window !== 'undefined') window.alert(next.message)
}

export function NativeErrorHost() {
  const [state, setState] = useState<DialogState>({
    open: false,
    title: '',
    message: '',
    actionLabel: 'OK',
  })
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useFocusTrap(state.open, panelRef)

  useEffect(() => {
    externalSetter = setState
    return () => {
      if (externalSetter === setState) externalSetter = null
    }
  }, [])

  useEffect(() => {
    if (!state.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState((s) => ({ ...s, open: false }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.open])

  if (!state.open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Dismiss error"
        onClick={() => setState((s) => ({ ...s, open: false }))}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-float outline-none"
      >
        <h2 id={titleId} className="text-title text-on-surface">
          {state.title}
        </h2>
        <p id={descId} className="mt-2 text-body-sm text-on-surface-variant">
          {state.message}
        </p>
        <div className="mt-5 flex justify-end">
          <button
            ref={buttonRef}
            type="button"
            data-autofocus
            className="tap-target interactive-control min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] active:opacity-90"
            onClick={() => {
              state.onAction?.()
              setState((s) => ({ ...s, open: false }))
            }}
          >
            {state.actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
