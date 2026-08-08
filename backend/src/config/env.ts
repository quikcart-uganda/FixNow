import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const boolish = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Deployment environment for feature-flag decisions. NODE_ENV stays a Node concern
   * (development | test | production) while APP_ENV can additionally describe staging.
   * Production is always derived from either value, so a staging build can never
   * accidentally unlock development behaviour on a production host.
   */
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).optional(),
  /** Development feature flags — every one of these is forced off in production. */
  ENABLE_DEV_OTP: boolish,
  ENABLE_DEV_LOGIN: boolish,
  ENABLE_TEST_USERS: boolish,
  ENABLE_DEBUG_MODE: boolish,
  ENABLE_MOCK_PROVIDERS: boolish,
  ENABLE_DEVELOPMENT_MODE: boolish,
  /**
   * Allow demo/seed admin emails (@fixnow.demo) to sign in.
   * Forced off in production. Local seeds require this or APP_ENV=development.
   */
  ALLOW_DEV_ADMIN_LOGIN: boolish,
  /** One-time bootstrap: email for first Super Admin (CLI only). */
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_NAME: z.string().min(2).max(120).optional(),
  /** Prefer interactive CLI; env password is accepted only outside production. */
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).max(128).optional(),
  ADMIN_INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72),
  ADMIN_FRONTEND_URL: z.string().url().optional(),
  ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
  ADMIN_REQUIRE_MFA: boolish,
  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * Bind address for the HTTP server.
   * Use 0.0.0.0 in development so phones on the same LAN can reach the API.
   * Override with HOST=127.0.0.1 only when you intentionally want loopback-only.
   */
  HOST: z.string().min(1).default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),
  APP_NAME: z.string().default('FixNow API'),
  APP_VERSION: z.string().default('1.0.0'),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_REMEMBER_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  /** Anonymous / unauthenticated API budget per IP per window. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /**
   * Authenticated SPA budget (Bearer present). Admin Command Center mounts
   * many parallel GETs; 200/15m was too low and produced cascading 429s.
   */
  RATE_LIMIT_MAX_AUTHENTICATED: z.coerce.number().int().positive().default(2_000),
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  UPLOAD_DIR: z.string().default('uploads'),
  /** auto | local | cloudinary — auto uses Cloudinary when credentials are complete */
  MEDIA_STORAGE_PROVIDER: z.enum(['auto', 'local', 'cloudinary']).default('auto'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_PRESET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().optional(),
  COOKIE_SECURE: boolish,
  AUTH_COOKIE_ENABLED: boolish,
  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  AUTH_EXPOSE_OTP: boolish,
  EMAIL_PROVIDER: z.enum(['console', 'resend', 'smtp']).default('console'),
  SMS_PROVIDER: z.enum(['console', 'twilio', 'africastalking']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  AFRICASTALKING_API_KEY: z.string().optional(),
  AFRICASTALKING_USERNAME: z.string().optional(),
  AFRICASTALKING_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_REPLY_TO: z.string().optional(),
  SMTP_SECURE: boolish,
  SMTP_IGNORE_TLS: boolish,
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  SMTP_GREETING_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  PUSH_PROVIDER: z.enum(['console', 'fcm']).default('console'),
  FCM_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  PUSH_RETRY_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  REVIEW_EDIT_WINDOW_MS: z.coerce.number().int().positive().default(86_400_000),
  MESSAGE_EDIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  TRACKING_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  PAYMENT_DEFAULT_PROVIDER: z
    .enum(['console', 'mtn', 'airtel', 'flutterwave', 'pesapal', 'stripe'])
    .default('console'),
  PAYMENTS_LIVE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  ESCROW_AUTO_RELEASE_MS: z.coerce.number().int().nonnegative().default(0),
  /** Stripe */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MODE: z.enum(['sandbox', 'live']).optional(),
  /** Flutterwave */
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_HASH: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().optional(),
  FLUTTERWAVE_BASE_URL: z.string().optional(),
  FLUTTERWAVE_REDIRECT_URL: z.string().optional(),
  FLUTTERWAVE_MODE: z.enum(['sandbox', 'live']).optional(),
  /** Pesapal */
  PESAPAL_CONSUMER_KEY: z.string().optional(),
  PESAPAL_CONSUMER_SECRET: z.string().optional(),
  PESAPAL_IPN_ID: z.string().optional(),
  PESAPAL_IPN_SECRET: z.string().optional(),
  PESAPAL_CALLBACK_URL: z.string().optional(),
  PESAPAL_BASE_URL: z.string().optional(),
  PESAPAL_ENV: z.enum(['sandbox', 'live']).optional(),
  /** MTN MoMo */
  MTN_MOMO_SUBSCRIPTION_KEY: z.string().optional(),
  MTN_MOMO_API_USER: z.string().optional(),
  MTN_MOMO_API_KEY: z.string().optional(),
  MTN_MOMO_TARGET_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),
  MTN_MOMO_CALLBACK_HOST: z.string().optional(),
  MTN_MOMO_CURRENCY: z.string().optional(),
  MTN_MOMO_BASE_URL: z.string().optional(),
  MTN_MOMO_WEBHOOK_SECRET: z.string().optional(),
  /** Airtel Money */
  AIRTEL_MONEY_CLIENT_ID: z.string().optional(),
  AIRTEL_MONEY_CLIENT_SECRET: z.string().optional(),
  AIRTEL_MONEY_API_KEY: z.string().optional(),
  AIRTEL_MONEY_ENV: z.enum(['sandbox', 'production']).optional(),
  AIRTEL_MONEY_COUNTRY: z.string().optional(),
  AIRTEL_MONEY_CURRENCY: z.string().optional(),
  AIRTEL_MONEY_BASE_URL: z.string().optional(),
  AIRTEL_MONEY_WEBHOOK_SECRET: z.string().optional(),
  AIRTEL_MONEY_DISBURSEMENT_PIN: z.string().optional(),
  AI_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  AI_PROVIDER: z.enum(['console', 'openai', 'gemini']).default('console'),
  AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_MODEL_OPENAI: z.string().optional(),
  AI_MODEL_GEMINI: z.string().optional(),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_PROVIDER_RETRY_COUNT: z.coerce.number().int().min(0).max(2).default(1),
  AI_CONVERSATION_HISTORY_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  AI_HISTORY_LIMIT: z.coerce.number().int().positive().default(12),
  AI_CUSTOMER_ASSISTANT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  AI_TECHNICIAN_ASSISTANT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  AI_ADMIN_ASSISTANT_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  SENTRY_DSN: z.string().optional(),
  /** Google Maps Platform — server key for Geocoding, Places, Directions, Distance Matrix. */
  GOOGLE_MAPS_SERVER_API_KEY: z.string().optional(),
  /** Optional alias / shared key when a dedicated server key is not yet provisioned. */
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_AUTH_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

function paymentProviderConfigured(
  cfg: typeof data,
  id: (typeof data)['PAYMENT_DEFAULT_PROVIDER'],
): boolean {
  switch (id) {
    case 'console':
      return true;
    case 'stripe':
      return Boolean(cfg.STRIPE_SECRET_KEY);
    case 'flutterwave':
      return Boolean(cfg.FLUTTERWAVE_SECRET_KEY);
    case 'pesapal':
      return Boolean(cfg.PESAPAL_CONSUMER_KEY && cfg.PESAPAL_CONSUMER_SECRET);
    case 'mtn':
      return Boolean(cfg.MTN_MOMO_SUBSCRIPTION_KEY && cfg.MTN_MOMO_API_USER && cfg.MTN_MOMO_API_KEY);
    case 'airtel':
      return Boolean(cfg.AIRTEL_MONEY_CLIENT_ID && cfg.AIRTEL_MONEY_CLIENT_SECRET);
    default:
      return false;
  }
}

function assertProviderGuards(cfg: typeof data) {
  const problems: string[] = [];

  if (cfg.EMAIL_PROVIDER === 'resend' && !cfg.RESEND_API_KEY) {
    problems.push('EMAIL_PROVIDER=resend requires RESEND_API_KEY');
  }
  if (cfg.EMAIL_PROVIDER === 'smtp') {
    if (!cfg.SMTP_HOST) {
      problems.push('EMAIL_PROVIDER=smtp requires SMTP_HOST');
    }
    if (cfg.NODE_ENV === 'production' && !(cfg.SMTP_PASSWORD || cfg.SMTP_PASS || cfg.SMTP_USER)) {
      problems.push('EMAIL_PROVIDER=smtp in production typically requires SMTP_USER and SMTP_PASSWORD');
    }
  }
  if (cfg.MEDIA_STORAGE_PROVIDER === 'cloudinary') {
    if (!cfg.CLOUDINARY_CLOUD_NAME || !cfg.CLOUDINARY_API_KEY || !cfg.CLOUDINARY_API_SECRET) {
      problems.push(
        'MEDIA_STORAGE_PROVIDER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET',
      );
    }
  }
  if (cfg.GOOGLE_AUTH_ENABLED && !(cfg.PUBLIC_GOOGLE_CLIENT_ID || cfg.GOOGLE_CLIENT_ID)) {
    problems.push('GOOGLE_AUTH_ENABLED=true requires GOOGLE_CLIENT_ID or PUBLIC_GOOGLE_CLIENT_ID');
  }
  if (cfg.AI_ENABLED && cfg.AI_PROVIDER === 'openai' && !(cfg.OPENAI_API_KEY || cfg.AI_API_KEY)) {
    problems.push('AI_ENABLED with AI_PROVIDER=openai requires OPENAI_API_KEY or AI_API_KEY');
  }
  if (
    cfg.AI_ENABLED &&
    cfg.AI_PROVIDER === 'gemini' &&
    !(cfg.GEMINI_API_KEY || cfg.GOOGLE_AI_API_KEY || cfg.AI_API_KEY)
  ) {
    problems.push('AI_ENABLED with AI_PROVIDER=gemini requires GEMINI_API_KEY, GOOGLE_AI_API_KEY, or AI_API_KEY');
  }
  if (cfg.PUSH_PROVIDER === 'fcm' && cfg.FCM_ENABLED && !cfg.FIREBASE_PROJECT_ID && !cfg.FIREBASE_SERVICE_ACCOUNT_JSON) {
    problems.push('FCM is enabled but Firebase credentials are missing (FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_JSON)');
  }
  if (cfg.PAYMENTS_LIVE && cfg.PAYMENT_DEFAULT_PROVIDER !== 'console') {
    if (!paymentProviderConfigured(cfg, cfg.PAYMENT_DEFAULT_PROVIDER)) {
      problems.push(
        `PAYMENTS_LIVE=true with PAYMENT_DEFAULT_PROVIDER=${cfg.PAYMENT_DEFAULT_PROVIDER} but required credentials are missing`,
      );
    }
  }

  if (problems.length) {
    console.error('Environment provider guards failed:\n- ' + problems.join('\n- '));
    process.exit(1);
  }
}

function resolveAppEnv(cfg: typeof data): 'development' | 'staging' | 'production' | 'test' {
  if (cfg.NODE_ENV === 'production') return 'production';
  if (cfg.APP_ENV) return cfg.APP_ENV === 'production' ? 'production' : cfg.APP_ENV;
  return cfg.NODE_ENV;
}

function assertProductionGuards(cfg: typeof data) {
  if (resolveAppEnv(cfg) !== 'production') return;
  const problems: string[] = [];

  if (cfg.AUTH_EXPOSE_OTP === true) {
    problems.push('AUTH_EXPOSE_OTP must not be true in production');
  }
  if (cfg.ENABLE_DEV_OTP === true) {
    problems.push('ENABLE_DEV_OTP must not be true in production');
  }
  if (cfg.ENABLE_DEV_LOGIN === true) {
    problems.push('ENABLE_DEV_LOGIN must not be true in production');
  }
  if (cfg.ENABLE_TEST_USERS === true) {
    problems.push('ENABLE_TEST_USERS must not be true in production');
  }
  if (cfg.ENABLE_MOCK_PROVIDERS === true) {
    problems.push('ENABLE_MOCK_PROVIDERS must not be true in production');
  }
  if (cfg.ENABLE_DEBUG_MODE === true) {
    problems.push('ENABLE_DEBUG_MODE must not be true in production');
  }
  if (cfg.ENABLE_DEVELOPMENT_MODE === true) {
    problems.push('ENABLE_DEVELOPMENT_MODE must not be true in production');
  }
  if (cfg.ALLOW_DEV_ADMIN_LOGIN === true) {
    problems.push('ALLOW_DEV_ADMIN_LOGIN must not be true in production');
  }
  if (cfg.ADMIN_BOOTSTRAP_PASSWORD) {
    problems.push('ADMIN_BOOTSTRAP_PASSWORD must not be set in production (use interactive CLI)');
  }
  if (cfg.EMAIL_PROVIDER === 'console') {
    problems.push('EMAIL_PROVIDER=console is not allowed in production (use resend or smtp)');
  }
  if (cfg.SMS_PROVIDER === 'console') {
    problems.push('SMS_PROVIDER=console is not allowed in production (use twilio or africastalking)');
  }
  if (cfg.SMS_PROVIDER === 'twilio') {
    if (!cfg.TWILIO_ACCOUNT_SID || !cfg.TWILIO_AUTH_TOKEN || !cfg.TWILIO_FROM_NUMBER) {
      problems.push('SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER');
    }
  }
  if (cfg.SMS_PROVIDER === 'africastalking') {
    if (!cfg.AFRICASTALKING_API_KEY || !cfg.AFRICASTALKING_USERNAME) {
      problems.push("SMS_PROVIDER=africastalking requires AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME");
    }
  }
  if (cfg.PAYMENTS_LIVE === true && (!cfg.PAYMENT_WEBHOOK_SECRET || cfg.PAYMENT_WEBHOOK_SECRET.length < 16)) {
    problems.push('PAYMENTS_LIVE=true requires PAYMENT_WEBHOOK_SECRET (min 16 chars)');
  }
  if (
    /change-me|min-32-chars|example|YOUR_/i.test(cfg.JWT_ACCESS_SECRET) ||
    /change-me|min-32-chars|example|YOUR_/i.test(cfg.JWT_REFRESH_SECRET)
  ) {
    problems.push('JWT secrets still contain placeholder values');
  }
  const origins = cfg.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (!origins.length) {
    problems.push('CORS_ORIGINS must list at least one production origin');
  }
  if (origins.some((o) => /localhost|127\.0\.0\.1/i.test(o))) {
    problems.push('CORS_ORIGINS must not include localhost in production');
  }
  if (cfg.PUSH_PROVIDER === 'fcm' && cfg.FCM_ENABLED && !cfg.FIREBASE_PROJECT_ID && !cfg.FIREBASE_SERVICE_ACCOUNT_JSON) {
    problems.push('FCM is enabled but Firebase credentials are missing');
  }
  if (cfg.CLOUDINARY_CLOUD_NAME && (!cfg.CLOUDINARY_API_KEY || !cfg.CLOUDINARY_API_SECRET)) {
    problems.push('CLOUDINARY_CLOUD_NAME is set but CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are incomplete');
  }
  if (cfg.MEDIA_STORAGE_PROVIDER === 'auto' && !cfg.CLOUDINARY_CLOUD_NAME) {
    console.warn(
      '[env] Production tip: MEDIA_STORAGE_PROVIDER=auto without Cloudinary credentials — uploads will use local disk. Set Cloudinary credentials for official media storage.',
    );
  }

  if (problems.length) {
    console.error('Production environment guards failed:\n- ' + problems.join('\n- '));
    process.exit(1);
  }
}

assertProviderGuards(data);
assertProductionGuards(data);

const appEnv = resolveAppEnv(data);
const isProductionEnv = appEnv === 'production';

/**
 * Environment-level defaults for the development feature flags. Admin-managed
 * overrides are layered on top of these by the dev-controls service, and
 * production forces every flag off regardless of either source.
 */
export const DEV_FLAG_DEFAULTS = {
  enableDevOtp: isProductionEnv
    ? false
    : data.ENABLE_DEV_OTP ?? data.AUTH_EXPOSE_OTP ?? appEnv === 'development',
  enableDevLogin: isProductionEnv ? false : data.ENABLE_DEV_LOGIN ?? false,
  enableTestAccounts: isProductionEnv ? false : data.ENABLE_TEST_USERS ?? false,
  enableMockProviders: isProductionEnv ? false : data.ENABLE_MOCK_PROVIDERS ?? false,
  enableDebugLogs: isProductionEnv ? false : data.ENABLE_DEBUG_MODE ?? false,
  enableDevelopmentMode: isProductionEnv ? false : data.ENABLE_DEVELOPMENT_MODE ?? appEnv === 'development',
} as const;

export type DevFlagKey = keyof typeof DEV_FLAG_DEFAULTS;

export const env = {
  ...data,
  corsOrigins: data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  appEnv,
  isProduction: data.NODE_ENV === 'production',
  isProductionEnv,
  isStaging: appEnv === 'staging',
  isDevelopment: data.NODE_ENV === 'development',
  /** Env-level OTP exposure default. Effective value comes from the dev-controls service. */
  exposeOtp: DEV_FLAG_DEFAULTS.enableDevOtp,
  /**
   * Demo admin login (@fixnow.demo) — development/staging only.
   * Production guards refuse ALLOW_DEV_ADMIN_LOGIN=true.
   */
  allowDevAdminLogin: isProductionEnv
    ? false
    : data.ALLOW_DEV_ADMIN_LOGIN ?? (appEnv === 'development' || data.ENABLE_TEST_USERS === true),
  adminInviteTtlHours: data.ADMIN_INVITE_TTL_HOURS ?? 72,
  adminFrontendUrl: data.ADMIN_FRONTEND_URL || data.CORS_ORIGINS.split(',')[0]?.trim() || 'http://localhost:5173',
  adminSessionIdleMinutes: data.ADMIN_SESSION_IDLE_MINUTES ?? 60,
  adminRequireMfa: isProductionEnv ? Boolean(data.ADMIN_REQUIRE_MFA) : Boolean(data.ADMIN_REQUIRE_MFA),
};

export type Env = typeof env;
