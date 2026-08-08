import { Link } from 'react-router-dom'
import { memo } from 'react'
import { Badge, Button, Card, Icon, LazyImage } from '@fixnow/ui'
import type { NearbyJob } from '@fixnow/types'
import { cn } from '@fixnow/utils'

export const JobCard = memo(function JobCard({
  job,
  locked,
  applied,
  onApply,
  onSkip,
  presentation = 'default',
}: {
  job: NearbyJob
  locked?: boolean
  applied?: boolean
  onApply?: () => void
  onSkip?: () => void
  /** Presentation only — does not change apply/skip logic. */
  presentation?: 'default' | 'starter' | 'professional' | 'business'
}) {
  const isPro = presentation === 'professional'
  const isBiz = presentation === 'business'
  const showInsights = isPro || isBiz
  const valueHint =
    job.customerJobs >= 5 ? 'Repeat customer signal' : job.urgent ? 'High urgency' : job.matchScore >= 80 ? 'Strong fit' : null

  return (
    <Card
      hover
      className={cn(
        'relative flex flex-col overflow-hidden p-5 transition-[transform,box-shadow] duration-200 fn-pressable',
        isPro && 'border-primary/20 shadow-[0_10px_24px_-18px_rgba(10,37,64,0.45)]',
        isBiz && 'border-teal-900/20 shadow-[0_12px_28px_-16px_rgba(15,118,110,0.4)]',
      )}
    >
      {job.bestMatch ? (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 rounded-bl-lg bg-primary px-3 py-1 text-caps text-on-primary">
          <Icon name="stars" className="text-[14px]" filled />
          BEST MATCH
        </div>
      ) : null}
      {isBiz && job.urgent ? (
        <div className="absolute left-0 top-0 z-10 rounded-br-lg bg-teal-800 px-2.5 py-1 text-caps text-white">
          Priority demand
        </div>
      ) : null}

      <div className="mb-3 flex items-start justify-between gap-3 pr-16">
        <div>
          <h3 className="text-title text-on-surface">{job.category}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label text-on-surface-variant">
            <span className="inline-flex items-center gap-1">
              <Icon name="location_on" className="text-[18px]" />
              {job.distanceKm > 0 ? `${job.distanceKm} km` : 'Nearby'} · {job.parish}
            </span>
            {job.etaLabel ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="schedule" className="text-[16px]" />
                Est. travel {job.etaLabel}
              </span>
            ) : null}
          </p>
        </div>
        {job.urgent ? <Badge tone="error">URGENT</Badge> : null}
      </div>

      {job.photos[0] ? (
        <div className="mb-3 aspect-[4/3] overflow-hidden rounded-xl border border-border-subtle">
          <LazyImage
            src={job.photos[0]}
            alt=""
            width={640}
            height={480}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <p className="mb-3 line-clamp-2 text-body text-on-surface-variant">{job.description}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone="primary" icon="percent">
          {job.matchScore}% Match
        </Badge>
        <Badge tone="success" icon="verified">
          {job.successScore}% Success
        </Badge>
        {showInsights && valueHint ? (
          <Badge tone={isBiz ? 'secondary' : 'primary'} icon={isBiz ? 'payments' : 'psychology'}>
            {valueHint}
          </Badge>
        ) : null}
        <span className="text-caps text-outline">{job.postedAgo}</span>
      </div>

      {showInsights ? (
        <div
          className={cn(
            'mb-4 rounded-xl p-3',
            isBiz ? 'bg-teal-700/5 border border-teal-900/10' : 'bg-primary/5 border border-primary/10',
          )}
        >
          <p className={cn('text-caps', isBiz ? 'text-teal-800' : 'text-primary')}>
            {isBiz ? 'Job insight' : 'Match tip'}
          </p>
          <p className="mt-1 text-label text-on-surface-variant">
            {job.matchReasons[0] ||
              (isBiz
                ? 'Take it if budget and timing work for your team.'
                : 'Good local fit — reply quickly while the job is open.')}
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-surface-container-low p-3">
          <p className="text-caps text-outline">Why recommended</p>
          <ul className="mt-1 space-y-1">
            {job.matchReasons.map((r) => (
              <li key={r} className="flex items-start gap-2 text-label text-on-surface">
                <Icon name="check_circle" className="mt-0.5 text-[16px] text-primary" filled />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
        <div>
          <p className="text-label font-semibold text-on-surface">{job.budget}</p>
          <p className="text-caps text-outline">
            ★ {job.customerRating} · {job.customerJobs} jobs
            {isBiz && job.customerJobs >= 3 ? ' · retention prospect' : ''}
          </p>
        </div>
        <Link to={`/technician/jobs/${job.id}`} className="text-label font-semibold text-primary">
          Details
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onSkip} disabled={applied} className="fn-pressable">
          Skip
        </Button>
        <Button
          onClick={onApply}
          disabled={locked || applied}
          className={cn('fn-pressable', locked && 'opacity-60')}
        >
          {applied ? 'Applied' : locked ? 'Locked' : 'Apply'}
        </Button>
      </div>
    </Card>
  )
})

export function StatusTimeline({
  status,
}: {
  status: 'Assigned' | 'En Route' | 'Started' | 'Awaiting Confirmation' | 'Completed'
}) {
  const steps = ['Assigned', 'En Route', 'Started', 'Awaiting Confirmation', 'Completed'] as const
  const idx = steps.indexOf(status)

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const done = i <= idx
        const current = i === idx
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2',
                  done ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-surface text-outline',
                )}
              >
                <Icon name={done ? 'check' : 'circle'} className="text-[16px]" filled={done} />
              </div>
              {i < steps.length - 1 ? (
                <div className={cn('my-1 w-0.5 flex-1 min-h-6', done ? 'bg-primary' : 'bg-outline-variant')} />
              ) : null}
            </div>
            <div className="pb-5">
              <p className={cn('text-label font-semibold', current ? 'text-primary' : 'text-on-surface')}>
                {step}
              </p>
              {current ? <p className="text-caps text-outline">Current status</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
