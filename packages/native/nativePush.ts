/**
 * Native push bridge (Android FCM / iOS APNs).
 *
 * The existing web PushProvider owns badge counts, unread polling and device
 * registration against `/devices`. This module supplies the *native* pieces:
 *   - runtime permission request (Android 13+ POST_NOTIFICATIONS, iOS APNs)
 *   - FCM / APNs token acquisition and rotation
 *   - foreground notification receipt (payload only; OS shows nothing in fg)
 *   - notification tap -> deep link handoff
 *
 * It never calls the backend directly: `PushProvider` remains the only place
 * that talks to `notificationsApi`, so token lifecycle stays single-sourced.
 */

import { wrapCapPlugin, type CapPluginRef } from './capPlugin'
import { isNativePlatform, platformTag } from './platform'

export type NativePushPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export type NativePushPayload = {
  title?: string
  body?: string
  data: Record<string, unknown>
}

type PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

type PushPlugin = {
  checkPermissions: () => Promise<{ receive: PermissionState }>
  requestPermissions: () => Promise<{ receive: PermissionState }>
  register: () => Promise<void>
  removeAllListeners: () => Promise<void>
  removeAllDeliveredNotifications: () => Promise<void>
  createChannel?: (channel: Record<string, unknown>) => Promise<void>
  addListener: (event: string, cb: (payload: never) => void) => Promise<{ remove: () => Promise<void> }>
}

type Handlers = {
  onToken?: (token: string, platform: 'android' | 'ios') => void
  onForeground?: (payload: NativePushPayload) => void
  onTap?: (payload: NativePushPayload) => void
  onError?: (message: string) => void
}

let started = false
let currentToken: string | null = null
let pending: NativePushPayload | null = null
let handlers: Handlers = {}

async function plugin(): Promise<CapPluginRef<PushPlugin>> {
  if (!isNativePlatform()) return wrapCapPlugin<PushPlugin>(null)
  try {
    const mod = await import('@capacitor/push-notifications')
    return wrapCapPlugin(
      (mod as unknown as { PushNotifications: PushPlugin }).PushNotifications,
    )
  } catch {
    return wrapCapPlugin<PushPlugin>(null)
  }
}

function toPayload(raw: Record<string, unknown> | undefined): NativePushPayload {
  const notification = (raw ?? {}) as {
    title?: string
    body?: string
    data?: Record<string, unknown>
  }
  return {
    title: notification.title,
    body: notification.body,
    data: notification.data ?? {},
  }
}

export function getNativePushToken(): string | null {
  return currentToken
}

/**
 * A tap that arrived before React mounted (cold start from a notification).
 * Consumed once by the deep link hook.
 */
export function takePendingPushTap(): NativePushPayload | null {
  const value = pending
  pending = null
  return value
}

export async function getNativePushPermission(): Promise<NativePushPermission> {
  const { plugin: p } = await plugin()
  if (!p) return 'unsupported'
  try {
    const result = await p.checkPermissions()
    if (result.receive === 'granted') return 'granted'
    if (result.receive === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}

/**
 * Ask the OS for notification permission, then register with FCM/APNs.
 * Resolves to the final permission state; the token arrives asynchronously
 * through `onToken`.
 */
export async function requestNativePushPermission(): Promise<NativePushPermission> {
  const { plugin: p } = await plugin()
  if (!p) return 'unsupported'
  try {
    const current = await p.checkPermissions()
    const result = current.receive === 'granted' ? current : await p.requestPermissions()
    if (result.receive !== 'granted') {
      return result.receive === 'denied' ? 'denied' : 'prompt'
    }
    await p.register()
    return 'granted'
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err.message : 'Push registration failed')
    return 'denied'
  }
}

/** Clear the OS notification tray + app icon badge. */
export async function clearNativeNotifications(): Promise<void> {
  const { plugin: p } = await plugin()
  if (!p) return
  try {
    await p.removeAllDeliveredNotifications()
  } catch {
    /* ignore */
  }
}

export async function initNativePush(next: Handlers): Promise<void> {
  handlers = { ...handlers, ...next }
  if (started || !isNativePlatform()) return
  const { plugin: p } = await plugin()
  if (!p) return
  started = true

  const tag = platformTag()
  const nativePlatform: 'android' | 'ios' = tag === 'ios' ? 'ios' : 'android'

  try {
    // Android 8+ requires an explicit high-importance channel for heads-up
    // delivery; FCM `android.notification.channel_id` must match this id.
    if (nativePlatform === 'android' && p.createChannel) {
      await p.createChannel({
        id: 'fixnow_default',
        name: 'FixNow alerts',
        description: 'Jobs, messages, payments and escrow updates',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
      })
    }
  } catch {
    /* channel creation is best-effort */
  }

  await p.addListener('registration', ((token: { value: string }) => {
    currentToken = token.value
    handlers.onToken?.(token.value, nativePlatform)
    window.dispatchEvent(
      new CustomEvent('fixnow:push-token', { detail: { token: token.value, platform: nativePlatform } }),
    )
  }) as never)

  await p.addListener('registrationError', ((err: { error?: string }) => {
    handlers.onError?.(err?.error ?? 'Push registration error')
  }) as never)

  await p.addListener('pushNotificationReceived', ((notification: Record<string, unknown>) => {
    const payload = toPayload(notification)
    handlers.onForeground?.(payload)
    window.dispatchEvent(new CustomEvent('fixnow:push-foreground', { detail: payload }))
  }) as never)

  await p.addListener('pushNotificationActionPerformed', ((action: {
    notification?: Record<string, unknown>
  }) => {
    const payload = toPayload(action?.notification)
    if (handlers.onTap) handlers.onTap(payload)
    else pending = payload
    window.dispatchEvent(new CustomEvent('fixnow:push-tap', { detail: payload }))
  }) as never)

  // If permission was already granted in a previous session, re-register so the
  // token is refreshed (tokens rotate on reinstall, restore and app-data clear).
  const permission = await getNativePushPermission()
  if (permission === 'granted') {
    try {
      await p.register()
    } catch {
      /* ignore */
    }
  }
}
