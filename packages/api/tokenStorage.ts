const ACCESS_KEY = 'fixnow_access_token'
const REFRESH_KEY = 'fixnow_refresh_token'
const USER_KEY = 'fixnow_user'
const REMEMBER_KEY = 'fixnow_remember'

/** In-memory access token — never persisted to Web Storage (XSS blast-radius reduction). */
let memoryAccessToken: string | null = null

export type StoredUser = {
  id: string
  email: string
  phone?: string | null
  role: 'customer' | 'technician' | 'admin'
  /** Marketplace profiles owned by this identity (single User). */
  availableRoles?: Array<'customer' | 'technician' | 'admin'>
  fullName: string
  accountStatus: string
  verificationStatus?: string
  emailVerified?: boolean
  phoneVerified?: boolean
  /** Admin operator role key (super_admin | finance | support | …). */
  adminRoleKey?: string | null
  permissionKeys?: string[]
  capabilities?: Record<string, boolean> | null
  /** Production Governance classification (development | production | unclassified). */
  governanceClassification?: string | null
  isProductionSuperAdmin?: boolean
}

const LAST_ROLE_KEY = 'fixnow_last_role'

export function getLastSelectedRole(): 'customer' | 'technician' | null {
  try {
    const v = localStorage.getItem(LAST_ROLE_KEY)
    if (v === 'customer' || v === 'technician') return v
  } catch {
    /* ignore */
  }
  return null
}

export function setLastSelectedRole(role: 'customer' | 'technician') {
  try {
    localStorage.setItem(LAST_ROLE_KEY, role)
  } catch {
    /* ignore */
  }
}

function storage(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage
}

function scrubLegacyAccessTokens() {
  for (const s of [localStorage, sessionStorage]) {
    s.removeItem(ACCESS_KEY)
  }
}

/**
 * Fire-and-forget mirror into the native keystore. Imported lazily so the web
 * bundle does not pull Capacitor plugins into the critical path.
 */
function mirrorNative(clear = false) {
  void import('@fixnow/native')
    .then((native) => {
      if (clear) return native.clearSecureSession()
      return native.mirrorSessionToSecureStorage(tokenStorage)
    })
    .catch(() => undefined)
}

function emitSessionEvent(type: 'cleared' | 'updated') {
  try {
    window.dispatchEvent(new CustomEvent(`fixnow:session-${type}`))
  } catch {
    /* non-browser */
  }
}

export const tokenStorage = {
  getRemember(): boolean {
    return localStorage.getItem(REMEMBER_KEY) === '1'
  },

  setRemember(remember: boolean) {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
  },

  getAccessToken(): string | null {
    if (memoryAccessToken) return memoryAccessToken
    // One-time migration: pull legacy web-storage access tokens into memory, then scrub.
    const legacy = localStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(ACCESS_KEY)
    if (legacy) {
      memoryAccessToken = legacy
      scrubLegacyAccessTokens()
      return memoryAccessToken
    }
    return null
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY)
  },

  getUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StoredUser
    } catch {
      return null
    }
  },

  /** True when a refresh token exists and can restore an access token after reload. */
  hasRefreshSession(): boolean {
    return Boolean(this.getRefreshToken())
  },

  setSession(tokens: { accessToken: string; refreshToken: string }, user: StoredUser, remember = true) {
    this.setRemember(remember)
    const store = storage(remember)
    const other = remember ? sessionStorage : localStorage
    other.removeItem(REFRESH_KEY)
    other.removeItem(USER_KEY)
    scrubLegacyAccessTokens()

    memoryAccessToken = tokens.accessToken
    store.setItem(REFRESH_KEY, tokens.refreshToken)
    store.setItem(USER_KEY, JSON.stringify(user))
    mirrorNative(false)
    emitSessionEvent('updated')
  },

  updateTokens(tokens: { accessToken: string; refreshToken: string }) {
    const remember = this.getRemember()
    const store = storage(remember)
    scrubLegacyAccessTokens()
    memoryAccessToken = tokens.accessToken
    store.setItem(REFRESH_KEY, tokens.refreshToken)
    mirrorNative(false)
    emitSessionEvent('updated')
  },

  updateUser(user: StoredUser) {
    const remember = this.getRemember()
    storage(remember).setItem(USER_KEY, JSON.stringify(user))
    mirrorNative(false)
  },

  clear() {
    memoryAccessToken = null
    for (const s of [localStorage, sessionStorage]) {
      s.removeItem(ACCESS_KEY)
      s.removeItem(REFRESH_KEY)
      s.removeItem(USER_KEY)
    }
    mirrorNative(true)
    emitSessionEvent('cleared')
  },
}
