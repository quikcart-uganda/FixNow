/**
 * Cold-start bootstrap for the native shell.
 *
 * Called once from `src/main.tsx` *before* React mounts so that:
 *   1. Network status is accurate on first paint.
 *   2. Secure-storage tokens are rehydrated into the synchronous tokenStorage
 *      that the axios interceptor reads.
 *   3. Status bar / keyboard / splash chrome is configured.
 *
 * Safe to call on web — every step no-ops when Capacitor is absent.
 */

import { initNativeApp, hideNativeSplash } from './nativeApp'
import { initNativeNetwork } from './nativeNetwork'
import { initNativePush } from './nativePush'
import { isNativePlatform, platformTag } from './platform'
import { secureStorage } from './secureStorage'

const ACCESS_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'
const USER_KEY = 'user'
const REMEMBER_KEY = 'remember'

type TokenStorageLike = {
  getAccessToken(): string | null
  getRefreshToken(): string | null
  getUser(): unknown | null
  getRemember(): boolean
  setSession(
    tokens: { accessToken: string; refreshToken: string },
    user: unknown,
    remember?: boolean,
  ): void
  clear(): void
}

/**
 * Pull tokens from the platform keystore into the web tokenStorage so the
 * existing AuthProvider / axios interceptor find them on first paint.
 */
export async function rehydrateSecureSession(tokenStorage: TokenStorageLike): Promise<void> {
  if (!secureStorage.isAvailable()) return

  // If the WebView already has a session (hot reload / same WebView process),
  // mirror it into the keystore and leave the in-memory store alone.
  const existingAccess = tokenStorage.getAccessToken()
  if (existingAccess) {
    await mirrorSessionToSecureStorage(tokenStorage)
    return
  }

  const [access, refresh, userRaw, rememberRaw] = await Promise.all([
    secureStorage.get(ACCESS_KEY),
    secureStorage.get(REFRESH_KEY),
    secureStorage.get(USER_KEY),
    secureStorage.get(REMEMBER_KEY),
  ])

  if (!access || !refresh || !userRaw) return

  try {
    const user = JSON.parse(userRaw)
    const remember = rememberRaw !== '0'
    tokenStorage.setSession({ accessToken: access, refreshToken: refresh }, user, remember)
  } catch {
    await secureStorage.clear([ACCESS_KEY, REFRESH_KEY, USER_KEY, REMEMBER_KEY])
  }
}

/** Persist the current web session into the keystore after login / refresh. */
export async function mirrorSessionToSecureStorage(tokenStorage: TokenStorageLike): Promise<void> {
  if (!secureStorage.isAvailable()) return
  const access = tokenStorage.getAccessToken()
  const refresh = tokenStorage.getRefreshToken()
  const user = tokenStorage.getUser()
  if (!access || !refresh || !user) {
    await clearSecureSession()
    return
  }
  await Promise.all([
    secureStorage.set(ACCESS_KEY, access),
    secureStorage.set(REFRESH_KEY, refresh),
    secureStorage.set(USER_KEY, JSON.stringify(user)),
    secureStorage.set(REMEMBER_KEY, tokenStorage.getRemember() ? '1' : '0'),
  ])
}

export async function clearSecureSession(): Promise<void> {
  await secureStorage.clear([ACCESS_KEY, REFRESH_KEY, USER_KEY, REMEMBER_KEY])
}

export type BootstrapHandlers = {
  onResume?: () => void
  onPause?: () => void
  onBack?: (canGoBack: boolean) => void
  onDeepLink?: (url: string) => void
  onPushToken?: (token: string, platform: 'android' | 'ios') => void
  onPushForeground?: (payload: { title?: string; body?: string; data: Record<string, unknown> }) => void
  onPushTap?: (payload: { title?: string; body?: string; data: Record<string, unknown> }) => void
}

/**
 * One-shot native bootstrap. Idempotent — safe if called twice.
 * Never throws: startup failures must not block React mount (white screen).
 */
export async function bootstrapNative(
  tokenStorage: TokenStorageLike,
  handlers: BootstrapHandlers = {},
): Promise<{ platform: 'web' | 'ios' | 'android' }> {
  const BOOTSTRAP_BUDGET_MS = 4_000

  const run = async (): Promise<{ platform: 'web' | 'ios' | 'android' }> => {
    try {
      await initNativeNetwork()
    } catch {
      /* network bridge is best-effort */
    }

    try {
      const { refreshApiBaseUrl } = await import('@fixnow/api')
      refreshApiBaseUrl()
    } catch {
      /* API base rewrite is best-effort */
    }

    try {
      await rehydrateSecureSession(tokenStorage)
    } catch {
      /* keystore rehydrate must never block first paint */
    }

    try {
      const { installClientDiagnostics } = await import('./diagnostics')
      await installClientDiagnostics()
    } catch {
      /* diagnostics are best-effort */
    }

    if (!isNativePlatform()) {
      return { platform: 'web' }
    }

    try {
      await initNativeApp({
        onResume: handlers.onResume,
        onPause: handlers.onPause,
        onBack: handlers.onBack,
        onDeepLink: handlers.onDeepLink,
      })
    } catch {
      /* chrome/lifecycle is best-effort */
    }

    try {
      await initNativePush({
        onToken: handlers.onPushToken,
        onForeground: handlers.onPushForeground,
        onTap: handlers.onPushTap,
      })
    } catch {
      /* push is best-effort at cold start */
    }

    return { platform: platformTag() }
  }

  try {
    const result = await Promise.race([
      run(),
      new Promise<{ platform: 'web' | 'ios' | 'android' }>((resolve) => {
        window.setTimeout(() => resolve({ platform: platformTag() }), BOOTSTRAP_BUDGET_MS)
      }),
    ])
    return result
  } catch {
    return { platform: platformTag() }
  }
}

export { hideNativeSplash }
