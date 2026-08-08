/**
 * Business company team — employees, invites, dispatch, assignments, performance, availability.
 * Gated by existing entitlements (canUseTeamPlaceholders / teamManagement / dispatcher).
 */
import crypto from 'node:crypto';
import mongoose, { type HydratedDocument, Types } from 'mongoose';
import {
  Assignment,
  Company,
  CompanyInvite,
  CompanyMember,
  Job,
  JobApplication,
  TechnicianProfile,
  User,
  WorkingHours,
  type ICompany,
  type ICompanyMember,
  type CompanyMemberRole,
  type JobStatus,
} from '../../models/index.js';
import {
  APPLICATION_STATUS,
  ASSIGNMENT_STATUS,
  JOB_STATUS,
} from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { createDbNotification } from '../../utils/notify.js';
import { assertJobTransition } from '../../utils/jobTransitions.js';
import { assertCapability } from './entitlements.service.js';
import { emitTechnicianAssigned } from '../../sockets/realtime.js';

type Meta = { ip?: string };
type CompanyDocument = HydratedDocument<ICompany>;

function pushStatus(
  job: InstanceType<typeof Job>,
  status: JobStatus,
  actorId?: string,
  note?: string,
) {
  job.status = status;
  job.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: actorId ? new mongoose.Types.ObjectId(actorId) : undefined,
    note,
  });
  job.timeline.push({
    type: `status:${status}`,
    at: new Date(),
    actorId: actorId ? new mongoose.Types.ObjectId(actorId) : undefined,
    payload: note ? { note } : undefined,
  });
}

async function assertTeamAccess(userId: string) {
  return assertCapability(
    userId,
    'canUseTeamPlaceholders',
    'Team management requires an active Business plan with team tools enabled.',
  );
}

export async function ensureCompanyForOwner(userId: string): Promise<CompanyDocument> {
  await assertTeamAccess(userId);
  let company: CompanyDocument | null = await Company.findOne({ ownerUserId: userId, deletedAt: null });
  if (company) {
    await CompanyMember.findOneAndUpdate(
      { companyId: company._id, userId },
      {
        $set: { role: 'owner', status: 'active', joinedAt: new Date() },
        $setOnInsert: { companyId: company._id, userId },
      },
      { upsert: true },
    );
    return company;
  }

  const profile = (await TechnicianProfile.findOne({ userId })) as {
    companyName?: string;
    businessSlogan?: string;
    businessLogoUrl?: string;
    brandPrimaryColor?: string;
    brandSecondaryColor?: string;
    location?: { district?: string };
    _id?: Types.ObjectId;
  } | null;
  const user = (await User.findById(userId).select('fullName email')) as {
    fullName?: string;
    email?: string;
  } | null;
  company = await Company.create({
    ownerUserId: userId,
    name: profile?.companyName || `${user?.fullName || 'Business'} Company`,
    slogan: profile?.businessSlogan,
    logoUrl: profile?.businessLogoUrl,
    primaryColor: profile?.brandPrimaryColor,
    secondaryColor: profile?.brandSecondaryColor,
    district: profile?.location?.district,
    settings: { autoAssignEnabled: false, notifyOnDispatch: true },
  });

  await CompanyMember.create({
    companyId: company._id,
    userId,
    technicianProfileId: profile?._id,
    role: 'owner',
    status: 'active',
    title: 'Owner',
    joinedAt: new Date(),
  });

  return company;
}

async function requireOwnerOrDispatcher(userId: string) {
  await assertTeamAccess(userId);
  let company: CompanyDocument | null = await Company.findOne({
    ownerUserId: userId,
    deletedAt: null,
  });
  let member: ICompanyMember | null = null;

  if (company) {
    member = (await CompanyMember.findOne({
      companyId: company._id,
      userId,
      status: 'active',
      deletedAt: null,
    })) as ICompanyMember | null;
    return { company, member, isOwner: true };
  }

  member = (await CompanyMember.findOne({
    userId,
    status: 'active',
    role: { $in: ['owner', 'dispatcher'] },
    deletedAt: null,
  })) as ICompanyMember | null;
  if (!member) {
    // Auto-provision company for Business owner entitlement holders
    company = await ensureCompanyForOwner(userId);
    member = (await CompanyMember.findOne({
      companyId: company._id,
      userId,
      deletedAt: null,
    })) as ICompanyMember | null;
    return { company, member, isOwner: true };
  }

  company = await Company.findOne({ _id: member.companyId, deletedAt: null });
  if (!company) throw AppError.notFound('Company not found');
  const isOwner = company.ownerUserId.toString() === userId;
  if (!isOwner && member.role !== 'dispatcher') {
    throw AppError.forbidden('Only company owners and dispatchers can manage the team.');
  }
  return { company, member, isOwner };
}

function serializeCompany(company: ICompany) {
  return {
    id: company._id.toString(),
    ownerUserId: company.ownerUserId.toString(),
    name: company.name,
    slogan: company.slogan || null,
    logoUrl: company.logoUrl || null,
    primaryColor: company.primaryColor || null,
    secondaryColor: company.secondaryColor || null,
    district: company.district || null,
    settings: company.settings,
  };
}

async function serializeMember(member: ICompanyMember) {
  const [user, profile, activeJobs] = await Promise.all([
    User.findById(member.userId).select('fullName email phone'),
    TechnicianProfile.findOne({ userId: member.userId }),
    Job.countDocuments({
      assignedTechnicianId: member.userId,
      status: {
        $in: [
          JOB_STATUS.ASSIGNED,
          JOB_STATUS.TECHNICIAN_EN_ROUTE,
          JOB_STATUS.IN_PROGRESS,
          JOB_STATUS.AWAITING_CONFIRMATION,
        ],
      },
      deletedAt: null,
    }),
  ]);

  return {
    id: member._id.toString(),
    userId: member.userId.toString(),
    role: member.role,
    status: member.status,
    title: member.title || null,
    joinedAt: member.joinedAt || null,
    suspendedAt: member.suspendedAt || null,
    notes: member.notes || null,
    name: user?.fullName || profile?.headline || 'Technician',
    email: user?.email || null,
    phone: user?.phone || null,
    photoUrl: profile?.photoUrl || null,
    skills: profile?.skills || [],
    rating: Number(profile?.ratingAverage || 0),
    reviewCount: Number(profile?.reviewCount || 0),
    jobsCompleted: Number(profile?.jobsCompleted || 0),
    responseScore: Number(profile?.responseScore || 0),
    completionScore: Number(profile?.completionScore || 0),
    isAvailableNow: Boolean(profile?.isAvailableNow),
    availability: profile?.isAvailableNow ? 'available' : 'offline',
    activeJobs,
    district: profile?.location?.district || null,
  };
}

function serializeJobBrief(job: InstanceType<typeof Job>) {
  return {
    id: job._id.toString(),
    title: job.title || 'Job',
    status: job.status,
    categoryName: job.categoryName || null,
    district: job.location?.district || job.location?.city || null,
    assignedTechnicianId: job.assignedTechnicianId?.toString() || null,
    preferredDate: job.preferredDate || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    budgetMin: job.budgetMin ?? null,
    budgetMax: job.budgetMax ?? null,
  };
}

export async function getTeamOverview(userId: string) {
  const { company } = await requireOwnerOrDispatcher(userId);
  const user = await User.findById(userId).select('email');
  const [members, invites, pendingInvitesForMe] = await Promise.all([
    CompanyMember.find({ companyId: company._id, status: { $ne: 'removed' }, deletedAt: null }).sort({
      role: 1,
      createdAt: 1,
    }),
    CompanyInvite.find({ companyId: company._id, status: 'pending', deletedAt: null }).sort({
      createdAt: -1,
    }),
    user?.email
      ? CompanyInvite.find({
          email: user.email.toLowerCase(),
          status: 'pending',
          expiresAt: { $gt: new Date() },
          deletedAt: null,
        }).limit(5)
      : Promise.resolve([]),
  ]);

  const serializedMembers = await Promise.all(members.map((m) => serializeMember(m)));
  return {
    company: serializeCompany(company),
    members: serializedMembers,
    invites: invites.map((i) => ({
      id: i._id.toString(),
      email: i.email,
      role: i.role,
      status: i.status,
      expiresAt: i.expiresAt,
      message: i.message || null,
      createdAt: i.createdAt,
    })),
    myPendingInvites: pendingInvitesForMe.map((i) => ({
      id: i._id.toString(),
      token: i.token,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      companyId: i.companyId.toString(),
    })),
    counts: {
      active: serializedMembers.filter((m) => m.status === 'active').length,
      suspended: serializedMembers.filter((m) => m.status === 'suspended').length,
      invited: invites.length,
    },
  };
}

export async function inviteEmployee(
  userId: string,
  input: { email: string; role?: 'dispatcher' | 'employee'; message?: string },
  meta: Meta = {},
) {
  const { company, isOwner } = await requireOwnerOrDispatcher(userId);
  if (!isOwner && input.role === 'dispatcher') {
    throw AppError.forbidden('Only the company owner can invite dispatchers.');
  }
  const email = String(input.email || '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) throw AppError.badRequest('Enter a valid email address.');

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const already = await CompanyMember.findOne({
      companyId: company._id,
      userId: existingUser._id,
      status: { $in: ['active', 'invited', 'suspended'] },
      deletedAt: null,
    });
    if (already) throw AppError.conflict('That technician is already on your team.');
  }

  const existingInvite = await CompanyInvite.findOne({
    companyId: company._id,
    email,
    status: 'pending',
    deletedAt: null,
  });
  if (existingInvite) throw AppError.conflict('An invitation is already pending for that email.');

  const token = crypto.randomBytes(24).toString('hex');
  const invite = await CompanyInvite.create({
    companyId: company._id,
    email,
    role: input.role === 'dispatcher' ? 'dispatcher' : 'employee',
    status: 'pending',
    token,
    invitedBy: userId,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    message: input.message?.slice(0, 500),
  });

  if (existingUser) {
    await createDbNotification({
      userId: existingUser._id.toString(),
      type: 'company.invite',
      title: `Join ${company.name}`,
      body: `You were invited to join ${company.name} on FixNow as ${invite.role}. Open Team to accept.`,
      bypassQuietHours: true,
    });
  }

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'company.invite',
    resourceType: 'CompanyInvite',
    resourceId: invite._id.toString(),
    ip: meta.ip,
    meta: { email, role: invite.role, companyId: company._id.toString() },
  });

  return {
    invite: {
      id: invite._id.toString(),
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      status: invite.status,
    },
    message: existingUser
      ? 'Invitation sent. They will see it in notifications.'
      : 'Invitation created. Ask them to register as a technician with this email, then accept from Team.',
  };
}

export async function acceptInvite(userId: string, token: string, meta: Meta = {}) {
  const invite = await CompanyInvite.findOne({ token: String(token || '').trim(), deletedAt: null });
  if (!invite) throw AppError.notFound('Invitation not found');
  if (invite.status !== 'pending') throw AppError.badRequest('This invitation is no longer pending');
  if (invite.expiresAt.getTime() < Date.now()) {
    invite.status = 'expired';
    await invite.save();
    throw AppError.badRequest('This invitation has expired');
  }

  const user = await User.findById(userId).select('email name');
  if (!user) throw AppError.unauthorized();
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    throw AppError.forbidden('Sign in with the invited email address to accept.');
  }

  const profile = await TechnicianProfile.findOne({ userId });
  if (!profile) throw AppError.badRequest('Complete your technician profile before joining a company.');

  const company = await Company.findById(invite.companyId);
  if (!company || company.deletedAt) throw AppError.notFound('Company not found');

  invite.status = 'accepted';
  invite.acceptedByUserId = userId as unknown as Types.ObjectId;
  await invite.save();

  const member = await CompanyMember.findOneAndUpdate(
    { companyId: company._id, userId },
    {
      $set: {
        role: invite.role === 'owner' ? 'employee' : invite.role,
        status: 'active',
        technicianProfileId: profile._id,
        invitedBy: invite.invitedBy,
        joinedAt: new Date(),
        suspendedAt: null,
      },
      $setOnInsert: { companyId: company._id, userId },
    },
    { upsert: true, new: true },
  );

  await createDbNotification({
    userId: company.ownerUserId.toString(),
    type: 'company.invite_accepted',
    title: 'Team invite accepted',
    body: `${user.fullName || user.email} joined ${company.name}.`,
    bypassQuietHours: true,
  });

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'company.invite_accept',
    resourceType: 'CompanyMember',
    resourceId: member!._id.toString(),
    ip: meta.ip,
  });

  return { company: serializeCompany(company), member: await serializeMember(member!) };
}

export async function updateMember(
  actorId: string,
  memberId: string,
  input: {
    role?: CompanyMemberRole;
    status?: 'active' | 'suspended' | 'removed';
    title?: string;
    notes?: string;
  },
  meta: Meta = {},
) {
  const { company, isOwner } = await requireOwnerOrDispatcher(actorId);
  const member = await CompanyMember.findOne({ _id: memberId, companyId: company._id, deletedAt: null });
  if (!member) throw AppError.notFound('Team member not found');
  if (member.role === 'owner' || member.userId.toString() === company.ownerUserId.toString()) {
    throw AppError.badRequest('The company owner cannot be changed this way.');
  }

  if (input.role) {
    if (!isOwner) throw AppError.forbidden('Only the owner can change roles.');
    if (input.role === 'owner') throw AppError.badRequest('Cannot assign owner role.');
    member.role = input.role;
  }
  if (input.status === 'suspended') {
    member.status = 'suspended';
    member.suspendedAt = new Date();
  } else if (input.status === 'active') {
    member.status = 'active';
    member.suspendedAt = undefined;
  } else if (input.status === 'removed') {
    member.status = 'removed';
    member.deletedAt = new Date();
  }
  if (typeof input.title === 'string') member.title = input.title.slice(0, 80);
  if (typeof input.notes === 'string') member.notes = input.notes.slice(0, 500);
  await member.save();

  if (member.status === 'suspended' || member.status === 'removed') {
    await createDbNotification({
      userId: member.userId.toString(),
      type: 'company.member_updated',
      title: member.status === 'suspended' ? 'Team access suspended' : 'Removed from company team',
      body: `Your membership in ${company.name} was updated.`,
      bypassQuietHours: true,
    });
  }

  await writeAuditLog({
    actorId,
    actorRole: 'technician',
    action: 'company.member_update',
    resourceType: 'CompanyMember',
    resourceId: member._id.toString(),
    ip: meta.ip,
    meta: input as Record<string, unknown>,
  });

  return serializeMember(member);
}

async function buildRecommendations(
  members: ICompanyMember[],
  job?: InstanceType<typeof Job> | null,
) {
  const active = members.filter((m) => m.status === 'active');
  const jobDistrict = String(job?.location?.district || job?.location?.city || '')
    .trim()
    .toLowerCase();
  const jobCategory = String(job?.categoryName || job?.title || '')
    .trim()
    .toLowerCase();

  const scored = await Promise.all(
    active.map(async (m) => {
      const profile = await TechnicianProfile.findOne({ userId: m.userId });
      const user = await User.findById(m.userId).select('fullName');
      const workload = await Job.countDocuments({
        assignedTechnicianId: m.userId,
        status: {
          $in: [JOB_STATUS.ASSIGNED, JOB_STATUS.TECHNICIAN_EN_ROUTE, JOB_STATUS.IN_PROGRESS],
        },
        deletedAt: null,
      });
      const available = Boolean(profile?.isAvailableNow);
      const rating = Number(profile?.ratingAverage || 0);
      const responseScore = Number(profile?.responseScore || 0);
      const skills = (profile?.skills || []).map((s) => String(s).toLowerCase());
      const techDistrict = String(profile?.location?.district || '')
        .trim()
        .toLowerCase();
      const skillMatch =
        jobCategory && skills.length
          ? skills.some((s) => jobCategory.includes(s) || s.includes(jobCategory.split(' ')[0] || ''))
            ? 20
            : 0
          : 5;
      const distanceMatch =
        jobDistrict && techDistrict
          ? jobDistrict === techDistrict
            ? 15
            : jobDistrict.includes(techDistrict) || techDistrict.includes(jobDistrict)
              ? 8
              : 0
          : 5;
      const score =
        (available ? 35 : 0) +
        Math.min(20, rating * 4) +
        Math.min(15, responseScore / 5) +
        Math.max(0, 15 - workload * 5) +
        skillMatch +
        distanceMatch;
      return {
        memberId: m._id.toString(),
        userId: m.userId.toString(),
        role: m.role,
        name: user?.fullName || profile?.headline || 'Technician',
        available,
        workload,
        rating,
        responseScore,
        skillMatch: skillMatch > 0,
        districtMatch: distanceMatch >= 8,
        score: Math.round(score),
        district: profile?.location?.district || null,
        skills: profile?.skills || [],
      };
    }),
  );
  return scored.sort((a, b) => b.score - a.score);
}

/** Pending invites for the signed-in technician (no Business entitlement required). */
export async function listMyInvites(userId: string) {
  const user = await User.findById(userId).select('email');
  if (!user?.email) return { invites: [] as Array<Record<string, unknown>> };
  const invites = await CompanyInvite.find({
    email: user.email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() },
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .limit(20);
  const companies = await Company.find({
    _id: { $in: invites.map((i) => i.companyId) },
    deletedAt: null,
  }).select('name');
  const nameById = new Map(companies.map((c) => [c._id.toString(), c.name]));
  return {
    invites: invites.map((i) => ({
      id: i._id.toString(),
      token: i.token,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      companyId: i.companyId.toString(),
      companyName: nameById.get(i.companyId.toString()) || 'Company',
      message: i.message || null,
    })),
  };
}

export async function listDispatchQueue(userId: string) {
  const { company } = await requireOwnerOrDispatcher(userId);
  const members = await CompanyMember.find({
    companyId: company._id,
    status: 'active',
    deletedAt: null,
  });
  const memberIds = members.map((m) => m.userId);
  const assignable = members.filter((m) => m.role !== 'owner' || members.length === 1);

  let [assigned, openJobs] = await Promise.all([
    Job.find({
      assignedTechnicianId: { $in: memberIds },
      status: {
        $in: [
          JOB_STATUS.ASSIGNED,
          JOB_STATUS.TECHNICIAN_EN_ROUTE,
          JOB_STATUS.IN_PROGRESS,
          JOB_STATUS.AWAITING_CONFIRMATION,
        ],
      },
      deletedAt: null,
    })
      .sort({ updatedAt: -1 })
      .limit(40),
    Job.find({ status: JOB_STATUS.POSTED, deletedAt: null }).sort({ createdAt: -1 }).limit(40),
  ]);

  let autoAssigned = 0;
  if (company.settings?.autoAssignEnabled && openJobs.length && assignable.length) {
    for (const job of openJobs.slice(0, 5)) {
      const recs = await buildRecommendations(assignable, job);
      const pick = recs.find((r) => r.available) || recs[0];
      if (!pick) continue;
      try {
        await dispatchAssign(
          userId,
          {
            jobId: job._id.toString(),
            technicianUserId: pick.userId,
            note: 'Auto-assigned by company rules',
          },
          {},
        );
        autoAssigned += 1;
      } catch {
        /* skip jobs that cannot transition */
      }
    }
    if (autoAssigned > 0) {
      ;[assigned, openJobs] = await Promise.all([
        Job.find({
          assignedTechnicianId: { $in: memberIds },
          status: {
            $in: [
              JOB_STATUS.ASSIGNED,
              JOB_STATUS.TECHNICIAN_EN_ROUTE,
              JOB_STATUS.IN_PROGRESS,
              JOB_STATUS.AWAITING_CONFIRMATION,
            ],
          },
          deletedAt: null,
        })
          .sort({ updatedAt: -1 })
          .limit(40),
        Job.find({ status: JOB_STATUS.POSTED, deletedAt: null }).sort({ createdAt: -1 }).limit(40),
      ]);
    }
  }

  const applications = await JobApplication.find({
    jobId: { $in: openJobs.map((j) => j._id) },
    technicianId: { $in: memberIds },
    status: { $in: [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.SHORTLISTED] },
  });
  const appliedJobIds = new Set(applications.map((a) => a.jobId.toString()));
  const primaryJob = openJobs[0] || assigned[0] || null;

  return {
    company: serializeCompany(company),
    autoAssigned,
    queue: {
      active: assigned.map((j) => serializeJobBrief(j)),
      open: openJobs.map((j) => ({
        ...serializeJobBrief(j),
        hasTeamApplication: appliedJobIds.has(j._id.toString()),
      })),
    },
    recommendations: await buildRecommendations(assignable.length ? assignable : members, primaryJob),
  };
}

export async function dispatchAssign(
  actorId: string,
  input: { jobId: string; technicianUserId: string; note?: string },
  meta: Meta = {},
) {
  const { company } = await requireOwnerOrDispatcher(actorId);
  const member = await CompanyMember.findOne({
    companyId: company._id,
    userId: input.technicianUserId,
    status: 'active',
    deletedAt: null,
  });
  if (!member) throw AppError.badRequest('Choose an active team member to assign.');

  const job = await Job.findById(input.jobId);
  if (!job || job.deletedAt) throw AppError.notFound('Job not found');

  const techProfile = await TechnicianProfile.findOne({ userId: input.technicianUserId });
  if (!techProfile) throw AppError.notFound('Technician profile not found');

  const memberIds = (
    await CompanyMember.find({ companyId: company._id, status: 'active', deletedAt: null }).select('userId')
  ).map((m) => m.userId.toString());

  const isTeamJob =
    (job.assignedTechnicianId && memberIds.includes(job.assignedTechnicianId.toString())) ||
    job.status === JOB_STATUS.POSTED;
  if (!isTeamJob) {
    throw AppError.forbidden('You can only dispatch open jobs or jobs already with your team.');
  }

  if (job.assignedTechnicianId && job.assignedTechnicianId.toString() !== input.technicianUserId) {
    if (job.assignmentId) {
      await Assignment.updateOne(
        { _id: job.assignmentId },
        { $set: { status: ASSIGNMENT_STATUS.REASSIGNED } },
      );
    }
  }

  if (job.status === JOB_STATUS.POSTED) {
    assertJobTransition(job.status as JobStatus, JOB_STATUS.ASSIGNED);
    pushStatus(job, JOB_STATUS.ASSIGNED, actorId, input.note || 'Dispatched by company');
  }

  job.assignedTechnicianId = input.technicianUserId as unknown as Types.ObjectId;
  job.assignedTechnicianProfileId = techProfile._id;
  job.assignedAt = new Date();

  let assignment = job.assignmentId ? await Assignment.findById(job.assignmentId) : null;
  if (!assignment) {
    assignment = await Assignment.create({
      jobId: job._id,
      customerId: job.customerId,
      technicianId: input.technicianUserId,
      status: ASSIGNMENT_STATUS.ACTIVE,
      assignedAt: new Date(),
      notes: input.note,
    });
    job.assignmentId = assignment._id;
  } else {
    assignment.technicianId = input.technicianUserId as unknown as Types.ObjectId;
    assignment.status = ASSIGNMENT_STATUS.ACTIVE;
    assignment.assignedAt = new Date();
    if (input.note) assignment.notes = input.note;
    await assignment.save();
  }
  await job.save();

  await JobApplication.updateOne(
    {
      jobId: job._id,
      technicianId: input.technicianUserId,
      status: { $in: [APPLICATION_STATUS.PENDING, APPLICATION_STATUS.SHORTLISTED] },
    },
    { $set: { status: APPLICATION_STATUS.ACCEPTED, respondedAt: new Date() } },
  );

  if (company.settings?.notifyOnDispatch !== false) {
    await createDbNotification({
      userId: input.technicianUserId,
      type: 'company.dispatch',
      title: 'New job assignment',
      body: `You were assigned "${job.title}" by ${company.name}.`,
      jobId: job._id.toString(),
      bypassQuietHours: true,
    });
  }

  try {
    const { ensureJobConversation, postSystemMessage } = await import('../messaging/message.service.js');
    await ensureJobConversation(job._id.toString());
    await postSystemMessage(job._id.toString(), 'Company dispatch updated the assigned technician.');
  } catch {
    /* ignore */
  }

  await writeAuditLog({
    actorId,
    actorRole: 'technician',
    action: 'company.dispatch_assign',
    resourceType: 'Job',
    resourceId: job._id.toString(),
    ip: meta.ip,
    meta: { technicianUserId: input.technicianUserId, companyId: company._id.toString() },
  });

  try {
    emitTechnicianAssigned(job, null, assignment);
  } catch {
    /* ignore */
  }

  return { job: serializeJobBrief(job), assignmentId: assignment._id.toString() };
}

export async function listAssignments(userId: string, status?: string) {
  const { company } = await requireOwnerOrDispatcher(userId);
  const members = await CompanyMember.find({
    companyId: company._id,
    status: { $in: ['active', 'suspended'] },
    deletedAt: null,
  });
  const memberIds = members.map((m) => m.userId);
  const statusFilter = status
    ? { status }
    : {
        status: {
          $in: [
            JOB_STATUS.ASSIGNED,
            JOB_STATUS.TECHNICIAN_EN_ROUTE,
            JOB_STATUS.IN_PROGRESS,
            JOB_STATUS.AWAITING_CONFIRMATION,
            JOB_STATUS.COMPLETED,
            JOB_STATUS.CANCELLED,
          ],
        },
      };

  const jobs = await Job.find({
    assignedTechnicianId: { $in: memberIds },
    ...statusFilter,
    deletedAt: null,
  })
    .sort({ updatedAt: -1 })
    .limit(80);

  const memberEntries = await Promise.all(
    members.map(async (m) => [m.userId.toString(), await serializeMember(m)] as const),
  );
  const memberMap = new Map(memberEntries);

  return {
    company: serializeCompany(company),
    items: jobs.map((j) => ({
      ...serializeJobBrief(j),
      technician: j.assignedTechnicianId
        ? memberMap.get(j.assignedTechnicianId.toString()) || null
        : null,
    })),
  };
}

export async function teamPerformance(userId: string) {
  const { company } = await requireOwnerOrDispatcher(userId);
  const members = await CompanyMember.find({
    companyId: company._id,
    status: { $in: ['active', 'suspended'] },
    deletedAt: null,
  });

  const rows = await Promise.all(
    members.map(async (m) => {
      const [profile, user, completed, cancelled, active] = await Promise.all([
        TechnicianProfile.findOne({ userId: m.userId }),
        User.findById(m.userId).select('fullName'),
        Job.countDocuments({
          assignedTechnicianId: m.userId,
          status: JOB_STATUS.COMPLETED,
          deletedAt: null,
        }),
        Job.countDocuments({
          assignedTechnicianId: m.userId,
          status: JOB_STATUS.CANCELLED,
          deletedAt: null,
        }),
        Job.countDocuments({
          assignedTechnicianId: m.userId,
          status: {
            $in: [JOB_STATUS.ASSIGNED, JOB_STATUS.TECHNICIAN_EN_ROUTE, JOB_STATUS.IN_PROGRESS],
          },
          deletedAt: null,
        }),
      ]);
      const total = completed + cancelled;
      return {
        userId: m.userId.toString(),
        memberId: m._id.toString(),
        name: user?.fullName || profile?.headline || 'Technician',
        role: m.role,
        status: m.status,
        jobsCompleted: completed,
        jobsCancelled: cancelled,
        activeJobs: active,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : Number(profile?.completionScore || 0),
        rating: Number(profile?.ratingAverage || 0),
        reviewCount: Number(profile?.reviewCount || 0),
        responseScore: Number(profile?.responseScore || 0),
        responseTimeMinutesAvg: Number(profile?.responseTimeMinutesAvg || 0),
      };
    }),
  );

  const totals = rows.reduce(
    (acc, r) => {
      acc.jobsCompleted += r.jobsCompleted;
      acc.activeJobs += r.activeJobs;
      acc.ratingSum += r.rating;
      acc.ratingCount += r.rating > 0 ? 1 : 0;
      return acc;
    },
    { jobsCompleted: 0, activeJobs: 0, ratingSum: 0, ratingCount: 0 },
  );

  return {
    company: serializeCompany(company),
    summary: {
      teamSize: rows.filter((r) => r.status === 'active').length,
      jobsCompleted: totals.jobsCompleted,
      activeJobs: totals.activeJobs,
      averageRating:
        totals.ratingCount > 0 ? Math.round((totals.ratingSum / totals.ratingCount) * 10) / 10 : 0,
    },
    rankings: rows.sort((a, b) => b.jobsCompleted - a.jobsCompleted || b.rating - a.rating),
  };
}

export async function teamAvailability(userId: string) {
  const { company } = await requireOwnerOrDispatcher(userId);
  const members = await CompanyMember.find({
    companyId: company._id,
    status: 'active',
    deletedAt: null,
  });

  const items = await Promise.all(
    members.map(async (m) => {
      const [profile, user, hours] = await Promise.all([
        TechnicianProfile.findOne({ userId: m.userId }),
        User.findById(m.userId).select('fullName'),
        WorkingHours.find({ technicianUserId: m.userId, deletedAt: null }).limit(14),
      ]);
      const status = profile?.isAvailableNow ? 'available' : 'offline';
      return {
        userId: m.userId.toString(),
        memberId: m._id.toString(),
        name: user?.fullName || profile?.headline || 'Technician',
        role: m.role,
        status,
        isAvailableNow: Boolean(profile?.isAvailableNow),
        district: profile?.location?.district || null,
        workingHours: hours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          startTime: h.openTime,
          endTime: h.closeTime,
          isOff: Boolean(h.isClosed),
        })),
      };
    }),
  );

  return {
    company: serializeCompany(company),
    items,
    coverage: {
      available: items.filter((i) => i.status === 'available').length,
      offline: items.filter((i) => i.status === 'offline').length,
      gaps: items.filter((i) => i.status === 'offline').map((i) => i.name),
    },
  };
}

export async function updateCompanySettings(
  userId: string,
  input: { name?: string; autoAssignEnabled?: boolean; notifyOnDispatch?: boolean },
) {
  const { company, isOwner } = await requireOwnerOrDispatcher(userId);
  if (!isOwner) throw AppError.forbidden('Only the company owner can change settings.');
  if (typeof input.name === 'string' && input.name.trim()) company.name = input.name.trim().slice(0, 120);
  if (typeof input.autoAssignEnabled === 'boolean') {
    company.settings.autoAssignEnabled = input.autoAssignEnabled;
  }
  if (typeof input.notifyOnDispatch === 'boolean') {
    company.settings.notifyOnDispatch = input.notifyOnDispatch;
  }
  await company.save();
  return serializeCompany(company);
}

export const companyTeamService = {
  getTeamOverview,
  listMyInvites,
  inviteEmployee,
  acceptInvite,
  updateMember,
  listDispatchQueue,
  dispatchAssign,
  listAssignments,
  teamPerformance,
  teamAvailability,
  updateCompanySettings,
  ensureCompanyForOwner,
};
