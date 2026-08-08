import { Link } from 'react-router-dom'
import { Button, Card, Icon } from '@fixnow/ui'
import { useAsync } from '@fixnow/hooks'
import { subscriptionsApi, technicianMarketingApi } from '@fixnow/api'
import { AsyncStateView } from '@fixnow/shared'
import { safeNumber } from '@fixnow/utils'

/**
 * Business-only Marketing Centre — CMS-style hub over existing creatives + offers.
 */
export function MarketingCentrePage() {
  const query = useAsync(async () => {
    const [mine, dash, creatives] = await Promise.all([
      subscriptionsApi.getMine(),
      technicianMarketingApi.professionalDashboard(),
      technicianMarketingApi.listMine(),
    ])
    return { mine: mine.data, dash: dash.data, creatives: creatives.data }
  }, [])

  const allowed = Boolean(
    query.data?.mine?.entitlements?.featureFlags?.marketingCentre ||
      query.data?.dash?.subscription?.marketingCentre ||
      query.data?.dash?.subscription?.isBusiness,
  )

  if (query.status === 'success' && !allowed) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <Icon name="lock" className="mx-auto text-[36px] text-warning" />
        <h1 className="text-headline">Marketing Centre is a Business feature</h1>
        <p className="text-body text-on-surface-variant">
          Upgrade to Business for the company CMS: homepage campaigns, seasonal promotions, and coordinated offers.
        </p>
        <Link to="/technician/upgrade">
          <Button className="min-h-11">View Business plan</Button>
        </Link>
        <Link to="/technician/marketing/creatives" className="block text-label text-primary">
          Or continue with Professional marketing studio →
        </Link>
      </Card>
    )
  }

  return (
    <AsyncStateView status={query.status} error={query.error} onRetry={() => void query.reload()}>
      {query.data ? (
        <div className="space-y-6 animate-fade-up">
          <div>
            <p className="text-caps text-primary">Business Marketing Centre</p>
            <h1 className="text-headline">Plan campaigns like a company CMS</h1>
            <p className="mt-2 text-body text-on-surface-variant">
              Create advertising, offers, announcements, and portfolio campaigns. Admin approval is required before
              customers see anything.
            </p>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Capacity
              label="Homepage slides"
              used={safeNumber(query.data.dash.performance.liveSlides)}
              max={safeNumber(
                query.data.dash.limits.homepageSlideCap || query.data.dash.limits.maxAdvertisingSlides,
              )}
            />
            <Capacity
              label="Banners"
              used={safeNumber(query.data.dash.performance.liveBanners)}
              max={safeNumber(query.data.dash.limits.maxPromotionalBanners)}
            />
            <Capacity
              label="Active offers"
              used={safeNumber(query.data.dash.performance.activeOffers)}
              max={safeNumber(query.data.dash.limits.maxActiveOffers)}
            />
            <Capacity
              label="Announcements"
              used={safeNumber(query.data.dash.performance.liveAnnouncements)}
              max={safeNumber(query.data.dash.limits.maxAnnouncements)}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <HubCard
              title="Advertising campaigns"
              body="Homepage & rotating slides with headline, CTA, and expiry."
              to="/technician/marketing/creatives"
              icon="slideshow"
            />
            <HubCard
              title="Promotional offers"
              body="Bundles, holiday deals, emergency discounts — up to plan limit."
              to="/technician/marketing/create"
              icon="local_offer"
            />
            <HubCard
              title="Announcements"
              body="Customer notices and seasonal messages."
              to="/technician/marketing/creatives"
              icon="campaign"
            />
            <HubCard
              title="Portfolio campaigns"
              body="Highlight case studies and completed company projects."
              to="/technician/marketing/creatives"
              icon="photo_library"
            />
            <HubCard
              title="Offer analytics"
              body="Views, clicks, bookings across live promotions."
              to="/technician/marketing/analytics"
              icon="insights"
            />
            <HubCard
              title="Pending approvals"
              body={`${safeNumber(query.data.dash.performance.pendingApprovals)} items awaiting FixNow review.`}
              to="/technician/marketing/pending"
              icon="pending_actions"
            />
          </section>
        </div>
      ) : null}
    </AsyncStateView>
  )
}

function Capacity({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
  return (
    <Card className="p-4">
      <p className="text-caps text-on-surface-variant">{label}</p>
      <p className="mt-2 text-title">
        {used} / {max}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </Card>
  )
}

function HubCard({
  title,
  body,
  to,
  icon,
}: {
  title: string
  body: string
  to: string
  icon: string
}) {
  return (
    <Link to={to}>
      <Card className="h-full p-5 transition hover:border-primary/40">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon name={icon} />
        </div>
        <p className="mt-3 text-title">{title}</p>
        <p className="mt-1 text-label text-on-surface-variant">{body}</p>
      </Card>
    </Link>
  )
}

export default MarketingCentrePage
