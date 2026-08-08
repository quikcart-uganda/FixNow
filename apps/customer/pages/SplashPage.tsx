import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FixNowSplash,
  getRememberedEmail,
  isCustomerOnboarded,
  isGuestSession,
  isNetworkUsable,
  markColdSplashDone,
  prefetchEssentialContent,
  shouldShowSplashOfflineActions,
  useContentBlocks,
  useNetworkStatus,
  useSplashController,
} from '@fixnow/shared'
import { useAuth } from '@fixnow/hooks'

export function SplashPage() {
  const navigate = useNavigate()
  const { isAuthenticated, hasRole, status: authStatus } = useAuth()
  const network = useNetworkStatus()
  const splashContent = useContentBlocks('customer', 'customer.splash')
  const [contentReady, setContentReady] = useState(false)

  const nextPath = () => {
    if (isAuthenticated && hasRole('customer')) return '/customer/home'
    if (isGuestSession()) return '/customer/home'
    if (getRememberedEmail() || isCustomerOnboarded()) return '/customer/login'
    return '/customer/onboarding'
  }

  useEffect(() => {
    let cancelled = false
    // Overlap Home chunk download with API prefetch so Suspense after splash is near-instant.
    void import('@customer/pages/HomePage').catch(() => undefined)
    void prefetchEssentialContent({ role: 'customer', budgetMs: 1800 }).finally(() => {
      if (!cancelled) setContentReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const splash = useSplashController({
    checkHealth: true,
    ready: authStatus !== 'loading' && contentReady,
    onFinish: () => {
      markColdSplashDone()
      navigate(nextPath(), { replace: true })
    },
  })

  const { forceFinish } = splash

  useEffect(() => {
    if (authStatus === 'loading' || !contentReady) return
    if (isAuthenticated && hasRole('customer')) {
      forceFinish('authed-customer')
    } else if (isGuestSession()) {
      forceFinish('guest-session')
    }
  }, [authStatus, contentReady, forceFinish, hasRole, isAuthenticated])

  const offline = shouldShowSplashOfflineActions(network, splash.healthState)

  return (
    <div className="fixnow-splash-page">
      <FixNowSplash
        role="customer"
        leaving={splash.leaving}
        healthState={splash.healthState}
        online={isNetworkUsable(network)}
        loaderLabel={splash.label}
        tagline={splashContent.pick('tagline')?.body || 'Reliable professionals at your fingertips.'}
        actions={
          <>
            {offline ? (
              <button
                type="button"
                className="fixnow-splash-btn fixnow-splash-btn--ghost"
                onClick={() => void splash.retryHealth()}
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="fixnow-splash-btn fixnow-splash-btn--primary"
              onClick={() => forceFinish(offline ? 'continue-offline' : 'get-started')}
            >
              {offline ? 'Continue offline' : 'Get started'}
            </button>
          </>
        }
      />
    </div>
  )
}
