import type { ReactNode } from 'react'
import { cn } from '@fixnow/utils'
import { Icon } from './Icon'

export function Badge({
  children,
  tone = 'primary',
  icon,
  className,
}: {
  children: ReactNode
  tone?: 'primary' | 'success' | 'secondary' | 'tertiary' | 'warning' | 'error'
  icon?: string
  className?: string
}) {
  const tones = {
    primary: 'bg-trust-blue-subtle text-primary',
    success: 'bg-tertiary-fixed/40 text-tertiary',
    secondary: 'bg-secondary-container text-on-secondary-container',
    tertiary: 'bg-warning/15 text-warning',
    warning: 'bg-warning text-white',
    error: 'bg-error-container text-on-error-container',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-caps',
        tones[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} className="text-[14px]" filled /> : null}
      {children}
    </span>
  )
}

export function Pill({
  children,
  active,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'tap-target touch-manip rounded-full border px-4 py-2 text-label transition active:scale-95',
        active
          ? 'border-primary bg-trust-blue-subtle text-primary'
          : 'border-border-subtle bg-surface text-on-surface-variant hover:bg-surface-container-low',
      )}
    >
      {children}
    </button>
  )
}
