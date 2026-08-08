import { useEffect, useMemo, useState } from 'react'
import { contentBlocksApi, type ContentDeliveryResponse, type DeliveredContentBlock } from '@fixnow/api'
import { safeArray, safeObject } from '@fixnow/utils'

export type ContentChannel = 'customer' | 'technician' | 'public'

const CACHE_PREFIX = 'fixnow_blocks_v1:'
const trackedImpressions = new Set<string>()

function cacheKey(channel: ContentChannel, page: string, locale: string) {
  return `${CACHE_PREFIX}${channel}:${page}:${locale}`
}

function readCache(channel: ContentChannel, page: string, locale: string): ContentDeliveryResponse | null {
  try {
    const raw = localStorage.getItem(cacheKey(channel, page, locale))
    return raw ? (JSON.parse(raw) as ContentDeliveryResponse) : null
  } catch {
    return null
  }
}

function writeCache(channel: ContentChannel, page: string, locale: string, data: ContentDeliveryResponse) {
  try {
    localStorage.setItem(cacheKey(channel, page, locale), JSON.stringify(data))
  } catch {
    /* quota / private mode */
  }
}

function deliver(channel: ContentChannel, params: { page: string; locale: string; segment?: 'new' | 'returning' }) {
  if (channel === 'customer') return contentBlocksApi.deliverCustomer(params)
  if (channel === 'technician') return contentBlocksApi.deliverTechnician(params)
  return contentBlocksApi.deliverPublic(params)
}

const EMPTY: ContentDeliveryResponse = { items: [], bySection: {}, channel: '', audiences: [] }

export interface UseContentBlocksResult {
  bySection: Record<string, DeliveredContentBlock[]>
  items: DeliveredContentBlock[]
  loading: boolean
  /** First (highest-ranked) block for a section, or undefined. */
  pick: (section: string) => DeliveredContentBlock | undefined
  /** All blocks for a section, pre-sorted by rank (priority, order, weight). */
  list: (section: string) => DeliveredContentBlock[]
  /** Register a click for analytics. */
  trackClick: (id: string) => void
}

/**
 * Load audience-targeted content blocks for a page. Audience/permission
 * filtering happens entirely on the backend; this hook only requests the app
 * channel + page and renders whatever the server deems visible, with an
 * offline cache and fallback-friendly accessors. Impressions auto-track once.
 */
export function useContentBlocks(
  channel: ContentChannel,
  page: string,
  opts?: { locale?: string; segment?: 'new' | 'returning' },
): UseContentBlocksResult {
  const locale = opts?.locale || 'en'
  const segment = opts?.segment
  const cached = readCache(channel, page, locale)
  const [data, setData] = useState<ContentDeliveryResponse>(cached ?? EMPTY)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    let cancelled = false
    void deliver(channel, { page, locale, segment })
      .then((res) => {
        if (cancelled) return
        const payload = res.data ?? EMPTY
        setData(payload)
        setLoading(false)
        writeCache(channel, page, locale, payload)
        for (const item of payload.items) {
          if (trackedImpressions.has(item.id)) continue
          trackedImpressions.add(item.id)
          void contentBlocksApi.track(item.id, 'impression').catch(() => {})
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [channel, page, locale, segment])

  return useMemo<UseContentBlocksResult>(() => {
    const bySection = safeObject(data.bySection) as Record<string, DeliveredContentBlock[]>
    return {
      bySection,
      items: safeArray<DeliveredContentBlock>(data.items),
      loading,
      pick: (section: string) => safeArray<DeliveredContentBlock>(bySection[section])[0],
      list: (section: string) => safeArray<DeliveredContentBlock>(bySection[section]),
      trackClick: (id: string) => {
        void contentBlocksApi.track(id, 'click').catch(() => {})
      },
    }
  }, [data, loading])
}
