import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getFriendlyErrorMessage, offersApi, OFFER_TYPE_LABELS, type TechnicianOffer } from '@fixnow/api'
import { assetAlt, inferServiceMediaKey, resolveOfferBannerUrl } from '@fixnow/assets'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Icon, ProfileAvatar, SubscriptionBadge } from '@fixnow/ui'
import { LazyImage } from '@fixnow/native'
import { discountBadgeText, expiryLabel, shareOffer } from '@customer/components/CustomerOfferCard'

export function OfferDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [remind, setRemind] = useState(true)
  const [busy, setBusy] = useState(false)

  const query = useAsync(async () => {
    const res = await offersApi.getPublic(id)
    return res.data.offer as TechnicianOffer
  }, [id])

  useEffect(() => {
    if (query.data) {
      setSaved(Boolean(query.data.saved))
      setRemind(query.data.remindBeforeExpiry !== false)
      void offersApi.track(id, 'view').catch(() => undefined)
    }
  }, [query.data, id])

  const offer = query.data
  const tech = offer?.technician

  const toggleSave = async () => {
    if (!offer || busy) return
    setBusy(true)
    try {
      if (saved) {
        await offersApi.unsave(offer.id)
        setSaved(false)
      } else {
        await offersApi.save(offer.id)
        setSaved(true)
      }
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleReminder = async () => {
    if (!offer || busy) return
    setBusy(true)
    try {
      const next = !remind
      await offersApi.setReminder(offer.id, next)
      setRemind(next)
      setSaved(true)
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="tap-target -ml-2">
          <Icon name="arrow_back" />
        </button>
        <h1 className="truncate text-title-md text-on-surface">Offer details</h1>
        <button
          type="button"
          aria-label="Share"
          className="ml-auto tap-target"
          onClick={() => offer && void shareOffer(offer)}
        >
          <Icon name="share" />
        </button>
      </header>

      <AsyncStateView
        status={query.status}
        error={query.error}
        onRetry={() => void query.reload()}
        emptyTitle="Offer unavailable"
        emptyHint="This promotion may have expired or is no longer public."
      >
        {offer ? (
          <div className="space-y-6 pb-28">
            <div className="relative h-48 bg-surface-container">
              {(() => {
                const src = resolveOfferBannerUrl(offer.bannerImageUrl, {
                  title: offer.title,
                  subtitle: offer.subtitle,
                  serviceNames: offer.serviceNames,
                })
                const key = inferServiceMediaKey(
                  [offer.title, offer.subtitle, ...(offer.serviceNames || [])].filter(Boolean).join(' '),
                )
                return (
                  <LazyImage
                    alt={assetAlt(key, offer.title)}
                    className="h-full w-full object-cover"
                    src={src}
                    fallback={src}
                  />
                )
              })()}
              <span
                className="absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: offer.promotionColor || '#3d27bc' }}
              >
                {discountBadgeText(offer)}
              </span>
            </div>

            <div className="space-y-4 px-4">
              <div>
                <p className="text-label-caps text-primary">{OFFER_TYPE_LABELS[offer.type]}</p>
                <h2 className="mt-1 text-headline-lg-mobile text-on-surface">{offer.title}</h2>
                {offer.subtitle ? <p className="mt-1 text-body-lg text-on-surface-variant">{offer.subtitle}</p> : null}
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-semibold text-on-surface-variant">
                <span className="rounded-full bg-surface-container-low px-3 py-1.5">{expiryLabel(offer)}</span>
                {offer.analytics.remainingRedemptions != null ? (
                  <span className="rounded-full bg-surface-container-low px-3 py-1.5">
                    {offer.analytics.remainingRedemptions} remaining
                  </span>
                ) : null}
                {offer.distanceLabel ? (
                  <span className="rounded-full bg-surface-container-low px-3 py-1.5">{offer.distanceLabel}</span>
                ) : null}
              </div>

              <Link
                to={`/customer/technician/${offer.technicianId}`}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-canvas-white p-4"
              >
                <ProfileAvatar
                  alt={tech?.name || 'Technician'}
                  src={tech?.profileImageUrl || tech?.photoUrl}
                  className="h-14 w-14 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="font-bold text-on-surface">{tech?.name || 'Technician'}</p>
                    {tech?.subscriptionBadge?.text ? (
                      <SubscriptionBadge
                        text={tech.subscriptionBadge.text}
                        icon={tech.subscriptionBadge.icon}
                        color={tech.subscriptionBadge.color}
                        borderColor={tech.subscriptionBadge.borderColor}
                        glow={tech.subscriptionBadge.glow}
                        size={tech.subscriptionBadge.size || 'sm'}
                      />
                    ) : null}
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    {tech?.trade || 'Verified technician'} · ★ {(tech?.rating ?? 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-outline">Trust {tech?.trustScore ?? 0}/100 · {tech?.jobsCompleted ?? 0} jobs</p>
                </div>
                <Icon name="chevron_right" className="text-outline" />
              </Link>

              <section>
                <h3 className="text-title-md text-on-surface">About this offer</h3>
                <p className="mt-2 whitespace-pre-wrap text-body-sm text-on-surface-variant">{offer.description}</p>
              </section>

              {offer.serviceNames?.length ? (
                <section>
                  <h3 className="text-title-md text-on-surface">Eligible services</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {offer.serviceNames.map((s) => (
                      <span key={s} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-border-subtle bg-canvas-white p-4">
                <h3 className="text-title-md text-on-surface">Usage rules</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-on-surface-variant">
                  <li>
                    Valid {new Date(offer.startsAt).toLocaleString()} – {new Date(offer.endsAt).toLocaleString()}
                  </li>
                  {offer.minimumBookingAmount != null ? <li>Minimum booking: UGX {offer.minimumBookingAmount}</li> : null}
                  {offer.maximumDiscountAmount != null ? <li>Maximum discount: UGX {offer.maximumDiscountAmount}</li> : null}
                  {offer.perCustomerLimit != null ? <li>Per customer limit: {offer.perCustomerLimit}</li> : null}
                  {offer.maxRedemptions != null ? <li>Total redemptions capped at {offer.maxRedemptions}</li> : null}
                  {offer.weekdays?.length ? <li>Weekdays: {offer.weekdays.join(', ')}</li> : null}
                  {offer.timeStart && offer.timeEnd ? (
                    <li>
                      Daily window: {offer.timeStart} – {offer.timeEnd}
                    </li>
                  ) : null}
                  {offer.availabilityNote ? <li>{offer.availabilityNote}</li> : null}
                </ul>
              </section>

              {offer.terms ? (
                <section>
                  <h3 className="text-title-md text-on-surface">Terms</h3>
                  <p className="mt-2 whitespace-pre-wrap text-body-sm text-on-surface-variant">{offer.terms}</p>
                </section>
              ) : null}

              <section className="rounded-xl border border-border-subtle bg-canvas-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-surface">Expiry reminder</p>
                    <p className="text-xs text-on-surface-variant">Get notified before this offer ends.</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleReminder()}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      remind ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {remind ? 'On' : 'Off'}
                  </button>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </AsyncStateView>

      {offer ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-canvas-white p-4 pb-[max(1rem,calc(4.75rem+env(safe-area-inset-bottom,0px)))] md:left-20 md:pb-4">
          <div className="mx-auto flex max-w-lg gap-2">
            <button
              type="button"
              onClick={() => void toggleSave()}
              className="tap-target flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle"
              aria-label={saved ? 'Unsave' : 'Save'}
            >
              <Icon name="favorite" filled={saved} className={saved ? 'text-error' : ''} />
            </button>
            <button
              type="button"
              onClick={() => {
                void offersApi.track(offer.id, 'click').catch(() => undefined)
                navigate(`/customer/post-job?offerId=${offer.id}&technicianId=${offer.technicianId}`)
              }}
              className="flex-1 rounded-xl bg-primary py-3 text-center font-bold text-white"
            >
              Book directly
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
