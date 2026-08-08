import { cn } from '@fixnow/utils'
import { formatUgx } from '@fixnow/api'

export type ChartPoint = {
  key: string
  label: string
  amount: number
  count?: number
}

/** Lightweight CSS bar chart — no chart library dependency. */
export function SimpleBarChart({
  title,
  points,
  emptyHint = 'No activity in this period.',
  className,
}: {
  title: string
  points: ChartPoint[]
  emptyHint?: string
  className?: string
}) {
  const max = Math.max(1, ...points.map((p) => p.amount))

  return (
    <div className={cn('rounded-2xl border border-border-subtle bg-canvas-white p-4', className)}>
      <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
      {!points.length ? (
        <p className="mt-6 text-sm text-ink-muted">{emptyHint}</p>
      ) : (
        <ul className="mt-4 space-y-2.5" aria-label={title}>
          {points.map((p) => {
            const pct = Math.max(2, Math.round((p.amount / max) * 100))
            return (
              <li key={p.key} className="grid grid-cols-[72px_1fr_auto] items-center gap-2">
                <span className="truncate text-xs font-medium text-ink-secondary">{p.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-container-low">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="min-w-[5.5rem] text-right text-xs tabular-nums text-ink-muted">
                  {formatUgx(p.amount)}
                  {typeof p.count === 'number' ? (
                    <span className="ml-1 text-[10px] text-ink-muted">({p.count})</span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
