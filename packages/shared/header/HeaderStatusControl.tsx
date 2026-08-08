import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getFriendlyErrorMessage,
  technicianApi,
  forceReconnectSocket,
  getApiBaseUrl,
  type SocketConnectionStatus,
} from '@fixnow/api'
import { usePush, useSocket } from '@fixnow/hooks'
import { BottomSheet, Icon } from '@fixnow/ui'
import { useNetworkStatus } from '../splash/useNetworkStatus'
import { useOptionalLocationPermission } from '../location/LocationPermissionHost'
import type { PortalRole } from './types'

type TechStatus = 'available' | 'busy' | 'offline' | 'on_job'

type ConnUi =
  | 'online'
  | 'connecting'
  | 'offline'
  | 'poor'
  | 'realtime_lost'
  | 'api_offline'
  | 'syncing'

const DOT: Record<SocketConnectionStatus, string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-400 animate-pulse',
  disconnected: 'bg-slate-400',
  error: 'bg-red-500',
  offline: 'bg-red-400',
}

const UI_DOT: Record<ConnUi, string> = {
  online: 'bg-emerald-500',
  connecting: 'bg-amber-400 animate-pulse',
  offline: 'bg-red-500',
  poor: 'bg-amber-500',
  realtime_lost: 'bg-orange-500',
  api_offline: 'bg-red-500',
  syncing: 'bg-sky-500 animate-pulse',
}

const UI_LABEL: Record<ConnUi, string> = {
  online: 'Online',
  connecting: 'Connecting',
  offline: 'Offline',
  poor: 'Weak connection',
  realtime_lost: 'Reconnecting',
  api_offline: 'Temporarily unavailable',
  syncing: 'Updating',
}

const TECH_STATUS_LABEL: Record<TechStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  offline: 'Offline',
  on_job: 'On a job',
}

function healthBaseUrl() {
  try {
    return getApiBaseUrl().replace(/\/api\/v1\/?$/, '')
  } catch {
    return ''
  }
}

function Row({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'bad' | 'neutral'
}) {
  const colour =
    tone === 'ok'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-600'
          : 'text-on-surface'
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className={`max-w-[60%] text-right text-sm font-semibold ${colour}`}>{value}</span>
    </div>
  )
}

function formatWorkingHoursSummary(hours: unknown[]): string {
  if (!hours.length) return 'Not set yet'
  const open = hours.filter((h) => h && typeof h === 'object' && !(h as { isClosed?: boolean }).isClosed)
  if (!open.length) return 'Closed all week'
  const first = open[0] as { openTime?: string; closeTime?: string }
  const start = String(first.openTime || '').slice(0, 5)
  const end = String(first.closeTime || '').slice(0, 5)
  if (start && end) return `${open.length} day${open.length === 1 ? '' : 's'} · ${start}–${end}`
  return `${open.length} day${open.length === 1 ? '' : 's'} scheduled`
}

/**
 * Live connection / availability control for operators and end users.
 * Customer & technician sheets stay user-facing — no Socket.IO / API / sync internals.
 */
export function HeaderStatusControl({
  role,
  availabilityStatus,
  className = '',
  onAvailabilityChange,
  density = 'full',
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  visibleFrom,
}: {
  role: PortalRole
  availabilityStatus?: TechStatus | null
  className?: string
  onAvailabilityChange?: (status: TechStatus) => void
  density?: 'full' | 'compact' | 'responsive'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  visibleFrom?: 'sm' | 'md' | 'lg'
}) {
  const { status } = useSocket()
  const network = useNetworkStatus()
  const locationPermission = useOptionalLocationPermission()
  const { permission: pushPermission, requestPermissionAndRegister, registering } = usePush()
  const navigate = useNavigate()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    onOpenChange?.(next)
    if (openProp === undefined) setUncontrolledOpen(next)
  }

  const triggerVisibility =
    visibleFrom === 'sm'
      ? 'max-sm:hidden'
      : visibleFrom === 'md'
        ? 'max-md:hidden'
        : visibleFrom === 'lg'
          ? 'max-lg:hidden'
          : ''

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [apiHealth, setApiHealth] = useState<'unknown' | 'ok' | 'down'>('unknown')
  const [pendingSync, setPendingSync] = useState(0)
  const [techStatus, setTechStatus] = useState<TechStatus>(availabilityStatus ?? 'offline')
  const [hoursSummary, setHoursSummary] = useState('Loading…')
  const userInteracted = useRef(false)
  const autoCloseTimer = useRef<number | null>(null)
  const wasDisconnected = useRef(status !== 'connected')

  const genuinelyOffline = network === 'offline' || status === 'offline'

  useEffect(() => {
    if (availabilityStatus) setTechStatus(availabilityStatus)
  }, [availabilityStatus])

  const probeApi = useCallback(async () => {
    const base = healthBaseUrl()
    if (!base) {
      setApiHealth('down')
      return
    }
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 6_000)
      const res = await fetch(`${base}/health`, {
        credentials: 'include',
        signal: controller.signal,
      })
      window.clearTimeout(timer)
      setApiHealth(res.ok ? 'ok' : 'down')
    } catch {
      setApiHealth('down')
    }
  }, [])

  // Background probes for chip colour only — never surfaced as labels to end users.
  useEffect(() => {
    if (!open) return
    void probeApi()
    const id = window.setInterval(() => void probeApi(), 12_000)
    return () => window.clearInterval(id)
  }, [open, probeApi])

  useEffect(() => {
    if (!open) return
    let unsub: (() => void) | undefined
    void import('@fixnow/native')
      .then((native) => {
        unsub = native.subscribeOfflineQueue((items) => setPendingSync(items.length))
        return native.listQueued().then((items) => setPendingSync(items.length))
      })
      .catch(() => setPendingSync(0))
    return () => unsub?.()
  }, [open])

  useEffect(() => {
    if (!open || role !== 'technician') return
    let cancelled = false
    void technicianApi
      .getProfile()
      .then((res) => {
        if (cancelled) return
        const hours = Array.isArray(res.data.workingHours) ? res.data.workingHours : []
        setHoursSummary(formatWorkingHoursSummary(hours))
      })
      .catch(() => {
        if (!cancelled) setHoursSummary('Tap below to manage')
      })
    return () => {
      cancelled = true
    }
  }, [open, role])

  const connUi: ConnUi =
    genuinelyOffline
      ? 'offline'
      : network === 'poor'
        ? 'poor'
        : pendingSync > 0
          ? 'syncing'
          : status === 'connecting'
            ? 'connecting'
            : apiHealth === 'down'
              ? 'api_offline'
              : status === 'error' || status === 'disconnected'
                ? 'realtime_lost'
                : status === 'connected'
                  ? 'online'
                  : 'connecting'

  useEffect(() => {
    if (status !== 'connected') {
      wasDisconnected.current = true
      return
    }
    if (!open || !wasDisconnected.current) return
    wasDisconnected.current = false
    setMessage('You are back online.')
    if (userInteracted.current) return
    if (autoCloseTimer.current) window.clearTimeout(autoCloseTimer.current)
    autoCloseTimer.current = window.setTimeout(() => {
      setOpen(false)
      setMessage(null)
    }, 2_000)
    return () => {
      if (autoCloseTimer.current) window.clearTimeout(autoCloseTimer.current)
    }
  }, [status, open])

  const fullChipLabel =
    role === 'technician'
      ? TECH_STATUS_LABEL[techStatus]
      : role === 'admin'
        ? status === 'connected'
          ? 'Live'
          : UI_LABEL[connUi]
        : UI_LABEL[connUi]

  const compactChipLabel =
    role === 'technician'
      ? TECH_STATUS_LABEL[techStatus]
      : connUi === 'online'
        ? 'Live'
        : connUi === 'connecting' || connUi === 'syncing'
          ? '…'
          : 'Offline'

  const chipLabel =
    density === 'compact' || density === 'responsive' ? compactChipLabel : fullChipLabel
  const ariaChipLabel = density === 'responsive' ? fullChipLabel : chipLabel

  const notificationsEnabled = pushPermission === 'granted'
  const notificationsLabel = notificationsEnabled
    ? 'Enabled'
    : pushPermission === 'denied'
      ? 'Off'
      : 'Not enabled'

  const locationLabel =
    locationPermission?.status === 'granted'
      ? 'On'
      : locationPermission?.status === 'permanently_denied' || locationPermission?.status === 'denied'
        ? 'Off'
        : locationPermission?.status === 'unsupported'
          ? 'Unavailable'
          : 'Not set'

  const locationTone =
    locationPermission?.status === 'granted'
      ? 'ok'
      : locationPermission?.status === 'permanently_denied' || locationPermission?.status === 'denied'
        ? 'warn'
        : 'neutral'

  const setTechnicianStatus = async (next: TechStatus) => {
    if (busy) return
    userInteracted.current = true
    setBusy(true)
    setMessage(null)
    try {
      await technicianApi.updateAvailability({ status: next })
      setTechStatus(next)
      onAvailabilityChange?.(next)
      setMessage(
        next === 'available'
          ? 'You are available for nearby jobs.'
          : next === 'busy'
            ? 'You are marked busy — fewer new matches for now.'
            : next === 'on_job'
              ? 'Status set to on a job.'
              : 'Job matching paused. You will not receive new jobs.',
      )
    } catch (err) {
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const retryConnection = () => {
    userInteracted.current = true
    if (genuinelyOffline) {
      setMessage('Still offline. Check Wi‑Fi or mobile data, then try again.')
      return
    }
    forceReconnectSocket()
    setMessage('Trying to restore your connection…')
    void probeApi()
  }

  const chipDot =
    role === 'technician'
      ? techStatus === 'available'
        ? 'bg-emerald-500'
        : techStatus === 'busy' || techStatus === 'on_job'
          ? 'bg-amber-400'
          : 'bg-slate-400'
      : UI_DOT[connUi] || DOT[status]

  const sheetTitle =
    role === 'technician' ? 'Availability' : role === 'admin' ? 'Connection' : 'Your connection'
  const sheetDescription =
    role === 'technician'
      ? 'Control how customers find you and whether you receive new jobs.'
      : role === 'admin'
        ? 'Quick look at your live connection. Detailed health lives under Platform health.'
        : 'Location, notifications, and connection status.'

  const showRetry = genuinelyOffline || connUi === 'realtime_lost' || connUi === 'api_offline'

  return (
    <>
      {hideTrigger ? null : (
        <button
          type="button"
          title={fullChipLabel}
          onClick={() => {
            setMessage(null)
            userInteracted.current = false
            setOpen(true)
          }}
          aria-label={`${ariaChipLabel} status. Open details.`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`tap-target touch-manip inline-flex min-h-11 max-w-[7.5rem] items-center gap-1.5 rounded-full border border-border-subtle bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant shadow-sm backdrop-blur transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 sm:max-w-[9rem] ${
            density === 'compact' ? 'px-2' : density === 'responsive' ? 'lg:max-w-none' : ''
          } ${triggerVisibility} ${className}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${chipDot}`} aria-hidden />
          {density === 'responsive' ? (
            <>
              <span className="truncate lg:hidden">{compactChipLabel}</span>
              <span className="hidden truncate lg:inline">{fullChipLabel}</span>
            </>
          ) : (
            <span className="truncate">{chipLabel}</span>
          )}
        </button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title={sheetTitle} description={sheetDescription}>
        <div
          className="space-y-4 pb-6"
          onPointerDown={() => {
            userInteracted.current = true
          }}
        >
          {genuinelyOffline ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              You appear to be offline. Some actions may wait until your connection returns.
            </p>
          ) : connUi === 'poor' ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              Your connection looks weak. Updates may take a moment.
            </p>
          ) : null}

          <div className="rounded-2xl border border-border-subtle bg-surface-container-low px-4 py-2 text-sm">
            {role === 'technician' ? (
              <>
                <Row
                  label="Current availability"
                  value={TECH_STATUS_LABEL[techStatus]}
                  tone={techStatus === 'available' ? 'ok' : techStatus === 'offline' ? 'warn' : 'neutral'}
                />
                <Row label="Location sharing" value={locationLabel} tone={locationTone} />
                <Row label="Working hours" value={hoursSummary} tone="neutral" />
                <Row
                  label="Notifications"
                  value={notificationsLabel}
                  tone={notificationsEnabled ? 'ok' : 'warn'}
                />
              </>
            ) : role === 'customer' ? (
              <>
                <Row
                  label="Connection"
                  value={genuinelyOffline ? 'Offline' : connUi === 'online' ? 'Connected' : UI_LABEL[connUi]}
                  tone={genuinelyOffline ? 'bad' : connUi === 'online' ? 'ok' : 'warn'}
                />
                <Row label="Location sharing" value={locationLabel} tone={locationTone} />
                <Row
                  label="Notifications"
                  value={notificationsLabel}
                  tone={notificationsEnabled ? 'ok' : 'warn'}
                />
              </>
            ) : (
              <>
                <Row
                  label="Connection"
                  value={genuinelyOffline ? 'Offline' : connUi === 'online' ? 'Connected' : 'Needs attention'}
                  tone={genuinelyOffline ? 'bad' : connUi === 'online' ? 'ok' : 'warn'}
                />
                <Row
                  label="Notifications"
                  value={notificationsLabel}
                  tone={notificationsEnabled ? 'ok' : 'warn'}
                />
              </>
            )}
          </div>

          {role === 'technician' ? (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Job matching</p>
              {(
                [
                  ['available', 'Receive nearby jobs'],
                  ['busy', 'Mark busy'],
                  ['offline', 'Pause receiving jobs'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy || techStatus === value}
                  onClick={() => void setTechnicianStatus(value)}
                  className={`tap-target flex min-h-12 w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    techStatus === value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border-subtle text-on-surface hover:bg-surface-container-low'
                  } disabled:opacity-60`}
                >
                  {label}
                  {techStatus === value ? <Icon name="check_circle" className="text-primary" /> : null}
                </button>
              ))}
              <Link
                to="/technician/availability"
                onClick={() => setOpen(false)}
                className="tap-target mt-1 flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-primary"
              >
                <Icon name="schedule" />
                Working hours & schedule
              </Link>
            </div>
          ) : null}

          {role === 'admin' ? (
            <Link
              to="/admin/settings/realtime"
              onClick={() => setOpen(false)}
              className="tap-target flex min-h-12 w-full items-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold text-on-surface"
            >
              <Icon name="monitor_heart" />
              Open platform health
            </Link>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {showRetry ? (
              <button
                type="button"
                onClick={retryConnection}
                className="tap-target min-h-12 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Retry connection
              </button>
            ) : null}
            {!notificationsEnabled ? (
              <button
                type="button"
                disabled={registering}
                onClick={() => {
                  userInteracted.current = true
                  void requestPermissionAndRegister()
                    .then(() => setMessage('Notifications updated.'))
                    .catch(() => setMessage('Could not update notifications. Check your device settings.'))
                }}
                className="tap-target min-h-12 rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-on-surface"
              >
                {registering ? 'Updating…' : 'Enable notifications'}
              </button>
            ) : null}
            {locationPermission && locationPermission.status !== 'granted' ? (
              <button
                type="button"
                onClick={() => {
                  userInteracted.current = true
                  locationPermission.openLocationHelp()
                }}
                className="tap-target min-h-12 rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-on-surface"
              >
                Turn on location
              </button>
            ) : null}
            {role === 'customer' ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate('/customer/home')
                }}
                className="tap-target min-h-12 rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-on-surface"
              >
                Back to home
              </button>
            ) : null}
          </div>

          {message ? (
            <p className="rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </BottomSheet>
    </>
  )
}
