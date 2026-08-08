/** Haversine helpers for FixNow live tracking (no external Maps dependency required). */

const EARTH_RADIUS_M = 6_371_000;

export function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough road ETA assuming ~25 km/h urban average in Uganda. */
export function estimateEtaSeconds(distanceMeters: number, speedMps?: number | null): number {
  const speed = speedMps && speedMps > 0.5 ? speedMps : 25_000 / 3600;
  return Math.max(30, Math.round(distanceMeters / speed));
}

export function formatDistance(meters?: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function formatEta(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function geoFromLngLat(lng: number, lat: number, accuracyMeters?: number) {
  return {
    type: 'Point' as const,
    coordinates: [lng, lat] as [number, number],
    accuracyMeters,
  };
}

export function lngLatFromGeo(geo?: { coordinates?: number[] } | null): { lat: number; lng: number } | null {
  if (!geo?.coordinates || geo.coordinates.length < 2) return null;
  const lng = Number(geo.coordinates[0]);
  const lat = Number(geo.coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Simple straight-line “route” for map polyline when Directions API is unavailable. */
export function straightPolyline(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  steps = 12,
): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
  }
  return points;
}
