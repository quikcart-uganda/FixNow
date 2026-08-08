import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { marketingApi, type MarketingDeliveryItem } from '@fixnow/api'
import { resolveMediaUrl, localAssetUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/native'
import { Icon } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'
import { useReducedMotion } from './a11y/useReducedMotion'

const AUTO_MS = 6500
const SWIPE_THRESHOLD = 48

type Props = {
  items: MarketingDeliveryItem[]
  /** Default CTA when a slide has no ctaHref */
  fallbackHref?: string
  className?: string
}

function SlideCta({
  href,
  label,
  onClick,
}: {
  href: string
  label: string
  onClick: () => void
}) {
  const className =
    'inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-ink-primary shadow-md transition hover:bg-white/95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

  if (href.startsWith('/')) {
    return (
      <Link to={href} onClick={onClick} className={className}>
        {label}
      </Link>
    )
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      {label}
    </a>
  )
}

/**
 * Premium full-width sponsored hero carousel for dashboard surfaces.
 * API-driven — never renders hardcoded campaign copy.
 */
export function SponsoredHeroBanner({
  items,
  fallbackHref = '/technician/marketing',
  className = '',
}: Props) {
  const slides = safeArray(items).filter((s) => s.id && s.title)
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const rootRef = useRef<HTMLElement>(null)

  const count = slides.length
  const active = slides[index] ?? slides[0]

  const go = useCallback(
    (next: number) => {
      if (!count) return
      setIndex(((next % count) + count) % count)
    },
    [count],
  )

  const next = useCallback(() => go(index + 1), [go, index])
  const prev = useCallback(() => go(index - 1), [go, index])

  // Impression when slide becomes active and visible
  useEffect(() => {
    if (!active?.id || dismissed) return
    if (active.id === 'preview' || active.id.startsWith('preview-')) return
    if (seenRef.current.has(active.id)) return
    seenRef.current.add(active.id)
    void marketingApi.trackSponsored(active.id, 'impression').catch(() => {})
  }, [active?.id, dismissed])

  // Prefetch next slide image
  useEffect(() => {
    if (!count || count < 2) return
    const upcoming = slides[(index + 1) % count]
    const url = upcoming?.bannerImageUrl
      ? resolveMediaUrl(upcoming.bannerImageUrl, 'campaigns.safety')
      : ''
    if (!url || typeof window === 'undefined') return
    const img = new Image()
    img.src = url
  }, [count, index, slides])

  // Auto-advance
  useEffect(() => {
    if (dismissed || count < 2 || paused || reducedMotion) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count)
    }, AUTO_MS)
    return () => window.clearInterval(id)
  }, [count, paused, reducedMotion, dismissed])

  // Keyboard
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [next, prev])

  if (dismissed || !active) return null

  const href = active.ctaHref || fallbackHref
  const ctaLabel = active.ctaLabel || 'Learn more'
  const imageSrc = resolveMediaUrl(active.bannerImageUrl || null, 'campaigns.safety')

  return (
    <section
      ref={rootRef}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Sponsored highlights"
      className={`group relative isolate overflow-hidden rounded-2xl shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false)
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null
        setPaused(true)
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current
        touchStartX.current = null
        setPaused(false)
        if (start == null) return
        const dx = (e.changedTouches[0]?.clientX ?? start) - start
        if (Math.abs(dx) < SWIPE_THRESHOLD) return
        if (dx < 0) next()
        else prev()
      }}
    >
      <div className="relative aspect-[21/9] min-h-[168px] w-full sm:min-h-[200px] md:min-h-[240px] lg:min-h-[280px]">
        {slides.map((slide, i) => {
          const src = resolveMediaUrl(slide.bannerImageUrl || null, 'campaigns.safety')
          const isActive = i === index
          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className={`absolute inset-0 transition-opacity duration-500 ease-out ${
                isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <LazyImage
                src={src}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
                fallback={localAssetUrl('campaigns.safety')}
                diagComponent="SponsoredHeroBanner"
                diagEntityId={slide.id}
                loading={i === 0 ? 'eager' : 'lazy'}
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1100px"
              />
            </div>
          )
        })}

        {/* Glass / gradient overlay — keeps text readable without hiding the photo */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10"
          aria-hidden
        />

        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 md:justify-center md:p-8 lg:p-10">
          <div className="max-w-xl space-y-2 text-white sm:space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-sm">
                Sponsored
              </span>
              {active.sponsorName ? (
                <span className="inline-flex items-center gap-2 text-xs font-medium text-white/85">
                  {active.sponsorLogoUrl ? (
                    <LazyImage
                      src={resolveMediaUrl(active.sponsorLogoUrl)}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover ring-1 ring-white/40"
                      emptyContent={<span className="block h-6 w-6" />}
                    />
                  ) : null}
                  {active.sponsorName}
                </span>
              ) : null}
            </div>
            <h2 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl md:text-3xl">
              {active.title}
            </h2>
            {active.subtitle ? (
              <p className="text-sm font-medium text-white/90 sm:text-base">{active.subtitle}</p>
            ) : null}
            {(active.body || active.description) && (
              <p className="line-clamp-2 max-w-md text-sm text-white/80 sm:line-clamp-3">
                {active.body || active.description}
              </p>
            )}
            <div className="pt-1">
              <SlideCta
                href={href}
                label={ctaLabel}
                onClick={() => {
                  if (active.id === 'preview' || active.id.startsWith('preview-')) return
                  void marketingApi.trackSponsored(active.id, 'click').catch(() => {})
                }}
              />
            </div>
          </div>
        </div>

        {/* Controls */}
        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous banner"
              onClick={prev}
              className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-3"
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              aria-label="Next banner"
              onClick={next}
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-3"
            >
              <Icon name="chevron_right" />
            </button>
            <div
              className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 sm:bottom-4"
              role="tablist"
              aria-label="Banner slides"
            >
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Slide ${i + 1} of ${count}`}
                  onClick={() => setIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? 'w-6 bg-white' : 'w-2 bg-white/45 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}

        <button
          type="button"
          aria-label="Dismiss sponsored banner"
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white/90 backdrop-blur-sm transition hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => {
            setDismissed(true)
            if (active.id === 'preview' || active.id.startsWith('preview-')) return
            void marketingApi.trackSponsored(active.id, 'dismissal').catch(() => {})
          }}
        >
          <Icon name="close" className="!text-[18px]" />
        </button>
      </div>

      {/* SEO / a11y live region */}
      <p className="sr-only" aria-live="polite">
        {active.title}
        {imageSrc ? '' : ''}
      </p>
    </section>
  )
}
