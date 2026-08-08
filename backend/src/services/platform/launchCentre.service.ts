/**
 * Launch Centre — guided production activation on top of Platform Mode.
 * Never deletes development assets; readiness must pass before launch.
 */

import { PlatformSetting } from '../../models/platform/AuditSettings.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import {
  enterProductionMode,
  getCurrentPlatformMode,
  getPlatformModePublicView,
  getPlatformModeState,
  isProductionSuperAdmin,
  listModeTransitions,
  returnToDevelopmentMode,
} from './platformMode.service.js';
import { evaluateProductionReadiness } from './productionReadiness.service.js';

export const LAUNCH_HISTORY_KEY = 'platform_launch_centre_history';

export type LaunchHistoryEntry = {
  id: string;
  type: 'launch' | 'rollback' | 'readiness_snapshot';
  at: string;
  administratorUserId: string;
  administratorEmail?: string;
  reason?: string;
  ipAddress?: string;
  device?: string;
  readinessOverallPercent?: number;
  blockerCount?: number;
  warningCount?: number;
  modeAfter?: 'development' | 'production';
};

type LaunchHistoryDoc = { entries: LaunchHistoryEntry[] };

async function loadHistory(): Promise<LaunchHistoryEntry[]> {
  const doc = await PlatformSetting.findOne({ key: LAUNCH_HISTORY_KEY }).lean();
  const value = doc?.value as LaunchHistoryDoc | undefined;
  return Array.isArray(value?.entries) ? value!.entries.slice(-200) : [];
}

async function appendHistory(entry: LaunchHistoryEntry, actorId: string) {
  const entries = [...(await loadHistory()), entry].slice(-200);
  await PlatformSetting.findOneAndUpdate(
    { key: LAUNCH_HISTORY_KEY },
    {
      $set: {
        value: { entries },
        scope: 'platform',
        description: 'Launch Centre launch / rollback / readiness history',
        updatedBy: actorId,
        isSecret: false,
        isDeleted: false,
      },
    },
    { upsert: true },
  );
}

export async function getLaunchCentreOverview(actorUserId: string) {
  if (!(await isProductionSuperAdmin(actorUserId))) {
    throw AppError.forbidden('Launch Centre is available only to Production Super Admin');
  }
  const [modeView, modeState, readiness, history, transitions] = await Promise.all([
    getPlatformModePublicView(actorUserId),
    getPlatformModeState(),
    evaluateProductionReadiness(),
    loadHistory(),
    listModeTransitions(40),
  ]);

  return {
    mode: modeView,
    modeState,
    readiness,
    history,
    modeTransitions: transitions,
    launchAllowed: readiness.canLaunch && modeView.mode === 'development' && !modeView.locked,
    rollbackAllowed: modeView.mode === 'production' && !modeView.locked,
    sections: [
      'overview',
      'readiness',
      'infrastructure',
      'security',
      'payments',
      'maps',
      'notifications',
      'legal',
      'branding',
      'public_content',
      'users',
      'production_owner',
      'environment',
      'promotion',
      'launch_history',
      'rollback_history',
      'system_health',
    ],
  };
}

export async function snapshotReadiness(actorUserId: string, reason?: string) {
  if (!(await isProductionSuperAdmin(actorUserId))) {
    throw AppError.forbidden('Production Super Admin required');
  }
  const readiness = await evaluateProductionReadiness();
  const entry: LaunchHistoryEntry = {
    id: `ready_${Date.now()}`,
    type: 'readiness_snapshot',
    at: new Date().toISOString(),
    administratorUserId: actorUserId,
    reason: reason || 'Readiness snapshot',
    readinessOverallPercent: readiness.overallPercent,
    blockerCount: readiness.blockers.length,
    warningCount: readiness.warnings.length,
    modeAfter: await getCurrentPlatformMode(),
  };
  await appendHistory(entry, actorUserId);
  await writeAuditLog({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'launch_centre.readiness_snapshot',
    resourceType: 'LaunchCentre',
    meta: {
      overallPercent: readiness.overallPercent,
      blockers: readiness.blockers.map((b) => b.id),
    },
  });
  return { entry, readiness };
}

export async function executeLaunch(
  actorUserId: string,
  input: {
    reason?: string;
    confirmPhrase?: string;
    confirmAgain?: boolean;
    mfaToken?: string;
    acknowledgeWarnings?: boolean;
  },
  meta: { ip?: string; userAgent?: string; device?: string } = {},
) {
  if (!(await isProductionSuperAdmin(actorUserId))) {
    throw AppError.forbidden('Only a Production Super Admin may launch');
  }

  const readiness = await evaluateProductionReadiness();
  if (!readiness.canLaunch || readiness.blockers.length) {
    throw AppError.badRequest('Resolve all readiness blockers before launch', {
      code: 'LAUNCH_BLOCKED',
      blockers: readiness.blockers,
      overallPercent: readiness.overallPercent,
    });
  }
  if (readiness.warnings.length && !input.acknowledgeWarnings) {
    throw AppError.badRequest('Acknowledge readiness warnings before launch', {
      code: 'LAUNCH_WARNINGS',
      warnings: readiness.warnings,
    });
  }

  const result = await enterProductionMode(
    actorUserId,
    {
      reason: input.reason || 'Launch Centre production activation',
      confirmPhrase: input.confirmPhrase,
      confirmAgain: input.confirmAgain,
      mfaToken: input.mfaToken,
    },
    meta,
  );

  const entry: LaunchHistoryEntry = {
    id: `launch_${Date.now()}`,
    type: 'launch',
    at: new Date().toISOString(),
    administratorUserId: actorUserId,
    reason: input.reason || 'Launch Centre production activation',
    ipAddress: meta.ip,
    device: meta.device || meta.userAgent?.slice(0, 180),
    readinessOverallPercent: readiness.overallPercent,
    blockerCount: 0,
    warningCount: readiness.warnings.length,
    modeAfter: 'production',
  };
  await appendHistory(entry, actorUserId);

  await writeAuditLog({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'launch_centre.launch',
    resourceType: 'LaunchCentre',
    severity: 'critical',
    meta: {
      readinessOverallPercent: readiness.overallPercent,
      alreadyActive: result.alreadyActive,
      ip: meta.ip,
    },
  });

  return { ...result, readiness, launchRecord: entry };
}

export async function executeRollback(
  actorUserId: string,
  input: {
    reason?: string;
    confirmPhrase?: string;
    confirmAgain?: boolean;
    mfaToken?: string;
  },
  meta: { ip?: string; userAgent?: string; device?: string } = {},
) {
  if (!(await isProductionSuperAdmin(actorUserId))) {
    throw AppError.forbidden('Only a Production Super Admin may roll back');
  }

  const result = await returnToDevelopmentMode(
    actorUserId,
    {
      reason: input.reason || 'Launch Centre rollback to Development Mode',
      confirmPhrase: input.confirmPhrase,
      confirmAgain: input.confirmAgain,
      mfaToken: input.mfaToken,
    },
    meta,
  );

  const entry: LaunchHistoryEntry = {
    id: `rollback_${Date.now()}`,
    type: 'rollback',
    at: new Date().toISOString(),
    administratorUserId: actorUserId,
    reason: input.reason || 'Launch Centre rollback',
    ipAddress: meta.ip,
    device: meta.device || meta.userAgent?.slice(0, 180),
    modeAfter: 'development',
  };
  await appendHistory(entry, actorUserId);

  await writeAuditLog({
    actorId: actorUserId,
    actorRole: 'admin',
    action: 'launch_centre.rollback',
    resourceType: 'LaunchCentre',
    severity: 'critical',
    meta: { alreadyActive: result.alreadyActive, ip: meta.ip },
  });

  return { ...result, rollbackRecord: entry };
}

export async function getLaunchHistory(actorUserId: string) {
  if (!(await isProductionSuperAdmin(actorUserId))) {
    throw AppError.forbidden('Production Super Admin required');
  }
  const [history, transitions] = await Promise.all([loadHistory(), listModeTransitions(100)]);
  return {
    launches: history.filter((h) => h.type === 'launch'),
    rollbacks: history.filter((h) => h.type === 'rollback'),
    readinessSnapshots: history.filter((h) => h.type === 'readiness_snapshot'),
    all: history.slice().reverse(),
    modeTransitions: transitions,
  };
}

export const launchCentreService = {
  overview: getLaunchCentreOverview,
  snapshotReadiness,
  launch: executeLaunch,
  rollback: executeRollback,
  history: getLaunchHistory,
  evaluateReadiness: evaluateProductionReadiness,
};
