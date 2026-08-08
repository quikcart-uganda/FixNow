/**
 * Pull-to-refresh — native-feel gesture without redesigning Stitch screens.
 * Wrap a scrollable page body; on pull-down past threshold, calls `onRefresh`.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { haptic } from './nativeDevice'
import { isNativePlatform } from './platform'

type Props = {
  onRefresh: () => void | Promise<unknown>
  children: ReactNode
  className?: string
  disabled?: boolean
}

export function PullToRefresh({ onRefresh, children, className = '', disabled }: Props) {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const threshold = 64

  const end = useCallback(async () => {
    if (disabled || refreshing) {
      setPull(0)
      startY.current = null
      return
    }
    if (pull >= threshold) {
      setRefreshing(true)
      setPull(threshold)
      if (isNativePlatform()) void haptic('light')
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
    startY.current = null
  }, [disabled, refreshing, pull, onRefresh])

  return (
    <div
      className={`relative ${className}`}
      onTouchStart={(e) => {
        if (disabled || refreshing) return
        const scrollParent = e.currentTarget
        if (scrollParent.scrollTop > 0) {
          startY.current = null
          return
        }
        startY.current = e.touches[0]?.clientY ?? null
      }}
      onTouchMove={(e) => {
        if (startY.current == null || disabled || refreshing) return
        const dy = (e.touches[0]?.clientY ?? 0) - startY.current
        if (dy > 0) setPull(Math.min(dy * 0.45, threshold + 24))
      }}
      onTouchEnd={() => {
        void end()
      }}
      onTouchCancel={() => {
        setPull(0)
        startY.current = null
      }}
    >
      <div
        aria-hidden={!refreshing && pull === 0}
        className="pointer-events-none flex items-center justify-center overflow-hidden text-xs font-semibold text-on-surface-variant transition-[height]"
        style={{ height: refreshing ? threshold : pull }}
        role="status"
        aria-live="polite"
      >
        {refreshing ? 'Refreshing…' : pull >= threshold ? 'Release to refresh' : pull > 12 ? 'Pull to refresh' : null}
      </div>
      {children}
    </div>
  )
}
