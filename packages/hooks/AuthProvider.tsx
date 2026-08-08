import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  authApi,
  setAuthFailureHandler,
  setLastSelectedRole,
  tokenStorage,
  type StoredUser,
} from '@fixnow/api'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'
type MarketplaceRole = 'customer' | 'technician'

type AuthContextValue = {
  status: AuthStatus
  user: StoredUser | null
  isAuthenticated: boolean
  availableRoles: Array<'customer' | 'technician' | 'admin'>
  canSwitchRole: boolean
  login: (input: {
    email: string
    password: string
    rememberMe?: boolean
    preferredRole?: MarketplaceRole
  }) => Promise<StoredUser>
  loginWithGoogle: (input: {
    credential: string
    role: MarketplaceRole
    rememberMe?: boolean
  }) => Promise<{ user: StoredUser; isNewUser: boolean }>
  /** Passwordless Development Administrator entry (non-production only). */
  devAdminLogin: () => Promise<StoredUser>
  register: (input: {
    email: string
    password: string
    fullName: string
    role: MarketplaceRole
    phone?: string
    acceptedTerms?: boolean
    primaryCategoryId?: string
    district?: string
    referralCode?: string
  }) => Promise<{ debugOtp?: string }>
  verifyOtp: (input: {
    email: string
    code: string
    purpose?: 'email_verification' | 'phone_verification' | 'password_reset' | 'login'
  }) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<StoredUser | null>
  switchRole: (role: MarketplaceRole) => Promise<StoredUser>
  hasRole: (...roles: Array<'customer' | 'technician' | 'admin'>) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function rolesOf(user: StoredUser | null): Array<'customer' | 'technician' | 'admin'> {
  if (!user) return []
  if (Array.isArray(user.availableRoles) && user.availableRoles.length > 0) {
    return user.availableRoles
  }
  return user.role ? [user.role] : []
}

function hasStoredSession() {
  return Boolean(tokenStorage.getAccessToken() || tokenStorage.hasRefreshSession())
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Anonymous visitors must never start in `loading` — Admin/Customer/Technician
  // ProtectedRoutes would otherwise spin forever if native cache I/O stalls before
  // restoreSession runs (reproduced on /admin/dashboard with no refresh token).
  const [status, setStatus] = useState<AuthStatus>(() => (hasStoredSession() ? 'loading' : 'anonymous'))
  const [user, setUser] = useState<StoredUser | null>(() => tokenStorage.getUser())

  const clearSession = useCallback(() => {
    tokenStorage.clear()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const refreshMe = useCallback(async () => {
    if (!tokenStorage.getAccessToken()) {
      clearSession()
      return null
    }
    try {
      const res = await authApi.me()
      const next = res.data.user
      tokenStorage.updateUser(next)
      setUser(next)
      setStatus('authenticated')
      return next
    } catch (err) {
      // Network blips must not force logout when a refresh session still exists.
      const statusCode =
        err && typeof err === 'object' && 'status' in err ? Number((err as { status?: number }).status) : 0
      if (statusCode === 401 || statusCode === 403 || !tokenStorage.hasRefreshSession()) {
        clearSession()
      }
      return null
    }
  }, [clearSession])

  /** Restore access token from refresh after reload (access is memory-only). */
  const restoreSession = useCallback(async () => {
    if (tokenStorage.getAccessToken()) {
      return refreshMe()
    }
    if (!tokenStorage.hasRefreshSession()) {
      setStatus('anonymous')
      return null
    }
    try {
      await authApi.refresh()
      return await refreshMe()
    } catch (err) {
      const statusCode =
        err && typeof err === 'object' && 'status' in err ? Number((err as { status?: number }).status) : 0
      if (statusCode === 401 || statusCode === 403) {
        clearSession()
      } else if (!tokenStorage.getAccessToken()) {
        // Keep refresh token; surface loading→anonymous only if we truly have no session paint.
        setStatus(tokenStorage.hasRefreshSession() ? 'loading' : 'anonymous')
        // One retry after a short delay for transient LAN/API blips.
        await new Promise((r) => setTimeout(r, 600))
        try {
          await authApi.refresh()
          return await refreshMe()
        } catch {
          if (!tokenStorage.getAccessToken()) clearSession()
        }
      }
      return null
    }
  }, [clearSession, refreshMe])

  useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null)
      setStatus('anonymous')
    })
    const onSocketAuthFailed = () => {
      clearSession()
    }
    const onSessionCleared = () => {
      setUser(null)
      setStatus('anonymous')
    }
    /** Cross-tab logout when refresh token is removed from storage. */
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'fixnow_refresh_token' && event.newValue === null) {
        setUser(null)
        setStatus('anonymous')
      }
    }
    window.addEventListener('fixnow:socket-auth-failed', onSocketAuthFailed)
    window.addEventListener('fixnow:session-cleared', onSessionCleared)
    window.addEventListener('storage', onStorage)

    void (async () => {
      // Auth settle must not depend on @fixnow/native / Preferences. Cache is a
      // best-effort paint only; restoreSession is the source of truth.
      if (!hasStoredSession()) {
        setStatus('anonymous')
        return
      }

      void import('@fixnow/native')
        .then(async (native) => {
          const cached = await native.readCachedData<StoredUser>(native.DATA_CACHE_KEYS.userProfile)
          if (
            cached.value &&
            hasStoredSession()
          ) {
            setUser(cached.value)
            setStatus((current) => (current === 'loading' ? 'authenticated' : current))
          }
        })
        .catch(() => undefined)

      try {
        const next = await restoreSession()
        if (next) {
          void import('@fixnow/native')
            .then((native) => native.saveCachedData(native.DATA_CACHE_KEYS.userProfile, next))
            .catch(() => undefined)
        }
      } catch {
        clearSession()
      }
    })()
    return () => {
      setAuthFailureHandler(null)
      window.removeEventListener('fixnow:socket-auth-failed', onSocketAuthFailed)
      window.removeEventListener('fixnow:session-cleared', onSessionCleared)
      window.removeEventListener('storage', onStorage)
    }
  }, [restoreSession, clearSession])

  const login = useCallback(
    async (input: {
      email: string
      password: string
      rememberMe?: boolean
      preferredRole?: MarketplaceRole
    }) => {
      const result = await authApi.login(input)
      try {
        localStorage.removeItem('fixnow_guest_session_v1')
      } catch {
        /* ignore */
      }
      setUser(result.user)
      setStatus('authenticated')
      return result.user
    },
    [],
  )

  const devAdminLogin = useCallback(async () => {
    const result = await authApi.devAdminLogin()
    try {
      localStorage.removeItem('fixnow_guest_session_v1')
    } catch {
      /* ignore */
    }
    setUser(result.user)
    setStatus('authenticated')
    return result.user
  }, [])

  const loginWithGoogle = useCallback(
    async (input: {
      credential: string
      role: MarketplaceRole
      rememberMe?: boolean
    }) => {
      const result = await authApi.loginWithGoogle(input)
      try {
        localStorage.removeItem('fixnow_guest_session_v1')
      } catch {
        /* ignore */
      }
      setUser(result.user)
      setStatus('authenticated')
      if (result.user.role === 'customer' || result.user.role === 'technician') {
        setLastSelectedRole(result.user.role)
      }
      return { user: result.user, isNewUser: result.isNewUser }
    },
    [],
  )

  const register = useCallback(
    async (input: {
      email: string
      password: string
      fullName: string
      role: MarketplaceRole
      phone?: string
      acceptedTerms?: boolean
      primaryCategoryId?: string
      district?: string
      referralCode?: string
    }) => {
      const res = await authApi.register(input)
      return { debugOtp: res.data.verification?.debugOtp }
    },
    [],
  )

  const verifyOtp = useCallback(
    async (input: {
      email: string
      code: string
      purpose?: 'email_verification' | 'phone_verification' | 'password_reset' | 'login'
    }) => {
      await authApi.verifyOtp({
        email: input.email,
        code: input.code,
        purpose: input.purpose ?? 'email_verification',
      })
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      try {
        const { unregisterPushDevice } = await import('./PushProvider')
        await unregisterPushDevice()
      } catch {
        /* best-effort device cleanup */
      }
      try {
        const { disconnectSocket, clearFrontendDiagnostics } = await import('@fixnow/api')
        disconnectSocket()
        clearFrontendDiagnostics()
      } catch {
        /* best-effort socket / diagnostics cleanup */
      }
      try {
        const { clearRoleCaches, clearSecureSession } = await import('@fixnow/native')
        await clearRoleCaches()
        await clearSecureSession()
      } catch {
        /* ignore */
      }
      await authApi.logout()
    } finally {
      clearSession()
      try {
        localStorage.removeItem('fixnow.admin.developerDiagnostics')
      } catch {
        /* ignore */
      }
      try {
        window.dispatchEvent(new CustomEvent('fixnow:auth-logout'))
      } catch {
        /* ignore */
      }
    }
  }, [clearSession])

  const switchRole = useCallback(async (role: MarketplaceRole) => {
    const result = await authApi.switchRole(role)
    try {
      const { clearRoleCaches, saveCachedData, DATA_CACHE_KEYS } = await import('@fixnow/native')
      await clearRoleCaches()
      await saveCachedData(DATA_CACHE_KEYS.userProfile, result.user)
    } catch {
      /* ignore cache side-effects */
    }
    setUser(result.user)
    setStatus('authenticated')
    setLastSelectedRole(role)
    return result.user
  }, [])

  const hasRole = useCallback(
    (...roles: Array<'customer' | 'technician' | 'admin'>) => {
      return Boolean(user && roles.includes(user.role))
    },
    [user],
  )

  const availableRoles = useMemo(() => rolesOf(user), [user])
  const canSwitchRole = useMemo(() => {
    const list = Array.isArray(availableRoles) ? availableRoles : []
    const marketplace = list.filter((r) => r === 'customer' || r === 'technician')
    return marketplace.length > 1
  }, [availableRoles])

  const value = useMemo(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated' && Boolean(user),
      availableRoles,
      canSwitchRole,
      login,
      loginWithGoogle,
      devAdminLogin,
      register,
      verifyOtp,
      logout,
      refreshMe,
      switchRole,
      hasRole,
    }),
    [
      status,
      user,
      availableRoles,
      canSwitchRole,
      login,
      loginWithGoogle,
      devAdminLogin,
      register,
      verifyOtp,
      logout,
      refreshMe,
      switchRole,
      hasRole,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
