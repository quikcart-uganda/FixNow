/**
 * Native secure credential storage.
 *
 * On Android/iOS auth tokens are mirrored into the platform keystore
 * (Android Keystore / iOS Keychain). Web access tokens stay memory-only
 * (`packages/api/tokenStorage.ts`); the keystore rehydrates them on cold start.
 *
 * CRITICAL: Never `return SecureStorage` from an async function. Capacitor
 * plugin proxies are thenables whose `.then()` is unimplemented — Promise
 * adoption hangs forever and leaves Android on a permanent white screen.
 */

import { isNativePlatform } from './platform'
import { wrapCapPlugin, type CapPluginRef } from './capPlugin'

const SERVICE = 'fixnow'

type SecureStoragePlugin = {
  setSync?: (key: string, value: string) => void
  get: (key: string, convertDate?: boolean, sync?: boolean) => Promise<unknown>
  set: (key: string, value: unknown, convertDate?: boolean, sync?: boolean) => Promise<void>
  remove: (key: string, sync?: boolean) => Promise<boolean>
  keys: (sync?: boolean) => Promise<string[]>
  setSynchronize?: (sync: boolean) => Promise<void>
}

let pluginPromise: Promise<CapPluginRef<SecureStoragePlugin>> | null = null

function loadPlugin(): Promise<CapPluginRef<SecureStoragePlugin>> {
  if (!isNativePlatform()) return Promise.resolve(wrapCapPlugin<SecureStoragePlugin>(null))
  if (!pluginPromise) {
    pluginPromise = import('@aparajita/capacitor-secure-storage')
      .then((mod) => {
        const p = (mod as { SecureStorage?: SecureStoragePlugin }).SecureStorage ?? null
        return wrapCapPlugin(p)
      })
      .catch(() => wrapCapPlugin<SecureStoragePlugin>(null))
  }
  return pluginPromise
}

function scoped(key: string) {
  return `${SERVICE}.${key}`
}

export const secureStorage = {
  /** True when running on a platform with a hardware-backed keystore. */
  isAvailable(): boolean {
    return isNativePlatform()
  },

  async get(key: string): Promise<string | null> {
    try {
      const { plugin: p } = await loadPlugin()
      if (!p) return null
      const value = await p.get(scoped(key))
      return typeof value === 'string' ? value : value == null ? null : String(value)
    } catch {
      return null
    }
  },

  async set(key: string, value: string): Promise<void> {
    try {
      const { plugin: p } = await loadPlugin()
      if (!p) return
      await p.set(scoped(key), value)
    } catch {
      /* keystore unavailable (e.g. no device credential set) — web store still holds the session */
    }
  },

  async remove(key: string): Promise<void> {
    try {
      const { plugin: p } = await loadPlugin()
      if (!p) return
      await p.remove(scoped(key))
    } catch {
      /* ignore */
    }
  },

  async clear(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.remove(k)))
  },
}
