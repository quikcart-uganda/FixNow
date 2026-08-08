import { useMemo } from 'react'
import { reviewsApi, timeAgo } from '@fixnow/api'
import { useAsync, useAuth, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Card, ProgressBar, StatCard } from '@fixnow/ui'
import { cn, safeArray, safeNumber, safeObject } from '@fixnow/utils'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { planEmptyCopy } from '@technician/lib/planWorkspace'

export function ReviewsPage() {
  const { user } = useAuth()
  const tier = usePlanWorkspaceTier()
  const emptyCopy = planEmptyCopy(tier, 'reviews')
  const techId = user?.id ?? ''

  const query = useAsync(async () => {
    if (!techId) return { items: [] as Array<Record<string, unknown>>, summary: null as null | Record<string, unknown> }
    const res = await reviewsApi.listForTechnician(techId, { limit: 50 })
    return {
      items: safeArray<Record<string, unknown>>(res.data?.items),
      summary: Object.keys(safeObject(res.data?.summary)).length ? safeObject(res.data?.summary) : null,
    }
  }, [techId])

  useRealtimeReload(
    () => void query.reload(),
    [SOCKET_EVENTS.REVIEW_SUBMITTED, SOCKET_EVENTS.REVIEW_EDITED, SOCKET_EVENTS.TRUST_SCORE_UPDATED],
  )

  const distribution = useMemo(() => {
    const dist = safeObject(query.data?.summary?.distribution)
    const total =
      Object.values(dist).reduce<number>((sum, value) => sum + safeNumber(value), 0) || 1
    return [5, 4, 3, 2, 1].map((star) => ({
      label: `${star} stars`,
      pct: Math.round((safeNumber(dist[String(star)]) / total) * 100),
    }))
  }, [query.data])

  const avg = Number(query.data?.summary?.ratingAverage ?? 0)
  const count = Number(query.data?.summary?.reviewCount ?? 0)

  return (
    <PlanWorkspaceShell page="reviews">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Average rating" value={avg.toFixed(1)} hint={`${count} reviews`} />
        <StatCard label="Public reviews" value={String(count)} />
        <StatCard
          label={tier === 'business' ? '5-star retention signal' : '5-star share'}
          value={`${distribution[0]?.pct ?? 0}%`}
        />
      </div>

      <Card
        className={cn(
          'p-5',
          tier === 'professional' && 'fn-premium-surface',
          tier === 'business' && 'fn-executive-surface',
        )}
      >
        <h2 className="text-title">
          {tier === 'business' ? 'Customer intelligence breakdown' : 'Review breakdown'}
        </h2>
        <div className="mt-4 space-y-3">
          {distribution.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-16 text-label">{row.label}</span>
              <ProgressBar value={row.pct} className="flex-1" barClassName="bg-warning" />
              <span className="w-10 text-right text-caps text-outline">{row.pct}%</span>
            </div>
          ))}
        </div>
        {tier === 'professional' || tier === 'business' ? (
          <p className="mt-4 text-label text-on-surface-variant">
            {tier === 'business'
              ? 'Use 5-star share as a brand-health KPI alongside Trust Score.'
              : 'Ask satisfied customers for a short review after completion to lift conversion.'}
          </p>
        ) : null}
      </Card>

      <AsyncStateView
        status={query.status}
        error={query.error}
        onRetry={() => void query.reload()}
        emptyTitle={emptyCopy.title}
        emptyHint={emptyCopy.hint}
      >
        <div className="space-y-3">
          {safeArray(query.data?.items).map((row) => {
            const review = (row.review || row) as Record<string, unknown>
            const customer = row.customer as Record<string, unknown> | undefined
            return (
              <Card
                key={String(review._id ?? review.id)}
                className={cn('p-4 fn-pressable', tier === 'business' && 'fn-executive-surface')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {String(customer?.fullName ?? 'Customer')} · {String(review.overallRating)}★
                    </p>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {String(review.comment || 'No written comment')}
                    </p>
                  </div>
                  <span className="text-xs text-outline">
                    {review.createdAt ? timeAgo(String(review.createdAt)) : ''}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      </AsyncStateView>
    </PlanWorkspaceShell>
  )
}
