import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FixNowSplash,
  isNetworkUsable,
  markColdSplashDone,
  shouldShowSplashOfflineActions,
  useContentBlocks,
  useNetworkStatus,
  useSplashController,
} from '@fixnow/shared'
import { useAuth } from '@fixnow/hooks'
import { useApp } from '@technician/context/AppContext'

export function SplashPage() {
  const navigate = useNavigate()
  const { isAuthenticated, hasRole, status: authStatus } = useAuth()
  const { onboarded } = useApp()
  const network = useNetworkStatus()
  const splashContent = useContentBlocks('technician', 'technician.splash')

  const nextPath = () => {
    if (isAuthenticated && hasRole('technician')) return '/technician/dashboard'
    return onboarded ? '/technician/login' : '/technician/onboarding'
  }

  const splash = useSplashController({
    checkHealth: true,
    ready: authStatus !== 'loading',
    onFinish: () => {
      markColdSplashDone()
      navigate(nextPath(), { replace: true })
    },
  })

  const { forceFinish } = splash

  useEffect(() => {
    if (authStatus === 'loading') return
    if (isAuthenticated && hasRole('technician')) {
      forceFinish('authed-technician')
    }
  }, [authStatus, forceFinish, hasRole, isAuthenticated])

  const offline = shouldShowSplashOfflineActions(network, splash.healthState)

  return (
    <div className="fixnow-splash-page">
      <FixNowSplash
        role="technician"
        leaving={splash.leaving}
        healthState={splash.healthState}
        online={isNetworkUsable(network)}
        loaderLabel={splash.label}
        tagline={splashContent.pick('tagline')?.body || 'East Africa’s most trusted technician marketplace'}
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
