import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon, SubscriptionBadge } from '@fixnow/ui'
import { applicationsApi, formatUgx, getFriendlyErrorMessage } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { safeArray } from '@fixnow/utils'

type ApplicationItem = {
  applicationId: string
  status: string
  message?: string
  proposedAmount?: number | null
  matchScore?: number
  technician: {
    id: string
    name: string
    trustScore?: number
    ratingAverage?: number
    jobsCompleted?: number
    subscriptionBadge?: {
      text: string
      icon?: string
      color?: string
      borderColor?: string
      glow?: boolean
      size?: 'sm' | 'md' | 'lg'
    } | null
  }
}

function parseApplicationItem(raw: unknown): ApplicationItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const application = (row.application as Record<string, unknown> | undefined) ?? row
  const technician = (row.technician as Record<string, unknown> | undefined) ?? {}
  const applicationId = String(application._id ?? application.id ?? '')
  const technicianId = String(technician.id ?? application.technicianId ?? '')
  if (!applicationId) return null

  return {
    applicationId,
    status: String(application.status ?? 'pending'),
    message: typeof application.message === 'string' ? application.message : undefined,
    proposedAmount:
      typeof application.proposedAmount === 'number' ? application.proposedAmount : null,
    matchScore: typeof application.matchScore === 'number' ? application.matchScore : undefined,
    technician: {
      id: technicianId,
      name: String(technician.fullName ?? 'Technician'),
      trustScore: typeof technician.trustScore === 'number' ? technician.trustScore : undefined,
      ratingAverage:
        typeof technician.ratingAverage === 'number' ? technician.ratingAverage : undefined,
      jobsCompleted:
        typeof technician.jobsCompleted === 'number' ? technician.jobsCompleted : undefined,
      subscriptionBadge: (() => {
        const badge = technician.subscriptionBadge as Record<string, unknown> | null | undefined
        if (!badge || typeof badge !== 'object' || !badge.text) return null
        return {
          text: String(badge.text),
          icon: typeof badge.icon === 'string' ? badge.icon : undefined,
          color: typeof badge.color === 'string' ? badge.color : undefined,
          borderColor: typeof badge.borderColor === 'string' ? badge.borderColor : undefined,
          glow: Boolean(badge.glow),
          size:
            badge.size === 'md' || badge.size === 'lg' || badge.size === 'sm'
              ? badge.size
              : ('sm' as const),
        }
      })(),
    },
  }
}

export function JobApplicationsPage() {
  const { id: jobId = '' } = useParams()
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const applicationsQuery = useAsync(async () => {
    const res = await applicationsApi.listForJob(jobId)
    return safeArray(res.data?.items)
      .map(parseApplicationItem)
      .filter((item): item is ApplicationItem => item !== null)
  }, [jobId], { isEmpty: (items) => items.length === 0 })

  useRealtimeReload(
    () => void applicationsQuery.reload(),
    [
      SOCKET_EVENTS.APPLICATION_SUBMITTED,
      SOCKET_EVENTS.APPLICATION_WITHDRAWN,
      SOCKET_EVENTS.APPLICATION_REJECTED,
      SOCKET_EVENTS.APPLICATION_ACCEPTED,
      SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
      SOCKET_EVENTS.JOB_ASSIGNED,
    ],
    { joinJobId: jobId, enabled: !!jobId },
  )

  async function handleAccept(applicationId: string) {
    setActionError(null)
    setActionId(applicationId)
    try {
      await applicationsApi.accept(applicationId)
      await applicationsQuery.reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActionId(null)
    }
  }

  async function handleReject(applicationId: string) {
    setActionError(null)
    setActionId(applicationId)
    try {
      await applicationsApi.reject(applicationId)
      await applicationsQuery.reload()
    } catch (err) {
      setActionError(getFriendlyErrorMessage(err))
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border-subtle bg-canvas-white px-4">
        <Link to={jobId ? `/customer/tracking/${jobId}` : '/customer/jobs'} className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="arrow_back" className="text-on-surface" />
        </Link>
        <h1 className="text-title-md text-on-surface">Job Applications</h1>
      </header>

      {actionError ? (
        <p className="mx-4 mt-4 rounded-lg border border-error/30 bg-error-container px-4 py-3 text-body-sm text-error">
          {actionError}
        </p>
      ) : null}

      <AsyncStateView
        status={applicationsQuery.status}
        error={applicationsQuery.error}
        onRetry={() => void applicationsQuery.reload()}
        emptyTitle="No applications yet"
        emptyHint="Technicians will appear here when they apply to your job."
        loadingLabel="Loading applications…"
      >
        <div className="space-y-3 p-4">
          {safeArray<ApplicationItem>(applicationsQuery.data).map((item) => {
            const pending = item.status === 'pending'
            const busy = actionId === item.applicationId

            return (
              <article
                key={item.applicationId}
                className="rounded-xl border border-border-subtle bg-canvas-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/customer/technician/${item.technician.id}`}
                        className="text-body-lg font-bold text-on-surface hover:text-primary"
                      >
                        {item.technician.name}
                      </Link>
                      {item.technician.subscriptionBadge ? (
                        <SubscriptionBadge
                          text={item.technician.subscriptionBadge.text}
                          icon={item.technician.subscriptionBadge.icon}
                          color={item.technician.subscriptionBadge.color}
                          borderColor={item.technician.subscriptionBadge.borderColor}
                          glow={item.technician.subscriptionBadge.glow}
                          size={item.technician.subscriptionBadge.size || 'sm'}
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-body-sm text-on-surface-variant">
                      {item.technician.ratingAverage != null ? (
                        <span className="inline-flex items-center gap-0.5 font-semibold">
                          <Icon name="star" filled className="text-[16px] text-primary" />
                          {item.technician.ratingAverage}
                        </span>
                      ) : null}
                      {item.technician.trustScore != null ? (
                        <span>Trust {item.technician.trustScore}</span>
                      ) : null}
                      {item.technician.jobsCompleted != null ? (
                        <span>{item.technician.jobsCompleted} jobs</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="rounded-full bg-surface-container px-2 py-1 text-[10px] font-bold uppercase text-on-surface-variant">
                    {item.status}
                  </span>
                </div>

                {item.proposedAmount != null ? (
                  <p className="mt-3 text-body-sm font-semibold text-primary">
                    Quote: {formatUgx(item.proposedAmount)}
                  </p>
                ) : null}

                {item.message ? (
                  <p className="mt-2 text-body-sm text-on-surface-variant">{item.message}</p>
                ) : null}

                {pending ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAccept(item.applicationId)}
                      className="flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-on-primary disabled:opacity-60"
                    >
                      {busy ? 'Working…' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleReject(item.applicationId)}
                      className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border-subtle text-sm font-semibold text-error disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </AsyncStateView>
    </div>
  )
}
