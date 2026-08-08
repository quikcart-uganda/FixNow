import { Schema, model, type Types } from 'mongoose';
import { createSchema, type SoftDeleteFields, type TimestampFields } from '../shared/base.js';
import {
  ESCROW_STATUS,
  MOBILE_MONEY_PROVIDER,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} from '../shared/enums.js';

export interface IWallet extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  currency: string;
  availableBalance: number;
  heldBalance: number;
  lifetimeCredits: number;
  lifetimeDebits: number;
  status: 'active' | 'frozen' | 'closed';
}

const walletSchema = createSchema<IWallet>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  availableBalance: { type: Number, default: 0, min: 0 },
  heldBalance: { type: Number, default: 0, min: 0 },
  lifetimeCredits: { type: Number, default: 0, min: 0 },
  lifetimeDebits: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'frozen', 'closed'], default: 'active', index: true },
});

export const Wallet = model<IWallet>('Wallet', walletSchema);

export interface IMobileMoneyAccount extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  provider: string;
  msisdn: string;
  accountName: string;
  isDefault: boolean;
  isVerified: boolean;
  verifiedAt?: Date;
}

const mobileMoneyAccountSchema = createSchema<IMobileMoneyAccount>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: {
    type: String,
    enum: Object.values(MOBILE_MONEY_PROVIDER),
    required: true,
    index: true,
  },
  msisdn: { type: String, required: true, maxlength: 20 },
  accountName: { type: String, required: true, maxlength: 120 },
  isDefault: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  verifiedAt: Date,
});

mobileMoneyAccountSchema.index({ userId: 1, provider: 1, msisdn: 1 }, { unique: true });

export const MobileMoneyAccount = model<IMobileMoneyAccount>(
  'MobileMoneyAccount',
  mobileMoneyAccountSchema,
);

export interface ITransaction extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  walletId: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  providerRef?: string;
  jobId?: Types.ObjectId;
  escrowId?: Types.ObjectId;
  description?: string;
  balanceAfter?: number;
  meta?: Record<string, unknown>;
}

const transactionSchema = createSchema<ITransaction>({
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: Object.values(TRANSACTION_TYPE), required: true, index: true },
  status: {
    type: String,
    enum: Object.values(TRANSACTION_STATUS),
    default: TRANSACTION_STATUS.PENDING,
    index: true,
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  reference: { type: String, required: true, unique: true, maxlength: 64 },
  providerRef: { type: String, maxlength: 120, index: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', index: true },
  escrowId: { type: Schema.Types.ObjectId, ref: 'EscrowTransaction' },
  description: { type: String, maxlength: 500 },
  balanceAfter: { type: Number, min: 0 },
  meta: { type: Schema.Types.Mixed },
});

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

export const Transaction = model<ITransaction>('Transaction', transactionSchema);

export interface IEscrowTransaction extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  customerId: Types.ObjectId;
  technicianId: Types.ObjectId;
  amount: number;
  currency: string;
  status: string;
  heldAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;
  providerRef?: string;
  releaseScheduleAt?: Date;
  disputeReason?: string;
}

const escrowTransactionSchema = createSchema<IEscrowTransaction>({
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'UGX', maxlength: 3 },
  status: {
    type: String,
    enum: Object.values(ESCROW_STATUS),
    default: ESCROW_STATUS.HELD,
    index: true,
  },
  heldAt: Date,
  releasedAt: Date,
  refundedAt: Date,
  providerRef: { type: String, maxlength: 120 },
  releaseScheduleAt: Date,
  disputeReason: { type: String, maxlength: 1000 },
});

escrowTransactionSchema.index({ jobId: 1, status: 1 });
escrowTransactionSchema.index({ status: 1, releaseScheduleAt: 1 });

export const EscrowTransaction = model<IEscrowTransaction>('EscrowTransaction', escrowTransactionSchema);
