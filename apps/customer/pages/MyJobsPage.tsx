import { Link } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import { customerApi, mapAssignedJob } from '@fixnow/api'
import { useInfiniteList, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { PullToRefresh } from '@fixnow/native'
import type { AssignedJob } from '@fixnow/types'
import { safeArray } from '@fixnow/utils'

function jobId(job: AssignedJob): string {
  return job.id
}

const PAGE_SIZE = 20

export function MyJobsPage() {
  const jobsQuery = useInfiniteList(
    async (page) => {
      const res = await customerApi.jobHistory({ limit: PAGE_SIZE, page })
      return {
        items: safeArray(res.data?.items).map((item) => mapAssignedJob(item)) as AssignedJob[],
        meta: (res.meta ?? (res.data as { meta?: { hasNext?: boolean } }).meta) as
          | { hasNext?: boolean }
          | undefined,
      }
    },
    [],
    { resetKey: 'customer-jobs' },
  )

  useRealtimeReload(() => void jobsQuery.reload(), [
    SOCKET_EVENTS.JOB_CREATED,
    SOCKET_EVENTS.JOB_UPDATED,
    SOCKET_EVENTS.JOB_STATUS_CHANGED,
    SOCKET_EVENTS.JOB_CANCELLED,
    SOCKET_EVENTS.JOB_COMPLETED,
    SOCKET_EVENTS.JOB_ASSIGNED,
    SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
    SOCKET_EVENTS.APPLICATION_SUBMITTED,
    SOCKET_EVENTS.APPLICATION_ACCEPTED,
  ])

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-subtle bg-canvas-white px-4">
        <h1 className="text-title-md text-on-surface">My Jobs</h1>
        <Link
          to="/customer/post-job"
          className="tap-target touch-manip inline-flex items-center text-body-sm font-semibold text-primary"
        >
          Post job
        </Link>
      </header>

      <PullToRefresh onRefresh={() => jobsQuery.reload()}>
        <AsyncStateView
          status={jobsQuery.status}
          error={jobsQuery.error}
          onRetry={() => void jobsQuery.reload()}
          emptyTitle="No jobs yet"
          emptyHint="Post a job to receive offers from verified technicians."
          emptyIcon="home_repair_service"
          emptyActionLabel="Post a job"
          emptyActionHref="/customer/post-job"
          loadingLabel="Loading jobs…"
        >
          <div className="space-y-3 p-4">
            {jobsQuery.items.map((job) => (
              <article
                key={jobId(job)}
                className="overflow-hidden rounded-xl border border-border-subtle bg-canvas-white shadow-sm"
              >
                <div className="border-b border-border-subtle bg-surface-container-low px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-label-caps uppercase text-on-surface-variant">{job.category}</p>
                      <h2 className="text-body-lg font-bold text-on-surface">{job.title}</h2>
                    </div>
                    <span className="rounded-full bg-primary-fixed px-2 py-1 text-[10px] font-bold uppercase text-primary">
                      {job.status}
                    </span>
                  </div>
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    {job.parish} · {job.district}
                  </p>
                </div>
                <div className="flex gap-2 p-4">
                  <Link
                    to={`/customer/tracking/${jobId(job)}`}
                    className="tap-target touch-manip flex h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-on-primary"
                  >
                    <Icon name="local_shipping" className="text-[18px]" />
                    Track
                  </Link>
                  <Link
                    to={`/customer/jobs/${jobId(job)}/applications`}
                    className="tap-target touch-manip flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-border-subtle text-sm font-semibold text-primary"
                  >
                    <Icon name="group" className="text-[18px]" />
                    Applications
                  </Link>
                </div>
              </article>
            ))}

            {jobsQuery.hasMore ? (
              <button
                type="button"
                onClick={() => jobsQuery.loadMore()}
                disabled={jobsQuery.loadingMore}
                className="tap-target touch-manip flex h-11 w-full items-center justify-center rounded-xl border border-border-subtle text-sm font-semibold text-primary disabled:opacity-60"
              >
                {jobsQuery.loadingMore ? 'Loading…' : 'Load more'}
              </button>
            ) : null}
          </div>
        </AsyncStateView>
      </PullToRefresh>
    </div>
  )
}
