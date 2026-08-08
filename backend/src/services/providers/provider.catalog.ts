/**
 * Provider catalog — declarative registry of every FixNow integration type.
 * Credentials always come from environment variables (never stored here).
 */

export type ProviderType =
  | 'ai'
  | 'email'
  | 'sms'
  | 'maps'
  | 'push'
  | 'monitoring'
  | 'storage'
  | 'payments'
  | 'analytics'
  | 'search'
  | 'captcha';

export type ProviderImplementationStatus = 'implemented' | 'planned';

export interface ProviderDefinition {
  type: ProviderType;
  id: string;
  label: string;
  /** Env keys that must be present for "configured" (empty for none/console). */
  requiredEnv: string[];
  /** Additional optional env keys shown in guidance. */
  optionalEnv?: string[];
  /** Env var that selects this provider when no DB override exists. */
  envSelector?: string;
  /** Values of envSelector that map to this id. */
  envSelectorValues?: string[];
  status: ProviderImplementationStatus;
  /** True when selecting this id disables the integration. */
  isNone?: boolean;
  /** Human guidance for admins. */
  guidance: string;
  /** Restart may be required after activation (rare). */
  requiresRestart?: boolean;
  /** Optional secondary/failover peer type (same ProviderType). */
  supportsFailover?: boolean;
}

export const PROVIDER_TYPES: Array<{ type: ProviderType; label: string; description: string }> = [
  { type: 'ai', label: 'AI', description: 'Assistants, transcription, and generative features' },
  { type: 'email', label: 'Email', description: 'Transactional email and OTP delivery' },
  { type: 'sms', label: 'SMS', description: 'SMS OTP and alerts' },
  { type: 'maps', label: 'Maps', description: 'Maps, geocoding, and live tracking visuals' },
  { type: 'push', label: 'Push', description: 'Mobile and web push notifications' },
  { type: 'monitoring', label: 'Monitoring', description: 'Error tracking and performance' },
  { type: 'storage', label: 'Storage', description: 'Media uploads and CDN delivery' },
  { type: 'payments', label: 'Payments', description: 'Collections, escrow, and payouts' },
  { type: 'analytics', label: 'Analytics', description: 'Product analytics vendors' },
  { type: 'search', label: 'Search', description: 'External search / discovery (optional)' },
  { type: 'captcha', label: 'CAPTCHA', description: 'Bot protection on public forms' },
];

export const PROVIDER_CATALOG: ProviderDefinition[] = [
  // —— AI ——
  {
    type: 'ai',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    supportsFailover: true,
    guidance: 'Disables external LLMs. Assistants use FixNow local knowledge and tools only.',
  },
  {
    type: 'ai',
    id: 'console',
    label: 'Console (local)',
    requiredEnv: [],
    envSelector: 'AI_PROVIDER',
    envSelectorValues: ['console'],
    status: 'implemented',
    guidance: 'Development stub — no external AI calls. Equivalent to None for production.',
  },
  {
    type: 'ai',
    id: 'openai',
    label: 'OpenAI',
    requiredEnv: ['OPENAI_API_KEY'],
    optionalEnv: ['AI_API_KEY', 'AI_MODEL_OPENAI', 'AI_MODEL', 'AI_REQUEST_TIMEOUT_MS'],
    envSelector: 'AI_PROVIDER',
    envSelectorValues: ['openai'],
    status: 'implemented',
    supportsFailover: true,
    guidance: 'Requires OPENAI_API_KEY. Also set AI_ENABLED=true.',
  },
  {
    type: 'ai',
    id: 'gemini',
    label: 'Google Gemini',
    requiredEnv: ['GEMINI_API_KEY'],
    optionalEnv: ['GOOGLE_AI_API_KEY', 'AI_API_KEY', 'AI_MODEL_GEMINI'],
    envSelector: 'AI_PROVIDER',
    envSelectorValues: ['gemini'],
    status: 'implemented',
    supportsFailover: true,
    guidance: 'Requires GEMINI_API_KEY or GOOGLE_AI_API_KEY. Set AI_ENABLED=true.',
  },
  {
    type: 'ai',
    id: 'anthropic',
    label: 'Anthropic',
    requiredEnv: ['ANTHROPIC_API_KEY'],
    status: 'planned',
    guidance: 'Planned. Add ANTHROPIC_API_KEY when the adapter ships.',
  },
  {
    type: 'ai',
    id: 'azure_openai',
    label: 'Azure OpenAI',
    requiredEnv: ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY'],
    status: 'planned',
    guidance: 'Planned. Requires Azure OpenAI endpoint and key.',
  },
  {
    type: 'ai',
    id: 'ollama',
    label: 'Ollama',
    requiredEnv: ['OLLAMA_BASE_URL'],
    status: 'planned',
    guidance: 'Planned local/self-hosted LLM via OLLAMA_BASE_URL.',
  },

  // —— Email ——
  {
    type: 'email',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'Disables outbound email. OTP/email flows log to console only.',
  },
  {
    type: 'email',
    id: 'console',
    label: 'Console',
    requiredEnv: [],
    envSelector: 'EMAIL_PROVIDER',
    envSelectorValues: ['console'],
    status: 'implemented',
    guidance: 'Logs emails instead of sending. Not allowed as production default.',
  },
  {
    type: 'email',
    id: 'resend',
    label: 'Resend',
    requiredEnv: ['RESEND_API_KEY'],
    optionalEnv: ['EMAIL_FROM'],
    envSelector: 'EMAIL_PROVIDER',
    envSelectorValues: ['resend'],
    status: 'implemented',
    guidance: 'Requires RESEND_API_KEY. Set EMAIL_FROM to a verified sender.',
  },
  {
    type: 'email',
    id: 'smtp',
    label: 'SMTP',
    requiredEnv: ['SMTP_HOST'],
    optionalEnv: ['SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_SECURE'],
    envSelector: 'EMAIL_PROVIDER',
    envSelectorValues: ['smtp'],
    status: 'implemented',
    guidance: 'Generic SMTP. SMTP_HOST required; auth optional depending on relay.',
  },
  {
    type: 'email',
    id: 'sendgrid',
    label: 'SendGrid',
    requiredEnv: ['SENDGRID_API_KEY'],
    status: 'planned',
    guidance: 'Planned. Set SENDGRID_API_KEY when adapter is available.',
  },
  {
    type: 'email',
    id: 'mailgun',
    label: 'Mailgun',
    requiredEnv: ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN'],
    status: 'planned',
    guidance: 'Planned.',
  },
  {
    type: 'email',
    id: 'ses',
    label: 'Amazon SES',
    requiredEnv: ['AWS_SES_ACCESS_KEY', 'AWS_SES_SECRET_KEY', 'AWS_SES_REGION'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— SMS ——
  {
    type: 'sms',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'Disables SMS delivery.',
  },
  {
    type: 'sms',
    id: 'console',
    label: 'Console',
    requiredEnv: [],
    envSelector: 'SMS_PROVIDER',
    envSelectorValues: ['console'],
    status: 'implemented',
    guidance: 'Logs SMS payloads. Development/staging only — blocked in production.',
  },
  {
    type: 'sms',
    id: 'twilio',
    label: 'Twilio',
    requiredEnv: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    envSelector: 'SMS_PROVIDER',
    envSelectorValues: ['twilio'],
    status: 'implemented',
    guidance: 'Commercial SMS via Twilio Programmable Messaging.',
  },
  {
    type: 'sms',
    id: 'africastalking',
    label: "Africa's Talking",
    requiredEnv: ['AFRICASTALKING_API_KEY', 'AFRICASTALKING_USERNAME'],
    envSelector: 'SMS_PROVIDER',
    envSelectorValues: ['africastalking'],
    status: 'implemented',
    guidance: 'Commercial SMS via Africa’s Talking (recommended for East Africa). Optional AFRICASTALKING_FROM.',
  },
  {
    type: 'sms',
    id: 'infobip',
    label: 'Infobip',
    requiredEnv: ['INFOBIP_API_KEY', 'INFOBIP_BASE_URL'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— Maps / Location Platform ——
  {
    type: 'maps',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'Disables Google Maps. Location Platform falls back to Nominatim then Haversine.',
  },
  {
    type: 'maps',
    id: 'google',
    label: 'Google Maps Platform (Primary)',
    requiredEnv: ['GOOGLE_MAPS_SERVER_API_KEY'],
    optionalEnv: ['VITE_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY'],
    status: 'implemented',
    supportsFailover: true,
    guidance:
      'Official FixNow location provider. Set GOOGLE_MAPS_SERVER_API_KEY for Geocoding, Places, Directions, Distance Matrix. VITE_GOOGLE_MAPS_API_KEY for map tiles (frontend). Nominatim/Haversine are emergency fallbacks only.',
    requiresRestart: false,
  },
  {
    type: 'maps',
    id: 'nominatim',
    label: 'Nominatim (Emergency Fallback)',
    requiredEnv: [],
    status: 'implemented',
    guidance:
      'OpenStreetMap Nominatim — activated ONLY after Google retries fail. Not an alternative for normal operation.',
  },
  {
    type: 'maps',
    id: 'haversine',
    label: 'Haversine (Last Resort)',
    requiredEnv: [],
    status: 'implemented',
    guidance:
      'Local distance approximation only. Never used for routing, traffic, turn-by-turn, or distance billing.',
  },
  {
    type: 'maps',
    id: 'mapbox',
    label: 'Mapbox',
    requiredEnv: ['VITE_MAPBOX_ACCESS_TOKEN'],
    status: 'planned',
    guidance: 'Not used. Google remains the official primary provider.',
  },
  {
    type: 'maps',
    id: 'here',
    label: 'HERE',
    requiredEnv: ['HERE_API_KEY'],
    status: 'planned',
    guidance: 'Not used. Google remains the official primary provider.',
  },
  {
    type: 'maps',
    id: 'osm',
    label: 'OpenStreetMap tiles',
    requiredEnv: [],
    status: 'planned',
    guidance: 'Tile layer only if ever needed. Geocoding fallback is Nominatim via Location Platform.',
  },

  // —— Push ——
  {
    type: 'push',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'Push disabled — notifications stay in-app only.',
  },
  {
    type: 'push',
    id: 'console',
    label: 'Console',
    requiredEnv: [],
    envSelector: 'PUSH_PROVIDER',
    envSelectorValues: ['console'],
    status: 'implemented',
    guidance: 'Logs push payloads.',
  },
  {
    type: 'push',
    id: 'fcm',
    label: 'Firebase Cloud Messaging',
    requiredEnv: ['FIREBASE_PROJECT_ID'],
    optionalEnv: [
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      'FCM_ENABLED',
      'VITE_FCM_VAPID_KEY',
    ],
    envSelector: 'PUSH_PROVIDER',
    envSelectorValues: ['fcm'],
    status: 'implemented',
    guidance: 'Requires Firebase project credentials. Native apps also need google-services.json.',
  },
  {
    type: 'push',
    id: 'onesignal',
    label: 'OneSignal',
    requiredEnv: ['ONESIGNAL_APP_ID', 'ONESIGNAL_API_KEY'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— Monitoring ——
  {
    type: 'monitoring',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'No external error monitoring. Structured logs only.',
  },
  {
    type: 'monitoring',
    id: 'sentry',
    label: 'Sentry',
    requiredEnv: ['SENTRY_DSN'],
    optionalEnv: ['VITE_SENTRY_DSN'],
    status: 'implemented',
    guidance: 'Optional @sentry/node and @sentry/react. Set SENTRY_DSN / VITE_SENTRY_DSN.',
    requiresRestart: true,
  },
  {
    type: 'monitoring',
    id: 'bugsnag',
    label: 'Bugsnag',
    requiredEnv: ['BUGSNAG_API_KEY'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— Storage ——
  {
    type: 'storage',
    id: 'none',
    label: 'None / Local disk',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'Uses local UPLOAD_DIR only — not ideal for multi-instance production.',
  },
  {
    type: 'storage',
    id: 'local',
    label: 'Local disk',
    requiredEnv: [],
    optionalEnv: ['UPLOAD_DIR', 'UPLOAD_MAX_FILE_SIZE_MB'],
    envSelector: 'MEDIA_STORAGE_PROVIDER',
    envSelectorValues: ['local'],
    status: 'implemented',
    guidance: 'Stores files under UPLOAD_DIR.',
  },
  {
    type: 'storage',
    id: 'cloudinary',
    label: 'Cloudinary',
    requiredEnv: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
    optionalEnv: ['CLOUDINARY_FOLDER', 'CLOUDINARY_UPLOAD_PRESET'],
    envSelector: 'MEDIA_STORAGE_PROVIDER',
    envSelectorValues: ['cloudinary', 'auto'],
    status: 'implemented',
    guidance: 'Recommended production media CDN.',
  },
  {
    type: 'storage',
    id: 's3',
    label: 'AWS S3',
    requiredEnv: ['AWS_S3_BUCKET', 'AWS_S3_ACCESS_KEY', 'AWS_S3_SECRET_KEY', 'AWS_S3_REGION'],
    status: 'planned',
    guidance: 'Planned.',
  },
  {
    type: 'storage',
    id: 'r2',
    label: 'Cloudflare R2',
    requiredEnv: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— Payments ——
  {
    type: 'payments',
    id: 'none',
    label: 'None / Console',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'Simulated payments only (PAYMENTS_LIVE=false behaviour).',
  },
  {
    type: 'payments',
    id: 'console',
    label: 'Console (simulated)',
    requiredEnv: [],
    envSelector: 'PAYMENT_DEFAULT_PROVIDER',
    envSelectorValues: ['console'],
    status: 'implemented',
    guidance: 'Simulated adapter for local/E2E.',
  },
  {
    type: 'payments',
    id: 'mtn',
    label: 'MTN MoMo',
    requiredEnv: ['MTN_MOMO_SUBSCRIPTION_KEY', 'MTN_MOMO_API_USER', 'MTN_MOMO_API_KEY'],
    optionalEnv: ['MTN_MOMO_TARGET_ENVIRONMENT', 'MTN_MOMO_CURRENCY', 'MTN_MOMO_BASE_URL'],
    envSelector: 'PAYMENT_DEFAULT_PROVIDER',
    envSelectorValues: ['mtn'],
    status: 'implemented',
    guidance: 'Set PAYMENTS_LIVE=true for live collections.',
  },
  {
    type: 'payments',
    id: 'airtel',
    label: 'Airtel Money',
    requiredEnv: ['AIRTEL_MONEY_CLIENT_ID', 'AIRTEL_MONEY_CLIENT_SECRET'],
    optionalEnv: ['AIRTEL_MONEY_API_KEY', 'AIRTEL_MONEY_ENV', 'AIRTEL_MONEY_CURRENCY'],
    envSelector: 'PAYMENT_DEFAULT_PROVIDER',
    envSelectorValues: ['airtel'],
    status: 'implemented',
    guidance: 'Set PAYMENTS_LIVE=true for live collections.',
  },
  {
    type: 'payments',
    id: 'flutterwave',
    label: 'Flutterwave',
    requiredEnv: ['FLUTTERWAVE_SECRET_KEY'],
    optionalEnv: ['FLUTTERWAVE_PUBLIC_KEY', 'FLUTTERWAVE_SECRET_HASH'],
    envSelector: 'PAYMENT_DEFAULT_PROVIDER',
    envSelectorValues: ['flutterwave'],
    status: 'implemented',
    guidance: 'Backend adapter ready; expand checkout UI as needed.',
  },
  {
    type: 'payments',
    id: 'pesapal',
    label: 'Pesapal',
    requiredEnv: ['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET'],
    envSelector: 'PAYMENT_DEFAULT_PROVIDER',
    envSelectorValues: ['pesapal'],
    status: 'implemented',
    guidance: 'Backend adapter ready.',
  },
  {
    type: 'payments',
    id: 'stripe',
    label: 'Stripe',
    requiredEnv: ['STRIPE_SECRET_KEY'],
    optionalEnv: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_MODE'],
    envSelector: 'PAYMENT_DEFAULT_PROVIDER',
    envSelectorValues: ['stripe'],
    status: 'implemented',
    guidance: 'Backend adapter ready.',
  },
  {
    type: 'payments',
    id: 'dpo',
    label: 'DPO',
    requiredEnv: ['DPO_COMPANY_TOKEN'],
    status: 'planned',
    guidance: 'Planned.',
  },
  {
    type: 'payments',
    id: 'paypal',
    label: 'PayPal',
    requiredEnv: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— Analytics ——
  {
    type: 'analytics',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'First-party FixNow analytics only (no third-party SDK).',
  },
  {
    type: 'analytics',
    id: 'ga',
    label: 'Google Analytics',
    requiredEnv: ['VITE_GA_MEASUREMENT_ID'],
    status: 'planned',
    guidance: 'Planned frontend measurement ID.',
  },
  {
    type: 'analytics',
    id: 'posthog',
    label: 'PostHog',
    requiredEnv: ['VITE_POSTHOG_KEY', 'VITE_POSTHOG_HOST'],
    status: 'planned',
    guidance: 'Planned.',
  },
  {
    type: 'analytics',
    id: 'plausible',
    label: 'Plausible',
    requiredEnv: ['VITE_PLAUSIBLE_DOMAIN'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— Search ——
  {
    type: 'search',
    id: 'none',
    label: 'None (MongoDB)',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'Uses built-in MongoDB / API search.',
  },
  {
    type: 'search',
    id: 'algolia',
    label: 'Algolia',
    requiredEnv: ['ALGOLIA_APP_ID', 'ALGOLIA_API_KEY'],
    status: 'planned',
    guidance: 'Planned.',
  },

  // —— CAPTCHA ——
  {
    type: 'captcha',
    id: 'none',
    label: 'None',
    requiredEnv: [],
    status: 'implemented',
    isNone: true,
    guidance: 'No bot challenge on public forms.',
  },
  {
    type: 'captcha',
    id: 'recaptcha',
    label: 'Google reCAPTCHA',
    requiredEnv: ['RECAPTCHA_SECRET_KEY', 'VITE_RECAPTCHA_SITE_KEY'],
    status: 'planned',
    guidance: 'Planned.',
  },
  {
    type: 'captcha',
    id: 'turnstile',
    label: 'Cloudflare Turnstile',
    requiredEnv: ['TURNSTILE_SECRET_KEY', 'VITE_TURNSTILE_SITE_KEY'],
    status: 'planned',
    guidance: 'Planned.',
  },
];

export function providersForType(type: ProviderType): ProviderDefinition[] {
  return PROVIDER_CATALOG.filter((p) => p.type === type);
}

export function findProviderDef(type: ProviderType, id: string): ProviderDefinition | undefined {
  return PROVIDER_CATALOG.find((p) => p.type === type && p.id === id);
}
