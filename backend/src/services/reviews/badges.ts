import { Achievement, Badge, UserAchievement } from '../../models/index.js';
import { createDbNotification } from '../../utils/notify.js';
import { emitBadgeEarned } from '../../sockets/realtime.js';

const DEFAULT_BADGES = [
  {
    key: 'first_job',
    name: 'First Job',
    description: 'Completed your first FixNow job',
    icon: 'workspace_premium',
    category: 'milestone',
    isActive: true,
    criteria: { jobsCompleted: 1 },
  },
  {
    key: 'reliable_10',
    name: 'Reliable Pro',
    description: 'Completed 10 jobs',
    icon: 'verified',
    category: 'milestone',
    isActive: true,
    criteria: { jobsCompleted: 10 },
  },
  {
    key: 'trusted_pro',
    name: 'Trusted Pro',
    description: 'Reached trust score 80+',
    icon: 'military_tech',
    category: 'trust',
    isActive: true,
    criteria: { trust: 80 },
  },
  {
    key: 'five_star',
    name: 'Five Star',
    description: 'Received a 5-star review',
    icon: 'star',
    category: 'reviews',
    isActive: true,
    criteria: { overallRating: 5 },
  },
  {
    key: 'top_rated',
    name: 'Top Rated',
    description: 'Maintain 4.5+ average with 5+ reviews',
    icon: 'emoji_events',
    category: 'reviews',
    isActive: true,
    criteria: { ratingAverage: 4.5, reviewCount: 5 },
  },
  {
    key: 'community_favorite',
    name: 'Community Favorite',
    description: 'Received 25+ public reviews',
    icon: 'favorite',
    category: 'reviews',
    isActive: true,
    criteria: { reviewCount: 25 },
  },
] as const;

const DEFAULT_ACHIEVEMENTS = [
  {
    key: 'complete_5',
    title: 'Getting Started',
    description: 'Complete 5 jobs',
    icon: 'flag',
    target: 5,
    points: 50,
  },
  {
    key: 'complete_25',
    title: 'Seasoned Pro',
    description: 'Complete 25 jobs',
    icon: 'rocket_launch',
    target: 25,
    points: 200,
  },
  {
    key: 'reviews_10',
    title: 'Well Reviewed',
    description: 'Collect 10 customer reviews',
    icon: 'reviews',
    target: 10,
    points: 100,
  },
] as const;

export async function ensureBadgeCatalog(): Promise<void> {
  for (const badge of DEFAULT_BADGES) {
    await Badge.updateOne({ key: badge.key }, { $setOnInsert: { ...badge } }, { upsert: true });
  }
  for (const ach of DEFAULT_ACHIEVEMENTS) {
    await Achievement.updateOne(
      { key: ach.key },
      { $setOnInsert: { ...ach, isActive: true } },
      { upsert: true },
    );
  }
}

export async function grantBadgeByKey(
  _userId: string,
  badgeKey: string,
  badgeIds: { toString(): string }[],
): Promise<{ granted: boolean; badge?: InstanceType<typeof Badge> }> {
  await ensureBadgeCatalog();
  const badge = await Badge.findOne({ key: badgeKey, isActive: true });
  if (!badge) return { granted: false };
  if (badgeIds.some((id) => id.toString() === badge._id.toString())) {
    return { granted: false, badge };
  }
  return { granted: true, badge };
}

export async function notifyBadgeEarned(
  userId: string,
  badge: InstanceType<typeof Badge>,
): Promise<void> {
  await createDbNotification({
    userId,
    type: 'badge.earned',
    title: 'Badge earned',
    body: `You earned the "${badge.name}" badge.`,
    data: { badgeKey: badge.key },
  });
  emitBadgeEarned(userId, {
    id: badge._id.toString(),
    key: badge.key,
    name: badge.name,
    icon: badge.icon,
  });
}

export async function syncAchievementsForTechnician(
  userId: string,
  stats: { jobsCompleted: number; reviewCount: number },
): Promise<void> {
  await ensureBadgeCatalog();
  const catalog = await Achievement.find({ isActive: true });
  for (const ach of catalog) {
    let progress = 0;
    if (ach.key.startsWith('complete_')) progress = stats.jobsCompleted;
    if (ach.key.startsWith('reviews_')) progress = stats.reviewCount;
    const unlocked = progress >= ach.target;
    await UserAchievement.findOneAndUpdate(
      { userId, achievementId: ach._id },
      {
        $set: {
          progress: Math.min(progress, ach.target),
          ...(unlocked ? { unlockedAt: new Date() } : {}),
        },
        $setOnInsert: { userId, achievementId: ach._id },
      },
      { upsert: true },
    );
  }
}
