import { apiDelete, apiGet, apiPost } from './client'
import { setLastSelectedRole, tokenStorage, type StoredUser } from './tokenStorage'

export type AuthTokens = {
  accessToken: string
  refreshToken: string
  expiresIn?: number
}

export type AuthResult = {
  user: StoredUser
  tokens: AuthTokens
  verification?: { debugOtp?: string; purpose?: string }
}

function persist(result: AuthResult, remember = true) {
  tokenStorage.setSession(result.tokens, result.user, remember)
  return result
}

export const authApi = {
  register(input: {
    email: string
    password: string
    fullName: string
    role: 'customer' | 'technician'
    phone?: string
    acceptedTerms?: boolean
    primaryCategoryId?: string
    district?: string
    referralCode?: string
  }) {
    return apiPost<AuthResult>('/auth/register', input)
  },

  async login(input: {
    email: string
    password: string
    rememberMe?: boolean
    preferredRole?: 'customer' | 'technician'
    deviceId?: string
    platform?: 'web' | 'ios' | 'android' | 'unknown'
  }) {
    let platform = input.platform
    if (!platform) {
      try {
        const { platformTag } = await import('@fixnow/native')
        platform = platformTag()
      } catch {
        platform = 'web'
      }
    }
    const res = await apiPost<AuthResult>('/auth/login', {
      ...input,
      platform,
    })
    const result = persist(res.data, input.rememberMe !== false)
    if (result.user.role === 'customer' || result.user.role === 'technician') {
      setLastSelectedRole(result.user.role)
    }
    return result
  },

  /**
   * Passwordless Development Administrator entry. The backend refuses unless
   * ALLOW_DEV_ADMIN_LOGIN=true in a non-production environment.
   */
  async devAdminLogin() {
    const res = await apiPost<AuthResult>('/auth/dev-admin-login', {})
    return persist(res.data, true)
  },

  googleConfig() {
    return apiGet<{
      enabled: boolean
      ready: boolean
      clientId: string | null
      provider: 'google'
    }>('/auth/google/config')
  },

  async loginWithGoogle(input: {
    credential: string
    role: 'customer' | 'technician'
    rememberMe?: boolean
    deviceId?: string
    platform?: 'web' | 'ios' | 'android' | 'unknown'
  }) {
    let platform = input.platform
    if (!platform) {
      try {
        const { platformTag } = await import('@fixnow/native')
        platform = platformTag()
      } catch {
        platform = 'web'
      }
    }
    const res = await apiPost<AuthResult & { isNewUser?: boolean }>('/auth/google', {
      ...input,
      platform,
    })
    return { ...persist(res.data, input.rememberMe !== false), isNewUser: Boolean(res.data.isNewUser) }
  },

  async refresh() {
    // Single-flight with axios interceptor — prevents refresh-token rotation races
    // (StrictMode double-mount / parallel 401s) that revoke the session family.
    const { queueRefresh } = await import('./client')
    try {
      const access = await queueRefresh()
      if (!access) {
        const { ApiError } = await import('./errors')
        throw new ApiError(401, 'Session expired. Please sign in again.')
      }
      return {
        tokens: {
          accessToken: access,
          refreshToken: tokenStorage.getRefreshToken() || '',
        },
        user: tokenStorage.getUser() ?? undefined,
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) throw err
      const { ApiError } = await import('./errors')
      // Preserve network failures as non-401 so AuthProvider can retry.
      throw new ApiError(0, 'Unable to refresh session. Check your connection and try again.')
    }
  },

  async logout() {
    const refreshToken = tokenStorage.getRefreshToken()
    try {
      if (tokenStorage.getAccessToken()) {
        await apiPost('/auth/logout', { refreshToken })
      }
    } finally {
      tokenStorage.clear()
    }
  },

  me() {
    return apiGet<{ user: StoredUser }>('/auth/me')
  },

  async switchRole(role: 'customer' | 'technician') {
    const refreshToken = tokenStorage.getRefreshToken()
    const res = await apiPost<AuthResult>('/auth/switch-role', {
      role,
      ...(refreshToken ? { refreshToken } : {}),
    })
    const result = persist(res.data, tokenStorage.getRemember())
    setLastSelectedRole(role)
    return result
  },

  forgotPassword(email: string) {
    return apiPost<{ verification?: { debugOtp?: string } }>('/auth/forgot-password', { email })
  },

  resetPassword(input: { email: string; code: string; newPassword: string }) {
    return apiPost('/auth/reset-password', input)
  },

  changePassword(input: { currentPassword: string; newPassword: string }) {
    return apiPost('/auth/change-password', input)
  },

  verifyOtp(input: {
    email?: string
    phone?: string
    code: string
    purpose: 'email_verification' | 'phone_verification' | 'password_reset' | 'login'
  }) {
    return apiPost('/auth/verify-otp', input)
  },

  resendOtp(input: {
    email?: string
    phone?: string
    purpose: 'email_verification' | 'phone_verification' | 'password_reset' | 'login'
    channel?: 'email' | 'sms'
  }) {
    return apiPost<{ verification?: { debugOtp?: string } }>('/auth/resend-otp', input)
  },

  listSessions() {
    return apiGet<{ items: unknown[] }>('/auth/sessions')
  },

  revokeSession(id: string) {
    return apiDelete(`/auth/sessions/${id}`)
  },

  revokeAllSessions() {
    return apiPost('/auth/sessions/revoke-all')
  },
}
