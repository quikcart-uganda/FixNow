/**
 * Accessible data table primitives — caption, scope, optional row activation.
 */

import { cn } from '@fixnow/utils'
import type { KeyboardEvent, ReactNode } from 'react'

export function DataTable({
  caption,
  children,
  className,
}: {
  caption: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)} role="region" aria-label={caption}>
      <table className="w-full text-left">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children: ReactNode
  className?: string
  align?: 'left' | 'right'
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-ink-secondary md:px-6',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function ClickableRow({
  children,
  onActivate,
  label,
  className,
}: {
  children: ReactNode
  onActivate: () => void
  label: string
  className?: string
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate()
    }
  }

  return (
    <tr
      tabIndex={0}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={cn(
        'cursor-pointer transition-colors hover:bg-surface-container-low focus-visible:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
        className,
      )}
    >
      {children}
    </tr>
  )
}
