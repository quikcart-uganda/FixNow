/**
 * React hook that owns deep-link + push-tap navigation.
 *
 * Mounted once near the app root (inside BrowserRouter + AuthProvider) so the
 * existing route tree remains the source of truth for destinations.
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveDeepLink, resolvePushTarget, isRoutableAppPath } from './deepLinks'
import { takePendingPushTap } from './nativePush'
import { isNativePlatform } from './platform'

type Role = 'customer' | 'technician' | 'admin' | null

export function useNativeDeepLinks(role: Role) {
  const navigate = useNavigate()
  const roleRef = useRef(role)
  roleRef.current = role

  useEffect(() => {
    if (!isNativePlatform()) return

    const go = (path: string | null) => {
      if (!path || !isRoutableAppPath(path)) return
      navigate(path)
    }

    const onDeepLink = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; path?: string }>).detail
      if (detail?.path) {
        go(detail.path)
        return
      }
      if (detail?.url) go(resolveDeepLink(detail.url))
    }

    const onPushTap = (event: Event) => {
      const detail = (event as CustomEvent<{ data?: Record<string, unknown> }>).detail
      go(resolvePushTarget(detail?.data, roleRef.current))
    }

    window.addEventListener('fixnow:deeplink', onDeepLink as EventListener)
    window.addEventListener('fixnow:push-tap', onPushTap as EventListener)

    // Cold-start tap that arrived before React mounted.
    const pending = takePendingPushTap()
    if (pending) go(resolvePushTarget(pending.data, roleRef.current))

    return () => {
      window.removeEventListener('fixnow:deeplink', onDeepLink as EventListener)
      window.removeEventListener('fixnow:push-tap', onPushTap as EventListener)
    }
  }, [navigate])
}
