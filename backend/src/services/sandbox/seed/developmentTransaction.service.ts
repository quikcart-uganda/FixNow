/**
 * Development Transaction engine — alternate verification source for the
 * Permanent Development Technician while Platform Mode is Development.
 *
 * Writes the same SubscriptionPayment + activateSubscriptionForUser path.
 * Does NOT create a second catalogue, entitlement matrix, or plan codes.
 */

import crypto from 'crypto';
import { Types } from 'mongoose';
import {
  DevelopmentTransaction,
  DEV_TX_PLAN_PREFIXES,
  type DevTxPlanCode,
  type IDevelopmentTransaction,
} from '../../../models/marketplace/DevelopmentTransaction.js';
import { User } from '../../../models/index.js';
import { ROLES } from '../../../constants/roles.js';
import { AppError } from '../../../utils/AppError.js';
import { writeAuditLog } from '../../../utils/audit.js';
import { DEVELOPER_TECHNICIAN, SEED_TAG } from './constants.js';

const POOL_PER_PLAN = 5;
const TTL_DAYS = 90;
const DEV_TX_PATTERN = /^DEV-(STARTER|PRO|BUSINESS)-[A-Z0-9]{6,12}$/;

export function isDevTransactionCode(code: string): boolean {
  return DEV_TX_PATTERN.test(String(code || '').trim().toUpperCase());
}

export function planCodeFromDevTx(code: string): DevTxPlanCode | null {
  const upper = String(code || '').trim().toUpperCase();
  if (upper.startsWith('DEV-STARTER-')) return 'STARTER';
  if (upper.startsWith('DEV-PRO-')) return 'PROFESSIONAL';
  if (upper.startsWith('DEV-BUSINESS-')) return 'BUSINESS';
  return null;
}

function randomSuffix(len = 6): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, len);
}

function serialize(doc: IDevelopmentTransaction) {
  return {
    id: doc._id.toString(),
    code: doc.code,
    planCode: doc.planCode,
    status: doc.status,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    claimedAt: doc.claimedAt || null,
    claimedByUserId: doc.claimedByUserId?.toString() || null,
    consumedAt: doc.consumedAt || null,
    revokedAt: doc.revokedAt || null,
    revokeReason: doc.revokeReason || null,
    paymentId: doc.paymentId?.toString() || null,
    subscriptionId: doc.subscriptionId?.toString() || null,
    usageHistory: (doc.usageHistory || []).slice(-20).map((u) => ({
      at: u.at,
      action: u.action,
      actorId: u.actorId || null,
      note: u.note || null,
      paymentId: u.paymentId || null,
      subscriptionId: u.subscriptionId || null,
    })),
    dataEnvironment: doc.dataEnvironment,
  };
}

export async function findPermanentDevelopmentTechnicianUser() {
  return User.findOne({
    email: DEVELOPER_TECHNICIAN.email.toLowerCase(),
    role: ROLES.TECHNICIAN,
    isDeleted: { $ne: true },
  });
}

export async function isPermanentDevelopmentTechnician(userId: string): Promise<boolean> {
  const user = await User.findById(userId).select('email role metadata').lean();
  if (!user || user.role !== ROLES.TECHNICIAN) return false;
  const email = String(user.email || '').toLowerCase();
  if (email !== DEVELOPER_TECHNICIAN.email.toLowerCase()) return false;
  const meta = (user.metadata || {}) as Record<string, unknown>;
  return (
    meta.permanentDevelopmentTechnician === true ||
    meta.developer === true ||
    meta.seedKey === DEVELOPER_TECHNICIAN.seedKey
  );
}

export async function isDevelopmentTransactionVerificationEnabled(
  userId?: string,
): Promise<{
  enabled: boolean;
  platformMode: 'development' | 'production';
  isPermanentDevelopmentTechnician: boolean;
  reason?: string;
}> {
  let mode: 'development' | 'production' = 'development';
  try {
    const { getCurrentPlatformMode } = await import('../../platform/platformMode.service.js');
    mode = await getCurrentPlatformMode();
  } catch {
    mode = 'development';
  }

  const isDevTech = userId ? await isPermanentDevelopmentTechnician(userId) : false;

  if (mode === 'production') {
    return {
      enabled: false,
      platformMode: mode,
      isPermanentDevelopmentTechnician: isDevTech,
      reason: 'Development Transaction verification is disabled while Platform Mode is Production',
    };
  }
  if (userId && !isDevTech) {
    return {
      enabled: false,
      platformMode: mode,
      isPermanentDevelopmentTechnician: false,
      reason: 'Development Transaction IDs are reserved for the Permanent Development Technician',
    };
  }
  return {
    enabled: true,
    platformMode: mode,
    isPermanentDevelopmentTechnician: isDevTech,
  };
}

async function expireStale(): Promise<number> {
  const now = new Date();
  const res = await DevelopmentTransaction.updateMany(
    { status: { $in: ['available', 'claimed'] }, expiresAt: { $lte: now } },
    {
      $set: { status: 'expired' },
      $push: {
        usageHistory: {
          $each: [{ at: now, action: 'expired', note: 'TTL elapsed' }],
          $slice: -50,
        },
      },
    },
  );
  return res.modifiedCount || 0;
}

export async function ensureDevelopmentTransactionPool(
  actorId = 'system:seed-platform',
): Promise<{ issued: number; available: Record<string, number> }> {
  await expireStale();
  let issued = 0;
  const available: Record<string, number> = {};

  for (const planCode of Object.keys(DEV_TX_PLAN_PREFIXES) as DevTxPlanCode[]) {
    const prefix = DEV_TX_PLAN_PREFIXES[planCode];
    const open = await DevelopmentTransaction.countDocuments({
      planCode,
      status: 'available',
      expiresAt: { $gt: new Date() },
    });
    const need = Math.max(0, POOL_PER_PLAN - open);
    for (let i = 0; i < need; i++) {
      let code = `${prefix}-${randomSuffix()}`;
      // Collision retry (unique index).
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
          await DevelopmentTransaction.create({
            code,
            planCode,
            status: 'available',
            createdBy: actorId,
            expiresAt,
            dataEnvironment: 'sandbox',
            seedTag: SEED_TAG,
            usageHistory: [
              {
                at: new Date(),
                action: 'issued',
                actorId,
                note: 'Seed Platform Development Transaction pool',
              },
            ],
          });
          issued += 1;
          break;
        } catch {
          code = `${prefix}-${randomSuffix()}`;
        }
      }
    }
    available[planCode] = await DevelopmentTransaction.countDocuments({
      planCode,
      status: 'available',
      expiresAt: { $gt: new Date() },
    });
  }

  if (issued > 0) {
    const actorObjectId =
      Types.ObjectId.isValid(actorId) && String(actorId).length === 24 ? actorId : undefined;
    if (actorObjectId) {
      await writeAuditLog({
        actorId: actorObjectId,
        actorRole: 'admin',
        action: 'development_transaction.pool_ensured',
        resourceType: 'DevelopmentTransaction',
        resourceId: 'pool',
        severity: 'info',
        meta: { issued, available },
      });
    }
  }

  return { issued, available };
}

export async function listDevelopmentTransactions(opts: {
  planCode?: string;
  status?: string;
  limit?: number;
} = {}) {
  await expireStale();
  const filter: Record<string, unknown> = {};
  if (opts.planCode) filter.planCode = String(opts.planCode).toUpperCase();
  if (opts.status) filter.status = opts.status;
  const rows = await DevelopmentTransaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, opts.limit || 100)))
    .lean();
  return rows.map((r) => serialize(r as unknown as IDevelopmentTransaction));
}

export async function listAvailableForTechnician(userId: string, planCode?: string) {
  const gate = await isDevelopmentTransactionVerificationEnabled(userId);
  if (!gate.enabled) {
    return { enabled: false as const, reason: gate.reason, platformMode: gate.platformMode, items: [] };
  }
  await ensureDevelopmentTransactionPool(`technician:${userId}`);
  const filter: Record<string, unknown> = {
    status: 'available',
    expiresAt: { $gt: new Date() },
  };
  if (planCode) filter.planCode = String(planCode).toUpperCase();
  const rows = await DevelopmentTransaction.find(filter).sort({ createdAt: 1 }).limit(50).lean();
  return {
    enabled: true as const,
    platformMode: gate.platformMode,
    instructions:
      'Use a Development Transaction ID to activate this plan for testing. No Mobile Money payment is required.',
    items: rows.map((r) => serialize(r as unknown as IDevelopmentTransaction)),
  };
}

/**
 * Claim a Development Transaction ID for the Permanent Development Technician.
 * Marks claimed → caller creates SubscriptionPayment → markConsumed after approve.
 */
export async function claimDevelopmentTransaction(input: {
  userId: string;
  code: string;
  planCode: string;
}): Promise<IDevelopmentTransaction> {
  const gate = await isDevelopmentTransactionVerificationEnabled(input.userId);
  if (!gate.enabled) {
    throw AppError.forbidden(gate.reason || 'Development Transaction verification is unavailable');
  }

  const code = String(input.code || '').trim().toUpperCase();
  if (!isDevTransactionCode(code)) {
    throw AppError.badRequest('Invalid Development Transaction ID format');
  }

  const expectedPlan = planCodeFromDevTx(code);
  const planCode = String(input.planCode || '').toUpperCase();
  if (!expectedPlan || expectedPlan !== planCode) {
    throw AppError.badRequest(
      `Development Transaction ID ${code} does not match plan ${planCode}`,
    );
  }

  await expireStale();
  const doc = await DevelopmentTransaction.findOne({ code });
  if (!doc) throw AppError.notFound('Development Transaction ID not found');
  if (doc.status === 'expired' || (doc.expiresAt && doc.expiresAt.getTime() <= Date.now())) {
    doc.status = 'expired';
    await doc.save();
    throw AppError.badRequest('This Development Transaction ID has expired');
  }
  if (doc.status === 'revoked') throw AppError.badRequest('This Development Transaction ID was revoked');
  if (doc.status === 'consumed') {
    throw AppError.conflict('This Development Transaction ID was already used');
  }
  if (doc.status === 'claimed' && doc.claimedByUserId?.toString() !== input.userId) {
    throw AppError.conflict('This Development Transaction ID is claimed by another session');
  }

  if (doc.status === 'available') {
    doc.status = 'claimed';
    doc.claimedAt = new Date();
    doc.claimedByUserId = new Types.ObjectId(input.userId);
    doc.usageHistory = [
      ...(doc.usageHistory || []),
      {
        at: new Date(),
        action: 'claimed',
        actorId: input.userId,
        note: `Claimed for ${planCode}`,
      },
    ].slice(-50);
    await doc.save();
  }

  return doc;
}

export async function markDevelopmentTransactionConsumed(input: {
  code: string;
  userId: string;
  paymentId: string;
  subscriptionId?: string;
}) {
  const code = String(input.code || '').trim().toUpperCase();
  const doc = await DevelopmentTransaction.findOne({ code });
  if (!doc) return null;
  doc.status = 'consumed';
  doc.consumedAt = new Date();
  doc.paymentId = new Types.ObjectId(input.paymentId);
  if (input.subscriptionId) doc.subscriptionId = new Types.ObjectId(input.subscriptionId);
  doc.usageHistory = [
    ...(doc.usageHistory || []),
    {
      at: new Date(),
      action: 'consumed',
      actorId: input.userId,
      note: 'Auto-verified — entitlements activated via existing subscription engine',
      paymentId: input.paymentId,
      subscriptionId: input.subscriptionId,
    },
  ].slice(-50);
  await doc.save();

  await writeAuditLog({
    actorId: input.userId,
    actorRole: 'technician',
    action: 'development_transaction.consumed',
    resourceType: 'DevelopmentTransaction',
    resourceId: doc._id.toString(),
    severity: 'info',
    meta: { code, paymentId: input.paymentId, subscriptionId: input.subscriptionId },
  });

  return serialize(doc);
}

export async function revokeDevelopmentTransaction(
  code: string,
  actor: { userId: string },
  reason?: string,
) {
  const doc = await DevelopmentTransaction.findOne({ code: String(code).trim().toUpperCase() });
  if (!doc) throw AppError.notFound('Development Transaction ID not found');
  if (doc.status === 'consumed') {
    throw AppError.badRequest('Consumed Development Transaction IDs cannot be revoked');
  }
  doc.status = 'revoked';
  doc.revokedAt = new Date();
  doc.revokedBy = actor.userId;
  doc.revokeReason = String(reason || 'Revoked by administrator').slice(0, 500);
  doc.usageHistory = [
    ...(doc.usageHistory || []),
    {
      at: new Date(),
      action: 'revoked',
      actorId: actor.userId,
      note: doc.revokeReason,
    },
  ].slice(-50);
  await doc.save();
  await ensureDevelopmentTransactionPool(`admin:${actor.userId}`);
  return serialize(doc);
}

export async function getDevelopmentTransactionOverview() {
  await expireStale();
  const [pool, items] = await Promise.all([
    ensureDevelopmentTransactionPool('system:overview'),
    listDevelopmentTransactions({ limit: 100 }),
  ]);
  return {
    pool,
    items,
    prefixes: DEV_TX_PLAN_PREFIXES,
    permanentDevelopmentTechnicianEmail: DEVELOPER_TECHNICIAN.email,
    note:
      'Development Transaction IDs are a verification source only. They activate Starter / Professional / Business through the same entitlement engine.',
  };
}

export const developmentTransactionService = {
  isDevTransactionCode,
  planCodeFromDevTx,
  isPermanentDevelopmentTechnician,
  isDevelopmentTransactionVerificationEnabled,
  ensureDevelopmentTransactionPool,
  listDevelopmentTransactions,
  listAvailableForTechnician,
  claimDevelopmentTransaction,
  markDevelopmentTransactionConsumed,
  revokeDevelopmentTransaction,
  getDevelopmentTransactionOverview,
  findPermanentDevelopmentTechnicianUser,
};
