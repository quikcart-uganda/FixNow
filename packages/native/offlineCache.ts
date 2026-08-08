/**
 * Offline cache for read-mostly surfaces.
 *
 * Full offline-first is out of scope (the marketplace and payments must hit
 * the live API). What we do provide is a small cache so cold starts / brief
 * outages can still paint the last-known job list, conversation inbox and
 * technician profile instead of a blank error.
 *
 * CRITICAL: Dashboard `useAsync` settle is gated on these reads via
 * `withCachedLoader`. Cache I/O must NEVER hang — a stalled Capacitor
 * Preferences bridge (observed on web + Android) left every Home rail on
 * skeletons forever while Network already showed HTTP 200.
 *
 * Strategy:
 * - Web: synchronous localStorage only (no Capacitor Preferences).
 * - Native: Preferences with hard timeouts; fall back to in-memory on failure.
 * - Every public API hard-caps wait time so callers always settle.
 */

import { wrapCapPlugin, type CapPluginRef } from './capPlugin'
import { isNativePlatform } from './platform'

type PreferencesPlugin = {
  get: (options: { key: string }) => Promise<{ value: string | null }>
  set: (options: { key: string; value: string }) => Promise<void>
  remove: (options: { key: string }) => Promise<void>
}

const PREFIX = 'fixnow.cache.'
/** Preferences bridge can stall; never block UI settle on cache I/O. */
const PREFS_TIMEOUT_MS = 800
/** Absolute ceiling for any cacheGet/cacheSet/cacheRemove call. */
const CACHE_OP_BUDGET_MS = 1_000

type CacheEnvelope<T> = {
  savedAt: number
  ttlMs: number
  value: T
}

/** Process-local fallback when Preferences is unavailable or wedged. */
const memory = new Map<string, string>()

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(undefined)
    }, ms)
    promise
      .then((value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(undefined)
      })
  })
}

function budget<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, ms)
    promise
      .then((value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

function key(name: string) {
  return `${PREFIX}${name}`
}

function webGet(rawKey: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return memory.get(rawKey) ?? null
    return localStorage.getItem(rawKey) ?? memory.get(rawKey) ?? null
  } catch {
    return memory.get(rawKey) ?? null
  }
}

function webSet(rawKey: string, value: string): void {
  memory.set(rawKey, value)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(rawKey, value)
  } catch {
    /* quota / private mode — memory still holds it for this session */
  }
}

function webRemove(rawKey: string): void {
  memory.delete(rawKey)
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(rawKey)
  } catch {
    /* ignore */
  }
}

let prefsPlugin: PreferencesPlugin | null | undefined
let prefsInflight: Promise<CapPluginRef<PreferencesPlugin>> | null = null

/**
 * Resolve Capacitor Preferences once. On web we never touch it — the dynamic
 * `import('@capacitor/preferences')` has been observed to hang indefinitely
 * inside Vite's module graph while Home's useAsync awaits cacheGet, which
 * freezes every dashboard skeleton despite successful API responses.
 *
 * Always return a plain `{ plugin }` carrier — Preferences is a Capacitor
 * thenable and must never cross an await boundary bare.
 */
async function prefs(): Promise<CapPluginRef<PreferencesPlugin>> {
  if (!isNativePlatform()) return wrapCapPlugin<PreferencesPlugin>(null)
  if (prefsPlugin !== undefined) return wrapCapPlugin(prefsPlugin)
  if (prefsInflight) return prefsInflight

  prefsInflight = (async () => {
    try {
      const mod = await withTimeout(import('@capacitor/preferences'), PREFS_TIMEOUT_MS)
      if (!mod) {
        prefsPlugin = null
        return wrapCapPlugin<PreferencesPlugin>(null)
      }
      const wrapped = wrapCapPlugin(
        (mod as unknown as { Preferences: PreferencesPlugin }).Preferences,
      )
      prefsPlugin = wrapped.plugin
      return wrapped
    } catch {
      prefsPlugin = null
      return wrapCapPlugin<PreferencesPlugin>(null)
    } finally {
      prefsInflight = null
    }
  })()

  return prefsInflight
}

function parseEnvelope<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    const envelope = JSON.parse(raw) as CacheEnvelope<T>
    if (!envelope || typeof envelope.savedAt !== 'number') return null
    if (Date.now() - envelope.savedAt > (envelope.ttlMs || 0)) return null
    return envelope.value
  } catch {
    return null
  }
}

export async function cacheSet<T>(name: string, value: T, ttlMs = 15 * 60_000): Promise<void> {
  return budget(
    (async () => {
      let serialized: string
      try {
        serialized = JSON.stringify({ savedAt: Date.now(), ttlMs, value } satisfies CacheEnvelope<T>)
      } catch {
        return
      }

      // Always keep a sync web/memory copy so subsequent reads never depend on
      // a wedged native bridge.
      webSet(key(name), serialized)

      if (!isNativePlatform()) return

      const { plugin: p } = await prefs()
      if (!p) return
      try {
        await withTimeout(p.set({ key: key(name), value: serialized }), PREFS_TIMEOUT_MS)
      } catch {
        /* ignore */
      }
    })(),
    CACHE_OP_BUDGET_MS,
    undefined as void,
  )
}

export async function cacheGet<T>(name: string): Promise<T | null> {
  return budget(
    (async () => {
      const rawKey = key(name)

      // Fast path: sync localStorage / memory — never await Preferences first.
      const local = parseEnvelope<T>(webGet(rawKey))
      if (local != null) return local

      if (!isNativePlatform()) return null

      const { plugin: p } = await prefs()
      if (!p) return null
      try {
        const result = await withTimeout(p.get({ key: rawKey }), PREFS_TIMEOUT_MS)
        const value = result?.value
        if (!value) return null
        const envelope = JSON.parse(value) as CacheEnvelope<T>
        if (!envelope || typeof envelope.savedAt !== 'number') return null
        if (Date.now() - envelope.savedAt > (envelope.ttlMs || 0)) {
          void p.remove({ key: rawKey })
          webRemove(rawKey)
          return null
        }
        // Hydrate sync cache for next read.
        webSet(rawKey, value)
        return envelope.value
      } catch {
        return null
      }
    })(),
    CACHE_OP_BUDGET_MS,
    null,
  )
}

export async function cacheRemove(name: string): Promise<void> {
  return budget(
    (async () => {
      const rawKey = key(name)
      webRemove(rawKey)
      if (!isNativePlatform()) return
      const { plugin: p } = await prefs()
      if (!p) return
      try {
        await withTimeout(p.remove({ key: rawKey }), PREFS_TIMEOUT_MS)
      } catch {
        /* ignore */
      }
    })(),
    CACHE_OP_BUDGET_MS,
    undefined as void,
  )
}

/** Stable cache keys used by the role apps. Keep them short and versioned. */
export const CACHE_KEYS = {
  customerJobs: 'customer.jobs.v1',
  technicianFeed: 'technician.feed.v1',
  technicianDashboard: 'technician.dashboard.v1',
  conversations: 'conversations.v1',
  notifications: 'notifications.v1',
  technicianProfile: 'technician.profile.v1',
  customerOffersHome: 'customer.offers.home.v1',
  customerOffersRecent: 'customer.offers.recent.v1',
} as const

export function isNativeCachePreferred(): boolean {
  return isNativePlatform()
}
