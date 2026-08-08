import { achievementsApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { Card, Icon, ProgressBar } from '@fixnow/ui'
import { safeArray } from '@fixnow/utils'

export function AchievementsPage() {
  const query = useAsync(async () => {
    const res = await achievementsApi.mine()
    return {
      items: safeArray<{
        userAchievement: Record<string, unknown>
        achievement?: Record<string, unknown>
      }>(res.data?.items),
      badges: safeArray<Record<string, unknown>>(res.data?.badges),
    }
  }, [])

  useRealtimeReload(() => void query.reload(), [SOCKET_EVENTS.BADGE_EARNED, SOCKET_EVENTS.TRUST_SCORE_UPDATED])

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-headline">Achievements & badges</h1>
        <p className="text-body text-on-surface-variant">Milestones earned from completed jobs and reviews</p>
      </div>

      <Card className="p-5">
        <h2 className="text-title">Your badges</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {safeArray(query.data?.badges).length ? (
            safeArray(query.data?.badges).map((b) => (
              <span
                key={String(b._id ?? b.key)}
                className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-3 py-1 text-sm"
              >
                <Icon name={String(b.icon || 'workspace_premium')} className="text-[16px] text-primary" />
                {String(b.name)}
              </span>
            ))
          ) : (
            <p className="text-sm text-on-surface-variant">No badges yet — complete jobs and earn 5-star reviews.</p>
          )}
        </div>
      </Card>

      <AsyncStateView
        status={query.status}
        error={query.error}
        onRetry={() => void query.reload()}
        emptyTitle="No achievements yet"
        emptyHint="Progress unlocks as you complete jobs and collect reviews."
      >
        <div className="space-y-3">
          {safeArray(query.data?.items).map((row) => {
            const ach = row.achievement || {}
            const ua = row.userAchievement || {}
            const target = Number(ach.target ?? 1)
            const progress = Number(ua.progress ?? 0)
            return (
              <Card key={String(ua._id ?? ach.key)} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{String(ach.title ?? 'Achievement')}</p>
                    <p className="text-sm text-on-surface-variant">{String(ach.description ?? '')}</p>
                  </div>
                  <span className="text-xs text-outline">
                    {ua.unlockedAt ? 'Unlocked' : `${progress}/${target}`}
                  </span>
                </div>
                <ProgressBar value={progress} max={target} className="mt-3" barClassName="bg-primary" />
              </Card>
            )
          })}
        </div>
      </AsyncStateView>
    </div>
  )
}
