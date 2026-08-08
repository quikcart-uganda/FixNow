import { useEffect, useState } from 'react'
import { contentApi, getFriendlyErrorMessage, type PublicContentPage } from '@fixnow/api'
import { cloudinaryPresetUrl, cloudinarySrcSet, isCloudinaryDeliveryUrl, resolveMediaUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/ui'
import { useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '../AsyncStateView'
import { clearContentCache, readContentCache, sanitizeContentHtml, writeContentCache } from './contentCache'

export type CmsDocumentViewProps = {
  slug: string
  audience?: 'all' | 'customer' | 'technician' | 'admin'
  language?: string
  backTo?: string
  titleFallback?: string
  className?: string
  onShare?: (page: PublicContentPage) => void
  showSearchLink?: boolean
}

export function CmsDocumentView({
  slug,
  audience = 'all',
  language = 'en',
  titleFallback,
  className = '',
  onShare,
}: CmsDocumentViewProps) {
  const cached = readContentCache(slug, language, audience)
  const [page, setPage] = useState<PublicContentPage | null>(
    cached
      ? ({
          ...cached.page,
          language,
          status: 'published',
        } as PublicContentPage)
      : null,
  )
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'empty'>(
    cached ? 'success' : 'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const [pulling, setPulling] = useState(false)

  async function load(opts?: { force?: boolean }) {
    if (opts?.force) setPulling(true)
    else if (!page) setStatus('loading')
    setError(null)
    try {
      const res = await contentApi.getPublic(slug, { language, audience })
      setPage(res.data.page)
      writeContentCache(slug, res.data.page, language, audience)
      setStatus('success')
      setOffline(false)
    } catch (err) {
      if (page || cached) {
        setStatus('success')
        setOffline(true)
      } else {
        setError(getFriendlyErrorMessage(err))
        setStatus('error')
      }
    } finally {
      setPulling(false)
    }
  }

  useEffect(() => {
    void load()
    const onOnline = () => {
      setOffline(false)
      void load({ force: true })
    }
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, language, audience])

  useRealtimeReload(() => {
    clearContentCache(slug)
    void load({ force: true })
  }, [SOCKET_EVENTS.CONTENT_UPDATED])

  const title = page?.title || titleFallback || slug

  return (
    <div className={className}>
      {offline ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Showing cached content · You are offline
        </p>
      ) : null}
      {pulling ? <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Refreshing…</p> : null}

      <AsyncStateView
        status={status}
        error={error}
        onRetry={() => void load({ force: true })}
        emptyTitle="Content unavailable"
        emptyHint="This page has not been published yet."
        loadingLabel="Loading content…"
      >
        {page ? (
          <article className="space-y-4">
            <header className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-2xl font-bold text-ink-primary">{title}</h1>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold"
                    onClick={() => void load({ force: true })}
                  >
                    Refresh
                  </button>
                  {onShare ? (
                    <button
                      type="button"
                      className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold"
                      onClick={() => onShare(page)}
                    >
                      Share
                    </button>
                  ) : null}
                </div>
              </div>
              {page.excerpt ? <p className="text-sm text-ink-muted">{page.excerpt}</p> : null}
              {page.publishedAt ? (
                <p className="text-xs text-ink-muted">
                  Updated {new Date(page.publishedAt).toLocaleDateString()}
                </p>
              ) : null}
            </header>
            {page.heroImageUrl ? (
              <div className="max-h-56 w-full overflow-hidden rounded-2xl bg-surface-alt">
                <LazyImage
                  src={
                    isCloudinaryDeliveryUrl(resolveMediaUrl(page.heroImageUrl))
                      ? cloudinaryPresetUrl(resolveMediaUrl(page.heroImageUrl), 'cover') ||
                        resolveMediaUrl(page.heroImageUrl)
                      : resolveMediaUrl(page.heroImageUrl)
                  }
                  srcSet={
                    isCloudinaryDeliveryUrl(resolveMediaUrl(page.heroImageUrl))
                      ? cloudinarySrcSet(resolveMediaUrl(page.heroImageUrl), [
                          'bannerMobile',
                          'cover',
                          'banner',
                        ])
                      : undefined
                  }
                  alt={page.title ? `${page.title} cover image` : ''}
                  className="max-h-56 w-full object-cover"
                  sizes="(max-width: 768px) 100vw, 720px"
                  emptyContent={<span className="block h-32 w-full bg-surface-alt" />}
                />
              </div>
            ) : null}
            <div
              className="prose prose-sm max-w-none break-words text-ink-primary [&_a]:text-primary [&_h1]:text-xl [&_h2]:text-lg [&_img]:max-w-full [&_li]:my-1 [&_p]:my-2 [&_pre]:overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(page.bodyHtml) }}
            />
          </article>
        ) : null}
      </AsyncStateView>
    </div>
  )
}
