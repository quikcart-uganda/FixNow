/**
 * Stale-while-revalidate helpers for mobile read surfaces.
 *
 * `cacheGet` expires aggressively; these helpers keep a longer stale window so
 * cold starts / brief outages can still paint the last-known dashboard,
 * conversations, notifications and jobs while a background refresh runs.
 */

import { cacheGet, cacheRemove, cacheSet, CACHE_KEYS } from './offlineCache'

export { CACHE_KEYS }

/** Extended keys for profile + admin/customer surfaces. */
export const DATA_CACHE_KEYS = {
  ...CACHE_KEYS,
  userProfile: 'user.profile.v1',
  customerProfile: 'customer.profile.v1',
  customerHome: 'customer.home.v1',
  customerHomeTechnicians: 'customer.home.technicians.v1',
  customerHomeOffers: 'customer.home.v1:offers',
  customerHomeMarketing: 'customer.home.v1:marketing',
  customerJobs: 'customer.jobs.v1',
  technicianFeed: 'technician.feed.v1',
  technicianDashboard: 'technician.dashboard.v1',
  technicianDashboardMarketing: 'technician.dashboard.marketing.v1',
  technicianAssigned: 'technician.assigned.v1',
  technicianProfile: 'technician.profile.v1',
  conversations: 'conversations.v1',
  notifications: 'notifications.v1',
  categories: 'categories.v1',
  adminDashboard: 'admin.dashboard.v1',
} as const

const DEFAULT_FRESH_MS = 5 * 60_000
const DEFAULT_STALE_MS = 24 * 60 * 60_000

type StaleEnvelope<T> = {
  savedAt: number
  value: T
}

/**
 * Persist a payload with a long absolute TTL so `cacheGet` does not drop it
 * during multi-hour offline windows. Freshness is decided by callers.
 */
export async function saveCachedData<T>(name: string, value: T): Promise<void> {
  await cacheSet(name, { savedAt: Date.now(), value } satisfies StaleEnvelope<T>, DEFAULT_STALE_MS)
}

export type CachedRead<T> = {
  value: T | null
  savedAt: number | null
  fresh: boolean
  stale: boolean
}

export async function readCachedData<T>(
  name: string,
  freshMs = DEFAULT_FRESH_MS,
): Promise<CachedRead<T>> {
  const envelope = await cacheGet<StaleEnvelope<T>>(name)
  if (!envelope || envelope.value == null) {
    return { value: null, savedAt: null, fresh: false, stale: false }
  }
  const age = Date.now() - (envelope.savedAt || 0)
  return {
    value: envelope.value,
    savedAt: envelope.savedAt,
    fresh: age <= freshMs,
    stale: age > freshMs,
  }
}

export async function clearCachedData(name: string): Promise<void> {
  await cacheRemove(name)
}

export async function clearRoleCaches(): Promise<void> {
  // Dedupe: CACHE_KEYS is spread into DATA_CACHE_KEYS, and Home also used
  // suffix keys that must clear on logout / role switch.
  const keys = [...new Set(Object.values(DATA_CACHE_KEYS))]
  await Promise.all(keys.map((k) => cacheRemove(k)))
}

/** Empty arrays/objects must not lock the UI into a permanent empty state. */
function isEmptyCacheValue(value: unknown): boolean {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const values = Object.values(value as Record<string, unknown>)
    if (values.length === 0) return true
    // Offer home-feed: every value is an empty array.
    if (values.every((v) => Array.isArray(v) && v.length === 0)) return true
    // Marketing delivery: `{ channel, promotions:[], advertisements:[], … }`.
    // Non-array fields (e.g. channel string) must not make an empty feed look "usable".
    const arrayFields = values.filter((v) => Array.isArray(v))
    if (arrayFields.length > 0 && arrayFields.every((v) => (v as unknown[]).length === 0)) {
      return true
    }
  }
  return false
}

/**
 * Run a loader with stale-while-revalidate semantics.
 * - Prefer cache on mount only when the cached value is non-empty.
 * - Empty caches never short-circuit when online (forces a real fetch).
 * - `preferCache: false` (Retry/pull-to-refresh) always hits the network when online.
 * - Background refreshes call `onBackgroundUpdate` so React state can catch up.
 */
function persistCache<T>(key: string, data: T) {
  // Never await Preferences writes on the critical path — a stalled native
  // bridge would leave useAsync stuck on "loading" after the network 200.
  void saveCachedData(key, data).catch(() => undefined)
}

export async function withCachedLoader<T>(options: {
  key: string
  loader: () => Promise<T>
  freshMs?: number
  online?: boolean
  preferCache?: boolean
  onBackgroundUpdate?: (data: T) => void
}): Promise<{ data: T; fromCache: boolean; stale: boolean }> {
  const online = options.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine)
  const preferCache = Boolean(options.preferCache)

  // Never let a wedged Preferences/localStorage read block the network path.
  // A hung cacheGet was the root cause of infinite Home skeletons after HTTP 200.
  const cached = await Promise.race([
    readCachedData<T>(options.key, options.freshMs),
    new Promise<CachedRead<T>>((resolve) => {
      setTimeout(
        () => resolve({ value: null, savedAt: null, fresh: false, stale: false }),
        1_000,
      )
    }),
  ])
  const hasUsableCache = cached.value != null && !isEmptyCacheValue(cached.value)

  // Retry / explicit refresh: always go to the network when online.
  if (!preferCache && online) {
    try {
      const data = await options.loader()
      persistCache(options.key, data)
      return { data, fromCache: false, stale: false }
    } catch (err) {
      if (cached.value != null) {
        return { data: cached.value, fromCache: true, stale: true }
      }
      throw err
    }
  }

  // Mount path: paint non-empty cache immediately, then refresh in the background.
  if (hasUsableCache && (preferCache || cached.fresh || !online)) {
    if (online && (cached.stale || preferCache)) {
      void options
        .loader()
        .then((fresh) => {
          persistCache(options.key, fresh)
          options.onBackgroundUpdate?.(fresh)
        })
        .catch(() => undefined)
    }
    return { data: cached.value as T, fromCache: true, stale: cached.stale }
  }

  if (!online && cached.value != null) {
    return { data: cached.value, fromCache: true, stale: true }
  }

  try {
    const data = await options.loader()
    persistCache(options.key, data)
    return { data, fromCache: false, stale: false }
  } catch (err) {
    if (cached.value != null) {
      return { data: cached.value, fromCache: true, stale: true }
    }
    throw err
  }
}
