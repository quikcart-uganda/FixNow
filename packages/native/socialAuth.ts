/**
 * Google Sign-In via Google Identity Services (GIS) ID-token flow.
 *
 * Web: load GIS, render a hidden button, click it from our branded control,
 * then POST the credential to `/auth/google`.
 *
 * Capacitor: Google returns HTTP 403 for the GIS script when the User-Agent
 * contains `; wv)` (Android System WebView). We open a hosted bridge page in
 * `@capacitor/browser` (Chrome Custom Tabs / SFSafariViewController), receive
 * a one-time handoff code on `fixnow://google-auth`, exchange it for the
 * credential, then use the same `/auth/google` login path.
 */

import { APP_SCHEME } from './deepLinks'
import { isNativePlatform } from './platform'

export type SocialProvider = 'google' | 'apple'

export type GoogleSignInSuccess = {
  status: 'success'
  provider: 'google'
  credential: string
}

export type GoogleSignInFailure = {
  status: 'cancelled' | 'unavailable' | 'error'
  provider: 'google'
  code: string
  message: string
}

export type SocialSignInResult =
  | GoogleSignInSuccess
  | GoogleSignInFailure
  | {
      status: 'ready_stub'
      provider: SocialProvider
      message: string
    }
  | {
      status: 'unavailable'
      provider: SocialProvider
      message: string
    }

export type SocialProviderAvailability = {
  google: boolean
  apple: boolean
  reason: string
}

type GoogleAccountsId = {
  initialize: (config: Record<string, unknown>) => void
  renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void
  prompt?: (cb?: (notification: { isNotDisplayed?: () => boolean; getNotDisplayedReason?: () => string }) => void) => void
}

type GoogleNamespace = {
  accounts: { id: GoogleAccountsId }
}

declare global {
  interface Window {
    google?: GoogleNamespace
  }
}

export type GoogleSignInOptions = {
  clientId: string
  role: 'customer' | 'technician'
  /** API origin without trailing slash, e.g. http://localhost:4000 */
  apiOrigin: string
  /** API prefix, e.g. /api/v1 */
  apiPrefix?: string
  /** Absolute URL to google-auth-bridge.html (native). Defaults to apiOrigin + /google-auth-bridge.html */
  bridgeUrl?: string
}

const GSI_SCRIPT = 'https://accounts.google.com/gsi/client'
const CREDENTIAL_TIMEOUT_MS = 90_000
const CANCEL_GRACE_MS = 1_500

function friendlyGoogleMessage(code: string, fallback?: string): string {
  const map: Record<string, string> = {
    GOOGLE_SIGNIN_CANCELLED: 'Google sign-in was cancelled.',
    GOOGLE_POPUP_CLOSED: 'Google sign-in was cancelled.',
    GOOGLE_NOT_CONFIGURED:
      'Google Sign-In is currently unavailable. Please sign in using your email and password.',
    GOOGLE_DISABLED:
      'Google Sign-In is currently unavailable. Please sign in using your email and password.',
    GOOGLE_SCRIPT_LOAD_FAILED:
      'Google Sign-In is currently unavailable. Please check your connection or continue with email and password.',
    GOOGLE_SCRIPT_TIMEOUT: 'Google Sign-In took too long. Please try again, or continue with email and password.',
    GOOGLE_SCRIPT_BLOCKED:
      'Google Sign-In is currently unavailable. Please continue with email and password.',
    GOOGLE_HANDOFF_FAILED: 'Could not finish Google sign-in. Please try again.',
    GOOGLE_HANDOFF_EXPIRED: 'Google sign-in expired. Please try again.',
    GOOGLE_BACKEND_NETWORK_ERROR: 'Service temporarily unavailable. Please try again.',
    GOOGLE_ORIGIN_MISMATCH:
      'Google Sign-In is currently unavailable. Please continue with email and password.',
    GOOGLE_ROLE_INVALID: 'This Google account cannot be used for this sign-in. Please continue with email and password.',
  }
  // Never surface raw provider/config diagnostics as a fallback.
  if (fallback && /configur|environment|WebView|origin|authorized|client[_ ]?id|API[_ ]?key/i.test(fallback)) {
    return map[code] || map.GOOGLE_DISABLED
  }
  return map[code] || fallback || 'Google sign-in failed. Please try again.'
}

function fail(code: string, message?: string): GoogleSignInFailure {
  return {
    status: code === 'GOOGLE_SIGNIN_CANCELLED' || code === 'GOOGLE_POPUP_CLOSED' ? 'cancelled' : 'error',
    provider: 'google',
    code,
    message: friendlyGoogleMessage(code, message),
  }
}

function detectWebViewUa(): boolean {
  if (typeof navigator === 'undefined') return false
  return /; wv\)/i.test(navigator.userAgent) || isNativePlatform()
}

function resolveApiParts(apiOrigin: string, apiPrefix?: string) {
  const origin = apiOrigin.replace(/\/+$/, '')
  const prefix = (apiPrefix || '/api/v1').replace(/\/+$/, '') || '/api/v1'
  return { origin, prefix }
}

async function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') throw new Error('GOOGLE_SCRIPT_LOAD_FAILED')
  if (window.google?.accounts?.id) return

  if (detectWebViewUa() && /; wv\)/i.test(navigator.userAgent)) {
    throw new Error('GOOGLE_SCRIPT_BLOCKED')
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('GOOGLE_SCRIPT_LOAD_FAILED')), { once: true })
      if (window.google?.accounts?.id) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SCRIPT
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('GOOGLE_SCRIPT_LOAD_FAILED'))
    document.head.appendChild(script)
    window.setTimeout(() => reject(new Error('GOOGLE_SCRIPT_TIMEOUT')), 15_000)
  })

  if (!window.google?.accounts?.id) throw new Error('GOOGLE_SCRIPT_LOAD_FAILED')
}

async function obtainCredentialViaWebPopup(clientId: string): Promise<SocialSignInResult> {
  try {
    await loadGsiScript()
  } catch (err) {
    const code = err instanceof Error ? err.message : 'GOOGLE_SCRIPT_LOAD_FAILED'
    return fail(code)
  }

  return await new Promise<SocialSignInResult>((resolve) => {
    let settled = false
    const finish = (result: SocialSignInResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const wrapper = document.createElement('div')
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0.01;overflow:hidden;'
    document.body.appendChild(wrapper)

    const onVisibility = () => {
      window.setTimeout(() => {
        if (!settled && document.visibilityState === 'visible') {
          finish(fail('GOOGLE_SIGNIN_CANCELLED'))
        }
      }, CANCEL_GRACE_MS)
    }

    const cleanup = () => {
      window.removeEventListener('focus', onVisibility)
      document.removeEventListener('visibilitychange', onVisibility)
      wrapper.remove()
    }

    window.addEventListener('focus', onVisibility)
    document.addEventListener('visibilitychange', onVisibility)

    const timeout = window.setTimeout(() => {
      finish(fail('GOOGLE_SCRIPT_TIMEOUT', 'Google sign-in timed out. Try again.'))
    }, CREDENTIAL_TIMEOUT_MS)

    try {
      window.google!.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          window.clearTimeout(timeout)
          const credential = String(response?.credential || '').trim()
          if (!credential) {
            finish(fail('GOOGLE_SIGNIN_CANCELLED'))
            return
          }
          finish({ status: 'success', provider: 'google', credential })
        },
        auto_select: false,
        ux_mode: 'popup',
        context: 'signin',
        itp_support: true,
        cancel_on_tap_outside: true,
      })

      window.google!.accounts.id.renderButton(wrapper, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: 280,
      })

      window.setTimeout(() => {
        const button = wrapper.querySelector<HTMLElement>('[role="button"], button, div[tabindex]')
        if (!button) {
          finish(fail('GOOGLE_SCRIPT_LOAD_FAILED', 'Google Sign-In button failed to render.'))
          return
        }
        button.click()
      }, 50)
    } catch (err) {
      window.clearTimeout(timeout)
      const message = err instanceof Error ? err.message : undefined
      if (message && /origin|authorized/i.test(message)) {
        finish(fail('GOOGLE_ORIGIN_MISMATCH', message))
        return
      }
      finish(fail('GOOGLE_SCRIPT_LOAD_FAILED', message))
    }
  })
}

async function obtainCredentialViaNativeBridge(options: GoogleSignInOptions): Promise<SocialSignInResult> {
  const { origin, prefix } = resolveApiParts(options.apiOrigin, options.apiPrefix)
  const bridgeBase = (options.bridgeUrl || `${origin}/google-auth-bridge.html`).split('?')[0]
  const returnUrl = `${APP_SCHEME}://google-auth`
  const qs = new URLSearchParams({
    client_id: options.clientId,
    role: options.role,
    return_url: returnUrl,
    api_origin: origin,
    api_prefix: prefix,
  })
  const bridgeUrl = `${bridgeBase}?${qs.toString()}`

  try {
    const [{ Browser }, { App }] = await Promise.all([
      import('@capacitor/browser'),
      import('@capacitor/app'),
    ])

    return await new Promise<SocialSignInResult>((resolve) => {
      let settled = false
      let urlSub: { remove: () => Promise<void> } | undefined
      let finishedSub: { remove: () => Promise<void> } | undefined

      const finish = (result: SocialSignInResult) => {
        if (settled) return
        settled = true
        void urlSub?.remove()
        void finishedSub?.remove()
        void Browser.close().catch(() => undefined)
        resolve(result)
      }

      const handleUrl = async (rawUrl: string) => {
        let url: URL
        try {
          url = new URL(rawUrl)
        } catch {
          return
        }
        if (url.protocol.replace(':', '') !== APP_SCHEME) return
        if (url.hostname !== 'google-auth' && !url.pathname.includes('google-auth')) return

        const error = url.searchParams.get('error')
        if (error) {
          finish(fail(error))
          return
        }
        const code = url.searchParams.get('code')
        if (!code) {
          finish(fail('GOOGLE_HANDOFF_FAILED'))
          return
        }

        try {
          const response = await fetch(`${origin}${prefix}/auth/google/native-handoff/${encodeURIComponent(code)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
          const payload = (await response.json().catch(() => ({}))) as {
            data?: { credential?: string }
            error?: { message?: string }
            message?: string
          }
          const credential = String(payload?.data?.credential || '').trim()
          if (!response.ok || !credential) {
            finish(
              fail(
                'GOOGLE_HANDOFF_EXPIRED',
                payload?.error?.message || payload?.message || 'Google handoff failed.',
              ),
            )
            return
          }
          finish({ status: 'success', provider: 'google', credential })
        } catch {
          finish(fail('GOOGLE_BACKEND_NETWORK_ERROR'))
        }
      }

      void App.addListener('appUrlOpen', (event: { url: string }) => {
        void handleUrl(event.url)
      }).then((sub) => {
        urlSub = sub
      })

      void Browser.addListener('browserFinished', () => {
        window.setTimeout(() => {
          if (!settled) finish(fail('GOOGLE_SIGNIN_CANCELLED'))
        }, CANCEL_GRACE_MS)
      }).then((sub) => {
        finishedSub = sub
      })

      void Browser.open({
        url: bridgeUrl,
        toolbarColor: '#004ac6',
      }).catch(() => {
        finish(fail('GOOGLE_SCRIPT_LOAD_FAILED', 'Could not open the Google sign-in browser.'))
      })

      window.setTimeout(() => {
        if (!settled) finish(fail('GOOGLE_SCRIPT_TIMEOUT', 'Google sign-in timed out. Try again.'))
      }, CREDENTIAL_TIMEOUT_MS)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined
    return fail('GOOGLE_SCRIPT_LOAD_FAILED', message)
  }
}

/**
 * Report which social providers the current build *could* expose.
 */
export function getSocialProviderAvailability(): SocialProviderAvailability {
  return {
    google: true,
    apple: false,
    reason: 'Google Sign-In uses GIS on web and a system-browser bridge on Capacitor.',
  }
}

/**
 * Obtain a Google ID token (`credential`) for the given role.
 * Does not create a FixNow session — callers must POST to `/auth/google`.
 */
export async function signInWithGoogle(options?: GoogleSignInOptions): Promise<SocialSignInResult> {
  if (!options?.clientId) {
    return fail('GOOGLE_NOT_CONFIGURED')
  }
  if (options.role !== 'customer' && options.role !== 'technician') {
    return fail('GOOGLE_ROLE_INVALID')
  }

  if (isNativePlatform() || detectWebViewUa()) {
    return obtainCredentialViaNativeBridge(options)
  }

  return obtainCredentialViaWebPopup(options.clientId)
}

export async function signInWithApple(): Promise<SocialSignInResult> {
  return {
    status: 'unavailable',
    provider: 'apple',
    message: 'Sign in with Apple is not enabled yet.',
  }
}
