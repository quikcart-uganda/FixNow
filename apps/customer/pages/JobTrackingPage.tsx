import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '@fixnow/ui'
import {
  getFriendlyErrorMessage,
  jobsApi,
  mapAssignedJob,
  messagesApi,
  paymentsApi,
  reviewsApi,
} from '@fixnow/api'
import { useAsync, useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { AsyncStateView, LiveTrackingPanel, ReviewForm, CustomerCompletionActions } from '@fixnow/shared'
import type { JobStatus } from '@fixnow/types'

const STEP_LABELS = ['Posted', 'Offers', 'Assigned', 'En route', 'Complete'] as const

/** Shared action control styles — visual only; handlers stay on callers. */
const ACTION_BASE =
  'inline-flex min-h-[52px] h-14 touch-manipulation select-none items-center justify-center gap-2.5 rounded-2xl px-5 text-[15px] font-semibold leading-none whitespace-nowrap transition-all [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100'

const ACTION_PRIMARY = `${ACTION_BASE} bg-gradient-to-r from-primary to-primary-container text-white shadow-md hover:brightness-105 hover:shadow-lg active:brightness-95`

const ACTION_SECONDARY = `${ACTION_BASE} border-2 border-primary bg-canvas-white text-primary shadow-sm hover:bg-primary-fixed/50 active:bg-primary-fixed`

const ACTION_SOFT = `${ACTION_BASE} border border-border-subtle bg-canvas-white text-primary shadow-sm hover:border-primary/40 hover:bg-surface-container-low`

const ACTION_DANGER = `${ACTION_BASE} border border-error/40 bg-canvas-white text-error shadow-sm hover:bg-error-container/40`

function statusRank(uiStatus: JobStatus): number {
  const rank: Record<JobStatus, number> = {
    Open: 1,
    Assigned: 2,
    'En Route': 3,
    Started: 3,
    'Awaiting Confirmation': 4,
    Completed: 4,
    Skipped: -1,
  }
  return rank[uiStatus] ?? 0
}

function buildSteps(uiStatus: JobStatus) {
  const current = statusRank(uiStatus)
  return STEP_LABELS.map((label, index) => ({
    id: index + 1,
    label,
    done: current >= 0 && index < current,
    active: current >= 0 && index === current,
  }))
}

function liveStatusLabel(uiStatus: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    Open: 'Receiving Offers',
    Assigned: 'Technician Assigned',
    'En Route': 'En Route',
    Started: 'In Progress',
    'Awaiting Confirmation': 'Confirm Completion',
    Completed: 'Completed',
    Skipped: 'Skipped',
  }
  return labels[uiStatus] ?? uiStatus
}

function liveStatusTone(uiStatus: JobStatus): string {
  if (uiStatus === 'Open') return 'bg-success-green/15 text-success-green'
  if (uiStatus === 'Completed') return 'bg-primary/10 text-primary'
  if (uiStatus === 'Skipped') return 'bg-error/10 text-error'
  return 'bg-secondary-container text-on-secondary-container'
}

export function JobTrackingPage() {
  const { id: routeId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const jobId = routeId ?? searchParams.get('id') ?? ''
  const [escrowBusy, setEscrowBusy] = useState(false)
  const [completionOpen, setCompletionOpen] = useState(false)

  const jobQuery = useAsync(async () => {
    if (!jobId) throw new Error('No job selected.')
    const res = await jobsApi.getById(jobId)
    return mapAssignedJob(res.data.job, res.data.customer)
  }, [jobId])

  const escrowQuery = useAsync(async () => {
    if (!jobId) return null
    try {
      return (await paymentsApi.escrowForJob(jobId)).data
    } catch {
      return null
    }
  }, [jobId])

  const job = jobQuery.data
  const uiStatus = job?.status ?? 'Open'
  const steps = buildSteps(uiStatus)
  const canChat = uiStatus !== 'Open' && uiStatus !== 'Skipped'
  const isComplete = uiStatus === 'Completed'
  const escrowStatus = String(escrowQuery.data?.escrow?.status ?? '').toLowerCase()
  const escrowActive = ['held', 'disputed', 'partially_released'].includes(escrowStatus)
  const canManagePayment = !['Open', 'Completed', 'Skipped'].includes(uiStatus)
  const canManageEscrow = escrowActive && escrowStatus !== 'disputed'

  const reviewQuery = useAsync(async () => {
    if (!jobId || !isComplete) return null
    return (await reviewsApi.forJob(jobId)).data
  }, [jobId, isComplete])

  useRealtimeReload(
    () => {
      void jobQuery.reload()
      void reviewQuery.reload()
      void escrowQuery.reload()
    },
    [
      SOCKET_EVENTS.JOB_STATUS_CHANGED,
      SOCKET_EVENTS.JOB_COMPLETED,
      SOCKET_EVENTS.JOB_CANCELLED,
      SOCKET_EVENTS.JOB_ASSIGNED,
      SOCKET_EVENTS.TECHNICIAN_ASSIGNED,
      SOCKET_EVENTS.REVIEW_SUBMITTED,
      SOCKET_EVENTS.ESCROW_FUNDED,
      SOCKET_EVENTS.ESCROW_RELEASED,
      SOCKET_EVENTS.REFUND_REQUESTED,
      SOCKET_EVENTS.REFUND_APPROVED,
      SOCKET_EVENTS.PAYMENT_SUCCESSFUL,
    ],
    { joinJobId: jobId, enabled: !!jobId },
  )

  const openChat = async () => {
    try {
      const res = await messagesApi.ensureForJob(jobId)
      const conversation = res.data.conversation as { _id?: string; id?: string }
      navigate(`/customer/messages/${String(conversation._id ?? conversation.id)}`)
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    }
  }

  const requestRefund = async () => {
    if (!jobId) return
    const reason = window.prompt('Refund reason (optional)', 'Customer requested refund')
    if (reason === null) return
    setEscrowBusy(true)
    try {
      await paymentsApi.requestRefund({ jobId, reason: reason || undefined })
      await escrowQuery.reload()
      window.alert("Refund requested. We'll notify you once it's been reviewed.")
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setEscrowBusy(false)
    }
  }

  const openDispute = async () => {
    if (!jobId) return
    const reason = window.prompt('Describe the dispute', '')
    if (!reason || reason.trim().length < 3) return
    setEscrowBusy(true)
    try {
      await paymentsApi.openDispute({ jobId, reason: reason.trim() })
      await escrowQuery.reload()
      window.alert('Dispute opened. An admin will intervene.')
    } catch (err) {
      window.alert(getFriendlyErrorMessage(err))
    } finally {
      setEscrowBusy(false)
    }
  }

  return (
    <div className="">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-subtle bg-canvas-white px-4">
        <h1 className="text-title-md">Job Tracking</h1>
        <Link to="/customer/help" className="text-body-sm font-semibold text-primary">
          Help
        </Link>
      </header>

      {!jobId ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-base font-semibold">No job selected</p>
          <p className="max-w-md text-sm opacity-70">Open a job from your job list to track its progress.</p>
          <Link to="/customer/jobs" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
            View my jobs
          </Link>
        </div>
      ) : (
        <AsyncStateView
          status={jobQuery.status}
          error={jobQuery.error}
          onRetry={() => void jobQuery.reload()}
          emptyTitle="Job not found"
          emptyHint="This job may have been removed or you may not have access to it."
          loadingLabel="Loading job…"
        >
          {job ? (
            <section className="space-y-6 p-4">
              <div className="overflow-hidden rounded-2xl border border-border-subtle bg-canvas-white shadow-sm">
                <div className="bg-primary-container px-5 py-4 text-on-primary">
                  <p className="text-label-caps uppercase opacity-80">Active job</p>
                  <h2 className="mt-1 text-title-md font-bold">{job.title}</h2>
                  <p className="mt-1 text-body-sm text-on-primary-container">
                    {job.parish} · {job.district} · {uiStatus}
                  </p>
                </div>
                <div className="space-y-4 p-5">
                  {steps.map((step) => (
                    <div key={step.id} className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          step.done
                            ? 'bg-success-green text-white'
                            : step.active
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-outline'
                        }`}
                      >
                        <Icon
                          name={step.done ? 'check' : step.active ? 'near_me' : 'radio_button_unchecked'}
                          className="text-[18px]"
                        />
                      </div>
                      <span className={`text-body-lg ${step.active ? 'font-bold text-primary' : 'text-on-surface'}`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-title-md">Live status</h3>
                  <span
                    className={`inline-flex max-w-[55%] shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide ${liveStatusTone(uiStatus)}`}
                    aria-live="polite"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        uiStatus === 'Open'
                          ? 'bg-success-green'
                          : uiStatus === 'Skipped'
                            ? 'bg-error'
                            : 'bg-primary'
                      }`}
                      aria-hidden
                    />
                    <span className="truncate">{liveStatusLabel(uiStatus)}</span>
                  </span>
                </div>

                <p className="mt-3 text-body-sm leading-relaxed text-on-surface-variant">
                  {job.description || `Your job is currently ${uiStatus.toLowerCase()}.`}
                </p>

                {uiStatus === 'Awaiting Confirmation' ? (
                  <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                    <p className="text-title-sm font-semibold text-primary">Technician marked this job complete</p>
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      Confirm only if you are satisfied. Reporting an issue returns the job to In Progress and does not
                      count toward the technician’s free completed jobs.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        className={`${ACTION_PRIMARY} w-full`}
                        onClick={() => setCompletionOpen(true)}
                      >
                        <Icon name="check_circle" className="text-[22px] text-white" />
                        Confirm Completion
                      </button>
                      <button
                        type="button"
                        className={`${ACTION_DANGER} w-full`}
                        onClick={() => setCompletionOpen(true)}
                      >
                        <Icon name="report" className="text-[22px]" />
                        Report an Issue
                      </button>
                    </div>
                  </div>
                ) : null}

                <CustomerCompletionActions
                  jobId={jobId}
                  jobTitle={job.title}
                  open={completionOpen}
                  onClose={() => setCompletionOpen(false)}
                  onChanged={() => {
                    void jobQuery.reload()
                    void reviewQuery.reload()
                    void escrowQuery.reload()
                  }}
                />

                <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface-container-low px-3.5 py-2 text-body-sm font-semibold text-on-surface">
                    <Icon name="location_on" className="text-[20px] text-primary" />
                    <span className="truncate">
                      {[job.parish, job.district].filter((part) => part && part !== '—').join(', ') ||
                        'Location pending'}
                    </span>
                  </span>
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface-container-low px-3.5 py-2 text-body-sm font-semibold text-on-surface">
                    <Icon name="payments" className="text-[20px] text-primary" />
                    <span className="truncate">Budget: {job.budget || 'Flexible'}</span>
                  </span>
                  {escrowQuery.data?.escrow ? (
                    <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface-container-low px-3.5 py-2 text-body-sm font-semibold text-on-surface">
                      <Icon name="account_balance_wallet" className="text-[20px] text-primary" />
                      <span className="truncate capitalize">
                        Escrow: {escrowStatus || '—'}
                        {escrowStatus === 'disputed' ? ' · Admin review' : ''}
                      </span>
                    </span>
                  ) : null}
                </div>

                {(canChat || canManagePayment || canManageEscrow) && (
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {canChat ? (
                      <button
                        type="button"
                        onClick={() => void openChat()}
                        className={`${ACTION_PRIMARY} w-full`}
                        aria-label="Open chat with technician"
                      >
                        <Icon name="chat" className="text-[22px] text-white" />
                        Open chat
                      </button>
                    ) : null}
                    {canManagePayment ? (
                      <Link
                        to={`/customer/payments/pay/${jobId}`}
                        className={`${ACTION_SOFT} w-full`}
                        aria-label={escrowActive ? 'View payment and escrow' : 'Pay or fund escrow'}
                      >
                        <Icon name="payments" className="text-[22px]" />
                        {escrowActive ? 'Payment / escrow' : 'Pay / escrow'}
                      </Link>
                    ) : null}
                    {canManageEscrow ? (
                      <>
                        <button
                          type="button"
                          disabled={escrowBusy}
                          aria-busy={escrowBusy}
                          onClick={() => void requestRefund()}
                          className={`${ACTION_SOFT} w-full`}
                        >
                          <Icon name="undo" className="text-[22px]" />
                          {escrowBusy ? 'Working…' : 'Request refund'}
                        </button>
                        <button
                          type="button"
                          disabled={escrowBusy}
                          aria-busy={escrowBusy}
                          onClick={() => void openDispute()}
                          className={`${ACTION_DANGER} w-full`}
                        >
                          <Icon name="gavel" className="text-[22px]" />
                          {escrowBusy ? 'Working…' : 'Open dispute'}
                        </button>
                      </>
                    ) : null}
                  </div>
                )}

                <nav
                  className="mt-5 flex flex-col gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-stretch"
                  aria-label="Job navigation"
                >
                  <Link
                    to={`/customer/jobs/${jobId}/applications`}
                    className={`${ACTION_PRIMARY} w-full sm:min-w-0 sm:flex-1`}
                    aria-label="View technician offers for this job"
                  >
                    <Icon name="group" className="text-[22px] text-white" />
                    View Offers
                  </Link>
                  <Link
                    to="/customer/jobs"
                    className={`${ACTION_SECONDARY} w-full sm:min-w-0 sm:flex-1`}
                    aria-label="View all your jobs"
                  >
                    <Icon name="work" className="text-[22px]" />
                    All Jobs
                  </Link>
                </nav>
              </div>

              {uiStatus === 'En Route' || uiStatus === 'Started' || uiStatus === 'Assigned' || uiStatus === 'Awaiting Confirmation' ? (
                <LiveTrackingPanel
                  jobId={jobId}
                  role="customer"
                  jobLabel={job.title}
                  destinationLabel={`${job.parish}, ${job.district}`}
                  onChat={canChat ? () => void openChat() : undefined}
                />
              ) : null}

              {isComplete && reviewQuery.data?.canCustomerReview ? (
                <ReviewForm jobId={jobId} title="Rate your technician" onDone={() => void reviewQuery.reload()} />
              ) : null}
              {isComplete && reviewQuery.data?.customerToTechnician ? (
                <div className="rounded-2xl border border-border-subtle bg-canvas-white p-5">
                  <h3 className="text-title-md">Your review</h3>
                  <p className="mt-2 text-body-sm">
                    {String(
                      (reviewQuery.data.customerToTechnician.review as { overallRating?: number }).overallRating,
                    )}
                    ★ —{' '}
                    {String(
                      (reviewQuery.data.customerToTechnician.review as { comment?: string }).comment ||
                        'No comment',
                    )}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}
        </AsyncStateView>
      )}
    </div>
  )
}
