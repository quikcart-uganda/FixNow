import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@fixnow/ui'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Icon } from '@fixnow/ui'
import { GuaranteeChip } from '@technician/components/trust/Trust'
import { PlanWorkspaceShell, usePlanWorkspaceTier } from '@technician/components/PlanWorkspaceShell'
import { useApp } from '@technician/context/AppContext'
import { applicationsApi, getFriendlyErrorMessage, jobsApi, mapNearbyJob } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { cn, safeArray } from '@fixnow/utils'

export function JobDetailsPage() {
  const { id = '' } = useParams()
  const { canApply, appliedJobs, markApplied, refreshProfile, isLocked } = useApp()
  const tier = usePlanWorkspaceTier()
  const navigate = useNavigate()
  const [applyError, setApplyError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const jobQuery = useAsync(async () => {
    const res = await jobsApi.getById(id)
    return mapNearbyJob({ ...asRecord(res.data.job), customer: res.data.customer })
  }, [id])

  const appliedQuery = useAsync(async () => {
    const res = await applicationsApi.listMine()
    return safeArray(res.data?.items).some((item) => {
      const row = asRecord(item)
      const app = asRecord(row.application ?? row)
      const jobId = app.jobId
      const jobIdStr = typeof jobId === 'string' ? jobId : String(asRecord(jobId).id ?? asRecord(jobId)._id ?? '')
      return jobIdStr === id
    })
  }, [id])

  const job = jobQuery.data
  const applied = appliedJobs.includes(id) || Boolean(appliedQuery.data)

  const handleApply = async () => {
    if (!job || !canApply || applied) return
    setSubmitting(true)
    setApplyError(null)
    try {
      await applicationsApi.apply(job.id)
      markApplied(job.id)
      await refreshProfile()
      navigate('/technician/jobs')
    } catch (err) {
      setApplyError(getFriendlyErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (jobQuery.status === 'error') {
    return (
      <div className="py-20 text-center">
        <p className="text-headline">Job not found</p>
        <p className="mt-2 text-body text-on-surface-variant">{jobQuery.error}</p>
        <Link to="/technician/jobs" className="mt-4 inline-block text-primary">
          Back to feed
        </Link>
      </div>
    )
  }

  return (
    <AsyncStateView
      status={jobQuery.status}
      error={jobQuery.error}
      onRetry={() => void jobQuery.reload()}
      loadingLabel="Loading job details…"
    >
      {!job ? null : (
        <PlanWorkspaceShell page="jobDetails" className="mx-auto max-w-3xl" compact>
          <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-label text-primary fn-pressable">
            <Icon name="arrow_back" className="text-[18px]" />
            Back
          </button>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={cn('text-caps', tier === 'business' ? 'text-teal-800' : 'text-primary')}>
                {job.category}
              </p>
              <h2 className="text-headline">{job.title}</h2>
              <p className="mt-1 flex items-center gap-1 text-label text-on-surface-variant">
                <Icon name="location_on" className="text-[18px]" />
                {job.distanceKm}km · {job.parish}, {job.district} · {job.postedAgo}
                {job.etaLabel ? ` · travel ${job.etaLabel}` : ''}
              </p>
            </div>
            <GuaranteeChip />
          </div>

          {job.photos[0] ? (
            <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-border-subtle">
              <img src={job.photos[0]} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className={cn('p-4 text-center', tier === 'professional' && 'fn-premium-surface')}>
              <p className="text-caps text-outline">Match Score</p>
              <p className="text-trust text-primary">{job.matchScore}%</p>
            </Card>
            <Card className={cn('p-4 text-center', tier === 'professional' && 'fn-premium-surface')}>
              <p className="text-caps text-outline">Success Prediction</p>
              <p className="text-trust text-tertiary">{job.successScore}%</p>
            </Card>
            <Card className={cn('p-4 text-center', tier === 'business' && 'fn-executive-surface')}>
              <p className="text-caps text-outline">{tier === 'business' ? 'Value' : 'Budget'}</p>
              <p className="mt-2 text-title">{job.budget}</p>
            </Card>
          </div>

          {(tier === 'professional' || tier === 'business') && (
            <Card
              className={cn(
                'p-5',
                tier === 'business' ? 'fn-executive-surface' : 'fn-premium-surface border-primary/15',
              )}
            >
              <p className={cn('text-caps', tier === 'business' ? 'text-teal-800' : 'text-primary')}>
                {tier === 'business' ? 'Job insight' : 'Job tip'}
              </p>
              <p className="mt-2 text-body text-on-surface-variant">
                {tier === 'business'
                  ? `${job.urgent ? 'Urgent job. ' : ''}Customer history: ${job.customerJobs} jobs · ★${job.customerRating}. Take it if travel and capacity allow.`
                  : `${job.matchReasons[0] || 'Strong local fit.'} Budget ${job.budget} with ${job.successScore}% success outlook.`}
              </p>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-title">Problem description</h2>
            <p className="mt-2 text-body text-on-surface-variant">{job.description}</p>
            <div className="mt-4 space-y-2">
              <p className="text-caps text-outline">Why you’re a strong match</p>
              {job.matchReasons.map((r) => (
                <p key={r} className="flex items-center gap-2 text-label">
                  <Icon name="auto_awesome" className="text-[18px] text-primary" filled />
                  {r}
                </p>
              ))}
            </div>
          </Card>

          <Card className={cn('p-5', tier === 'business' && 'fn-executive-surface')}>
            <h2 className="text-title">
              {tier === 'business' ? 'Customer value' : 'Customer'}
            </h2>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-title">{isLocked ? 'Customer hidden' : job.customerName}</p>
                <p className="text-label text-on-surface-variant">
                  ★ {job.customerRating} · {job.customerJobs} completed jobs on FixNow
                  {tier === 'professional' || tier === 'business'
                    ? job.customerJobs >= 5
                      ? ' · retention prospect'
                      : ' · new relationship'
                    : ''}
                </p>
              </div>
              {isLocked ? <Badge tone="warning" icon="lock">Contact locked</Badge> : <Badge tone="success" icon="verified">Verified</Badge>}
            </div>
            <p className="mt-3 text-label text-on-surface-variant">
              Location: {job.parish}, {job.district}
              {isLocked ? ' — exact pin & phone unlock after Upgrade' : ''}
            </p>
          </Card>

          {applyError ? (
            <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{applyError}</div>
          ) : null}

          <div className="sticky bottom-24 z-20 grid grid-cols-2 gap-3 rounded-2xl border border-border-subtle bg-surface/95 p-3 shadow-float backdrop-blur lg:static lg:bottom-auto lg:bg-transparent lg:p-0 lg:shadow-none">
            <Button
              variant="outline"
              className="fn-pressable"
              disabled={isLocked}
              onClick={() => navigate('/technician/messages')}
              title="Open inbox — chat is available after you are assigned"
            >
              <Icon name="chat" />
              Inbox
            </Button>
            <Button
              className="fn-pressable"
              disabled={!canApply || applied || submitting}
              onClick={() => {
                if (!canApply) {
                  navigate('/technician/locked')
                  return
                }
                void handleApply()
              }}
            >
              <Icon name="send" />
              {applied ? 'Applied' : submitting ? 'Applying…' : 'Apply'}
            </Button>
          </div>
        </PlanWorkspaceShell>
      )}
    </AsyncStateView>
  )
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}
