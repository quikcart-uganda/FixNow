/**
 * Warms the caches the customer Home surface reads, so Home paints with content
 * instead of empty skeletons right after the splash hands off.
 *
 * Design constraints:
 * - Best-effort only. Every failure is swallowed; the app still starts.
 * - Time-boxed. Never blocks startup beyond `budgetMs`.
 * - No business-logic changes. It calls the exact same public endpoints and the
 *   same mappers Home uses, and writes to the same cache keys, so Home's
 *   existing stale-while-revalidate `useAsync` hits a warm cache.
 */

type PrefetchOptions = {
  /** Only the customer/platform cold path benefits from customer content. */
  role?: 'platform' | 'customer' | 'technician' | 'admin'
  /** Hard cap; the returned promise always settles within this window. */
  budgetMs?: number
}

const DEFAULT_BUDGET_MS = 1800

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(undefined)
      })
  })
}

let inflight: Promise<void> | null = null

async function run(): Promise<void> {
  // Dynamic imports keep the splash module free of static api/native deps and
  // avoid any load-time import cycles.
  const [api, native] = await Promise.all([
    import('@fixnow/api').catch(() => null),
    import('@fixnow/native').catch(() => null),
  ])
  if (!api) return

  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  if (!online) return

  const save = native?.saveCachedData
  const cacheSet = native?.cacheSet
  const CACHE_KEYS = native?.CACHE_KEYS
  const DATA_CACHE_KEYS = native?.DATA_CACHE_KEYS
  const district = 'Kampala'

  const tasks: Promise<unknown>[] = []

  // Categories → same mapped shape + key Home stores.
  tasks.push(
    (async () => {
      try {
        const res = await api.categoriesApi.list({ limit: 100 })
        const mapped = (Array.isArray(res.data.items) ? res.data.items : []).map(api.mapCategory)
        await save?.(DATA_CACHE_KEYS?.categories ?? 'categories.v1', mapped)
      } catch {
        /* best-effort */
      }
    })(),
  )

  // Top technicians → district-suffixed key Home reads (plus flat legacy key).
  tasks.push(
    (async () => {
      try {
        const res = await api.technicianApi.search({
          limit: 12,
          sort: '-trustScore',
          district,
          placement: 'homepage',
        })
        const mapped = (Array.isArray(res.data.items) ? res.data.items : []).map(api.mapCustomerTechnicianCard)
        const base = DATA_CACHE_KEYS?.customerHomeTechnicians ?? 'customer.home.technicians.v1'
        await save?.(`${base}:${district}:any`, mapped)
        await save?.(base, mapped)
      } catch {
        /* best-effort */
      }
    })(),
  )

  // Public offers home feed → district-suffixed key Home reads.
  tasks.push(
    (async () => {
      try {
        const res = await api.offersApi.homeFeed({ district })
        const base = DATA_CACHE_KEYS?.customerHomeOffers ?? 'customer.home.v1:offers'
        await save?.(`${base}:${district}`, res.data)
        await save?.(base, res.data)
        if (cacheSet && CACHE_KEYS?.customerOffersHome) {
          await cacheSet(CACHE_KEYS.customerOffersHome, res.data, 20 * 60_000)
        }
      } catch {
        /* best-effort */
      }
    })(),
  )

  // Customer marketing delivery → same key Home stores.
  tasks.push(
    (async () => {
      try {
        const res = await api.marketingApi.deliverCustomer({ placement: 'home' })
        await save?.(DATA_CACHE_KEYS?.customerHomeMarketing ?? 'customer.home.v1:marketing', res.data)
      } catch {
        /* best-effort */
      }
    })(),
  )

  await Promise.allSettled(tasks)
}

/**
 * Kick off (or reuse) the essential-content prefetch. Resolves when the work
 * settles or the time budget elapses — whichever comes first.
 */
export function prefetchEssentialContent(options: PrefetchOptions = {}): Promise<void> {
  const role = options.role ?? 'platform'
  if (role === 'technician' || role === 'admin') {
    return Promise.resolve()
  }
  if (!inflight) {
    inflight = run().finally(() => {
      /* keep the resolved promise cached so repeat calls are cheap */
    })
  }
  return withTimeout(inflight, options.budgetMs ?? DEFAULT_BUDGET_MS).then(() => undefined)
}
