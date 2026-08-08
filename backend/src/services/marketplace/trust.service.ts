import {
  Badge,
  TechnicianProfile,
  TrustScore,
} from '../../models/index.js';
import {
  EXPERIENCE_LEVEL,
  TECHNICIAN_RANK,
} from '../../models/shared/enums.js';
import { emitTrustScoreUpdated } from '../../sockets/realtime.js';

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function experienceLevelFromYears(years: number): string {
  if (years >= 10) return EXPERIENCE_LEVEL.MASTER;
  if (years >= 7) return EXPERIENCE_LEVEL.EXPERT;
  if (years >= 4) return EXPERIENCE_LEVEL.ADVANCED;
  if (years >= 2) return EXPERIENCE_LEVEL.INTERMEDIATE;
  return EXPERIENCE_LEVEL.BEGINNER;
}

function rankFromTrust(trust: number): string {
  if (trust >= 90) return TECHNICIAN_RANK.DIAMOND;
  if (trust >= 80) return TECHNICIAN_RANK.PLATINUM;
  if (trust >= 70) return TECHNICIAN_RANK.GOLD;
  if (trust >= 55) return TECHNICIAN_RANK.SILVER;
  return TECHNICIAN_RANK.BRONZE;
}

/**
 * Recompute trust dimensions from completed job stats and response metrics.
 * Called after successful business events (job completed, application accepted, etc.).
 */
export async function recomputeTrustForTechnician(technicianUserId: string): Promise<void> {
  const profile = await TechnicianProfile.findOne({ userId: technicianUserId });
  if (!profile) return;

  const completed = profile.jobsCompleted;
  const cancelled = profile.jobsCancelled;
  const total = completed + cancelled;
  const completionRate = total === 0 ? 50 : (completed / total) * 100;

  const reliability = clamp(completionRate);
  const completion = clamp(40 + Math.min(completed, 40) + completionRate * 0.2);
  const response = clamp(profile.responseScore || 60 + Math.min(completed, 20));
  const punctuality = clamp(profile.punctualityScore || 60 + Math.min(completed, 25));
  const trust = clamp(reliability * 0.35 + completion * 0.3 + response * 0.2 + punctuality * 0.15);
  const composite = trust;

  profile.reliabilityScore = reliability;
  profile.completionScore = completion;
  profile.responseScore = response;
  profile.punctualityScore = punctuality;
  profile.trustScore = trust;
  profile.experienceLevel = experienceLevelFromYears(profile.experienceYears);
  profile.currentRank = rankFromTrust(trust);

  await TrustScore.findOneAndUpdate(
    { technicianUserId },
    {
      $set: {
        technicianProfileId: profile._id,
        trust,
        reliability,
        completion,
        response,
        punctuality,
        composite,
        sampleSize: completed,
        computedAt: new Date(),
        algorithmVersion: 'v1',
        breakdown: { completed, cancelled, completionRate },
      },
    },
    { upsert: true, new: true },
  );

  // Badge grants based on milestones
  const badgeKeys: string[] = [];
  if (completed >= 1) badgeKeys.push('first_job');
  if (completed >= 10) badgeKeys.push('reliable_10');
  if (trust >= 80) badgeKeys.push('trusted_pro');

  if (badgeKeys.length) {
    const badges = await Badge.find({ key: { $in: badgeKeys }, isActive: true });
    const ids = badges.map((b) => b._id);
    const existing = new Set(profile.badgeIds.map((id) => id.toString()));
    for (const id of ids) {
      if (!existing.has(id.toString())) profile.badgeIds.push(id);
    }
  }

  await profile.save();
  emitTrustScoreUpdated(technicianUserId, {
    trust: profile.trustScore,
    reliability: profile.reliabilityScore,
    completion: profile.completionScore,
    response: profile.responseScore,
    punctuality: profile.punctualityScore,
    currentRank: profile.currentRank,
  });
}

/** Bump response score slightly when technician applies quickly (event hook). */
export async function bumpResponseScore(technicianUserId: string, delta = 1): Promise<void> {
  await TechnicianProfile.updateOne(
    { userId: technicianUserId },
    { $inc: { responseScore: delta } },
  );
}
