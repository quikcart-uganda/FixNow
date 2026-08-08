import type { ReactNode } from 'react'
import { formatUgx, OFFER_TYPE_LABELS, type TechnicianOffer } from '@fixnow/api'
import { Icon } from '@fixnow/ui'
import { lifecycleTone } from './offerUtils'

function discountLine(offer: TechnicianOffer): string | null {
  if (offer.discountValue == null) return null
  if (offer.type === 'percentage_discount') return `${offer.discountValue}% off`
  if (offer.type === 'fixed_discount') return `${formatUgx(offer.discountValue)} off`
  return `Value ${offer.discountValue}`
}

/**
 * Customer-facing offer card. Used in listings and as the live preview inside
 * the Offer Builder so technicians see exactly what customers will see.
 */
export function OfferCard({
  offer,
  actions,
  compact,
}: {
  offer: TechnicianOffer
  actions?: ReactNode
  compact?: boolean
}) {
  const discount = discountLine(offer)

  return (
    <article
      className="overflow-hidden rounded-2xl border border-border-subtle bg-canvas-white"
      style={{ borderTopColor: offer.promotionColor || '#0F766E', borderTopWidth: 4 }}
    >
      {offer.bannerImageUrl ? (
        <img
          src={offer.bannerImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={compact ? 'h-24 w-full object-cover' : 'h-36 w-full object-cover'}
        />
      ) : null}

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-title text-on-surface">{offer.title}</h3>
              {offer.badge ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                  style={{ backgroundColor: offer.promotionColor || '#0F766E' }}
                >
                  {offer.badge}
                </span>
              ) : null}
              {offer.featured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                  <Icon name="star" className="text-[12px]" />
                  Featured
                </span>
              ) : null}
            </div>
            {offer.subtitle ? <p className="text-sm text-on-surface-variant">{offer.subtitle}</p> : null}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${lifecycleTone(offer.lifecycle)}`}
          >
            {offer.lifecycle.replace('_', ' ')}
          </span>
        </div>

        {discount ? (
          <p className="text-headline-sm font-bold" style={{ color: offer.promotionColor || '#0F766E' }}>
            {discount}
          </p>
        ) : null}

        <p className="text-sm text-on-surface-variant line-clamp-3">{offer.description}</p>

        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-medium text-on-surface-variant">
          <span>{OFFER_TYPE_LABELS[offer.type]}</span>
          <span>
            · {new Date(offer.startsAt).toLocaleDateString()} – {new Date(offer.endsAt).toLocaleDateString()}
          </span>
          {offer.serviceAreaDistricts?.length ? <span>· {offer.serviceAreaDistricts.join(', ')}</span> : null}
          {offer.customerVisible ? (
            <span className="text-emerald-700">· Live for customers</span>
          ) : (
            <span>· Not public</span>
          )}
        </div>

        {offer.lifecycle === 'active' && offer.analytics.expiryCountdownHours > 0 ? (
          <p className="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">
            <Icon name="timer" className="text-[14px]" />
            Ends in {offer.analytics.expiryCountdownHours}h
            {offer.analytics.remainingRedemptions != null
              ? ` · ${offer.analytics.remainingRedemptions} left`
              : ''}
          </p>
        ) : null}

        {offer.rejectionReason && offer.lifecycle === 'rejected' ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            Rejected: {offer.rejectionReason}
          </p>
        ) : null}

        {actions}
      </div>
    </article>
  )
}
