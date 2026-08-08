import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { marketingApi, type MarketingDeliveryItem } from '@fixnow/api'
import { cloudinaryPresetUrl, cloudinarySrcSet, isCloudinaryDeliveryUrl, resolveMediaUrl, inferServiceMediaKey, assetAlt, isGenericPromoBanner, localAssetUrl } from '@fixnow/assets'
import { LazyImage } from '@fixnow/native'
import { Icon } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'

function isSharedDefaultBanner(url: string | null | undefined): boolean {
  const value = String(url || '').toLowerCase()
  if (!value) return true
  return (
    isGenericPromoBanner(value) ||
    /advertisements\.bank|\/partners\/bank|uploads\/placeholders\/(sponsored|marketing)/i.test(value)
  )
}

function responsiveBanner(url: string | null | undefined, fallbackKey: string) {
  const raw = isSharedDefaultBanner(url) ? `asset:${fallbackKey}` : url
  const resolved = resolveMediaUrl(raw, fallbackKey)
  if (!isCloudinaryDeliveryUrl(resolved)) {
    return { src: resolved, srcSet: undefined as string | undefined, sizes: '(max-width: 640px) 70vw, 240px' }
  }
  return {
    src: cloudinaryPresetUrl(resolved, 'poster') || resolved,
    srcSet: cloudinarySrcSet(resolved, ['bannerMobile', 'bannerTablet', 'banner']),
    sizes: '(max-width: 640px) 70vw, (max-width: 1024px) 40vw, 240px',
  }
}

function PromoCard({
  item,
  onClick,
  channel,
}: {
  item: MarketingDeliveryItem
  onClick?: () => void
  channel: 'customer' | 'technician'
}) {
  const bg = item.promotionColor || '#3d27bc'
  const href =
    item.ctaHref ||
    (channel === 'technician' ? '/technician/marketing' : '/customer/offers')
  const fallbackKey = inferServiceMediaKey(`${item.title} ${item.subtitle || ''} ${item.description || ''}`)
  const mediaProps = responsiveBanner(item.bannerImageUrl, fallbackKey)
  const media = (
    <>
      {item.bannerImageUrl || mediaProps.src ? (
        <LazyImage
          alt={assetAlt(fallbackKey, item.title)}
          src={mediaProps.src}
          srcSet={mediaProps.srcSet}
          sizes={mediaProps.sizes}
          fallback={localAssetUrl(fallbackKey)}
          diagComponent="MarketingRails.promo"
          diagEntityId={item.id}
          className="aspect-[16/9] h-auto w-full object-cover opacity-90"
        />
      ) : (
        <div className="aspect-[16/9] w-full bg-white/10" />
      )}
      <div className="space-y-1 p-4 text-white">
        {item.badge ? (
          <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            {item.badge}
          </span>
        ) : null}
        <p className="text-title-md font-bold">{item.title}</p>
        <p className="line-clamp-2 text-body-sm text-white/85">
          {item.subtitle || item.description}
        </p>
        {item.discountValue ? (
          <p className="pt-1 text-label-caps text-white/90">
            {item.discountType === 'percent' ? `${item.discountValue}% OFF` : `${item.currency || 'UGX'} ${item.discountValue} OFF`}
          </p>
        ) : null}
      </div>
    </>
  )

  const className =
    'relative flex w-full flex-col overflow-hidden rounded-xl text-left shadow-sm max-md:min-w-[min(70vw,240px)] max-md:max-w-[240px] max-md:snap-start max-md:shrink-0 md:min-w-0 md:max-w-none'

  if (href.startsWith('/')) {
    return (
      <Link
        to={href}
        onClick={onClick}
        className={className}
        style={{ background: bg }}
        aria-label={item.title}
      >
        {media}
      </Link>
    )
  }

  return (
    <a href={href} onClick={onClick} className={className} style={{ background: bg }} aria-label={item.title}>
      {media}
    </a>
  )
}

function SponsoredCard({
  item,
  onClick,
}: {
  item: MarketingDeliveryItem
  onClick?: () => void
}) {
  const href = item.ctaHref || '#'
  const fallbackKey =
    item.type === 'partner_ad'
      ? 'advertisements.bank'
      : inferServiceMediaKey(`${item.title} ${item.body || ''} ${item.sponsorName || ''}`)
  const mediaProps = responsiveBanner(item.bannerImageUrl, fallbackKey)
  const inner = (
    <>
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-container">
        <LazyImage
          alt={assetAlt(fallbackKey, item.title)}
          src={mediaProps.src}
          srcSet={mediaProps.srcSet}
          sizes={mediaProps.sizes}
          fallback={localAssetUrl(fallbackKey)}
          diagComponent="MarketingRails.sponsored"
          diagEntityId={item.id}
          className="h-full w-full object-cover"
        />
        {item.sponsorName ? (
          <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {item.type === 'partner_ad' ? 'Ad' : 'Sponsored'} · {item.sponsorName}
          </span>
        ) : (
          <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {item.type === 'partner_ad' ? 'Advertisement' : 'Campaign'}
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="text-body-lg font-bold text-on-surface">{item.title}</p>
        <p className="line-clamp-2 text-body-sm text-on-surface-variant">{item.body}</p>
        {item.ctaLabel ? (
          <span className="inline-flex items-center gap-1 pt-1 text-label-caps text-primary">
            {item.ctaLabel} <Icon name="arrow_forward" className="text-sm" />
          </span>
        ) : null}
      </div>
    </>
  )

  if (href.startsWith('/')) {
    return (
      <Link
        to={href}
        onClick={onClick}
        className="flex w-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-canvas-white shadow-sm max-md:min-w-[min(70vw,240px)] max-md:max-w-[240px] max-md:snap-start max-md:shrink-0 md:min-w-0 md:max-w-none"
      >
        {inner}
      </Link>
    )
  }

  return (
    <a
      href={href}
      onClick={onClick}
      className="flex w-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-canvas-white shadow-sm max-md:min-w-[min(70vw,240px)] max-md:max-w-[240px] max-md:snap-start max-md:shrink-0 md:min-w-0 md:max-w-none"
    >
      {inner}
    </a>
  )
}

/** Horizontal rails for platform promotions, educational campaigns, and paid ads. */
export function MarketingRails({
  promotions,
  educational,
  advertisements,
  channel,
}: {
  promotions: MarketingDeliveryItem[]
  educational: MarketingDeliveryItem[]
  advertisements: MarketingDeliveryItem[]
  channel: 'customer' | 'technician'
}) {
  const trackPromo = (id: string) => {
    void marketingApi.trackPromotion(id, 'click').catch(() => {})
  }
  const trackSponsored = (id: string) => {
    void marketingApi.trackSponsored(id, 'click').catch(() => {})
  }

  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    const promos = safeArray(promotions)
    const edu = safeArray(educational)
    const ads = safeArray(advertisements)
    for (const p of promos) void marketingApi.trackPromotion(p.id, 'view').catch(() => {})
    for (const s of [...edu, ...ads]) {
      void marketingApi.trackSponsored(s.id, 'impression').catch(() => {})
    }
  }, [promotions, educational, advertisements])

  const promoList = safeArray(promotions)
  const eduList = safeArray(educational)
  const adList = safeArray(advertisements)

  return (
    <>
      {promoList.length ? (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between px-4 sm:px-5 lg:px-6">
            <h3 className="text-title-md text-on-surface">
              {channel === 'technician' ? 'Partner promotions' : 'Platform promotions'}
            </h3>
          </div>
          <div className="no-scrollbar scroll-touch-x flex snap-x gap-4 overflow-x-auto px-4 pb-1 md:hidden">
            {promoList.map((item) => (
              <PromoCard
                key={item.id}
                item={item}
                channel={channel}
                onClick={() => trackPromo(item.id)}
              />
            ))}
          </div>
          <div className="hidden gap-4 px-4 pb-1 sm:px-5 md:grid md:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4">
            {promoList.map((item) => (
              <PromoCard
                key={item.id}
                item={item}
                channel={channel}
                onClick={() => trackPromo(item.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {eduList.length ? (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between px-4 sm:px-5 lg:px-6">
            <h3 className="text-title-md text-on-surface">
              {channel === 'technician' ? 'Grow with FixNow' : 'Safety tips'}
            </h3>
          </div>
          <div className="no-scrollbar scroll-touch-x flex snap-x gap-4 overflow-x-auto px-4 pb-1 md:hidden">
            {eduList.map((item) => (
              <SponsoredCard key={item.id} item={item} onClick={() => trackSponsored(item.id)} />
            ))}
          </div>
          <div className="hidden gap-4 px-4 pb-1 sm:px-5 md:grid md:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4">
            {eduList.map((item) => (
              <SponsoredCard key={item.id} item={item} onClick={() => trackSponsored(item.id)} />
            ))}
          </div>
        </section>
      ) : null}

      {adList.length ? (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between px-4 sm:px-5 lg:px-6">
            <h3 className="text-title-md text-on-surface">From our partners</h3>
            <span className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Ads</span>
          </div>
          <div className="no-scrollbar scroll-touch-x flex snap-x gap-4 overflow-x-auto px-4 pb-1 md:hidden">
            {adList.map((item) => (
              <SponsoredCard key={item.id} item={item} onClick={() => trackSponsored(item.id)} />
            ))}
          </div>
          <div className="hidden gap-4 px-4 pb-1 sm:px-5 md:grid md:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4">
            {adList.map((item) => (
              <SponsoredCard key={item.id} item={item} onClick={() => trackSponsored(item.id)} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
