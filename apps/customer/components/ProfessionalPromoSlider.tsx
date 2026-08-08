import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { technicianMarketingApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { safeArray } from '@fixnow/utils'

type Slide = {
  id: string
  title?: string
  headline?: string
  description?: string
  imageUrl?: string
  ctaLabel?: string
  ctaHref?: string
  technicianName?: string
  technicianUserId?: string
}

/**
 * Customer homepage rotating slides from admin-approved Professional / Business creatives.
 * Auto-advances; supports manual swipe / arrow controls. Limit defaults to 8 (Business max).
 */
export function ProfessionalPromoSlider() {
  const query = useAsync(async () => {
    const res = await technicianMarketingApi.deliverCustomer({ limit: 8 })
    return {
      slides: safeArray(res.data?.slides) as Slide[],
      banners: safeArray(res.data?.banners) as Slide[],
    }
  }, [])

  const slides = query.data?.slides?.length
    ? query.data.slides
    : query.data?.banners?.slice(0, 4) || []
  const [index, setIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)

  useEffect(() => {
    if (slides.length < 2) return
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, 5500)
    return () => window.clearInterval(timer)
  }, [slides.length])

  useEffect(() => {
    const current = slides[index]
    if (current?.id) {
      void technicianMarketingApi.track(current.id, 'view').catch(() => undefined)
    }
  }, [index, slides])

  if (!slides.length) return null

  const slide = slides[index] || slides[0]
  const href = slide.ctaHref || (slide.technicianUserId ? `/technicians/${slide.technicianUserId}` : '/offers')

  return (
    <section className="relative overflow-hidden rounded-3xl bg-surface-container-low">
      <div
        className="relative aspect-[16/9] w-full md:aspect-[21/9]"
        onTouchStart={(e) => setTouchStart(e.changedTouches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (touchStart == null) return
          const dx = (e.changedTouches[0]?.clientX ?? touchStart) - touchStart
          if (Math.abs(dx) > 40) {
            setIndex((i) =>
              dx < 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length,
            )
          }
          setTouchStart(null)
        }}
      >
        {slide.imageUrl ? (
          <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0A2540] to-[#1B5F7A] text-white">
            <Icon name="campaign" className="text-[48px] opacity-70" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 text-white md:p-7">
          <p className="text-caps tracking-wide text-white/80">
            {slide.technicianName || 'FixNow Business'}
          </p>
          <h2 className="text-title md:text-headline">{slide.headline || slide.title}</h2>
          {slide.description ? (
            <p className="max-w-xl text-label text-white/85 line-clamp-2">{slide.description}</p>
          ) : null}
          <Link
            to={href}
            className="inline-flex min-h-10 items-center rounded-xl bg-white px-4 text-label font-semibold text-[#0A2540]"
            onClick={() => {
              if (slide.id) void technicianMarketingApi.track(slide.id, 'click').catch(() => undefined)
            }}
          >
            {slide.ctaLabel || 'View pro'}
          </Link>
        </div>

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white"
              onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white"
              onClick={() => setIndex((i) => (i + 1) % slides.length)}
            >
              <Icon name="chevron_right" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                  }`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
