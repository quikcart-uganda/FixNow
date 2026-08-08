import { z } from 'zod';
import { ROLES } from '../constants/roles.js';
import { OTP_CHANNEL, OTP_PURPOSE } from '../models/auth/OtpChallenge.js';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

export const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: passwordSchema,
    fullName: z.string().min(2).max(120),
    phone: z
      .string()
      .min(9)
      .max(20)
      .regex(/^\+?[0-9]{9,15}$/)
      .optional(),
    role: z.enum([ROLES.CUSTOMER, ROLES.TECHNICIAN]),
    referralCode: z.string().min(3).max(32).optional(),
    acceptedTerms: z.boolean().optional(),
    primaryCategoryId: z.string().min(1).max(64).optional(),
    district: z.string().min(2).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === ROLES.TECHNICIAN) {
      if (!data.phone?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Phone number is required for technician registration',
          path: ['phone'],
        });
      }
      if (data.acceptedTerms !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'You must accept the Terms and Privacy Policy',
          path: ['acceptedTerms'],
        });
      }
      if (!data.primaryCategoryId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Primary profession/category is required',
          path: ['primaryCategoryId'],
        });
      }
      if (!data.district?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Current district is required',
          path: ['district'],
        });
      }
    }
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
  preferredRole: z.enum([ROLES.CUSTOMER, ROLES.TECHNICIAN]).optional(),
  deviceId: z.string().max(128).optional(),
  platform: z.enum(['web', 'ios', 'android', 'unknown']).optional(),
});

export const switchRoleSchema = z.object({
  role: z.enum([ROLES.CUSTOMER, ROLES.TECHNICIAN]),
  refreshToken: z.string().min(1).optional(),
});

export const googleLoginSchema = z.object({
  credential: z.string().min(20).max(8192),
  role: z.enum([ROLES.CUSTOMER, ROLES.TECHNICIAN]),
  rememberMe: z.boolean().optional(),
  deviceId: z.string().max(128).optional(),
  platform: z.enum(['web', 'ios', 'android', 'unknown']).optional(),
});

export const googleNativeHandoffSchema = z.object({
  credential: z.string().min(20).max(8192),
  role: z.enum([ROLES.CUSTOMER, ROLES.TECHNICIAN]),
});

export const googleNativeHandoffParamSchema = z.object({
  code: z.string().min(16).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const verifyOtpSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{9,15}$/)
      .optional(),
    code: z.string().min(4).max(8),
    purpose: z.enum([
      OTP_PURPOSE.EMAIL_VERIFICATION,
      OTP_PURPOSE.PHONE_VERIFICATION,
      OTP_PURPOSE.PASSWORD_RESET,
      OTP_PURPOSE.LOGIN,
    ]),
  })
  .refine((v) => Boolean(v.email || v.phone), {
    message: 'email or phone is required',
  });

export const resendOtpSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{9,15}$/)
      .optional(),
    purpose: z.enum([
      OTP_PURPOSE.EMAIL_VERIFICATION,
      OTP_PURPOSE.PHONE_VERIFICATION,
      OTP_PURPOSE.PASSWORD_RESET,
      OTP_PURPOSE.LOGIN,
    ]),
    channel: z.enum([OTP_CHANNEL.EMAIL, OTP_CHANNEL.SMS]).optional(),
  })
  .refine((v) => Boolean(v.email || v.phone), {
    message: 'email or phone is required',
  });

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const adminSuspendSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const devControlsUpdateSchema = z
  .object({
    enableDevOtp: z.boolean().optional(),
    enableDevLogin: z.boolean().optional(),
    enableTestAccounts: z.boolean().optional(),
    enableMockProviders: z.boolean().optional(),
    enableDebugLogs: z.boolean().optional(),
    enableDevelopmentMode: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one flag is required' });

export const createJobSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  categoryName: z.string().optional(),
  parish: z.string().optional(),
  district: z.string().optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  preferredDate: z.string().datetime().optional().or(z.string().min(1).optional()),
  location: z.record(z.unknown()).optional(),
  photoUrls: z.array(z.string()).optional(),
  videoUrls: z.array(z.string()).optional(),
  publish: z.boolean().optional(),
});

export const updateJobStatusSchema = z.object({
  status: z.enum([
    'draft',
    'posted',
    'assigned',
    'technician_en_route',
    'in_progress',
    'awaiting_confirmation',
    'completed',
    'cancelled',
    'disputed',
    'archived',
  ]),
  note: z.string().max(1000).optional(),
});

export const requestJobCompletionSchema = z.object({
  notes: z.string().max(2000).optional(),
  photoUrls: z.array(z.string().min(1).max(1024)).max(12).optional(),
  materialsUsed: z.string().max(1000).optional(),
  completedAtEstimate: z.string().min(1).max(40).optional(),
  confirmedByTechnician: z.literal(true),
});

export const confirmJobCompletionSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const reportJobCompletionIssueSchema = z.object({
  category: z.enum([
    'incomplete_work',
    'quality_issue',
    'wrong_work',
    'parts_missing',
    'technician_no_show',
    'other',
  ]),
  description: z.string().min(8).max(2000),
  photoUrls: z.array(z.string().min(1).max(1024)).max(12).optional(),
  comments: z.string().max(2000).optional(),
});

export const updateFreeJobConfigSchema = z.object({
  enabled: z.boolean().optional(),
  defaultLimit: z.number().int().min(0).max(9999).optional(),
  lockAfterLimit: z.boolean().optional(),
  requireCustomerConfirmation: z.boolean().optional(),
  autoCompleteTimeoutHours: z.number().int().min(0).max(720).optional(),
  subscriptionEnabled: z.boolean().optional(),
  gracePeriodDays: z.number().int().min(0).max(90).optional(),
  freePlanEnabled: z.boolean().optional(),
  monetizationSuspended: z.boolean().optional(),
});

export const overrideFreeJobsSchema = z.object({
  freeJobLimit: z.number().int().min(0).max(9999).optional(),
  remainingFreeJobs: z.number().int().min(0).max(9999).optional(),
  promotionalFreeJobs: z.number().int().min(0).max(9999).optional(),
  grantBonusJobs: z.number().int().min(1).max(100).optional(),
  unlock: z.boolean().optional(),
  suspendMonetization: z.boolean().optional(),
  subscriptionPlanCode: z.string().max(64).nullable().optional(),
  subscriptionStatus: z
    .enum(['none', 'trialing', 'active', 'past_due', 'cancelled', 'expired', 'required'])
    .optional(),
});

export const applyToJobSchema = z.object({
  message: z.string().max(2000).optional(),
  proposedAmount: z.number().nonnegative().optional(),
});

export const inviteToJobSchema = z.object({
  technicianIds: z.array(z.string().min(1)).min(1).max(20),
  message: z.string().max(2000).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'locked', 'suspended', 'pending_verification']),
  reason: z.string().max(500).optional(),
});

export const updatePlatformSettingSchema = z.object({
  value: z.record(z.unknown()),
  scope: z.enum(['platform', 'customer', 'technician', 'admin']).optional(),
  description: z.string().max(500).optional(),
  isSecret: z.boolean().optional(),
});

export const adminMfaEnrollConfirmSchema = z.object({
  token: z.string().min(6).max(8),
});

export const adminMfaVerifySchema = z.object({
  token: z.string().min(6).max(64),
});

export const createReviewSchema = z.object({
  jobId: z.string().min(1),
  rating: z.number().min(1).max(5),
  comment: z.string().max(2000).optional(),
  categories: z
    .object({
      quality: z.number().min(1).max(5).optional(),
      professionalism: z.number().min(1).max(5).optional(),
      communication: z.number().min(1).max(5).optional(),
      timeliness: z.number().min(1).max(5).optional(),
      valueForMoney: z.number().min(1).max(5).optional(),
    })
    .optional(),
});

export const editReviewSchema = z.object({
  rating: z.number().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
  categories: z
    .object({
      quality: z.number().min(1).max(5).optional(),
      professionalism: z.number().min(1).max(5).optional(),
      communication: z.number().min(1).max(5).optional(),
      timeliness: z.number().min(1).max(5).optional(),
      valueForMoney: z.number().min(1).max(5).optional(),
    })
    .optional(),
});

export const moderateReviewSchema = z.object({
  action: z.enum(['approve', 'hide', 'remove']),
});

export const flagReviewSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(5000),
  type: z.enum(['text', 'image', 'location', 'system']).optional(),
  clientMessageId: z.string().max(64).optional(),
  replyToMessageId: z.string().min(1).optional(),
  attachmentUrl: z.string().min(1).max(2048).optional(),
  attachmentMimeType: z.string().max(120).optional(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
      label: z.string().max(200).optional(),
    })
    .optional(),
});

export const editMessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const registerDeviceSchema = z.object({
  token: z.string().min(8).max(512),
  platform: z.enum(['web', 'android', 'ios']),
  deviceId: z.string().min(1).max(128).optional(),
  appVersion: z.string().max(64).optional(),
  locale: z.string().max(12).optional(),
  timezone: z.string().max(64).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const refreshDeviceSchema = z.object({
  oldToken: z.string().min(8).max(512).optional(),
  newToken: z.string().min(8).max(512),
  platform: z.enum(['web', 'android', 'ios']),
  deviceId: z.string().min(1).max(128).optional(),
});

export const removeDeviceSchema = z
  .object({
    token: z.string().min(8).max(512).optional(),
    deviceId: z.string().min(1).max(128).optional(),
  })
  .refine((v) => Boolean(v.token || v.deviceId), { message: 'token or deviceId required' });

export const updateNotificationPreferencesSchema = z.object({
  channels: z
    .object({
      inApp: z.boolean().optional(),
      push: z.boolean().optional(),
      sms: z.boolean().optional(),
      email: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
    })
    .optional(),
  categories: z.record(z.boolean()).optional(),
  quietHours: z
    .object({
      start: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
      end: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
      timezone: z.string().max(64).optional(),
    })
    .optional(),
  sound: z.boolean().optional(),
  badge: z.boolean().optional(),
});

export const broadcastNotificationSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1000),
  roles: z.array(z.enum([ROLES.CUSTOMER, ROLES.TECHNICIAN, ROLES.ADMIN])).optional(),
  userIds: z.array(z.string().min(1)).max(5000).optional(),
  href: z.string().max(512).optional(),
});

export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

export const payForJobSchema = z.object({
  jobId: z.string().min(1),
  provider: z.enum(['console', 'mtn', 'airtel', 'flutterwave', 'pesapal', 'stripe']).optional(),
  msisdn: z.string().min(9).max(20).optional(),
  amount: z.number().positive().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  useWallet: z.boolean().optional(),
});

export const mobileMoneyAccountSchema = z.object({
  provider: z.enum(['mtn', 'airtel']),
  msisdn: z.string().min(9).max(20),
  accountName: z.string().min(2).max(120),
  isDefault: z.boolean().optional(),
});

export const refundRequestSchema = z.object({
  jobId: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.string().max(1000).optional(),
});

export const disputeEscrowSchema = z.object({
  jobId: z.string().min(1),
  reason: z.string().min(3).max(1000),
});

export const resolveDisputeSchema = z.object({
  jobId: z.string().min(1),
  action: z.enum(['release', 'refund']),
  amount: z.number().positive().optional(),
  reason: z.string().max(1000).optional(),
});

export const payoutRequestSchema = z.object({
  amount: z.number().positive(),
  msisdn: z.string().min(9).max(20).optional(),
  provider: z.enum(['console', 'mtn', 'airtel', 'flutterwave', 'pesapal', 'stripe']).optional(),
});

export const providerParamSchema = z.object({
  provider: z.enum(['console', 'mtn', 'airtel', 'flutterwave', 'pesapal', 'stripe']),
});

export const aiChatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().min(1).max(40).optional(),
  guestSessionId: z.string().min(1).max(64).optional(),
  inputMode: z.enum(['text', 'voice', 'image']).optional(),
  attachments: z
    .array(
      z.object({
        kind: z.string().min(1).max(40),
        name: z.string().min(1).max(200),
        url: z.string().max(2000).optional(),
        mimeType: z.string().max(120).optional(),
      }),
    )
    .max(4)
    .optional(),
  context: z
    .object({
      screen: z.string().max(80).optional(),
      jobId: z.string().max(40).optional(),
      technicianId: z.string().max(40).optional(),
      categoryId: z.string().max(40).optional(),
      district: z.string().max(80).optional(),
      query: z.string().max(200).optional(),
      budgetMin: z.number().nonnegative().optional(),
      budgetMax: z.number().nonnegative().optional(),
    })
    .passthrough()
    .optional(),
});

export const aiCreateConversationSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

export const aiRoleParamSchema = z.object({
  role: z.enum(['customer', 'technician', 'admin']),
});

export const contentWriteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(120).optional(),
  category: z.enum(['legal', 'support', 'public', 'authentication', 'account', 'system']).optional(),
  audience: z.enum(['all', 'customer', 'technician', 'admin']).optional(),
  bodyHtml: z.string().max(200_000).optional(),
  bodyMarkdown: z.string().max(200_000).optional(),
  excerpt: z.string().max(500).optional(),
  heroImageUrl: z.string().max(2000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        url: z.string().url().max(2000),
        mimeType: z.string().max(120).optional(),
        sizeBytes: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(320).optional(),
  keywords: z.array(z.string().max(60)).max(40).optional(),
  language: z.string().min(2).max(12).optional(),
  status: z.enum(['draft', 'published', 'scheduled', 'archived']).optional(),
  scheduledPublishAt: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const contentCreateSchema = contentWriteSchema.extend({
  title: z.string().min(1).max(200),
});

export const contentSlugParamSchema = z.object({
  slug: z.string().min(1).max(120),
});

export const accountDeletionRequestSchema = z.object({
  confirmPhrase: z.string().min(3).max(64),
  reason: z.string().max(1000).optional(),
});

export const contentRestoreSchema = z.object({
  version: z.number().int().positive().optional(),
});

export const trackingPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  heading: z.number().min(0).max(360).optional(),
  speedMps: z.number().nonnegative().optional(),
  recordedAt: z.string().datetime().optional(),
});

export const trackingJobParamSchema = z.object({
  jobId: z.string().min(1),
});

const offerTypeEnum = z.enum([
  'percentage_discount',
  'fixed_discount',
  'free_call_out',
  'free_inspection',
  'bundle',
  'seasonal',
  'limited_time',
  'referral',
  'custom',
]);

export const createOfferSchema = z.object({
  type: offerTypeEnum,
  title: z.string().min(3).max(120),
  subtitle: z.string().max(160).optional(),
  description: z.string().min(10).max(2000),
  terms: z.string().max(2000).optional(),
  bannerImageUrl: z.string().url().max(500).optional().or(z.literal('')),
  promotionColor: z.string().max(32).optional(),
  badge: z.string().max(40).optional(),
  categoryIds: z.array(z.string().min(1)).max(20).optional(),
  serviceNames: z.array(z.string().min(1).max(80)).max(30).optional(),
  serviceAreaDistricts: z.array(z.string().min(1).max(80)).max(30).optional(),
  availabilityNote: z.string().max(240).optional(),
  discountValue: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  minimumBookingAmount: z.number().nonnegative().optional(),
  maximumDiscountAmount: z.number().nonnegative().optional(),
  maxRedemptions: z.number().int().positive().optional(),
  perCustomerLimit: z.number().int().positive().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weekdays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).optional(),
  holidayNotes: z.string().max(240).optional(),
});

export const updateOfferSchema = createOfferSchema.partial().extend({
  type: offerTypeEnum.optional(),
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(10).max(2000).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
});

export const moderateOfferSchema = z.object({
  action: z.enum([
    'approve',
    'reject',
    'archive',
    'suspend',
    'feature',
    'unfeature',
    'expire',
    'delete',
  ]),
  reason: z.string().max(500).optional(),
});

export const trackOfferSchema = z.object({
  event: z.enum(['view', 'click', 'booking']),
  amount: z.number().nonnegative().optional(),
});

export const offerReminderSchema = z.object({
  remindBeforeExpiry: z.boolean(),
});

export const platformPromotionWriteSchema = z.object({
  kind: z.enum(['holiday', 'welcome', 'referral', 'seasonal', 'announcement', 'custom']),
  title: z.string().min(3).max(120),
  subtitle: z.string().max(160).optional(),
  description: z.string().min(10).max(2000),
  terms: z.string().max(2000).optional(),
  bannerImageUrl: z.string().url().max(500).optional().or(z.literal('')),
  badge: z.string().max(40).optional(),
  promotionColor: z.string().max(32).optional(),
  code: z.string().max(40).optional(),
  discountType: z.enum(['percent', 'fixed', 'none', 'credit']).optional(),
  discountValue: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  audience: z.enum(['all', 'customer', 'technician']).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  maxRedemptions: z.number().int().positive().optional(),
  featured: z.boolean().optional(),
  publish: z.boolean().optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'expired', 'archived']).optional(),
});

export const sponsoredContentWriteSchema = z.object({
  type: z.enum([
    'educational_banner',
    'safety_campaign',
    'tip',
    'partner_ad',
    'announcement',
    'community_notice',
  ]),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(4000),
  bannerImageUrl: z.string().url().max(500).optional().or(z.literal('')),
  ctaLabel: z.string().max(40).optional(),
  ctaHref: z.string().max(500).optional(),
  placement: z.enum(['home', 'offers', 'search', 'profile', 'global']).optional(),
  sponsorName: z.string().max(120).optional(),
  audience: z.enum(['all', 'customer', 'technician']).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  priority: z.number().int().optional(),
  publish: z.boolean().optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'expired', 'archived']).optional(),
});

export const marketingStatusSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'expired', 'archived']),
});

export const trackMarketingSchema = z.object({
  event: z.enum(['view', 'click', 'impression', 'dismissal']),
});

const CONTENT_BLOCK_TYPES = [
  'hero_headline',
  'hero_description',
  'welcome_message',
  'promo_banner',
  'announcement',
  'sponsored_campaign',
  'advertisement',
  'educational',
  'safety_tip',
  'service_awareness',
  'referral_campaign',
  'seasonal_campaign',
  'recruitment_campaign',
  'technician_onboarding',
  'customer_onboarding',
  'feature_announcement',
  'feature_card',
] as const;

const CONTENT_BLOCK_AUDIENCES = [
  'customers',
  'technicians',
  'both',
  'guests',
  'logged_in',
  'new_users',
  'returning_users',
] as const;

const CONTENT_BLOCK_PAGES = [
  'global',
  'customer.splash',
  'customer.onboarding',
  'customer.login',
  'customer.register',
  'customer.home',
  'customer.dashboard',
  'customer.bookings',
  'customer.checkout',
  'customer.notifications',
  'technician.splash',
  'technician.landing',
  'technician.onboarding',
  'technician.login',
  'technician.register',
  'technician.dashboard',
  'technician.jobs',
  'technician.wallet',
  'technician.profile',
  'admin.marketing_preview',
  'admin.content_preview',
] as const;

const CONTENT_BLOCK_STATUSES = ['draft', 'scheduled', 'published', 'expired', 'archived'] as const;

export const contentBlockCreateSchema = z.object({
  type: z.enum(CONTENT_BLOCK_TYPES),
  audience: z.enum(CONTENT_BLOCK_AUDIENCES).optional(),
  page: z.enum(CONTENT_BLOCK_PAGES),
  section: z.string().min(1).max(60),
  locale: z.string().max(12).optional(),
  title: z.string().max(200).optional(),
  subtitle: z.string().max(300).optional(),
  body: z.string().max(4000).optional(),
  imageUrl: z.string().max(2000).optional().or(z.literal('')),
  icon: z.string().max(60).optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(2000).optional().or(z.literal('')),
  color: z.string().max(32).optional(),
  badge: z.string().max(60).optional(),
  status: z.enum(CONTENT_BLOCK_STATUSES).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  displayOrder: z.number().int().optional(),
  weight: z.number().nonnegative().optional(),
  maxImpressions: z.number().int().positive().nullable().optional(),
  frequencyCapPerDay: z.number().int().positive().nullable().optional(),
  publish: z.boolean().optional(),
});

export const contentBlockUpdateSchema = contentBlockCreateSchema.partial();

export const contentBlockStatusSchema = z.object({
  status: z.enum(CONTENT_BLOCK_STATUSES),
});

export const trackContentBlockSchema = z.object({
  event: z.enum(['impression', 'click']),
});
