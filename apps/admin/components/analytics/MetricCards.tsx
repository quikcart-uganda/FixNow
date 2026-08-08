import { cn } from '@fixnow/utils'
import { Icon } from '../ui'

export type MetricCardItem = {
  key: string
  label: string
  value: string | number
  hint?: string
  icon?: string
  accent?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'neutral'
}

const accents: Record<NonNullable<MetricCardItem['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  tertiary: 'bg-tertiary/10 text-tertiary',
  danger: 'bg-error-container text-error',
  neutral: 'bg-surface-alt text-ink-secondary',
}

/** Compact KPI strip for admin analytics surfaces. */
export function MetricCards({
  items,
  className,
}: {
  items: MetricCardItem[]
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Summary metrics"
      className={cn(
        'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-2xl border border-border-subtle bg-canvas-white p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              {item.label}
            </p>
            {item.icon ? (
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  accents[item.accent ?? 'primary'],
                )}
              >
                <Icon name={item.icon} className="!text-[18px]" />
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary sm:text-2xl">
            {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
          </p>
          {item.hint ? <p className="mt-1 text-xs text-ink-muted">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  )
}
