/**
 * FixNow Intelligent Location Matching & Proximity Ranking Engine
 *
 * Single source of truth for technician discovery and job recommendations.
 * Distance alone never dominates — weights are Admin-configurable via PlatformSetting.
 */

import { PlatformSetting } from '../../models/index.js';
import { writeAuditLog } from '../../utils/audit.js';
import {
  estimateEtaSeconds,
  formatEta,
  haversineMeters,
  lngLatFromGeo,
} from '../tracking/geo.util.js';

export const RECOMMENDATION_SETTING_KEY = 'marketplace.recommendation';

/** Admin-tunable weights (normalized relative to each other, not absolute percentages). */
export type RecommendationWeights = {
  distance: number;
  rating: number;
  completedJobs: number;
  trustScore: number;
  responseTime: number;
  availability: number;
  verification: number;
  subscription: number;
  categoryMatch: number;
  acceptanceRate: number;
  completionRate: number;
  recentActivity: number;
  urgency: number;
  workload: number;
};

export type RecommendationEngineSettings = {
  enabled: boolean;
  weights: RecommendationWeights;
  /** Soft cap for subscription influence as share of total quality score (0–1). */
  maxSubscriptionInfluence: number;
  /** Soft cap for boost weight contribution. */
  maxBoostInfluence: number;
  maxSearchRadiusKm: number;
  /** Urban average speed (km/h) used for ETA when live traffic is unavailable. */
  averageTravelSpeedKmh: number;
  /** Road-distance multiplier over haversine (Uganda urban roads ≈ 1.35). */
  roadDistanceFactor: number;
  fairnessEnabled: boolean;
  /** 0–1: how strongly fairness diversifies otherwise equal candidates. */
  fairnessStrength: number;
  showDecisionIndicators: boolean;
  showEstimatedArrival: boolean;
};

export type GeoPoint = { lat: number; lng: number };

export type DecisionIndicator =
  | 'available_now'
  | 'responds_quickly'
  | 'top_rated'
  | 'nearby'
  | 'verified'
  | 'emergency'
  | 'professional'
  | 'business'
  | 'starter'
  | 'customer_favourite';

export type RankedTechnicianScore = {
  score: number;
  distanceKm: number | null;
  distanceMeters: number | null;
  etaMinutes: number | null;
  etaLabel: string | null;
  factors: Record<string, number>;
  indicators: DecisionIndicator[];
};

export type RankedJobScore = {
  score: number;
  distanceKm: number | null;
  distanceMeters: number | null;
  etaMinutes: number | null;
  etaLabel: string | null;
  matchReasons: string[];
  factors: Record<string, number>;
};

const DEFAULT_WEIGHTS: RecommendationWeights = {
  distance: 22,
  rating: 18,
  completedJobs: 12,
  trustScore: 16,
  responseTime: 10,
  availability: 8,
  verification: 6,
  subscription: 4,
  categoryMatch: 14,
  acceptanceRate: 6,
  completionRate: 8,
  recentActivity: 4,
  urgency: 10,
  workload: 8,
};

const DEFAULT_SETTINGS: RecommendationEngineSettings = {
  enabled: true,
  weights: { ...DEFAULT_WEIGHTS },
  maxSubscriptionInfluence: 0.12,
  maxBoostInfluence: 0.15,
  maxSearchRadiusKm: 50,
  averageTravelSpeedKmh: 25,
  roadDistanceFactor: 1.35,
  fairnessEnabled: true,
  fairnessStrength: 0.08,
  showDecisionIndicators: true,
  showEstimatedArrival: true,
};

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWeights(w: Partial<RecommendationWeights> | undefined): RecommendationWeights {
  const merged = { ...DEFAULT_WEIGHTS, ...(w || {}) };
  for (const key of Object.keys(merged) as (keyof RecommendationWeights)[]) {
    const v = Number(merged[key]);
    merged[key] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[key];
  }
  return merged;
}

function normalizeSettings(raw: Partial<RecommendationEngineSettings> | null | undefined): RecommendationEngineSettings {
  const v = raw ?? {};
  return {
    enabled: v.enabled !== false,
    weights: normalizeWeights(v.weights),
    maxSubscriptionInfluence: clamp(num(v.maxSubscriptionInfluence, DEFAULT_SETTINGS.maxSubscriptionInfluence), 0, 0.4),
    maxBoostInfluence: clamp(num(v.maxBoostInfluence, DEFAULT_SETTINGS.maxBoostInfluence), 0, 0.4),
    maxSearchRadiusKm: Math.max(1, num(v.maxSearchRadiusKm, DEFAULT_SETTINGS.maxSearchRadiusKm)),
    averageTravelSpeedKmh: Math.max(5, num(v.averageTravelSpeedKmh, DEFAULT_SETTINGS.averageTravelSpeedKmh)),
    roadDistanceFactor: Math.max(1, num(v.roadDistanceFactor, DEFAULT_SETTINGS.roadDistanceFactor)),
    fairnessEnabled: v.fairnessEnabled !== false,
    fairnessStrength: clamp(num(v.fairnessStrength, DEFAULT_SETTINGS.fairnessStrength), 0, 0.3),
    showDecisionIndicators: v.showDecisionIndicators !== false,
    showEstimatedArrival: v.showEstimatedArrival !== false,
  };
}

export async function getRecommendationSettings(): Promise<RecommendationEngineSettings> {
  const setting = await PlatformSetting.findOne({ key: RECOMMENDATION_SETTING_KEY });
  return normalizeSettings(setting?.value as Partial<RecommendationEngineSettings> | undefined);
}

export async function updateRecommendationSettings(
  patch: Partial<RecommendationEngineSettings>,
  actorId?: string,
): Promise<RecommendationEngineSettings> {
  const current = await getRecommendationSettings();
  const next = normalizeSettings({
    ...current,
    ...patch,
    weights: { ...current.weights, ...(patch.weights || {}) },
  });
  await PlatformSetting.findOneAndUpdate(
    { key: RECOMMENDATION_SETTING_KEY },
    {
      $set: {
        value: next,
        scope: 'platform',
        description: 'Intelligent matching & proximity ranking engine weights',
        updatedBy: actorId,
      },
    },
    { upsert: true, new: true },
  );
  if (actorId) {
    await writeAuditLog({
      actorId,
      action: 'recommendation_settings_updated',
      resourceType: 'PlatformSetting',
      resourceId: RECOMMENDATION_SETTING_KEY,
      meta: { weights: next.weights, maxSearchRadiusKm: next.maxSearchRadiusKm },
    });
  }
  return next;
}

/** Extract GeoJSON Point or {lat,lng} into a GeoPoint. */
export function resolveGeoPoint(input: unknown): GeoPoint | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.lat === 'number' && typeof obj.lng === 'number') {
    if (Number.isFinite(obj.lat) && Number.isFinite(obj.lng)) return { lat: obj.lat, lng: obj.lng };
  }
  if (typeof obj.latitude === 'number' && typeof obj.longitude === 'number') {
    if (Number.isFinite(obj.latitude) && Number.isFinite(obj.longitude)) {
      return { lat: obj.latitude, lng: obj.longitude };
    }
  }
  const fromGeo = lngLatFromGeo(obj.geo as { coordinates?: number[] } | null);
  if (fromGeo) return fromGeo;
  if (obj.location && typeof obj.location === 'object') {
    return resolveGeoPoint(obj.location);
  }
  return null;
}

export function computeDistanceMeters(origin: GeoPoint | null, target: GeoPoint | null): number | null {
  if (!origin || !target) return null;
  return haversineMeters(origin, target);
}

export function computeRoadDistanceMeters(
  straightMeters: number | null,
  settings: RecommendationEngineSettings,
): number | null {
  if (straightMeters == null) return null;
  return straightMeters * settings.roadDistanceFactor;
}

export function computeEta(
  distanceMeters: number | null,
  settings: RecommendationEngineSettings,
): { seconds: number; minutes: number; label: string } | null {
  if (distanceMeters == null || !settings.showEstimatedArrival) return null;
  const road = distanceMeters * settings.roadDistanceFactor;
  const speedMps = (settings.averageTravelSpeedKmh * 1000) / 3600;
  const seconds = estimateEtaSeconds(road, speedMps);
  const minutes = Math.max(1, Math.round(seconds / 60));
  return { seconds, minutes, label: formatEta(seconds) };
}

/**
 * Prefer the unified Location Platform (Google Distance Matrix) for ETA.
 * Falls back to haversine approximation only when the Location Service reports haversine.
 */
export async function computeEtaViaLocationPlatform(
  origin: GeoPoint | null,
  target: GeoPoint | null,
  settings: RecommendationEngineSettings,
): Promise<{
  seconds: number;
  minutes: number;
  label: string;
  distanceMeters: number;
  provider: string;
  roadDistance: boolean;
} | null> {
  if (!origin || !target || !settings.showEstimatedArrival) return null;
  try {
    const { locationService } = await import('../location/location.service.js');
    const result = await locationService.distanceAndEta(origin, target);
    const minutes = Math.max(1, Math.round(result.durationSeconds / 60));
    return {
      seconds: result.durationSeconds,
      minutes,
      label: result.etaLabel,
      distanceMeters: result.distanceMeters,
      provider: result.provider,
      roadDistance: result.roadDistance,
    };
  } catch {
    const meters = computeDistanceMeters(origin, target);
    const eta = computeEta(meters, settings);
    if (!eta || meters == null) return null;
    return {
      ...eta,
      distanceMeters: meters * settings.roadDistanceFactor,
      provider: 'haversine',
      roadDistance: false,
    };
  }
}

/** Distance factor: closer → higher (0–100). Outside max radius → 0. */
function distanceFactor(distanceKm: number | null, maxKm: number): number {
  if (distanceKm == null) return 45; // neutral when location unknown
  if (distanceKm > maxKm) return 0;
  // Smooth falloff: full score within 2 km, then declines
  if (distanceKm <= 2) return 100;
  const t = (distanceKm - 2) / Math.max(1, maxKm - 2);
  return clamp(100 * (1 - t));
}

function ratingFactor(ratingAverage: number): number {
  return clamp((Number(ratingAverage) / 5) * 100);
}

function completedJobsFactor(jobsCompleted: number): number {
  return clamp(Math.min(100, Number(jobsCompleted) * 2));
}

function responseTimeFactor(responseScore: number, responseTimeMinutesAvg?: number | null): number {
  if (responseTimeMinutesAvg != null && Number.isFinite(responseTimeMinutesAvg)) {
    // <5 min → 100; 30 min → ~50; 60+ → low
    return clamp(100 - Math.max(0, responseTimeMinutesAvg - 5) * 2.5);
  }
  return clamp(Number(responseScore) || 60);
}

function verificationFactor(profile: {
  verificationStatus?: string;
  identityVerified?: boolean;
  skillVerified?: boolean;
}): number {
  let score = 30;
  if (profile.identityVerified) score += 35;
  if (profile.skillVerified) score += 20;
  if (String(profile.verificationStatus || '').toLowerCase() === 'approved') score += 15;
  return clamp(score);
}

function subscriptionFactor(weight: number, maxInfluence: number, qualityBase: number): number {
  // Cap soft subscription lift relative to quality base
  const capped = Math.min(Number(weight) || 0, qualityBase * maxInfluence);
  return clamp(capped * 4); // map soft weight into 0–100-ish space for weighting
}

function completionRateFactor(completed: number, cancelled: number): number {
  const total = completed + cancelled;
  if (total <= 0) return 50;
  return clamp((completed / total) * 100);
}

function recentActivityFactor(updatedAt?: Date | string | null): number {
  if (!updatedAt) return 40;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return 40;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 100;
  if (days <= 7) return 80;
  if (days <= 30) return 55;
  return 25;
}

function categoryMatchFactor(profileCategoryId: string | null | undefined, requestedCategoryId: string | null | undefined): number {
  if (!requestedCategoryId) return 70; // no filter — neutral-high
  if (!profileCategoryId) return 20;
  return String(profileCategoryId) === String(requestedCategoryId) ? 100 : 0;
}

function planIndicator(planCode?: string | null): DecisionIndicator | null {
  const code = String(planCode || '').toUpperCase();
  if (code === 'BUSINESS') return 'business';
  if (code === 'PROFESSIONAL') return 'professional';
  if (code === 'STARTER') return 'starter';
  return null;
}

export function buildDecisionIndicators(input: {
  isAvailableNow?: boolean;
  ratingAverage?: number;
  responseTimeMinutesAvg?: number | null;
  responseScore?: number;
  identityVerified?: boolean;
  skillVerified?: boolean;
  verificationStatus?: string;
  distanceKm?: number | null;
  subscriptionPlanCode?: string | null;
  emergencyCapable?: boolean;
  reviewCount?: number;
}): DecisionIndicator[] {
  const out: DecisionIndicator[] = [];
  if (input.isAvailableNow) out.push('available_now');
  if (
    (input.responseTimeMinutesAvg != null && input.responseTimeMinutesAvg <= 10) ||
    Number(input.responseScore || 0) >= 80
  ) {
    out.push('responds_quickly');
  }
  if (Number(input.ratingAverage || 0) >= 4.7 && Number(input.reviewCount || 0) >= 5) {
    out.push('top_rated');
  }
  if (input.distanceKm != null && input.distanceKm <= 5) out.push('nearby');
  if (
    input.identityVerified ||
    input.skillVerified ||
    String(input.verificationStatus || '').toLowerCase() === 'approved'
  ) {
    out.push('verified');
  }
  if (input.emergencyCapable) out.push('emergency');
  const plan = planIndicator(input.subscriptionPlanCode);
  if (plan) out.push(plan);
  if (Number(input.reviewCount || 0) >= 20 && Number(input.ratingAverage || 0) >= 4.5) {
    out.push('customer_favourite');
  }
  return out;
}

export type TechnicianRankInput = {
  trustScore?: number;
  ratingAverage?: number;
  reviewCount?: number;
  jobsCompleted?: number;
  jobsCancelled?: number;
  responseScore?: number;
  responseTimeMinutesAvg?: number | null;
  punctualityScore?: number;
  isAvailableNow?: boolean;
  verificationStatus?: string;
  identityVerified?: boolean;
  skillVerified?: boolean;
  primaryCategoryId?: string | null;
  subscriptionPlanCode?: string | null;
  subscriptionWeight?: number;
  boostWeight?: number;
  featured?: boolean;
  location?: unknown;
  updatedAt?: Date | string | null;
  emergencyCapable?: boolean;
  /** Stable id for fairness jitter */
  userId?: string;
};

/**
 * Score a technician candidate against an origin + optional category.
 * Returns a 0–100+ composite score with distance, ETA, and decision indicators.
 */
export function scoreTechnician(
  profile: TechnicianRankInput,
  opts: {
    origin?: GeoPoint | null;
    categoryId?: string | null;
    settings: RecommendationEngineSettings;
  },
): RankedTechnicianScore {
  const { settings } = opts;
  const w = settings.weights;
  const target = resolveGeoPoint(profile.location);
  const meters = computeDistanceMeters(opts.origin ?? null, target);
  const distanceKm = meters != null ? meters / 1000 : null;
  const eta = computeEta(meters, settings);

  const factors: Record<string, number> = {
    distance: distanceFactor(distanceKm, settings.maxSearchRadiusKm),
    rating: ratingFactor(num(profile.ratingAverage)),
    completedJobs: completedJobsFactor(num(profile.jobsCompleted)),
    trustScore: clamp(num(profile.trustScore)),
    responseTime: responseTimeFactor(num(profile.responseScore), profile.responseTimeMinutesAvg),
    availability: profile.isAvailableNow ? 100 : 15,
    verification: verificationFactor(profile),
    categoryMatch: categoryMatchFactor(profile.primaryCategoryId, opts.categoryId),
    completionRate: completionRateFactor(num(profile.jobsCompleted), num(profile.jobsCancelled)),
    acceptanceRate: clamp(num(profile.punctualityScore) || 60),
    recentActivity: recentActivityFactor(profile.updatedAt),
  };

  // Quality base (excludes soft commercial factors) for capping subscription/boost
  const qualityParts = [
    factors.trustScore * w.trustScore,
    factors.rating * w.rating,
    factors.completedJobs * w.completedJobs,
    factors.responseTime * w.responseTime,
    factors.availability * w.availability,
    factors.verification * w.verification,
    factors.categoryMatch * w.categoryMatch,
    factors.completionRate * w.completionRate,
    factors.acceptanceRate * w.acceptanceRate,
    factors.recentActivity * w.recentActivity,
    factors.distance * w.distance,
  ];
  const qualityWeightSum =
    w.trustScore +
    w.rating +
    w.completedJobs +
    w.responseTime +
    w.availability +
    w.verification +
    w.categoryMatch +
    w.completionRate +
    w.acceptanceRate +
    w.recentActivity +
    w.distance;
  const qualityBase = qualityWeightSum > 0 ? qualityParts.reduce((a, b) => a + b, 0) / qualityWeightSum : 0;

  factors.subscription = subscriptionFactor(
    num(profile.subscriptionWeight),
    settings.maxSubscriptionInfluence,
    qualityBase,
  );
  const boostCap = qualityBase * settings.maxBoostInfluence;
  const boostContribution = Math.min(num(profile.boostWeight), boostCap);
  factors.boost = clamp(boostContribution * 4);
  factors.featured = profile.featured ? 70 : 0;

  const totalWeight =
    qualityWeightSum + w.subscription + (settings.maxBoostInfluence > 0 ? 5 : 0) + (profile.featured ? 3 : 0);
  let score =
    (qualityParts.reduce((a, b) => a + b, 0) +
      factors.subscription * w.subscription +
      factors.boost * 5 +
      factors.featured * 3) /
    Math.max(1, totalWeight);

  // Fairness: mild deterministic jitter so equally strong nearby techs rotate exposure
  if (settings.fairnessEnabled && profile.userId) {
    const hash = [...String(profile.userId)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const dayBucket = Math.floor(Date.now() / (1000 * 60 * 60 * 6)); // rotates every 6h
    const jitter = ((hash + dayBucket) % 100) / 100;
    score += (jitter - 0.5) * 100 * settings.fairnessStrength;
  }

  // Hard demote if outside radius when origin known
  if (distanceKm != null && distanceKm > settings.maxSearchRadiusKm) {
    score *= 0.15;
  }

  const indicators = settings.showDecisionIndicators
    ? buildDecisionIndicators({
        isAvailableNow: profile.isAvailableNow,
        ratingAverage: profile.ratingAverage,
        responseTimeMinutesAvg: profile.responseTimeMinutesAvg,
        responseScore: profile.responseScore,
        identityVerified: profile.identityVerified,
        skillVerified: profile.skillVerified,
        verificationStatus: profile.verificationStatus,
        distanceKm,
        subscriptionPlanCode: profile.subscriptionPlanCode,
        emergencyCapable: profile.emergencyCapable,
        reviewCount: profile.reviewCount,
      })
    : [];

  return {
    score: Math.round(score * 100) / 100,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    distanceMeters: meters != null ? Math.round(meters) : null,
    etaMinutes: eta?.minutes ?? null,
    etaLabel: eta?.label ?? null,
    factors,
    indicators,
  };
}

export type JobRankInput = {
  categoryId?: string | null;
  location?: unknown;
  geo?: unknown;
  budgetMin?: number;
  budgetMax?: number;
  urgent?: boolean;
  createdAt?: Date | string | null;
  preferredDate?: Date | string | null;
  title?: string;
  skillsHint?: string[];
};

export type TechnicianJobContext = {
  primaryCategoryId?: string | null;
  skills?: string[];
  location?: unknown;
  isAvailableNow?: boolean;
  /** Approximate open assignments / active jobs — higher = busier */
  activeWorkload?: number;
  preferredRadiusKm?: number;
};

/**
 * Score an open job for a technician (Available Jobs / AI listNearbyJobs).
 */
export function scoreJobForTechnician(
  job: JobRankInput,
  tech: TechnicianJobContext,
  opts: { settings: RecommendationEngineSettings; origin?: GeoPoint | null },
): RankedJobScore {
  const { settings } = opts;
  const w = settings.weights;
  const origin = opts.origin ?? resolveGeoPoint(tech.location);
  const target = resolveGeoPoint(job.geo) || resolveGeoPoint(job.location);
  const meters = computeDistanceMeters(origin, target);
  const distanceKm = meters != null ? meters / 1000 : null;
  const eta = computeEta(meters, settings);
  const maxKm = tech.preferredRadiusKm || settings.maxSearchRadiusKm;

  const factors: Record<string, number> = {
    distance: distanceFactor(distanceKm, maxKm),
    categoryMatch: categoryMatchFactor(tech.primaryCategoryId, job.categoryId),
    urgency: job.urgent ? 100 : 35,
    availability: tech.isAvailableNow ? 90 : 40,
    workload: clamp(100 - Math.min(100, num(tech.activeWorkload) * 25)),
    freshness: (() => {
      if (!job.createdAt) return 50;
      const hours = (Date.now() - new Date(job.createdAt).getTime()) / (1000 * 60 * 60);
      if (hours <= 1) return 100;
      if (hours <= 6) return 80;
      if (hours <= 24) return 55;
      return 30;
    })(),
    jobSize: (() => {
      const budget = num(job.budgetMax || job.budgetMin);
      if (!budget) return 50;
      // Prefer mid-range jobs slightly; very low budget soft-penalize
      if (budget < 20_000) return 35;
      if (budget < 150_000) return 85;
      return 70;
    })(),
  };

  // Skill overlap (soft)
  if (tech.skills?.length && job.skillsHint?.length) {
    const set = new Set(tech.skills.map((s) => s.toLowerCase()));
    const hits = job.skillsHint.filter((s) => set.has(s.toLowerCase())).length;
    factors.skills = clamp((hits / Math.max(1, job.skillsHint.length)) * 100);
  } else {
    factors.skills = 50;
  }

  const weightSum =
    w.distance + w.categoryMatch + w.urgency + w.availability + w.workload + 8 + 6 + 6;
  const score =
    (factors.distance * w.distance +
      factors.categoryMatch * w.categoryMatch +
      factors.urgency * w.urgency +
      factors.availability * w.availability +
      factors.workload * w.workload +
      factors.freshness * 8 +
      factors.jobSize * 6 +
      factors.skills * 6) /
    Math.max(1, weightSum);

  const matchReasons: string[] = [];
  if (distanceKm != null && distanceKm <= 5) matchReasons.push('Nearby');
  if (factors.categoryMatch >= 100) matchReasons.push('Category match');
  if (job.urgent) matchReasons.push('Urgent');
  if (factors.freshness >= 80) matchReasons.push('Just posted');
  if (tech.isAvailableNow) matchReasons.push('You are available');
  if (!matchReasons.length) matchReasons.push('Recommended');

  if (distanceKm != null && distanceKm > maxKm) {
    return {
      score: Math.round(score * 0.15 * 100) / 100,
      distanceKm: Math.round(distanceKm * 10) / 10,
      distanceMeters: meters != null ? Math.round(meters) : null,
      etaMinutes: eta?.minutes ?? null,
      etaLabel: eta?.label ?? null,
      matchReasons: ['Outside preferred radius'],
      factors,
    };
  }

  return {
    score: Math.round(score * 100) / 100,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    distanceMeters: meters != null ? Math.round(meters) : null,
    etaMinutes: eta?.minutes ?? null,
    etaLabel: eta?.label ?? null,
    matchReasons,
    factors,
  };
}

export const recommendationService = {
  getSettings: getRecommendationSettings,
  updateSettings: updateRecommendationSettings,
  scoreTechnician,
  scoreJobForTechnician,
  resolveGeoPoint,
  computeDistanceMeters,
  computeEta,
  buildDecisionIndicators,
  defaults: DEFAULT_SETTINGS,
};
