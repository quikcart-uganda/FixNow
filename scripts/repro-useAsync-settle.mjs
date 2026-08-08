/**
 * Reproduce useAsync / withCachedLoader settle-path hang scenarios (Node, no React).
 * Run: node scripts/repro-useAsync-settle.mjs
 */
import { performance } from 'node:perf_hooks'

const PREFS_TIMEOUT_MS = 1_500

function withTimeout(promise, ms) {
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

/** Mirrors dataCache.withCachedLoader critical awaits (simplified). */
async function withCachedLoader(options) {
  const cached = await options.readCache()
  const preferCache = Boolean(options.preferCache)
  const hasUsable = cached != null && !(Array.isArray(cached) && cached.length === 0)
  if (hasUsable && preferCache) {
    if (options.online) {
      void options.loader().then((fresh) => options.onBackgroundUpdate?.(fresh)).catch(() => undefined)
    }
    return { data: cached, fromCache: true }
  }
  const data = await options.loader()
  return { data, fromCache: false }
}

/** Mirrors useAsync reload settle when cacheKey is set. */
async function simulateUseAsyncReload({
  label,
  dynamicImport,
  loader,
  readCache,
  abortIgnoresSignal = true,
}) {
  let requestId = 0
  let status = 'loading'
  const id = ++requestId
  const controller = new AbortController()
  const t0 = performance.now()

  const settle = (next) => {
    if (id !== requestId) return 'superseded'
    status = Array.isArray(next) && next.length === 0 ? 'empty' : 'success'
    return status
  }

  try {
    // HANG RISK: no timeout around dynamic import in useAsync.ts
    const native = await dynamicImport()
    if (id !== requestId) {
      return { label, ms: performance.now() - t0, status: 'superseded-after-import', final: status }
    }
    const run = () => loader(controller.signal)
    const packed = await native.withCachedLoader({
      key: 'repro',
      loader: run,
      preferCache: true,
      online: true,
      readCache,
      onBackgroundUpdate: () => {},
    })
    if (id !== requestId) {
      return { label, ms: performance.now() - t0, status: 'superseded-after-loader', final: status }
    }
    settle(packed.data)
    return { label, ms: performance.now() - t0, status: 'ok', final: status, fromCache: packed.fromCache }
  } catch (err) {
    status = 'error'
    return { label, ms: performance.now() - t0, status: 'threw', error: String(err?.message || err), final: status }
  } finally {
    if (abortIgnoresSignal) {
      // abort does nothing to loader — mirrors HomePage omitting signal
    }
  }
}

function never() {
  return new Promise(() => {})
}

async function main() {
  const results = []

  // 1) Happy path
  results.push(
    await simulateUseAsyncReload({
      label: 'happy-path',
      dynamicImport: async () => ({ withCachedLoader }),
      readCache: async () => null,
      loader: async () => [{ id: 1 }],
    }),
  )

  // 2) Dynamic import hang (no timeout) — useAsync stays "loading" forever
  const hangImport = simulateUseAsyncReload({
    label: 'hang-dynamic-import',
    dynamicImport: never,
    readCache: async () => null,
    loader: async () => [{ id: 1 }],
  })
  const racedImport = await Promise.race([
    hangImport.then((r) => r),
    new Promise((resolve) => setTimeout(() => resolve({ label: 'hang-dynamic-import', status: 'STILL_LOADING', note: 'import never settled in 2s' }), 2000)),
  ])
  results.push(racedImport)

  // 3) Preferences-style hang mitigated by withTimeout (offlineCache)
  const tPrefs = performance.now()
  const prefsResult = await withTimeout(never(), PREFS_TIMEOUT_MS)
  results.push({
    label: 'prefs-timeout',
    ms: performance.now() - tPrefs,
    status: prefsResult === undefined ? 'timed_out_ok' : 'unexpected',
  })

  // 4) AbortSignal not passed: abort does not reject loader → requestId guard needed
  let resolvedAfterAbort = false
  const controller = new AbortController()
  const ignoredSignalLoader = (signal) =>
    new Promise((resolve) => {
      // BUG SHAPE: callers that ignore `signal` never reject on abort
      void signal
      setTimeout(() => {
        resolvedAfterAbort = true
        resolve([{ id: 2 }])
      }, 100)
    })
  const p = ignoredSignalLoader(controller.signal)
  controller.abort()
  const data = await p
  results.push({
    label: 'abort-ignored-by-loader',
    status: resolvedAfterAbort ? 'loader_still_resolved' : 'aborted',
    note: 'HomePage/apiGet omit signal — abort alone cannot clear loading; completion or requestId bump must',
    dataLen: data.length,
  })

  // 5) Cache hit + background refresh: foreground settles immediately
  results.push(
    await simulateUseAsyncReload({
      label: 'swr-cache-hit',
      dynamicImport: async () => ({ withCachedLoader }),
      readCache: async () => [{ id: 'cached' }],
      loader: never, // background only — must not block settle
    }),
  )

  console.log(JSON.stringify(results, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
