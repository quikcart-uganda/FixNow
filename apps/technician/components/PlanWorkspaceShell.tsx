import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SubscriptionBadge } from '@fixnow/ui'
import { cn } from '@fixnow/utils'
import { useApp } from '@technician/context/AppContext'
import {
  planPageIntro,
  planThemeClass,
  planWorkspaceLabel,
  resolvePlanWorkspaceTier,
  type PlanPageKey,
  type PlanWorkspaceTier,
} from '@technician/lib/planWorkspace'

const BADGE: Record<
  Exclude<PlanWorkspaceTier, 'free'>,
  { text: string; color: string; icon: string }
> = {
  starter: { text: 'Starter', color: '#004AC6', icon: 'bolt' },
  professional: { text: 'Professional', color: '#0A2540', icon: 'workspace_premium' },
  business: { text: 'Business', color: '#0F766E', icon: 'apartment' },
}

/**
 * Presentation shell — applies tier theme + page intro.
 * Does not change routing, entitlements, or business logic.
 */
export function PlanWorkspaceShell({
  page,
  children,
  className,
  showBadge = true,
  compact = false,
}: {
  page: PlanPageKey
  children: ReactNode
  className?: string
  showBadge?: boolean
  compact?: boolean
}) {
  const { entitlementPlanCode, hasActiveSubscription } = useApp()
  const tier = resolvePlanWorkspaceTier(entitlementPlanCode, hasActiveSubscription)
  const intro = planPageIntro(tier, page)
  const theme = planThemeClass(tier)
  const badge = tier === 'free' ? null : BADGE[tier]

  return (
    <div className={cn(theme, 'space-y-5 animate-fade-up', className)}>
      <header className={cn('space-y-2', compact && 'space-y-1')}>
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'text-caps',
              tier === 'business' && 'text-teal-800',
              tier === 'professional' && 'text-primary',
              (tier === 'starter' || tier === 'free') && 'text-on-surface-variant',
            )}
          >
            {intro.eyebrow}
          </p>
          {showBadge && badge ? (
            <SubscriptionBadge text={badge.text} icon={badge.icon} color={badge.color} size="sm" />
          ) : null}
        </div>
        <h1 className={cn(tier === 'business' ? 'text-headline' : 'text-headline')}>{intro.title}</h1>
        <p className="max-w-2xl text-body text-on-surface-variant">{intro.subtitle}</p>
        {tier === 'business' && page === 'marketing' ? (
          <Link
            to="/technician/business/marketing-centre"
            className="inline-block text-label font-semibold text-teal-800"
          >
            Open Marketing Centre →
          </Link>
        ) : null}
      </header>
      {children}
    </div>
  )
}

export function usePlanWorkspaceTier(): PlanWorkspaceTier {
  const { entitlementPlanCode, hasActiveSubscription } = useApp()
  return resolvePlanWorkspaceTier(entitlementPlanCode, hasActiveSubscription)
}

export function PlanTierChip({ className }: { className?: string }) {
  const tier = usePlanWorkspaceTier()
  if (tier === 'free') return null
  const badge = BADGE[tier]
  return (
    <span className={className}>
      <SubscriptionBadge text={badge.text} icon={badge.icon} color={badge.color} size="sm" />
      <span className="sr-only">{planWorkspaceLabel(tier)} plan</span>
    </span>
  )
}

export default PlanWorkspaceShell
