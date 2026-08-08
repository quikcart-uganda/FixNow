import { Link, useNavigate } from 'react-router-dom'
import { StatusTimeline } from '@technician/components/jobs/JobCard'
import { Badge } from '@fixnow/ui'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { planEmptyCopy } from '@technician/lib/planWorkspace'
import { getFriendlyErrorMessage, jobsApi, mapApiStatusToUi, mapAssignedJob } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { cn, safeArray } from '@fixnow/utils'
import type { JobStatus } from '@fixnow/types'

const flow: JobStatus[] = ['Assigned', 'En Route', 'Started', 'Awaiting Confirmation', 'Completed']

export function ActiveJobsPage() {
  const { jobStatuses, setJobStatus, isLocked } = useApp()
  const tier = usePlanWorkspaceTier()
  const emptyCopy = planEmptyCopy(tier, 'active')
  const navigate = useNavigate()

  const jobsQuery = useAsync(async () => {
    const res = await jobsApi.list({ mine: 'true' })
    return safeArray(res.data?.items).map((j) => mapAssignedJob(j))
  }, [], { cacheKey: 'technician.assigned.v1' })

  useRealtimeReload(() => void jobsQuery.reload(), [
    SOCKET_EVENTS.JOB_STATUS_CHANGED,
    SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
    SOCKET_EVENTS.JOB_ASSIGNED,
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.APPLICATION_ACCEPTED,
  ])

  const advanceStatus = async (jobId: string, next: JobStatus) => {
    if (next === 'Awaiting Confirmation') {
      navigate(`/technician/active/${jobId}?complete=1`)
      return
    }
    try {
      await jobsApi.updateStatus(jobId, mapApiStatusToUi(next))
      setJobStatus(jobId, next)
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  return (
    <PlanWorkspaceShell page="active">
      <AsyncStateView
        status={jobsQuery.status}
        error={jobsQuery.error}
        onRetry={() => void jobsQuery.reload()}
        emptyTitle={emptyCopy.title}
        emptyHint={emptyCopy.hint}
        loadingLabel="Loading active jobs…"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {safeArray(jobsQuery.data)
            .filter((job) => job.status !== 'Completed')
            .map((job) => {
              const status = (jobStatuses[job.id] ?? job.status) as (typeof flow)[number]
              const idx = flow.indexOf(status)
              const next = flow[idx + 1]

              return (
                <Card
                  key={job.id}
                  className={cn(
                    'p-5 fn-pressable',
                    tier === 'professional' && 'fn-premium-surface border-primary/15',
                    tier === 'business' && 'fn-executive-surface',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={cn(
                          'text-caps',
                          tier === 'business' ? 'text-teal-800' : 'text-primary',
                        )}
                      >
                        {job.category}
                        {tier === 'business' ? ' · Field op' : ''}
                      </p>
                      <h2 className="text-title">{job.title}</h2>
                      <p className="mt-1 text-label text-on-surface-variant">
                        {job.scheduledAt} · {job.parish}
                      </p>
                    </div>
                    <Badge tone={status === 'Awaiting Confirmation' ? 'warning' : 'primary'}>{status}</Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    {job.customerAvatar ? (
                      <img src={job.customerAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-low">
                        <Icon name="person" />
                      </div>
                    )}
                    <div>
                      <p className="text-label font-semibold">
                        {isLocked ? 'Customer locked' : job.customerName}
                      </p>
                      <p className="text-caps text-outline">
                        ★ {job.customerRating}
                        {tier === 'professional' || tier === 'business' ? ' · relationship value' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <StatusTimeline status={status === 'Open' || status === 'Skipped' ? 'Assigned' : status} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/technician/active/${job.id}`}>
                      <Button variant="outline" className="fn-pressable">
                        <Icon name="map" />
                        Open job
                      </Button>
                    </Link>
                    {next && next !== 'Completed' ? (
                      <Button
                        className="fn-pressable"
                        onClick={() => void advanceStatus(job.id, next)}
                        disabled={isLocked && next === 'Assigned'}
                      >
                        {next === 'Awaiting Confirmation' ? 'Mark Work Complete' : `Mark ${next}`}
                      </Button>
                    ) : null}
                    {status === 'Awaiting Confirmation' ? (
                      <Badge tone="secondary">Waiting for customer confirmation</Badge>
                    ) : null}
                  </div>
                </Card>
              )
            })}
        </div>
      </AsyncStateView>
    </PlanWorkspaceShell>
  )
}
