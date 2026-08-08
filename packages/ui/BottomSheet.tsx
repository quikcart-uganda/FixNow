/**
 * BottomSheet — accessible, native-feel action sheet.
 * Focus trap, Escape, restore focus, safe-area, reduced-motion.
 * Portaled to document.body so sticky/backdrop-blur headers cannot trap fixed positioning.
 *
 * Drag-to-dismiss is handle-led so nested scroll does not fight the sheet.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from './focusTrap'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  hideHandle?: boolean
}

export function BottomSheet({ open, onClose, title, description, children, hideHandle }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)
  const dragging = useRef(false)
  const titleId = useId()
  const descId = useId()

  useFocusTrap(open, panelRef)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const resetTransform = useCallback(() => {
    if (panelRef.current) panelRef.current.style.transform = ''
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    },
    [onClose],
  )

  const beginDrag = (clientY: number) => {
    dragStart.current = clientY
    dragging.current = true
  }

  const moveDrag = (clientY: number) => {
    if (dragStart.current == null || !dragging.current) return
    const dy = clientY - dragStart.current
    if (dy > 0 && panelRef.current) {
      panelRef.current.style.transform = `translateY(${dy}px)`
      panelRef.current.style.transition = 'none'
    }
  }

  const endDrag = (clientY: number) => {
    if (dragStart.current == null) return
    const dy = clientY - dragStart.current
    dragStart.current = null
    dragging.current = false
    if (panelRef.current) {
      panelRef.current.style.transition = ''
      panelRef.current.style.transform = ''
    }
    if (dy > 96) onClose()
  }

  const onHandleTouchStart = (e: TouchEvent) => {
    beginDrag(e.touches[0]?.clientY ?? 0)
  }
  const onHandleTouchMove = (e: TouchEvent) => {
    moveDrag(e.touches[0]?.clientY ?? 0)
  }
  const onHandleTouchEnd = (e: TouchEvent) => {
    endDrag(e.changedTouches[0]?.clientY ?? 0)
  }

  /** Allow drag from body only when scrolled to top and pulling down. */
  const onBodyTouchStart = (e: TouchEvent) => {
    const el = bodyRef.current
    if (el && el.scrollTop > 0) {
      dragStart.current = null
      dragging.current = false
      return
    }
    beginDrag(e.touches[0]?.clientY ?? 0)
  }
  const onBodyTouchMove = (e: TouchEvent) => {
    if (dragStart.current == null) return
    const el = bodyRef.current
    if (el && el.scrollTop > 0) {
      resetTransform()
      dragStart.current = null
      dragging.current = false
      return
    }
    const dy = (e.touches[0]?.clientY ?? 0) - dragStart.current
    if (dy > 8) moveDrag(e.touches[0]?.clientY ?? 0)
  }
  const onBodyTouchEnd = (e: TouchEvent) => {
    if (!dragging.current) {
      dragStart.current = null
      return
    }
    endDrag(e.changedTouches[0]?.clientY ?? 0)
  }

  if (!open || typeof document === 'undefined') return null

  const node = (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      role="presentation"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Close"
        className="fixnow-sheet-backdrop absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        aria-label={title ? undefined : 'Options'}
        tabIndex={-1}
        className="fixnow-sheet-panel relative z-10 flex w-full max-w-lg max-h-[min(92dvh,720px)] flex-col rounded-t-3xl bg-canvas-white px-4 pt-2 shadow-2xl outline-none"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {hideHandle ? null : (
          <div
            className="mx-auto mb-3 mt-1 flex w-full max-w-[12rem] cursor-grab touch-none flex-col items-center active:cursor-grabbing"
            aria-hidden
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
          >
            <div className="h-1.5 w-10 rounded-full bg-outline-variant" />
            <span className="sr-only">Drag down to close</span>
          </div>
        )}
        {title ? (
          <div className="mb-2 shrink-0 px-1">
            <h2 id={titleId} className="text-title-md text-on-surface">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-body-sm text-on-surface-variant">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
          style={{ maxHeight: 'min(75dvh, 560px)', WebkitOverflowScrolling: 'touch' }}
          onTouchStart={onBodyTouchStart}
          onTouchMove={onBodyTouchMove}
          onTouchEnd={onBodyTouchEnd}
        >
          {children}
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
