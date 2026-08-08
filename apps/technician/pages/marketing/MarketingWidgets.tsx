import type { ReactNode } from 'react'
import { Icon } from '@fixnow/ui'
import type { OfferSuggestion } from './offerUtils'

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  icon?: string
  tone?: 'default' | 'primary' | 'success'
}) {
  const accent =
    tone === 'primary' ? 'text-primary' : tone === 'success' ? 'text-emerald-700' : 'text-on-surface'
  return (
    <div className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
      <div className="flex items-center gap-2">
        {icon ? <Icon name={icon} className="text-[18px] text-on-surface-variant" /> : null}
        <p className="text-label text-on-surface-variant">{label}</p>
      </div>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  )
}

/**
 * Views → Clicks → Bookings funnel. Bars are proportional to the top of funnel
 * so drop-off is visible at a glance.
 */
export function ConversionFunnel({
  views,
  clicks,
  bookings,
}: {
  views: number
  clicks: number
  bookings: number
}) {
  const top = Math.max(views, 1)
  const rows = [
    { label: 'Views', value: views, color: 'bg-sky-500' },
    { label: 'Clicks', value: clicks, color: 'bg-primary' },
    { label: 'Bookings', value: bookings, color: 'bg-emerald-600' },
  ]
  const clickRate = views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0
  const bookRate = clicks > 0 ? Number(((bookings / clicks) * 100).toFixed(1)) : 0

  return (
    <section className="rounded-2xl border border-border-subtle bg-canvas-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-title text-on-surface">Conversion funnel</h3>
        <p className="text-xs text-on-surface-variant">
          {clickRate}% view → click · {bookRate}% click → booking
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-on-surface">{row.label}</span>
              <span className="tabular-nums text-on-surface-variant">{row.value}</span>
            </div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-surface-container-low">
              <div
                className={`h-full rounded-full ${row.color} transition-[width] duration-500`}
                style={{ width: `${Math.min(100, (row.value / top) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Compact sparkline-style bar chart for per-offer comparisons. */
export function BarChart({
  title,
  data,
  formatValue,
}: {
  title: string
  data: Array<{ label: string; value: number }>
  formatValue?: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <section className="rounded-2xl border border-border-subtle bg-canvas-white p-5">
      <h3 className="text-title text-on-surface">{title}</h3>
      {data.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">Not enough data yet.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {data.map((d) => (
            <div key={d.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div>
                <p className="truncate text-sm text-on-surface">{d.label}</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-container-low">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-[width] duration-500"
                    style={{ width: `${(d.value / max) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-on-surface">
                {formatValue ? formatValue(d.value) : d.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const SUGGESTION_STYLE: Record<OfferSuggestion['tone'], { cls: string; icon: string }> = {
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', icon: 'lightbulb' },
  warn: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: 'schedule' },
  good: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: 'trending_up' },
}

export function SuggestionList({ suggestions }: { suggestions: OfferSuggestion[] }) {
  if (!suggestions.length) return null
  return (
    <section className="space-y-2">
      <h3 className="text-title text-on-surface">Suggestions</h3>
      <ul className="space-y-2">
        {suggestions.map((s) => {
          const style = SUGGESTION_STYLE[s.tone]
          return (
            <li
              key={s.text}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${style.cls}`}
            >
              <Icon name={style.icon} className="mt-0.5 text-[18px]" />
              <span>{s.text}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function QuickAction({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: string
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-start gap-3 rounded-2xl border border-border-subtle bg-canvas-white p-4 text-left transition hover:border-primary/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-on-surface">{title}</span>
        <span className="mt-0.5 block text-xs text-on-surface-variant">{description}</span>
      </span>
    </button>
  )
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-title-md text-on-surface">{title}</h2>
        {subtitle ? <p className="text-sm text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}
