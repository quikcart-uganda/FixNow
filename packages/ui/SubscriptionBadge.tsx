import { cn } from '@fixnow/utils'
import { Icon } from './Icon'

export type SubscriptionBadgeProps = {
  text?: string | null
  icon?: string | null
  color?: string | null
  borderColor?: string | null
  glow?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Compact lightning for active profile boost */
  boostActive?: boolean
}

const sizeClass = {
  sm: 'px-2 py-0.5 text-[10px] gap-0.5',
  md: 'px-2.5 py-1 text-[11px] gap-1',
  lg: 'px-3 py-1.5 text-xs gap-1',
}

/**
 * Plan / boost badge — colours come from Admin plan badge config (defaults: green/blue/gold).
 */
export function SubscriptionBadge({
  text,
  icon = 'verified',
  color = '#16A34A',
  borderColor,
  glow = false,
  size = 'sm',
  className,
  boostActive,
}: SubscriptionBadgeProps) {
  if (boostActive && !text) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md border px-1.5 py-0.5',
          className,
        )}
        style={{
          color: '#7C3AED',
          borderColor: '#7C3AED55',
          backgroundColor: '#7C3AED18',
        }}
        title="Boost active"
        aria-label="Boost active"
      >
        <Icon name="bolt" className="text-[14px]" filled />
      </span>
    )
  }

  if (!text) return null

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-semibold uppercase tracking-wide',
        sizeClass[size],
        glow && 'shadow-sm',
        className,
      )}
      style={{
        color: color || undefined,
        borderColor: borderColor || `${color || '#16A34A'}55`,
        backgroundColor: `${color || '#16A34A'}18`,
        boxShadow: glow ? `0 0 12px ${color || '#D97706'}33` : undefined,
      }}
    >
      {icon ? <Icon name={icon} className="text-[14px]" filled /> : null}
      {text}
      {boostActive ? <Icon name="bolt" className="text-[12px] text-violet-600" filled /> : null}
    </span>
  )
}
