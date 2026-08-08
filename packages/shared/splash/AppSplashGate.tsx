import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@fixnow/hooks'
import { useLocation } from 'react-router-dom'
import { FixNowSplash } from './FixNowSplash'
import { prefetchEssentialContent } from './prefetchEssentialContent'
import { shouldShowSplashOfflineActions } from './splashOfflineUi'
import { isNetworkUsable, useNetworkStatus } from './useNetworkStatus'
import { useSplashController, type SplashRole } from './useSplashController'

export const COLD_SPLASH_SESSION_KEY = 'fixnow_cold_splash_done_v1'

function roleFromPath(pathname: string): SplashRole {
  if (pathname.startsWith('/customer')) return 'customer'
  if (pathname.startsWith('/technician')) return 'technician'
  if (pathname.startsWith('/admin')) return 'admin'
  return 'platform'
}

function alreadyDismissedThisSession() {
  try {
    return sessionStorage.getItem(COLD_SPLASH_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/** Mark cold-start splash done for this tab (role pages should call too). */
export function markColdSplashDone() {
  try {
    sessionStorage.setItem(COLD_SPLASH_SESSION_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}

export type AppSplashGateProps = {
  children: ReactNode
}

/**
 * Cold-start brand overlay. Does not alter routes, auth, or business logic.
 * Shows once per browser tab session, then yields to the normal app tree.
 */
export function AppSplashGate({ children }: AppSplashGateProps) {
  const location = useLocation()
  const { status: authStatus } = useAuth()
  const network = useNetworkStatus()
  const [skip] = useState(() => alreadyDismissedThisSession())
  const [visible, setVisible] = useState(() => !alreadyDismissedThisSession())

  const role = useMemo(() => roleFromPath(location.pathname), [location.pathname])
  const authReady = authStatus !== 'loading'
  const [contentReady, setContentReady] = useState(false)

  // Role splash pages own their surface — avoid stacking two full-screen brand moments.
  const onRoleSplashRoute =
    location.pathname === '/customer' ||
    location.pathname === '/customer/' ||
    location.pathname === '/technician' ||
    location.pathname === '/technician/'

  const shouldRunColdSplash = !skip && !onRoleSplashRoute

  // Prefetch essential Home content behind the branded splash so the app opens
  // with data, not empty skeletons. Time-boxed and best-effort — it can never
  // hold the splash open longer than its own budget.
  useEffect(() => {
    if (!shouldRunColdSplash) {
      setContentReady(true)
      return
    }
    let cancelled = false
    void prefetchEssentialContent({ role, budgetMs: 1800 }).finally(() => {
      if (!cancelled) setContentReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [shouldRunColdSplash, role])

  // Only critical startup resources gate the splash: auth restoration and the
  // essential content prefetch. Health + timers are handled by the controller.
  const startupReady = authReady && contentReady

  const splash = useSplashController({
    autoStart: shouldRunColdSplash,
    ready: startupReady,
    checkHealth: true,
    onFinish: () => {
      markColdSplashDone()
      setVisible(false)
    },
  })

  useEffect(() => {
    if (skip) {
      document.documentElement.classList.remove('fixnow-splash-boot')
      document.body?.classList.remove('fixnow-splash-boot')
      const boot = document.getElementById('fixnow-boot-splash')
      if (boot) {
        boot.classList.add('is-leaving')
        window.setTimeout(() => boot.remove(), 420)
      }
      return
    }
    if (onRoleSplashRoute) {
      // Hand off to role SplashPage: soft-fade the HTML prime and reveal #root.
      // Leaving `fixnow-splash-boot` on would keep #root visibility:hidden forever.
      document.documentElement.classList.remove('fixnow-splash-boot')
      document.body?.classList.remove('fixnow-splash-boot')
      const boot = document.getElementById('fixnow-boot-splash')
      if (boot) {
        boot.classList.add('is-leaving')
        window.setTimeout(() => boot.remove(), 420)
      }
    }
  }, [skip, onRoleSplashRoute])

  const showOverlay = visible && shouldRunColdSplash && !splash.finished
  const showOfflineActions = shouldShowSplashOfflineActions(network, splash.healthState)

  return (
    <>
      {children}
      {showOverlay ? (
        <FixNowSplash
          role={role}
          leaving={splash.leaving}
          healthState={splash.healthState}
          online={isNetworkUsable(network)}
          loaderLabel={splash.label}
          actions={
            showOfflineActions ? (
              <>
                <button type="button" className="fixnow-splash-btn fixnow-splash-btn--ghost" onClick={() => void splash.retryHealth()}>
                  Retry
                </button>
                <button type="button" className="fixnow-splash-btn fixnow-splash-btn--primary" onClick={() => splash.forceFinish('continue-offline')}>
                  Continue offline
                </button>
              </>
            ) : undefined
          }
        />
      ) : null}
    </>
  )
}
