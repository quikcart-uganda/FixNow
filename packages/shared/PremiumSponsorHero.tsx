import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import { marketingApi, type MarketingDeliveryItem } from '@fixnow/api'
import { cloudinaryPresetUrl, cloudinarySrcSet, isCloudinaryDeliveryUrl, resolveMediaUrl, localAssetUrl } from '@fixnow/assets'
import { Icon, LazyImage } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'
import { useReducedMotion } from './a11y'

const AUTO_MS = 6500

function heroFallbackKey(item: MarketingDeliveryItem): string {
  const type = String(item.type || '')
  if (type.includes('solar') || /solar/i.test(item.title) || /solar/i.test(item.sponsorName || '')) {
    return 'advertisements.solar'
  }
  if (/momo|mtn|telecom|mobile money/i.test(`${item.title} ${item.sponsorName || ''}`)) {
    return 'advertisements.telecom'
  }
  if (/stanbic|bank|loan|finance|insurance/i.test(`${item.title} ${item.sponsorName || ''}`)) {
    return 'advertisements.bank'
  }
  if (/academy|train|recruit|certified/i.test(`${item.title} ${item.body || ''}`)) {
    return 'advertisements.training'
  }
  if (type.includes('safety') || type.includes('emergency')) return 'campaigns.safety'
  if (type.includes('seasonal')) return 'campaigns.seasonal'
  if (type === 'partner_ad' || type.includes('partner') || type.includes('sponsored')) {
    return 'advertisements.building-materials'
  }
  return 'campaigns.choose-tech'
}

function pickImage(item: MarketingDeliveryItem, viewport: 'mobile' | 'desktop') {
  if (viewport === 'mobile') {
    return item.mobileImageUrl || item.bannerImageUrl || item.desktopImageUrl
  }
  return item.desktopImageUrl || item.bannerImageUrl || item.mobileImageUrl
}

function CtaLink({
  href,
  label,
  onClick,
  className,
}: {
  href: string
  label: string
  onClick?: () => void
  className: string
}) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} onClick={onClick} className={className}>
        {label}
      </Link>
    )
  }
  return (
    <a href={href} onClick={onClick} className={className} rel="noopener noreferrer" target="_blank">
      {label}
    </a>
  )
}

/**
 * Premium rotating sponsor / campaign hero for Customer Home.
 * Content originates from Admin-managed SponsoredContent (placement home_hero).
 */
export function PremiumSponsorHero({ items }: { items: MarketingDeliveryItem[] }) {
  const slides = safeArray(items)
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const tracked = useRef(new Set<string>())
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setViewport(mq.matches ? 'mobile' : 'desktop')
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (index >= slides.length) setIndex(0)
  }, [slides.length, index])

  useEffect(() => {
    if (slides.length <= 1 || paused || reducedMotion) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, AUTO_MS)
    return () => window.clearInterval(id)
  }, [slides.length, paused, reducedMotion])

  useEffect(() => {
    const current = slides[index]
    if (!current || tracked.current.has(current.id)) return
    tracked.current.add(current.id)
    void marketingApi.trackSponsored(current.id, 'impression').catch(() => {})
  }, [index, slides])

  if (!slides.length) return null

  const go = (next: number) => {
    const len = slides.length
    setIndex(((next % len) + len) % len)
  }

  const current = slides[index] ?? slides[0]
  const href = current.ctaHref || '/customer/offers'
  const cta = current.ctaLabel || 'Learn more'
  const description = current.subtitle || current.body || ''

  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null
    setPaused(true)
  }
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStartX.current
    touchStartX.current = null
    setPaused(false)
    if (start == null) return
    const end = e.changedTouches[0]?.clientX ?? start
    const delta = end - start
    if (Math.abs(delta) < 48) return
    go(delta < 0 ? index + 1 : index - 1)
  }

  const trackClick = () => {
    void marketingApi.trackSponsored(current.id, 'click').catch(() => {})
  }

  return (
    <section
      className="mb-7 px-4"
      aria-roledescription="carousel"
      aria-label="Sponsored campaigns"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <div
        className="relative overflow-hidden rounded-2xl bg-on-surface shadow-md"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`relative w-full overflow-hidden ${
            viewport === 'mobile' ? 'aspect-[4/5] max-h-[420px] sm:aspect-[16/10]' : 'aspect-[21/9] max-h-[320px]'
          }`}
        >
          {slides.map((slide, i) => {
            const active = i === index
            const raw = pickImage(slide, viewport)
            const key = heroFallbackKey(slide)
            const resolved = resolveMediaUrl(raw, key)
            const isCloud = isCloudinaryDeliveryUrl(resolved)
            const src = isCloud
              ? cloudinaryPresetUrl(resolved, viewport === 'mobile' ? 'bannerMobile' : 'banner') || resolved
              : resolved
            const srcSet = isCloud
              ? cloudinarySrcSet(resolved, ['bannerMobile', 'bannerTablet', 'banner', 'hero'])
              : undefined
            return (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                  active ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
                aria-hidden={!active}
              >
                <LazyImage
                  alt=""
                  src={src}
                  srcSet={srcSet}
                  fallback={localAssetUrl(key)}
                  diagComponent="PremiumSponsorHero"
                  diagEntityId={slide.id}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="h-full w-full object-cover object-center"
                  sizes="(max-width: 767px) 100vw, (max-width: 1280px) 92vw, min(1600px, 100vw)"
                />
              </div>
            )
          })}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20" />
        </div>

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-5 sm:p-7 md:p-8">
          <div className="pointer-events-auto max-w-xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {current.badge ? (
                <span className="rounded bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                  {current.badge}
                </span>
              ) : (
                <span className="rounded bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                  {current.sponsorName ? 'Sponsored' : 'Campaign'}
                </span>
              )}
              {current.sponsorName ? (
                <span className="text-xs font-medium text-white/80">{current.sponsorName}</span>
              ) : null}
            </div>

            {current.sponsorLogoUrl ? (
              <LazyImage
                alt={current.sponsorName || 'Sponsor'}
                src={resolveMediaUrl(current.sponsorLogoUrl)}
                className="h-8 w-auto max-w-[140px] object-contain object-left"
              />
            ) : null}

            <h3 className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl md:text-4xl">
              {current.title}
            </h3>
            {description ? (
              <p className="line-clamp-2 text-sm text-white/85 sm:text-base md:line-clamp-3">{description}</p>
            ) : null}
            <CtaLink
              href={href}
              label={cta}
              onClick={trackClick}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-primary shadow-sm transition hover:bg-white/95"
            />
          </div>
        </div>

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous campaign"
              className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55 sm:flex"
              onClick={() => go(index - 1)}
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              aria-label="Next campaign"
              className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55 sm:flex"
              onClick={() => go(index + 1)}
            >
              <Icon name="chevron_right" />
            </button>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 sm:bottom-4">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? 'w-6 bg-white' : 'w-2 bg-white/45 hover:bg-white/70'
                  }`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
