/**
 * Location provider adapters — Google (primary), Nominatim (fallback 1), Haversine (last resort).
 */

import { env } from '../../config/env.js';
import {
  estimateEtaSeconds,
  formatEta,
  haversineMeters,
} from '../tracking/geo.util.js';
import type { LocationPlatformSettings } from './locationSettings.service.js';

export type GeoPoint = { lat: number; lng: number };

export type ReverseGeocodeResult = {
  label: string;
  district?: string;
  city?: string;
  parish?: string;
  village?: string;
  countryCode?: string;
  formattedAddress?: string;
  placeId?: string;
  provider: 'google' | 'nominatim' | 'haversine';
};

export type ForwardGeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  placeId?: string;
  provider: 'google' | 'nominatim' | 'haversine';
};

export type DistanceEtaResult = {
  distanceMeters: number;
  durationSeconds: number;
  etaLabel: string;
  roadDistance: boolean;
  trafficAware: boolean;
  provider: 'google' | 'nominatim' | 'haversine';
  polyline?: Array<{ lat: number; lng: number }>;
};

export type PlaceSuggestion = {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
  provider: 'google' | 'nominatim';
};

function googleServerKey(): string {
  const dedicated = env.GOOGLE_MAPS_SERVER_API_KEY || env.GOOGLE_MAPS_API_KEY;
  if (dedicated && String(dedicated).trim()) return String(dedicated).trim();
  // Prefer dedicated server key; fall back to shared browser key only if explicitly set in process env
  const vite = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  return String(vite).trim();
}

export function isGoogleConfigured(): boolean {
  return Boolean(googleServerKey());
}

async function fetchJson(
  url: string,
  opts: { timeoutMs: number; headers?: Record<string, string>; method?: string; body?: string },
): Promise<{ ok: boolean; status: number; json: unknown; latencyMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// ——— Google ———

export async function googleReverseGeocode(
  point: GeoPoint,
  timeoutMs: number,
): Promise<ReverseGeocodeResult> {
  const key = googleServerKey();
  if (!key) throw new Error('GOOGLE_MAPS_KEY_MISSING');
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${encodeURIComponent(`${point.lat},${point.lng}`)}` +
    `&key=${encodeURIComponent(key)}`;
  const res = await fetchJson(url, { timeoutMs });
  const body = res.json as {
    status?: string;
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
    }>;
  } | null;
  if (!res.ok || !body || (body.status !== 'OK' && body.status !== 'ZERO_RESULTS')) {
    throw new Error(body?.error_message || body?.status || `GOOGLE_GEOCODE_HTTP_${res.status}`);
  }
  const first = body.results?.[0];
  if (!first) {
    return {
      label: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
      provider: 'google',
    };
  }
  const comps = first.address_components || [];
  const find = (...types: string[]) =>
    comps.find((c) => (c.types || []).some((t) => types.includes(t)))?.long_name;
  const district = find('administrative_area_level_2', 'locality') || find('administrative_area_level_1');
  const city = find('locality', 'postal_town') || undefined;
  const parish = find('sublocality', 'sublocality_level_1', 'neighborhood') || undefined;
  return {
    label: first.formatted_address || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
    formattedAddress: first.formatted_address,
    placeId: first.place_id,
    district: district || undefined,
    city,
    parish,
    countryCode: comps.find((c) => (c.types || []).includes('country'))?.short_name,
    provider: 'google',
  };
}

export async function googleForwardGeocode(
  query: string,
  timeoutMs: number,
  bias?: GeoPoint,
): Promise<ForwardGeocodeResult[]> {
  const key = googleServerKey();
  if (!key) throw new Error('GOOGLE_MAPS_KEY_MISSING');
  let url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}` +
    `&key=${encodeURIComponent(key)}` +
    `&region=ug`;
  if (bias) {
    url += `&bounds=${bias.lat - 0.5},${bias.lng - 0.5}|${bias.lat + 0.5},${bias.lng + 0.5}`;
  }
  const res = await fetchJson(url, { timeoutMs });
  const body = res.json as {
    status?: string;
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  } | null;
  if (!res.ok || !body || (body.status !== 'OK' && body.status !== 'ZERO_RESULTS')) {
    throw new Error(body?.error_message || body?.status || `GOOGLE_GEOCODE_HTTP_${res.status}`);
  }
  return (body.results || [])
    .map((r) => {
      const lat = Number(r.geometry?.location?.lat);
      const lng = Number(r.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        label: r.formatted_address || query,
        placeId: r.place_id,
        provider: 'google' as const,
      };
    })
    .filter(Boolean) as ForwardGeocodeResult[];
}

export async function googleDistanceMatrix(
  origin: GeoPoint,
  destination: GeoPoint,
  timeoutMs: number,
): Promise<DistanceEtaResult> {
  const key = googleServerKey();
  if (!key) throw new Error('GOOGLE_MAPS_KEY_MISSING');
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(`${origin.lat},${origin.lng}`)}` +
    `&destinations=${encodeURIComponent(`${destination.lat},${destination.lng}`)}` +
    `&mode=driving&departure_time=now&traffic_model=best_guess` +
    `&key=${encodeURIComponent(key)}`;
  const res = await fetchJson(url, { timeoutMs });
  const body = res.json as {
    status?: string;
    error_message?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value?: number };
        duration?: { value?: number };
        duration_in_traffic?: { value?: number };
      }>;
    }>;
  } | null;
  if (!res.ok || !body || body.status !== 'OK') {
    throw new Error(body?.error_message || body?.status || `GOOGLE_DM_HTTP_${res.status}`);
  }
  const el = body.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') {
    throw new Error(el?.status || 'GOOGLE_DM_NO_ROUTE');
  }
  const distanceMeters = Number(el.distance?.value || 0);
  const durationSeconds = Number(el.duration_in_traffic?.value || el.duration?.value || 0);
  return {
    distanceMeters,
    durationSeconds,
    etaLabel: formatEta(durationSeconds),
    roadDistance: true,
    trafficAware: Boolean(el.duration_in_traffic?.value),
    provider: 'google',
  };
}

export async function googleDirections(
  origin: GeoPoint,
  destination: GeoPoint,
  timeoutMs: number,
): Promise<DistanceEtaResult> {
  const key = googleServerKey();
  if (!key) throw new Error('GOOGLE_MAPS_KEY_MISSING');
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}` +
    `&destination=${encodeURIComponent(`${destination.lat},${destination.lng}`)}` +
    `&mode=driving&departure_time=now` +
    `&key=${encodeURIComponent(key)}`;
  const res = await fetchJson(url, { timeoutMs });
  const body = res.json as {
    status?: string;
    error_message?: string;
    routes?: Array<{
      overview_polyline?: { points?: string };
      legs?: Array<{
        distance?: { value?: number };
        duration?: { value?: number };
        duration_in_traffic?: { value?: number };
      }>;
    }>;
  } | null;
  if (!res.ok || !body || body.status !== 'OK') {
    throw new Error(body?.error_message || body?.status || `GOOGLE_DIR_HTTP_${res.status}`);
  }
  const route = body.routes?.[0];
  const leg = route?.legs?.[0];
  if (!leg) throw new Error('GOOGLE_DIR_NO_ROUTE');
  const distanceMeters = Number(leg.distance?.value || 0);
  const durationSeconds = Number(leg.duration_in_traffic?.value || leg.duration?.value || 0);
  return {
    distanceMeters,
    durationSeconds,
    etaLabel: formatEta(durationSeconds),
    roadDistance: true,
    trafficAware: Boolean(leg.duration_in_traffic?.value),
    provider: 'google',
    polyline: decodeGooglePolyline(route?.overview_polyline?.points || ''),
  };
}

export async function googleAutocomplete(
  input: string,
  timeoutMs: number,
  bias?: GeoPoint,
): Promise<PlaceSuggestion[]> {
  const key = googleServerKey();
  if (!key) throw new Error('GOOGLE_MAPS_KEY_MISSING');
  let url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
    `?input=${encodeURIComponent(input)}` +
    `&key=${encodeURIComponent(key)}` +
    `&components=country:ug`;
  if (bias) {
    url += `&location=${bias.lat},${bias.lng}&radius=50000`;
  }
  const res = await fetchJson(url, { timeoutMs });
  const body = res.json as {
    status?: string;
    error_message?: string;
    predictions?: Array<{
      place_id?: string;
      description?: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
    }>;
  } | null;
  if (!res.ok || !body || (body.status !== 'OK' && body.status !== 'ZERO_RESULTS')) {
    throw new Error(body?.error_message || body?.status || `GOOGLE_PLACES_HTTP_${res.status}`);
  }
  return (body.predictions || [])
    .filter((p) => p.place_id && p.description)
    .map((p) => ({
      placeId: String(p.place_id),
      description: String(p.description),
      mainText: p.structured_formatting?.main_text,
      secondaryText: p.structured_formatting?.secondary_text,
      provider: 'google' as const,
    }));
}

export async function googleHealthProbe(timeoutMs: number): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  if (!isGoogleConfigured()) {
    return { ok: false, latencyMs: 0, message: 'Google Maps server/API key missing' };
  }
  // Lightweight Geocoding probe (Kampala)
  const started = Date.now();
  try {
    await googleReverseGeocode({ lat: 0.3476, lng: 32.5825 }, timeoutMs);
    return { ok: true, latencyMs: Date.now() - started, message: 'Google Geocoding healthy' };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: err instanceof Error ? err.message : 'Google probe failed',
    };
  }
}

/** Decode Google encoded polyline into lat/lng points. */
function decodeGooglePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  if (!encoded) return [];
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// ——— Nominatim ———

export async function nominatimReverseGeocode(
  point: GeoPoint,
  settings: LocationPlatformSettings,
): Promise<ReverseGeocodeResult> {
  const url =
    `${settings.nominatimBaseUrl}/reverse` +
    `?lat=${encodeURIComponent(String(point.lat))}` +
    `&lon=${encodeURIComponent(String(point.lng))}` +
    `&format=json&addressdetails=1`;
  const res = await fetchJson(url, {
    timeoutMs: settings.timeoutMs,
    headers: { 'User-Agent': 'FixNow-LocationPlatform/1.0 (contact: support@fixnow.app)' },
  });
  if (!res.ok) throw new Error(`NOMINATIM_HTTP_${res.status}`);
  const body = res.json as {
    display_name?: string;
    address?: Record<string, string>;
  } | null;
  if (!body?.display_name && !body?.address) throw new Error('NOMINATIM_EMPTY');
  const addr = body.address || {};
  return {
    label: body.display_name || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
    formattedAddress: body.display_name,
    district: addr.county || addr.state_district || addr.city || addr.town || undefined,
    city: addr.city || addr.town || addr.village || undefined,
    parish: addr.suburb || addr.neighbourhood || addr.city_district || undefined,
    village: addr.village || addr.hamlet || undefined,
    countryCode: addr.country_code?.toUpperCase(),
    provider: 'nominatim',
  };
}

export async function nominatimForwardGeocode(
  query: string,
  settings: LocationPlatformSettings,
): Promise<ForwardGeocodeResult[]> {
  const url =
    `${settings.nominatimBaseUrl}/search` +
    `?q=${encodeURIComponent(query)}` +
    `&format=json&addressdetails=0&limit=5&countrycodes=ug`;
  const res = await fetchJson(url, {
    timeoutMs: settings.timeoutMs,
    headers: { 'User-Agent': 'FixNow-LocationPlatform/1.0 (contact: support@fixnow.app)' },
  });
  if (!res.ok) throw new Error(`NOMINATIM_HTTP_${res.status}`);
  const body = res.json as Array<{ lat?: string; lon?: string; display_name?: string; place_id?: number }> | null;
  if (!Array.isArray(body)) throw new Error('NOMINATIM_EMPTY');
  return body
    .map((r) => {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        label: r.display_name || query,
        placeId: r.place_id != null ? String(r.place_id) : undefined,
        provider: 'nominatim' as const,
      };
    })
    .filter(Boolean) as ForwardGeocodeResult[];
}

export async function nominatimHealthProbe(
  settings: LocationPlatformSettings,
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const started = Date.now();
  try {
    await nominatimReverseGeocode({ lat: 0.3476, lng: 32.5825 }, settings);
    return { ok: true, latencyMs: Date.now() - started, message: 'Nominatim healthy' };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: err instanceof Error ? err.message : 'Nominatim probe failed',
    };
  }
}

// ——— Haversine (last resort — never for routing / billing) ———

export function haversineDistanceEta(
  origin: GeoPoint,
  destination: GeoPoint,
  settings: LocationPlatformSettings,
): DistanceEtaResult {
  const straight = haversineMeters(origin, destination);
  const roadApprox = straight * settings.haversineRoadFactor;
  const speedMps = (settings.haversineSpeedKmh * 1000) / 3600;
  const durationSeconds = estimateEtaSeconds(roadApprox, speedMps);
  return {
    distanceMeters: Math.round(roadApprox),
    durationSeconds,
    etaLabel: formatEta(durationSeconds),
    roadDistance: false,
    trafficAware: false,
    provider: 'haversine',
  };
}

export function haversineStraightMeters(origin: GeoPoint, destination: GeoPoint): number {
  return haversineMeters(origin, destination);
}
