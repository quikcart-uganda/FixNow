import { memo } from 'react'
import { Link } from 'react-router-dom'
import { cloudinaryPresetUrl } from '@fixnow/assets'
import type { AdminTechnician } from '@fixnow/types/admin'
import { ProfileAvatar } from '@fixnow/ui'
import { Button, Icon, LevelBadge, StatusBadge } from '../ui'
import { TechnicianActionsMenu } from './TechnicianActionsMenu'
import type { TechnicianAction } from './technicianMenu'
import {
  availabilityLabel,
  formatRating,
  formatResponseTime,
  formatSuccessRate,
  jobCreditsLabel,
  locationLabel,
  lockLabel,
  lockTone,
  profilePhotoSrc,
  serviceCategoryLabel,
  subscriptionLabel,
  verificationLabel,
  verificationTone,
} from './technicianHelpers'

type Props = {
  technician: AdminTechnician
  acting?: boolean
  canDelete?: boolean
  onOpen: () => void
  onAction: (action: TechnicianAction) => void
}

function KpiCell({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: string
}) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-alt/70 px-2.5 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        {label}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums text-ink-primary">
        {icon ? <Icon name={icon} className="!text-[15px] text-amber-500" /> : null}
        <span className="truncate">{value}</span>
      </p>
    </div>
  )
}

function TechnicianCardComponent({
  technician: t,
  acting,
  canDelete,
  onOpen,
  onAction,
}: Props) {
  const photo = profilePhotoSrc(t)
  const photoUrl = photo ? cloudinaryPresetUrl(photo, 'avatar2x') || photo : undefined
  const category = serviceCategoryLabel(t)

  return (
    <article
      className="technician-card relative flex h-full flex-col rounded-2xl border border-border/80 bg-canvas p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[0_2px_8px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.06)] focus-within:border-primary sm:p-5"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 320px' }}
    >
      {/* Row 1 — identity */}
      <div className="flex items-start gap-3.5">
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={`Open profile for ${t.name}`}
        >
          <ProfileAvatar
            alt={t.name}
            src={photoUrl}
            role="technician"
            verified={t.verification === 'verified'}
            online={t.availableNow}
            className="h-16 w-16 rounded-full shadow-[0_2px_8px_rgba(15,23,42,0.12)] sm:h-[72px] sm:w-[72px]"
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="block truncate text-[15px] font-semibold text-ink-primary sm:text-base">
                {t.name}
              </span>
            </button>
            <div className="relative z-10 -mr-1 -mt-1 hidden sm:block">
              <TechnicianActionsMenu
                technician={t}
                acting={acting}
                canDelete={canDelete}
                onAction={onAction}
              />
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge
              label={verificationLabel(t.verification)}
              tone={verificationTone(t.verification)}
              icon={t.verification === 'verified' ? 'verified' : undefined}
            />
            <StatusBadge
              label={availabilityLabel(t.availableNow)}
              tone={t.availableNow ? 'success' : 'neutral'}
              icon={t.availableNow ? 'radio_button_checked' : 'radio_button_unchecked'}
            />
            <LevelBadge level={t.level} />
          </div>

          <p className="mt-2 truncate text-sm text-ink-secondary">{category}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
            <Icon name="location_on" className="!text-[14px]" />
            {locationLabel(t)}
          </p>
        </div>
      </div>

      {/* Row 2 — KPI strip */}
      <div
        className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6"
        role="group"
        aria-label={`Performance metrics for ${t.name}`}
      >
        <KpiCell label="Rating" value={formatRating(t.rating)} icon="star" />
        <KpiCell label="Trust" value={String(t.scores.trust)} />
        <KpiCell label="Completed" value={String(t.completedJobs)} />
        <KpiCell label="Open" value={String(t.openJobs)} />
        <KpiCell label="Success" value={formatSuccessRate(t.successRate)} />
        <KpiCell label="Response" value={formatResponseTime(t.responseTimeMinutesAvg)} />
      </div>

      {/* Row 3 — administrative status */}
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Administrative status">
        <StatusBadge label={verificationLabel(t.verification)} tone={verificationTone(t.verification)} />
        <StatusBadge label={lockLabel(t.lockStatus)} tone={lockTone(t.lockStatus)} />
        <StatusBadge label={subscriptionLabel(t.subscriptionPlanCode)} tone="info" />
        <StatusBadge label={`Credits ${jobCreditsLabel(t)}`} tone="neutral" />
        <StatusBadge label={t.level} tone="neutral" icon="military_tech" />
      </div>

      {/* Row 4 — primary actions */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3">
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 flex-1 basis-[30%] sm:flex-none sm:basis-auto"
          onClick={onOpen}
        >
          <span className="sm:hidden">View</span>
          <span className="hidden sm:inline">View Profile</span>
        </Button>
        <Link
          to={`/admin/jobs?q=${encodeURIComponent(t.name)}`}
          className="inline-flex min-h-11 flex-1 basis-[30%] items-center justify-center rounded-lg border border-outline-variant px-3 text-sm font-medium text-ink-primary transition-colors hover:bg-surface-alt sm:flex-none sm:basis-auto"
        >
          <span className="sm:hidden">Manage</span>
          <span className="hidden sm:inline">Manage Jobs</span>
        </Link>
        <Link
          to={`/admin/tracking?q=${encodeURIComponent(t.id)}`}
          className="hidden min-h-11 items-center justify-center rounded-lg border border-outline-variant px-3 text-sm font-medium text-ink-primary transition-colors hover:bg-surface-alt sm:inline-flex"
        >
          Live Tracking
        </Link>
        <div className="relative z-10 sm:hidden">
          <TechnicianActionsMenu
            technician={t}
            acting={acting}
            canDelete={canDelete}
            triggerLabel="More"
            triggerClassName="border border-outline-variant"
            onAction={onAction}
          />
        </div>
      </div>
    </article>
  )
}

export const TechnicianCard = memo(TechnicianCardComponent)
