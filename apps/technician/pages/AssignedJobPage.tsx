import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { StatusTimeline } from '@technician/components/jobs/JobCard'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { useApp } from '@technician/context/AppContext'
import { getFriendlyErrorMessage, jobsApi, mapApiStatusToUi, mapAssignedJob, messagesApi, reviewsApi, trackingApi } from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, LiveTrackingPanel, ReviewForm, MarkWorkCompleteDialog, useTrackingPublisher } from '@fixnow/shared'
import { openNavigation } from '@fixnow/native'
import type { JobStatus } from '@fixnow/types'

const flow: JobStatus[] = ['Assigned', 'En Route', 'Started', 'Awaiting Confirmation', 'Completed']

export function AssignedJobPage() {
  const { id = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { jobStatuses, setJobStatus, isLocked } = useApp()
  const navigate = useNavigate()
  const [updating, setUpdating] = useState(false)
  const [trackingActionError, setTrackingActionError] = useState<string | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('complete') === '1') {
      setCompleteOpen(true)
      searchParams.delete('complete')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const jobQuery = useAsync(async () => {
    const res = await jobsApi.getById(id)
    return mapAssignedJob(res.data.job, res.data.customer as Record<string, unknown> | undefined)
  }, [id])

  useRealtimeReload(
    () => void jobQuery.reload(),
    [
      SOCKET_EVENTS.JOB_STATUS_CHANGED,
      SOCKET_EVENTS.JOB_COMPLETED,
      SOCKET_EVENTS.JOB_CANCELLED,
      SOCKET_EVENTS.JOB_ASSIGNED,
      SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
      SOCKET_EVENTS.TRACKING_UPDATE,
      SOCKET_EVENTS.TRACKING_ARRIVED,
    ],
    { joinJobId: id, enabled: !!id },
  )

  const job = jobQuery.data
  const status = job ? ((jobStatuses[job.id] ?? job.status) as (typeof flow)[number]) : 'Assigned'
  const idx = flow.indexOf(status)
  const next = flow[idx + 1]
  const isComplete = status === 'Completed'
  const trackingEnabled = status === 'En Route' || status === 'Started'
  const publisher = useTrackingPublisher(id, trackingEnabled)

  const reviewQuery = useAsync(async () => {
    if (!id || !isComplete) return null
    return (await reviewsApi.forJob(id)).data
  }, [id, isComplete])

  const advanceStatus = async (nextStatus: JobStatus) => {
    if (!job) return
    if (nextStatus === 'Awaiting Confirmation') {
      setCompleteOpen(true)
      return
    }
    setUpdating(true)
    try {
      await jobsApi.updateStatus(job.id, mapApiStatusToUi(nextStatus))
      setJobStatus(job.id, nextStatus)
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setUpdating(false)
    }
  }

  const runTrackingAction = async (
    action: () => Promise<{ data: { session: Parameters<typeof publisher.setSession>[0] } }>,
    after?: () => Promise<void>,
  ) => {
    setTrackingActionError(null)
    try {
      const response = await action()
      publisher.setSession(response.data.session)
      await after?.()
    } catch (err) {
      setTrackingActionError(getFriendlyErrorMessage(err))
    }
  }

  if (jobQuery.status === 'error') {
    return (
      <div className="py-16 text-center">
        <p className="text-headline">Job not found</p>
        <Link to="/technician/active" className="text-primary">
          Back
        </Link>
      </div>
    )
  }

  return (
    <AsyncStateView status={jobQuery.status} error={jobQuery.error} onRetry={() => void jobQuery.reload()} loadingLabel="Loading job…">
      {!job ? null : (
        <div className="mx-auto max-w-3xl space-y-6 animate-fade-up">
          <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-label text-primary">
            <Icon name="arrow_back" className="text-[18px]" />
            Active jobs
          </button>

          <div>
            <p className="text-caps text-primary">{job.category}</p>
            <h1 className="text-headline">{job.title}</h1>
            <p className="text-body text-on-surface-variant">{job.description}</p>
          </div>

          {job.photos[0] ? (
            <img src={job.photos[0]} alt="" className="aspect-video w-full rounded-2xl object-cover" />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-title">Location & safety</h2>
              <p className="mt-2 text-body">{job.address}</p>
              <p className="text-label text-on-surface-variant">
                {job.parish}, {job.district}
              </p>
              <div className="mt-4 space-y-2">
                {[
                  ['share_location', trackingEnabled ? 'Live arrival tracking is sharing with customer' : 'Go En Route to start live tracking'],
                  ['family_restroom', 'Visit shared with family'],
                  ['sos', 'Emergency support one tap away'],
                  ['pin', 'Visit verification on arrival'],
                ].map(([icon, text]) => (
                  <p key={text} className="flex items-center gap-2 text-label">
                    <Icon name={icon} className="text-[18px] text-primary" />
                    {text}
                  </p>
                ))}
              </div>
              <Button
                variant="outline"
                fullWidth
                className="mt-4"
                onClick={() =>
                  openNavigation({
                    label: `${job.address || job.title} ${job.parish} ${job.district}`.trim(),
                  })
                }
              >
                <Icon name="navigation" />
                Open navigation
              </Button>
            </Card>
            <Card className="p-5">
              <h2 className="text-title">Customer</h2>
              <div className="mt-3 flex items-center gap-3">
                {job.customerAvatar ? (
                  <img src={job.customerAvatar} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low">
                    <Icon name="person" />
                  </div>
                )}
                <div>
                  <p className="text-title">{isLocked ? 'Hidden until unlock' : job.customerName}</p>
                  <p className="text-label text-on-surface-variant">★ {job.customerRating}</p>
                </div>
              </div>
              <p className="mt-3 text-label text-on-surface-variant">Budget agreed: {job.budget}</p>
              <Button
                variant="outline"
                fullWidth
                disabled={isLocked}
                className="mt-4"
                onClick={() => {
                  void (async () => {
                    try {
                      const res = await messagesApi.ensureForJob(id)
                      const conversation = res.data.conversation as { _id?: string; id?: string }
                      const conversationId = String(conversation._id ?? conversation.id)
                      navigate(`/technician/messages/${conversationId}`)
                    } catch (err) {
                      window.alert(getFriendlyErrorMessage(err))
                    }
                  })()
                }}
              >
                <Icon name="chat" />
                Message customer
              </Button>
            </Card>
          </div>

          <LiveTrackingPanel
            jobId={id}
            role="technician"
            jobLabel={job.title}
            destinationLabel={`${job.parish}, ${job.district}`}
            showPublisherControls={trackingEnabled}
            publishing={publisher.publishing}
            publisherError={trackingActionError ?? publisher.error}
            externalSession={publisher.session}
            onPause={() => void runTrackingAction(() => trackingApi.pause(id))}
            onResume={() => void runTrackingAction(() => trackingApi.resume(id))}
            onArrived={() =>
              void runTrackingAction(
                () => trackingApi.arrived(id),
                status === 'En Route' ? () => advanceStatus('Started') : undefined,
              )
            }
            onNavigate={() =>
              openNavigation({
                label: `${job.address || job.title} ${job.parish} ${job.district}`.trim(),
              })
            }
          />

          <Card className="p-5">
            <h2 className="mb-4 text-title">Job progress</h2>
            <StatusTimeline status={status === 'Open' || status === 'Skipped' ? 'Assigned' : status} />
            {next && next !== 'Completed' ? (
              <Button
                fullWidth
                className="mt-2"
                disabled={updating}
                onClick={() => void advanceStatus(next)}
              >
                {updating ? 'Updating…' : next === 'Awaiting Confirmation' ? 'Mark Work Complete' : `Update to ${next}`}
              </Button>
            ) : null}
            {status === 'Awaiting Confirmation' ? (
              <div className="mt-3 rounded-2xl bg-secondary-container/40 p-3 text-center">
                <p className="text-label font-semibold text-on-secondary-container">Waiting for customer confirmation</p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  Editing is locked. You will be notified when the customer confirms or reports an issue.
                </p>
              </div>
            ) : null}
          </Card>

          <MarkWorkCompleteDialog
            jobId={id}
            jobTitle={job.title}
            open={completeOpen}
            onClose={() => setCompleteOpen(false)}
            onSubmitted={() => {
              setJobStatus(job.id, 'Awaiting Confirmation')
              void jobQuery.reload()
              navigate('/technician/complete/' + job.id)
            }}
          />

          {isComplete && reviewQuery.data?.canTechnicianReview ? (
            <ReviewForm jobId={id} title="Rate your customer" onDone={() => void reviewQuery.reload()} />
          ) : null}
        </div>
      )}
    </AsyncStateView>
  )
}
