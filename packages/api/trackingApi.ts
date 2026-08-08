import { apiGet, apiPost } from './client'

export type TrackingSession = {
  id: string
  jobId: string
  /** Human-friendly job reference when available (e.g. PST-KLA-260726-0935-001). */
  publicJobReference?: string
  jobTitle?: string
  technicianId: string
  customerId: string
  status: 'active' | 'paused' | 'arrived' | 'ended' | 'cancelled' | string
  startedAt?: string
  pausedAt?: string | null
  resumedAt?: string | null
  arrivedAt?: string | null
  endedAt?: string | null
  lastPingAt?: string
  technicianLocation?: { lat: number; lng: number } | null
  destination?: { lat: number | null; lng: number | null; label?: string } | null
  heading?: number
  speedMps?: number
  accuracyMeters?: number
  etaSeconds?: number | null
  distanceMeters?: number | null
  routePolyline?: Array<{ lat: number; lng: number }>
  updateCount?: number
  endReason?: string
  history?: Array<{
    at: string
    lat?: number
    lng?: number
    heading?: number
    speedMps?: number
    accuracyMeters?: number
  }>
}

export type TrackingPingInput = {
  latitude: number
  longitude: number
  accuracyMeters?: number
  heading?: number
  speedMps?: number
  recordedAt?: string
}

export const trackingApi = {
  get(jobId: string, params?: { history?: boolean }) {
    return apiGet<{ session: TrackingSession | null }>(
      `/jobs/${jobId}/tracking`,
      params?.history ? { history: 'true' } : undefined,
    )
  },

  start(jobId: string) {
    return apiPost<{ session: TrackingSession; resumed?: boolean }>(`/jobs/${jobId}/tracking/start`, {})
  },

  pause(jobId: string) {
    return apiPost<{ session: TrackingSession }>(`/jobs/${jobId}/tracking/pause`, {})
  },

  resume(jobId: string) {
    return apiPost<{ session: TrackingSession }>(`/jobs/${jobId}/tracking/resume`, {})
  },

  ping(jobId: string, body: TrackingPingInput) {
    return apiPost<{
      session: TrackingSession
      throttled?: boolean
      nearby?: boolean
      arrived?: boolean
    }>(`/jobs/${jobId}/tracking/location`, body)
  },

  arrived(jobId: string) {
    return apiPost<{ session: TrackingSession }>(`/jobs/${jobId}/tracking/arrived`, {})
  },

  stop(jobId: string, reason?: string) {
    return apiPost<{ session: TrackingSession | null }>(`/jobs/${jobId}/tracking/stop`, { reason })
  },

  listAdmin(params?: Record<string, unknown>) {
    return apiGet<{
      items: TrackingSession[]
      analytics: {
        activeSessions: number
        travelling: number
        paused: number
        arrived: number
        averageEtaSeconds: number | null
      }
    }>('/admin/tracking', params)
  },

  purge() {
    return apiPost<{ deleted: number }>('/admin/tracking/purge', {})
  },
}

export function formatTrackingDistance(meters?: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
}

export function formatTrackingEta(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const mins = Math.max(1, Math.round(seconds / 60))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
