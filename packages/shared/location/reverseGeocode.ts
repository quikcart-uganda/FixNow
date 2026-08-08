/**
 * Reverse-geocode GPS coordinates into a Uganda-friendly address label.
 * Uses the FixNow Unified Location Platform (Google → Nominatim → coordinate label).
 * Falls back to a direct Nominatim call only if the API is unreachable.
 */

import { locationApi } from '@fixnow/api'

export type ReverseGeocodeResult = {
  district?: string
  city?: string
  parish?: string
  village?: string
  landmark?: string
  label: string
  countryCode?: string
  provider?: string
}

export async function reverseGeocodeCoords(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (signal?.aborted) return null

  // Primary path: unified Location Platform (Google-first on the backend)
  try {
    const res = await locationApi.reverseGeocode(latitude, longitude)
    const data = res.data as ReverseGeocodeResult | undefined
    if (data?.label) {
      return {
        district: data.district,
        city: data.city,
        parish: data.parish,
        village: data.village,
        landmark: data.landmark,
        label: data.label,
        countryCode: data.countryCode,
        provider: data.provider,
      }
    }
  } catch {
    if (signal?.aborted) return null
  }

  // Emergency client fallback if API is down — Nominatim only
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${encodeURIComponent(String(latitude))}` +
      `&lon=${encodeURIComponent(String(longitude))}` +
      `&format=json&addressdetails=1`
    const res = await fetch(url, {
      signal,
      credentials: 'omit',
      headers: { 'User-Agent': 'FixNow-App/1.0' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      display_name?: string
      address?: Record<string, string>
    }
    const addr = body.address || {}
    const district = addr.county || addr.state_district || addr.city || addr.town
    const parish = addr.suburb || addr.neighbourhood || addr.city_district
    const label =
      body.display_name ||
      [parish, district].filter(Boolean).join(', ') ||
      `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    return {
      district: district || undefined,
      city: addr.city || addr.town || undefined,
      parish: parish || undefined,
      village: addr.village || undefined,
      label,
      countryCode: addr.country_code?.toUpperCase(),
      provider: 'nominatim',
    }
  } catch {
    return null
  }
}

/** Haversine distance in kilometres — proximity approximation only, never routing. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function formatDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}
