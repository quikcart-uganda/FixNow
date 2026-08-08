import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef } from 'react'
import { Icon, ProfileAvatar, LazyImage, SubscriptionBadge } from '@fixnow/ui'
import {
  categoriesApi,
  customerApi,
  mapCategory,
  mapCustomerTechnicianCard,
  marketingApi,
  offersApi,
  technicianApi,
  type MarketingDelivery,
  type OfferHomeFeed,
  type TechnicianOffer,
} from '@fixnow/api'
import {
  cloudinaryPresetUrl,
  isCloudinaryDeliveryUrl,
  resolveCategoryBannerSrc,
  assetAlt,
  localAssetUrl,
  logImageDiag,
} from '@fixnow/assets'
import { useAsync, useAuth, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, MarketingRails, PortalHeader, PremiumSponsorHero, distanceKm, formatDistanceKm, isGuestSession, openAuthGate, useOptionalLocationPermission } from '@fixnow/shared'
import { CACHE_KEYS, cacheGet, cacheSet, DATA_CACHE_KEYS, PullToRefresh } from '@fixnow/native'
import type { CustomerCategory, CustomerTechnician } from '@customer/data'
import { CustomerOfferCard } from '@customer/components/CustomerOfferCard'
import { ProfessionalPromoSlider } from '@customer/components/ProfessionalPromoSlider'
import { safeArray } from '@fixnow/utils'

function isOffersEmpty(feed: OfferHomeFeed | null | undefined) {
  if (!feed) return true
  return (
    (feed.featured?.length ?? 0) === 0 &&
    (feed.nearby?.length ?? 0) === 0 &&
    (feed.recommended?.length ?? 0) === 0 &&
    (feed.expiringSoon?.length ?? 0) === 0 &&
    (feed.popular?.length ?? 0) === 0
  )
}

function isMarketingEmpty(delivery: MarketingDelivery | null | undefined) {
  if (!delivery) return true
  return (
    (delivery.promotions?.length ?? 0) === 0 &&
    (delivery.educational?.length ?? 0) === 0 &&
    (delivery.advertisements?.length ?? 0) === 0 &&
    (delivery.hero?.length ?? 0) === 0
  )
}

/** Rank technicians using job-history affinity, then server rankingScore (trust-first + soft boosts). */
function personaliseTechnicians(
  technicians: CustomerTechnician[],
  preferredCategoryIds: string[],
): CustomerTechnician[] {
  if (!technicians.length) return technicians
  const score = (t: CustomerTechnician) =>
    Number(t.rankingScore ?? t.trustScore) + (t.businessSpotlight || t.featuredPlacement ? 2 : 0)
  if (!preferredCategoryIds.length) {
    return [...technicians].sort((a, b) => score(b) - score(a) || b.rating - a.rating)
  }
  const weight = new Map(preferredCategoryIds.map((id, i) => [id, preferredCategoryIds.length - i]))
  return [...technicians].sort((a, b) => {
    const aBoost = a.primaryCategoryId ? weight.get(a.primaryCategoryId) || 0 : 0
    const bBoost = b.primaryCategoryId ? weight.get(b.primaryCategoryId) || 0 : 0
    if (bBoost !== aBoost) return bBoost - aBoost
    return score(b) - score(a) || b.rating - a.rating
  })
}

function curatedOffers(feed: OfferHomeFeed | null | undefined): TechnicianOffer[] {
  if (!feed) return []
  const seen = new Set<string>()
  // Prefer featured / recommended first; keep nearby, expiring, and popular as fillers.
  return [feed.featured, feed.recommended, feed.nearby, feed.expiringSoon, feed.popular]
    .flat()
    .filter((offer) => {
      if (!offer || seen.has(offer.id)) return false
      seen.add(offer.id)
      return true
    })
    .slice(0, 8)
}

function SectionHeading({
  title,
  href,
  linkLabel = 'See all',
}: {
  title: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="mb-3 flex items-center justify-between px-4 sm:px-5 lg:px-6">
      <h2 className="text-xl font-bold tracking-tight text-on-surface">{title}</h2>
      {href ? (
        <Link to={href} className="min-h-10 content-center text-xs font-bold uppercase tracking-wide text-primary">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  )
}

function SectionEmpty({
  title,
  hint,
  actionLabel,
  actionHref,
}: {
  title: string
  hint: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div className="mx-4 rounded-xl border border-border-subtle bg-surface-container-low px-4 py-6 text-center sm:mx-5 lg:mx-6">
      <p className="font-semibold text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-on-surface-variant">{hint}</p>
      {actionLabel && actionHref ? (
        <Link to={actionHref} className="mt-3 inline-block text-sm font-bold text-primary">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

function TechnicianCard({ technician }: { technician: CustomerTechnician }) {
  const indicatorLabels: Record<string, string> = {
    available_now: 'Available Now',
    responds_quickly: 'Responds Quickly',
    top_rated: 'Top Rated',
    nearby: 'Nearby',
    verified: 'Verified',
    emergency: 'Emergency',
    professional: 'Professional',
    business: 'Business',
    starter: 'Starter',
    customer_favourite: 'Customer Favourite',
  }
  return (
    <article className="flex h-full min-h-[220px] w-full flex-col rounded-2xl border border-border-subtle bg-canvas-white p-4 shadow-sm max-md:min-w-[min(78vw,280px)] max-md:max-w-[280px] max-md:snap-start md:min-w-0">
      <div className="flex items-start gap-3">
        <ProfileAvatar
          alt={technician.name}
          src={technician.photo}
          online={technician.online}
          verified={technician.verified}
          className="h-16 w-16 shrink-0 rounded-full text-lg sm:h-[4.5rem] sm:w-[4.5rem]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <h3 className="line-clamp-2 text-base font-bold leading-snug text-on-surface">{technician.name}</h3>
            {technician.verified ? (
              <Icon name="verified" filled className="mt-0.5 shrink-0 text-base text-primary" />
            ) : null}
          </div>
          {technician.subscriptionBadge ? (
            <div className="mt-1">
              <SubscriptionBadge
                text={technician.subscriptionBadge.text}
                icon={technician.subscriptionBadge.icon}
                color={technician.subscriptionBadge.color}
                borderColor={technician.subscriptionBadge.borderColor}
                glow={technician.subscriptionBadge.glow}
                size={technician.subscriptionBadge.size || 'sm'}
                boostActive={technician.boostActive}
              />
            </div>
          ) : technician.boostActive ? (
            <div className="mt-1">
              <SubscriptionBadge boostActive />
            </div>
          ) : null}
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-on-surface-variant">{technician.trade}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                technician.online
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {technician.online ? 'Available' : 'Offline'}
            </span>
            {technician.etaLabel ? (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-on-surface-variant">
                <Icon name="schedule" className="text-sm text-primary" />
                {technician.etaLabel}
              </span>
            ) : null}
            {technician.distanceLabel || technician.distanceKm != null ? (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-on-surface-variant">
                <Icon name="near_me" className="text-sm text-primary" />
                {technician.distanceLabel ||
                  (technician.distanceKm != null ? `${technician.distanceKm} km` : null)}
              </span>
            ) : technician.district ? (
              <span className="text-xs text-on-surface-variant">{technician.district}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1 font-semibold text-on-surface">
          <Icon name="star" filled className="text-base text-primary" />
          {technician.rating > 0 ? technician.rating.toFixed(1) : 'New'}
        </span>
        <span className="text-on-surface-variant">{technician.jobs} jobs</span>
        <span className="text-on-surface-variant">
          Trust <strong className="text-primary">{technician.trustScore}/100</strong>
        </span>
      </div>
      {technician.responseTimeLabel ? (
        <p className="mt-1 text-xs text-on-surface-variant">{technician.responseTimeLabel}</p>
      ) : null}
      {technician.indicators?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {technician.indicators.slice(0, 4).map((id) => (
            <span
              key={id}
              className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-medium text-on-surface-variant"
            >
              {indicatorLabels[id] || id}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-end border-t border-border-subtle pt-3">
        <Link
          to={`/customer/technician/${technician.id}`}
          className="inline-flex min-h-12 min-w-[5.5rem] items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white"
        >
          Book
        </Link>
      </div>
    </article>
  )
}

function RecommendedTechnicianCard({
  featured,
  matched,
}: {
  featured: CustomerTechnician
  matched: boolean
}) {
  return (
    <article className="mx-4 overflow-hidden rounded-2xl bg-primary text-white shadow-md sm:mx-5 lg:mx-6">
      {/* Mobile: compact row (unchanged language) */}
      <div className="flex items-center gap-4 p-4 md:hidden">
        <ProfileAvatar
          alt={featured.name}
          src={featured.photo}
          className="h-16 w-16 shrink-0 rounded-full border-2 border-white/30"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 className="truncate text-lg font-bold">{featured.name}</h3>
            {featured.verified ? <Icon name="verified" filled className="text-lg text-white" /> : null}
            {featured.subscriptionBadge ? (
              <SubscriptionBadge
                text={featured.subscriptionBadge.text}
                icon={featured.subscriptionBadge.icon}
                color={featured.subscriptionBadge.color}
                borderColor={featured.subscriptionBadge.borderColor}
                glow={featured.subscriptionBadge.glow}
                size="sm"
                boostActive={featured.boostActive}
                className="bg-white/10"
              />
            ) : featured.boostActive ? (
              <SubscriptionBadge boostActive />
            ) : null}
          </div>
          <p className="truncate text-sm text-white/80">{featured.trade}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm">
            <Icon name="star" filled className="text-base" />
            {featured.rating > 0 ? featured.rating.toFixed(1) : 'New'} · {featured.trustScore}/100 trust
            {matched ? <span className="ml-1 text-white/70">· matched to you</span> : null}
          </p>
        </div>
        <Link
          to={`/customer/technician/${featured.id}`}
          className="min-h-11 shrink-0 content-center rounded-xl bg-white px-4 text-sm font-bold text-primary"
        >
          Book
        </Link>
      </div>

      {/* Desktop: info | metrics | CTAs */}
      <div className="hidden gap-6 p-6 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center lg:gap-8 lg:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <ProfileAvatar
            alt={featured.name}
            src={featured.photo}
            online={featured.online}
            verified={featured.verified}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-white/30 text-xl lg:h-24 lg:w-24"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-2xl font-bold tracking-tight">{featured.name}</h3>
              {featured.verified ? <Icon name="verified" filled className="text-xl text-white" /> : null}
              {featured.subscriptionBadge ? (
                <SubscriptionBadge
                  text={featured.subscriptionBadge.text}
                  icon={featured.subscriptionBadge.icon}
                  color={featured.subscriptionBadge.color}
                  borderColor={featured.subscriptionBadge.borderColor}
                  glow={featured.subscriptionBadge.glow}
                  size="sm"
                  boostActive={featured.boostActive}
                />
              ) : featured.boostActive ? (
                <SubscriptionBadge boostActive />
              ) : null}
            </div>
            <p className="mt-1 text-base text-white/85">{featured.trade}</p>
            {matched ? (
              <p className="mt-2 text-sm font-medium text-white/75">Matched to your recent job history</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">Rating</p>
            <p className="mt-1 inline-flex items-center gap-1 text-lg font-bold">
              <Icon name="star" filled className="text-base" />
              {featured.rating > 0 ? featured.rating.toFixed(1) : 'New'}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">Trust</p>
            <p className="mt-1 text-lg font-bold">{featured.trustScore}/100</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">Availability</p>
            <p className="mt-1 text-lg font-bold">{featured.online ? 'Available' : 'Offline'}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">Distance</p>
            <p className="mt-1 truncate text-lg font-bold">
              {featured.distanceLabel || featured.district || 'Local'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <Link
            to={`/customer/technician/${featured.id}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-primary"
          >
            Book now
          </Link>
          <Link
            to={`/customer/technician/${featured.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/35 px-6 text-sm font-semibold text-white hover:bg-white/10"
          >
            View profile
          </Link>
        </div>
      </div>
    </article>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const guest = isGuestSession() && !isAuthenticated
  const locationPermission = useOptionalLocationPermission()
  const nearbyPrompted = useRef(false)

  useEffect(() => {
    // Soft contextual cue after the home nearby rail has had a chance to settle —
    // never on cold splash; host also enforces auth/payment blockers.
    if (!locationPermission || nearbyPrompted.current || guest) return
    const timer = window.setTimeout(() => {
      nearbyPrompted.current = true
      void locationPermission.ensureLocation('nearby_technicians')
    }, 45_000)
    return () => window.clearTimeout(timer)
  }, [locationPermission, guest])

  const profileQuery = useAsync(async () => {
    if (guest) {
      return { name: 'Guest', photo: '', district: 'Kampala' }
    }
    const res = await customerApi.getProfile()
    const profile = res.data.profile ?? {}
    const location = (profile.location as Record<string, unknown> | undefined) ?? {}
    return {
      name: String(res.data.user?.fullName ?? user?.fullName ?? 'there'),
      photo: String(profile.photoUrl ?? ''),
      district: String(location.district ?? 'Kampala'),
    }
  }, [user?.fullName, guest], { cacheKey: guest ? 'guest-profile' : DATA_CACHE_KEYS.customerProfile })

  const categoriesQuery = useAsync(async () => {
    const res = await categoriesApi.list({ limit: 100 })
    return safeArray(res.data?.items).map(mapCategory) as CustomerCategory[]
  }, [], { cacheKey: DATA_CACHE_KEYS.categories })

  const district = profileQuery.data?.district || 'Kampala'

  const historyQuery = useAsync(
    async () => {
      if (guest) return [] as string[]
      try {
        const res = await customerApi.jobHistory({ limit: 30 })
        const counts = new Map<string, number>()
        for (const raw of safeArray(res.data?.items)) {
          const job = raw as Record<string, unknown>
          const categoryId = String(job.categoryId ?? job.primaryCategoryId ?? '').trim()
          if (!categoryId) continue
          counts.set(categoryId, (counts.get(categoryId) || 0) + 1)
        }
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id)
          .slice(0, 5)
      } catch {
        return [] as string[]
      }
    },
    [guest],
    { cacheKey: `${DATA_CACHE_KEYS.customerProfile}:job-affinity`, cacheFreshMs: 5 * 60_000 },
  )

  const preferredCategories = safeArray(historyQuery.data)

  // Public rails start immediately (Kampala default). Profile district change refetches.
  // Affinity is applied client-side so history load does not abort the first tech fetch.
  const techniciansQuery = useAsync(
    async () => {
      const origin = locationPermission?.lastCoords
      const res = await technicianApi.search({
        limit: 24,
        sort: '-trustScore',
        district,
        placement: 'homepage',
        lat: origin?.latitude,
        lng: origin?.longitude,
      })
      const mapped = safeArray(res.data?.items).map(mapCustomerTechnicianCard) as CustomerTechnician[]
      return mapped.map((tech) => {
        if (tech.etaLabel || tech.distanceKm != null) {
          return {
            ...tech,
            distanceLabel:
              tech.distanceLabel ||
              (tech.distanceKm != null ? `${tech.distanceKm} km` : undefined),
          }
        }
        if (origin && tech.latitude != null && tech.longitude != null) {
          const km = distanceKm(origin, { latitude: tech.latitude, longitude: tech.longitude })
          return { ...tech, distanceLabel: formatDistanceKm(km) || undefined, distanceKm: km }
        }
        if (tech.district && tech.district.toLowerCase() === district.toLowerCase()) {
          return { ...tech, distanceLabel: 'Nearby' }
        }
        return tech
      })
    },
    [district, locationPermission?.lastCoords?.latitude, locationPermission?.lastCoords?.longitude],
    {
      isEmpty: (items) => items.length === 0,
      cacheKey: `${DATA_CACHE_KEYS.customerHomeTechnicians}:${district}:any`,
    },
  )

  const offersQuery = useAsync(
    async () => {
      try {
        const res = await offersApi.homeFeed({ district })
        const raw = (res.data ?? {}) as Partial<OfferHomeFeed>
        const normalized: OfferHomeFeed = {
          featured: Array.isArray(raw.featured) ? raw.featured : [],
          nearby: Array.isArray(raw.nearby) ? raw.nearby : [],
          recommended: Array.isArray(raw.recommended) ? raw.recommended : [],
          expiringSoon: Array.isArray(raw.expiringSoon) ? raw.expiringSoon : [],
          popular: Array.isArray(raw.popular) ? raw.popular : [],
        }
        void cacheSet(CACHE_KEYS.customerOffersHome, normalized, 20 * 60_000)
        return normalized
      } catch (error) {
        const cancelled =
          (error instanceof DOMException && error.name === 'AbortError') ||
          (error instanceof Error && /cancel|abort/i.test(error.message))
        if (cancelled) throw error
        const cached = await cacheGet<OfferHomeFeed>(CACHE_KEYS.customerOffersHome)
        if (cached) return cached
        throw error
      }
    },
    [district],
    {
      cacheKey: `${DATA_CACHE_KEYS.customerHomeOffers}:${district}`,
      cacheFreshMs: 2 * 60_000,
      isEmpty: isOffersEmpty,
    },
  )

  const marketingQuery = useAsync(
    async () => (await marketingApi.deliverCustomer({ placement: 'home' })).data,
    [],
    {
      cacheKey: DATA_CACHE_KEYS.customerHomeMarketing,
      cacheFreshMs: 2 * 60_000,
      isEmpty: isMarketingEmpty,
    },
  )

  useRealtimeReload(() => void categoriesQuery.reload(), [SOCKET_EVENTS.CATEGORY_UPDATED])
  useRealtimeReload(
    () => {
      void offersQuery.reload()
      void marketingQuery.reload()
      void techniciansQuery.reload()
    },
    [
      SOCKET_EVENTS.CONTENT_UPDATED,
      SOCKET_EVENTS.CATEGORY_UPDATED,
      SOCKET_EVENTS.DASHBOARD_METRICS_UPDATED,
      SOCKET_EVENTS.MARKETPLACE_STATS_UPDATED,
    ],
  )

  useEffect(() => {
    const onLocation = () => {
      void profileQuery.reload()
      void techniciansQuery.reload()
      void offersQuery.reload()
      void marketingQuery.reload()
    }
    window.addEventListener('fixnow:location-updated', onLocation)
    return () => window.removeEventListener('fixnow:location-updated', onLocation)
    // Reload fns from useAsync are stable enough for event wiring.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once
  }, [])

  const displayName = guest ? 'Guest' : profileQuery.data?.name ?? user?.fullName ?? 'there'
  const ranked = useMemo(
    () => personaliseTechnicians(safeArray<CustomerTechnician>(techniciansQuery.data), preferredCategories),
    // preferredCategories identity changes; join keeps affinity stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [techniciansQuery.data, preferredCategories.join('|')],
  )
  const featured = ranked[0]
  // Enough cards to fill 2xl six-column grids without empty trailing columns.
  const topRated = ranked.slice(1, 13)
  const homeOffers = curatedOffers(offersQuery.data)
  const promotions = safeArray(marketingQuery.data?.promotions).slice(0, 8)
  const safetyTips = safeArray(marketingQuery.data?.educational).slice(0, 8)
  const advertisements = safeArray(marketingQuery.data?.advertisements).slice(0, 8)
  const heroBanners = safeArray(marketingQuery.data?.hero)
  const homeCategories = safeArray<CustomerCategory>(categoriesQuery.data)
  const mobileCategories = homeCategories.slice(0, 8)

  return (
    <PullToRefresh
      onRefresh={() =>
        Promise.allSettled([
          profileQuery.reload(),
          categoriesQuery.reload(),
          historyQuery.reload(),
          techniciansQuery.reload(),
          offersQuery.reload(),
          marketingQuery.reload(),
        ]).then(() => undefined)
      }
      className="pb-8"
    >
      <PortalHeader
        role="customer"
        brand="FixNow"
        showMenu
        displayName={displayName}
        photoUrl={guest ? null : profileQuery.data?.photo}
        guestMode={guest}
      />

      <div className="mx-auto w-full max-w-[100rem]">
        <section className="px-4 pb-7 pt-5 sm:px-5 lg:px-6">
          <p className="text-sm text-on-surface-variant">
            {guest ? 'Welcome, Guest' : `Hello, ${displayName}`}
          </p>
          {guest ? (
            <p className="mt-0.5 text-xs font-medium text-primary">Browsing as Guest — sign in anytime to book</p>
          ) : null}
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-on-surface">What needs fixing?</h2>
          <button
            type="button"
            onClick={() => navigate('/customer/search')}
            className="mt-4 flex min-h-12 w-full max-w-3xl items-center gap-3 rounded-xl border border-border-subtle bg-canvas-white px-4 text-left text-on-surface-variant shadow-sm"
          >
            <Icon name="search" className="text-primary" />
            Search for a service or technician
          </button>
        </section>

        <section className="mb-7">
          <SectionHeading title="Categories" href="/customer/categories" linkLabel="All categories" />
          <AsyncStateView
            status={categoriesQuery.status}
            error={categoriesQuery.error}
            errorTitle={categoriesQuery.errorTitle}
            onRetry={categoriesQuery.reload}
            emptyTitle="No categories yet"
            emptyHint="Service categories will appear here once available."
            loadingLabel="Loading categories…"
            className="min-h-[104px]"
            fromCache={categoriesQuery.fromCache}
          >
            {/* Mobile: horizontal scroll (unchanged). Desktop: auto-fill grid. */}
            <div className="no-scrollbar scroll-touch-x flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:hidden">
              {mobileCategories.map((category) => {
                const { src, mediaKey, hasArtwork } = resolveCategoryBannerSrc(
                  category.bannerImageUrl,
                  category.slug || category.name,
                )
                const thumb =
                  hasArtwork && src && isCloudinaryDeliveryUrl(src)
                    ? cloudinaryPresetUrl(src, 'thumbnailSquare') || src
                    : src
                const localFallback = localAssetUrl(mediaKey)
                return (
                  <Link
                    key={category.id}
                    to={`/customer/search?categoryId=${category.id}`}
                    className="group flex min-w-[88px] snap-start flex-col items-center gap-2"
                  >
                    <span className="relative flex h-16 w-16 overflow-hidden rounded-2xl bg-surface-container-high ring-1 ring-black/5 group-active:ring-primary/40">
                      {hasArtwork && thumb ? (
                        <LazyImage
                          alt={assetAlt(mediaKey, category.name)}
                          src={thumb}
                          fallback={localFallback || undefined}
                          diagComponent="HomePage.category"
                          diagEntityId={category.id}
                          className="h-full w-full object-cover"
                          sizes="64px"
                          onExhausted={() =>
                            logImageDiag({
                              phase: 'exhausted',
                              requestedUrl: thumb,
                              component: 'HomePage.category',
                              entityId: category.id,
                              error: 'category_banner_unavailable',
                            })
                          }
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <Icon name={category.icon} className="text-2xl text-primary" />
                        </span>
                      )}
                    </span>
                    <span className="max-w-[88px] truncate text-center text-[11px] font-semibold text-on-surface-variant">
                      {category.name}
                    </span>
                  </Link>
                )
              })}
            </div>
            <div className="hidden gap-3 px-4 pb-1 sm:px-5 md:grid md:grid-cols-8 lg:grid-cols-10 lg:px-6 xl:grid-cols-12 2xl:grid-cols-[repeat(14,minmax(0,1fr))]">
              {homeCategories.slice(0, 16).map((category) => {
                const { src, mediaKey, hasArtwork } = resolveCategoryBannerSrc(
                  category.bannerImageUrl,
                  category.slug || category.name,
                )
                const thumb =
                  hasArtwork && src && isCloudinaryDeliveryUrl(src)
                    ? cloudinaryPresetUrl(src, 'thumbnailSquare') || src
                    : src
                const localFallback = localAssetUrl(mediaKey)
                return (
                  <Link
                    key={category.id}
                    to={`/customer/search?categoryId=${category.id}`}
                    className="group flex flex-col items-center gap-2"
                  >
                    <span className="relative flex h-16 w-16 overflow-hidden rounded-2xl bg-surface-container-high ring-1 ring-black/5 transition group-hover:ring-primary/40 lg:h-[4.25rem] lg:w-[4.25rem]">
                      {hasArtwork && thumb ? (
                        <LazyImage
                          alt={assetAlt(mediaKey, category.name)}
                          src={thumb}
                          fallback={localFallback || undefined}
                          diagComponent="HomePage.categoryDesktop"
                          diagEntityId={category.id}
                          className="h-full w-full object-cover"
                          sizes="68px"
                          onExhausted={() =>
                            logImageDiag({
                              phase: 'exhausted',
                              requestedUrl: thumb,
                              component: 'HomePage.categoryDesktop',
                              entityId: category.id,
                              error: 'category_banner_unavailable',
                            })
                          }
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <Icon name={category.icon} className="text-2xl text-primary" />
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 w-full text-center text-[11px] font-semibold text-on-surface-variant">
                      {category.name}
                    </span>
                  </Link>
                )
              })}
            </div>
          </AsyncStateView>
        </section>

        <section className="mb-7">
          <SectionHeading title="Recommended technician" />
          {featured ? (
            <RecommendedTechnicianCard featured={featured} matched={preferredCategories.length > 0} />
          ) : techniciansQuery.status === 'success' || techniciansQuery.status === 'empty' ? (
            <SectionEmpty
              title="No recommendation available"
              hint="Search all verified technicians near you."
              actionLabel="Search technicians"
              actionHref="/customer/search"
            />
          ) : (
            <AsyncStateView
              status={techniciansQuery.status}
              error={techniciansQuery.error}
              errorTitle={techniciansQuery.errorTitle}
              onRetry={techniciansQuery.reload}
              emptyTitle="No recommendation available"
              emptyHint="Search all verified technicians near you."
              loadingLabel="Finding a technician…"
              className="min-h-[120px]"
              fromCache={techniciansQuery.fromCache}
            />
          )}
        </section>

        <PremiumSponsorHero items={heroBanners} />
        <ProfessionalPromoSlider />

        <section className="mb-7">
          <SectionHeading title={`Top rated near ${district}`} href="/customer/search" />
          {techniciansQuery.status === 'success' && topRated.length === 0 ? (
            <SectionEmpty
              title="No more technicians nearby"
              hint="Your recommendation above is the best match right now."
              actionLabel="Search all"
              actionHref="/customer/search"
            />
          ) : (
            <AsyncStateView
              status={techniciansQuery.status}
              error={techniciansQuery.error}
              errorTitle={techniciansQuery.errorTitle}
              onRetry={techniciansQuery.reload}
              emptyTitle="No technicians nearby"
              emptyHint="Try searching a wider area."
              loadingLabel="Loading technicians…"
              className="min-h-[160px]"
              fromCache={techniciansQuery.fromCache}
            >
              {/* Mobile: horizontal carousel. md+: adaptive dense grid. */}
              <div className="no-scrollbar scroll-touch-x flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:hidden">
                {topRated.map((technician) => (
                  <TechnicianCard key={technician.id} technician={technician} />
                ))}
              </div>
              <div className="hidden gap-3 px-4 pb-2 sm:px-5 md:grid md:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4 min-[1440px]:grid-cols-5 2xl:grid-cols-6">
                {topRated.map((technician) => (
                  <TechnicianCard key={technician.id} technician={technician} />
                ))}
              </div>
            </AsyncStateView>
          )}
        </section>

        <section className="mb-8 px-4 sm:px-5 lg:px-6">
          <Link
            to="/customer/post-job"
            className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary-fixed p-4 md:p-5"
          >
            <div>
              <h2 className="text-lg font-bold text-primary">Post a job</h2>
              <p className="mt-1 text-sm text-on-primary-fixed-variant">Describe the issue and receive offers from verified pros.</p>
            </div>
            <span className="ml-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <Icon name="add" />
            </span>
          </Link>
        </section>

        <section className="mb-8">
          <SectionHeading title="Today’s offers" href="/customer/offers" />
          <AsyncStateView
            status={offersQuery.status}
            error={offersQuery.error}
            errorTitle={offersQuery.errorTitle}
            onRetry={offersQuery.reload}
            emptyTitle="No offers today"
            emptyHint="New local deals will appear here."
            emptyActionLabel="Browse offers"
            emptyActionHref="/customer/offers"
            loadingLabel="Loading offers…"
            className="min-h-[160px]"
            fromCache={offersQuery.fromCache}
          >
            <div className="no-scrollbar scroll-touch-x flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:hidden">
              {homeOffers.map((offer) => (
                <CustomerOfferCard key={offer.id} offer={offer} compact />
              ))}
            </div>
            <div className="hidden gap-4 px-4 pb-2 sm:px-5 md:grid md:grid-cols-2 lg:grid-cols-3 lg:px-6 xl:grid-cols-4">
              {homeOffers.map((offer) => (
                <CustomerOfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </AsyncStateView>
        </section>

        <AsyncStateView
          status={marketingQuery.status}
          error={marketingQuery.error}
          errorTitle={marketingQuery.errorTitle}
          onRetry={marketingQuery.reload}
          emptyTitle="No updates right now"
          emptyHint="Promotions and safety advice will appear here."
          loadingLabel="Loading updates…"
          className="min-h-[160px]"
          fromCache={marketingQuery.fromCache}
        >
          <MarketingRails
            channel="customer"
            promotions={promotions}
            educational={safetyTips}
            advertisements={advertisements}
          />
        </AsyncStateView>

        <section className="pb-4">
          <SectionHeading title="Recent activity" />
          <div className="px-4 sm:px-5 lg:px-6">
            {guest ? (
              <button
                type="button"
                onClick={() =>
                  openAuthGate({
                    intent: 'jobs',
                    title: 'Create your free FixNow account',
                    message: 'Sign in or create an account to track jobs and bookings.',
                    resumePath: '/customer/jobs',
                  })
                }
                className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border-subtle bg-canvas-white p-4 text-left shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <Icon name="work_history" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-on-surface">Your jobs and bookings</strong>
                  <span className="block text-sm text-on-surface-variant">
                    Sign in to track progress or book another service
                  </span>
                </span>
                <Icon name="chevron_right" className="text-outline" />
              </button>
            ) : (
              <Link
                to="/customer/jobs"
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border-subtle bg-canvas-white p-4 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <Icon name="work_history" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-on-surface">Your jobs and bookings</strong>
                  <span className="block text-sm text-on-surface-variant">Track progress or book another service</span>
                </span>
                <Icon name="chevron_right" className="text-outline" />
              </Link>
            )}
          </div>
        </section>
      </div>
    </PullToRefresh>
  )
}
