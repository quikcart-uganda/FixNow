import { model, type Types } from 'mongoose';
import {
  ADMIN_OPERATOR_ROLES,
  ADMIN_OPERATOR_STATUS,
  type AdminOperatorRoleKey,
  type AdminOperatorStatus,
} from '../../constants/adminIdentity.js';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';

export interface IPermission extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description?: string;
  module: string;
  isActive: boolean;
}

const permissionSchema = createSchema<IPermission>({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, maxlength: 500 },
  module: { type: String, required: true, index: true, maxlength: 80 },
  isActive: { type: Boolean, default: true, index: true },
});

permissionSchema.index({ module: 1, key: 1 });

export const Permission = model<IPermission>('Permission', permissionSchema);

export interface IAdminRole extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description?: string;
  permissionIds: Types.ObjectId[];
  permissionKeys: string[];
  isSystem: boolean;
  isActive: boolean;
}

const adminRoleSchema = createSchema<IAdminRole>({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, maxlength: 500 },
  permissionIds: [{ type: 'ObjectId', ref: 'Permission' }],
  permissionKeys: { type: [String], default: [] },
  isSystem: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
});

export const AdminRole = model<IAdminRole>('AdminRole', adminRoleSchema);

/** Governance classification — does not replace adminRoleKey RBAC. */
export const ADMIN_GOVERNANCE_CLASSIFICATIONS = ['development', 'production', 'unclassified'] as const;
export type AdminGovernanceClassification = (typeof ADMIN_GOVERNANCE_CLASSIFICATIONS)[number];

/** Admin operator profile linked 1:1 to a User with role=admin. */
export interface IAdminUser extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  adminRoleId: Types.ObjectId;
  adminRoleKey: AdminOperatorRoleKey | string;
  permissionKeys: string[];
  department?: string;
  /**
   * Production Governance classification (Phase 4.2).
   * `production` Super Admins may switch Platform Mode. Does not invent a new role key.
   */
  governanceClassification: AdminGovernanceClassification;
  recoveryEmail?: string;
  recoveryPhone?: string;
  /** Operator lifecycle — independent of marketplace User.accountStatus where needed. */
  status: AdminOperatorStatus;
  isActive: boolean;
  lastActiveAt?: Date;
  lastLoginAt?: Date;
  createdBy?: Types.ObjectId;
  invitedBy?: Types.ObjectId;
  invitationId?: Types.ObjectId;
  mfaEnabled: boolean;
  /** Encrypted/hashed TOTP secret — select:false */
  mfaSecret?: string;
  /** Hashed one-time recovery codes — select:false */
  recoveryCodeHashes: string[];
  recoveryCodesGeneratedAt?: Date;
  /** Hash of bootstrap recovery key (super admin only) — select:false */
  bootstrapRecoveryKeyHash?: string;
  bootstrapRecoveryKeyCreatedAt?: Date;
  bootstrapRecoveryKeyUsedAt?: Date;
  failedMfaAttempts: number;
  mfaLockUntil?: Date;
  notes?: string;
}

const adminUserSchema = createSchema<IAdminUser>({
  userId: { type: 'ObjectId', ref: 'User', required: true, unique: true, index: true },
  adminRoleId: { type: 'ObjectId', ref: 'AdminRole', required: true, index: true },
  adminRoleKey: {
    type: String,
    required: true,
    index: true,
    default: ADMIN_OPERATOR_ROLES.OPERATIONS,
  },
  permissionKeys: { type: [String], default: [] },
  department: { type: String, maxlength: 80 },
  governanceClassification: {
    type: String,
    enum: ADMIN_GOVERNANCE_CLASSIFICATIONS,
    default: 'unclassified',
    index: true,
  },
  recoveryEmail: { type: String, lowercase: true, trim: true, maxlength: 200 },
  recoveryPhone: { type: String, trim: true, maxlength: 40 },
  status: {
    type: String,
    enum: Object.values(ADMIN_OPERATOR_STATUS),
    default: ADMIN_OPERATOR_STATUS.PENDING_INVITATION,
    index: true,
  },
  isActive: { type: Boolean, default: false, index: true },
  lastActiveAt: Date,
  lastLoginAt: Date,
  createdBy: { type: 'ObjectId', ref: 'User', index: true },
  invitedBy: { type: 'ObjectId', ref: 'User', index: true },
  invitationId: { type: 'ObjectId', ref: 'AdminInvitation', index: true },
  mfaEnabled: { type: Boolean, default: false, index: true },
  mfaSecret: { type: String, select: false },
  recoveryCodeHashes: { type: [String], default: [], select: false },
  recoveryCodesGeneratedAt: Date,
  bootstrapRecoveryKeyHash: { type: String, select: false },
  bootstrapRecoveryKeyCreatedAt: Date,
  bootstrapRecoveryKeyUsedAt: Date,
  failedMfaAttempts: { type: Number, default: 0, min: 0 },
  mfaLockUntil: Date,
  notes: { type: String, maxlength: 2000 },
});

adminUserSchema.index({ adminRoleKey: 1, status: 1 });
adminUserSchema.index({ status: 1, isActive: 1 });
adminUserSchema.index({ governanceClassification: 1, status: 1, adminRoleKey: 1 });

export const AdminUser = model<IAdminUser>('AdminUser', adminUserSchema);

export type IAdminProfile = IAdminUser;
export const AdminProfile = AdminUser;

export interface IAdminInvitation extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  email: string;
  fullName: string;
  phone?: string;
  department?: string;
  adminRoleKey: string;
  permissionKeys: string[];
  invitedBy: Types.ObjectId;
  /** SHA-256 of raw token */
  tokenHash: string;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedUserId?: Types.ObjectId;
  revokedAt?: Date;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

const adminInvitationSchema = createSchema<IAdminInvitation>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    index: true,
  },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, maxlength: 20 },
  department: { type: String, maxlength: 80 },
  adminRoleKey: { type: String, required: true, index: true },
  permissionKeys: { type: [String], default: [] },
  invitedBy: { type: 'ObjectId', ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: true },
  acceptedAt: Date,
  acceptedUserId: { type: 'ObjectId', ref: 'User' },
  revokedAt: Date,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'revoked'],
    default: 'pending',
    index: true,
  },
});

adminInvitationSchema.index({ email: 1, status: 1 });

export const AdminInvitation = model<IAdminInvitation>('AdminInvitation', adminInvitationSchema);

export interface IAdminLoginEvent extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  adminUserId?: Types.ObjectId;
  email: string;
  success: boolean;
  reason?: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}

const adminLoginEventSchema = createSchema<IAdminLoginEvent>({
  userId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  adminUserId: { type: 'ObjectId', ref: 'AdminUser', index: true },
  email: { type: String, required: true, lowercase: true, index: true },
  success: { type: Boolean, required: true, index: true },
  reason: { type: String, maxlength: 200 },
  ip: { type: String, maxlength: 45 },
  userAgent: { type: String, maxlength: 500 },
  deviceId: { type: String, maxlength: 120, index: true },
});

adminLoginEventSchema.index({ createdAt: -1 });

export const AdminLoginEvent = model<IAdminLoginEvent>('AdminLoginEvent', adminLoginEventSchema);

export interface IAdminRecoveryRequest extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  targetUserId: Types.ObjectId;
  requestedByUserId?: Types.ObjectId;
  type:
    | 'password_reset'
    | 'super_admin_recovery'
    | 'bootstrap_key'
    | 'unlock'
    | 'mfa_reset'
    | 'email_change';
  status: 'pending' | 'approved' | 'denied' | 'completed' | 'expired';
  tokenHash?: string;
  expiresAt?: Date;
  approvals: Array<{
    approverUserId: Types.ObjectId;
    decidedAt: Date;
    decision: 'approved' | 'denied';
    note?: string;
  }>;
  requiredApprovals: number;
  completedAt?: Date;
  meta?: Record<string, unknown>;
}

const adminRecoveryRequestSchema = createSchema<IAdminRecoveryRequest>({
  targetUserId: { type: 'ObjectId', ref: 'User', required: true, index: true },
  requestedByUserId: { type: 'ObjectId', ref: 'User', index: true },
  type: {
    type: String,
    enum: ['password_reset', 'super_admin_recovery', 'bootstrap_key', 'unlock', 'mfa_reset', 'email_change'],
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'completed', 'expired'],
    default: 'pending',
    index: true,
  },
  tokenHash: { type: String, select: false },
  expiresAt: { type: Date, index: true },
  approvals: [
    {
      approverUserId: { type: 'ObjectId', ref: 'User', required: true },
      decidedAt: { type: Date, required: true },
      decision: { type: String, enum: ['approved', 'denied'], required: true },
      note: { type: String, maxlength: 500 },
    },
  ],
  requiredApprovals: { type: Number, default: 1, min: 1, max: 5 },
  completedAt: Date,
  meta: { type: Object },
});

export const AdminRecoveryRequest = model<IAdminRecoveryRequest>(
  'AdminRecoveryRequest',
  adminRecoveryRequestSchema,
);

export interface IAdminBootstrapState extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  key: string;
  completed: boolean;
  completedAt?: Date;
  superAdminUserId?: Types.ObjectId;
  /** Hash only — plaintext recovery key shown once at bootstrap */
  recoveryKeyHash?: string;
  recoveryKeyHint?: string;
  /** Atomic claim window to prevent concurrent first-owner creation races */
  claimLockUntil?: Date;
}

const adminBootstrapStateSchema = createSchema<IAdminBootstrapState>({
  key: { type: String, required: true, unique: true, default: 'super_admin_bootstrap' },
  completed: { type: Boolean, default: false, index: true },
  completedAt: Date,
  superAdminUserId: { type: 'ObjectId', ref: 'User' },
  recoveryKeyHash: { type: String, select: false },
  recoveryKeyHint: { type: String, maxlength: 32 },
  claimLockUntil: Date,
});

export const AdminBootstrapState = model<IAdminBootstrapState>(
  'AdminBootstrapState',
  adminBootstrapStateSchema,
);
