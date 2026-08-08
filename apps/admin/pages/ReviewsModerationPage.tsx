import { reviewsApi, getFriendlyErrorMessage, timeAgo } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button } from '@fixnow/ui'
import { PageHeader } from '../components/ui'
import { safeArray } from '@fixnow/utils'

export function ReviewsModerationPage() {
  const stats = useAsync(async () => (await reviewsApi.analytics()).data, [])
  const flagged = useAsync(async () => {
    const res = await reviewsApi.adminList({ flagged: true, limit: 50 })
    return safeArray<{ kind: string; review: Record<string, unknown> }>(res.data?.items)
  }, [])

  useRealtimeReload(
    () => {
      void stats.reload()
      void flagged.reload()
    },
    [SOCKET_EVENTS.REVIEW_SUBMITTED, SOCKET_EVENTS.REVIEW_EDITED],
  )

  return (
    <div className="space-y-8">
      <PageHeader title="Review moderation" subtitle="Flagged reviews, analytics, and reputation health." />

      <AsyncStateView status={stats.status} error={stats.error} onRetry={() => void stats.reload()}>
        {stats.data ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['Total reviews', stats.data.totalReviews],
              ['Peer reviews', stats.data.peerReviews],
              ['Flagged', stats.data.flaggedReviews],
              ['Avg rating', stats.data.averageRating],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                <p className="text-sm text-ink-muted">{String(label)}</p>
                <p className="mt-1 text-2xl font-bold">{String(value ?? 0)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </AsyncStateView>

      <AsyncStateView
        status={flagged.status}
        error={flagged.error}
        onRetry={() => void flagged.reload()}
        emptyTitle="No flagged reviews"
        emptyHint="Flagged or abusive reviews will appear here for moderation."
      >
        <div className="space-y-3">
          {safeArray(flagged.data).map((row) => {
            const r = row.review
            const id = String(r._id ?? r.id)
            return (
              <div key={id} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {row.kind} · {String(r.overallRating)}★
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">{String(r.comment || 'No comment')}</p>
                    <p className="mt-2 text-xs text-outline">{r.createdAt ? timeAgo(String(r.createdAt)) : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['approve', 'hide', 'remove'] as const).map((action) => (
                      <Button
                        key={action}
                        variant="outline"
                        onClick={() => {
                          void reviewsApi
                            .moderate(id, action)
                            .then(() => {
                              void flagged.reload()
                              void stats.reload()
                            })
                            .catch((err) => window.alert(getFriendlyErrorMessage(err)))
                        }}
                      >
                        {action}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </AsyncStateView>
    </div>
  )
}
