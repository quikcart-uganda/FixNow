import type { ReactNode } from 'react'
import type { BackendHealthState } from './healthCheck'
import type { SplashRole, SplashThemeMode } from './useSplashController'
import { resolveSplashTheme } from './useSplashController'

const MARK_SRC = `${import.meta.env.BASE_URL || './'}brand/fixnow-mark.svg`.replace(/([^:]\/)\/+/g, '$1')

const ROLE_TAGLINES: Record<SplashRole, string> = {
  platform: 'Reliable professionals at your fingertips.',
  customer: 'Book verified help in minutes',
  technician: 'Win nearby jobs. Build trust.',
  admin: 'Operate the FixNow marketplace',
}

function statusCopy(state: BackendHealthState, online: boolean): { text: string; state: BackendHealthState } {
  // Only show offline copy when the device is conclusively offline.
  if (!online || state === 'offline') return { text: 'No network · Offline startup', state: 'offline' }
  if (state === 'checking') return { text: 'Getting things ready…', state: 'checking' }
  if (state === 'ok') return { text: 'Ready', state: 'ok' }
  if (state === 'degraded') return { text: 'Running a little slow', state: 'degraded' }
  // Backend /health probe failed while the device is online — soft continue,
  // never alarm as Offline UI during a successful launch.
  if (state === 'error') return { text: 'Getting things ready…', state: 'checking' }
  return { text: 'Getting things ready…', state: 'checking' }
}

export type FixNowSplashProps = {
  role?: SplashRole
  theme?: SplashThemeMode
  tagline?: string
  loaderLabel?: string
  healthState?: BackendHealthState
  online?: boolean
  leaving?: boolean
  fullscreen?: boolean
  actions?: ReactNode
  className?: string
}

export function FixNowSplash({
  role = 'platform',
  theme,
  tagline,
  loaderLabel = 'Starting FixNow',
  healthState = 'checking',
  online = true,
  leaving = false,
  fullscreen = true,
  actions,
  className = '',
}: FixNowSplashProps) {
  const resolvedTheme = resolveSplashTheme(theme)
  const status = statusCopy(healthState, online)
  const classes = [
    'fixnow-splash',
    leaving ? 'is-leaving' : '',
    fullscreen ? '' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={classes}
      data-role={role}
      data-theme={resolvedTheme === 'brand' ? undefined : resolvedTheme}
      role="status"
      aria-live="polite"
      aria-label="FixNow loading"
    >
      <div className="fixnow-splash-shell">
        <div className="fixnow-splash-logo-wrap">
          <div className="fixnow-splash-mark" aria-hidden="true">
            <img src={MARK_SRC} alt="" width={64} height={64} decoding="sync" loading="eager" />
          </div>
        </div>

        <h1 className="fixnow-splash-word" aria-label="FixNow">
          <span className="fn-fix">Fix</span>
          <span className="fn-now">Now</span>
        </h1>

        <p className="fixnow-splash-tagline">{tagline || ROLE_TAGLINES[role]}</p>

        <div className="fixnow-splash-loader" aria-label={`Loading ${loaderLabel}`}>
          <div className="fixnow-splash-loader-track" aria-hidden="true">
            <span />
          </div>
          <small className="fixnow-splash-loader-label">{loaderLabel}</small>
        </div>

        <p className="fixnow-splash-status" data-state={status.state}>
          <span className="fixnow-splash-dot" aria-hidden="true" />
          {status.text}
        </p>

        {actions ? <div className="fixnow-splash-actions">{actions}</div> : null}
      </div>
    </section>
  )
}

export { MARK_SRC as FIXNOW_MARK_SRC }
