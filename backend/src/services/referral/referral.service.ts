import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { Types } from 'mongoose';
import {
  Referral,
  ReferralCampaign,
  ReferralEvent,
  ReferralReward,
  TechnicianProfile,
  User,
  type IReferral,
  type IReferralCampaign,
  type ReferralTrigger,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { createDbNotification } from '../../utils/notify.js';
import { escapeRegex, paginationMeta, parsePagination } from '../../utils/pagination.js';

function oid(id: string) {
  return new Types.ObjectId(id);
}

function hashValue(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function uniqueReferralCode(base: string): string {
  return `${normalizeCode(base)}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function serializeCampaign(doc: IReferralCampaign) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    inviteRole: doc.inviteRole,
    trigger: doc.trigger,
    rewardType: doc.rewardType,
    rewardAmount: doc.rewardAmount,
    currency: doc.currency,
    maxRewards: doc.maxRewards,
    rewardsIssued: doc.rewardsIssued,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    status: doc.status,
    createdByAdminId: doc.createdByAdminId.toString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeReferral(doc: IReferral) {
  return {
    id: doc._id.toString(),
    referrerId: doc.referrerId.toString(),
    referredUserId: doc.referredUserId?.toString(),
    campaignId: doc.campaignId?.toString(),
    code: doc.code,
    status: doc.status,
    channel: doc.channel,
    inviteRole: doc.inviteRole,
    completedAt: doc.completedAt,
    expiresAt: doc.expiresAt,
    fraudFlags: doc.fraudFlags,
    milestonesCompleted: doc.milestonesCompleted,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeReward(doc: InstanceType<typeof ReferralReward>) {
  return {
    id: doc._id.toString(),
    referralId: doc.referralId.toString(),
    campaignId: doc.campaignId?.toString(),
    userId: doc.userId.toString(),
    rewardType: doc.rewardType,
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    grantedAt: doc.grantedAt,
    note: doc.note,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function findActiveCampaign(role: 'technician' | 'customer', trigger?: ReferralTrigger) {
  const now = new Date();
  const filter: Record<string, unknown> = {
    status: 'active',
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    $or: [{ inviteRole: role }, { inviteRole: 'both' }],
  };
  if (trigger) filter.trigger = trigger;
  return ReferralCampaign.findOne(filter).sort({ startsAt: -1 });
}

async function applyCreditReward(userId: string, rewardType: string, amount: number) {
  if (rewardType === 'free_job_credit') {
    await TechnicianProfile.updateOne({ userId: oid(userId) }, { $inc: { freeJobLimit: amount } });
    return;
  }
  if (rewardType === 'lead_credit') {
    await TechnicianProfile.updateOne({ userId: oid(userId) }, { $inc: { leadCredits: amount } });
    return;
  }
  if (rewardType === 'points') {
    await User.updateOne({ _id: oid(userId) }, { $inc: { loyaltyPoints: amount } });
  }
}

export const referralService = {
  async getMine(userId: string) {
    const user = await User.findById(userId).select('referralCode role loyaltyPoints');
    if (!user) throw AppError.notFound('User not found');

    const [referrals, rewards, campaigns] = await Promise.all([
      Referral.find({ referrerId: oid(userId) }).sort({ createdAt: -1 }).limit(100),
      ReferralReward.find({ userId: oid(userId) }).sort({ createdAt: -1 }).limit(100),
      ReferralCampaign.find({
        status: 'active',
        startsAt: { $lte: new Date() },
        endsAt: { $gte: new Date() },
        $or: [{ inviteRole: user.role }, { inviteRole: 'both' }],
      })
        .select('name description inviteRole trigger rewardType rewardAmount currency maxRewards rewardsIssued')
        .sort({ startsAt: -1 }),
    ]);

    const pending = referrals.filter((r) => ['pending', 'accepted'].includes(r.status)).length;
    const successful = referrals.filter((r) => r.status === 'completed').length;
    const rewardsEarned = rewards
      .filter((r) => r.status === 'granted')
      .reduce((sum, r) => sum + r.amount, 0);
    const rewardsPending = rewards.filter((r) => r.status === 'pending').length;

    return {
      code: user.referralCode,
      referrals: referrals.map(serializeReferral),
      rewards: rewards.map(serializeReward),
      campaigns: campaigns.map(serializeCampaign),
      stats: {
        pending,
        successful,
        rewardsEarned,
        rewardsPending,
      },
    };
  },

  async applyCode(
    userId: string,
    code: string,
    meta: { deviceFingerprint?: string; role?: 'technician' | 'customer' } = {},
  ) {
    const normalized = normalizeCode(code);
    if (!normalized) throw AppError.badRequest('Referral code is required');

    const referred = await User.findById(userId);
    if (!referred) throw AppError.notFound('User not found');

    const referrer = await User.findOne({ referralCode: normalized });
    if (!referrer) throw AppError.notFound('Invalid referral code');

    if (referrer._id.toString() === userId) {
      throw AppError.badRequest('You cannot use your own referral code');
    }

    const existing = await Referral.findOne({ referredUserId: oid(userId) });
    if (existing) throw AppError.conflict('Referral already applied for this account');

    const emailHash = referred.email ? hashValue(referred.email) : undefined;
    const phoneHash = referred.phone ? hashValue(referred.phone) : undefined;
    const fraudFlags: string[] = [];

    if (emailHash) {
      const dupEmail = await Referral.findOne({ emailHash, referredUserId: { $ne: oid(userId) } });
      if (dupEmail) fraudFlags.push('duplicate_email_hash');
    }
    if (phoneHash) {
      const dupPhone = await Referral.findOne({ phoneHash, referredUserId: { $ne: oid(userId) } });
      if (dupPhone) fraudFlags.push('duplicate_phone_hash');
    }

    const deviceFingerprint = meta.deviceFingerprint?.slice(0, 128);
    if (deviceFingerprint) {
      const dupDevice = await Referral.findOne({
        deviceFingerprint,
        referrerId: referrer._id,
        referredUserId: { $ne: oid(userId) },
      });
      if (dupDevice) fraudFlags.push('duplicate_device_fingerprint');
    }

    const inviteRole =
      meta.role === 'technician' || meta.role === 'customer'
        ? meta.role
        : referred.role === 'technician' || referred.role === 'customer'
          ? referred.role
          : 'customer';

    const campaign = await findActiveCampaign(inviteRole);
    const status = fraudFlags.length ? 'fraud_hold' : 'accepted';

    const referral = await Referral.create({
      referrerId: referrer._id,
      referredUserId: oid(userId),
      campaignId: campaign?._id,
      code: uniqueReferralCode(normalized),
      status,
      inviteRole,
      deviceFingerprint,
      emailHash,
      phoneHash,
      fraudFlags,
      milestonesCompleted: [],
    });

    await ReferralEvent.create({
      referralId: referral._id,
      campaignId: campaign?._id,
      actorUserId: oid(userId),
      type: status === 'fraud_hold' ? 'code_flagged' : 'code_accepted',
      meta: { code: normalized, fraudFlags, deviceFingerprint },
    });

    await writeAuditLog({
      actorId: userId,
      actorRole: referred.role,
      action: 'referral.code_applied',
      resourceType: 'Referral',
      resourceId: referral._id.toString(),
      meta: { referrerId: referrer._id.toString(), code: normalized, status },
    });

    return { referral: serializeReferral(referral) };
  },

  async recordMilestone(userId: string, trigger: ReferralTrigger) {
    const referral = await Referral.findOne({
      referredUserId: oid(userId),
      status: { $in: ['accepted', 'pending'] },
    }).sort({ createdAt: -1 });

    if (!referral) return { recorded: false, reason: 'no_referral' };
    if (referral.fraudFlags.length || referral.status === 'fraud_hold') {
      return { recorded: false, reason: 'fraud_hold' };
    }
    if (referral.milestonesCompleted.includes(trigger)) {
      return { recorded: false, reason: 'already_completed' };
    }

    const campaign = referral.campaignId
      ? await ReferralCampaign.findById(referral.campaignId)
      : await findActiveCampaign(referral.inviteRole || 'customer', trigger);

    if (!campaign || campaign.status !== 'active') {
      return { recorded: false, reason: 'no_campaign' };
    }
    if (campaign.trigger !== trigger) {
      return { recorded: false, reason: 'trigger_mismatch' };
    }

    referral.milestonesCompleted.push(trigger);
    if (!referral.campaignId) referral.campaignId = campaign._id;

    let reward: ReturnType<typeof serializeReward> | undefined;
    try {
      reward = await this.grantReward(referral, campaign);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) {
        return { recorded: false, reason: 'reward_limit_reached' };
      }
      throw err;
    }

    referral.status = 'completed';
    referral.completedAt = new Date();
    await referral.save();

    await ReferralEvent.create({
      referralId: referral._id,
      campaignId: campaign._id,
      actorUserId: oid(userId),
      type: 'milestone_completed',
      meta: { trigger },
    });

    return { recorded: true, referral: serializeReferral(referral), reward };
  },

  async grantReward(referral: IReferral, campaign: IReferralCampaign) {
    if (campaign.maxRewards != null && campaign.rewardsIssued >= campaign.maxRewards) {
      throw AppError.badRequest('Campaign reward limit reached');
    }

    const reward = await ReferralReward.create({
      referralId: referral._id,
      campaignId: campaign._id,
      userId: referral.referrerId,
      rewardType: campaign.rewardType,
      amount: campaign.rewardAmount,
      currency: campaign.currency,
      status: 'pending',
    });

    await applyCreditReward(referral.referrerId.toString(), campaign.rewardType, campaign.rewardAmount);

    reward.status = 'granted';
    reward.grantedAt = new Date();
    await reward.save();

    campaign.rewardsIssued += 1;
    await campaign.save();

    await createDbNotification({
      userId: referral.referrerId.toString(),
      type: 'referral_reward',
      title: 'Referral reward earned',
      body: `You earned a ${campaign.rewardType.replace(/_/g, ' ')} reward from ${campaign.name}.`,
      href: '/technician/referrals',
      meta: {
        referralId: referral._id.toString(),
        campaignId: campaign._id.toString(),
        rewardType: campaign.rewardType,
        amount: campaign.rewardAmount,
      },
    });

    await ReferralEvent.create({
      referralId: referral._id,
      campaignId: campaign._id,
      actorUserId: referral.referrerId,
      type: 'reward_granted',
      meta: {
        rewardId: reward._id.toString(),
        rewardType: campaign.rewardType,
        amount: campaign.rewardAmount,
      },
    });

    return serializeReward(reward);
  },

  async adminListCampaigns(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (q) filter.name = new RegExp(escapeRegex(q), 'i');

    const [total, rows] = await Promise.all([
      ReferralCampaign.countDocuments(filter),
      ReferralCampaign.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ]);

    return {
      items: rows.map(serializeCampaign),
      meta: paginationMeta(total, page, limit),
    };
  },

  async adminCreateCampaign(adminId: string, body: Record<string, unknown>) {
    const name = String(body.name || '').trim();
    if (!name) throw AppError.badRequest('Campaign name is required');
    if (!body.trigger || !body.rewardType || body.rewardAmount == null) {
      throw AppError.badRequest('trigger, rewardType, and rewardAmount are required');
    }

    const doc = await ReferralCampaign.create({
      name: name.slice(0, 120),
      description: typeof body.description === 'string' ? body.description.slice(0, 2000) : undefined,
      inviteRole:
        body.inviteRole === 'technician' || body.inviteRole === 'customer' || body.inviteRole === 'both'
          ? body.inviteRole
          : 'both',
      trigger: String(body.trigger) as ReferralTrigger,
      rewardType: String(body.rewardType),
      rewardAmount: Number(body.rewardAmount),
      currency: typeof body.currency === 'string' ? body.currency.slice(0, 3) : 'UGX',
      maxRewards: body.maxRewards != null ? Number(body.maxRewards) : undefined,
      rewardsIssued: 0,
      startsAt: body.startsAt ? new Date(String(body.startsAt)) : new Date(),
      endsAt: body.endsAt
        ? new Date(String(body.endsAt))
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: body.status === 'active' ? 'active' : 'draft',
      createdByAdminId: oid(adminId),
    });

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'referral.campaign.created',
      resourceType: 'ReferralCampaign',
      resourceId: doc._id.toString(),
    });

    return { campaign: serializeCampaign(doc) };
  },

  async adminUpdateCampaign(adminId: string, id: string, body: Record<string, unknown>) {
    const doc = await ReferralCampaign.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Campaign not found');

    for (const key of ['name', 'description', 'currency'] as const) {
      if (body[key] != null) (doc as Record<string, unknown>)[key] = body[key];
    }
    if (body.inviteRole === 'technician' || body.inviteRole === 'customer' || body.inviteRole === 'both') {
      doc.inviteRole = body.inviteRole;
    }
    if (body.trigger) doc.trigger = String(body.trigger) as ReferralTrigger;
    if (body.rewardType) doc.rewardType = String(body.rewardType) as IReferralCampaign['rewardType'];
    if (body.rewardAmount != null) doc.rewardAmount = Number(body.rewardAmount);
    if (body.maxRewards != null) doc.maxRewards = Number(body.maxRewards);
    if (body.startsAt) doc.startsAt = new Date(String(body.startsAt));
    if (body.endsAt) doc.endsAt = new Date(String(body.endsAt));

    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'referral.campaign.updated',
      resourceType: 'ReferralCampaign',
      resourceId: id,
    });
    return { campaign: serializeCampaign(doc) };
  },

  async adminSetCampaignStatus(
    adminId: string,
    id: string,
    status: 'draft' | 'active' | 'paused' | 'expired' | 'archived',
  ) {
    const doc = await ReferralCampaign.findById(id);
    if (!doc || doc.isDeleted) throw AppError.notFound('Campaign not found');
    doc.status = status;
    await doc.save();
    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `referral.campaign.${status}`,
      resourceType: 'ReferralCampaign',
      resourceId: id,
    });
    return { campaign: serializeCampaign(doc) };
  },

  async adminAdjustReward(
    adminId: string,
    rewardId: string,
    input: { amount?: number; status?: 'pending' | 'granted' | 'revoked'; note?: string },
  ) {
    const reward = await ReferralReward.findById(rewardId);
    if (!reward || reward.isDeleted) throw AppError.notFound('Reward not found');

    if (input.amount != null) reward.amount = Number(input.amount);
    if (input.note != null) reward.note = input.note.slice(0, 500);
    if (input.status) {
      reward.status = input.status;
      if (input.status === 'granted') reward.grantedAt = new Date();
    }
    reward.adjustedByAdminId = oid(adminId);
    await reward.save();

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'referral.reward.adjusted',
      resourceType: 'ReferralReward',
      resourceId: rewardId,
      meta: input,
    });

    return { reward: serializeReward(reward) };
  },

  async adminListReferrals(req: Request) {
    const { page, limit, skip } = parsePagination(req, { limit: 50 });
    const status = String(req.query.status || '').trim();
    const referrerId = String(req.query.referrerId || '').trim();
    const q = String(req.query.q || '').trim();
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (referrerId && /^[a-f\d]{24}$/i.test(referrerId)) filter.referrerId = oid(referrerId);
    if (q) filter.code = new RegExp(escapeRegex(q), 'i');

    const [total, rows] = await Promise.all([
      Referral.countDocuments(filter),
      Referral.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    return {
      items: rows.map(serializeReferral),
      meta: paginationMeta(total, page, limit),
    };
  },

  async ensureDefaultCampaigns(adminId: string) {
    const now = new Date();
    const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const defaults = [
      {
        name: 'Invite technician',
        description: 'Reward technicians when invited peers complete their first paid job.',
        inviteRole: 'technician' as const,
        trigger: 'first_paid_job' as ReferralTrigger,
        rewardType: 'free_job_credit' as const,
        rewardAmount: 2,
      },
      {
        name: 'Invite customer',
        description: 'Reward referrers when invited customers complete their first booking.',
        inviteRole: 'customer' as const,
        trigger: 'first_booking' as ReferralTrigger,
        rewardType: 'points' as const,
        rewardAmount: 50,
      },
    ];

    const created: ReturnType<typeof serializeCampaign>[] = [];
    for (const seed of defaults) {
      const existing = await ReferralCampaign.findOne({ name: seed.name });
      if (existing) {
        created.push(serializeCampaign(existing));
        continue;
      }
      const doc = await ReferralCampaign.create({
        ...seed,
        currency: 'UGX',
        rewardsIssued: 0,
        startsAt: now,
        endsAt: oneYear,
        status: 'active',
        createdByAdminId: oid(adminId),
      });
      created.push(serializeCampaign(doc));
    }

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: 'referral.campaigns.seeded',
      resourceType: 'ReferralCampaign',
      meta: { count: created.length },
    });

    return { campaigns: created };
  },

  async onUserRegistered(
    userId: string,
    role: 'technician' | 'customer',
    opts: { referralCode?: string; deviceFingerprint?: string; phone?: string; email?: string } = {},
  ) {
    if (!opts.referralCode) return { linked: false };

    const applied = await this.applyCode(userId, opts.referralCode, {
      deviceFingerprint: opts.deviceFingerprint,
      role,
    });

    const milestone = await this.recordMilestone(userId, 'registration');

    return {
      linked: true,
      referral: applied.referral,
      registrationMilestone: milestone,
    };
  },
};
