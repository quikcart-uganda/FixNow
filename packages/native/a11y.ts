/**
 * Accessibility helpers for the native shell.
 */

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Move focus to the main landmark after client-side navigations. */
export function useRouteFocus(mainId = 'fixnow-main') {
  const location = useLocation()
  useEffect(() => {
    const main = document.getElementById(mainId)
    if (!main) return
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
    main.focus({ preventScroll: true })
  }, [location.pathname, location.search, mainId])
}

/** Announce a short status to screen readers via a live region. */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return
  const regionId = politeness === 'assertive' ? 'fixnow-live-region-assertive' : 'fixnow-live-region'
  let region = document.getElementById(regionId)
  if (!region) {
    region = document.createElement('div')
    region.id = regionId
    region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status')
    region.setAttribute('aria-live', politeness)
    region.setAttribute('aria-atomic', 'true')
    region.className = 'sr-only'
    document.body.appendChild(region)
  }
  region.textContent = ''
  window.setTimeout(() => {
    if (region) region.textContent = message
  }, 30)
}
