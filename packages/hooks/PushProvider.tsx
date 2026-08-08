import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { notificationsApi } from '@fixnow/api'
import { useAuth } from './AuthProvider'

const DEVICE_ID_KEY = 'fixnow_device_id'
const TOKEN_KEY = 'fixnow_push_token'

type PushContextValue = {
  permission: NotificationPermission | 'unsupported' | 'granted' | 'denied' | 'prompt'
  unreadCount: number
  registering: boolean
  lastError: string | null
  requestPermissionAndRegister: () => Promise<void>
  refreshBadge: () => Promise<void>
  markAllRead: () => Promise<void>
}

const PushContext = createContext<PushContextValue | null>(null)

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return `web-ephemeral-${Date.now()}`
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

async function resolveWebPushToken(
  deviceId: string,
): Promise<{ token: string; meta?: Record<string, unknown> }> {
  const injected = import.meta.env.VITE_FCM_WEB_TOKEN as string | undefined
  if (injected && injected.length > 8) {
    return { token: injected, meta: { provider: 'fcm-web-injected' } }
  }

  const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined
  if (vapidKey && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        })
      }
      return {
        token: sub.endpoint,
        meta: { provider: 'web-push-vapid', subscription: sub.toJSON() },
      }
    } catch {
      /* fall through to local token */
    }
  }

  return {
    token: `web:local:${deviceId}`,
    meta: { provider: 'local-web' },
  }
}

function setDocumentBadge(count: number) {
  if (typeof document === 'undefined') return
  const base = document.title.replace(/^\(\d+\)\s*/, '')
  document.title = count > 0 ? `(${count}) ${base}` : base
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  if (count > 0 && typeof nav.setAppBadge === 'function') {
    void nav.setAppBadge(count)
  } else if (count === 0 && typeof nav.clearAppBadge === 'function') {
    void nav.clearAppBadge()
  }
}

function showForegroundNotification(title: string, body: string, tag?: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState !== 'visible') return
  try {
    new Notification(title, {
      body,
      tag: tag || 'fixnow',
    })
  } catch {
    /* Ignore browsers that require a service worker for Notification display. */
  }
}

async function registerNativeOrWebToken(opts: {
  token: string
  platform: 'web' | 'android' | 'ios'
  deviceId: string
  meta?: Record<string, unknown>
}) {
  const previous = localStorage.getItem(TOKEN_KEY)
  if (previous && previous !== opts.token) {
    await notificationsApi.refreshDevice({
      oldToken: previous,
      newToken: opts.token,
      platform: opts.platform,
      deviceId: opts.deviceId,
    })
  } else {
    await notificationsApi.registerDevice({
      token: opts.token,
      platform: opts.platform,
      deviceId: opts.deviceId,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
      meta: opts.meta,
    })
  }
  localStorage.setItem(TOKEN_KEY, opts.token)
}

export async function unregisterPushDevice(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY)
  const deviceId = localStorage.getItem(DEVICE_ID_KEY) ?? undefined
  if (!token && !deviceId) return
  try {
    await notificationsApi.removeDevice({ token: token ?? undefined, deviceId })
  } catch {
    /* best-effort */
  }
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function PushProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [permission, setPermission] = useState<PushContextValue['permission']>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [unreadCount, setUnreadCount] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const refreshBadge = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      setDocumentBadge(0)
      return
    }
    // Skip background polling while the tab is hidden — saves rate-limit budget.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const res = await notificationsApi.list({ limit: 1 })
      const count = res.data.unreadCount ?? 0
      setUnreadCount(count)
      setDocumentBadge(count)
      try {
        const { clearNativeNotifications, saveCachedData, DATA_CACHE_KEYS } = await import('@fixnow/native')
        if (count === 0) await clearNativeNotifications()
        await saveCachedData(DATA_CACHE_KEYS.notifications, { unreadCount: count })
      } catch {
        /* ignore */
      }
    } catch {
      // Fall back to last cached badge when offline.
      try {
        const { readCachedData, DATA_CACHE_KEYS } = await import('@fixnow/native')
        const cached = await readCachedData<{ unreadCount?: number }>(DATA_CACHE_KEYS.notifications)
        if (typeof cached.value?.unreadCount === 'number') {
          setUnreadCount(cached.value.unreadCount)
          setDocumentBadge(cached.value.unreadCount)
        }
      } catch {
        /* ignore */
      }
    }
  }, [isAuthenticated])

  const registerCurrentToken = useCallback(async () => {
    if (!isAuthenticated) return
    setRegistering(true)
    setLastError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      let usedNative = false
      try {
        const native = await import('@fixnow/native')
        if (native.isNativePlatform()) {
          const token = native.getNativePushToken()
          const platform = native.platformTag()
          if (token && (platform === 'android' || platform === 'ios')) {
            await registerNativeOrWebToken({
              token,
              platform,
              deviceId,
              meta: { provider: platform === 'ios' ? 'apns' : 'fcm' },
            })
            usedNative = true
          }
        }
      } catch {
        /* fall through to web strategy */
      }

      if (!usedNative) {
        const { token, meta } = await resolveWebPushToken(deviceId)
        await registerNativeOrWebToken({ token, platform: 'web', deviceId, meta })
      }
    } catch (err) {
      setLastError("We couldn't turn on notifications on this device. Try again from your device settings.")
    } finally {
      setRegistering(false)
    }
  }, [isAuthenticated])

  const requestPermissionAndRegister = useCallback(async () => {
    try {
      const native = await import('@fixnow/native')
      if (native.isNativePlatform()) {
        const next = await native.requestNativePushPermission()
        setPermission(next === 'unsupported' ? 'unsupported' : next)
        await registerCurrentToken()
        return
      }
    } catch {
      /* fall through */
    }

    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
      await registerCurrentToken()
      return
    }
    const next = await Notification.requestPermission()
    setPermission(next)
    await registerCurrentToken()
  }, [registerCurrentToken])

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead()
    try {
      const { markAllLocalNotificationsRead } = await import('@fixnow/native')
      await markAllLocalNotificationsRead()
    } catch {
      /* ignore */
    }
    await refreshBadge()
  }, [refreshBadge])

  useEffect(() => {
    if (!isAuthenticated) return
    void registerCurrentToken()
    void refreshBadge()
    const onFocus = () => void refreshBadge()
    const onResume = () => void refreshBadge()
    const onToken = () => void registerCurrentToken()
    const onForeground = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string; body?: string; data?: Record<string, unknown> }>).detail
      void (async () => {
        try {
          const { rememberNotification, announce } = await import('@fixnow/native')
          const result = await rememberNotification({
            title: detail?.title,
            body: detail?.body,
            data: detail?.data,
          })
          if (!result.accepted) return
          if (detail?.title) {
            showForegroundNotification(detail.title, detail.body ?? '', result.item?.group)
            announce(`${detail.title}. ${detail.body ?? ''}`)
          }
        } catch {
          if (detail?.title) showForegroundNotification(detail.title, detail.body ?? '')
        }
        void refreshBadge()
      })()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('fixnow:app-resume', onResume)
    window.addEventListener('fixnow:push-token', onToken)
    window.addEventListener('fixnow:push-foreground', onForeground)
    const interval = window.setInterval(() => void refreshBadge(), 120_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('fixnow:app-resume', onResume)
      window.removeEventListener('fixnow:push-token', onToken)
      window.removeEventListener('fixnow:push-foreground', onForeground)
      window.clearInterval(interval)
    }
  }, [isAuthenticated, registerCurrentToken, refreshBadge])

  useEffect(() => {
    ;(window as unknown as { __fixnowShowPush?: typeof showForegroundNotification }).__fixnowShowPush =
      typeof import.meta !== 'undefined' && import.meta.env?.DEV ? showForegroundNotification : undefined
    return () => {
      delete (window as unknown as { __fixnowShowPush?: unknown }).__fixnowShowPush
    }
  }, [])

  const value = useMemo(
    () => ({
      permission,
      unreadCount,
      registering,
      lastError,
      requestPermissionAndRegister,
      refreshBadge,
      markAllRead,
    }),
    [
      permission,
      unreadCount,
      registering,
      lastError,
      requestPermissionAndRegister,
      refreshBadge,
      markAllRead,
    ],
  )

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush() {
  const ctx = useContext(PushContext)
  if (!ctx) throw new Error('usePush must be used within PushProvider')
  return ctx
}
