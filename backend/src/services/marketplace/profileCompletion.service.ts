import { PlatformSetting, PortfolioMedia, TechnicianProfile, User } from '../../models/index.js';
import { CoverageArea } from '../../models/technician/Technician.js';
import { AppError } from '../../utils/AppError.js';

export const PROFILE_COMPLETION_SETTING_KEY = 'marketplace.technician_profile_completion';

export type ProfileCompletionConfig = {
  /** Remind / banner when completion is below this (0–100). */
  reminderThreshold: number;
  /** If true, block job applications below minApplyPercent. */
  requireMinCompletionToApply: boolean;
  minApplyPercent: number;
  /** Days between reminder pushes (best-effort; UI also uses local dismiss). */
  reminderFrequencyDays: number;
};

export type ProfileCompletionSection = {
  id: string;
  label: string;
  weight: number
  complete: boolean;
  hint: string;
  href: string;
};

export type ProfileCompletionResult = {
  percent: number;
  threshold: number;
  belowThreshold: boolean;
  canApply: boolean;
  requireMinCompletionToApply: boolean;
  minApplyPercent: number;
  reminderFrequencyDays: number;
  sections: ProfileCompletionSection[];
  nextActions: Array<{ id: string; label: string; hint: string; href: string }>;
  benefits: string[];
};

const DEFAULT_CONFIG: ProfileCompletionConfig = {
  reminderThreshold: 80,
  requireMinCompletionToApply: false,
  minApplyPercent: 60,
  reminderFrequencyDays: 3,
};

export async function getProfileCompletionConfig(): Promise<ProfileCompletionConfig> {
  const setting = await PlatformSetting.findOne({ key: PROFILE_COMPLETION_SETTING_KEY });
  const value = (setting?.value ?? {}) as Partial<ProfileCompletionConfig>;
  return {
    reminderThreshold:
      typeof value.reminderThreshold === 'number' ? value.reminderThreshold : DEFAULT_CONFIG.reminderThreshold,
    requireMinCompletionToApply: value.requireMinCompletionToApply === true,
    minApplyPercent:
      typeof value.minApplyPercent === 'number' ? value.minApplyPercent : DEFAULT_CONFIG.minApplyPercent,
    reminderFrequencyDays:
      typeof value.reminderFrequencyDays === 'number'
        ? value.reminderFrequencyDays
        : DEFAULT_CONFIG.reminderFrequencyDays,
  };
}

export async function ensureProfileCompletionSetting(adminId?: string): Promise<ProfileCompletionConfig> {
  const existing = await PlatformSetting.findOne({ key: PROFILE_COMPLETION_SETTING_KEY });
  if (existing) return getProfileCompletionConfig();
  await PlatformSetting.create({
    key: PROFILE_COMPLETION_SETTING_KEY,
    value: DEFAULT_CONFIG,
    scope: 'platform',
    description: 'Technician profile completion scoring and apply gates',
    updatedBy: adminId,
  });
  return DEFAULT_CONFIG;
}

export async function updateProfileCompletionConfig(
  adminId: string,
  patch: Partial<ProfileCompletionConfig>,
): Promise<ProfileCompletionConfig> {
  await ensureProfileCompletionSetting(adminId);
  const current = await getProfileCompletionConfig();
  const next: ProfileCompletionConfig = {
    reminderThreshold: clampPercent(patch.reminderThreshold ?? current.reminderThreshold),
    requireMinCompletionToApply:
      patch.requireMinCompletionToApply !== undefined
        ? Boolean(patch.requireMinCompletionToApply)
        : current.requireMinCompletionToApply,
    minApplyPercent: clampPercent(patch.minApplyPercent ?? current.minApplyPercent),
    reminderFrequencyDays: Math.max(
      1,
      Math.min(30, Number(patch.reminderFrequencyDays ?? current.reminderFrequencyDays)),
    ),
  };
  await PlatformSetting.findOneAndUpdate(
    { key: PROFILE_COMPLETION_SETTING_KEY },
    { $set: { value: next, updatedBy: adminId } },
    { upsert: true },
  );
  return next;
}

function clampPercent(n: number) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

function filled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return value > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Weighted profile completion. Signup MVP fields are baseline (~35%).
 * Remaining weight unlocks via progressive setup.
 */
export async function computeProfileCompletion(userId: string): Promise<ProfileCompletionResult> {
  const config = await getProfileCompletionConfig();
  const [user, profile, coverageCount, mediaCount] = await Promise.all([
    User.findById(userId).lean(),
    TechnicianProfile.findOne({ userId }).lean(),
    CoverageArea.countDocuments({ technicianUserId: userId }),
    PortfolioMedia.countDocuments({ technicianUserId: userId }),
  ]);

  if (!user || !profile) throw AppError.notFound('Technician profile not found');

  const sections: ProfileCompletionSection[] = [
    {
      id: 'identity',
      label: 'Account basics',
      weight: 20,
      complete: filled(user.fullName) && filled(user.email) && filled(user.phone),
      hint: 'Name, phone and email from signup.',
      href: '/technician/settings',
    },
    {
      id: 'profession',
      label: 'Primary profession',
      weight: 15,
      complete: filled(profile.primaryCategoryId),
      hint: 'Choose the main trade customers should find you under.',
      href: '/technician/services',
    },
    {
      id: 'district',
      label: 'Home district',
      weight: 10,
      complete: filled(profile.location?.district),
      hint: 'Set where you usually work so nearby jobs reach you.',
      href: '/technician/service-areas',
    },
    {
      id: 'photo',
      label: 'Profile photo',
      weight: 10,
      complete: filled(profile.photoUrl),
      hint: 'A clear photo builds trust with customers.',
      href: '/technician/profile-setup',
    },
    {
      id: 'bio',
      label: 'Short professional bio',
      weight: 10,
      complete: filled(profile.bio) && String(profile.bio).trim().length >= 40,
      hint: 'Up to 250 characters describing your expertise.',
      href: '/technician/profile-setup',
    },
    {
      id: 'experience',
      label: 'Years of experience',
      weight: 5,
      complete: Number(profile.experienceYears) > 0,
      hint: 'Tell customers how long you have practiced your trade.',
      href: '/technician/profile-setup',
    },
    {
      id: 'languages',
      label: 'Languages',
      weight: 5,
      complete: Array.isArray(profile.languages) && profile.languages.length > 0,
      hint: 'List languages you can serve customers in.',
      href: '/technician/profile-setup',
    },
    {
      id: 'categories',
      label: 'Additional categories',
      weight: 5,
      complete: Array.isArray(profile.subcategoryIds) && profile.subcategoryIds.length > 0,
      hint: 'Add more services to qualify for more jobs.',
      href: '/technician/services',
    },
    {
      id: 'coverage',
      label: 'Operating areas',
      weight: 10,
      complete: coverageCount > 0,
      hint: 'Add coverage so nearby customers can find you.',
      href: '/technician/service-areas',
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      weight: 10,
      complete: mediaCount > 0,
      hint: 'Add photos of past work to increase customer confidence.',
      href: '/technician/portfolio',
    },
  ];

  const earned = sections.reduce((sum, s) => sum + (s.complete ? s.weight : 0), 0);
  const total = sections.reduce((sum, s) => sum + s.weight, 0) || 100;
  const percent = Math.round((earned / total) * 100);
  const belowThreshold = percent < config.reminderThreshold;
  const canApply =
    !config.requireMinCompletionToApply || percent >= config.minApplyPercent;

  const nextActions = sections
    .filter((s) => !s.complete)
    .slice(0, 4)
    .map((s) => ({ id: s.id, label: s.label, hint: s.hint, href: s.href }));

  return {
    percent,
    threshold: config.reminderThreshold,
    belowThreshold,
    canApply,
    requireMinCompletionToApply: config.requireMinCompletionToApply,
    minApplyPercent: config.minApplyPercent,
    reminderFrequencyDays: config.reminderFrequencyDays,
    sections,
    nextActions,
    benefits: [
      'Higher search ranking',
      'Greater customer trust',
      'Better application success',
      'Eligible for verification badges',
      'Eligible for premium jobs',
      'Improved profile visibility',
    ],
  };
}

export async function assertProfileCompleteEnoughToApply(userId: string): Promise<void> {
  const result = await computeProfileCompletion(userId);
  if (result.canApply) return;
  throw AppError.forbidden(
    `Complete at least ${result.minApplyPercent}% of your profile before applying for jobs. Your profile is ${result.percent}% complete.`,
  );
}
