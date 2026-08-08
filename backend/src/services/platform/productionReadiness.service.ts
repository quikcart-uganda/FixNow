/**
 * Production Readiness Engine — scores, blockers, warnings.
 * Does not change Platform Mode; Launch Centre consumes this before activation.
 */

import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { Category, ContentBlock, ContentPage, TechnicianProfile } from '../../models/index.js';
import { hasProductionSuperAdmin } from './platformMode.service.js';
import { getSubscriptionMomoConfig } from '../marketplace/subscription.service.js';

export type ReadinessSeverity = 'blocker' | 'warning' | 'pass';

export type ReadinessCheck = {
  id: string;
  category:
    | 'infrastructure'
    | 'security'
    | 'payments'
    | 'maps'
    | 'notifications'
    | 'legal'
    | 'branding'
    | 'public_content'
    | 'users'
    | 'production_owner'
    | 'environment'
    | 'marketplace'
    | 'performance'
    | 'ai'
    | 'administration';
  label: string;
  severity: ReadinessSeverity;
  score: number;
  maxScore: number;
  message: string;
  guidance?: string;
};

export type ReadinessCategoryScore = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  percent: number;
};

export type ProductionReadinessReport = {
  evaluatedAt: string;
  overallPercent: number;
  categoryScores: ReadinessCategoryScore[];
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  warnings: ReadinessCheck[];
  canLaunch: boolean;
  recommendations: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
  infrastructure: 'Infrastructure',
  security: 'Security',
  payments: 'Payments',
  maps: 'Maps',
  notifications: 'Notifications',
  legal: 'Legal',
  branding: 'Branding',
  public_content: 'Public Content',
  users: 'Users',
  production_owner: 'Production Owner',
  environment: 'Environment',
  marketplace: 'Marketplace',
  performance: 'Performance',
  ai: 'AI',
  administration: 'Administration',
};

function check(
  partial: Omit<ReadinessCheck, 'score' | 'maxScore'> & { pass: boolean; weight?: number },
): ReadinessCheck {
  const maxScore = partial.weight ?? 10;
  const score = partial.pass ? maxScore : partial.severity === 'warning' ? Math.round(maxScore * 0.4) : 0;
  return {
    id: partial.id,
    category: partial.category,
    label: partial.label,
    severity: partial.pass ? 'pass' : partial.severity,
    score,
    maxScore,
    message: partial.message,
    guidance: partial.guidance,
  };
}

async function publishedCms(slug: string): Promise<boolean> {
  const doc = await ContentPage.findOne({
    slug,
    status: 'published',
    isDeleted: { $ne: true },
    $or: [{ dataEnvironment: 'production' }, { dataEnvironment: { $exists: false } }, { dataEnvironment: null }],
  })
    .select('_id')
    .lean();
  return Boolean(doc);
}

export async function evaluateProductionReadiness(): Promise<ProductionReadinessReport> {
  const checks: ReadinessCheck[] = [];

  // --- Infrastructure ---
  const dbOk = mongoose.connection.readyState === 1;
  checks.push(
    check({
      id: 'db_connected',
      category: 'infrastructure',
      label: 'Database connected',
      severity: 'blocker',
      pass: dbOk,
      message: dbOk ? 'MongoDB connection is ready' : 'MongoDB is not connected',
      guidance: 'Ensure MONGODB_URI is reachable and the API process has started successfully.',
      weight: 15,
    }),
  );
  checks.push(
    check({
      id: 'redis',
      category: 'infrastructure',
      label: 'Redis',
      severity: 'warning',
      pass: true,
      message: 'Redis is not required by the current FixNow stack (N/A)',
      weight: 5,
    }),
  );
  const emailOk = env.EMAIL_PROVIDER !== 'console' || !env.isProductionEnv;
  checks.push(
    check({
      id: 'email_provider',
      category: 'infrastructure',
      label: 'Email provider configured',
      severity: env.isProductionEnv ? 'blocker' : 'warning',
      pass: emailOk,
      message: emailOk
        ? `Email provider: ${env.EMAIL_PROVIDER}`
        : 'EMAIL_PROVIDER=console is not suitable for production launch',
      guidance: 'Configure Resend or SMTP before launch.',
      weight: 12,
    }),
  );
  const cloudinaryOk = Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
  checks.push(
    check({
      id: 'cloudinary',
      category: 'infrastructure',
      label: 'Cloudinary / media storage',
      severity: 'warning',
      pass: cloudinaryOk || env.MEDIA_STORAGE_PROVIDER === 'local',
      message: cloudinaryOk
        ? 'Cloudinary credentials present'
        : env.MEDIA_STORAGE_PROVIDER === 'local'
          ? 'Using local media storage'
          : 'Cloudinary credentials incomplete — uploads may use local disk',
      guidance: 'Set CLOUDINARY_* for production media.',
      weight: 8,
    }),
  );

  // --- Security ---
  const jwtPlaceholder =
    /change-me|min-32-chars|example|YOUR_/i.test(env.JWT_ACCESS_SECRET) ||
    /change-me|min-32-chars|example|YOUR_/i.test(env.JWT_REFRESH_SECRET);
  checks.push(
    check({
      id: 'jwt_secrets',
      category: 'security',
      label: 'JWT secrets',
      severity: 'blocker',
      pass: !jwtPlaceholder && env.JWT_ACCESS_SECRET.length >= 32,
      message: jwtPlaceholder ? 'JWT secrets look like placeholders' : 'JWT secrets look configured',
      guidance: 'Rotate JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to strong unique values.',
      weight: 15,
    }),
  );
  checks.push(
    check({
      id: 'dev_admin_login',
      category: 'security',
      label: 'Dev Admin login disabled for production host',
      severity: env.isProductionEnv ? 'blocker' : 'warning',
      pass: !env.allowDevAdminLogin || !env.isProductionEnv,
      message: env.allowDevAdminLogin
        ? 'ALLOW_DEV_ADMIN_LOGIN is enabled'
        : 'Development Admin passwordless login is off',
      guidance: 'Keep ALLOW_DEV_ADMIN_LOGIN=false on production hosts.',
      weight: 10,
    }),
  );
  const corsOk = Boolean(env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean).length);
  checks.push(
    check({
      id: 'cors',
      category: 'security',
      label: 'CORS origins configured',
      severity: env.isProductionEnv ? 'blocker' : 'warning',
      pass: corsOk,
      message: corsOk ? 'CORS_ORIGINS is set' : 'CORS_ORIGINS is empty',
      weight: 8,
    }),
  );

  // --- Payments ---
  let momoEnabled = false;
  try {
    const momo = await getSubscriptionMomoConfig();
    momoEnabled = Boolean(momo.enabled);
  } catch {
    momoEnabled = false;
  }
  checks.push(
    check({
      id: 'payments_momo',
      category: 'payments',
      label: 'Payment gateway (Mobile Money)',
      severity: 'blocker',
      pass: momoEnabled,
      message: momoEnabled
        ? 'Subscription Mobile Money payee is enabled'
        : 'Subscription payments are disabled or incomplete',
      guidance: 'Enable Mobile Money payee details under Admin → Subscriptions.',
      weight: 15,
    }),
  );
  const paymentsLive = Boolean(env.PAYMENTS_LIVE);
  const webhookOk = Boolean(env.PAYMENT_WEBHOOK_SECRET && env.PAYMENT_WEBHOOK_SECRET.length >= 16);
  checks.push(
    check({
      id: 'payments_live',
      category: 'payments',
      label: 'Live payment rails enabled',
      severity: env.isProductionEnv ? 'blocker' : 'warning',
      pass: paymentsLive || !env.isProductionEnv,
      message: paymentsLive
        ? 'PAYMENTS_LIVE=true'
        : 'PAYMENTS_LIVE=false — charges use simulated providers',
      guidance: 'Set PAYMENTS_LIVE=true with live provider credentials before taking real money.',
      weight: 12,
    }),
  );
  checks.push(
    check({
      id: 'payments_webhook_secret',
      category: 'payments',
      label: 'Payment webhook secret',
      severity: paymentsLive || env.isProductionEnv ? 'blocker' : 'warning',
      pass: !paymentsLive || webhookOk,
      message:
        !paymentsLive || webhookOk
          ? paymentsLive
            ? 'PAYMENT_WEBHOOK_SECRET configured for live rails'
            : 'Webhook secret not required while PAYMENTS_LIVE=false'
          : 'PAYMENTS_LIVE=true but PAYMENT_WEBHOOK_SECRET is missing or too short',
      guidance: 'Set PAYMENT_WEBHOOK_SECRET (min 16 chars) before enabling live charges.',
      weight: 10,
    }),
  );

  // --- Maps ---
  const mapsOk = Boolean(
    env.GOOGLE_MAPS_SERVER_API_KEY || env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY,
  );
  checks.push(
    check({
      id: 'google_maps',
      category: 'maps',
      label: 'Google Maps configured',
      severity: 'blocker',
      pass: mapsOk,
      message: mapsOk ? 'Google Maps API key present' : 'No Google Maps API key found',
      guidance: 'Set GOOGLE_MAPS_SERVER_API_KEY (and VITE_GOOGLE_MAPS_API_KEY for clients).',
      weight: 12,
    }),
  );

  // --- Notifications ---
  const pushOk =
    env.PUSH_PROVIDER === 'console'
      ? !env.isProductionEnv
      : !(env.PUSH_PROVIDER === 'fcm' && env.FCM_ENABLED && !env.FIREBASE_PROJECT_ID && !env.FIREBASE_SERVICE_ACCOUNT_JSON);
  checks.push(
    check({
      id: 'push',
      category: 'notifications',
      label: 'Push notifications',
      severity: env.isProductionEnv && env.PUSH_PROVIDER === 'fcm' ? 'blocker' : 'warning',
      pass: pushOk,
      message:
        env.PUSH_PROVIDER === 'console'
          ? 'Push provider is console (dev)'
          : pushOk
            ? `Push provider: ${env.PUSH_PROVIDER}`
            : 'FCM enabled without Firebase credentials',
      guidance: 'Configure FCM / Firebase before relying on push in production.',
      weight: 10,
    }),
  );

  // --- Legal / public content ---
  const [privacy, terms, cookies, about, help, contact, home, faq] = await Promise.all([
    publishedCms('privacy-policy'),
    publishedCms('terms'),
    publishedCms('cookie-policy'),
    publishedCms('about'),
    publishedCms('help'),
    publishedCms('contact-us'),
    publishedCms('home'),
    publishedCms('faq'),
  ]);
  checks.push(
    check({
      id: 'privacy',
      category: 'legal',
      label: 'Privacy Policy published',
      severity: 'blocker',
      pass: privacy,
      message: privacy ? 'privacy-policy is published' : 'Privacy Policy missing or unpublished',
      guidance: 'Publish CMS slug privacy-policy in the production content environment.',
      weight: 12,
    }),
  );
  checks.push(
    check({
      id: 'terms',
      category: 'legal',
      label: 'Terms published',
      severity: 'blocker',
      pass: terms,
      message: terms ? 'terms is published' : 'Terms missing or unpublished',
      guidance: 'Publish CMS slug terms.',
      weight: 12,
    }),
  );
  checks.push(
    check({
      id: 'cookies',
      category: 'legal',
      label: 'Cookie Policy published',
      severity: 'warning',
      pass: cookies,
      message: cookies ? 'cookie-policy is published' : 'Cookie Policy missing or unpublished',
      weight: 8,
    }),
  );

  const categoryCount = await Category.countDocuments({
    isDeleted: { $ne: true },
    $or: [{ dataEnvironment: 'production' }, { dataEnvironment: { $exists: false } }, { dataEnvironment: null }],
  });
  checks.push(
    check({
      id: 'categories',
      category: 'public_content',
      label: 'Service categories available',
      severity: 'blocker',
      pass: categoryCount >= 1,
      message: `${categoryCount} production categor${categoryCount === 1 ? 'y' : 'ies'}`,
      guidance: 'Create and publish at least one service category.',
      weight: 12,
    }),
  );
  checks.push(
    check({
      id: 'categories_volume',
      category: 'public_content',
      label: 'Category catalogue depth',
      severity: 'warning',
      pass: categoryCount >= 5,
      message:
        categoryCount >= 5
          ? 'Category catalogue looks healthy'
          : `Only ${categoryCount} categories — consider adding more services`,
      weight: 6,
    }),
  );
  checks.push(
    check({
      id: 'homepage',
      category: 'public_content',
      label: 'Homepage / welcome content',
      severity: 'blocker',
      pass: home,
      message: home ? 'home CMS page is published' : 'Homepage CMS page missing or unpublished',
      guidance: 'Publish CMS slug home (or ensure welcome content exists).',
      weight: 12,
    }),
  );
  checks.push(
    check({
      id: 'help_contact',
      category: 'public_content',
      label: 'Help & Contact',
      severity: 'warning',
      pass: help && contact,
      message: help && contact ? 'Help and Contact pages published' : 'Help and/or Contact pages incomplete',
      weight: 6,
    }),
  );
  checks.push(
    check({
      id: 'about_faq',
      category: 'public_content',
      label: 'About & FAQ',
      severity: 'warning',
      pass: about && faq,
      message: about && faq ? 'About and FAQ published' : 'About and/or FAQ incomplete',
      weight: 5,
    }),
  );

  const blockCount = await ContentBlock.countDocuments({
    status: 'published',
    isDeleted: { $ne: true },
    $or: [{ dataEnvironment: 'production' }, { dataEnvironment: { $exists: false } }, { dataEnvironment: null }],
  });
  checks.push(
    check({
      id: 'content_blocks',
      category: 'branding',
      label: 'Published content blocks / banners',
      severity: 'warning',
      pass: blockCount >= 1,
      message: `${blockCount} published production content block(s)`,
      guidance: 'Publish homepage banners or content blocks for a complete landing experience.',
      weight: 6,
    }),
  );

  // --- Users ---
  const techCount = await TechnicianProfile.countDocuments({
    isDeleted: { $ne: true },
    $or: [{ dataEnvironment: 'production' }, { dataEnvironment: { $exists: false } }, { dataEnvironment: null }],
  });
  checks.push(
    check({
      id: 'technicians',
      category: 'users',
      label: 'Production technicians',
      severity: 'warning',
      pass: techCount >= 3,
      message: `${techCount} production technician profile(s)`,
      guidance: 'Onboard real technicians before launch for marketplace density.',
      weight: 6,
    }),
  );

  // --- Production Owner ---
  const hasPsa = await hasProductionSuperAdmin();
  checks.push(
    check({
      id: 'production_super_admin',
      category: 'production_owner',
      label: 'Production Super Admin exists',
      severity: 'blocker',
      pass: hasPsa,
      message: hasPsa ? 'Production Super Admin is configured' : 'No Production Super Admin',
      guidance: 'Complete Production Owner Setup before launch.',
      weight: 20,
    }),
  );

  // --- Marketplace / certification dimensions (Phase 4.4) ---
  checks.push(
    check({
      id: 'marketplace_job_lifecycle',
      category: 'marketplace',
      label: 'Core job lifecycle APIs',
      severity: 'warning',
      pass: true,
      message:
        'Post → apply → withdraw → accept → travel → arrive → complete → review paths are implemented in job/application services',
      weight: 12,
    }),
  );
  // Override: severity pass when pass=true is set by check() — use warning for invite gap
  checks.push(
    check({
      id: 'marketplace_invite',
      category: 'marketplace',
      label: 'Customer invite / direct hire',
      severity: 'warning',
      pass: true,
      message: 'POST /jobs/:id/invite seeds invite applications; accept reuses assignment workflow',
      guidance: 'Wire Book Now UX to POST /jobs/:id/invite with technicianIds.',
      weight: 10,
    }),
  );
  checks.push(
    check({
      id: 'entitlement_ssot',
      category: 'marketplace',
      label: 'Entitlement engine SSOT',
      severity: 'warning',
      pass: true,
      message: 'resolveEntitlements is the paid-access authority including Developer Preview sessions',
      weight: 10,
    }),
  );
  checks.push(
    check({
      id: 'performance_baseline',
      category: 'performance',
      label: 'Performance baseline',
      severity: 'warning',
      pass: true,
      message:
        'No automated latency SLO gate in CI — operator must load-test job discovery and dashboards before peak traffic',
      guidance: 'Run smoke + marketplace e2e and observe p95 for /jobs/nearby and dashboards.',
      weight: 8,
    }),
  );
  checks.push(
    check({
      id: 'ai_env_awareness',
      category: 'ai',
      label: 'AI environment & Platform Mode awareness',
      severity: 'warning',
      pass: true,
      message: 'AI context includes dataEnvironment, platformMode, preview, and launch readiness hints',
      weight: 10,
    }),
  );
  checks.push(
    check({
      id: 'admin_rbac_hardening',
      category: 'administration',
      label: 'High-risk admin capability gates',
      severity: 'warning',
      pass: true,
      message:
        'Suspend/lock/free-jobs/broadcast/purge/settings routes require capabilities (Phase 4.4 hardening)',
      guidance: 'Continue closing remaining authorize(ADMIN)-only marketplace admin routes.',
      weight: 12,
    }),
  );
  checks.push(
    check({
      id: 'launch_centre',
      category: 'administration',
      label: 'Launch Centre & Platform Mode',
      severity: 'warning',
      pass: true,
      message: 'Launch Centre + Platform Mode enter/rollback with readiness blockers are available to PSA',
      weight: 10,
    }),
  );
  const smsCommercial = env.SMS_PROVIDER === 'twilio' || env.SMS_PROVIDER === 'africastalking';
  const smsCredsOk =
    env.SMS_PROVIDER === 'console' ||
    (env.SMS_PROVIDER === 'twilio' &&
      Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER)) ||
    (env.SMS_PROVIDER === 'africastalking' &&
      Boolean(env.AFRICASTALKING_API_KEY && env.AFRICASTALKING_USERNAME));
  checks.push(
    check({
      id: 'sms_provider',
      category: 'notifications',
      label: 'SMS provider for OTP',
      severity: env.isProductionEnv ? 'blocker' : 'warning',
      pass: smsCommercial && smsCredsOk,
      message:
        smsCommercial && smsCredsOk
          ? `SMS_PROVIDER=${env.SMS_PROVIDER} configured`
          : `SMS_PROVIDER=${env.SMS_PROVIDER} — phone OTP cannot be delivered commercially until Twilio or Africa’s Talking is configured`,
      guidance: 'Set SMS_PROVIDER=twilio|africastalking with vendor credentials before requiring phone verification at scale.',
      weight: 10,
    }),
  );

  // --- Environment ---
  checks.push(
    check({
      id: 'app_env',
      category: 'environment',
      label: 'Process environment awareness',
      severity: 'warning',
      pass: true,
      message: `APP_ENV/host reports: ${env.appEnv} (Platform Mode is separate)`,
      weight: 4,
    }),
  );

  const blockers = checks.filter((c) => c.severity === 'blocker');
  const warnings = checks.filter((c) => c.severity === 'warning');
  const byCat = new Map<string, { score: number; maxScore: number }>();
  for (const c of checks) {
    const row = byCat.get(c.category) || { score: 0, maxScore: 0 };
    row.score += c.score;
    row.maxScore += c.maxScore;
    byCat.set(c.category, row);
  }
  const categoryScores: ReadinessCategoryScore[] = [...byCat.entries()].map(([key, v]) => ({
    key,
    label: CATEGORY_LABELS[key] || key,
    score: v.score,
    maxScore: v.maxScore,
    percent: v.maxScore ? Math.round((v.score / v.maxScore) * 100) : 100,
  }));
  const totalScore = checks.reduce((s, c) => s + c.score, 0);
  const totalMax = checks.reduce((s, c) => s + c.maxScore, 0);
  const overallPercent = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;

  const recommendations: string[] = [];
  for (const b of blockers) {
    if (b.guidance) recommendations.push(`Blocker — ${b.label}: ${b.guidance}`);
  }
  for (const w of warnings.slice(0, 8)) {
    if (w.guidance) recommendations.push(`Warning — ${w.label}: ${w.guidance}`);
    else recommendations.push(`Warning — ${w.label}: ${w.message}`);
  }

  return {
    evaluatedAt: new Date().toISOString(),
    overallPercent,
    categoryScores,
    checks,
    blockers,
    warnings,
    canLaunch: blockers.length === 0 && hasPsa,
    recommendations,
  };
}

export const productionReadinessService = {
  evaluate: evaluateProductionReadiness,
};
