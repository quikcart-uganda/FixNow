import { useCallback, useEffect, useRef, useState } from 'react'
import { getFriendlyErrorPresentation } from '@fixnow/api'

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error' | 'empty'

/** Cache/import path must never block settle longer than this. */
const CACHE_PATH_BUDGET_MS = 2_500

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cache_path_timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export function useAsync<T>(
  loader: (signal?: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  options?: {
    enabled?: boolean
    isEmpty?: (data: T) => boolean
    /** Preferences cache key — enables stale-while-revalidate on mobile/web. */
    cacheKey?: string
    /** Treat cache younger than this as fresh (ms). Default 5 minutes. */
    cacheFreshMs?: number
  },
) {
  const enabled = options?.enabled !== false
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorTitle, setErrorTitle] = useState<string | null>(null)
  const [status, setStatus] = useState<AsyncStatus>(enabled ? 'loading' : 'idle')
  const [fromCache, setFromCache] = useState(false)
  const requestId = useRef(0)
  const dataRef = useRef<T | null>(null)
  dataRef.current = data
  const abortRef = useRef<AbortController | null>(null)
  const cacheKey = options?.cacheKey
  const cacheFreshMs = options?.cacheFreshMs
  const isEmpty = options?.isEmpty
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const reloadFnRef = useRef<(opts?: { preferCache?: boolean }) => Promise<T | null>>(async () => null)

  const reload = useCallback(
    async (opts?: { preferCache?: boolean }) => {
      if (!enabled) return null
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const id = ++requestId.current
      if (dataRef.current == null) setStatus('loading')
      setError(null)
      setErrorTitle(null)

      const settle = (next: T, cached: boolean) => {
        if (id !== requestId.current) return null
        setData(next)
        setFromCache(cached)
        const empty = isEmpty ? isEmpty(next) : Array.isArray(next) && next.length === 0
        setStatus(empty ? 'empty' : 'success')
        return next
      }

      try {
        let result: T
        let cached = false
        const run = () => loaderRef.current(controller.signal)
        if (cacheKey) {
          try {
            const { withCachedLoader } = await withBudget(
              import('@fixnow/native') as Promise<typeof import('@fixnow/native')>,
              CACHE_PATH_BUDGET_MS,
            )
            if (id !== requestId.current) return null
            const packed = await withCachedLoader<T>({
              key: cacheKey,
              loader: run,
              freshMs: cacheFreshMs,
              preferCache: opts?.preferCache,
              onBackgroundUpdate: (fresh) => {
                void settle(fresh, false)
              },
            })
            result = packed.data
            cached = packed.fromCache
          } catch (cacheErr) {
            const msg = cacheErr instanceof Error ? cacheErr.message : ''
            if (msg === 'superseded_before_cache' || id !== requestId.current) return null
            const cancelled =
              controller.signal.aborted ||
              (cacheErr instanceof DOMException && cacheErr.name === 'AbortError') ||
              (cacheErr instanceof Error && /cancel|abort/i.test(cacheErr.message))
            if (cancelled) throw cacheErr
            result = await run()
            cached = false
          }
        } else {
          result = await run()
        }
        if (id !== requestId.current) return null
        return settle(result, cached)
      } catch (err) {
        if (id !== requestId.current) return null
        const cancelled =
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && /cancel/i.test(err.message))
        if (cancelled) {
          if (dataRef.current == null && id === requestId.current) {
            setErrorTitle("Couldn't finish loading")
            setError('Pull to refresh or try again.')
            setStatus('error')
          }
          return null
        }
        const presentation = getFriendlyErrorPresentation(err)
        if (dataRef.current != null) {
          setErrorTitle(presentation.title)
          setError(presentation.message)
          setStatus('success')
          setFromCache(true)
          return dataRef.current
        }
        setErrorTitle(presentation.title)
        setError(presentation.message)
        setStatus('error')
        return null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, cacheKey, cacheFreshMs, ...deps],
  )
  reloadFnRef.current = reload

  useEffect(() => {
    void reload({ preferCache: true })
    return () => {
      abortRef.current?.abort()
    }
  }, [reload])

  useEffect(() => {
    if (!enabled) return
    const onResync = () => {
      void reload({ preferCache: false })
    }
    window.addEventListener('fixnow:resync', onResync)
    return () => window.removeEventListener('fixnow:resync', onResync)
  }, [enabled, reload])

  const reloadStable = useCallback(() => reloadFnRef.current({ preferCache: false }), [])

  return {
    data,
    error,
    errorTitle,
    status,
    reload: reloadStable,
    cancel: () => abortRef.current?.abort(),
    setData,
    isLoading: status === 'loading',
    fromCache,
  }
}
