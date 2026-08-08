/**
 * FixNow Location Platform — Admin-configurable provider hierarchy.
 * Google Maps Platform is always primary. Nominatim and Haversine are emergency-only.
 */

import { PlatformSetting } from '../../models/index.js';
import { writeAuditLog } from '../../utils/audit.js';

export const LOCATION_SETTINGS_KEY = 'location.platform';
export const LOCATION_HEALTH_KEY = 'location.health';
export const LOCATION_FAILOVER_LOG_KEY = 'location.failover_log';

export type LocationProviderId = 'google' | 'nominatim' | 'haversine';

export type LocationCapability =
  | 'geocoding'
  | 'reverse_geocoding'
  | 'places'
  | 'autocomplete'
  | 'directions'
  | 'distance_matrix'
  | 'eta'
  | 'nearby_search'
  | 'maps_tiles';

export type LocationPlatformSettings = {
  enabled: boolean;
  /** Always google unless Super Admin temporarily forces another primary (not recommended). */
  primaryProvider: LocationProviderId;
  fallbackOrder: LocationProviderId[];
  retryAttempts: number;
  timeoutMs: number;
  healthCheckIntervalMs: number;
  /** Consecutive Google failures before failover. */
  failureThreshold: number;
  /** After this many ms on fallback, probe Google for automatic recovery. */
  recoveryProbeMs: number;
  googleEnabled: boolean;
  nominatimEnabled: boolean;
  haversineEnabled: boolean;
  nominatimBaseUrl: string;
  /** Prefer Google Distance Matrix / Directions for ETA when healthy. */
  preferGoogleEta: boolean;
  /** Road factor used only by Haversine last-resort ETA approximation. */
  haversineRoadFactor: number;
  haversineSpeedKmh: number;
};

const DEFAULTS: LocationPlatformSettings = {
  enabled: true,
  primaryProvider: 'google',
  fallbackOrder: ['nominatim', 'haversine'],
  retryAttempts: 3,
  timeoutMs: 8_000,
  healthCheckIntervalMs: 60_000,
  failureThreshold: 3,
  recoveryProbeMs: 120_000,
  googleEnabled: true,
  nominatimEnabled: true,
  haversineEnabled: true,
  nominatimBaseUrl: 'https://nominatim.openstreetmap.org',
  preferGoogleEta: true,
  haversineRoadFactor: 1.35,
  haversineSpeedKmh: 25,
};

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function normalizeLocationSettings(
  raw: Partial<LocationPlatformSettings> | null | undefined,
): LocationPlatformSettings {
  const v = raw ?? {};
  const fallbackOrder = Array.isArray(v.fallbackOrder)
    ? (v.fallbackOrder.filter((id) => id === 'nominatim' || id === 'haversine') as LocationProviderId[])
    : [...DEFAULTS.fallbackOrder];
  if (!fallbackOrder.includes('nominatim')) fallbackOrder.unshift('nominatim');
  if (!fallbackOrder.includes('haversine')) fallbackOrder.push('haversine');

  return {
    enabled: v.enabled !== false,
    primaryProvider: 'google', // policy: Google is always primary
    fallbackOrder,
    retryAttempts: clampInt(v.retryAttempts, 1, 5, DEFAULTS.retryAttempts),
    timeoutMs: clampInt(v.timeoutMs, 2_000, 30_000, DEFAULTS.timeoutMs),
    healthCheckIntervalMs: clampInt(v.healthCheckIntervalMs, 15_000, 600_000, DEFAULTS.healthCheckIntervalMs),
    failureThreshold: clampInt(v.failureThreshold, 1, 10, DEFAULTS.failureThreshold),
    recoveryProbeMs: clampInt(v.recoveryProbeMs, 30_000, 900_000, DEFAULTS.recoveryProbeMs),
    googleEnabled: v.googleEnabled !== false,
    nominatimEnabled: v.nominatimEnabled !== false,
    haversineEnabled: v.haversineEnabled !== false,
    nominatimBaseUrl: String(v.nominatimBaseUrl || DEFAULTS.nominatimBaseUrl).replace(/\/$/, ''),
    preferGoogleEta: v.preferGoogleEta !== false,
    haversineRoadFactor: Math.max(1, Number(v.haversineRoadFactor) || DEFAULTS.haversineRoadFactor),
    haversineSpeedKmh: Math.max(5, Number(v.haversineSpeedKmh) || DEFAULTS.haversineSpeedKmh),
  };
}

export async function getLocationSettings(): Promise<LocationPlatformSettings> {
  const row = await PlatformSetting.findOne({ key: LOCATION_SETTINGS_KEY }).lean();
  return normalizeLocationSettings(row?.value as Partial<LocationPlatformSettings> | undefined);
}

export async function updateLocationSettings(
  patch: Partial<LocationPlatformSettings>,
  actorId?: string,
): Promise<LocationPlatformSettings> {
  const current = await getLocationSettings();
  const next = normalizeLocationSettings({ ...current, ...patch, primaryProvider: 'google' });
  await PlatformSetting.findOneAndUpdate(
    { key: LOCATION_SETTINGS_KEY },
    {
      $set: {
        value: next,
        scope: 'platform',
        description: 'Unified Location Platform — Google primary with emergency fallbacks',
        updatedBy: actorId,
      },
    },
    { upsert: true, new: true },
  );
  if (actorId) {
    await writeAuditLog({
      actorId,
      actorRole: 'admin',
      action: 'location.settings_updated',
      resourceType: 'PlatformSetting',
      resourceId: LOCATION_SETTINGS_KEY,
      meta: { retryAttempts: next.retryAttempts, timeoutMs: next.timeoutMs },
    });
  }
  return next;
}

export const locationSettingsDefaults = DEFAULTS;
