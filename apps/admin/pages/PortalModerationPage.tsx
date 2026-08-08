import { useState } from 'react'
import { getFriendlyErrorMessage, portfolioApi, referralApi, communityApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Button, StatusBadge } from '../components/ui'
import { PageHeader } from '../components/ui'
import { CopyableId } from '../components/CopyableId'
import { safeArray } from '@fixnow/utils'

export function PortalModerationPage() {
  const [tab, setTab] = useState<'portfolio' | 'referrals' | 'community'>('portfolio')
  const [error, setError] = useState<string | null>(null)

  const portfolio = useAsync(async () => (await portfolioApi.adminList({ limit: 50 })).data.items, [], {
    cacheKey: 'admin.portfolio.mod',
  })
  const campaigns = useAsync(async () => (await referralApi.adminListCampaigns({ limit: 50 })).data.items, [], {
    cacheKey: 'admin.referral.campaigns',
  })
  const referrals = useAsync(async () => (await referralApi.adminListReferrals({ limit: 50 })).data.items, [], {
    cacheKey: 'admin.referrals',
  })
  const community = useAsync(async () => (await communityApi.adminList({ limit: 50 })).data.items, [], {
    cacheKey: 'admin.community',
  })
  const communityStats = useAsync(async () => (await communityApi.adminStats()).data, [], {
    cacheKey: 'admin.community.stats',
  })

  const seedCampaigns = async () => {
    setError(null)
    try {
      await referralApi.adminSeedCampaigns()
      await campaigns.reload()
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portal production"
        subtitle="Moderate portfolios, configure referral campaigns, and manage community discussions."
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['portfolio', 'Portfolio moderation'],
            ['referrals', 'Referral campaigns'],
            ['community', 'Community moderation'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold ${
              tab === id ? 'border-primary bg-primary text-white' : 'border-outline-variant text-ink-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}

      {tab === 'portfolio' ? (
        <AsyncStateView
          status={portfolio.status}
          error={portfolio.error}
          onRetry={() => void portfolio.reload()}
          emptyTitle="No portfolio items pending"
          emptyHint="Technician uploads awaiting review appear here."
        >
          <div className="space-y-3">
            {safeArray(portfolio.data).map((item) => {
              const row = item as Record<string, unknown>
              return (
                <div key={String(row.id)} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{String(row.title || row.kind || 'Item')}</p>
                      <p className="text-xs text-ink-muted">
                        {String(row.targetType || row.kind || 'media')} · {String(row.status || '')}
                      </p>
                    </div>
                    <StatusBadge label={String(row.status || 'pending')} tone="warning" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['approve', 'reject', 'feature', 'archive'].map((action) => (
                      <Button
                        key={action}
                        variant="outline"
                        onClick={() =>
                          void portfolioApi
                            .adminModerate(String(row.id), {
                              targetType:
                                String(row.targetType) === 'certificate'
                                  ? 'certificate'
                                  : String(row.targetType) === 'case_study'
                                    ? 'case_study'
                                    : 'media',
                              action,
                            })
                            .then(() => portfolio.reload())
                            .catch((err) => setError(getFriendlyErrorMessage(err)))
                        }
                      >
                        {action}
                      </Button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </AsyncStateView>
      ) : null}

      {tab === 'referrals' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void seedCampaigns()}>Seed default campaigns</Button>
            <Button variant="outline" onClick={() => void campaigns.reload()}>
              Refresh
            </Button>
          </div>
          <AsyncStateView
            status={campaigns.status}
            error={campaigns.error}
            onRetry={() => void campaigns.reload()}
            emptyTitle="No referral campaigns"
            emptyHint="Seed defaults or create a campaign with reward rules."
          >
            <div className="space-y-3">
              {safeArray(campaigns.data).map((c) => {
                const row = c as Record<string, unknown>
                return (
                  <div key={String(row.id)} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-semibold">{String(row.name)}</p>
                        <p className="text-xs text-ink-muted">
                          {String(row.inviteRole)} · {String(row.trigger)} · {String(row.rewardType)} ×{' '}
                          {String(row.rewardAmount)} · issued {String(row.rewardsIssued ?? 0)}
                        </p>
                      </div>
                      <StatusBadge
                        label={String(row.status)}
                        tone={row.status === 'active' ? 'success' : 'neutral'}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['active', 'paused', 'archived'].map((status) => (
                        <Button
                          key={status}
                          variant="outline"
                          onClick={() =>
                            void referralApi
                              .adminSetCampaignStatus(String(row.id), status)
                              .then(() => campaigns.reload())
                              .catch((err) => setError(getFriendlyErrorMessage(err)))
                          }
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </AsyncStateView>

          <h3 className="font-semibold">Recent referrals</h3>
          <div className="space-y-2">
            {safeArray(referrals.data).map((r) => {
              const row = r as Record<string, unknown>
              return (
                <div key={String(row.id)} className="space-y-1 rounded-xl border border-border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyableId value={String(row.code ?? '')} label="Referral code" />
                    <span className="text-ink-muted">· {String(row.status)}</span>
                  </div>
                  {row.referrerId ? (
                    <div className="flex items-center gap-1 text-xs text-ink-muted">
                      <span>Referrer</span>
                      <CopyableId value={String(row.referrerId)} label="Referrer ID" />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {tab === 'community' ? (
        <div className="space-y-4">
          {communityStats.data ? (
            <div className="grid gap-3 sm:grid-cols-4">
              {(
                [
                  ['discussions', 'Discussions', communityStats.data.discussions],
                  ['replies', 'Replies', communityStats.data.replies],
                  ['openReports', 'Open reports', communityStats.data.openReports],
                  ['helpfulVotes', 'Helpful votes', communityStats.data.helpfulVotes],
                ] as const
              ).map(([key, label, value]) => (
                <div key={key} className="rounded-xl border border-border bg-canvas-white p-3">
                  <p className="text-xs uppercase text-ink-muted">{label}</p>
                  <p className="text-lg font-bold tabular-nums">{Number(value ?? 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : null}
          <AsyncStateView
            status={community.status}
            error={community.error}
            onRetry={() => void community.reload()}
            emptyTitle="No flagged discussions"
            emptyHint="Reported or pending community posts appear here."
          >
            <div className="space-y-3">
              {safeArray(community.data).map((d) => {
                const row = d as Record<string, unknown>
                return (
                  <div key={String(row.id)} className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                    <p className="font-semibold">{String(row.title || 'Discussion')}</p>
                    <p className="text-xs text-ink-muted">
                      {String(row.status)} · reports {String(row.reportCount ?? 0)} · replies{' '}
                      {String(row.replyCount ?? 0)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['approve', 'remove', 'lock', 'pin', 'feature', 'archive'].map((action) => (
                        <Button
                          key={action}
                          variant="outline"
                          onClick={() =>
                            void communityApi
                              .adminModerate(String(row.id), {
                                targetType: 'discussion',
                                targetId: String(row.id),
                                action,
                              })
                              .then(() => community.reload())
                              .catch((err) => setError(getFriendlyErrorMessage(err)))
                          }
                        >
                          {action}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </AsyncStateView>
        </div>
      ) : null}
    </div>
  )
}
