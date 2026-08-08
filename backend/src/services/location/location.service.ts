/**
 * FixNow Unified Location Service
 *
 * Policy: Google Maps Platform is ALWAYS attempted first.
 * Nominatim and Haversine activate only after confirmed Google failure
 * (retries exhausted + failure threshold). Never random alternation.
 */

import { PlatformSetting } from '../../models/index.js';
import { writeAuditLog } from '../../utils/audit.js';
import { logger } from '../../config/logger.js';
import {
  getLocationSettings,
  updateLocationSettings,
  LOCATION_FAILOVER_LOG_KEY,
  LOCATION_HEALTH_KEY,
  locationSettingsDefaults,
  type LocationCapability,
  type LocationPlatformSettings,
  type LocationProviderId,
} from './locationSettings.service.js';
import {
  googleAutocomplete,
  googleDirections,
  googleDistanceMatrix,
  googleForwardGeocode,
  googleHealthProbe,
  googleReverseGeocode,
  haversineDistanceEta,
  haversineStraightMeters,
  isGoogleConfigured,
  nominatimForwardGeocode,
  nominatimHealthProbe,
  nominatimReverseGeocode,
  type DistanceEtaResult,
  type ForwardGeocodeResult,
  type GeoPoint,
  type PlaceSuggestion,
  type ReverseGeocodeResult,
} from './providers.js';

export type LocationHealthSnapshot = {
  activeProvider: LocationProviderId;
  google: CapabilityHealth;
  nominatim: CapabilityHealth;
  haversine: CapabilityHealth;
  capabilities: Record<LocationCapability, { provider: LocationProviderId; status: string }>;
  consecutiveGoogleFailures: number;
  failoverActive: boolean;
  lastFailoverAt?: string;
  lastRecoveryAt?: string;
  healthScore: number;
  averageLatencyMs?: number;
  settings: LocationPlatformSettings;
};

type CapabilityHealth = {
  enabled: boolean;
  status: 'healthy' | 'degraded' | 'failed' | 'disabled' | 'unknown';
  latencyMs?: number;
  lastCheckedAt?: string;
  message?: string;
  quotaHint?: string;
};

type RuntimeHealth = {
  consecutiveGoogleFailures: number;
  failoverActive: boolean;
  activeProvider: LocationProviderId;
  lastFailoverAt?: string;
  lastRecoveryAt?: string;
  lastGoogleOkAt?: string;
  lastProbeAt?: number;
  google: CapabilityHealth;
  nominatim: CapabilityHealth;
  recentLatencies: number[];
};

type FailoverLogEntry = {
  at: string;
  from: LocationProviderId;
  to: LocationProviderId;
  reason: string;
  retryCount: number;
  recoveredAt?: string;
};

let runtime: RuntimeHealth = {
  consecutiveGoogleFailures: 0,
  failoverActive: false,
  activeProvider: 'google',
  google: { enabled: true, status: 'unknown' },
  nominatim: { enabled: true, status: 'unknown' },
  recentLatencies: [],
};

function pushLatency(ms: number) {
  runtime.recentLatencies = [...runtime.recentLatencies.slice(-19), ms];
}

function avgLatency(): number | undefined {
  if (!runtime.recentLatencies.length) return undefined;
  return Math.round(
    runtime.recentLatencies.reduce((a, b) => a + b, 0) / runtime.recentLatencies.length,
  );
}

async function readFailoverLog(): Promise<FailoverLogEntry[]> {
  const row = await PlatformSetting.findOne({ key: LOCATION_FAILOVER_LOG_KEY }).lean();
  const value = row?.value as { entries?: FailoverLogEntry[] } | undefined;
  return Array.isArray(value?.entries) ? value!.entries! : [];
}

async function appendFailoverLog(entry: FailoverLogEntry) {
  const entries = await readFailoverLog();
  entries.unshift(entry);
  await PlatformSetting.findOneAndUpdate(
    { key: LOCATION_FAILOVER_LOG_KEY },
    {
      $set: {
        value: { entries: entries.slice(0, 50) },
        scope: 'platform',
        description: 'Location provider failover audit trail',
      },
    },
    { upsert: true, new: true },
  );
}

async function persistHealth() {
  await PlatformSetting.findOneAndUpdate(
    { key: LOCATION_HEALTH_KEY },
    {
      $set: {
        value: {
          consecutiveGoogleFailures: runtime.consecutiveGoogleFailures,
          failoverActive: runtime.failoverActive,
          activeProvider: runtime.activeProvider,
          lastFailoverAt: runtime.lastFailoverAt,
          lastRecoveryAt: runtime.lastRecoveryAt,
          lastGoogleOkAt: runtime.lastGoogleOkAt,
          google: runtime.google,
          nominatim: runtime.nominatim,
          averageLatencyMs: avgLatency(),
          updatedAt: new Date().toISOString(),
        },
        scope: 'platform',
        description: 'Location provider runtime health',
      },
    },
    { upsert: true, new: true },
  );
}

function markGoogleSuccess(latencyMs: number) {
  pushLatency(latencyMs);
  runtime.consecutiveGoogleFailures = 0;
  runtime.google = {
    enabled: true,
    status: 'healthy',
    latencyMs,
    lastCheckedAt: new Date().toISOString(),
    message: 'OK',
  };
  runtime.lastGoogleOkAt = new Date().toISOString();
  if (runtime.failoverActive) {
    const from = runtime.activeProvider;
    runtime.failoverActive = false;
    runtime.activeProvider = 'google';
    runtime.lastRecoveryAt = new Date().toISOString();
    void appendFailoverLog({
      at: runtime.lastRecoveryAt,
      from,
      to: 'google',
      reason: 'automatic_recovery',
      retryCount: 0,
      recoveredAt: runtime.lastRecoveryAt,
    });
    logger.info({ from }, 'Location platform recovered to Google Maps');
  } else {
    runtime.activeProvider = 'google';
  }
  void persistHealth();
}

function markGoogleFailure(message: string) {
  runtime.consecutiveGoogleFailures += 1;
  runtime.google = {
    enabled: true,
    status: 'failed',
    lastCheckedAt: new Date().toISOString(),
    message,
  };
  void persistHealth();
}

async function activateFailover(
  to: LocationProviderId,
  reason: string,
  retryCount: number,
) {
  const from = runtime.activeProvider;
  runtime.failoverActive = to !== 'google';
  runtime.activeProvider = to;
  runtime.lastFailoverAt = new Date().toISOString();
  await appendFailoverLog({
    at: runtime.lastFailoverAt,
    from,
    to,
    reason,
    retryCount,
  });
  await persistHealth();
  logger.warn({ from, to, reason, retryCount }, 'Location provider failover');
}

/**
 * Execute with Google-first retries. Only after threshold failures, use fallback chain.
 * Never alternates providers between successful Google requests.
 */
async function withProviderPolicy<T>(
  capability: string,
  googleFn: () => Promise<T>,
  fallbacks: Array<{ id: LocationProviderId; run: () => Promise<T> }>,
): Promise<{ result: T; provider: LocationProviderId; retries: number }> {
  const settings = await getLocationSettings();
  if (!settings.enabled) {
    throw new Error('LOCATION_PLATFORM_DISABLED');
  }

  // Automatic recovery probe while on fallback
  if (
    runtime.failoverActive &&
    settings.googleEnabled &&
    isGoogleConfigured() &&
    (!runtime.lastProbeAt || Date.now() - runtime.lastProbeAt >= settings.recoveryProbeMs)
  ) {
    runtime.lastProbeAt = Date.now();
    const probe = await googleHealthProbe(Math.min(settings.timeoutMs, 5_000));
    if (probe.ok) {
      markGoogleSuccess(probe.latencyMs);
    }
  }

  const tryGoogleFirst =
    settings.googleEnabled &&
    isGoogleConfigured() &&
    !runtime.failoverActive;

  let retries = 0;
  let lastError: unknown;

  if (tryGoogleFirst) {
    for (let attempt = 1; attempt <= settings.retryAttempts; attempt += 1) {
      retries = attempt;
      const started = Date.now();
      try {
        const result = await googleFn();
        markGoogleSuccess(Date.now() - started);
        return { result, provider: 'google', retries };
      } catch (err) {
        lastError = err;
        markGoogleFailure(err instanceof Error ? err.message : String(err));
        logger.warn(
          { capability, attempt, err: err instanceof Error ? err.message : err },
          'Google location request failed',
        );
      }
    }
  }

  // Confirmed persistent Google failure (or already in failover) → ordered fallbacks only
  if (runtime.consecutiveGoogleFailures >= settings.failureThreshold || runtime.failoverActive || !tryGoogleFirst) {
    for (const fb of fallbacks) {
      if (fb.id === 'nominatim' && !settings.nominatimEnabled) continue;
      if (fb.id === 'haversine' && !settings.haversineEnabled) continue;
      try {
        const result = await fb.run();
        if (runtime.activeProvider !== fb.id || !runtime.failoverActive) {
          await activateFailover(
            fb.id,
            lastError instanceof Error ? lastError.message : `google_failed:${capability}`,
            retries,
          );
        }
        if (fb.id === 'nominatim') {
          runtime.nominatim = {
            enabled: true,
            status: 'healthy',
            lastCheckedAt: new Date().toISOString(),
            message: 'Serving as emergency fallback',
          };
        }
        return { result, provider: fb.id, retries };
      } catch (err) {
        lastError = err;
        if (fb.id === 'nominatim') {
          runtime.nominatim = {
            enabled: true,
            status: 'failed',
            lastCheckedAt: new Date().toISOString(),
            message: err instanceof Error ? err.message : 'Nominatim failed',
          };
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`LOCATION_${capability.toUpperCase()}_FAILED`);
}

function healthScore(): number {
  let score = 100;
  if (runtime.google.status === 'failed') score -= 40;
  if (runtime.google.status === 'unknown') score -= 10;
  if (runtime.failoverActive) score -= 25;
  if (runtime.nominatim.status === 'failed') score -= 15;
  if (runtime.consecutiveGoogleFailures > 0) score -= Math.min(20, runtime.consecutiveGoogleFailures * 5);
  return Math.max(0, Math.min(100, score));
}

export const locationService = {
  getSettings: getLocationSettings,
  updateSettings: updateLocationSettings,
  defaults: locationSettingsDefaults,

  async dashboard(): Promise<LocationHealthSnapshot> {
    const settings = await getLocationSettings();
    const log = await readFailoverLog();
    return {
      activeProvider: runtime.activeProvider,
      google: {
        ...runtime.google,
        enabled: settings.googleEnabled && isGoogleConfigured(),
        quotaHint: isGoogleConfigured() ? 'Server key present' : 'Set GOOGLE_MAPS_SERVER_API_KEY',
      },
      nominatim: {
        ...runtime.nominatim,
        enabled: settings.nominatimEnabled,
      },
      haversine: {
        enabled: settings.haversineEnabled,
        status: 'healthy',
        message: 'Local approximation — never used for routing/billing',
      },
      capabilities: {
        geocoding: {
          provider: runtime.activeProvider === 'haversine' ? 'nominatim' : runtime.activeProvider,
          status: runtime.failoverActive ? 'fallback' : 'primary',
        },
        reverse_geocoding: {
          provider: runtime.activeProvider === 'haversine' ? 'nominatim' : runtime.activeProvider,
          status: runtime.failoverActive ? 'fallback' : 'primary',
        },
        places: { provider: 'google', status: runtime.google.status },
        autocomplete: { provider: 'google', status: runtime.google.status },
        directions: { provider: 'google', status: runtime.google.status },
        distance_matrix: { provider: 'google', status: runtime.google.status },
        eta: {
          provider: runtime.activeProvider,
          status: runtime.failoverActive ? 'fallback' : 'primary',
        },
        nearby_search: { provider: 'google', status: runtime.google.status },
        maps_tiles: { provider: 'google', status: isGoogleConfigured() ? 'healthy' : 'disabled' },
      },
      consecutiveGoogleFailures: runtime.consecutiveGoogleFailures,
      failoverActive: runtime.failoverActive,
      lastFailoverAt: runtime.lastFailoverAt || log[0]?.at,
      lastRecoveryAt: runtime.lastRecoveryAt,
      healthScore: healthScore(),
      averageLatencyMs: avgLatency(),
      settings,
    };
  },

  async failoverLog() {
    return { entries: await readFailoverLog() };
  },

  async runHealthChecks(actorId?: string) {
    const settings = await getLocationSettings();
    const google = await googleHealthProbe(Math.min(settings.timeoutMs, 6_000));
    runtime.google = {
      enabled: settings.googleEnabled && isGoogleConfigured(),
      status: !settings.googleEnabled
        ? 'disabled'
        : !isGoogleConfigured()
          ? 'disabled'
          : google.ok
            ? 'healthy'
            : 'failed',
      latencyMs: google.latencyMs,
      lastCheckedAt: new Date().toISOString(),
      message: google.message,
    };
    if (google.ok) {
      markGoogleSuccess(google.latencyMs);
    } else if (isGoogleConfigured()) {
      markGoogleFailure(google.message);
    }

    const nominatim = await nominatimHealthProbe(settings);
    runtime.nominatim = {
      enabled: settings.nominatimEnabled,
      status: !settings.nominatimEnabled ? 'disabled' : nominatim.ok ? 'healthy' : 'failed',
      latencyMs: nominatim.latencyMs,
      lastCheckedAt: new Date().toISOString(),
      message: nominatim.message,
    };

    await persistHealth();
    if (actorId) {
      await writeAuditLog({
        actorId,
        actorRole: 'admin',
        action: 'location.health_check',
        resourceType: 'LocationPlatform',
        meta: { google: runtime.google, nominatim: runtime.nominatim, score: healthScore() },
      });
    }
    return this.dashboard();
  },

  async reverseGeocode(point: GeoPoint): Promise<ReverseGeocodeResult & { retries?: number }> {
    const settings = await getLocationSettings();
    const { result, provider, retries } = await withProviderPolicy(
      'reverse_geocode',
      () => googleReverseGeocode(point, settings.timeoutMs),
      [
        {
          id: 'nominatim',
          run: () => nominatimReverseGeocode(point, settings),
        },
        {
          id: 'haversine',
          run: async () =>
            ({
              label: `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
              provider: 'haversine' as const,
            }) satisfies ReverseGeocodeResult,
        },
      ],
    );
    return { ...result, provider, retries };
  },

  async forwardGeocode(query: string, bias?: GeoPoint): Promise<ForwardGeocodeResult[]> {
    const settings = await getLocationSettings();
    const q = String(query || '').trim();
    if (!q) return [];
    const { result } = await withProviderPolicy(
      'forward_geocode',
      () => googleForwardGeocode(q, settings.timeoutMs, bias),
      [
        {
          id: 'nominatim',
          run: () => nominatimForwardGeocode(q, settings),
        },
      ],
    );
    return result;
  },

  async autocomplete(input: string, bias?: GeoPoint): Promise<PlaceSuggestion[]> {
    const settings = await getLocationSettings();
    const q = String(input || '').trim();
    if (q.length < 2) return [];
    // Places Autocomplete is Google-only; if Google down, Nominatim search as soft fallback
    try {
      const { result } = await withProviderPolicy(
        'autocomplete',
        () => googleAutocomplete(q, settings.timeoutMs, bias),
        [
          {
            id: 'nominatim',
            run: async () => {
              const places = await nominatimForwardGeocode(q, settings);
              return places.map((p) => ({
                placeId: p.placeId || `${p.lat},${p.lng}`,
                description: p.label,
                provider: 'nominatim' as const,
              }));
            },
          },
        ],
      );
      return result;
    } catch {
      return [];
    }
  },

  /**
   * Road distance + ETA. Google Distance Matrix / Directions preferred.
   * Haversine ONLY when Google and Nominatim cannot satisfy — never for billing/routing UX claims.
   */
  async distanceAndEta(
    origin: GeoPoint,
    destination: GeoPoint,
    opts: { preferDirections?: boolean } = {},
  ): Promise<DistanceEtaResult> {
    const settings = await getLocationSettings();
    const { result } = await withProviderPolicy(
      'distance_eta',
      async () => {
        if (opts.preferDirections) {
          try {
            return await googleDirections(origin, destination, settings.timeoutMs);
          } catch {
            return googleDistanceMatrix(origin, destination, settings.timeoutMs);
          }
        }
        return googleDistanceMatrix(origin, destination, settings.timeoutMs);
      },
      [
        // Nominatim has no Matrix — skip to haversine for distance math only
        {
          id: 'haversine',
          run: async () => haversineDistanceEta(origin, destination, settings),
        },
      ],
    );
    return result;
  },

  /** Straight-line meters for proximity sorting when no road engine is required. */
  approximateDistanceMeters(origin: GeoPoint, destination: GeoPoint): number {
    return haversineStraightMeters(origin, destination);
  },

  isGoogleConfigured,
  getRuntimeActiveProvider(): LocationProviderId {
    return runtime.activeProvider;
  },
};

export type { GeoPoint, ReverseGeocodeResult, ForwardGeocodeResult, DistanceEtaResult, PlaceSuggestion };
