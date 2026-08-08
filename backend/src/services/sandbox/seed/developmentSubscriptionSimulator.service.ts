/**
 * Development Subscription Simulator — Phase 1
 *
 * Lets the permanent Seed Development Technician (quikcart2026@gmail.com)
 * switch Starter / Professional / Business via the existing entitlement engine
 * (Developer Preview sessions → resolveEntitlements).
 *
 * Never creates Subscription, Payment, Invoice, or transaction IDs.
 * Unavailable when Platform Mode is Production.
 */

import { PlatformSetting } from '../../../models/platform/AuditSettings.js';
import { TechnicianProfile, User } from '../../../models/index.js';
import { AppError } from '../../../utils/AppError.js';
import { writeAuditLog } from '../../../utils/audit.js';
import { emitFreeJobLimitUpdated, emitTechnicianUnlocked } from '../../../sockets/realtime.js';
import { DEVELOPER_TECHNICIAN } from './constants.js';
import {
  activatePreviewSession,
  exitPreviewSession,
  getActivePreviewSession,
  cataloguePlanCodeForPreview,
} from '../../marketplace/developerPreview.service.js';
import type { PreviewPlanCode } from '../../../models/marketplace/DeveloperPreview.js';

export const SIMULATOR_HISTORY_KEY = 'development_subscription_simulator_history';
export const SIMULATOR_DEFAULT_PLAN = 'PROFESSIONAL' as const;
export const SIMULATOR_PLAN_CODES = ['STARTER', 'PROFESSIONAL', 'BUSINESS'] as const;
export type SimulatorPlanCode = (typeof SIMULATOR_PLAN_CODES)[number];

const MAX_HISTORY = 40;
/** Long-lived session so plan switches persist across a QA day without re-activating. */
const SIMULATOR_DURATION_HOURS = 168;

type HistoryEntry = {
  at: string;
  action: 'simulate' | 'reset';
  planCode: SimulatorPlanCode;
  actorId: string;
  actorRole: 'admin' | 'technician';
  sessionId?: string;
  note?: string;
};

type HistoryDoc = { entries: HistoryEntry[] };

function isSimulatorPlan(code: string): code is SimulatorPlanCode {
  return (SIMULATOR_PLAN_CODES as readonly string[]).includes(code);
}

async function assertPlatformModeDevelopment(): Promise<void> {
  const { getCurrentPlatformMode } = await import('../../platform/platformMode.service.js');
  const mode = await getCurrentPlatformMode();
  if (mode === 'production') {
    throw AppError.forbidden(
      'Development Subscription Simulator is unavailable while Platform Mode is Production',
    );
  }
}

export async function findDeveloperTechnicianUser() {
  const user = await User.findOne({
    email: DEVELOPER_TECHNICIAN.email.toLowerCase(),
    isDeleted: { $ne: true },
  })
    .select('_id email role metadata dataEnvironment accountStatus subscriptionPlanCode subscriptionStatus')
    .lean();
  return user;
}

export function isDeveloperTechnicianEmail(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase() === DEVELOPER_TECHNICIAN.email.toLowerCase();
}

async function loadHistory(): Promise<HistoryEntry[]> {
  const doc = await PlatformSetting.findOne({
    key: SIMULATOR_HISTORY_KEY,
    isDeleted: { $ne: true },
  })
    .select('value')
    .lean();
  const raw = (doc?.value || {}) as HistoryDoc;
  return Array.isArray(raw.entries) ? raw.entries.slice(0, MAX_HISTORY) : [];
}

async function appendHistory(entry: HistoryEntry): Promise<HistoryEntry[]> {
  const prev = await loadHistory();
  const entries = [entry, ...prev].slice(0, MAX_HISTORY);
  await PlatformSetting.findOneAndUpdate(
    { key: SIMULATOR_HISTORY_KEY },
    {
      $set: {
        key: SIMULATOR_HISTORY_KEY,
        value: { entries } satisfies HistoryDoc,
        scope: 'platform',
        description: 'Development Subscription Simulator history (no billing artefacts)',
      },
    },
    { upsert: true, new: true },
  );
  return entries;
}

async function refreshTechnicianRealtime(userId: string) {
  const profile = await TechnicianProfile.findOne({ userId }).lean();
  if (profile) {
    emitFreeJobLimitUpdated(userId, profile);
    emitTechnicianUnlocked(userId, profile);
  }
}

/**
 * Align seed profile stamps with the simulated catalogue plan (no Subscription docs).
 * Preview session remains the entitlement override while active; stamps keep seed coherent
 * after reset/expiry and match dashboard/quota reads that still glance at profile.
 */
async function stampSimulatedPlan(userId: string, planCode: SimulatorPlanCode) {
  await TechnicianProfile.updateOne(
    { userId },
    {
      $set: {
        subscriptionPlanCode: planCode,
        subscriptionStatus: 'active',
        accountLocked: false,
      },
      $unset: {
        subscriptionPeriodEnd: 1,
        subscriptionBillingPeriod: 1,
        lockReason: 1,
      },
    },
  );
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        subscriptionPlanCode: planCode,
        subscriptionStatus: 'active',
        'metadata.subscriptionSimulation': {
          active: true,
          planCode,
          simulatedAt: new Date().toISOString(),
          source: 'development_subscription_simulator',
          noSubscriptionRecord: true,
          noPayment: true,
        },
      },
    },
  );
}

async function clearSimulationMetadata(userId: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        subscriptionPlanCode: SIMULATOR_DEFAULT_PLAN,
        subscriptionStatus: 'active',
        'metadata.subscriptionSimulation': {
          active: false,
          planCode: SIMULATOR_DEFAULT_PLAN,
          resetAt: new Date().toISOString(),
          source: 'development_subscription_simulator',
        },
      },
    },
  );
  await TechnicianProfile.updateOne(
    { userId },
    {
      $set: {
        subscriptionPlanCode: SIMULATOR_DEFAULT_PLAN,
        subscriptionStatus: 'active',
        accountLocked: false,
      },
      $unset: {
        subscriptionPeriodEnd: 1,
        subscriptionBillingPeriod: 1,
        lockReason: 1,
      },
    },
  );
}

export async function getSimulatorStatus(actor?: { userId: string; role: 'admin' | 'technician' }) {
  await assertPlatformModeDevelopment();
  const tech = await findDeveloperTechnicianUser();
  if (!tech) {
    return {
      available: false,
      reason: 'Developer technician not found — run Seed Platform Generate All',
      defaultPlan: SIMULATOR_DEFAULT_PLAN,
      availablePlans: [...SIMULATOR_PLAN_CODES],
      developerTechnicianEmail: DEVELOPER_TECHNICIAN.email,
      history: await loadHistory(),
    };
  }

  if (actor?.role === 'technician' && actor.userId !== tech._id.toString()) {
    throw AppError.forbidden('Only the permanent Development Technician may use the simulator');
  }

  const { resolveEntitlements, serializeEntitlements } = await import(
    '../../marketplace/entitlements.service.js'
  );
  const { getCurrentPlatformMode } = await import('../../platform/platformMode.service.js');
  const entitlements = await resolveEntitlements(tech._id.toString());
  const preview = await getActivePreviewSession(tech._id.toString());
  const mode = await getCurrentPlatformMode();

  return {
    available: true,
    platformMode: mode,
    defaultPlan: SIMULATOR_DEFAULT_PLAN,
    availablePlans: [...SIMULATOR_PLAN_CODES],
    developerTechnician: {
      userId: tech._id.toString(),
      email: tech.email,
      dataEnvironment: (tech as { dataEnvironment?: string }).dataEnvironment,
      profilePlanCode: tech.subscriptionPlanCode || null,
      profileStatus: tech.subscriptionStatus || null,
    },
    current: {
      planCode: entitlements.planCode,
      planName: entitlements.planName,
      subscriptionSource: entitlements.subscriptionSource,
      hasPaidAccess: entitlements.hasPaidAccess,
      previewActive: Boolean(entitlements.preview?.active),
      simulationOnly: Boolean(entitlements.preview?.simulationOnly),
    },
    activeSession: preview
      ? {
          id: preview._id.toString(),
          planCode: preview.planCode,
          cataloguePlanCode: cataloguePlanCodeForPreview(preview.planCode as PreviewPlanCode),
          expiresAt: preview.expiresAt,
          activatedAt: preview.activatedAt,
        }
      : null,
    entitlements: serializeEntitlements(entitlements),
    history: await loadHistory(),
    notes: [
      'Uses existing entitlement engine (Developer Preview session → resolveEntitlements).',
      'Never creates Subscription, Payment, Invoice, or transaction IDs.',
      'Unavailable in Platform Mode Production.',
    ],
  };
}

export async function simulatePlan(
  actor: { userId: string; role: 'admin' | 'technician' },
  planCodeRaw: string,
) {
  await assertPlatformModeDevelopment();
  const planCode = String(planCodeRaw || '').toUpperCase();
  if (!isSimulatorPlan(planCode)) {
    throw AppError.badRequest(`Simulator supports only ${SIMULATOR_PLAN_CODES.join(', ')}`);
  }

  const tech = await findDeveloperTechnicianUser();
  if (!tech) {
    throw AppError.notFound('Developer technician not found — run Seed Platform Generate All');
  }
  const techId = tech._id.toString();

  if (actor.role === 'technician' && actor.userId !== techId) {
    throw AppError.forbidden('Only the permanent Development Technician may use the simulator');
  }

  // Stamp catalogue plan on seed profile (no Subscription / Payment documents).
  await stampSimulatedPlan(techId, planCode);

  // Entitlement SSOT override — existing Preview path (no billing artefacts).
  const activated = await activatePreviewSession(techId, {
    planCode,
    durationHours: SIMULATOR_DURATION_HOURS,
  });

  await refreshTechnicianRealtime(techId);

  const history = await appendHistory({
    at: new Date().toISOString(),
    action: 'simulate',
    planCode,
    actorId: actor.userId,
    actorRole: actor.role,
    sessionId: activated.session.id,
    note: 'development_subscription_simulator',
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'development_subscription_simulator.simulate',
    resourceType: 'DeveloperPreviewSession',
    resourceId: activated.session.id,
    meta: {
      planCode,
      targetUserId: techId,
      targetEmail: DEVELOPER_TECHNICIAN.email,
      noSubscriptionRecord: true,
      noPayment: true,
    },
  });

  const status = await getSimulatorStatus(actor.role === 'technician' ? actor : undefined);
  return {
    ...status,
    message: `Simulating ${planCode} via entitlement engine (no billing records created)`,
    session: activated.session,
    history,
  };
}

export async function resetSimulator(actor: { userId: string; role: 'admin' | 'technician' }) {
  await assertPlatformModeDevelopment();
  const tech = await findDeveloperTechnicianUser();
  if (!tech) {
    throw AppError.notFound('Developer technician not found — run Seed Platform Generate All');
  }
  const techId = tech._id.toString();

  if (actor.role === 'technician' && actor.userId !== techId) {
    throw AppError.forbidden('Only the permanent Development Technician may use the simulator');
  }

  await exitPreviewSession(techId, 'simulator_reset');
  await clearSimulationMetadata(techId);
  await refreshTechnicianRealtime(techId);

  const history = await appendHistory({
    at: new Date().toISOString(),
    action: 'reset',
    planCode: SIMULATOR_DEFAULT_PLAN,
    actorId: actor.userId,
    actorRole: actor.role,
    note: 'reset_to_seed_default_professional',
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'development_subscription_simulator.reset',
    resourceType: 'User',
    resourceId: techId,
    meta: {
      planCode: SIMULATOR_DEFAULT_PLAN,
      targetEmail: DEVELOPER_TECHNICIAN.email,
      noSubscriptionRecord: true,
      noPayment: true,
    },
  });

  const status = await getSimulatorStatus(actor.role === 'technician' ? actor : undefined);
  return {
    ...status,
    message: `Reset to default ${SIMULATOR_DEFAULT_PLAN} (seed stamps; no billing records)`,
    history,
  };
}

export const developmentSubscriptionSimulatorService = {
  getSimulatorStatus,
  simulatePlan,
  resetSimulator,
  findDeveloperTechnicianUser,
  isDeveloperTechnicianEmail,
  SIMULATOR_PLAN_CODES,
  SIMULATOR_DEFAULT_PLAN,
};
