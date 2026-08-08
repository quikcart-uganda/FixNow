import { useEffect, useState } from 'react'
import { Icon } from '@fixnow/ui'
import {
  formatTrackingDistance,
  formatTrackingEta,
  getFriendlyErrorMessage,
  trackingApi,
  type TrackingSession,
} from '@fixnow/api'
import { useRealtimeReload, SOCKET_EVENTS } from '@fixnow/hooks'
import { dialPhone, openNavigation } from '@fixnow/native'
import { TrackingMap } from './TrackingMap'

type LiveTrackingPanelProps = {
  jobId: string
  role: 'customer' | 'technician'
  jobLabel?: string
  destinationLabel?: string
  destination?: { lat?: number | null; lng?: number | null } | null
  customerPhone?: string
  onChat?: () => void
  showPublisherControls?: boolean
  publishing?: boolean
  publisherError?: string | null
  onPause?: () => void
  onResume?: () => void
  onArrived?: () => void
  onNavigate?: () => void
  externalSession?: TrackingSession | null
}

export function LiveTrackingPanel({
  jobId,
  role,
  jobLabel,
  destinationLabel,
  destination,
  customerPhone,
  onChat,
  showPublisherControls,
  publishing,
  publisherError,
  onPause,
  onResume,
  onArrived,
  onNavigate,
  externalSession,
}: LiveTrackingPanelProps) {
  const [session, setSession] = useState<TrackingSession | null>(externalSession ?? null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      const res = await trackingApi.get(jobId)
      setSession(res.data.session)
      setError(null)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    }
  }

  useEffect(() => {
    if (externalSession) setSession(externalSession)
  }, [externalSession])

  useEffect(() => {
    void reload()
  }, [jobId])

  useRealtimeReload(
    () => void reload(),
    [
      SOCKET_EVENTS.TRACKING_STARTED,
      SOCKET_EVENTS.TRACKING_UPDATE,
      SOCKET_EVENTS.TRACKING_PAUSED,
      SOCKET_EVENTS.TRACKING_RESUMED,
      SOCKET_EVENTS.TRACKING_ARRIVED,
      SOCKET_EVENTS.TRACKING_STOPPED,
      SOCKET_EVENTS.TRACKING_COMPLETED,
      SOCKET_EVENTS.JOB_STATUS_CHANGED,
    ],
    { joinJobId: jobId, enabled: !!jobId },
  )

  const tech = session?.technicianLocation
  const dest =
    session?.destination?.lat != null && session?.destination?.lng != null
      ? { lat: Number(session.destination.lat), lng: Number(session.destination.lng), label: session.destination.label }
      : destination?.lat != null && destination?.lng != null
        ? { lat: Number(destination.lat), lng: Number(destination.lng), label: destinationLabel }
        : destinationLabel
          ? { lat: null as unknown as number, lng: null as unknown as number, label: destinationLabel }
          : null

  const active = session && ['active', 'paused', 'arrived'].includes(session.status)

  return (
    <div className="space-y-4 rounded-2xl border border-border-subtle bg-canvas-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-title-md">Live tracking</h3>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {active
              ? `Status: ${session?.status}${session?.lastPingAt ? ` · Updated ${new Date(session.lastPingAt).toLocaleTimeString()}` : ''}`
              : 'Live GPS starts when the technician is en route.'}
          </p>
        </div>
        <button type="button" onClick={() => void reload()} className="rounded-full p-2 hover:bg-surface-container-low">
          <Icon name="refresh" />
        </button>
      </div>

      <TrackingMap
        technician={tech ? { ...tech, label: 'Technician' } : null}
        customer={
          dest && typeof dest.lat === 'number' && typeof dest.lng === 'number'
            ? { lat: dest.lat, lng: dest.lng, label: dest.label || jobLabel || 'Job' }
            : null
        }
        route={session?.routePolyline || []}
      />

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-surface-container-low p-3">
          <p className="text-xs uppercase text-on-surface-variant">ETA</p>
          <p className="text-lg font-semibold">{formatTrackingEta(session?.etaSeconds)}</p>
        </div>
        <div className="rounded-xl bg-surface-container-low p-3">
          <p className="text-xs uppercase text-on-surface-variant">Distance</p>
          <p className="text-lg font-semibold">{formatTrackingDistance(session?.distanceMeters)}</p>
        </div>
      </div>

      {error || publisherError ? (
        <p className="text-sm text-error">{error || publisherError}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {role === 'customer' && onChat ? (
          <button
            type="button"
            onClick={onChat}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            <Icon name="chat" className="text-[18px]" /> Chat
          </button>
        ) : null}
        {role === 'technician' ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate()
                else if (dest && typeof dest.lat === 'number' && typeof dest.lng === 'number') {
                  openNavigation({ latitude: dest.lat, longitude: dest.lng, label: dest.label })
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              <Icon name="navigation" className="text-[18px]" /> Navigate
            </button>
            {customerPhone ? (
              <button
                type="button"
                onClick={() => dialPhone(customerPhone)}
                className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-4 py-2 text-sm font-semibold"
              >
                <Icon name="call" className="text-[18px]" /> Call
              </button>
            ) : null}
            {showPublisherControls ? (
              <>
                {session?.status === 'active' ? (
                  <button type="button" onClick={onPause} className="rounded-full border border-border-subtle px-4 py-2 text-sm font-semibold">
                    Pause
                  </button>
                ) : null}
                {session?.status === 'paused' ? (
                  <button type="button" onClick={onResume} className="rounded-full border border-border-subtle px-4 py-2 text-sm font-semibold">
                    Resume
                  </button>
                ) : null}
                <button type="button" onClick={onArrived} className="rounded-full border border-border-subtle px-4 py-2 text-sm font-semibold">
                  Arrived
                </button>
                <span className="self-center text-xs text-on-surface-variant">
                  {publishing ? 'Sharing GPS…' : 'GPS idle'}
                </span>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
