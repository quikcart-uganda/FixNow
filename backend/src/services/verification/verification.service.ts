/**
 * Identity / skill / certification verification queue.
 * Mongo ObjectIds remain internal; admin UI shows human-readable technician names.
 */

import type { Request } from 'express';
import {
  Certification,
  IdentityVerification,
  SkillVerification,
  TechnicianProfile,
  User,
  type IIdentityVerification,
} from '../../models/index.js';
import { VERIFICATION_STATUS } from '../../models/shared/enums.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { parsePagination, paginationMeta } from '../../utils/pagination.js';

const DOC_TYPES = [
  'national_id',
  'passport',
  'driving_license',
  'lc1_letter',
  'selfie',
  'certificate',
  'police_clearance',
  'business_registration',
  'professional_licence',
  'other',
] as const;

type DocType = (typeof DOC_TYPES)[number];

function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v);
}

function idStr(v: unknown): string {
  return v == null ? '' : String(v);
}

async function nameMap(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const users = await User.find({ _id: { $in: unique } })
    .select('fullName email')
    .lean();
  return new Map(users.map((u) => [String(u._id), u.fullName || u.email || 'User']));
}

function mapIdentity(
  doc: IIdentityVerification | Record<string, unknown>,
  names: Map<string, string>,
  reviewerNames: Map<string, string>,
) {
  const d = doc as IIdentityVerification & { _id: { toString(): string } };
  const userId = idStr(d.userId);
  const reviewerId = d.reviewedBy ? idStr(d.reviewedBy) : '';
  return {
    id: idStr(d._id),
    kind: 'identity' as const,
    technicianId: userId,
    technicianName: names.get(userId) || 'Technician',
    documentType: d.documentType,
    verificationType: String(d.documentType).replace(/_/g, ' '),
    documentUrls: Array.isArray(d.documentUrls) ? d.documentUrls.map(String) : [],
    selfieUrl: d.selfieUrl || undefined,
    status: d.status,
    lc1Ready: Boolean(d.lc1Ready),
    lc1Reference: d.lc1Reference || undefined,
    submittedAt: d.submittedAt,
    reviewedAt: d.reviewedAt,
    reviewNotes: d.reviewNotes || undefined,
    assignedReviewerId: reviewerId || undefined,
    assignedReviewer: reviewerId ? reviewerNames.get(reviewerId) || 'Admin' : undefined,
    history: [] as Array<{ at?: Date; status: string; note?: string; by?: string }>,
  };
}

export const verificationMarketplaceService = {
  async submit(actor: { userId: string; role: string }, body: Record<string, unknown>) {
    if (actor.role !== 'technician' && actor.role !== 'admin') {
      throw AppError.forbidden('Only technicians can submit verification documents');
    }
    const documentType = isDocType(body.documentType) ? body.documentType : 'other';
    const documentUrls = Array.isArray(body.documentUrls)
      ? body.documentUrls.map(String).filter(Boolean).slice(0, 12)
      : typeof body.documentUrl === 'string' && body.documentUrl
        ? [body.documentUrl]
        : [];
    const selfieUrl = typeof body.selfieUrl === 'string' ? body.selfieUrl : undefined;
    if (!documentUrls.length && !selfieUrl) {
      throw AppError.badRequest('At least one document or selfie URL is required');
    }

    const userId = actor.role === 'admin' && typeof body.userId === 'string' ? body.userId : actor.userId;

    const doc = await IdentityVerification.create({
      userId,
      role: 'technician',
      documentType,
      documentUrls,
      selfieUrl,
      status: VERIFICATION_STATUS.PENDING,
      lc1Ready: Boolean(body.lc1Ready) || documentType === 'lc1_letter',
      lc1Reference: typeof body.lc1Reference === 'string' ? body.lc1Reference.slice(0, 120) : undefined,
      submittedAt: new Date(),
      reviewNotes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined,
    });

    await TechnicianProfile.updateOne(
      { userId },
      { $set: { verificationStatus: VERIFICATION_STATUS.PENDING } },
    );

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'verification.submitted',
      resourceType: 'IdentityVerification',
      resourceId: doc._id.toString(),
      meta: { documentType, userId },
    });

    return { request: doc };
  },

  async listPending(req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : VERIFICATION_STATUS.PENDING;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const statusFilter =
      status === 'all'
        ? {}
        : status === 'queue'
          ? { status: { $in: [VERIFICATION_STATUS.PENDING, VERIFICATION_STATUS.UNDER_REVIEW] } }
          : { status };

    const [identity, skills, certs] = await Promise.all([
      IdentityVerification.find({ role: 'technician', ...statusFilter })
        .sort({ submittedAt: -1 })
        .limit(200)
        .lean(),
      SkillVerification.find({ ...statusFilter })
        .sort({ submittedAt: -1 })
        .limit(100)
        .lean(),
      Certification.find({
        status:
          status === 'all' || status === 'queue'
            ? { $in: [VERIFICATION_STATUS.PENDING, VERIFICATION_STATUS.UNDER_REVIEW] }
            : status,
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    const userIds = [
      ...identity.map((d) => idStr(d.userId)),
      ...skills.map((d) => idStr(d.technicianUserId)),
      ...certs.map((d) => idStr(d.technicianUserId)),
      ...identity.map((d) => (d.reviewedBy ? idStr(d.reviewedBy) : '')),
      ...skills.map((d) => (d.assessedBy ? idStr(d.assessedBy) : '')),
    ];
    const names = await nameMap(userIds);

    type QueueItem = Omit<ReturnType<typeof mapIdentity>, 'kind' | 'lc1Reference'> & {
      kind: 'identity' | 'skill' | 'certification';
      lc1Reference?: string;
      evidenceUrls?: string[];
      categoryId?: string;
      name?: string;
      issuer?: string;
    };

    const items: QueueItem[] = [
      ...identity.map((d) => mapIdentity(d, names, names)),
      ...skills.map((d) => ({
        id: idStr(d._id),
        kind: 'skill' as const,
        technicianId: idStr(d.technicianUserId),
        technicianName: names.get(idStr(d.technicianUserId)) || 'Technician',
        documentType: 'certificate' as DocType,
        verificationType: 'skill evidence',
        documentUrls: Array.isArray(d.evidenceUrls) ? d.evidenceUrls.map(String) : [],
        evidenceUrls: Array.isArray(d.evidenceUrls) ? d.evidenceUrls.map(String) : [],
        selfieUrl: undefined,
        status: d.status,
        lc1Ready: false,
        submittedAt: d.submittedAt,
        reviewedAt: d.reviewedAt,
        reviewNotes: d.notes || undefined,
        assignedReviewerId: d.assessedBy ? idStr(d.assessedBy) : undefined,
        assignedReviewer: d.assessedBy ? names.get(idStr(d.assessedBy)) : undefined,
        categoryId: idStr(d.categoryId),
        history: [],
      })),
      ...certs.map((d) => ({
        id: idStr(d._id),
        kind: 'certification' as const,
        technicianId: idStr(d.technicianUserId),
        technicianName: names.get(idStr(d.technicianUserId)) || 'Technician',
        documentType: 'certificate' as DocType,
        verificationType: d.name || 'certification',
        documentUrls: d.documentUrl ? [String(d.documentUrl)] : [],
        selfieUrl: undefined,
        status: d.status,
        lc1Ready: false,
        submittedAt: d.createdAt,
        reviewedAt: d.verifiedAt,
        reviewNotes: undefined,
        assignedReviewerId: undefined,
        assignedReviewer: undefined,
        name: d.name,
        issuer: d.issuer,
        history: [],
      })),
    ];

    items.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tb - ta;
    });

    let filtered = items;
    if (q) {
      filtered = items.filter(
        (i) =>
          i.technicianName.toLowerCase().includes(q) ||
          i.technicianId.toLowerCase().includes(q) ||
          i.verificationType.toLowerCase().includes(q) ||
          String(i.documentType).toLowerCase().includes(q) ||
          i.status.toLowerCase().includes(q),
      );
    }

    const total = filtered.length;
    const pageItems = filtered.slice(skip, skip + limit);

    // Attach prior review notes for identity docs (same technician).
    for (const item of pageItems) {
      if (item.kind !== 'identity') continue;
      const prior = await IdentityVerification.find({
        userId: item.technicianId,
        _id: { $ne: item.id },
        reviewedAt: { $exists: true },
      })
        .sort({ reviewedAt: -1 })
        .limit(5)
        .select('status reviewNotes reviewedAt reviewedBy')
        .lean();
      item.history = prior.map((h) => ({
        at: h.reviewedAt,
        status: h.status,
        note: h.reviewNotes || undefined,
        by: h.reviewedBy ? names.get(idStr(h.reviewedBy)) : undefined,
      }));
    }

    return {
      items: pageItems,
      meta: paginationMeta(total, page, limit),
      capabilities: {
        documentTypes: DOC_TYPES,
        actions: ['approve', 'reject', 'request_info'],
      },
    };
  },

  async review(
    adminId: string,
    requestId: string,
    body: { decision?: string; notes?: string; kind?: string },
  ) {
    const decision = String(body.decision || '').toLowerCase();
    if (!['approve', 'reject', 'request_info', 'under_review'].includes(decision)) {
      throw AppError.badRequest('decision must be approve, reject, or request_info');
    }
    const kind = String(body.kind || 'identity').toLowerCase();
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined;

    if (kind === 'skill') {
      const skill = await SkillVerification.findById(requestId);
      if (!skill) throw AppError.notFound('Skill verification not found');
      skill.status =
        decision === 'approve'
          ? VERIFICATION_STATUS.APPROVED
          : decision === 'reject'
            ? VERIFICATION_STATUS.REJECTED
            : VERIFICATION_STATUS.UNDER_REVIEW;
      skill.assessedBy = adminId as never;
      skill.notes = notes;
      skill.reviewedAt = new Date();
      await skill.save();
      if (decision === 'approve') {
        await TechnicianProfile.updateOne(
          { userId: skill.technicianUserId },
          { $set: { skillVerified: true } },
        );
      }
      await writeAuditLog({
        actorId: adminId,
        actorRole: 'admin',
        action: `verification.skill.${decision}`,
        resourceType: 'SkillVerification',
        resourceId: skill._id.toString(),
        meta: { notes },
      });
      return { request: skill, kind: 'skill' };
    }

    if (kind === 'certification') {
      const cert = await Certification.findById(requestId);
      if (!cert) throw AppError.notFound('Certification not found');
      cert.status =
        decision === 'approve'
          ? VERIFICATION_STATUS.APPROVED
          : decision === 'reject'
            ? VERIFICATION_STATUS.REJECTED
            : VERIFICATION_STATUS.UNDER_REVIEW;
      if (decision === 'approve') cert.verifiedAt = new Date();
      await cert.save();
      await writeAuditLog({
        actorId: adminId,
        actorRole: 'admin',
        action: `verification.certification.${decision}`,
        resourceType: 'Certification',
        resourceId: cert._id.toString(),
        meta: { notes },
      });
      return { request: cert, kind: 'certification' };
    }

    const doc = await IdentityVerification.findById(requestId);
    if (!doc) throw AppError.notFound('Verification request not found');

    if (decision === 'approve') {
      doc.status = VERIFICATION_STATUS.APPROVED;
      doc.reviewedBy = adminId as never;
      doc.reviewNotes = notes;
      doc.reviewedAt = new Date();
      await doc.save();
      await TechnicianProfile.updateOne(
        { userId: doc.userId },
        {
          $set: {
            verificationStatus: VERIFICATION_STATUS.APPROVED,
            identityVerified: true,
          },
        },
      );
    } else if (decision === 'reject') {
      doc.status = VERIFICATION_STATUS.REJECTED;
      doc.reviewedBy = adminId as never;
      doc.reviewNotes = notes;
      doc.reviewedAt = new Date();
      await doc.save();
      await TechnicianProfile.updateOne(
        { userId: doc.userId },
        { $set: { verificationStatus: VERIFICATION_STATUS.REJECTED, identityVerified: false } },
      );
    } else {
      doc.status = VERIFICATION_STATUS.UNDER_REVIEW;
      doc.reviewedBy = adminId as never;
      doc.reviewNotes = notes || 'Additional information requested';
      doc.reviewedAt = new Date();
      await doc.save();
      await TechnicianProfile.updateOne(
        { userId: doc.userId },
        { $set: { verificationStatus: VERIFICATION_STATUS.UNDER_REVIEW } },
      );
    }

    await writeAuditLog({
      actorId: adminId,
      actorRole: 'admin',
      action: `verification.${decision}`,
      resourceType: 'IdentityVerification',
      resourceId: doc._id.toString(),
      meta: { userId: String(doc.userId), documentType: doc.documentType, notes },
      severity: decision === 'reject' ? 'warning' : 'info',
    });

    return { request: doc, kind: 'identity' };
  },
};
