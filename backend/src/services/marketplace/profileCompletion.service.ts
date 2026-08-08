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

export type ProfileFieldClass = 'required' | 'optional' | 'trust_enhancing';

export type ProfileCompletionSection = {
  id: string;
  label: string;
  weight: number;
  complete: boolean;
  hint: string;
  href: string;
  classification: ProfileFieldClass;
};

export type ProfileCompletionResult = {
  percent: number;
  /** Share of required fields that are complete (0–100). */
  requiredPercent: number;
  /** Profile score (all weighted sections). */
  profileScore: number;
  /** Trust-enhancing completion (0–100 of trust section weights). */
  trustEnhancingPercent: number;
  threshold: number;
  belowThreshold: boolean;
  canApply: boolean;
  /** True when every required section is complete (optional never blocks). */
  canSubmitForApproval: boolean;
  requireMinCompletionToApply: boolean;
  minApplyPercent: number;
  reminderFrequencyDays: number;
  sections: ProfileCompletionSection[];
  requiredMissing: Array<{ id: string; label: string; hint: string; href: string }>;
  nextActions: Array<{ id: string; label: string; hint: string; href: string }>;
  benefits: string[];
};

const DEFAULT_CONFIG: ProfileCompletionConfig = {
  reminderThreshold: 80,
  requireMinCompletionToApply: false,
  minApplyPercent: 60,
  reminderFrequencyDays: 3,
};

/** Required for Submit for Approval — optional fields never block. */
export const REQUIRED_APPROVAL_SECTION_IDS = new Set([
  'identity',
  'profession',
  'district',
  'photo',
  'skills',
  'experience',
]);

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
 * Weighted profile completion with required / optional / trust-enhancing classification.
 * Optional fields never block Submit for Approval.
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

  const hasSkills =
    (Array.isArray(profile.skills) && profile.skills.length > 0) ||
    (Array.isArray(profile.subcategoryIds) && profile.subcategoryIds.length > 0);

  const sections: ProfileCompletionSection[] = [
    {
      id: 'identity',
      label: 'Name & phone',
      weight: 15,
      complete: filled(user.fullName) && filled(user.phone),
      hint: 'Your display name and phone number.',
      href: '/technician/settings',
      classification: 'required',
    },
    {
      id: 'profession',
      label: 'Primary trade',
      weight: 12,
      complete: filled(profile.primaryCategoryId),
      hint: 'Choose the main trade customers should find you under.',
      href: '/technician/services',
      classification: 'required',
    },
    {
      id: 'district',
      label: 'Primary service area',
      weight: 10,
      complete: filled(profile.location?.district),
      hint: 'Set where you usually work so nearby jobs reach you.',
      href: '/technician/service-areas',
      classification: 'required',
    },
    {
      id: 'photo',
      label: 'Profile photo',
      weight: 10,
      complete: filled(profile.photoUrl),
      hint: 'A clear photo builds trust with customers.',
      href: '/technician/profile-setup',
      classification: 'required',
    },
    {
      id: 'skills',
      label: 'Skills',
      weight: 10,
      complete: hasSkills,
      hint: 'Add skills or additional service categories.',
      href: '/technician/services',
      classification: 'required',
    },
    {
      id: 'experience',
      label: 'Years of experience',
      weight: 8,
      complete: Number(profile.experienceYears) > 0,
      hint: 'Tell customers how long you have practiced your trade.',
      href: '/technician/profile-setup',
      classification: 'required',
    },
    {
      id: 'bio',
      label: 'Short professional bio',
      weight: 8,
      complete: filled(profile.bio) && String(profile.bio).trim().length >= 40,
      hint: 'Optional — describe your expertise.',
      href: '/technician/profile-setup',
      classification: 'optional',
    },
    {
      id: 'languages',
      label: 'Languages',
      weight: 4,
      complete: Array.isArray(profile.languages) && profile.languages.length > 0,
      hint: 'Optional — list languages you can serve customers in.',
      href: '/technician/profile-setup',
      classification: 'optional',
    },
    {
      id: 'coverage',
      label: 'Operating areas',
      weight: 6,
      complete: coverageCount > 0,
      hint: 'Optional — add more coverage so nearby customers can find you.',
      href: '/technician/service-areas',
      classification: 'optional',
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      weight: 6,
      complete: mediaCount > 0,
      hint: 'Optional — photos of past work increase customer confidence.',
      href: '/technician/portfolio',
      classification: 'optional',
    },
    {
      id: 'verified_phone',
      label: 'Verified phone',
      weight: 3,
      complete: Boolean(user.phoneVerifiedAt),
      hint: 'Verify your phone to increase trust.',
      href: '/technician/settings',
      classification: 'trust_enhancing',
    },
    {
      id: 'verified_email',
      label: 'Verified email',
      weight: 3,
      complete: Boolean(user.emailVerifiedAt),
      hint: 'Verify your email to increase trust.',
      href: '/technician/settings',
      classification: 'trust_enhancing',
    },
    {
      id: 'identity_docs',
      label: 'Identity verification',
      weight: 3,
      complete: Boolean(profile.identityVerified),
      hint: 'Submit a national ID or license for extra trust.',
      href: '/technician/profile-setup',
      classification: 'trust_enhancing',
    },
    {
      id: 'business_ids',
      label: 'Business registration / Tax ID',
      weight: 2,
      complete:
        filled(profile.businessRegistrationNumber) || filled(profile.taxIdentificationNumber),
      hint: 'Optional trust documents for business technicians.',
      href: '/technician/company',
      classification: 'trust_enhancing',
    },
  ];

  const earned = sections.reduce((sum, s) => sum + (s.complete ? s.weight : 0), 0);
  const total = sections.reduce((sum, s) => sum + s.weight, 0) || 100;
  const percent = Math.round((earned / total) * 100);
  const profileScore = percent;

  const requiredSections = sections.filter((s) => s.classification === 'required');
  const requiredDone = requiredSections.filter((s) => s.complete).length;
  const requiredPercent = requiredSections.length
    ? Math.round((requiredDone / requiredSections.length) * 100)
    : 100;
  const canSubmitForApproval = requiredSections.every((s) => s.complete);

  const trustSections = sections.filter((s) => s.classification === 'trust_enhancing');
  const trustWeight = trustSections.reduce((sum, s) => sum + s.weight, 0) || 1;
  const trustEarned = trustSections.reduce((sum, s) => sum + (s.complete ? s.weight : 0), 0);
  const trustEnhancingPercent = Math.round((trustEarned / trustWeight) * 100);

  const belowThreshold = percent < config.reminderThreshold;
  const canApply = !config.requireMinCompletionToApply || percent >= config.minApplyPercent;

  const requiredMissing = requiredSections
    .filter((s) => !s.complete)
    .map((s) => ({ id: s.id, label: s.label, hint: s.hint, href: s.href }));

  const nextActions = sections
    .filter((s) => !s.complete)
    .sort((a, b) => {
      const order = { required: 0, trust_enhancing: 1, optional: 2 } as const;
      return order[a.classification] - order[b.classification];
    })
    .slice(0, 4)
    .map((s) => ({ id: s.id, label: s.label, hint: s.hint, href: s.href }));

  return {
    percent,
    requiredPercent,
    profileScore,
    trustEnhancingPercent,
    threshold: config.reminderThreshold,
    belowThreshold,
    canApply,
    canSubmitForApproval,
    requireMinCompletionToApply: config.requireMinCompletionToApply,
    minApplyPercent: config.minApplyPercent,
    reminderFrequencyDays: config.reminderFrequencyDays,
    sections,
    requiredMissing,
    nextActions,
    benefits: [
      'Eligible to submit for approval',
      'Higher search ranking once approved',
      'Greater customer trust',
      'Better application success',
      'Eligible for verification badges',
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
