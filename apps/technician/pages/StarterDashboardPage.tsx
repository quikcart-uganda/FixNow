import { Link } from 'react-router-dom'
import { useCallback } from 'react'
import { Badge, Button, Card, Icon } from '@fixnow/ui'
import { GuaranteeChip } from '@technician/components/trust/Trust'
import { useApp } from '@technician/context/AppContext'
import { formatUgx, jobsApi, mapAssignedJob, mapNearbyJob } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { safeArray } from '@fixnow/utils'
import { PullToRefresh } from '@fixnow/native'
import { DeveloperPreviewBanner } from '@technician/components/DeveloperPreviewBanner'
import { DevelopmentSubscriptionSimulatorPanel } from '@technician/components/DevelopmentSubscriptionSimulatorPanel'
import { useDashboardIntegrityMetrics } from '@technician/hooks/useDashboardIntegrityMetrics'
import {
  DashSectionHeader,
  PremiumKpiCard,
  WorkspaceQuickLink,
} from '@technician/components/dashboard/PremiumDashboardWidgets'

/**
 * Starter home — intentionally minimal: essential tools, basic analytics, fast.
 * Phase 2: stripped of Free/Pro density so upgrade to Professional is obvious.
 */
export function StarterDashboardPage() {
  const { profile, entitlementPlanCode, previewActive } = useApp()
  const integrity = useDashboardIntegrityMetrics([entitlementPlanCode, previewActive])

  const nearbyQuery = useAsync(async () => {
    const res = await jobsApi.nearby()
    return safeArray(res.data?.items).map(mapNearbyJob)
  }, [entitlementPlanCode, previewActive], { cacheKey: `technician.feed.starter.${entitlementPlanCode || 'x'}` })

  const assignedQuery = useAsync(async () => {
    const res = await jobsApi.list({ mine: 'true' })
    return safeArray(res.data?.items).map(mapAssignedJob)
  }, [entitlementPlanCode, previewActive], { cacheKey: `technician.assigned.starter.${entitlementPlanCode || 'x'}` })

  const reloadDashboard = useCallback(() => {
    void nearbyQuery.reload()
    void assignedQuery.reload()
    integrity.reload()
  }, [nearbyQuery.reload, assignedQuery.reload, integrity.reload])

  useRealtimeReload(reloadDashboard, [
    SOCKET_EVENTS.JOB_CREATED,
    SOCKET_EVENTS.JOB_PUBLISHED,
    SOCKET_EVENTS.JOB_ASSIGNED,
    SOCKET_EVENTS.JOB_STATUS_CHANGED,
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
    SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
  ])

  const nearbyJobs = safeArray(nearbyQuery.data)
  const assignedJobs = safeArray(assignedQuery.data).filter((j) => j.status !== 'Completed')
  const activeCount = assignedJobs.length
  const firstName = profile.name.split(' ')[0] || 'Pro'
  const weekEarnings = integrity.earnings.weekReleased

  return (
    <PullToRefresh onRefresh={reloadDashboard} className="fn-plan-starter fn-theme-starter space-y-4 animate-fade-up">
      <DeveloperPreviewBanner />
      <DevelopmentSubscriptionSimulatorPanel />

      <section className="rounded-2xl border border-border-subtle bg-surface px-5 py-5 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2.5 py-1 text-caps text-primary">Starter</span>
          <span className="text-caps text-on-surface-variant">Simple workspace</span>
        </div>
        <h1 className="mt-2 text-headline text-on-surface">Hi, {firstName}</h1>
        <p className="mt-1 text-body text-on-surface-variant">
          {nearbyQuery.isLoading ? 'Loading…' : `${nearbyJobs.length} jobs nearby`} · Essential tools only
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <GuaranteeChip />
          <Link to="/technician/jobs">
            <Button className="min-h-11">
              <Icon name="near_me" />
              Find work
            </Button>
          </Link>
        </div>
      </section>

      <DashSectionHeader title="Essentials" subtitle="What matters right now" />
      <section className="grid grid-cols-2 gap-3">
        <PremiumKpiCard label="Available" value={nearbyJobs.length} icon="work" to="/technician/jobs" delayMs={30} />
        <PremiumKpiCard label="Active" value={activeCount} icon="assignment" to="/technician/active" delayMs={60} />
        <PremiumKpiCard
          label="Rating"
          value={profile.rating.toFixed(1)}
          icon="star"
          to="/technician/reviews"
          delayMs={90}
        />
        <PremiumKpiCard
          label="This week"
          value={formatUgx(weekEarnings)}
          icon="payments"
          to="/technician/earnings"
          delayMs={120}
        />
      </section>

      <Card className="border-border-subtle p-5">
        <p className="text-caps text-primary">Your plan</p>
        <h3 className="mt-1 text-title">Starter · unlimited applications</h3>
        <p className="mt-2 text-label text-on-surface-variant">
          Clean, fast home for applying and completing jobs. Upgrade to Professional for premium productivity tools.
        </p>
        <Link to="/technician/upgrade" className="mt-4 inline-block">
          <Button variant="outline" className="min-h-10">
            See Professional
          </Button>
        </Link>
      </Card>

      <DashSectionHeader title="Quick actions" />
      <section className="grid gap-3 sm:grid-cols-2">
        <WorkspaceQuickLink
          to="/technician/jobs"
          icon="near_me"
          label="Nearby jobs"
          sub={`${nearbyJobs.length} open`}
        />
        <WorkspaceQuickLink
          to="/technician/active"
          icon="assignment"
          label="Active jobs"
          sub={`${activeCount} in progress`}
        />
        <WorkspaceQuickLink
          to="/technician/portfolio"
          icon="photo_library"
          label="Portfolio"
          sub={integrity.portfolioSubtitle}
        />
        <WorkspaceQuickLink
          to="/technician/availability"
          icon="schedule"
          label="Availability"
          sub={profile.availability || 'Set status'}
        />
      </section>

      {nearbyJobs[0] ? (
        <Card className="overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="notifications" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-label font-bold">Latest nearby job</p>
                {nearbyJobs[0].urgent ? <Badge tone="error">URGENT</Badge> : null}
              </div>
              <p className="mt-1 text-body text-on-surface-variant">{nearbyJobs[0].title}</p>
            </div>
          </div>
        </Card>
      ) : null}
    </PullToRefresh>
  )
}

export default StarterDashboardPage
