/**
 * Native shell host — mounts once under the providers in `src/main.tsx`.
 */

import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@fixnow/hooks'
import { exitNativeApp, hideNativeSplash } from './nativeApp'
import { isNativePlatform } from './platform'
import { useNativeDeepLinks } from './useNativeDeepLinks'
import { useRouteFocus } from './a11y'

export function NativeShellHost() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const stackRef = useRef<string[]>([])

  useNativeDeepLinks(user?.role ?? null)
  useRouteFocus('fixnow-main')

  useEffect(() => {
    const key = `${location.pathname}${location.search}${location.hash}`
    const stack = stackRef.current
    if (stack[stack.length - 1] !== key) stack.push(key)
    if (stack.length > 64) stack.splice(0, stack.length - 64)
  }, [location])

  useEffect(() => {
    if (!isNativePlatform()) return

    const onBack = () => {
      const stack = stackRef.current
      if (stack.length > 1) {
        stack.pop()
        navigate(-1)
        return
      }
      void exitNativeApp()
    }

    window.addEventListener('fixnow:back', onBack as EventListener)
    return () => {
      window.removeEventListener('fixnow:back', onBack as EventListener)
    }
  }, [navigate])

  // Crossfade the native splash into the branded HTML/React splash as soon as
  // the WebView has painted. Waiting for auth caused a flash of the WebView
  // chrome (plain blue / empty root) before the branded overlay settled.
  useEffect(() => {
    if (!isNativePlatform()) return
    let cancelled = false
    let frame2 = 0
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        if (cancelled) return
        void hideNativeSplash()
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame1)
      window.cancelAnimationFrame(frame2)
    }
  }, [])

  return null
}
