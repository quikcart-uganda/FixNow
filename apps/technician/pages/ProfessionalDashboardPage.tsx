import { Link } from 'react-router-dom'
import { useCallback, useMemo } from 'react'
import { Button, Card, Icon } from '@fixnow/ui'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { jobsApi, mapAssignedJob, mapNearbyJob, technicianMarketingApi, formatUgx } from '@fixnow/api'
import { AsyncStateView } from '@fixnow/shared'
import { useApp } from '@technician/context/AppContext'
import { DeveloperPreviewBanner } from '@technician/components/DeveloperPreviewBanner'
import { DevelopmentSubscriptionSimulatorPanel } from '@technician/components/DevelopmentSubscriptionSimulatorPanel'
import { visibilityLabelFromWeight } from '@technician/lib/subscriptionPresentation'
import { useDashboardIntegrityMetrics } from '@technician/hooks/useDashboardIntegrityMetrics'
import { safeArray, safeNumber } from '@fixnow/utils'
import {
  DashSectionHeader,
  InsightList,
  InsightMetricCard,
  JobsAttentionStrip,
  PlanHeroBadge,
  PremiumKpiCard,
  PriorityJobsList,
  TrendSparkline,
  WorkspaceQuickLink,
} from '@technician/components/dashboard/PremiumDashboardWidgets'

/** Professional — premium productivity workspace (Phase 2 differentiation). */
export function ProfessionalDashboardPage() {
  const { profile, entitlementPlanCode, previewActive } = useApp()
  const integrity = useDashboardIntegrityMetrics([
    profile.subscriptionPlanCode,
    profile.subscriptionStatus,
    entitlementPlanCode,
    previewActive,
  ])

  const query = useAsync(async () => {
    const [dash, nearby, assigned] = await Promise.all([
      technicianMarketingApi.professionalDashboard(),
      jobsApi.nearby().catch(() => ({ data: { items: [] } })),
      jobsApi.list({ mine: 'true' }).catch(() => ({ data: { items: [] } })),
    ])
    return {
      dash: dash.data,
      nearby: safeArray(nearby.data?.items).map(mapNearbyJob),
      assigned: safeArray(assigned.data?.items).map(mapAssignedJob),
    }
  }, [profile.subscriptionPlanCode, profile.subscriptionStatus, entitlementPlanCode, previewActive])

  const reload = useCallback(() => {
    void query.reload()
    integrity.reload()
  }, [query.reload, integrity.reload])

  useRealtimeReload(reload, [
    SOCKET_EVENTS.JOB_CREATED,
    SOCKET_EVENTS.JOB_PUBLISHED,
    SOCKET_EVENTS.JOB_ASSIGNED,
    SOCKET_EVENTS.JOB_STATUS_CHANGED,
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
    SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
  ])

  const weekEarnings = integrity.earnings.weekReleased

  const insights = useMemo(() => {
    if (!query.data) return []
    const tips = safeArray(query.data.dash.tips).filter((t): t is string => typeof t === 'string')
    const derived: string[] = []
    const pending = safeNumber(query.data.dash.performance.pendingApprovals)
    const nearby = query.data.nearby.length
    const clicks = safeNumber(query.data.dash.performance.offerClicks)
    const views = safeNumber(query.data.dash.performance.offerViews)
    if (nearby > 0) {
      derived.push(
        `${nearby} job${nearby === 1 ? '' : 's'} nearby — reply quickly to improve your chances of getting hired.`,
      )
    }
    if (pending > 0) {
      derived.push(
        `${pending} marketing item${pending === 1 ? '' : 's'} waiting for review before they go live.`,
      )
    }
    if (views > 0 && clicks / views < 0.05) {
      derived.push('Few people are tapping your offers — try clearer headlines and fresh before/after photos.')
    }
    if (weekEarnings > 0) {
      derived.push(`Income this week: ${formatUgx(weekEarnings)}. Stay available during busy hours.`)
    }
    if (integrity.portfolio.total === 0) {
      derived.push('Upload your first portfolio project so customers can see your work.')
    }
    if (Number(profile.responseRate) < 85) {
      derived.push('Reply quickly to new enquiries to increase your chances of getting hired.')
    }
    return [...derived, ...tips].slice(0, 6)
  }, [query.data, weekEarnings, integrity.portfolio.total, profile.responseRate])

  const trendSeries = useMemo(() => {
    if (!query.data) return [0, 0, 0, 0, 0, 0]
    const p = query.data.dash.performance
    return [
      safeNumber(p.offerViews),
      safeNumber(p.offerClicks) * 4,
      safeNumber(p.creativeViews),
      safeNumber(p.creativeClicks) * 4,
      safeNumber(p.offerBookings) * 8,
      Math.max(0, weekEarnings / 10000),
    ]
  }, [query.data, weekEarnings])

  const priorityJobs = useMemo(() => {
    if (!query.data) return []
    return [...query.data.nearby]
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 4)
      .map((j) => ({
        id: j.id,
        title: j.title,
        urgent: j.urgent,
        postedAgo: j.postedAgo,
        district: j.district,
      }))
  }, [query.data])

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <div className="fn-plan-professional fn-theme-professional space-y-6 animate-fade-up">
          <DeveloperPreviewBanner />
          <DevelopmentSubscriptionSimulatorPanel />

          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A2540] via-[#123A5C] to-[#1B5F7A] px-6 py-8 text-white shadow-[0_28px_56px_-24px_rgba(10,37,64,0.6)] md:px-8 fn-hero-shine">
            <div className="pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="flex flex-wrap items-center gap-3">
              <PlanHeroBadge>Your workspace</PlanHeroBadge>
              {query.data.dash.subscription.showPremiumBadge ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-400/20 px-3 py-1 text-caps text-amber-100">
                  <Icon name="verified" className="text-[16px]" filled />
                  Verified
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-display-mobile md:text-headline">
              Welcome back, {profile.name.split(' ')[0] || 'there'}.
            </h1>
            <p className="mt-2 max-w-2xl text-body text-white/85">
              {query.data.nearby.length > 0
                ? `You have ${query.data.nearby.length} job${query.data.nearby.length === 1 ? '' : 's'} nearby. Stay available to receive new work.`
                : "Here's what's happening today. Stay available to receive new work."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/technician/marketing/creatives">
                <Button className="min-h-11 bg-white text-[#0A2540] hover:bg-white/90 fn-pressable">
                  Marketing
                </Button>
              </Link>
              <Link to="/technician/jobs">
                <Button variant="outline" className="min-h-11 border-white/40 text-white hover:bg-white/10 fn-pressable">
                  Priority jobs
                </Button>
              </Link>
              <Link to="/technician/earnings">
                <Button variant="outline" className="min-h-11 border-white/40 text-white hover:bg-white/10 fn-pressable">
                  Income
                </Button>
              </Link>
            </div>
          </section>

          <JobsAttentionStrip
            nearbyCount={query.data.nearby.length}
            activeCount={query.data.assigned.filter((j) => j.status !== 'Completed').length}
            variant="professional"
          />

          <DashSectionHeader
            eyebrow="Overview"
            title="Your performance"
            subtitle="Monitor how customers find and hire you"
            tone="premium"
          />
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PremiumKpiCard
              label="Offer views"
              value={safeNumber(query.data.dash.performance.offerViews)}
              trend={safeNumber(query.data.dash.performance.offerClicks) > 0 ? 'Active' : undefined}
              icon="visibility"
              tone="premium"
              to="/technician/marketing/analytics"
              delayMs={40}
            />
            <PremiumKpiCard
              label="Offer clicks"
              value={safeNumber(query.data.dash.performance.offerClicks)}
              icon="ads_click"
              tone="premium"
              to="/technician/marketing"
              delayMs={80}
            />
            <PremiumKpiCard
              label="Ad clicks"
              value={safeNumber(query.data.dash.performance.creativeClicks)}
              hint={`${safeNumber(query.data.dash.performance.creativeViews)} views`}
              icon="campaign"
              tone="premium"
              to="/technician/marketing/creatives"
              delayMs={120}
            />
            <PremiumKpiCard
              label="Income this week"
              value={formatUgx(weekEarnings)}
              icon="payments"
              tone="premium"
              to="/technician/earnings"
              delayMs={160}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="fn-premium-surface border-primary/15 p-5 lg:col-span-1">
              <p className="text-caps text-on-surface-variant">Visibility</p>
              <p className="mt-2 text-title text-primary">
                {visibilityLabelFromWeight(safeNumber(query.data.dash.subscription.searchPriorityWeight))}
              </p>
              <div className="mt-4">
                <TrendSparkline values={trendSeries} label="Live activity indices" tone="premium" />
              </div>
              <p className="mt-2 text-label text-on-surface-variant">
                {query.data.dash.subscription.daysRemaining != null
                  ? `${query.data.dash.subscription.daysRemaining} days remaining on your plan`
                  : 'Your plan is active'}
              </p>
            </Card>
            <div className="lg:col-span-2">
              <PriorityJobsList jobs={priorityJobs} tone="premium" />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <InsightMetricCard
              title="Income"
              body="Figures come from your payout ledger and active offers — never placeholders."
              tone="premium"
              metrics={[
                { label: 'This week', value: formatUgx(weekEarnings) },
                { label: 'Completed jobs', value: String(profile.jobsCompleted) },
                { label: 'Response score', value: `${Number(profile.responseRate)}%` },
                {
                  label: 'Offer bookings',
                  value: String(safeNumber(query.data.dash.performance.offerBookings)),
                },
              ]}
              cta={{ to: '/technician/earnings', label: 'Open earnings' }}
            />
            <InsightMetricCard
              title="Portfolio"
              body={
                integrity.portfolio.total === 0
                  ? 'No portfolio items yet — upload photos or a video to build trust.'
                  : 'Keep your portfolio and reviews up to date so customers trust your work.'
              }
              tone="premium"
              metrics={[
                { label: 'Rating', value: profile.rating.toFixed(1) },
                { label: 'Reviews', value: String(profile.reviewCount) },
                { label: 'Photos', value: String(integrity.portfolio.photos) },
                { label: 'Videos', value: String(integrity.portfolio.videos) },
              ]}
              cta={{
                to: '/technician/portfolio',
                label: integrity.portfolio.total === 0 ? 'Upload your first video' : 'Update portfolio',
              }}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="fn-premium-surface p-5">
              <h3 className="text-title">Your marketing</h3>
              <ul className="mt-3 space-y-2 text-label text-on-surface-variant">
                <li>
                  Live slides: {safeNumber(query.data.dash.performance.liveSlides)} /{' '}
                  {safeNumber(query.data.dash.limits.maxAdvertisingSlides)}
                </li>
                <li>
                  Live banners: {safeNumber(query.data.dash.performance.liveBanners)} /{' '}
                  {safeNumber(query.data.dash.limits.maxPromotionalBanners)}
                </li>
                <li>
                  Active offers: {safeNumber(query.data.dash.performance.activeOffers)} /{' '}
                  {safeNumber(query.data.dash.limits.maxActiveOffers)}
                </li>
                <li>Pending review: {safeNumber(query.data.dash.performance.pendingApprovals)}</li>
              </ul>
              {safeNumber(query.data.dash.performance.activeOffers) === 0 &&
              safeNumber(query.data.dash.performance.liveSlides) === 0 ? (
                <p className="mt-3 text-label text-on-surface-variant">
                  0 offers · 0 slides — create your first offer to start tracking interest.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/technician/marketing/creatives">
                  <Button className="min-h-10 fn-pressable">Create ad</Button>
                </Link>
                <Link to="/technician/marketing/create">
                  <Button variant="outline" className="min-h-10 fn-pressable">
                    {safeNumber(query.data.dash.performance.activeOffers) === 0
                      ? 'Create your first offer'
                      : 'New offer'}
                  </Button>
                </Link>
              </div>
            </Card>
            <InsightList title="Suggestions for you" items={insights} tone="premium" />
          </section>

          <DashSectionHeader title="Quick actions" tone="premium" />
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <WorkspaceQuickLink to="/technician/jobs" icon="work" label="Priority jobs" sub="Find work nearby" tone="premium" />
            <WorkspaceQuickLink
              to="/technician/portfolio"
              icon="photo_library"
              label="Portfolio & videos"
              sub={integrity.portfolioSubtitle}
              tone="premium"
            />
            <WorkspaceQuickLink
              to="/technician/marketing"
              icon="campaign"
              label="Offers"
              sub={`${safeNumber(query.data.dash.performance.activeOffers)} active`}
              tone="premium"
            />
            <WorkspaceQuickLink to="/technician/earnings" icon="payments" label="Income" sub="Earnings & payouts" tone="premium" />
            <WorkspaceQuickLink to="/technician/reputation" icon="workspace_premium" label="Customer rating" sub="Build trust" tone="premium" />
            <WorkspaceQuickLink to="/technician/profile" icon="badge" label="Business profile" sub="Your public page" tone="premium" />
          </section>
        </div>
      ) : null}
    </AsyncStateView>
  )
}

export default ProfessionalDashboardPage
