/**
 * Renders Google Sign-In when configured; otherwise a visible disabled control
 * with an explanation (never silently hidden).
 */

import { useEffect, useState } from 'react'
import {
  authApi,
  getApiBaseUrl,
  getFriendlyErrorMessage,
  type StoredUser,
} from '@fixnow/api'
import { signInWithGoogle } from '@fixnow/native'
import { useAuth } from '@fixnow/hooks'
import { cn } from '@fixnow/utils'
import { UX_AUTH, uxText } from '../ux'
import { authActionSecondaryClass } from './authUx'

type ContinueWithGoogleButtonProps = {
  role: 'customer' | 'technician'
  rememberMe?: boolean
  disabled?: boolean
  className?: string
  onSuccess: (result: { user: StoredUser; isNewUser: boolean }) => void
  onError?: (message: string) => void
  /** When true, always show the control (enabled or disabled). Default true. */
  showWhenUnavailable?: boolean
}

type GoogleConfig = { ready: boolean; clientId: string | null; enabled: boolean }

const UNAVAILABLE: GoogleConfig = { ready: false, clientId: null, enabled: false }

let configPromise: Promise<GoogleConfig> | null = null

const GOOGLE_UNAVAILABLE_MESSAGE = uxText(UX_AUTH.googleUnavailable)
const GOOGLE_DISABLED_HINT = uxText(UX_AUTH.googleUnavailable)

function loadGoogleConfig(): Promise<GoogleConfig> {
  configPromise ??= authApi
    .googleConfig()
    .then((res) => ({
      enabled: Boolean(res.data.enabled),
      ready: Boolean(res.data.ready && res.data.clientId),
      clientId: res.data.clientId ?? null,
    }))
    .catch(() => {
      configPromise = null
      return UNAVAILABLE
    })
  return configPromise
}

function resolveApiOrigin(apiUrl: string) {
  try {
    const url = new URL(apiUrl)
    return url.origin
  } catch {
    return apiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')
  }
}

function resolveApiPrefix(apiUrl: string) {
  try {
    const url = new URL(apiUrl)
    return url.pathname.replace(/\/+$/, '') || '/api/v1'
  } catch {
    return '/api/v1'
  }
}

export function ContinueWithGoogleButton({
  role,
  rememberMe = true,
  disabled = false,
  className,
  onSuccess,
  onError,
  showWhenUnavailable = true,
}: ContinueWithGoogleButtonProps) {
  const { loginWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState<GoogleConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadGoogleConfig()
      .then((value) => {
        if (!cancelled) setConfig(value)
      })
      .catch(() => {
        if (!cancelled) setConfig(UNAVAILABLE)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (config === null) {
    return (
      <div className={cn('space-y-3', className)} aria-busy="true">
        <div className="relative flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-mono-label uppercase text-on-surface-variant">or</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>
        <div className={cn(authActionSecondaryClass, 'opacity-70')}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface/20 border-t-on-surface" />
          <span className="text-on-surface-variant">{uxText(UX_AUTH.googleChecking)}</span>
        </div>
      </div>
    )
  }

  const usable = Boolean(config.enabled && config.ready && config.clientId)
  if (!usable && !showWhenUnavailable) return null

  const inert = busy || disabled || !usable

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border-subtle" />
        <span className="text-mono-label uppercase text-on-surface-variant">or</span>
        <div className="h-px flex-1 bg-border-subtle" />
      </div>

      <button
        type="button"
        aria-busy={busy ? 'true' : 'false'}
        aria-disabled={inert ? 'true' : undefined}
        disabled={inert}
        title={!usable ? GOOGLE_DISABLED_HINT : undefined}
        className={cn(
          authActionSecondaryClass,
          usable && 'hover:bg-surface-container-low',
          busy && 'cursor-wait opacity-70',
          !busy && inert && 'cursor-not-allowed opacity-60',
        )}
        onClick={() => {
          if (inert || !config.clientId) return
          const clientId = config.clientId
          setBusy(true)
          void (async () => {
            try {
              const apiUrl = getApiBaseUrl()
              const bridgeOrigin =
                (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_AUTH_BRIDGE_ORIGIN) ||
                resolveApiOrigin(apiUrl)
              const result = await signInWithGoogle({
                clientId,
                role,
                apiOrigin: resolveApiOrigin(apiUrl),
                apiPrefix: resolveApiPrefix(apiUrl),
                bridgeUrl: `${String(bridgeOrigin).replace(/\/+$/, '')}/google-auth-bridge.html`,
              })

              if (result.status !== 'success') {
                onError?.(
                  result.status === 'cancelled'
                    ? result.message
                    : result.message || GOOGLE_UNAVAILABLE_MESSAGE,
                )
                return
              }

              const session = await loginWithGoogle({
                credential: result.credential,
                role,
                rememberMe,
              })
              onSuccess(session)
            } catch (err) {
              onError?.(getFriendlyErrorMessage(err) || GOOGLE_UNAVAILABLE_MESSAGE)
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {busy ? (
          <>
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-on-surface/20 border-t-on-surface" />
            <span>{uxText(UX_AUTH.googleConnecting)}</span>
          </>
        ) : (
          <>
            <GoogleMark />
            <span>{uxText(UX_AUTH.googleContinue)}</span>
          </>
        )}
      </button>
      {!usable ? (
        <p className="text-center text-[11px] leading-snug text-on-surface-variant/80" role="status">
          {GOOGLE_DISABLED_HINT}
        </p>
      ) : null}
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.1 39.5 16 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l.1.1 6.2 5.2C37.8 38.3 44 33 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  )
}
