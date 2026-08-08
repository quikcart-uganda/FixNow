import { cn } from '@fixnow/utils'
import type { HTMLAttributes } from 'react'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Convenience for rounded-full avatars/pills. */
  circle?: boolean
}

/**
 * Neutral shimmer placeholder used for perceived-performance loading states.
 * Purely presentational — inherits the Stitch surface palette via `.skeleton`.
 */
export function Skeleton({ className, circle, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn('skeleton', circle ? 'rounded-full' : 'rounded-lg', className)}
      {...rest}
    />
  )
}

/** Stacked text lines for card/list placeholders. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
