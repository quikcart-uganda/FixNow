import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { JobCard } from '@technician/components/jobs/JobCard'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { Pill, Button, Card, Icon } from '@fixnow/ui'
import { useApp } from '@technician/context/AppContext'
import { planEmptyCopy } from '@technician/lib/planWorkspace'
import { applicationsApi, getFriendlyErrorMessage, jobsApi, mapNearbyJob } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, useOptionalLocationPermission } from '@fixnow/shared'
import { DATA_CACHE_KEYS, PullToRefresh } from '@fixnow/native'
import { cn, safeArray } from '@fixnow/utils'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export function JobsFeedPage() {
  const { canApply, skipJob, skippedJobs, appliedJobs, markApplied, refreshProfile, isLocked } = useApp()
  const tier = usePlanWorkspaceTier()
  const emptyCopy = planEmptyCopy(tier, 'jobs')
  const cardPresentation =
    tier === 'business'
      ? 'business'
      : tier === 'professional'
        ? 'professional'
        : tier === 'starter'
          ? 'starter'
          : 'default'
  const locationPermission = useOptionalLocationPermission()
  const [distance, setDistance] = useState(10)
  const [toast, setToast] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const promptedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!locationPermission || promptedRef.current) return
    promptedRef.current = true
    void locationPermission.ensureLocation('view_jobs')
  }, [locationPermission])

  const jobsQuery = useAsync(
    async () => {
      const coords = locationPermission?.lastCoords
      const res = await jobsApi.nearby({
        radiusKm: distance,
        limit: 40,
        lat: coords?.latitude,
        lng: coords?.longitude,
      })
      return {
        items: safeArray(res.data?.items).map(mapNearbyJob),
        meta: res.meta as { hasNext?: boolean } | undefined,
      }
    },
    [distance, locationPermission?.lastCoords?.latitude, locationPermission?.lastCoords?.longitude],
    {
      cacheKey: `${DATA_CACHE_KEYS.technicianFeed}:${distance}`,
      cacheFreshMs: 45_000,
      isEmpty: (data) => data.items.length === 0,
    },
  )

  const appliedQuery = useAsync(async () => {
    const res = await applicationsApi.listMine({ limit: 100 })
    return safeArray(res.data?.items).map((item) => {
      const row = asRecord(item)
      const app = asRecord(row.application ?? row)
      const jobId = app.jobId
      return typeof jobId === 'string' ? jobId : String(asRecord(jobId).id ?? asRecord(jobId)._id ?? '')
    })
  }, [], { cacheKey: `${DATA_CACHE_KEYS.technicianFeed}:applied`, cacheFreshMs: 60_000 })

  const reloadFeed = useCallback(() => {
    void jobsQuery.reload()
    void appliedQuery.reload()
  }, [jobsQuery.reload, appliedQuery.reload])

  useRealtimeReload(reloadFeed, [
    SOCKET_EVENTS.JOB_CREATED,
    SOCKET_EVENTS.JOB_PUBLISHED,
    SOCKET_EVENTS.JOB_CANCELLED,
    SOCKET_EVENTS.JOB_UPDATED,
    SOCKET_EVENTS.JOB_ASSIGNED,
    SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
  ])

  const appliedSet = useMemo(() => {
    const ids = new Set(appliedJobs)
    for (const id of safeArray(appliedQuery.data)) {
      if (id) ids.add(id)
    }
    return ids
  }, [appliedJobs, appliedQuery.data])

  const jobs = useMemo(
    () =>
      safeArray(jobsQuery.data?.items).filter(
        (j) =>
          !skippedJobs.includes(j.id) &&
          (j.distanceKm <= 0 || j.distanceKm <= distance),
      ),
    [jobsQuery.data, skippedJobs, distance],
  )

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  const handleApply = useCallback(
    async (jobId: string) => {
      if (!canApply || appliedSet.has(jobId)) return
      setApplyingId(jobId)
      try {
        await applicationsApi.apply(jobId)
        markApplied(jobId)
        await refreshProfile()
        showToast('Application sent')
      } catch (err) {
        showToast(getFriendlyErrorMessage(err))
      } finally {
        setApplyingId(null)
      }
    },
    [appliedSet, canApply, markApplied, refreshProfile, showToast],
  )

  const handleSkip = useCallback(
    (jobId: string) => {
      skipJob(jobId)
      showToast('Job skipped')
    },
    [skipJob, showToast],
  )

  return (
    <PullToRefresh onRefresh={reloadFeed} className="animate-fade-up">
      <PlanWorkspaceShell page="jobs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              'w-fit rounded-full px-3 py-1 text-label',
              tier === 'business' && 'bg-teal-800/10 text-teal-900',
              tier === 'professional' && 'bg-primary/10 text-primary',
              (tier === 'starter' || tier === 'free') && 'bg-surface-container-high text-on-surface-variant',
            )}
          >
            {jobs.length} {tier === 'business' ? 'demand signals' : 'jobs found'}
          </span>
          {tier === 'professional' || tier === 'business' ? (
            <p className="text-label text-on-surface-variant">
              {tier === 'business' ? 'Prioritise urgency · value · travel fit' : 'Match · success · travel cues'}
            </p>
          ) : null}
        </div>

        {isLocked ? (
          <Card className="flex flex-col gap-3 border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Icon name="lock_person" className="text-warning" />
              <div>
                <p className="text-title text-on-surface">Account locked — free limit reached</p>
                <p className="text-label text-on-surface-variant">
                  You can browse jobs and get alerts, but applying and viewing customer details are paused.
                </p>
              </div>
            </div>
            <Link to="/technician/locked">
              <Button>Upgrade Account</Button>
            </Link>
          </Card>
        ) : null}

        <Card
          className={cn(
            'p-4',
            tier === 'professional' && 'fn-premium-surface border-primary/15',
            tier === 'business' && 'fn-executive-surface',
          )}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <p className="mb-2 text-label text-on-surface-variant">Distance</p>
              <div className="flex gap-2">
                {[5, 10, 20].map((d) => (
                  <Pill key={d} active={distance === d} onClick={() => setDistance(d)}>
                    {d}km
                  </Pill>
                ))}
              </div>
            </div>
            {(tier === 'professional' || tier === 'business') && (
              <div className="flex-1">
                <p className="mb-2 text-label text-on-surface-variant">District / parish</p>
                <div className="flex flex-wrap gap-2">
                  {['Kampala', 'Wakiso', 'Nakasero', 'Kololo'].map((p) => (
                    <span key={p} className="rounded-lg bg-surface-container-low px-3 py-2 text-label">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(tier === 'professional' || tier === 'business') && (
              <Button variant="secondary" className="fn-pressable">
                <Icon name="tune" className="text-[20px]" />
                {tier === 'business' ? 'Dispatch filters' : 'Filters'}
              </Button>
            )}
          </div>
        </Card>

        <AsyncStateView
          status={jobsQuery.status}
          error={jobsQuery.error}
          onRetry={() => void jobsQuery.reload()}
          emptyTitle={emptyCopy.title}
          emptyHint={emptyCopy.hint}
          loadingLabel="Loading nearby jobs…"
          fromCache={jobsQuery.fromCache}
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                locked={!canApply}
                applied={appliedSet.has(job.id)}
                presentation={cardPresentation}
                onSkip={() => handleSkip(job.id)}
                onApply={() => void handleApply(job.id)}
              />
            ))}
          </div>
        </AsyncStateView>

        {applyingId ? (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-inverse-surface px-5 py-3 text-label text-inverse-on-surface shadow-float lg:bottom-8">
            Submitting application…
          </div>
        ) : null}

        {toast ? (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-inverse-surface px-5 py-3 text-label text-inverse-on-surface shadow-float lg:bottom-8">
            {toast}
          </div>
        ) : null}
      </PlanWorkspaceShell>
    </PullToRefresh>
  )
}
