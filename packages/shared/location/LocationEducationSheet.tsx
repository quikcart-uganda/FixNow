import { Link } from 'react-router-dom'
import { BottomSheet, Button, Icon } from '@fixnow/ui'
import { LOCATION_COPY, type LocationCopy } from './locationPolicy'

export type LocationFlowStep =
  | 'idle'
  | 'requesting_permission'
  | 'getting_gps'
  | 'finding_address'
  | 'saving'
  | 'refreshing'
  | 'success'
  | 'denied'
  | 'error'

type Props = {
  open: boolean
  copy: LocationCopy
  mode: 'educate' | 'permanent' | 'progress' | 'denied'
  busy?: boolean
  step?: LocationFlowStep
  stepDetail?: string | null
  onEnable: () => void
  onDismiss: () => void
  onOpenSettings: () => void
  onRetry?: () => void
  onUseCity?: () => void
  cityLabel?: string
  addressesHref?: string
  searchHref?: string
  mapHref?: string
}

const STEP_COPY: Record<Exclude<LocationFlowStep, 'idle' | 'denied' | 'error'>, string> = {
  requesting_permission: 'Requesting permission…',
  getting_gps: 'Getting GPS location…',
  finding_address: 'Finding your address…',
  saving: 'Saving your location…',
  refreshing: 'Updating nearby technicians…',
  success: 'Nearby technicians updated ✓',
}

/**
 * Pre-permission explanation + live progress + denial recovery sheet.
 */
export function LocationEducationSheet({
  open,
  copy,
  mode,
  busy,
  step = 'idle',
  stepDetail,
  onEnable,
  onDismiss,
  onOpenSettings,
  onRetry,
  onUseCity,
  cityLabel = 'Use current city',
  addressesHref = '/customer/profile',
  searchHref = '/customer/search',
  mapHref = '/customer/search',
}: Props) {
  if (mode === 'progress') {
    const label =
      step === 'success'
        ? STEP_COPY.success
        : step === 'error'
          ? stepDetail || 'Something went wrong'
          : STEP_COPY[step as keyof typeof STEP_COPY] || 'Working…'
    return (
      <BottomSheet open={open} onClose={step === 'success' ? onDismiss : () => undefined} title="Updating location">
        <div className="space-y-4 px-1 pb-4 pt-2" role="status" aria-live="polite">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon
              name={step === 'success' ? 'check_circle' : step === 'error' ? 'error' : 'my_location'}
              className={`text-[28px] ${step === 'success' || step === 'error' ? '' : 'animate-pulse'}`}
              filled={step === 'success'}
            />
          </div>
          <p className="text-center text-base font-semibold text-on-surface">{label}</p>
          {stepDetail && step !== 'success' ? (
            <p className="text-center text-sm text-on-surface-variant">{stepDetail}</p>
          ) : null}
          <ul className="space-y-2 text-sm text-on-surface-variant">
            {(
              [
                ['requesting_permission', 'Requesting permission'],
                ['getting_gps', 'Getting GPS location'],
                ['finding_address', 'Finding your address'],
                ['refreshing', 'Nearby technicians updated'],
              ] as const
            ).map(([key, text]) => {
              const order = [
                'requesting_permission',
                'getting_gps',
                'finding_address',
                'saving',
                'refreshing',
                'success',
              ]
              const currentIdx = order.indexOf(step)
              const itemIdx = order.indexOf(key === 'refreshing' ? 'refreshing' : key)
              const done = step === 'success' || currentIdx > itemIdx
              const active = step === key || (key === 'refreshing' && (step === 'saving' || step === 'refreshing'))
              return (
                <li key={key} className="flex items-center gap-2">
                  <Icon
                    name={done ? 'check_circle' : active ? 'progress_activity' : 'radio_button_unchecked'}
                    className={`text-[18px] ${done ? 'text-emerald-600' : active ? 'text-primary' : 'text-outline'}`}
                    filled={done}
                  />
                  <span className={done || active ? 'text-on-surface' : ''}>
                    {text}
                    {done && key === 'refreshing' ? ' ✓' : ''}
                  </span>
                </li>
              )
            })}
          </ul>
          {step === 'error' ? (
            <div className="flex flex-col gap-2">
              {onRetry ? (
                <Button type="button" fullWidth size="lg" onClick={onRetry} className="min-h-12 rounded-2xl">
                  Retry
                </Button>
              ) : null}
              <Button type="button" fullWidth size="lg" variant="outline" onClick={onDismiss} className="min-h-12 rounded-2xl">
                Close
              </Button>
            </div>
          ) : null}
        </div>
      </BottomSheet>
    )
  }

  if (mode === 'denied' || mode === 'permanent') {
    const title = mode === 'permanent' ? copy.permanentTitle : 'Location not enabled'
    const body =
      mode === 'permanent'
        ? copy.permanentBody
        : 'You can still browse using your city, a saved address, or search. Enable location anytime for nearby matches.'
    return (
      <BottomSheet open={open} onClose={onDismiss} title={title} description={body}>
        <div className="space-y-3 px-1 pb-4 pt-2">
          {mode === 'permanent' ? (
            <Button type="button" fullWidth size="lg" disabled={busy} onClick={onOpenSettings} className="min-h-12 rounded-2xl">
              <Icon name="settings" />
              {copy.openSettingsLabel}
            </Button>
          ) : (
            <Button type="button" fullWidth size="lg" disabled={busy} onClick={onEnable} className="min-h-12 rounded-2xl">
              <Icon name="my_location" />
              Retry permission
            </Button>
          )}
          {onRetry ? (
            <Button type="button" fullWidth size="lg" variant="outline" disabled={busy} onClick={onRetry} className="min-h-12 rounded-2xl">
              Retry GPS
            </Button>
          ) : null}
          {onUseCity ? (
            <Button type="button" fullWidth size="lg" variant="outline" disabled={busy} onClick={onUseCity} className="min-h-12 rounded-2xl">
              <Icon name="location_city" />
              {cityLabel}
            </Button>
          ) : null}
          <Link
            to={searchHref}
            onClick={onDismiss}
            className="tap-target flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border-subtle px-4 text-sm font-semibold text-on-surface"
          >
            <Icon name="search" />
            Search address
          </Link>
          <Link
            to={mapHref}
            onClick={onDismiss}
            className="tap-target flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border-subtle px-4 text-sm font-semibold text-on-surface"
          >
            <Icon name="map" />
            Choose on map
          </Link>
          <Link
            to={addressesHref}
            onClick={onDismiss}
            className="tap-target flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border-subtle px-4 text-sm font-semibold text-on-surface"
          >
            <Icon name="home" />
            Use saved address
          </Link>
          <Button type="button" fullWidth size="lg" variant="outline" disabled={busy} onClick={onDismiss} className="min-h-12 rounded-2xl">
            {copy.dismissLabel}
          </Button>
        </div>
      </BottomSheet>
    )
  }

  const title = copy.title
  const body = copy.body

  return (
    <BottomSheet open={open} onClose={onDismiss} title={title} description={body}>
      <div className="space-y-4 px-1 pb-4 pt-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="near_me" className="text-[28px]" />
        </div>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            fullWidth
            size="lg"
            disabled={busy}
            onClick={onEnable}
            className="min-h-14 rounded-2xl"
          >
            <Icon name="my_location" />
            {copy.enableLabel}
          </Button>
          <Button
            type="button"
            fullWidth
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={onDismiss}
            className="min-h-14 rounded-2xl"
          >
            {copy.dismissLabel}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

export function LocationFallbackBanner({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-canvas-white/95 px-4 py-3 text-body-sm text-on-surface shadow-lg backdrop-blur"
    >
      <Icon name="info" className="mt-0.5 shrink-0 text-[20px] text-primary" />
      <div className="min-w-0 flex-1">
        <p className="leading-relaxed">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 min-h-11 text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="tap-target -mr-1 -mt-1 rounded-full p-2 text-on-surface-variant hover:bg-surface-container-low"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      ) : null}
    </div>
  )
}

export { LOCATION_COPY }
