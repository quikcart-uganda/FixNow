import { Link } from 'react-router-dom'
import { useCallback } from 'react'
import { StatCard, Card, Button, Icon, FreeJobsMeter, Badge } from '@fixnow/ui'
import { GuaranteeChip, ReputationLadder, TrustScoreHero } from '@technician/components/trust/Trust'
import { useApp } from '@technician/context/AppContext'
import { formatUgx, jobsApi, mapAssignedJob, mapNearbyJob, marketingApi, technicianApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, MarketingRails, SponsoredHeroBanner, useContentBlocks } from '@fixnow/shared'
import { safeArray } from '@fixnow/utils'
import { PullToRefresh } from '@fixnow/native'
import { ProfileCompletionBanner } from '@technician/components/ProfileCompletionBanner'
import { SubscriptionReminderBanner } from '@technician/components/SubscriptionReminderBanner'
import { DeveloperPreviewBanner } from '@technician/components/DeveloperPreviewBanner'
import { useDashboardIntegrityMetrics } from '@technician/hooks/useDashboardIntegrityMetrics'
import { ProfessionalDashboardPage } from '@technician/pages/ProfessionalDashboardPage'
import { BusinessDashboardPage } from '@technician/pages/BusinessDashboardPage'
import { StarterDashboardPage } from '@technician/pages/StarterDashboardPage'

/** Plan-aware home router — no hooks here (avoids paid/free hook-order mismatches). */
export function DashboardPage() {
  const { profile, hasActiveSubscription, entitlementPlanCode } = useApp()
  const planCode = String(entitlementPlanCode || profile.subscriptionPlanCode || '').toUpperCase()
  const paidActive = hasActiveSubscription

  if (paidActive && planCode === 'BUSINESS') {
    return <BusinessDashboardPage />
  }
  if (paidActive && planCode === 'PROFESSIONAL') {
    return <ProfessionalDashboardPage />
  }
  if (paidActive) {
    return <StarterDashboardPage />
  }
  return <FreeDashboardHome />
}

function FreeDashboardHome() {
  const { profile, isLocked, remainingFreeJobs } = useApp()
  const tips = useContentBlocks('technician', 'technician.dashboard')
  const integrity = useDashboardIntegrityMetrics([])

  const nearbyQuery = useAsync(async () => {
    const res = await jobsApi.nearby()
    return safeArray(res.data?.items).map(mapNearbyJob)
  }, [], { cacheKey: 'technician.feed.v1' })

  const assignedQuery = useAsync(async () => {
    const res = await jobsApi.list({ mine: 'true' })
    return safeArray(res.data?.items).map((j) => mapAssignedJob(j))
  }, [], { cacheKey: 'technician.assigned.v1' })

  const dashboardQuery = useAsync(async () => {
    const res = await technicianApi.dashboard()
    return res.data.summary as Record<string, unknown> | undefined
  }, [], { cacheKey: 'technician.dashboard.v1' })

  const marketingQuery = useAsync(async () => {
    const res = await marketingApi.deliverTechnician({ placement: 'home' })
    return res.data
  }, [], { cacheKey: 'technician.dashboard.marketing.v1', cacheFreshMs: 2 * 60_000 })

  const heroQuery = useAsync(async () => {
    const res = await marketingApi.deliverTechnician({ placement: 'dashboard_hero' })
    return safeArray(res.data?.sponsored)
  }, [], { cacheKey: 'technician.dashboard.hero.v1', cacheFreshMs: 2 * 60_000 })

  const reloadDashboard = useCallback(() => {
    void nearbyQuery.reload()
    void assignedQuery.reload()
    void dashboardQuery.reload()
    void marketingQuery.reload()
    void heroQuery.reload()
    integrity.reload()
  }, [
    nearbyQuery.reload,
    assignedQuery.reload,
    dashboardQuery.reload,
    marketingQuery.reload,
    heroQuery.reload,
    integrity.reload,
  ])

  useRealtimeReload(reloadDashboard, [
    SOCKET_EVENTS.JOB_CREATED,
    SOCKET_EVENTS.JOB_PUBLISHED,
    SOCKET_EVENTS.JOB_CANCELLED,
    SOCKET_EVENTS.JOB_UPDATED,
    SOCKET_EVENTS.JOB_ASSIGNED,
    SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
    SOCKET_EVENTS.JOB_STATUS_CHANGED,
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
    SOCKET_EVENTS.AVAILABILITY_CHANGED,
  ])

  const nearbyJobs = safeArray(nearbyQuery.data)
  const assignedJobs = safeArray(assignedQuery.data).filter((j) => j.status !== 'Completed')
  const activeCount = assignedJobs.length

  return (
    <PullToRefresh onRefresh={reloadDashboard} className="space-y-6 animate-fade-up">
      <section>
        <h1 className="text-headline text-on-surface">Welcome back, {profile.name.split(' ')[0] || 'Pro'}.</h1>
        <p className="text-body text-on-surface-variant">
          {nearbyQuery.isLoading ? 'Loading jobs…' : `${nearbyJobs.length} new jobs in your area today`} ·{' '}
          {profile.district}
        </p>
        <div className="mt-3">
          <GuaranteeChip />
        </div>
      </section>

      <DeveloperPreviewBanner />
      <ProfileCompletionBanner />
      <SubscriptionReminderBanner />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrustScoreHero
            trust={profile.trust}
            level={profile.level}
            blurb={
              tips.pick('blurb')?.body ||
              `You're building reputation in ${profile.district}. Keep winning nearby jobs.`
            }
          />
        </div>
        <Card className="flex flex-col justify-between p-6">
          <Link
            to={isLocked ? '/technician/locked' : '/technician/upgrade'}
            className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Open free job limit details"
          >
            <h3 className="text-title">Marketplace Health</h3>
            <p className="mt-1 text-label text-on-surface-variant">Free completed-job quota</p>
            <div className="mt-6">
              <FreeJobsMeter used={profile.freeJobsUsed} limit={profile.freeJobLimit} />
            </div>
            {isLocked ? (
              <p className="mt-3 text-label text-warning">
                Free jobs exhausted — browse & notifications still work. Subscribe to apply.
              </p>
            ) : (
              <p className="mt-3 text-label text-on-surface-variant">
                {remainingFreeJobs} free completed job{remainingFreeJobs === 1 ? '' : 's'} remaining.
              </p>
            )}
          </Link>
          <Link to="/technician/upgrade" className="mt-6 block">
            <Button fullWidth>
              <Icon name="upgrade" />
              Upgrade Plan
            </Button>
          </Link>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Available Jobs" value={nearbyJobs.length} to="/technician/jobs" />
        <StatCard label="Assigned Jobs" value={activeCount} to="/technician/active" />
        <StatCard
          label="Completed Jobs"
          value={profile.jobsCompleted}
          hint={`of ${profile.freeJobLimit} free`}
          to="/technician/active"
        />
        <StatCard
          label="Rating"
          value={profile.rating.toFixed(1)}
          hint={`${profile.reviewCount} reviews`}
          to="/technician/reviews"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard label="Jobs Won" value={profile.jobsWon} to="/technician/achievements" />
        <StatCard
          label="Earnings"
          value={formatUgx(integrity.earnings.weekReleased)}
          hint="this week"
          to="/technician/earnings"
        />
        <StatCard
          label="Response score"
          value={`${Number(dashboardQuery.data?.responseRate ?? profile.responseRate)}%`}
          to="/technician/reputation"
        />
      </section>

      <Card className="p-5">
        <ReputationLadder current={profile.level} />
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.badges.map((b) => (
            <Link key={b.id} to="/technician/achievements" aria-label={`Badge: ${b.label}`}>
              <Badge tone={b.tone} icon={b.icon}>
                {b.label}
              </Badge>
            </Link>
          ))}
          {!profile.badges.length ? (
            <Link to="/technician/achievements" className="text-label font-semibold text-primary">
              View achievements →
            </Link>
          ) : null}
        </div>
      </Card>

      {heroQuery.data?.length ? (
        <SponsoredHeroBanner items={heroQuery.data} fallbackHref="/technician/marketing" />
      ) : null}

      <section className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-title">Quick Actions</h3>
          {[
            ['/technician/jobs', 'near_me', 'Nearby Jobs', `${nearbyJobs.length} available near you`, 'bg-primary-fixed'],
            ['/technician/active', 'assignment', 'Active Jobs', `${activeCount} in progress`, 'bg-secondary-container'],
            ['/technician/portfolio', 'photo_library', 'Portfolio', 'Update your work showcase', 'bg-tertiary-fixed'],
            ['/technician/community', 'forum', 'Ask a Technician', 'Help neighbors · earn points', 'bg-primary-fixed'],
          ].map(([to, icon, title, sub, bg]) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center justify-between rounded-2xl border border-border-subtle bg-surface p-4 transition hover:bg-trust-blue-subtle"
            >
              <div className="flex items-center gap-4">
                <span className={`rounded-xl p-3 text-primary ${bg}`}>
                  <Icon name={icon} className="transition group-hover:scale-110" />
                </span>
                <div>
                  <p className="text-label font-bold text-on-surface">{title}</p>
                  <p className="text-caps text-on-surface-variant">{sub}</p>
                </div>
              </div>
              <Icon name="chevron_right" className="text-outline" />
            </Link>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-title">Recent Activity</h3>
          <Card className="overflow-hidden">
            <AsyncStateView
              status="empty"
              emptyTitle="No recent reviews yet"
              emptyHint="When customers rate your completed jobs, their feedback will show up here."
              emptyActionLabel="View reviews"
              emptyActionHref="/technician/reviews"
              className="min-h-[160px]"
            />
            <div className="flex items-start gap-4 border-t border-border-subtle p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="notification_important" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between gap-2">
                  <p className="text-label font-bold">New Job Alert</p>
                  {nearbyJobs[0]?.urgent ? <Badge tone="error">URGENT</Badge> : null}
                </div>
                <p className="mt-1 text-body text-on-surface-variant">
                  {nearbyJobs[0]?.title ?? 'Check nearby jobs for new opportunities'}
                </p>
                <span className="mt-2 block text-caps text-outline">
                  {nearbyJobs[0]?.postedAgo ?? 'Browse feed'}
                </span>
              </div>
            </div>
            <Link
              to="/technician/notifications"
              className="block border-t border-border-subtle p-4 text-center text-label font-bold text-primary hover:bg-surface-container-low"
            >
              View All Activity
            </Link>
          </Card>
        </div>
      </section>

      {marketingQuery.data ? (
        <MarketingRails
          channel="technician"
          promotions={marketingQuery.data.promotions}
          educational={marketingQuery.data.educational}
          advertisements={marketingQuery.data.advertisements}
        />
      ) : null}

      {tips.list('feature').length ? (
        <Card className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-3">
            {tips.list('feature').slice(0, 3).map((block) => (
              <div key={block.id} className="border-b border-border-subtle p-5 md:border-r md:border-b-0 last:border-0">
                <Icon name={block.icon || 'tips_and_updates'} className="text-primary" />
                <p className="mt-2 text-title">{block.title}</p>
                <p className="mt-1 text-label text-on-surface-variant">{block.body}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-3">
            {[
              ['Complete more jobs', 'work', 'Stay online during peak hours to win more nearby work.'],
              ['Get verified', 'verified_user', 'Verified pros earn more trust and higher booking rates.'],
              ['Track earnings', 'payments', 'Mobile Money payouts keep your cashflow moving.'],
            ].map(([title, icon, body]) => (
              <div key={title} className="border-b border-border-subtle p-5 md:border-r md:border-b-0 last:border-0">
                <Icon name={icon} className="text-primary" />
                <p className="mt-2 text-title">{title}</p>
                <p className="mt-1 text-label text-on-surface-variant">{body}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </PullToRefresh>
  )
}

export default DashboardPage
