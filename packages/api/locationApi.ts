import { apiGet, apiPost, apiPut } from './client'

export type LocationProviderId = 'google' | 'nominatim' | 'haversine'

export type LocationPlatformSettings = {
  enabled: boolean
  primaryProvider: LocationProviderId
  fallbackOrder: LocationProviderId[]
  retryAttempts: number
  timeoutMs: number
  healthCheckIntervalMs: number
  failureThreshold: number
  recoveryProbeMs: number
  googleEnabled: boolean
  nominatimEnabled: boolean
  haversineEnabled: boolean
  nominatimBaseUrl: string
  preferGoogleEta: boolean
  haversineRoadFactor: number
  haversineSpeedKmh: number
}

export type LocationDashboard = {
  activeProvider: LocationProviderId
  google: Record<string, unknown>
  nominatim: Record<string, unknown>
  haversine: Record<string, unknown>
  capabilities: Record<string, { provider: string; status: string }>
  consecutiveGoogleFailures: number
  failoverActive: boolean
  lastFailoverAt?: string
  lastRecoveryAt?: string
  healthScore: number
  averageLatencyMs?: number
  settings: LocationPlatformSettings
}

export const locationApi = {
  dashboard() {
    return apiGet<LocationDashboard>('/admin/location')
  },
  getSettings() {
    return apiGet<{ settings: LocationPlatformSettings; defaults: LocationPlatformSettings }>(
      '/admin/location/settings',
    )
  },
  updateSettings(body: Partial<LocationPlatformSettings>) {
    return apiPut<{ settings: LocationPlatformSettings }>('/admin/location/settings', body)
  },
  healthCheck() {
    return apiPost<LocationDashboard>('/admin/location/health-check', {})
  },
  failoverLog() {
    return apiGet<{ entries: Array<Record<string, unknown>> }>('/admin/location/failover-log')
  },
  reverseGeocode(lat: number, lng: number) {
    return apiGet<Record<string, unknown>>('/location/reverse-geocode', { lat, lng })
  },
  geocode(q: string, bias?: { lat?: number; lng?: number }) {
    return apiGet<{ items: unknown[] }>('/location/geocode', { q, ...bias })
  },
  autocomplete(q: string, bias?: { lat?: number; lng?: number }) {
    return apiGet<{ items: unknown[] }>('/location/autocomplete', { q, ...bias })
  },
  distanceEta(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    return apiGet<Record<string, unknown>>('/location/distance-eta', {
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
    })
  },
}
