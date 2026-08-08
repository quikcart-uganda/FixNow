import { useCallback, useMemo } from 'react'
import { paymentsApi, portfolioApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { safeNumber } from '@fixnow/utils'

export type DashboardPortfolioCounts = {
  media: number
  photos: number
  videos: number
  caseStudies: number
  certificates: number
  featured: number
  total: number
}

export type DashboardEarningsMetrics = {
  availableBalance: number
  heldInEscrow: number
  lifetimeReleased: number
  /** Sum of ledger credits in the last 7 days when present; else 0. */
  weekReleased: number
}

function sumWeekReleased(ledger: Array<Record<string, unknown>> | undefined): number {
  if (!Array.isArray(ledger) || ledger.length === 0) return 0
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  let sum = 0
  for (const row of ledger) {
    const created = row.createdAt ? new Date(String(row.createdAt)).getTime() : 0
    if (!created || created < weekAgo) continue
    const type = String(row.type || '').toLowerCase()
    const status = String(row.status || '').toLowerCase()
    const amount = Number(row.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    // Count released/completed credits toward the technician (display-only weekly rollup).
    if (
      status.includes('complet') ||
      status.includes('success') ||
      status.includes('released') ||
      type.includes('release') ||
      type.includes('payout') ||
      type.includes('credit')
    ) {
      sum += amount
    }
  }
  return sum
}

/**
 * Real portfolio + earnings metrics for technician dashboards.
 * Never fabricates counts — empty accounts stay at 0.
 */
export function useDashboardIntegrityMetrics(deps: unknown[] = []) {
  const portfolioQuery = useAsync(async () => {
    try {
      const res = await portfolioApi.feedMine()
      const c = res.data?.counts
      const media = safeNumber(c?.media)
      const photos = safeNumber(c?.photos, media)
      const videos = safeNumber(c?.videos)
      const caseStudies = safeNumber(c?.caseStudies)
      const certificates = safeNumber(c?.certificates)
      const featured = safeNumber(c?.featured)
      return {
        media,
        photos,
        videos,
        caseStudies,
        certificates,
        featured,
        total: safeNumber(c?.total, media + caseStudies + certificates),
      } satisfies DashboardPortfolioCounts
    } catch {
      return {
        media: 0,
        photos: 0,
        videos: 0,
        caseStudies: 0,
        certificates: 0,
        featured: 0,
        total: 0,
      } satisfies DashboardPortfolioCounts
    }
  }, deps, { cacheKey: 'technician.dashboard.portfolio.counts.v1', cacheFreshMs: 30_000 })

  const earningsQuery = useAsync(async () => {
    try {
      const res = await paymentsApi.earnings()
      const summary = (res.data?.summary || {}) as Record<string, unknown>
      const wallet = (res.data?.wallet || {}) as Record<string, unknown>
      const ledger = res.data?.ledger as Array<Record<string, unknown>> | undefined
      const weekFromSummary = Number(summary.weekReleased ?? summary.weeklyReleased ?? summary.earningsWeek)
      return {
        availableBalance: safeNumber(summary.availableBalance ?? wallet.availableBalance),
        heldInEscrow: safeNumber(summary.heldInEscrow),
        lifetimeReleased: safeNumber(summary.lifetimeReleased),
        weekReleased: Number.isFinite(weekFromSummary) && weekFromSummary > 0 ? weekFromSummary : sumWeekReleased(ledger),
      } satisfies DashboardEarningsMetrics
    } catch {
      return {
        availableBalance: 0,
        heldInEscrow: 0,
        lifetimeReleased: 0,
        weekReleased: 0,
      } satisfies DashboardEarningsMetrics
    }
  }, deps, { cacheKey: 'technician.dashboard.earnings.v1', cacheFreshMs: 30_000 })

  const reload = useCallback(() => {
    void portfolioQuery.reload()
    void earningsQuery.reload()
  }, [portfolioQuery.reload, earningsQuery.reload])

  useRealtimeReload(reload, [
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.ESCROW_RELEASED,
    SOCKET_EVENTS.PAYOUT_COMPLETED,
    SOCKET_EVENTS.PAYMENT_SUCCESSFUL,
    SOCKET_EVENTS.REVIEW_SUBMITTED,
  ])

  const portfolio = useMemo(
    () =>
      portfolioQuery.data || {
        media: 0,
        photos: 0,
        videos: 0,
        caseStudies: 0,
        certificates: 0,
        featured: 0,
        total: 0,
      },
    [portfolioQuery.data],
  )

  const earnings = useMemo(
    () =>
      earningsQuery.data || {
        availableBalance: 0,
        heldInEscrow: 0,
        lifetimeReleased: 0,
        weekReleased: 0,
      },
    [earningsQuery.data],
  )

  const portfolioSubtitle =
    portfolio.total === 0
      ? 'Add your first project'
      : `${portfolio.photos} photos · ${portfolio.videos} videos`

  return {
    portfolio,
    earnings,
    portfolioSubtitle,
    reload,
    status: portfolioQuery.status === 'error' && earningsQuery.status === 'error' ? 'error' : 'success',
  }
}
