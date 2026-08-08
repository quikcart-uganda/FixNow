import { cn } from '@fixnow/utils'

export type TimelineEvent = {
  id: string
  title: string
  subtitle?: string
  at?: string | null
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

const toneDot: Record<NonNullable<TimelineEvent['tone']>, string> = {
  default: 'bg-primary',
  success: 'bg-secondary',
  warning: 'bg-amber-500',
  danger: 'bg-error',
}

export function TimelineList({
  title,
  events,
  emptyHint = 'No recent activity.',
  className,
}: {
  title?: string
  events: TimelineEvent[]
  emptyHint?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-border-subtle bg-canvas-white p-4', className)}>
      {title ? <h3 className="mb-3 text-sm font-semibold text-ink-primary">{title}</h3> : null}
      {!events.length ? (
        <p className="text-sm text-ink-muted">{emptyHint}</p>
      ) : (
        <ol className="relative space-y-4 border-l border-border-subtle pl-4">
          {events.map((ev) => (
            <li key={ev.id} className="relative">
              <span
                className={cn(
                  'absolute -left-[1.15rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-canvas-white',
                  toneDot[ev.tone ?? 'default'],
                )}
              />
              <p className="text-sm font-medium text-ink-primary">{ev.title}</p>
              {ev.subtitle ? <p className="text-xs text-ink-muted">{ev.subtitle}</p> : null}
              {ev.at ? (
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {new Date(ev.at).toLocaleString()}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
