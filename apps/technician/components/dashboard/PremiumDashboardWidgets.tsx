import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, Icon } from '@fixnow/ui'
import { cn } from '@fixnow/utils'

/** Premium KPI — richer than StatCard; presentation only. */
export function PremiumKpiCard({
  label,
  value,
  hint,
  trend,
  icon,
  to,
  tone = 'default',
  delayMs = 0,
}: {
  label: string
  value: string | number
  hint?: string
  trend?: string
  icon?: string
  to?: string
  tone?: 'default' | 'premium' | 'executive'
  delayMs?: number
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-caps text-on-surface-variant">{label}</p>
        {icon ? (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              tone === 'executive' && 'bg-teal-700/10 text-teal-800',
              tone === 'premium' && 'bg-primary/10 text-primary',
              tone === 'default' && 'bg-surface-container-low text-on-surface-variant',
            )}
            aria-hidden
          >
            <Icon name={icon} className="text-[18px]" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-headline tabular-nums text-on-surface">{value}</span>
        {trend ? (
          <span className="pb-1 text-caps text-tertiary-container" aria-label={`Trend ${trend}`}>
            {trend}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-caps text-outline">{hint}</p> : null}
    </>
  )

  const shell = cn(
    'fn-premium-kpi block h-full p-5 text-left transition-[transform,box-shadow,border-color] duration-200 ease-out',
    'touch-manip hover:border-primary/35 hover:shadow-card active:scale-[0.985]',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    tone === 'premium' && 'fn-premium-kpi--pro',
    tone === 'executive' && 'fn-premium-kpi--exec',
  )

  const cardClass = cn(
    'overflow-hidden',
    tone === 'executive' && 'border-teal-900/10 shadow-[0_12px_28px_-16px_rgba(15,118,110,0.35)]',
    tone === 'premium' && 'border-primary/15 shadow-[0_12px_28px_-16px_rgba(10,37,64,0.28)]',
  )

  const style = delayMs ? ({ animationDelay: `${delayMs}ms` } as const) : undefined

  if (to) {
    return (
      <div className="fn-dash-enter h-full" style={style}>
        <Card className={cardClass} hover>
          <Link to={to} className={shell} aria-label={`Open ${label}`}>
            {body}
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="fn-dash-enter h-full" style={style}>
      <Card className={cn(cardClass, 'p-0')}>
        <div className={shell}>{body}</div>
      </Card>
    </div>
  )
}

/** Compact job attention strip shared by Pro / Business homes. */
export function JobsAttentionStrip({
  nearbyCount,
  activeCount,
  variant = 'professional',
}: {
  nearbyCount: number
  activeCount: number
  variant?: 'professional' | 'business'
}) {
  const isBiz = variant === 'business'
  return (
    <section
      className={cn(
        'fn-dash-enter grid gap-3 rounded-2xl border p-4 sm:grid-cols-3',
        isBiz
          ? 'border-teal-900/15 bg-gradient-to-r from-slate-900/[0.04] to-teal-700/[0.06]'
          : 'border-primary/15 bg-gradient-to-r from-[#0A2540]/[0.04] to-[#1B5F7A]/[0.06]',
      )}
      aria-label="Jobs needing attention"
    >
      <StripStat
        icon="near_me"
        label="Nearby now"
        value={nearbyCount}
        to="/technician/jobs"
        emphasize={nearbyCount > 0}
      />
      <StripStat icon="assignment" label="In progress" value={activeCount} to="/technician/active" />
      <Link
        to="/technician/jobs"
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface px-3 text-label font-semibold text-primary transition hover:bg-trust-blue-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Icon name="bolt" />
        Review priority jobs
      </Link>
    </section>
  )
}

function StripStat({
  icon,
  label,
  value,
  to,
  emphasize,
}: {
  icon: string
  label: string
  value: number
  to: string
  emphasize?: boolean
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl bg-surface/90 px-3 py-2 transition hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon name={icon} />
      </span>
      <div>
        <p className="text-caps text-on-surface-variant">{label}</p>
        <p className={cn('text-title tabular-nums', emphasize && 'text-primary')}>{value}</p>
      </div>
    </Link>
  )
}

/** Lightweight CSS bar chart — no chart library. */
export function MiniBarChart({
  title,
  bars,
}: {
  title: string
  bars: Array<{ label: string; value: number; max?: number }>
}) {
  const peak = Math.max(1, ...bars.map((b) => b.max ?? b.value), ...bars.map((b) => b.value))
  return (
    <Card className="fn-dash-enter p-5">
      <h3 className="text-title">{title}</h3>
      <ul className="mt-4 space-y-3" aria-label={title}>
        {bars.map((bar) => {
          const pct = Math.round((Math.max(0, bar.value) / peak) * 100)
          return (
            <li key={bar.label}>
              <div className="mb-1 flex justify-between gap-2 text-label">
                <span className="text-on-surface-variant">{bar.label}</span>
                <span className="tabular-nums font-semibold">{bar.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" role="presentation">
                <div
                  className="fn-bar-fill h-full rounded-full bg-gradient-to-r from-teal-700 to-teal-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function InsightList({
  title,
  items,
  tone = 'premium',
}: {
  title: string
  items: string[]
  tone?: 'premium' | 'executive'
}) {
  if (!items.length) return null
  return (
    <Card
      className={cn(
        'fn-dash-enter p-5',
        tone === 'executive' && 'border-teal-900/10 bg-gradient-to-br from-white to-teal-50/40',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon name="auto_awesome" className={tone === 'executive' ? 'text-teal-800' : 'text-primary'} />
        <h3 className="text-title">{title}</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-label text-on-surface-variant">
            <Icon name="arrow_forward" className="mt-0.5 shrink-0 text-[16px] text-outline" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ActivityTimeline({
  items,
}: {
  items: Array<{ title: string; detail: string; meta?: string; icon?: string }>
}) {
  return (
    <Card className="fn-dash-enter overflow-hidden p-0">
      <div className="border-b border-border-subtle px-5 py-4">
        <h3 className="text-title">Today's activity</h3>
        <p className="mt-1 text-label text-on-surface-variant">Updates from jobs and marketing</p>
      </div>
      <ol className="divide-y divide-border-subtle">
        {items.map((item) => (
          <li key={`${item.title}-${item.detail}`} className="flex gap-3 px-5 py-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700/10 text-teal-800">
              <Icon name={item.icon || 'timeline'} className="text-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-label font-bold text-on-surface">{item.title}</p>
              <p className="mt-0.5 text-body text-on-surface-variant">{item.detail}</p>
              {item.meta ? <p className="mt-1 text-caps text-outline">{item.meta}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function WorkspaceQuickLink({
  to,
  icon,
  label,
  sub,
  tone = 'default',
}: {
  to: string
  icon: string
  label: string
  sub?: string
  tone?: 'default' | 'premium' | 'executive'
}) {
  return (
    <Link to={to} className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <Card
        className={cn(
          'flex items-center gap-3 p-4 transition-[transform,border-color,box-shadow] duration-200',
          'hover:shadow-card active:scale-[0.985]',
          tone === 'premium' && 'hover:border-primary/40',
          tone === 'executive' && 'hover:border-teal-700/40',
        )}
        hover
      >
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl transition group-hover:scale-105',
            tone === 'executive' && 'bg-teal-700/10 text-teal-800',
            tone === 'premium' && 'bg-primary/10 text-primary',
            tone === 'default' && 'bg-primary/10 text-primary',
          )}
        >
          <Icon name={icon} />
        </span>
        <span className="min-w-0">
          <span className="block text-label font-semibold">{label}</span>
          {sub ? <span className="block text-caps text-on-surface-variant">{sub}</span> : null}
        </span>
      </Card>
    </Link>
  )
}

export function PlanHeroBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg bg-white/15 px-3 py-1 text-caps tracking-wide backdrop-blur-sm">{children}</span>
  )
}

/** Tier section header with clearer hierarchy. */
export function DashSectionHeader({
  eyebrow,
  title,
  subtitle,
  tone = 'default',
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  tone?: 'default' | 'premium' | 'executive'
}) {
  return (
    <div className="fn-dash-enter mb-3">
      {eyebrow ? (
        <p
          className={cn(
            'text-caps',
            tone === 'executive' && 'text-teal-800',
            tone === 'premium' && 'text-primary',
            tone === 'default' && 'text-on-surface-variant',
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          tone === 'executive' && 'text-headline tracking-tight',
          tone === 'premium' && 'text-title',
          tone === 'default' && 'text-title',
        )}
      >
        {title}
      </h2>
      {subtitle ? <p className="mt-1 text-label text-on-surface-variant">{subtitle}</p> : null}
    </div>
  )
}

/** CSS sparkline from numeric series — presentation only. */
export function TrendSparkline({
  values,
  label,
  tone = 'premium',
}: {
  values: number[]
  label?: string
  tone?: 'premium' | 'executive'
}) {
  const max = Math.max(1, ...values)
  const points = values
    .map((v, i) => {
      const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * 100
      const y = 100 - (Math.max(0, v) / max) * 88 - 6
      return `${x},${y}`
    })
    .join(' ')
  const stroke = tone === 'executive' ? '#0f766e' : '#0a2540'
  return (
    <div className="fn-dash-enter" aria-hidden={!label}>
      {label ? <p className="mb-1 text-caps text-on-surface-variant">{label}</p> : null}
      <svg viewBox="0 0 100 100" className="h-14 w-full overflow-visible" role="img" aria-label={label || 'Trend'}>
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          className="fn-spark-draw"
        />
      </svg>
    </div>
  )
}

/** Priority jobs list (Pro / Business). */
export function PriorityJobsList({
  jobs,
  tone = 'premium',
}: {
  jobs: Array<{ id: string; title: string; urgent?: boolean; postedAgo?: string; district?: string }>
  tone?: 'premium' | 'executive'
}) {
  return (
    <Card
      className={cn(
        'fn-dash-enter overflow-hidden p-0',
        tone === 'executive' && 'border-teal-900/15',
        tone === 'premium' && 'border-primary/15',
      )}
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
        <div>
          <h3 className="text-title">Priority jobs</h3>
          <p className="mt-0.5 text-label text-on-surface-variant">Best matches near you</p>
        </div>
        <Link to="/technician/jobs" className="text-label font-semibold text-primary">
          View all →
        </Link>
      </div>
      {jobs.length ? (
        <ul className="divide-y divide-border-subtle">
          {jobs.slice(0, 4).map((job, idx) => (
            <li key={job.id || `${job.title}-${idx}`}>
              <Link
                to={`/technician/jobs/${job.id}`}
                className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-label font-bold',
                    tone === 'executive' ? 'bg-teal-700/10 text-teal-900' : 'bg-primary/10 text-primary',
                  )}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-label font-bold text-on-surface">{job.title}</p>
                    {job.urgent ? (
                      <span className="rounded bg-error/10 px-1.5 py-0.5 text-caps text-error">Urgent</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-caps text-outline">
                    {[job.district, job.postedAgo].filter(Boolean).join(' · ') || 'Nearby'}
                  </p>
                </div>
                <Icon name="chevron_right" className="mt-1 text-outline" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-5 text-label text-on-surface-variant">No priority jobs in range — check back soon.</p>
      )}
    </Card>
  )
}

/** Income / portfolio insight cards. */
export function InsightMetricCard({
  title,
  body,
  metrics,
  cta,
  tone = 'premium',
}: {
  title: string
  body: string
  metrics: Array<{ label: string; value: string }>
  cta?: { to: string; label: string }
  tone?: 'premium' | 'executive'
}) {
  return (
    <Card
      className={cn(
        'fn-dash-enter flex h-full flex-col p-5',
        tone === 'executive' ? 'fn-executive-surface' : 'fn-premium-surface',
      )}
    >
      <h3 className="text-title">{title}</h3>
      <p className="mt-2 text-label text-on-surface-variant">{body}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl bg-surface-container-low/80 px-3 py-2">
            <dt className="text-caps text-on-surface-variant">{m.label}</dt>
            <dd className="mt-1 text-title tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
      {cta ? (
        <Link
          to={cta.to}
          className={cn(
            'mt-auto pt-4 text-label font-semibold',
            tone === 'executive' ? 'text-teal-800' : 'text-primary',
          )}
        >
          {cta.label} →
        </Link>
      ) : null}
    </Card>
  )
}

/** Lightweight revenue forecast (derived from weekly income — display only). */
export function ForecastWidget({
  weeklyRevenue,
  bookings,
  completionRate,
}: {
  weeklyRevenue: number
  bookings: number
  completionRate: number
}) {
  const projected = Math.round(weeklyRevenue * 4.2)
  const pace = completionRate >= 85 ? 'Strong' : completionRate >= 70 ? 'Steady' : 'Rebuild'
  return (
    <Card className="fn-executive-surface fn-dash-enter relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-teal-500/10 blur-2xl" />
      <p className="text-caps text-teal-800">Revenue</p>
      <h3 className="mt-1 text-title">30-day outlook</h3>
      <p className="mt-3 text-display-mobile tabular-nums text-on-surface">
        {new Intl.NumberFormat('en-UG', {
          style: 'currency',
          currency: 'UGX',
          maximumFractionDigits: 0,
        }).format(projected)}
      </p>
      <p className="mt-1 text-label text-on-surface-variant">
        Estimate based on this week’s pace · not a guarantee
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-label">
        <div>
          <dt className="text-on-surface-variant">Bookings</dt>
          <dd className="font-semibold tabular-nums">{bookings}</dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">Pace</dt>
          <dd className="font-semibold">{pace}</dd>
        </div>
      </dl>
    </Card>
  )
}

export function PerformanceMeterRow({
  items,
  tone = 'premium',
}: {
  items: Array<{ label: string; value: number; max?: number }>
  tone?: 'premium' | 'executive'
}) {
  return (
    <Card className={cn('fn-dash-enter space-y-3 p-5', tone === 'executive' ? 'fn-executive-surface' : 'fn-premium-surface')}>
      <h3 className="text-title">Your performance</h3>
      {items.map((item) => {
        const max = item.max ?? 100
        const pct = Math.min(100, Math.round((Math.max(0, item.value) / Math.max(1, max)) * 100))
        return (
          <div key={item.label}>
            <div className="mb-1 flex justify-between text-label">
              <span className="text-on-surface-variant">{item.label}</span>
              <span className="tabular-nums font-semibold">{item.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className={cn(
                  'fn-bar-fill h-full rounded-full',
                  tone === 'executive'
                    ? 'bg-gradient-to-r from-teal-800 to-teal-500'
                    : 'bg-gradient-to-r from-[#0A2540] to-[#1B5F7A]',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </Card>
  )
}
