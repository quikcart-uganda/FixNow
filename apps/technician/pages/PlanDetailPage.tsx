import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Icon, SubscriptionBadge } from '@fixnow/ui'
import { useAsync } from '@fixnow/hooks'
import { formatUgx, subscriptionsApi } from '@fixnow/api'
import { AsyncStateView } from '@fixnow/shared'
import { safeArray, safeNumber } from '@fixnow/utils'
import {
  presentCapabilities,
  presentLimits,
  presentVisibilityBenefit,
  TECHNICIAN_SUBSCRIPTION_FAQ,
} from '@technician/lib/subscriptionPresentation'

/**
 * Per-plan detail — benefits in technician language (no raw entitlement keys).
 */
export function PlanDetailPage() {
  const { code = 'starter' } = useParams()
  const navigate = useNavigate()
  const detail = useAsync(async () => (await subscriptionsApi.getPlanDetail(code)).data, [code])

  return (
    <AsyncStateView status={detail.status} error={detail.error} onRetry={() => void detail.reload()}>
      {detail.data ? (
        <div className="mx-auto max-w-3xl space-y-6 animate-fade-up">
          <button type="button" className="text-label text-primary" onClick={() => navigate('/technician/upgrade')}>
            ← All plans
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {detail.data.plan.badge?.enabled !== false &&
                (detail.data.plan.badge?.text || detail.data.plan.badge?.name) ? (
                  <SubscriptionBadge
                    text={String(detail.data.plan.badge.text || detail.data.plan.badge.name)}
                    icon={String(detail.data.plan.badge.icon || 'verified')}
                    color={String(detail.data.plan.badge.color || '#16A34A')}
                    borderColor={String(detail.data.plan.badge.borderColor || '')}
                    glow={Boolean(detail.data.plan.badge.glow)}
                  />
                ) : null}
              </div>
              <h1 className="mt-2 text-headline">{detail.data.plan.name}</h1>
              <p className="mt-2 text-body text-on-surface-variant">
                {String(detail.data.plan.overview || detail.data.plan.description)}
              </p>
            </div>
            {detail.data.plan.code !== 'FREE' && detail.data.discovery?.upgradesEnabled !== false ? (
              <Link to={`/technician/upgrade?plan=${detail.data.plan.code}&checkout=1`}>
                <Button className="min-h-11">Upgrade to {detail.data.plan.name}</Button>
              </Link>
            ) : null}
          </div>

          <Card className="grid gap-3 p-5 sm:grid-cols-3">
            <div>
              <p className="text-caps text-on-surface-variant">Monthly</p>
              <p className="text-title text-primary">
                {detail.data.plan.code === 'FREE' ? 'UGX 0' : formatUgx(detail.data.plan.priceMonthly)}
              </p>
            </div>
            <div>
              <p className="text-caps text-on-surface-variant">Quarterly</p>
              <p className="text-title">
                {detail.data.plan.code === 'FREE' ? '—' : formatUgx(detail.data.plan.priceQuarterly)}
              </p>
            </div>
            <div>
              <p className="text-caps text-on-surface-variant">Yearly</p>
              <p className="text-title">
                {detail.data.plan.code === 'FREE' ? '—' : formatUgx(detail.data.plan.priceYearly)}
              </p>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-title">What&apos;s included</h2>
            <ul className="space-y-2 text-label">
              {(() => {
                const visibility = presentVisibilityBenefit(detail.data.plan.limits || {})
                const fromFlags = presentCapabilities(detail.data.plan.featureFlags || {}).filter((b) => b.included)
                const fromCopy = safeArray(detail.data.plan.features)
                const seen = new Set<string>()
                const rows: string[] = []
                if (visibility) rows.push(visibility)
                for (const f of fromCopy) {
                  const t = String(f).trim()
                  if (!t || seen.has(t.toLowerCase())) continue
                  // Skip lines that look like raw keys or admin jargon.
                  if (/^[a-z]+[A-Z]/.test(t) || /weight|admin rules|algorithm/i.test(t)) continue
                  seen.add(t.toLowerCase())
                  rows.push(t)
                }
                for (const b of fromFlags) {
                  if (seen.has(b.label.toLowerCase())) continue
                  seen.add(b.label.toLowerCase())
                  rows.push(b.label)
                }
                return rows.map((label) => (
                  <li key={label} className="flex gap-2">
                    <Icon name="check_circle" className="shrink-0 text-primary" />
                    <span className="text-on-surface-variant">{label}</span>
                  </li>
                ))
              })()}
            </ul>
            {(() => {
              const limits = presentLimits(detail.data.plan.limits || {})
              if (limits.length === 0) return null
              return (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {limits.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between rounded-xl bg-surface-container-low px-3 py-2 text-label"
                    >
                      <span className="text-on-surface-variant">{row.label}</span>
                      <span className="font-semibold">{row.display}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-2 p-5">
              <h2 className="text-title">Ideal for</h2>
              <p className="text-body text-on-surface-variant">{String(detail.data.plan.idealCustomer || '')}</p>
            </Card>
            <Card className="space-y-2 p-5">
              <h2 className="text-title">Why upgrade</h2>
              <p className="text-body text-on-surface-variant">{String(detail.data.plan.whyUpgrade || '')}</p>
            </Card>
          </div>

          <Card className="space-y-2 p-5">
            <h2 className="text-title">Support & renewal</h2>
            <p className="text-body text-on-surface-variant">
              Support: {String(detail.data.plan.supportLevel || 'Help Centre')}
            </p>
            <p className="text-label text-on-surface-variant">
              {safeNumber(detail.data.plan.gracePeriodDays) > 0
                ? `After expiry you typically keep access for ${safeNumber(detail.data.plan.gracePeriodDays)} day${
                    safeNumber(detail.data.plan.gracePeriodDays) === 1 ? '' : 's'
                  } so you can renew without interruption. Mobile Money payments are confirmed before paid features unlock.`
                : 'Mobile Money payments are confirmed before paid features unlock.'}
            </p>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-title">Frequently asked questions</h2>
            {(safeArray(detail.data.plan.faq).length > 0
              ? safeArray(detail.data.plan.faq)
                  .map((item) => ({ q: String(item.q), a: String(item.a) }))
                  .filter((item) => item.q && !/entitlement|weight|flag|admin config/i.test(`${item.q} ${item.a}`))
              : TECHNICIAN_SUBSCRIPTION_FAQ
            ).map((item) => (
              <details key={item.q} className="rounded-xl bg-surface-container-low p-3">
                <summary className="cursor-pointer text-label font-semibold">{item.q}</summary>
                <p className="mt-2 text-label text-on-surface-variant">{item.a}</p>
              </details>
            ))}
          </Card>
        </div>
      ) : null}
    </AsyncStateView>
  )
}

export default PlanDetailPage
