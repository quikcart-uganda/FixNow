import { cn } from '@fixnow/utils'

export function ProgressBar({
  value,
  max = 100,
  className,
  barClassName,
}: {
  value: number
  max?: number
  className?: string
  barClassName?: string
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={cn('h-3 w-full overflow-hidden rounded-full bg-surface-container-low', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', barClassName ?? 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function FreeJobsMeter({
  used,
  limit,
  compact,
}: {
  used: number
  limit: number
  compact?: boolean
}) {
  const remaining = Math.max(0, limit - used)
  const pctUsed = Math.min(100, (used / limit) * 100)
  const nearlyFull = pctUsed >= 75

  return (
    <div className={cn(!compact && 'space-y-2')}>
      {!compact ? (
        <div className="flex items-end justify-between">
          <div>
            <p className="text-label text-on-surface-variant">Remaining Free Jobs</p>
            <p className="text-title text-on-surface">
              {remaining}/{limit}
            </p>
          </div>
          <span className={cn('text-caps', nearlyFull ? 'text-warning' : 'text-on-surface-variant')}>
            {Math.round(100 - pctUsed)}% LEFT
          </span>
        </div>
      ) : (
        <div className="mb-2 flex justify-between text-label">
          <span className="text-on-surface-variant">Free jobs</span>
          <span className="font-semibold text-primary">
            {remaining}/{limit}
          </span>
        </div>
      )}
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container-low">
        <div
          className={cn('h-full rounded-full', nearlyFull ? 'progress-limit' : 'bg-gradient-to-r from-primary to-primary-container')}
          style={{ width: `${pctUsed}%` }}
        />
      </div>
    </div>
  )
}
