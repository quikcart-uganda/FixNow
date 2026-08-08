import { formatUgx } from '@fixnow/api'
import { cn } from '@fixnow/utils'

export type BreakdownRow = {
  key: string
  label: string
  count: number
  amount: number
}

export function BreakdownList({
  title,
  rows,
  emptyHint = 'No data available.',
  className,
}: {
  title: string
  rows: BreakdownRow[]
  emptyHint?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-border-subtle bg-canvas-white p-4', className)}>
      <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
      {!rows.length ? (
        <p className="mt-4 text-sm text-ink-muted">{emptyHint}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-primary">{row.label}</p>
                <p className="text-xs text-ink-muted">{row.count.toLocaleString()} settlements</p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-primary">
                {formatUgx(row.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
