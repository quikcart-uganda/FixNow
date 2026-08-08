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
  ActivityTimeline,
  DashSectionHeader,
  ForecastWidget,
  InsightList,
  InsightMetricCard,
  JobsAttentionStrip,
  MiniBarChart,
  PerformanceMeterRow,
  PlanHeroBadge,
  PremiumKpiCard,
  PriorityJobsList,
  TrendSparkline,
  WorkspaceQuickLink,
} from '@technician/components/dashboard/PremiumDashboardWidgets'

/** Business — executive command centre (Phase 2 luxury differentiation). */
export function BusinessDashboardPage() {
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

  const brand = profile.brandPrimaryColor || '#0F766E'
  const company = profile.companyName || profile.name.split(' ')[0] || 'Company'
  const weekEarnings = integrity.earnings.weekReleased

  const insights = useMemo(() => {
    if (!query.data) return []
    const tips = safeArray(query.data.dash.tips).filter((t): t is string => typeof t === 'string')
    const derived: string[] = []
    const views = safeNumber(query.data.dash.performance.offerViews)
    const clicks = safeNumber(query.data.dash.performance.offerClicks)
    const bookings = safeNumber(query.data.dash.performance.offerBookings)
    const ctr = views > 0 ? Math.round((clicks / views) * 100) : 0
    if (safeNumber(query.data.dash.performance.liveSlides) + safeNumber(query.data.dash.performance.activeOffers) === 0) {
      derived.push('No live campaigns yet — create your first offer or slide from Marketing Centre.')
    } else {
      derived.push('Review your campaigns each week so slides, offers, and announcements stay consistent.')
    }
    if (ctr > 0) {
      derived.push(`About ${ctr}% of viewers tap your offers — keep running what works and refresh weaker ads.`)
    }
    if (bookings > 0) {
      derived.push(
        `${bookings} booking${bookings === 1 ? '' : 's'} came from your offers — keep that messaging in your company branding.`,
      )
    }
    if (safeNumber(query.data.dash.performance.pendingApprovals) > 0) {
      derived.push('Clear items waiting for review so your campaigns can go live.')
    }
    if (weekEarnings > 0) {
      derived.push(`Weekly revenue ${formatUgx(weekEarnings)} — check your 30-day outlook below.`)
    }
    if (integrity.portfolio.total === 0) {
      derived.push('Add your first portfolio project so company branding has proof of work.')
    }
    return [...derived, ...tips].slice(0, 7)
  }, [query.data, weekEarnings, integrity.portfolio.total])

  const timeline = useMemo(() => {
    if (!query.data) return []
    const active = query.data.assigned.filter((j) => j.status !== 'Completed')
    return [
      {
        title: 'Marketing',
        detail: `${safeNumber(query.data.dash.performance.pendingApprovals)} waiting for review`,
        meta: 'Campaigns',
        icon: 'pending_actions',
      },
      {
        title: 'Nearby demand',
        detail: `${query.data.nearby.length} jobs near you`,
        meta: 'Jobs',
        icon: 'near_me',
      },
      {
        title: 'Active work',
        detail: `${active.length} jobs in progress`,
        meta: 'Field',
        icon: 'engineering',
      },
      {
        title: 'Customer trust',
        detail: `Rating ${profile.rating.toFixed(1)} · Trust ${profile.trust.trust} · Portfolio ${integrity.portfolio.total}`,
        meta: 'Reputation',
        icon: 'verified',
      },
    ]
  }, [query.data, profile.rating, profile.trust.trust, integrity.portfolio.total])

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

  const spark = useMemo(() => {
    if (!query.data) return [0, 0, 0, 0, 0, 0]
    const p = query.data.dash.performance
    return [
      safeNumber(p.offerViews),
      safeNumber(p.creativeViews),
      safeNumber(p.offerClicks) * 5,
      safeNumber(p.creativeClicks) * 5,
      safeNumber(p.offerBookings) * 10,
      Math.max(0, weekEarnings / 8000),
    ]
  }, [query.data, weekEarnings])

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <div className="fn-plan-business fn-theme-business space-y-6 animate-fade-up">
          <DeveloperPreviewBanner />
          <DevelopmentSubscriptionSimulatorPanel />

          <section
            className="relative overflow-hidden rounded-3xl px-6 py-10 text-white shadow-[0_32px_64px_-28px_rgba(17,24,39,0.7)] md:px-8 fn-hero-shine"
            style={{
              background: `linear-gradient(135deg, #0b1220 0%, #111827 38%, ${brand} 100%)`,
            }}
          >
            <div className="pointer-events-none absolute -left-10 bottom-0 h-48 w-48 rounded-full bg-teal-400/25 blur-3xl" />
            <div className="pointer-events-none absolute right-10 top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
            <div className="flex flex-wrap items-center gap-2">
              <PlanHeroBadge>Business</PlanHeroBadge>
              <span className="rounded-md bg-white/10 px-3 py-1 text-caps tracking-[0.14em]">Company workspace</span>
              {query.data.dash.subscription.verifiedBusinessBadge ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-teal-300/20 px-3 py-1 text-caps text-teal-100">
                  <Icon name="verified" className="text-[16px]" filled />
                  Verified business
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-display-mobile md:text-headline">
              Welcome back{company ? `, ${company}` : ''}.
            </h1>
            <p className="mt-2 max-w-2xl text-body text-white/88">
              {query.data.nearby.length > 0
                ? `Track revenue, team activity, and ${query.data.nearby.length} nearby job${query.data.nearby.length === 1 ? '' : 's'} from one place.`
                : 'Track revenue, campaigns, and customer growth from one place.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/technician/business/marketing-centre">
                <Button className="min-h-11 bg-white text-[#0b1220] hover:bg-white/90 fn-pressable">
                  Marketing
                </Button>
              </Link>
              <Link to="/technician/business/company">
                <Button variant="outline" className="min-h-11 border-white/40 text-white hover:bg-white/10 fn-pressable">
                  Company
                </Button>
              </Link>
              <Link to="/technician/earnings">
                <Button variant="outline" className="min-h-11 border-white/40 text-white hover:bg-white/10 fn-pressable">
                  Revenue
                </Button>
              </Link>
            </div>
          </section>

          <JobsAttentionStrip
            nearbyCount={query.data.nearby.length}
            activeCount={query.data.assigned.filter((j) => j.status !== 'Completed').length}
            variant="business"
          />

          <DashSectionHeader
            eyebrow="Overview"
            title="Business performance"
            subtitle="Revenue, customers, and visibility at a glance"
            tone="executive"
          />
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PremiumKpiCard
              label="Weekly revenue"
              value={formatUgx(weekEarnings)}
              icon="payments"
              tone="executive"
              to="/technician/earnings"
              delayMs={40}
            />
            <PremiumKpiCard
              label="Portfolio items"
              value={String(integrity.portfolio.total)}
              hint={`${integrity.portfolio.photos} photos · ${integrity.portfolio.videos} videos`}
              icon="photo_library"
              tone="executive"
              to="/technician/portfolio"
              delayMs={80}
            />
            <PremiumKpiCard
              label="Customer rating"
              value={profile.rating.toFixed(1)}
              hint={`${profile.reviewCount} reviews`}
              icon="star"
              tone="executive"
              to="/technician/reviews"
              delayMs={120}
            />
            <PremiumKpiCard
              label="Visibility"
              value={visibilityLabelFromWeight(safeNumber(query.data.dash.subscription.searchPriorityWeight))}
              icon="travel_explore"
              tone="executive"
              delayMs={160}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <ForecastWidget
              weeklyRevenue={weekEarnings}
              bookings={safeNumber(query.data.dash.performance.offerBookings)}
              completionRate={Number(profile.completionRate)}
            />
            <Card className="fn-executive-surface p-5">
              <p className="text-caps text-teal-800">Growth</p>
              <h3 className="mt-1 text-title">Customer growth</h3>
              <div className="mt-3">
                <TrendSparkline values={spark} label="Activity trend" tone="executive" />
              </div>
              <dl className="mt-3 space-y-2 text-label">
                <div className="flex justify-between gap-2">
                  <dt className="text-on-surface-variant">Completion rate</dt>
                  <dd className="font-semibold tabular-nums">{profile.completionRate}%</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-on-surface-variant">Jobs completed</dt>
                  <dd className="font-semibold tabular-nums">{profile.jobsCompleted}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-on-surface-variant">Trust score</dt>
                  <dd className="font-semibold tabular-nums">{profile.trust.trust}</dd>
                </div>
              </dl>
            </Card>
            <InsightMetricCard
              title="Customers"
              body="Track ratings and response score from live profile data."
              tone="executive"
              metrics={[
                { label: 'Rating', value: profile.rating.toFixed(1) },
                { label: 'Reviews', value: String(profile.reviewCount) },
                { label: 'Response score', value: `${Number(profile.responseRate)}%` },
                { label: 'Completed jobs', value: String(profile.jobsCompleted) },
              ]}
              cta={{ to: '/technician/reviews', label: 'Customer reviews' }}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <MiniBarChart
              title="Marketing performance"
              bars={[
                { label: 'Offer views', value: safeNumber(query.data.dash.performance.offerViews) },
                { label: 'Ad views', value: safeNumber(query.data.dash.performance.creativeViews) },
                { label: 'Ad clicks', value: safeNumber(query.data.dash.performance.creativeClicks) },
                { label: 'Bookings', value: safeNumber(query.data.dash.performance.offerBookings) },
              ]}
            />
            <PriorityJobsList jobs={priorityJobs} tone="executive" />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <PerformanceMeterRow
              tone="executive"
              items={[
                { label: 'Reliability', value: profile.trust.reliability },
                { label: 'Completion', value: profile.trust.completion },
                { label: 'Response', value: profile.trust.response },
                { label: 'Punctuality', value: profile.trust.punctuality },
              ]}
            />
            <InsightMetricCard
              title="Portfolio"
              body={
                integrity.portfolio.total === 0
                  ? '0 portfolio items — add your first project so customers can see your work.'
                  : 'Keep case studies and videos ready so customers can see your best work.'
              }
              tone="executive"
              metrics={[
                { label: 'Completed jobs', value: String(profile.jobsCompleted) },
                { label: 'Photos', value: String(integrity.portfolio.photos) },
                { label: 'Videos', value: String(integrity.portfolio.videos) },
                {
                  label: 'Offers live',
                  value: String(safeNumber(query.data.dash.performance.activeOffers)),
                },
              ]}
              cta={{
                to: '/technician/portfolio',
                label: integrity.portfolio.total === 0 ? 'Add your first portfolio project' : 'Open portfolio',
              }}
            />
            <Card className="fn-executive-surface p-5">
              <h3 className="text-title">Campaigns</h3>
              <ul className="mt-3 space-y-2 text-label text-on-surface-variant">
                <li>
                  Homepage slides:{' '}
                  {safeNumber(query.data.dash.performance.liveSlides)} /{' '}
                  {safeNumber(query.data.dash.limits.homepageSlideCap || query.data.dash.limits.maxAdvertisingSlides)}
                </li>
                <li>
                  Banners: {safeNumber(query.data.dash.performance.liveBanners)} /{' '}
                  {safeNumber(query.data.dash.limits.maxPromotionalBanners)}
                </li>
                <li>
                  Announcements: {safeNumber(query.data.dash.performance.liveAnnouncements)} /{' '}
                  {safeNumber(query.data.dash.limits.maxAnnouncements)}
                </li>
                <li>
                  Campaigns: {safeNumber(query.data.dash.performance.liveCampaigns)} · Pending:{' '}
                  {safeNumber(query.data.dash.performance.pendingApprovals)}
                </li>
              </ul>
              {safeNumber(query.data.dash.performance.liveSlides) +
                safeNumber(query.data.dash.performance.liveBanners) +
                safeNumber(query.data.dash.performance.activeOffers) ===
              0 ? (
                <p className="mt-3 text-label text-on-surface-variant">
                  0 campaigns live — create your first campaign from Marketing Centre.
                </p>
              ) : null}
              <Link to="/technician/business/marketing-centre" className="mt-4 inline-block">
                <Button className="min-h-10 fn-pressable">
                  {safeNumber(query.data.dash.performance.activeOffers) === 0
                    ? 'Create your first campaign'
                    : 'Open marketing'}
                </Button>
              </Link>
            </Card>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <ActivityTimeline items={timeline} />
            <InsightList title="Suggestions for you" items={insights} tone="executive" />
          </div>

          <DashSectionHeader title="Quick actions" tone="executive" />
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <WorkspaceQuickLink to="/technician/jobs" icon="work" label="Jobs" sub="Find and apply" tone="executive" />
            <WorkspaceQuickLink to="/technician/earnings" icon="payments" label="Revenue" sub="Income & payouts" tone="executive" />
            <WorkspaceQuickLink to="/technician/reviews" icon="star" label="Customer rating" sub="Reviews & trust" tone="executive" />
            <WorkspaceQuickLink to="/technician/business/team" icon="groups" label="Team activity" sub="Employees & dispatch" tone="executive" />
          </section>
        </div>
      ) : null}
    </AsyncStateView>
  )
}

export default BusinessDashboardPage
