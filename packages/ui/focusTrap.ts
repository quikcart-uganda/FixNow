/**
 * Focus trap for dialogs / sheets — Tab cycles within container.
 */

import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.tabIndex !== -1,
  )
}

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options?: { restoreFocus?: boolean; initialFocusSelector?: string },
) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const restore = options?.restoreFocus !== false

    const focusInitial = () => {
      const preferred = options?.initialFocusSelector
        ? container.querySelector<HTMLElement>(options.initialFocusSelector)
        : null
      const autofocus = container.querySelector<HTMLElement>('[data-autofocus]')
      const first = preferred || autofocus || getFocusableElements(container)[0]
      first?.focus({ preventScroll: true })
    }

    const id = window.setTimeout(focusInitial, 20)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = getFocusableElements(container)
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeEl === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', onKeyDown)
      if (restore && previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [active, containerRef, options?.restoreFocus, options?.initialFocusSelector])
}
