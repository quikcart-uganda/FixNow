/**
 * Developer Preview Session lifecycle — temporary entitlement sessions only.
 * Never creates Subscription, Payment, Invoice, or billing history.
 */

import {
  DeveloperPreviewSession,
  User,
  PREVIEW_PLAN_CODES,
  type PreviewPlanCode,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { getSandboxSettings } from '../sandbox/sandboxSettings.service.js';
import { isSandboxLike } from '../../constants/dataEnvironment.js';
import {
  getDeveloperPreviewSettings,
  type DeveloperPreviewSettings,
} from './developerPreviewSettings.service.js';

export type PreviewEligibility = {
  eligible: boolean;
  reason?: string;
  settings: DeveloperPreviewSettings;
  sandboxEnabled: boolean;
};

export function cataloguePlanCodeForPreview(planCode: PreviewPlanCode): 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' {
  if (planCode === 'BUSINESS_BOOST') return 'BUSINESS';
  return planCode;
}

export function previewHasBoosts(planCode: PreviewPlanCode): boolean {
  return planCode === 'BUSINESS_BOOST';
}

export async function evaluatePreviewEligibility(userId: string): Promise<PreviewEligibility> {
  const [settings, sandbox, user] = await Promise.all([
    getDeveloperPreviewSettings(),
    getSandboxSettings(),
    User.findById(userId).select('email role metadata dataEnvironment').lean(),
  ]);

  try {
    const { getCurrentPlatformMode } = await import('../platform/platformMode.service.js');
    if ((await getCurrentPlatformMode()) === 'production') {
      return {
        eligible: false,
        reason: 'Developer Preview is hidden while Platform Mode is Production',
        settings,
        sandboxEnabled: sandbox.enableSandbox,
      };
    }
  } catch {
    /* mode service unavailable — continue */
  }

  if (!user) {
    return { eligible: false, reason: 'Account not found', settings, sandboxEnabled: sandbox.enableSandbox };
  }
  if (!settings.enablePreview) {
    return { eligible: false, reason: 'Developer Preview is disabled', settings, sandboxEnabled: sandbox.enableSandbox };
  }
  if (settings.suspendPreview) {
    return { eligible: false, reason: 'Developer Preview is suspended', settings, sandboxEnabled: sandbox.enableSandbox };
  }
  if (settings.requireSandbox && !sandbox.enableSandbox) {
    return {
      eligible: false,
      reason: 'Sandbox must be enabled for Developer Preview',
      settings,
      sandboxEnabled: sandbox.enableSandbox,
    };
  }

  const email = String(user.email || '').toLowerCase();
  const meta = (user.metadata || {}) as { developer?: boolean; qa?: boolean; seedKey?: string };
  const env = String((user as { dataEnvironment?: string }).dataEnvironment || 'production');
  const authorizedEmail = settings.authorizedEmails.includes(email);
  const authorizedId = settings.authorizedUserIds.includes(userId);
  const isDeveloper = Boolean(meta.developer) && settings.allowDevelopers;
  const isQa = Boolean(meta.qa) && settings.allowQa;
  const sandboxAccount = isSandboxLike(env as 'sandbox');

  if (!(authorizedEmail || authorizedId || isDeveloper || isQa)) {
    return {
      eligible: false,
      reason: 'Account is not authorised for Developer Preview',
      settings,
      sandboxEnabled: sandbox.enableSandbox,
    };
  }

  // Preview always stays on sandbox content — never allow production accounts to preview.
  if (settings.requireSandbox && !sandboxAccount) {
    return {
      eligible: false,
      reason: 'Preview is limited to sandbox developer / QA accounts',
      settings,
      sandboxEnabled: sandbox.enableSandbox,
    };
  }

  return { eligible: true, settings, sandboxEnabled: sandbox.enableSandbox };
}

/** Active session for entitlement resolution (expires lazily). */
export async function getActivePreviewSession(userId: string) {
  const session = await DeveloperPreviewSession.findOne({
    userId,
    status: 'active',
  })
    .sort({ activatedAt: -1 })
    .lean();
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await DeveloperPreviewSession.updateOne(
      { _id: session._id },
      { $set: { status: 'expired', endedAt: new Date(), endReason: 'expired' } },
    );
    return null;
  }
  return session;
}

export async function getPreviewAvailability(userId: string) {
  const eligibility = await evaluatePreviewEligibility(userId);
  const active = eligibility.eligible ? await getActivePreviewSession(userId) : null;
  const plans = PREVIEW_PLAN_CODES.filter((code) => eligibility.settings.enabledPlans[code]).map(
    (code) => ({
      code,
      label:
        code === 'BUSINESS_BOOST'
          ? 'Preview Business + Boost'
          : `Preview ${code.charAt(0)}${code.slice(1).toLowerCase()}`,
      simulationOnly: true,
      includesBoost: previewHasBoosts(code),
      cataloguePlanCode: cataloguePlanCodeForPreview(code),
    }),
  );

  return {
    eligible: eligibility.eligible,
    reason: eligibility.reason || null,
    sandboxEnabled: eligibility.sandboxEnabled,
    settings: {
      enablePreview: eligibility.settings.enablePreview,
      suspendPreview: eligibility.settings.suspendPreview,
      enabledPlans: eligibility.settings.enabledPlans,
      defaultDurationHours: eligibility.settings.defaultDurationHours,
    },
    activeSession: active
      ? {
          id: active._id.toString(),
          planCode: active.planCode,
          environment: active.environment,
          activatedAt: active.activatedAt,
          expiresAt: active.expiresAt,
          activeBoosts: active.activeBoosts,
          simulationOnly: true,
          subscriptionSource: 'developer_preview' as const,
        }
      : null,
    plans,
  };
}

export async function activatePreviewSession(
  userId: string,
  input: { planCode: string; durationHours?: number },
) {
  const eligibility = await evaluatePreviewEligibility(userId);
  if (!eligibility.eligible) {
    throw AppError.forbidden(eligibility.reason || 'Developer Preview not available');
  }

  const planCode = String(input.planCode || '').toUpperCase() as PreviewPlanCode;
  if (!(PREVIEW_PLAN_CODES as readonly string[]).includes(planCode)) {
    throw AppError.badRequest('Invalid preview plan');
  }
  if (!eligibility.settings.enabledPlans[planCode]) {
    throw AppError.badRequest(`Preview plan ${planCode} is disabled by admin`);
  }

  const user = await User.findById(userId).select('email dataEnvironment').lean();
  if (!user) throw AppError.notFound('User not found');

  // End any existing active session (switch plan)
  await DeveloperPreviewSession.updateMany(
    { userId, status: 'active' },
    {
      $set: {
        status: 'ended',
        endedAt: new Date(),
        endReason: 'replaced',
      },
    },
  );

  const hours = Math.max(
    1,
    Math.min(168, Number(input.durationHours) || eligibility.settings.defaultDurationHours || 8),
  );
  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + hours * 60 * 60 * 1000);
  const activeBoosts = previewHasBoosts(planCode);

  const session = await DeveloperPreviewSession.create({
    userId,
    email: String(user.email || '').toLowerCase(),
    planCode,
    environment: 'sandbox',
    activatedAt,
    expiresAt,
    status: 'active',
    activeBoosts,
    aiContext: {
      subscriptionSource: 'developer_preview',
      simulationOnly: true,
      planCode,
    },
    metadata: {
      simulationOnly: true,
      noSubscriptionRecord: true,
      noPayment: true,
      noInvoice: true,
    },
    dataEnvironment: 'sandbox',
  });

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'developer_preview.activate',
    resourceType: 'DeveloperPreviewSession',
    resourceId: session._id.toString(),
    meta: { planCode, expiresAt, activeBoosts },
  });

  return {
    session: {
      id: session._id.toString(),
      planCode: session.planCode,
      environment: session.environment,
      activatedAt: session.activatedAt,
      expiresAt: session.expiresAt,
      activeBoosts: session.activeBoosts,
      simulationOnly: true,
      subscriptionSource: 'developer_preview' as const,
    },
  };
}

export async function exitPreviewSession(userId: string, reason = 'user_exit') {
  const active = await DeveloperPreviewSession.findOne({ userId, status: 'active' });
  if (!active) {
    return { exited: false, message: 'No active preview session' };
  }
  active.status = 'ended';
  active.endedAt = new Date();
  active.endReason = reason;
  await active.save();

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'developer_preview.exit',
    resourceType: 'DeveloperPreviewSession',
    resourceId: active._id.toString(),
    meta: { reason },
  });

  return { exited: true, sessionId: active._id.toString() };
}

export async function adminTerminateSession(adminId: string, sessionId: string) {
  const session = await DeveloperPreviewSession.findById(sessionId);
  if (!session) throw AppError.notFound('Preview session not found');
  if (session.status !== 'active') {
    return { terminated: false, status: session.status };
  }
  session.status = 'terminated';
  session.endedAt = new Date();
  session.endedByAdminId = adminId as unknown as typeof session.endedByAdminId;
  session.endReason = 'admin_terminate';
  await session.save();
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'developer_preview.terminate',
    resourceType: 'DeveloperPreviewSession',
    resourceId: sessionId,
  });
  return { terminated: true };
}

export async function adminTerminateAllActive(adminId: string) {
  const res = await DeveloperPreviewSession.updateMany(
    { status: 'active' },
    {
      $set: {
        status: 'terminated',
        endedAt: new Date(),
        endedByAdminId: adminId,
        endReason: 'admin_terminate_all',
      },
    },
  );
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'developer_preview.terminate_all',
    resourceType: 'DeveloperPreviewSession',
    meta: { modified: res.modifiedCount },
  });
  return { terminated: res.modifiedCount };
}

export async function listActiveSessions(limit = 50) {
  const items = await DeveloperPreviewSession.find({ status: 'active' })
    .sort({ activatedAt: -1 })
    .limit(Math.min(100, limit))
    .lean();
  return {
    items: items.map((s) => ({
      id: s._id.toString(),
      userId: s.userId.toString(),
      email: s.email,
      planCode: s.planCode,
      environment: s.environment,
      activatedAt: s.activatedAt,
      expiresAt: s.expiresAt,
      activeBoosts: s.activeBoosts,
    })),
  };
}

export async function listSessionHistory(limit = 50) {
  const items = await DeveloperPreviewSession.find({})
    .sort({ activatedAt: -1 })
    .limit(Math.min(200, limit))
    .lean();
  return {
    items: items.map((s) => ({
      id: s._id.toString(),
      userId: s.userId.toString(),
      email: s.email,
      planCode: s.planCode,
      status: s.status,
      activatedAt: s.activatedAt,
      expiresAt: s.expiresAt,
      endedAt: s.endedAt,
      endReason: s.endReason,
      activeBoosts: s.activeBoosts,
    })),
  };
}

export async function previewAnalytics() {
  const [active, total, byPlan] = await Promise.all([
    DeveloperPreviewSession.countDocuments({ status: 'active' }),
    DeveloperPreviewSession.countDocuments({}),
    DeveloperPreviewSession.aggregate([
      { $group: { _id: '$planCode', count: { $sum: 1 } } },
    ]),
  ]);
  return {
    activeSessions: active,
    totalSessions: total,
    byPlan: Object.fromEntries(byPlan.map((r) => [r._id, r.count])),
    note: 'Preview analytics are isolated — never mixed into production subscription analytics.',
  };
}

export const developerPreviewService = {
  evaluatePreviewEligibility,
  getActivePreviewSession,
  getPreviewAvailability,
  activatePreviewSession,
  exitPreviewSession,
  adminTerminateSession,
  adminTerminateAllActive,
  listActiveSessions,
  listSessionHistory,
  previewAnalytics,
  cataloguePlanCodeForPreview,
};
