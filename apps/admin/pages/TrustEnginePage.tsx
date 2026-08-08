import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { ProfileAvatar } from '@fixnow/ui'
import { adminApi, getFriendlyErrorMessage, mapAdminTechnician } from '@fixnow/api/admin'
import {
  LevelBadge,
  PageHeader,
  Surface,
  TrustGauge,
  Icon,
  OverflowMenu,
} from '../components/ui'
import { safeArray } from '@fixnow/utils'

const scoreDefs = [
  {
    name: 'Trust Score',
    formula: 'Weighted blend of identity verification, completion, disputes, and endorsements.',
    retention: 'Customers return when scores are visible and comparable.',
    revenue: 'Elite scores unlock featured listings & higher lead conversion.',
    moat: 'Local competitors show stars only — not multi-factor institutional trust.',
  },
  {
    name: 'Reliability Score',
    formula: 'On-time starts + low cancellation + visit verification compliance.',
    retention: 'Technicians protect score like credit — reduces no-shows.',
    revenue: 'Reliability filters cut failed jobs and support cost.',
    moat: 'Requires visit verification + job lifecycle telemetry most apps lack.',
  },
  {
    name: 'Completion Score',
    formula: 'Jobs finished / accepted, adjusted for customer confirmation.',
    retention: 'Gamifies finishing — not just accepting.',
    revenue: 'Higher completion → more successful GMV.',
    moat: 'Needs awaiting-confirmation state + FixNow Guarantee loop.',
  },
  {
    name: 'Response Score',
    formula: 'Median time to first message / bid after job notify.',
    retention: 'Customers feel marketplace is alive.',
    revenue: 'Faster response lifts conversion from post → assign.',
    moat: 'Requires push + in-app timing analytics.',
  },
  {
    name: 'Punctuality Score',
    formula: 'Arrival vs promised window using live tracking check-ins.',
    retention: 'Family safety + punctuality builds household loyalty.',
    revenue: 'Premium for punctual Elite technicians.',
    moat: 'Depends on arrival tracking — rare in UG service apps.',
  },
]

const levels = [
  { level: 'Beginner', req: '0–9 jobs · ID pending ok' },
  { level: 'Rising', req: '10+ jobs · Trust ≥ 65' },
  { level: 'Trusted', req: '40+ jobs · Verified ID · Trust ≥ 75' },
  { level: 'Expert', req: '80+ jobs · Skills verified · Trust ≥ 85' },
  { level: 'Elite', req: '150+ jobs · Repeat ≥ 25% · Trust ≥ 92' },
  { level: 'Master', req: '250+ jobs · Community Favorite · Trust ≥ 96' },
]

function trendFor(score: number, jobs: number) {
  if (score >= 90 || jobs >= 100) return { label: 'Up', icon: 'trending_up', tone: 'text-emerald-600' }
  if (score < 60) return { label: 'Down', icon: 'trending_down', tone: 'text-error' }
  return { label: 'Steady', icon: 'trending_flat', tone: 'text-ink-muted' }
}

export function TrustEnginePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const focusQ = (params.get('q') ?? '').toLowerCase()
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)
  const [recomputingId, setRecomputingId] = useState<string | null>(null)

  const { data: technicians = [], status, error, reload } = useAsync(async () => {
    const res = await adminApi.listTechnicians({ limit: 100 })
    return safeArray(res.data?.items).map(mapAdminTechnician)
  }, [])

  const leaders = useMemo(() => {
    let list = [...safeArray(technicians)].sort((a, b) => b.scores.trust - a.scores.trust)
    if (focusQ) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(focusQ) ||
          t.id.toLowerCase().includes(focusQ) ||
          t.trade.toLowerCase().includes(focusQ),
      )
    }
    return list.slice(0, focusQ ? 20 : 8)
  }, [technicians, focusQ])

  async function recompute(id: string, name: string) {
    if (recomputingId) return
    setActionError(null)
    setActionOk(null)
    setRecomputingId(id)
    try {
      await adminApi.recomputeTrust(id)
      await reload()
      setActionOk(`Trust score recomputed for ${name}.`)
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setRecomputingId(null)
    }
  }

  async function suspend(id: string, name: string) {
    if (recomputingId) return
    if (!window.confirm(`Suspend ${name}? They will be locked out of jobs until unlocked.`)) return
    setActionError(null)
    setActionOk(null)
    setRecomputingId(id)
    try {
      await adminApi.suspendTechnician(id, 'Suspended from Trust Centre')
      await reload()
      setActionOk(`${name} suspended.`)
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setRecomputingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/admin/dashboard" className="hover:text-primary hover:underline">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-semibold text-ink-primary">Trust Centre</li>
        </ol>
      </nav>

      <PageHeader
        title="Trust Centre"
        subtitle="Trust calculations, technician reputation history, risk signals, and manual recomputes."
        actions={
          <Link
            to="/admin/technicians"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-alt"
          >
            <Icon name="construction" className="!text-[18px]" /> All technicians
          </Link>
        }
      />

      {actionError ? (
        <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{actionError}</div>
      ) : null}
      {actionOk ? (
        <div className="rounded-lg border border-emerald-300/40 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionOk}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {scoreDefs.map((s) => (
          <Surface key={s.name} className="space-y-3 p-5">
            <h3 className="font-semibold text-ink-primary">{s.name}</h3>
            <p className="text-sm text-ink-secondary">
              <span className="font-medium text-ink-primary">How it works: </span>
              {s.formula}
            </p>
            <p className="text-sm text-ink-secondary">
              <span className="font-medium text-ink-primary">Retention: </span>
              {s.retention}
            </p>
            <p className="text-sm text-ink-secondary">
              <span className="font-medium text-ink-primary">Revenue: </span>
              {s.revenue}
            </p>
            <p className="text-sm text-ink-secondary">
              <span className="font-medium text-ink-primary">Why competitors lack it: </span>
              {s.moat}
            </p>
          </Surface>
        ))}
      </div>

      <AsyncStateView status={status} error={error} onRetry={() => void reload()}>
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Surface className="p-6">
              <h2 className="mb-4 text-xl font-semibold">Reputation progression</h2>
              <div className="space-y-3">
                {levels.map((l) => (
                  <div key={l.level} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <LevelBadge level={l.level} />
                    <p className="text-right text-sm text-ink-secondary">{l.req}</p>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="p-4 sm:p-6">
              <h2 className="mb-4 text-xl font-semibold">
                {focusQ ? 'Matching technicians' : 'Leaderboard'}
              </h2>
              <div className="space-y-1">
                {leaders.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">No technicians match this trust query.</p>
                ) : (
                  leaders.map((t, i) => {
                    const trend = trendFor(t.scores.trust, t.completedJobs)
                    const verified = t.verification === 'verified'
                    const busy = recomputingId === t.id
                    return (
                      <div
                        key={t.id}
                        className="flex flex-col gap-3 rounded-xl border border-transparent px-2 py-3 transition hover:border-border hover:bg-surface-alt/70 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-7 shrink-0 text-sm font-bold tabular-nums text-ink-muted">#{i + 1}</span>
                          <ProfileAvatar
                            alt={t.name}
                            src={t.profileImageUrl || t.avatar}
                            role="technician"
                            verified={verified}
                            className="h-10 w-10 shrink-0 rounded-full"
                          />
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-ink-primary">{t.name}</p>
                              {verified ? (
                                <Icon name="verified" className="!text-[16px] text-primary" aria-label="Verified" />
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-ink-secondary">{t.trade || 'Technician'}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                              <span className="inline-flex items-center gap-0.5">
                                <Icon name="star" className="!text-[13px] text-primary" />
                                {t.rating.toFixed(1)}
                              </span>
                              <span>{t.completedJobs} jobs</span>
                              <span className={`inline-flex items-center gap-0.5 font-medium ${trend.tone}`}>
                                <Icon name={trend.icon} className="!text-[14px]" />
                                {trend.label}
                              </span>
                              <LevelBadge level={t.level} />
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                          <TrustGauge score={t.scores.trust} />
                          <OverflowMenu
                            sections={[
                              {
                                key: 'primary',
                                actions: [
                                  {
                                    key: 'profile',
                                    label: 'View Profile',
                                    icon: 'person',
                                    onSelect: () =>
                                      navigate(`/admin/technicians?q=${encodeURIComponent(t.name)}`),
                                  },
                                  {
                                    key: 'history',
                                    label: 'Trust History',
                                    icon: 'history',
                                    onSelect: () =>
                                      navigate(`/admin/trust?q=${encodeURIComponent(t.name)}`),
                                  },
                                  {
                                    key: 'recompute',
                                    label: busy ? 'Recomputing…' : 'Recompute Trust Score',
                                    icon: 'refresh',
                                    disabled: busy,
                                    onSelect: () => void recompute(t.id, t.name),
                                  },
                                ],
                              },
                              {
                                key: 'danger',
                                actions: [
                                  {
                                    key: 'open',
                                    label: 'Open Technician',
                                    icon: 'open_in_new',
                                    onSelect: () =>
                                      navigate(`/admin/technicians?q=${encodeURIComponent(t.name)}`),
                                  },
                                  {
                                    key: 'suspend',
                                    label: 'Suspend',
                                    icon: 'block',
                                    tone: 'danger',
                                    disabled: busy || t.lockStatus === 'suspended',
                                    onSelect: () => void suspend(t.id, t.name),
                                  },
                                  {
                                    key: 'disable',
                                    label: 'Disable',
                                    icon: 'lock',
                                    tone: 'danger',
                                    disabled: busy || t.lockStatus === 'locked' || t.lockStatus === 'suspended',
                                    onSelect: () => void suspend(t.id, t.name),
                                  },
                                ],
                              },
                            ]}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </Surface>
          </div>

          <Surface className="p-6">
            <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Marketplace advantages</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  FixNow platform capabilities for Uganda — not report metrics. Explore related modules below.
                </p>
              </div>
              <Link to="/admin/reports" className="text-sm font-medium text-primary hover:underline">
                Open Reports & Analytics
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  t: 'Mobile Money',
                  d: 'MTN & Airtel flows baked into payouts & future escrow.',
                  to: '/admin/payments',
                  icon: 'payments',
                },
                {
                  t: 'Parish discovery',
                  d: 'Search by district → parish → village, not just city.',
                  to: '/admin/jobs',
                  icon: 'map',
                },
                {
                  t: 'LC1 verification',
                  d: 'Village chair letters as a trust signal foreign apps cannot fake.',
                  to: '/admin/verification',
                  icon: 'verified_user',
                },
                {
                  t: 'Neighbours recommend',
                  d: 'Hyperlocal social proof beats generic star ratings.',
                  to: '/admin/reviews',
                  icon: 'diversity_3',
                },
              ].map((x) => (
                <Link
                  key={x.t}
                  to={x.to}
                  className="group rounded-xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name={x.icon} className="!text-[18px]" />
                    </span>
                    <Icon name="chevron_right" className="!text-[18px] text-ink-muted opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <p className="text-sm font-medium">{x.t}</p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">{x.d}</p>
                </Link>
              ))}
            </div>
          </Surface>
        </>
      </AsyncStateView>
    </div>
  )
}
