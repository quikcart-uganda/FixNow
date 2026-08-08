import { cn } from '@fixnow/utils'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Card({
  children,
  className,
  hover,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-subtle bg-surface',
        hover && 'transition-shadow hover:shadow-card',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  to,
  onClick,
}: {
  label: string
  value: string | number
  hint?: string
  trend?: string
  /** When set, the whole card navigates (keyboard + screen-reader friendly). */
  to?: string
  onClick?: () => void
}) {
  const body = (
    <>
      <p className="text-label text-on-surface-variant">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-headline text-on-surface tabular-nums">{value}</span>
        {trend ? <span className="text-caps text-tertiary-container">{trend}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-caps text-outline">{hint}</p> : null}
    </>
  )

  const className =
    'block p-5 text-left transition-[transform,opacity,box-shadow,border-color] duration-100 ease-out touch-manip [-webkit-tap-highlight-color:transparent] hover:border-primary/30 hover:shadow-card active:scale-[0.98] active:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

  if (to) {
    return (
      <Card className="overflow-hidden" hover>
        <Link to={to} className={className} aria-label={`Open ${label}`}>
          {body}
        </Link>
      </Card>
    )
  }

  if (onClick) {
    return (
      <Card className="overflow-hidden" hover>
        <button type="button" onClick={onClick} className={`w-full ${className}`} aria-label={`Open ${label}`}>
          {body}
        </button>
      </Card>
    )
  }

  return <Card className="p-5">{body}</Card>
}
