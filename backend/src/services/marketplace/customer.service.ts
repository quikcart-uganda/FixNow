import type { Request } from 'express';
import {
  CustomerAddress,
  CustomerProfile,
  Job,
  SavedTechnician,
  TechnicianProfile,
  User,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { escapeRegex, paginationMeta, parsePagination, parseSort } from '../../utils/pagination.js';

async function getOrCreateCustomerProfile(userId: string) {
  let profile = await CustomerProfile.findOne({ userId });
  if (!profile) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    profile = await CustomerProfile.create({
      userId,
      referralCode: user.referralCode,
      languages: ['en'],
    });
  }
  return profile;
}

export const customerMarketplaceService = {
  async getProfile(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    const profile = await getOrCreateCustomerProfile(userId);
    const addresses = await CustomerAddress.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        phone: user.phone ?? null,
        fullName: user.fullName,
        accountStatus: user.accountStatus,
      },
      profile,
      addresses,
    };
  },

  async updateProfile(
    userId: string,
    input: {
      fullName?: string;
      phone?: string;
      photoUrl?: string;
      avatarId?: string | null;
      uploadedPhotoUrl?: string | null;
      clearUploadedPhoto?: boolean;
      bio?: string;
      languages?: string[];
      location?: Record<string, unknown>;
      preferences?: Record<string, unknown>;
    },
    meta: { ip?: string } = {},
  ) {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    if (input.fullName) user.fullName = input.fullName;
    if (input.phone !== undefined) user.phone = input.phone;
    await user.save();

    const profile = await getOrCreateCustomerProfile(userId);
    if (input.avatarId !== undefined) {
      (profile as { avatarId?: string | null }).avatarId = input.avatarId || undefined;
    }
    if (input.photoUrl !== undefined) {
      // Real upload replaces display photo but keeps avatarId for later restore.
      if (input.photoUrl && !String(input.photoUrl).includes('dicebear.com')) {
        (profile as { uploadedPhotoUrl?: string }).uploadedPhotoUrl = input.photoUrl;
      }
      profile.photoUrl = input.photoUrl;
    }
    if (input.uploadedPhotoUrl !== undefined) {
      (profile as { uploadedPhotoUrl?: string | null }).uploadedPhotoUrl = input.uploadedPhotoUrl || undefined;
    }
    if (input.clearUploadedPhoto) {
      const { getAvatarById } = await import('../sandbox/avatarLibrary.js');
      (profile as { uploadedPhotoUrl?: string | null }).uploadedPhotoUrl = undefined;
      const avatar = getAvatarById((profile as { avatarId?: string }).avatarId);
      if (avatar) profile.photoUrl = avatar.url;
    }
    if (input.bio !== undefined) profile.bio = input.bio;
    if (input.languages) profile.languages = input.languages;
    if (input.location) profile.location = input.location as never;
    if (input.preferences) {
      profile.preferences = { ...profile.preferences, ...input.preferences } as never;
    }
    await profile.save();

    await writeAuditLog({
      actorId: userId,
      actorRole: 'customer',
      action: 'customer.update_profile',
      resourceType: 'CustomerProfile',
      resourceId: profile._id.toString(),
      ip: meta.ip,
    });

    return this.getProfile(userId);
  },

  async listAddresses(userId: string) {
    await getOrCreateCustomerProfile(userId);
    const addresses = await CustomerAddress.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    return { addresses };
  },

  async createAddress(
    userId: string,
    input: {
      label: string;
      location: Record<string, unknown>;
      isDefault?: boolean;
      contactName?: string;
      contactPhone?: string;
      notes?: string;
    },
  ) {
    const profile = await getOrCreateCustomerProfile(userId);
    if (input.isDefault) {
      await CustomerAddress.updateMany({ userId }, { $set: { isDefault: false } });
    }
    const address = await CustomerAddress.create({
      customerProfileId: profile._id,
      userId,
      label: input.label,
      location: input.location,
      isDefault: Boolean(input.isDefault),
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      notes: input.notes,
    });
    if (address.isDefault) {
      profile.defaultAddressId = address._id;
      await profile.save();
    }
    return { address };
  },

  async updateAddress(
    userId: string,
    addressId: string,
    input: Partial<{
      label: string;
      location: Record<string, unknown>;
      isDefault: boolean;
      contactName: string;
      contactPhone: string;
      notes: string;
    }>,
  ) {
    const address = await CustomerAddress.findOne({ _id: addressId, userId });
    if (!address) throw AppError.notFound('Address not found');
    if (input.label !== undefined) address.label = input.label;
    if (input.location !== undefined) address.location = input.location as never;
    if (input.contactName !== undefined) address.contactName = input.contactName;
    if (input.contactPhone !== undefined) address.contactPhone = input.contactPhone;
    if (input.notes !== undefined) address.notes = input.notes;
    if (input.isDefault === true) {
      await CustomerAddress.updateMany({ userId }, { $set: { isDefault: false } });
      address.isDefault = true;
      await CustomerProfile.updateOne({ userId }, { $set: { defaultAddressId: address._id } });
    }
    await address.save();
    return { address };
  },

  async deleteAddress(userId: string, addressId: string) {
    const address = await CustomerAddress.findOne({ _id: addressId, userId });
    if (!address) throw AppError.notFound('Address not found');
    address.isDeleted = true;
    address.deletedAt = new Date();
    await address.save();
    return { deleted: true };
  },

  async listSavedTechnicians(userId: string, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const filter = { customerUserId: userId };
    const [total, rows] = await Promise.all([
      SavedTechnician.countDocuments(filter),
      SavedTechnician.find(filter).sort({ savedAt: -1 }).skip(skip).limit(limit),
    ]);
    const techIds = rows.map((r) => r.technicianUserId);
    const profiles = await TechnicianProfile.find({ userId: { $in: techIds } }).select(
      'userId headline photoUrl skills ratingAverage trustScore jobsCompleted verificationStatus isAvailableNow location subscriptionPlanCode subscriptionStatus subscriptionPeriodEnd monetizationSuspended primaryCategoryId',
    );
    const users = await User.find({ _id: { $in: techIds } }).select('fullName');
    const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const { resolvePublicBadgesForProfiles } = await import('./publicSubscriptionBadge.js');
    const { publicMediaUrl } = await import('../../utils/mediaUrl.js');
    const badgeMap = await resolvePublicBadgesForProfiles(profiles as never[], 'card');

    return {
      items: rows.map((r) => {
        const tid = r.technicianUserId.toString();
        const profile = profileMap.get(tid);
        const user = userMap.get(tid);
        return {
          id: r._id.toString(),
          savedAt: r.savedAt,
          notes: r.notes,
          technician: {
            id: tid,
            fullName: user?.fullName || 'Technician',
            headline: profile?.headline || null,
            photoUrl: publicMediaUrl(profile?.photoUrl),
            skills: profile?.skills || [],
            ratingAverage: Number(profile?.ratingAverage || 0),
            trustScore: Number(profile?.trustScore || 0),
            jobsCompleted: Number(profile?.jobsCompleted || 0),
            verificationStatus: profile?.verificationStatus || null,
            isAvailableNow: Boolean(profile?.isAvailableNow),
            district: profile?.location?.district || null,
            primaryCategoryId: profile?.primaryCategoryId?.toString?.() || null,
            subscriptionBadge: badgeMap.get(tid) || null,
          },
        };
      }),
      meta: paginationMeta(total, page, limit),
    };
  },

  async saveTechnician(userId: string, technicianUserId: string, notes?: string) {
    const techProfile = await TechnicianProfile.findOne({ userId: technicianUserId });
    if (!techProfile) throw AppError.notFound('Technician not found');
    const existing = await SavedTechnician.findOne({ customerUserId: userId, technicianUserId });
    if (existing) {
      if (notes !== undefined) existing.notes = notes;
      await existing.save();
      return { saved: existing };
    }
    const saved = await SavedTechnician.create({
      customerUserId: userId,
      technicianUserId,
      technicianProfileId: techProfile._id,
      notes,
      savedAt: new Date(),
    });
    return { saved };
  },

  async removeSavedTechnician(userId: string, technicianUserId: string) {
    const saved = await SavedTechnician.findOne({ customerUserId: userId, technicianUserId });
    if (!saved) throw AppError.notFound('Saved technician not found');
    saved.isDeleted = true;
    saved.deletedAt = new Date();
    await saved.save();
    return { removed: true };
  },

  async jobHistory(userId: string, req: Request) {
    const { page, limit, skip } = parsePagination(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const filter: Record<string, unknown> = { customerId: userId };
    if (status) filter.status = status;
    if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
    const sort = parseSort(typeof req.query.sort === 'string' ? req.query.sort : undefined, [
      'createdAt',
      'updatedAt',
      'status',
    ]);
    const [total, jobs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter).sort(sort).skip(skip).limit(limit),
    ]);
    return { items: jobs, meta: paginationMeta(total, page, limit) };
  },
};
