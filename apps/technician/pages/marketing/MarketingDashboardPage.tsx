import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  formatUgx,
  getFriendlyErrorMessage,
  offersApi,
  type TechnicianOffer,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, Icon } from '@fixnow/ui'
import { safeArray, safeNumber, safeObject } from '@fixnow/utils'
import { OfferCard } from './OfferCard'
import {
  ConversionFunnel,
  MetricCard,
  QuickAction,
  SectionHeader,
  SuggestionList,
} from './MarketingWidgets'
import { offerSuggestions } from './offerUtils'

export function MarketingDashboardPage() {
  const navigate = useNavigate()

  const query = useAsync(async () => {
    const [dash, list] = await Promise.all([offersApi.dashboard(), offersApi.listMine({ limit: 50 })])
    const counts = safeObject(dash.data?.counts)
    const totals = safeObject(dash.data?.totals)
    return {
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
      totals: {
        offers: safeNumber(totals.offers),
        views: safeNumber(totals.views),
        clicks: safeNumber(totals.clicks),
        bookings: safeNumber(totals.bookings),
        revenueGenerated: safeNumber(totals.revenueGenerated),
        conversionRate: safeNumber(totals.conversionRate),
      },
      recent: safeArray<TechnicianOffer>(dash.data?.recent),
      offers: safeArray<TechnicianOffer>(list.data?.items),
    }
  }, [])

  const offers = useMemo(() => safeArray<TechnicianOffer>(query.data?.offers), [query.data])

  const lastOffer = useMemo(
    () =>
      [...offers].sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      )[0],
    [offers],
  )

  const boostCandidate = useMemo(
    () =>
      offers
        .filter((o) => o.lifecycle === 'active' || o.lifecycle === 'expired')
        .sort((a, b) => safeNumber(b.analytics?.views) - safeNumber(a.analytics?.views))[0],
    [offers],
  )

  const suggestions = useMemo(() => offerSuggestions(offers), [offers])

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <div className="space-y-8 animate-fade-up">
          <SectionHeader
            title="Marketing dashboard"
            subtitle="How your promotions are performing across FixNow."
            action={
              <Link to="/technician/marketing/create">
                <Button>
                  <Icon name="campaign" />
                  Create offer
                </Button>
              </Link>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              label="Active offers"
              value={query.data.counts.active}
              icon="bolt"
              tone="success"
              hint="Visible to customers now"
            />
            <MetricCard
              label="Pending approval"
              value={query.data.counts.pending}
              icon="hourglass_top"
              hint="Awaiting review"
            />
            <MetricCard label="Total views" value={query.data.totals.views} icon="visibility" />
            <MetricCard
              label="Bookings from offers"
              value={query.data.totals.bookings}
              icon="event_available"
              tone="primary"
            />
            <MetricCard
              label="Revenue generated"
              value={formatUgx(query.data.totals.revenueGenerated)}
              icon="payments"
              tone="success"
            />
          </div>

          <ConversionFunnel
            views={query.data.totals.views}
            clicks={query.data.totals.clicks}
            bookings={query.data.totals.bookings}
          />

          <section className="space-y-3">
            <h3 className="text-title text-on-surface">Quick actions</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <QuickAction
                icon="add_circle"
                title="Create offer"
                description="Build a new promotion with live customer preview."
                onClick={() => navigate('/technician/marketing/create')}
              />
              <QuickAction
                icon="content_copy"
                title="Duplicate previous offer"
                description={
                  lastOffer ? `Start from "${lastOffer.title}"` : 'Create an offer first to duplicate it.'
                }
                disabled={!lastOffer}
                onClick={() =>
                  lastOffer && navigate(`/technician/marketing/create?duplicate=${lastOffer.id}`)
                }
              />
              <QuickAction
                icon="rocket_launch"
                title="Boost existing offer"
                description={
                  boostCandidate
                    ? `Extend & re-run "${boostCandidate.title}"`
                    : 'Boost becomes available once an offer goes live.'
                }
                disabled={!boostCandidate}
                onClick={() =>
                  boostCandidate && navigate(`/technician/marketing/create?boost=${boostCandidate.id}`)
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-title text-on-surface">Offer status</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['Drafts', query.data.counts.draft, '/technician/marketing/drafts'],
                  ['Pending', query.data.counts.pending, '/technician/marketing/pending'],
                  ['Scheduled', query.data.counts.scheduled, '/technician/marketing/scheduled'],
                  ['Active', query.data.counts.active, '/technician/marketing/active'],
                ] as const
              ).map(([label, value, href]) => (
                <Link
                  key={label}
                  to={href}
                  className="rounded-2xl border border-border-subtle bg-canvas-white p-4 transition hover:border-primary/40"
                >
                  <p className="text-label text-on-surface-variant">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </Link>
              ))}
            </div>
          </section>

          <SuggestionList suggestions={suggestions} />

          <section>
            <SectionHeader
              title="Recent offers"
              action={
                <Link
                  to="/technician/marketing/offers"
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  View all
                </Link>
              }
            />
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {query.data.recent.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No offers yet. Create your first promotion to appear more often in customer search.
                </p>
              ) : (
                query.data.recent.map((offer) => <OfferCard key={offer.id} offer={offer} />)
              )}
            </div>
          </section>
        </div>
      ) : null}
    </AsyncStateView>
  )
}

export function MarketingOffersListPage({ lifecycle, title }: { lifecycle?: string; title: string }) {
  const navigate = useNavigate()
  const query = useAsync(
    async () => safeArray<TechnicianOffer>((await offersApi.listMine({ lifecycle, limit: 50 })).data?.items),
    [lifecycle],
  )

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await query.reload()
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <SectionHeader
        title={title}
        action={
          <Link to="/technician/marketing/create">
            <Button variant="outline">Create offer</Button>
          </Link>
        }
      />

      <AsyncStateView
        status={query.status}
        error={query.error}
        onRetry={() => void query.reload()}
        emptyTitle="No offers here"
        emptyHint="Create an offer or switch to another status filter."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {safeArray<TechnicianOffer>(query.data).map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              actions={
                <div className="flex flex-wrap gap-2 pt-1">
                  {offer.lifecycle === 'draft' || offer.lifecycle === 'rejected' ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/technician/marketing/create?edit=${offer.id}`)}
                      >
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => void act(() => offersApi.submit(offer.id))}>
                        Submit for approval
                      </Button>
                    </>
                  ) : null}

                  {offer.lifecycle === 'pending' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void act(() => offersApi.withdraw(offer.id))}
                    >
                      Withdraw to draft
                    </Button>
                  ) : null}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/technician/marketing/create?duplicate=${offer.id}`)}
                  >
                    Duplicate
                  </Button>

                  {offer.lifecycle === 'active' || offer.lifecycle === 'expired' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/technician/marketing/create?boost=${offer.id}`)}
                    >
                      Boost
                    </Button>
                  ) : null}

                  {offer.lifecycle !== 'archived' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void act(() => offersApi.archive(offer.id))}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              }
            />
          ))}
        </div>
      </AsyncStateView>
    </div>
  )
}
