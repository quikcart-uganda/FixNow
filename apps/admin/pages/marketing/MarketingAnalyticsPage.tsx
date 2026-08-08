import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatUgx, marketingApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { cn } from '@fixnow/utils'
import { Icon } from '../../components/ui'

type FocusKey =
  | 'overview'
  | 'live'
  | 'pending'
  | 'promotions'
  | 'sponsored'
  | 'traffic'
  | 'ctr'
  | 'conversion'
  | 'revenue'

const FOCUS_META: Record<
  FocusKey,
  { title: string; description: string; href?: string; hrefLabel?: string }
> = {
  overview: {
    title: 'Marketing overview',
    description: 'Campaign totals across offers, promotions, and sponsored content.',
  },
  live: {
    title: 'Offer manager',
    description: 'Customer-visible live offers. Manage and archive from the approved queue.',
    href: '/admin/marketing/approved',
    hrefLabel: 'Open offer manager',
  },
  pending: {
    title: 'Approval queue',
    description: 'Technician offers awaiting moderation before customers can see them.',
    href: '/admin/marketing/pending',
    hrefLabel: 'Open approval queue',
  },
  promotions: {
    title: 'Promotion manager',
    description: 'Platform-owned promotions, schedules, and status controls.',
    href: '/admin/marketing/platform',
    hrefLabel: 'Open promotion manager',
  },
  sponsored: {
    title: 'Campaign manager',
    description: 'Active sponsored campaigns and partner placements.',
    href: '/admin/marketing/campaigns',
    hrefLabel: 'Open campaign manager',
  },
  traffic: {
    title: 'Traffic analytics',
    description: 'Views across offers and promotions. Most-viewed inventory is listed below.',
  },
  ctr: {
    title: 'CTR dashboard',
    description: 'Click-through performance. Improve creative and targeting where CTR is low.',
  },
  conversion: {
    title: 'Conversion analytics',
    description: 'Redemptions and bookings relative to clicks.',
  },
  revenue: {
    title: 'Financial impact',
    description: 'Attributed campaign revenue generated from tracked redemptions.',
    href: '/admin/payments',
    hrefLabel: 'Open financial reports',
  },
}

function DrillCard({
  label,
  value,
  hint,
  icon,
  active,
  onSelect,
}: {
  label: string
  value: string | number
  hint?: string
  icon: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group rounded-2xl border bg-canvas-white p-4 text-left transition duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
        active ? 'border-primary shadow-sm ring-1 ring-primary/20' : 'border-border-subtle',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon name={icon} className="!text-[20px]" />
        </span>
        <Icon
          name="chevron_right"
          className={cn(
            '!text-[18px] text-ink-muted transition',
            active ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100',
          )}
        />
      </div>
      <p className="mt-3 text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </button>
  )
}

export function MarketingAnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const focusParam = (params.get('focus') || 'overview') as FocusKey
  const [focus, setFocus] = useState<FocusKey>(FOCUS_META[focusParam] ? focusParam : 'overview')

  useEffect(() => {
    const next = (params.get('focus') || 'overview') as FocusKey
    setFocus(FOCUS_META[next] ? next : 'overview')
  }, [params])

  const query = useAsync(async () => (await marketingApi.analytics()).data, [])

  const meta = FOCUS_META[focus]

  const detailRows = useMemo(() => {
    if (!query.data) return []
    if (focus === 'traffic' || focus === 'ctr') return query.data.mostViewed
    if (focus === 'conversion' || focus === 'revenue') return query.data.mostRedeemed
    return []
  }, [query.data, focus])

  function selectFocus(next: FocusKey) {
    setFocus(next)
    const copy = new URLSearchParams(params)
    if (next === 'overview') copy.delete('focus')
    else copy.set('focus', next)
    setParams(copy, { replace: true })
  }

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DrillCard
              label="Live offers"
              value={query.data.totals.liveOffers}
              icon="local_offer"
              active={focus === 'live'}
              onSelect={() => selectFocus('live')}
            />
            <DrillCard
              label="Pending approval"
              value={query.data.totals.pendingOffers}
              icon="pending_actions"
              active={focus === 'pending'}
              onSelect={() => selectFocus('pending')}
            />
            <DrillCard
              label="Platform promotions"
              value={query.data.totals.platformPromotions}
              icon="campaign"
              active={focus === 'promotions'}
              onSelect={() => selectFocus('promotions')}
            />
            <DrillCard
              label="Sponsored active"
              value={query.data.totals.sponsoredActive}
              icon="star"
              active={focus === 'sponsored'}
              onSelect={() => selectFocus('sponsored')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DrillCard
              label="Views"
              value={query.data.totals.views}
              icon="visibility"
              active={focus === 'traffic'}
              onSelect={() => selectFocus('traffic')}
            />
            <DrillCard
              label="Clicks"
              value={query.data.totals.clicks}
              hint={`CTR ${query.data.totals.ctr}%`}
              icon="ads_click"
              active={focus === 'ctr'}
              onSelect={() => selectFocus('ctr')}
            />
            <DrillCard
              label="Redemptions / bookings"
              value={query.data.totals.redemptions}
              hint={`Conversion ${query.data.totals.conversion}%`}
              icon="redeem"
              active={focus === 'conversion'}
              onSelect={() => selectFocus('conversion')}
            />
            <DrillCard
              label="Revenue generated"
              value={formatUgx(query.data.totals.revenueGenerated)}
              icon="payments"
              active={focus === 'revenue'}
              onSelect={() => selectFocus('revenue')}
            />
          </div>

          <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Drill-down</p>
                <h3 className="mt-1 text-lg font-semibold text-ink-primary">{meta.title}</h3>
                <p className="mt-1 max-w-2xl text-sm text-ink-muted">{meta.description}</p>
              </div>
              {meta.href ? (
                <Link
                  to={meta.href}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  {meta.hrefLabel}
                  <Icon name="arrow_forward" className="!text-[16px]" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => selectFocus('overview')}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Reset focus
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface-alt/60 px-4 py-3">
                <p className="text-xs text-ink-muted">Customer engagement</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{query.data.totals.customerEngagement}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-alt/60 px-4 py-3">
                <p className="text-xs text-ink-muted">CTR</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{query.data.totals.ctr}%</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-alt/60 px-4 py-3">
                <p className="text-xs text-ink-muted">Conversion</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{query.data.totals.conversion}%</p>
              </div>
            </div>

            {detailRows.length ? (
              <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
                {detailRows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="truncate text-ink-secondary">{row.title}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink-primary">
                      {'views' in row ? `${row.views} views` : null}
                      {'bookings' in row && !('views' in row) ? `${row.bookings} bookings` : null}
                      {'revenue' in row ? ` · ${formatUgx(row.revenue)}` : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : focus === 'overview' || focus === 'live' || focus === 'pending' || focus === 'promotions' || focus === 'sponsored' ? (
              <p className="mt-5 text-sm text-ink-muted">
                Use the action above to open the dedicated workspace, or select Views / Clicks / Redemptions for ranked inventory.
              </p>
            ) : (
              <p className="mt-5 text-sm text-ink-muted">No data available</p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <h3 className="font-semibold text-ink-primary">Most viewed</h3>
              <ul className="mt-3 space-y-2">
                {query.data.mostViewed.map((row) => (
                  <li key={row.id} className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-ink-secondary">{row.title}</span>
                    <span className="font-semibold tabular-nums">{row.views}</span>
                  </li>
                ))}
                {!query.data.mostViewed.length ? <li className="text-sm text-ink-muted">No data available</li> : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <h3 className="font-semibold text-ink-primary">Most redeemed</h3>
              <ul className="mt-3 space-y-2">
                {query.data.mostRedeemed.map((row) => (
                  <li key={row.id} className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-ink-secondary">{row.title}</span>
                    <span className="font-semibold tabular-nums">{row.bookings}</span>
                  </li>
                ))}
                {!query.data.mostRedeemed.length ? <li className="text-sm text-ink-muted">No data available</li> : null}
              </ul>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <h3 className="font-semibold text-ink-primary">Top technicians</h3>
              <ul className="mt-3 space-y-2">
                {query.data.topTechnicians.map((row) => (
                  <li key={row.technicianId} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-medium text-ink-primary">{row.name}</span>
                      <span className="tabular-nums text-ink-muted">{row.bookings} bookings</span>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {row.offers} offers · {formatUgx(row.revenue)}
                    </p>
                  </li>
                ))}
                {!query.data.topTechnicians.length ? <li className="text-sm text-ink-muted">No data available</li> : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </AsyncStateView>
  )
}
