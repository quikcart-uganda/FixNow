/**
 * Native network status bridge.
 *
 * WebView `navigator.onLine` is unreliable on Android/iOS: it can report
 * `true` on a captive portal, and on Android it frequently fails to fire
 * `online`/`offline` when the radio switches between Wi-Fi and cellular.
 *
 * This bridge listens to the Capacitor Network plugin and re-dispatches the
 * canonical `online` / `offline` window events, so every existing consumer
 * (`useNetworkStatus`, `socketClient.bindBrowserNetwork`, the splash gate,
 * the offline banner) keeps working unchanged on native.
 */

import { isNativePlatform } from './platform'

export type ConnectionType = 'wifi' | 'cellular' | 'none' | 'unknown'

export type NativeNetworkState = {
  connected: boolean
  connectionType: ConnectionType
}

type NetworkPlugin = {
  getStatus: () => Promise<{ connected: boolean; connectionType: string }>
  addListener: (
    event: 'networkStatusChange',
    cb: (status: { connected: boolean; connectionType: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }>
}

let state: NativeNetworkState = { connected: true, connectionType: 'unknown' }
const listeners = new Set<(s: NativeNetworkState) => void>()
let started = false

function normalize(type: string): ConnectionType {
  if (type === 'wifi' || type === 'cellular' || type === 'none') return type
  return 'unknown'
}

function publishToApiLayer(connected: boolean) {
  try {
    const host =
      typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? (globalThis as { __FIXNOW_NET__?: { connected: boolean; source: string; updatedAt: number } })
          : null
    if (!host) return
    host.__FIXNOW_NET__ = {
      connected,
      source: 'native',
      updatedAt: Date.now(),
    }
  } catch {
    /* ignore */
  }
}

export function getNetworkState(): NativeNetworkState {
  return state
}

export function subscribeNetwork(cb: (s: NativeNetworkState) => void): () => void {
  listeners.add(cb)
  cb(state)
  return () => listeners.delete(cb)
}

function emit(next: NativeNetworkState) {
  const transportChanged = next.connectionType !== state.connectionType
  const connectivityChanged = next.connected !== state.connected
  state = next
  publishToApiLayer(next.connected)
  listeners.forEach((fn) => fn(next))

  if (typeof window === 'undefined') return

  if (connectivityChanged) {
    window.dispatchEvent(new Event(next.connected ? 'online' : 'offline'))
  } else if (transportChanged && next.connected) {
    window.dispatchEvent(new Event('online'))
  }
}

export async function initNativeNetwork(): Promise<void> {
  if (started || !isNativePlatform()) return
  started = true
  try {
    const mod = await import('@capacitor/network')
    const Network = (mod as unknown as { Network: NetworkPlugin }).Network
    const initial = await Network.getStatus()
    state = { connected: initial.connected, connectionType: normalize(initial.connectionType) }
    publishToApiLayer(state.connected)
    listeners.forEach((fn) => fn(state))
    await Network.addListener('networkStatusChange', (status) => {
      emit({ connected: status.connected, connectionType: normalize(status.connectionType) })
    })
  } catch {
    started = false
  }
}
