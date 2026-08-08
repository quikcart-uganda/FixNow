import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUgx, offersApi, type TechnicianOffer } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, Icon } from '@fixnow/ui'
import { safeArray, safeNumber, safeObject } from '@fixnow/utils'
import { OfferCard } from './OfferCard'
import { BarChart, ConversionFunnel, MetricCard, SectionHeader, SuggestionList } from './MarketingWidgets'
import { offerSuggestions } from './offerUtils'

type SortKey = 'views' | 'bookings' | 'revenue' | 'conversion'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'views', label: 'Most viewed' },
  { key: 'bookings', label: 'Most booked' },
  { key: 'revenue', label: 'Highest revenue' },
  { key: 'conversion', label: 'Best converting' },
]

function sortOffers(offers: TechnicianOffer[], key: SortKey): TechnicianOffer[] {
  return [...offers].sort((a, b) => {
    if (key === 'views') return safeNumber(b.analytics?.views) - safeNumber(a.analytics?.views)
    if (key === 'bookings') return safeNumber(b.analytics?.bookings) - safeNumber(a.analytics?.bookings)
    if (key === 'revenue')
      return safeNumber(b.analytics?.revenueGenerated) - safeNumber(a.analytics?.revenueGenerated)
    return safeNumber(b.analytics?.conversionRate) - safeNumber(a.analytics?.conversionRate)
  })
}

export function MarketingAnalyticsPage() {
  const [sort, setSort] = useState<SortKey>('views')

  const query = useAsync(async () => {
    const [dash, list] = await Promise.all([offersApi.dashboard(), offersApi.listMine({ limit: 50 })])
    const totals = safeObject(dash.data?.totals)
    const counts = safeObject(dash.data?.counts)
    return {
      totals: {
        offers: safeNumber(totals.offers),
        views: safeNumber(totals.views),
        clicks: safeNumber(totals.clicks),
        bookings: safeNumber(totals.bookings),
        revenueGenerated: safeNumber(totals.revenueGenerated),
        conversionRate: safeNumber(totals.conversionRate),
      },
      counts: {
        draft: safeNumber(counts.draft),
        pending: safeNumber(counts.pending),
        scheduled: safeNumber(counts.scheduled),
        active: safeNumber(counts.active),
        paused: safeNumber(counts.paused),
        expired: safeNumber(counts.expired),
        rejected: safeNumber(counts.rejected),
        archived: safeNumber(counts.archived),
      },
      offers: safeArray<TechnicianOffer>(list.data?.items),
    }
  }, [])

  const offers = useMemo(() => safeArray<TechnicianOffer>(query.data?.offers), [query.data])
  const ranked = useMemo(() => sortOffers(offers, sort), [offers, sort])
  const suggestions = useMemo(() => offerSuggestions(offers), [offers])

  const redemptionRate = useMemo(() => {
    const totals = query.data?.totals
    if (!totals || totals.views === 0) return 0
    return Number(((totals.bookings / totals.views) * 100).toFixed(1))
  }, [query.data])

  const estimatedRevenuePerBooking = useMemo(() => {
    const totals = query.data?.totals
    if (!totals || totals.bookings === 0) return 0
    return Math.round(totals.revenueGenerated / totals.bookings)
  }, [query.data])

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <div className="space-y-8 animate-fade-up">
          <SectionHeader
            title="Offer analytics"
            subtitle="Where your promotions win attention, and where they lose it."
            action={
              <Link to="/technician/marketing/create">
                <Button variant="outline">Create offer</Button>
              </Link>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Views" value={query.data.totals.views} icon="visibility" />
            <MetricCard label="Clicks" value={query.data.totals.clicks} icon="ads_click" />
            <MetricCard
              label="Bookings"
              value={query.data.totals.bookings}
              icon="event_available"
              tone="primary"
            />
            <MetricCard
              label="Redemption rate"
              value={`${redemptionRate}%`}
              icon="redeem"
              hint="Bookings ÷ views"
            />
            <MetricCard
              label="Conversion rate"
              value={`${query.data.totals.conversionRate}%`}
              icon="trending_up"
              hint="Bookings ÷ clicks"
            />
            <MetricCard
              label="Revenue generated"
              value={formatUgx(query.data.totals.revenueGenerated)}
              icon="payments"
              tone="success"
              hint={
                estimatedRevenuePerBooking
                  ? `≈ ${formatUgx(estimatedRevenuePerBooking)} per booking`
                  : undefined
              }
            />
          </div>

          <ConversionFunnel
            views={query.data.totals.views}
            clicks={query.data.totals.clicks}
            bookings={query.data.totals.bookings}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart
              title="Views by offer"
              data={sortOffers(offers, 'views')
                .slice(0, 6)
                .map((o) => ({ label: o.title, value: safeNumber(o.analytics?.views) }))}
            />
            <BarChart
              title="Revenue by offer"
              data={sortOffers(offers, 'revenue')
                .slice(0, 6)
                .map((o) => ({ label: o.title, value: safeNumber(o.analytics?.revenueGenerated) }))}
              formatValue={formatUgx}
            />
          </div>

          <SuggestionList suggestions={suggestions} />

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-title text-on-surface">Per-offer performance</h3>
              <div className="flex flex-wrap gap-2">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={sort === s.key}
                    onClick={() => setSort(s.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      sort === s.key
                        ? 'border-primary bg-primary text-white'
                        : 'border-border-subtle text-on-surface-variant hover:border-primary/40'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {ranked.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No offers to analyse yet.</p>
            ) : (
              <div className="space-y-4">
                {ranked.map((offer) => (
                  <div key={offer.id} className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
                    <OfferCard offer={offer} compact />
                    <div className="grid grid-cols-2 gap-3 content-start">
                      <MetricCard label="Views" value={offer.analytics.views} />
                      <MetricCard label="Clicks" value={offer.analytics.clicks} />
                      <MetricCard label="Bookings" value={offer.analytics.bookings} />
                      <MetricCard label="Conversion" value={`${offer.analytics.conversionRate}%`} />
                      <MetricCard label="Revenue" value={formatUgx(offer.analytics.revenueGenerated)} />
                      <MetricCard
                        label="Redemptions left"
                        value={offer.analytics.remainingRedemptions ?? 'Unlimited'}
                      />
                      <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-subtle bg-canvas-white p-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant">
                          <Icon name="timer" className="text-[16px]" />
                          {offer.lifecycle === 'expired'
                            ? 'Expired'
                            : `${offer.analytics.expiryCountdownHours}h remaining`}
                        </span>
                        <Link to={`/technician/marketing/create?duplicate=${offer.id}`}>
                          <Button size="sm" variant="outline">
                            Duplicate
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </AsyncStateView>
  )
}
