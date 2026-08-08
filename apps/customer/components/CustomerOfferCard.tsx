import { Link, useNavigate } from 'react-router-dom'
import { formatUgx, getFriendlyErrorMessage, offersApi, type TechnicianOffer } from '@fixnow/api'
import { assetAlt, inferServiceMediaKey, resolveOfferBannerUrl } from '@fixnow/assets'
import { Icon, ProfileAvatar, SubscriptionBadge } from '@fixnow/ui'
import { LazyImage } from '@fixnow/native'
import { memo, useState, type MouseEvent } from 'react'
import { openAuthGate, isGuestSession, trackGuestEvent } from '@fixnow/shared'
import { useAuth } from '@fixnow/hooks'

export function discountBadgeText(offer: TechnicianOffer): string {
  if (offer.badge?.trim()) return offer.badge.trim()
  if (offer.type === 'percentage_discount' && offer.discountValue != null) return `${offer.discountValue}% OFF`
  if (offer.type === 'fixed_discount' && offer.discountValue != null) return `${formatUgx(offer.discountValue)} OFF`
  if (offer.type === 'free_call_out') return 'FREE CALL-OUT'
  if (offer.type === 'free_inspection') return 'FREE INSPECTION'
  return 'OFFER'
}

export function expiryLabel(offer: TechnicianOffer): string {
  const hours = offer.analytics?.expiryCountdownHours ?? 0
  if (hours <= 0) return 'Ending soon'
  if (hours < 24) return `Ends in ${hours}h`
  const days = Math.ceil(hours / 24)
  return `Ends in ${days}d`
}

export async function shareOffer(offer: TechnicianOffer) {
  const url = `${window.location.origin}/customer/offers/${offer.id}`
  const text = `${offer.title} — ${discountBadgeText(offer)} on FixNow`
  try {
    if (navigator.share) {
      await navigator.share({ title: offer.title, text, url })
      return
    }
  } catch {
    /* user cancelled or unsupported */
  }
  try {
    await navigator.clipboard.writeText(url)
    window.alert('Offer link copied')
  } catch {
    window.prompt('Copy offer link', url)
  }
}

/**
 * Premium customer offer card — matches Stitch home / search card language.
 */
export const CustomerOfferCard = memo(function CustomerOfferCard({
  offer,
  compact,
  onSavedChange,
}: {
  offer: TechnicianOffer
  compact?: boolean
  onSavedChange?: (offer: TechnicianOffer) => void
}) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [saved, setSaved] = useState(Boolean(offer.saved))
  const [busy, setBusy] = useState(false)
  const tech = offer.technician
  const remaining = offer.analytics?.remainingRedemptions
  const guest = isGuestSession() && !isAuthenticated

  const toggleSave = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (guest || !isAuthenticated) {
      trackGuestEvent('guest_save_attempt', { offerId: offer.id })
      openAuthGate({
        intent: 'save_offer',
        title: 'Create your free FixNow account',
        message: 'Sign in or create an account to save offers.',
        resumePath: `/customer/offers/${offer.id}`,
        payload: { offerId: offer.id },
      })
      return
    }
    if (busy) return
    setBusy(true)
    try {
      if (saved) {
        await offersApi.unsave(offer.id)
        setSaved(false)
        onSavedChange?.({ ...offer, saved: false })
      } else {
        const res = await offersApi.save(offer.id)
        setSaved(true)
        onSavedChange?.(res.data.offer)
      }
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const bookNow = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void offersApi.track(offer.id, 'click').catch(() => undefined)
    if (guest || !isAuthenticated) {
      trackGuestEvent('guest_booking_attempt', { offerId: offer.id })
      openAuthGate({
        intent: 'book',
        title: 'Continue to book',
        message: 'Create your free FixNow account to continue.',
        resumePath: `/customer/offers/${offer.id}`,
        payload: { offerId: offer.id, technicianId: offer.technicianId },
      })
      return
    }
    navigate(`/customer/post-job?offerId=${offer.id}&technicianId=${offer.technicianId}`)
  }

  const onShare = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await shareOffer(offer)
  }

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-canvas-white shadow-sm ${
        compact
          ? 'max-md:min-w-[220px] max-md:max-w-[240px] max-md:snap-start max-md:shrink-0 md:min-w-0 md:max-w-none md:h-full'
          : 'h-full'
      }`}
    >
      <Link to={`/customer/offers/${offer.id}`} className="relative block" onClick={() => void offersApi.track(offer.id, 'view').catch(() => undefined)}>
        <div className={`relative flex items-center justify-center bg-surface-container ${compact ? 'h-24' : 'h-36'}`}>
          {(() => {
            const bannerSrc = resolveOfferBannerUrl(offer.bannerImageUrl, {
              title: offer.title,
              subtitle: offer.subtitle,
              serviceNames: offer.serviceNames,
            })
            const bannerAlt =
              assetAlt(
                inferServiceMediaKey(
                  [offer.title, offer.subtitle, ...(offer.serviceNames || [])].filter(Boolean).join(' '),
                ),
                `${offer.title} — ${offer.serviceNames?.[0] || 'FixNow service offer'}`,
              ) || offer.title
            return (
              <LazyImage
                alt={bannerAlt}
                className="h-full w-full object-cover"
                src={bannerSrc}
                fallback={bannerSrc}
              />
            )
          })()}
          <span
            className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
            style={{ backgroundColor: offer.promotionColor || '#3d27bc' }}
          >
            {discountBadgeText(offer)}
          </span>
          {offer.featured && !compact ? (
            <span className="absolute right-3 top-3 rounded-full bg-amber-100/95 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
              Featured
            </span>
          ) : null}
        </div>
      </Link>

      {compact ? (
        <div className="flex flex-1 flex-col p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
            {discountBadgeText(offer)}
          </p>
          <Link
            to={`/customer/offers/${offer.id}`}
            className="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-on-surface"
          >
            {offer.title}
          </Link>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <p className="truncate text-xs text-on-surface-variant">
              {tech?.name || offer.subtitle || 'FixNow technician'}
            </p>
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
          <div className="mt-2 flex items-center justify-between text-xs text-on-surface-variant">
            <span className="inline-flex items-center gap-1">
              <Icon name="star" filled className="text-[14px] text-primary" />
              {(tech?.rating ?? 0).toFixed(1)}
            </span>
            <span>{expiryLabel(offer)}</span>
          </div>
          <button
            type="button"
            onClick={bookNow}
            className="mt-3 min-h-10 rounded-lg bg-primary px-3 text-sm font-bold text-white transition active:scale-[0.98]"
          >
            Book now
          </button>
        </div>
      ) : (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <Link to={`/customer/offers/${offer.id}`} className="text-body-lg font-bold text-on-surface line-clamp-1">
            {offer.title}
          </Link>
          {offer.subtitle ? <p className="mt-0.5 text-body-sm text-on-surface-variant line-clamp-1">{offer.subtitle}</p> : null}
        </div>

        <Link to={`/customer/technician/${offer.technicianId}`} className="flex items-center gap-3">
          <ProfileAvatar
            alt={tech?.name || 'Technician'}
            src={tech?.profileImageUrl || tech?.photoUrl}
            className="h-10 w-10 rounded-full border border-border-subtle"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-on-surface">{tech?.name || 'Technician'}</p>
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
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
              <span className="inline-flex items-center gap-0.5">
                <Icon name="star" filled className="text-[12px] text-primary" />
                {(tech?.rating ?? 0).toFixed(1)}
              </span>
              {offer.distanceLabel ? (
                <span className="inline-flex items-center gap-0.5">
                  <Icon name="near_me" className="text-[12px]" />
                  {offer.distanceLabel}
                </span>
              ) : null}
            </div>
          </div>
        </Link>

        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-on-surface-variant">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-2 py-1">
            <Icon name="timer" className="text-[14px]" />
            {expiryLabel(offer)}
          </span>
          {remaining != null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-2 py-1">
              <Icon name="confirmation_number" className="text-[14px]" />
              {remaining} left
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={bookNow}
            className="flex-1 rounded-lg bg-primary py-2.5 text-center text-sm font-bold text-white transition active:scale-[0.98]"
          >
            Book Now
          </button>
          <button
            type="button"
            aria-label={saved ? 'Unsave offer' : 'Save offer'}
            onClick={(e) => void toggleSave(e)}
            className="tap-target touch-manip flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle"
          >
            <Icon name="favorite" filled={saved} className={saved ? 'text-error' : 'text-on-surface-variant'} />
          </button>
          <button
            type="button"
            aria-label="Share offer"
            onClick={(e) => void onShare(e)}
            className="tap-target touch-manip flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle"
          >
            <Icon name="share" className="text-on-surface-variant" />
          </button>
        </div>
      </div>
      )}
    </article>
  )
})
