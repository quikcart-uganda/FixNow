import { useCallback, useEffect, useRef, useState } from 'react'
import { getFriendlyErrorMessage } from '@fixnow/api'
import type { AsyncStatus } from './useAsync'

type PageResult<T> = {
  items: T[]
  meta?: { hasNext?: boolean; page?: number; total?: number }
}

/**
 * Append-style pagination for list surfaces that already return `meta.hasNext`.
 */
export function useInfiniteList<T>(
  loader: (page: number) => Promise<PageResult<T>>,
  deps: unknown[] = [],
  options?: {
    enabled?: boolean
    resetKey?: string | number
  },
) {
  const enabled = options?.enabled !== false
  const [items, setItems] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<AsyncStatus>(enabled ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const requestId = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const itemsLenRef = useRef(0)
  itemsLenRef.current = items.length

  const loadPage = useCallback(async (nextPage: number, mode: 'replace' | 'append') => {
    if (!enabled) return
    const id = ++requestId.current
    if (mode === 'replace') {
      setStatus((prev) => (prev === 'success' && itemsLenRef.current ? 'success' : 'loading'))
      setError(null)
    } else {
      setLoadingMore(true)
    }
    try {
      const result = await loaderRef.current(nextPage)
      if (id !== requestId.current) return
      setItems((prev) => (mode === 'append' ? [...prev, ...result.items] : result.items))
      setPage(nextPage)
      setHasMore(Boolean(result.meta?.hasNext))
      const empty = mode === 'replace' && result.items.length === 0
      setStatus(empty ? 'empty' : 'success')
    } catch (err) {
      if (id !== requestId.current) return
      setError(getFriendlyErrorMessage(err))
      if (mode === 'replace' && itemsLenRef.current === 0) setStatus('error')
    } finally {
      if (id === requestId.current) setLoadingMore(false)
    }
  }, [enabled])

  const reload = useCallback(() => loadPage(1, 'replace'), [loadPage])
  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return
    void loadPage(page + 1, 'append')
  }, [hasMore, loadingMore, loadPage, page])

  useEffect(() => {
    void loadPage(1, 'replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, options?.resetKey, loadPage, ...deps])

  useEffect(() => {
    const onResync = () => {
      void loadPage(1, 'replace')
    }
    window.addEventListener('fixnow:resync', onResync)
    return () => window.removeEventListener('fixnow:resync', onResync)
  }, [loadPage])

  return {
    items,
    status,
    error,
    hasMore,
    loadingMore,
    reload,
    loadMore,
    isLoading: status === 'loading',
  }
}
