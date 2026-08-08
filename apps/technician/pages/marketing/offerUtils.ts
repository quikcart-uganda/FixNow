import type { OfferInput, TechnicianOffer } from '@fixnow/api'

export const WEEKDAYS = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
]

export function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function defaultOfferForm(): OfferInput {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 14)
  return {
    type: 'percentage_discount',
    title: '',
    subtitle: '',
    description: '',
    terms: '',
    bannerImageUrl: '',
    promotionColor: '#0F766E',
    badge: 'Special offer',
    categoryIds: [],
    serviceNames: [],
    serviceAreaDistricts: [],
    availabilityNote: '',
    discountValue: 10,
    currency: 'UGX',
    minimumBookingAmount: undefined,
    maximumDiscountAmount: undefined,
    maxRedemptions: 50,
    perCustomerLimit: 1,
    startsAt: toLocalInputValue(start),
    endsAt: toLocalInputValue(end),
    timeStart: '',
    timeEnd: '',
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    holidayNotes: '',
  }
}

/** Maps a saved offer back into editable wizard state. */
export function offerToForm(o: TechnicianOffer): OfferInput {
  return {
    type: o.type,
    title: o.title,
    subtitle: o.subtitle || '',
    description: o.description,
    terms: o.terms || '',
    bannerImageUrl: o.bannerImageUrl || '',
    promotionColor: o.promotionColor || '#0F766E',
    badge: o.badge || '',
    categoryIds: o.categoryIds || [],
    serviceNames: o.serviceNames || [],
    serviceAreaDistricts: o.serviceAreaDistricts || [],
    availabilityNote: o.availabilityNote || '',
    discountValue: o.discountValue,
    currency: o.currency || 'UGX',
    minimumBookingAmount: o.minimumBookingAmount,
    maximumDiscountAmount: o.maximumDiscountAmount,
    maxRedemptions: o.maxRedemptions,
    perCustomerLimit: o.perCustomerLimit,
    startsAt: toLocalInputValue(new Date(o.startsAt)),
    endsAt: toLocalInputValue(new Date(o.endsAt)),
    timeStart: o.timeStart || '',
    timeEnd: o.timeEnd || '',
    weekdays: o.weekdays || [],
    holidayNotes: o.holidayNotes || '',
  }
}

/** Duplicate: same creative, fresh title + forward-shifted window. */
export function duplicateOfferForm(o: TechnicianOffer): OfferInput {
  const base = offerToForm(o)
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setDate(start.getDate() + 1)
  const originalSpanMs = Math.max(
    24 * 60 * 60 * 1000,
    new Date(o.endsAt).getTime() - new Date(o.startsAt).getTime(),
  )
  const end = new Date(start.getTime() + originalSpanMs)
  return {
    ...base,
    title: `${o.title} (copy)`.slice(0, 120),
    startsAt: toLocalInputValue(start),
    endsAt: toLocalInputValue(end),
  }
}

/** Boost: extend the window and raise visibility framing without changing the deal. */
export function boostOfferForm(o: TechnicianOffer): OfferInput {
  const base = duplicateOfferForm(o)
  const start = new Date(base.startsAt)
  const end = new Date(start)
  end.setDate(end.getDate() + 30)
  return {
    ...base,
    title: `${o.title} — Boosted`.slice(0, 120),
    badge: 'Boosted',
    weekdays: WEEKDAYS.map((d) => d.id),
    endsAt: toLocalInputValue(end),
  }
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function lifecycleTone(life: string) {
  if (life === 'active') return 'bg-emerald-50 text-emerald-800'
  if (life === 'pending') return 'bg-amber-50 text-amber-800'
  if (life === 'rejected') return 'bg-red-50 text-red-800'
  if (life === 'scheduled') return 'bg-sky-50 text-sky-800'
  if (life === 'draft') return 'bg-slate-100 text-slate-700'
  return 'bg-surface-container-low text-on-surface-variant'
}

export type OfferSuggestion = { tone: 'info' | 'warn' | 'good'; text: string }

/** Heuristic coaching derived from real offer data — no fabricated metrics. */
export function offerSuggestions(offers: TechnicianOffer[]): OfferSuggestion[] {
  const out: OfferSuggestion[] = []
  const live = offers.filter((o) => o.lifecycle === 'active' || o.lifecycle === 'scheduled')

  const expiringSoon = live.filter(
    (o) => o.analytics.expiryCountdownHours > 0 && o.analytics.expiryCountdownHours <= 72,
  )
  for (const o of expiringSoon.slice(0, 3)) {
    out.push({
      tone: 'warn',
      text: `"${o.title}" expires in about ${o.analytics.expiryCountdownHours}h — duplicate it to keep the momentum.`,
    })
  }

  const weekendOffers = live.filter((o) => {
    const days = o.weekdays || []
    return days.includes('sat') || days.includes('sun')
  })
  const weekdayOnly = live.filter((o) => {
    const days = o.weekdays || []
    return days.length > 0 && !days.includes('sat') && !days.includes('sun')
  })
  if (weekdayOnly.length && weekendOffers.length) {
    const weekendBookings = weekendOffers.reduce((sum, o) => sum + o.analytics.bookings, 0)
    const weekdayBookings = weekdayOnly.reduce((sum, o) => sum + o.analytics.bookings, 0)
    if (weekendBookings > weekdayBookings) {
      out.push({
        tone: 'good',
        text: 'Your weekend offers are converting better than weekday-only ones — add Sat/Sun to more promotions.',
      })
    }
  } else if (weekdayOnly.length && !weekendOffers.length) {
    out.push({
      tone: 'info',
      text: 'None of your live offers run on weekends. Households book more repairs on Sat/Sun — try adding them.',
    })
  }

  const noViews = live.filter((o) => o.analytics.views === 0)
  if (noViews.length) {
    out.push({
      tone: 'info',
      text: `${noViews.length} live offer${noViews.length > 1 ? 's have' : ' has'} no views yet. A banner image and a sharper title usually help.`,
    })
  }

  const highViewsLowClicks = live.filter((o) => o.analytics.views >= 25 && o.analytics.clicks === 0)
  for (const o of highViewsLowClicks.slice(0, 2)) {
    out.push({
      tone: 'warn',
      text: `"${o.title}" is being seen but not opened — try a stronger discount or clearer subtitle.`,
    })
  }

  const converting = live
    .filter((o) => o.analytics.clicks >= 5)
    .sort((a, b) => b.analytics.conversionRate - a.analytics.conversionRate)[0]
  if (converting && converting.analytics.conversionRate > 0) {
    out.push({
      tone: 'good',
      text: `"${converting.title}" converts at ${converting.analytics.conversionRate}% — boost it to run longer.`,
    })
  }

  if (!live.length) {
    out.push({
      tone: 'info',
      text: 'You have no live offers. Technicians with an active promotion appear more often in customer search.',
    })
  }

  return out.slice(0, 5)
}
