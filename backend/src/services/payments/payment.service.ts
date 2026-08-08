import { createHash, randomBytes } from 'crypto';
import { Types, type HydratedDocument } from 'mongoose';
import { env } from '../../config/env.js';
import {
  Assignment,
  EscrowTransaction,
  Job,
  MobileMoneyAccount,
  Transaction,
  User,
  type IEscrowTransaction,
  type ITransaction,
} from '../../models/index.js';
import {
  ESCROW_STATUS,
  JOB_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} from '../../models/shared/enums.js';
import { getPaymentProvider, listPaymentProviders } from '../../providers/payments/index.js';
import type { NormalizedWebhookEvent } from '../../providers/payments/types.js';
import {
  emitEscrowFunded,
  emitEscrowReleased,
  emitPaymentCreated,
  emitPaymentFailed,
  emitPaymentSuccessful,
  emitPayoutCompleted,
  emitRefundApproved,
  emitRefundRequested,
} from '../../sockets/realtime.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { createDbNotification } from '../../utils/notify.js';
import { PUSH_EVENTS } from '../push/events.js';
import {
  assertWalletActive,
  creditAvailable,
  debitAvailable,
  getOrCreateWallet,
} from './wallet.ledger.js';

type Meta = { ip?: string; userAgent?: string };
type TxDoc = HydratedDocument<ITransaction>;

function oid(id: string) {
  return new Types.ObjectId(id);
}

function refFromIdempotency(prefix: string, key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 28);
  return `${prefix}_${hash}`.slice(0, 64);
}

function newRef(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`.slice(0, 64);
}

async function resolveJobAmount(jobId: string): Promise<{ amount: number; currency: string; technicianId: string }> {
  const job = await Job.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (!job.assignedTechnicianId) throw AppError.badRequest('Job has no assigned technician');

  let amount = 0;
  let currency = 'UGX';
  if (job.assignmentId) {
    const assignment = await Assignment.findById(job.assignmentId);
    if (assignment?.agreedAmount && assignment.agreedAmount > 0) {
      amount = assignment.agreedAmount;
      currency = assignment.currency || 'UGX';
    }
  }
  if (!amount && typeof job.budgetMax === 'number' && job.budgetMax > 0) amount = job.budgetMax;
  if (!amount && typeof job.budgetMin === 'number' && job.budgetMin > 0) amount = job.budgetMin;
  if (!amount) throw AppError.badRequest('Job has no payable amount');

  return { amount, currency, technicianId: job.assignedTechnicianId.toString() };
}

async function finalizeSuccessfulPayment(tx: TxDoc, providerRef: string, meta: Meta = {}) {
  if (tx.status === TRANSACTION_STATUS.COMPLETED && tx.escrowId) {
    const escrow = await EscrowTransaction.findById(tx.escrowId);
    return { transaction: tx, escrow };
  }

  const jobId = tx.jobId?.toString();
  if (!jobId) throw AppError.badRequest('Payment missing job');

  const job = await Job.findById(jobId);
  if (!job?.assignedTechnicianId) throw AppError.badRequest('Job not assignable for escrow');

  const existingEscrow = await EscrowTransaction.findOne({
    jobId: job._id,
    status: { $in: [ESCROW_STATUS.HELD, ESCROW_STATUS.DISPUTED, ESCROW_STATUS.PARTIALLY_RELEASED] },
  });
  if (existingEscrow) {
    tx.status = TRANSACTION_STATUS.COMPLETED;
    tx.providerRef = providerRef;
    tx.escrowId = existingEscrow._id;
    await tx.save();
    return { transaction: tx, escrow: existingEscrow };
  }

  const autoMs = env.ESCROW_AUTO_RELEASE_MS;
  const escrow = await EscrowTransaction.create({
    jobId: job._id,
    customerId: job.customerId,
    technicianId: job.assignedTechnicianId,
    amount: tx.amount,
    currency: tx.currency,
    status: ESCROW_STATUS.HELD,
    heldAt: new Date(),
    providerRef,
    releaseScheduleAt: autoMs > 0 ? new Date(Date.now() + autoMs) : undefined,
  });

  const customerWallet = await getOrCreateWallet(tx.userId.toString(), tx.currency);
  await Transaction.create({
    walletId: customerWallet._id,
    userId: tx.userId,
    type: TRANSACTION_TYPE.HOLD,
    status: TRANSACTION_STATUS.COMPLETED,
    amount: tx.amount,
    currency: tx.currency,
    reference: newRef('hold'),
    providerRef,
    jobId: job._id,
    escrowId: escrow._id,
    description: `Escrow hold for job ${job.title}`,
    balanceAfter: customerWallet.availableBalance,
    meta: { sourceTransactionId: tx._id.toString() },
  });

  tx.status = TRANSACTION_STATUS.COMPLETED;
  tx.providerRef = providerRef;
  tx.escrowId = escrow._id;
  tx.meta = { ...(tx.meta ?? {}), escrowId: escrow._id.toString() };
  await tx.save();

  const payload = {
    userId: tx.userId.toString(),
    customerId: job.customerId.toString(),
    technicianId: job.assignedTechnicianId.toString(),
    jobId: job._id.toString(),
    transactionId: tx._id.toString(),
    escrowId: escrow._id.toString(),
    amount: tx.amount,
    currency: tx.currency,
    reference: tx.reference,
  };

  emitPaymentSuccessful(payload);
  emitEscrowFunded(payload);

  await createDbNotification({
    userId: job.customerId.toString(),
    type: PUSH_EVENTS.PAYMENT_SUCCESSFUL,
    title: 'Payment successful',
    body: `Your payment of ${tx.amount} ${tx.currency} for "${job.title}" succeeded.`,
    jobId: job._id.toString(),
    data: { escrowId: escrow._id.toString() },
  });
  await createDbNotification({
    userId: job.assignedTechnicianId.toString(),
    type: PUSH_EVENTS.ESCROW_FUNDED,
    title: 'Escrow funded',
    body: `Funds for "${job.title}" are held in escrow (${tx.amount} ${tx.currency}).`,
    jobId: job._id.toString(),
    data: { escrowId: escrow._id.toString() },
  });

  await writeAuditLog({
    actorId: tx.userId.toString(),
    actorRole: 'customer',
    action: 'payment.successful',
    resourceType: 'Transaction',
    resourceId: tx._id.toString(),
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { escrowId: escrow._id.toString(), jobId: job._id.toString() },
  });

  return { transaction: tx, escrow };
}

async function markPaymentFailed(tx: TxDoc, reason: string, meta: Meta = {}) {
  if (tx.status === TRANSACTION_STATUS.FAILED) return { transaction: tx };
  tx.status = TRANSACTION_STATUS.FAILED;
  tx.meta = { ...(tx.meta ?? {}), failureReason: reason };
  await tx.save();

  const payload = {
    userId: tx.userId.toString(),
    customerId: tx.userId.toString(),
    jobId: tx.jobId?.toString(),
    transactionId: tx._id.toString(),
    reference: tx.reference,
    reason,
  };
  emitPaymentFailed(payload);
  await createDbNotification({
    userId: tx.userId.toString(),
    type: PUSH_EVENTS.PAYMENT_FAILED,
    title: 'Payment failed',
    body: reason || 'Your payment could not be completed.',
    jobId: tx.jobId?.toString(),
  });
  await writeAuditLog({
    actorId: tx.userId.toString(),
    action: 'payment.failed',
    resourceType: 'Transaction',
    resourceId: tx._id.toString(),
    ip: meta.ip,
    meta: { reason },
  });
  return { transaction: tx };
}

export const paymentService = {
  listProviders() {
    return { providers: listPaymentProviders(), defaultProvider: env.PAYMENT_DEFAULT_PROVIDER };
  },

  async getWallet(userId: string) {
    const wallet = await getOrCreateWallet(userId);
    return { wallet };
  },

  async listTransactions(
    userId: string,
    query: { type?: string; status?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = { userId: oid(userId) };
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;

    const [items, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);
    return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async getTransaction(userId: string, transactionId: string, role: string) {
    const tx = await Transaction.findById(transactionId);
    if (!tx) throw AppError.notFound('Transaction not found');
    if (role !== 'admin' && tx.userId.toString() !== userId) throw AppError.forbidden();
    return { transaction: tx };
  },

  async getReceipt(userId: string, transactionId: string, role: string) {
    const { transaction } = await this.getTransaction(userId, transactionId, role);
    const escrow = transaction.escrowId
      ? await EscrowTransaction.findById(transaction.escrowId).lean()
      : null;
    const job = transaction.jobId ? await Job.findById(transaction.jobId).lean() : null;
    const user = await User.findById(transaction.userId).select('fullName email phone').lean();
    return {
      receipt: {
        id: transaction._id,
        reference: transaction.reference,
        providerRef: transaction.providerRef,
        type: transaction.type,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        createdAt: transaction.createdAt,
        customer: user,
        job: job
          ? { id: job._id, title: job.title, status: job.status }
          : null,
        escrow: escrow
          ? {
              id: escrow._id,
              status: escrow.status,
              heldAt: escrow.heldAt,
              releasedAt: escrow.releasedAt,
              refundedAt: escrow.refundedAt,
            }
          : null,
      },
    };
  },

  async listMobileMoneyAccounts(userId: string) {
    const items = await MobileMoneyAccount.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    return { items };
  },

  async upsertMobileMoneyAccount(
    userId: string,
    input: { provider: string; msisdn: string; accountName: string; isDefault?: boolean },
  ) {
    if (input.isDefault) {
      await MobileMoneyAccount.updateMany({ userId }, { $set: { isDefault: false } });
    }
    const item = await MobileMoneyAccount.findOneAndUpdate(
      { userId, provider: input.provider, msisdn: input.msisdn },
      {
        $set: {
          accountName: input.accountName,
          isDefault: Boolean(input.isDefault),
        },
        $setOnInsert: { userId: oid(userId), isVerified: false },
      },
      { upsert: true, new: true },
    );
    return { account: item };
  },

  async removeMobileMoneyAccount(userId: string, accountId: string) {
    const deleted = await MobileMoneyAccount.findOneAndDelete({ _id: accountId, userId });
    if (!deleted) throw AppError.notFound('Mobile money account not found');
    return { ok: true };
  },

  async payForJob(
    customerId: string,
    input: {
      jobId: string;
      provider?: string;
      msisdn?: string;
      amount?: number;
      idempotencyKey?: string;
      useWallet?: boolean;
    },
    meta: Meta = {},
  ) {
    const job = await Job.findById(input.jobId);
    if (!job) throw AppError.notFound('Job not found');
    if (job.customerId.toString() !== customerId) throw AppError.forbidden();

    const payableStatuses = [
      JOB_STATUS.ASSIGNED,
      JOB_STATUS.TECHNICIAN_EN_ROUTE,
      JOB_STATUS.IN_PROGRESS,
      JOB_STATUS.AWAITING_CONFIRMATION,
    ] as string[];
    if (!payableStatuses.includes(job.status)) {
      throw AppError.badRequest(`Cannot pay for job in status ${job.status}`);
    }

    const held = await EscrowTransaction.findOne({
      jobId: job._id,
      status: { $in: [ESCROW_STATUS.HELD, ESCROW_STATUS.DISPUTED, ESCROW_STATUS.PARTIALLY_RELEASED] },
    });
    if (held) {
      throw AppError.conflict('Escrow already funded for this job');
    }

    const resolved = await resolveJobAmount(job._id.toString());
    const amount = input.amount && input.amount > 0 ? input.amount : resolved.amount;
    const currency = resolved.currency;
    const providerId = input.provider || env.PAYMENT_DEFAULT_PROVIDER;
    const idemKey = input.idempotencyKey || `pay:${customerId}:${job._id.toString()}:${amount}`;
    let reference = refFromIdempotency('pay', idemKey);
    const existing = await Transaction.findOne({ reference });
    if (existing) {
      if (existing.status === TRANSACTION_STATUS.COMPLETED) {
        const escrow = existing.escrowId ? await EscrowTransaction.findById(existing.escrowId) : null;
        return { transaction: existing, escrow, idempotent: true };
      }
      if (
        existing.status === TRANSACTION_STATUS.PENDING ||
        existing.status === TRANSACTION_STATUS.PROCESSING
      ) {
        return { transaction: existing, escrow: null, idempotent: true };
      }
      // Failed / cancelled prior attempt — allow a fresh charge with a unique retry reference.
      if (
        existing.status === TRANSACTION_STATUS.FAILED ||
        existing.status === TRANSACTION_STATUS.CANCELLED
      ) {
        const retryCount = await Transaction.countDocuments({
          jobId: job._id,
          userId: oid(customerId),
          type: TRANSACTION_TYPE.DEBIT,
          'meta.idempotencyKey': idemKey,
        });
        reference = refFromIdempotency('pay', `${idemKey}:retry:${retryCount + 1}`);
      }
    }

    const wallet = await getOrCreateWallet(customerId, currency);
    await assertWalletActive(wallet);

    let tx: TxDoc;
    try {
      tx = await Transaction.create({
        walletId: wallet._id,
        userId: oid(customerId),
        type: TRANSACTION_TYPE.DEBIT,
        status: TRANSACTION_STATUS.PENDING,
        amount,
        currency,
        reference,
        jobId: job._id,
        description: `Payment for job "${job.title}"`,
        meta: {
          provider: providerId,
          msisdn: input.msisdn,
          useWallet: Boolean(input.useWallet),
          idempotencyKey: idemKey,
        },
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        const again = await Transaction.findOne({ reference });
        if (again) return { transaction: again, escrow: null, idempotent: true };
      }
      throw err;
    }

    emitPaymentCreated({
      userId: customerId,
      customerId,
      technicianId: resolved.technicianId,
      jobId: job._id.toString(),
      transactionId: tx._id.toString(),
      amount,
      currency,
      reference,
    });

    await writeAuditLog({
      actorId: customerId,
      actorRole: 'customer',
      action: 'payment.created',
      resourceType: 'Transaction',
      resourceId: tx._id.toString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { jobId: job._id.toString(), amount, provider: providerId },
    });

    if (input.useWallet) {
      await debitAvailable(wallet._id.toString(), amount);
      tx.status = TRANSACTION_STATUS.PROCESSING;
      tx.providerRef = `wallet_${reference}`;
      await tx.save();
      return finalizeSuccessfulPayment(tx, tx.providerRef, meta);
    }

    const provider = getPaymentProvider(providerId);
    tx.status = TRANSACTION_STATUS.PROCESSING;
    await tx.save();

    try {
      const user = await User.findById(customerId).select('email phone').lean();
      const result = await provider.charge({
        amount,
        currency,
        reference,
        description: `FixNow job ${job._id}`,
        customerId,
        msisdn: input.msisdn || user?.phone,
        email: user?.email,
        metadata: { jobId: job._id.toString() },
      });

      if (result.status === 'successful') {
        return finalizeSuccessfulPayment(tx, result.providerRef, meta);
      }
      if (result.status === 'failed') {
        return markPaymentFailed(tx, 'Provider declined the charge', meta);
      }

      tx.providerRef = result.providerRef;
      tx.meta = { ...(tx.meta ?? {}), providerRaw: result.raw };
      await tx.save();
      return { transaction: tx, escrow: null };
    } catch (err) {
      await markPaymentFailed(tx, err instanceof Error ? err.message : 'Charge failed', meta);
      throw err;
    }
  },

  async handleWebhook(
    providerName: string,
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
    rawBody?: string,
  ) {
    const provider = getPaymentProvider(providerName);
    const ok = provider.verifyWebhook({
      headers,
      body,
      rawBody,
      secret: env.PAYMENT_WEBHOOK_SECRET,
    });
    if (!ok) throw AppError.unauthorized('Invalid webhook signature');

    const event: NormalizedWebhookEvent = provider.parseWebhook(body);
    if (!event.reference && !event.providerRef) {
      return { handled: false, reason: 'missing reference' };
    }

    const tx = event.reference
      ? await Transaction.findOne({ reference: event.reference })
      : await Transaction.findOne({ providerRef: event.providerRef });

    if (!tx) return { handled: false, reason: 'transaction not found' };

    const fingerprint = `${event.event}:${event.reference ?? ''}:${event.providerRef ?? ''}`;
    const seen = Array.isArray((tx.meta as { webhookEvents?: string[] } | undefined)?.webhookEvents)
      ? ([...(tx.meta as { webhookEvents: string[] }).webhookEvents] as string[])
      : [];
    if (seen.includes(fingerprint)) {
      return { handled: true, idempotent: true, transaction: tx };
    }

    if (event.event === 'charge.successful') {
      const result = await finalizeSuccessfulPayment(tx, event.providerRef || tx.providerRef || tx.reference);
      seen.push(fingerprint);
      result.transaction.meta = { ...(result.transaction.meta ?? {}), webhookEvents: seen };
      await result.transaction.save();
      return { handled: true, ...result };
    }
    if (event.event === 'charge.failed') {
      // Never downgrade a completed (escrow-funded) payment on a late/replayed failure webhook.
      if (tx.status === TRANSACTION_STATUS.COMPLETED) {
        return { handled: true, ignored: true, reason: 'already completed', transaction: tx };
      }
      const failed = await markPaymentFailed(tx, 'Webhook reported failure');
      seen.push(fingerprint);
      failed.transaction.meta = { ...(failed.transaction.meta ?? {}), webhookEvents: seen };
      await failed.transaction.save();
      return { handled: true, ...failed };
    }
    return { handled: false, reason: `unhandled event ${event.event}` };
  },

  async adminDashboard() {
    const [payments, escrows, refunds, payouts, volume] = await Promise.all([
      Transaction.countDocuments({ type: TRANSACTION_TYPE.DEBIT }),
      EscrowTransaction.countDocuments({ status: ESCROW_STATUS.HELD }),
      Transaction.countDocuments({ type: TRANSACTION_TYPE.REFUND }),
      Transaction.countDocuments({ type: TRANSACTION_TYPE.PAYOUT, status: TRANSACTION_STATUS.COMPLETED }),
      Transaction.aggregate([
        { $match: { type: TRANSACTION_TYPE.DEBIT, status: TRANSACTION_STATUS.COMPLETED } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    return {
      dashboard: {
        payments,
        escrowsHeld: escrows,
        refunds,
        payoutsCompleted: payouts,
        volumeCollected: volume[0]?.total ?? 0,
      },
    };
  },

  async adminListPayments(
    query: { status?: string; q?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = { type: TRANSACTION_TYPE.DEBIT };
    if (query.status) filter.status = query.status;
    const q = query.q?.trim();
    if (q) {
      filter.$or = [
        { reference: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { providerRef: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { description: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }
    const [items, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);
    return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async adminPendingRefunds(query: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter = {
      type: TRANSACTION_TYPE.REFUND,
      status: { $in: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.PROCESSING] },
    };
    const [items, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);
    return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async settlementReport(days = 30) {
    const safeDays = Math.min(366, Math.max(1, Number(days) || 30));
    const since = new Date(Date.now() - safeDays * 86_400_000);
    const until = new Date();

    const TYPE_LABELS: Record<string, string> = {
      [TRANSACTION_TYPE.DEBIT]: 'Debit',
      [TRANSACTION_TYPE.CREDIT]: 'Credit',
      [TRANSACTION_TYPE.RELEASE]: 'Release',
      [TRANSACTION_TYPE.REFUND]: 'Refund',
      [TRANSACTION_TYPE.PAYOUT]: 'Payout',
      [TRANSACTION_TYPE.FEE]: 'Fee',
      [TRANSACTION_TYPE.HOLD]: 'Hold',
    };

    const settlementTypes = [
      TRANSACTION_TYPE.DEBIT,
      TRANSACTION_TYPE.CREDIT,
      TRANSACTION_TYPE.RELEASE,
      TRANSACTION_TYPE.REFUND,
      TRANSACTION_TYPE.PAYOUT,
      TRANSACTION_TYPE.FEE,
    ];

    const baseMatch = {
      createdAt: { $gte: since },
      status: TRANSACTION_STATUS.COMPLETED,
      type: { $in: settlementTypes },
    };

    const [
      byTypeRows,
      heldAgg,
      dailyRows,
      weeklyRows,
      monthlyRows,
      byProviderRows,
      byStatusRows,
      recentRaw,
    ] = await Promise.all([
      Transaction.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$type', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      EscrowTransaction.aggregate([
        { $match: { status: ESCROW_STATUS.HELD } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } },
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            ...baseMatch,
            type: TRANSACTION_TYPE.DEBIT,
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$meta.provider', 'Unknown'] },
            count: { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { amount: -1 } },
        { $limit: 12 },
      ]),
      Transaction.aggregate([
        { $match: { createdAt: { $gte: since }, type: { $in: settlementTypes } } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
        { $sort: { count: -1 } },
      ]),
      Transaction.find(baseMatch)
        .sort({ createdAt: -1 })
        .limit(200)
        .select(
          'reference type status amount currency createdAt jobId userId description meta providerRef',
        )
        .lean(),
    ]);

    const amountOf = (type: string) => {
      const row = byTypeRows.find((r) => r._id === type);
      return { count: Number(row?.count ?? 0), amount: Number(row?.amount ?? 0) };
    };

    const released = amountOf(TRANSACTION_TYPE.RELEASE);
    const refunded = amountOf(TRANSACTION_TYPE.REFUND);
    const debits = amountOf(TRANSACTION_TYPE.DEBIT);
    const credits = amountOf(TRANSACTION_TYPE.CREDIT);
    const payouts = amountOf(TRANSACTION_TYPE.PAYOUT);
    const fees = amountOf(TRANSACTION_TYPE.FEE);
    const held = heldAgg[0] ?? { amount: 0, count: 0 };

    const jobIds = [
      ...new Set(
        recentRaw
          .map((tx) => (tx.jobId ? String(tx.jobId) : ''))
          .filter(Boolean),
      ),
    ];
    const userIds = [
      ...new Set(
        recentRaw
          .map((tx) => (tx.userId ? String(tx.userId) : ''))
          .filter(Boolean),
      ),
    ];

    const jobs = jobIds.length
      ? await Job.find({ _id: { $in: jobIds.map((id) => oid(id)) } })
          .select(
            'title customerId assignedTechnicianId categoryName location.district currency',
          )
          .lean()
      : [];
    const jobMap = new Map(jobs.map((j) => [String(j._id), j]));

    for (const j of jobs) {
      if (j.customerId) userIds.push(String(j.customerId));
      if (j.assignedTechnicianId) userIds.push(String(j.assignedTechnicianId));
    }

    const uniqueUserIds = [...new Set(userIds)];
    const users = uniqueUserIds.length
      ? await User.find({ _id: { $in: uniqueUserIds.map((id) => oid(id)) } })
          .select('fullName')
          .lean()
      : [];
    const userMap = new Map(users.map((u) => [String(u._id), u.fullName || 'Unknown']));

    const recent = recentRaw.map((tx) => {
      const job = tx.jobId ? jobMap.get(String(tx.jobId)) : undefined;
      const customerId = job?.customerId ? String(job.customerId) : String(tx.userId ?? '');
      const technicianId = job?.assignedTechnicianId
        ? String(job.assignedTechnicianId)
        : '';
      const meta = (tx.meta ?? {}) as Record<string, unknown>;
      const fee = Number(meta.fee ?? meta.platformFee ?? 0) || 0;
      const platformCommission =
        Number(meta.platformCommission ?? meta.commission ?? 0) || 0;
      const type = String(tx.type);
      return {
        settlementId: String(tx.reference),
        job: job?.title || (tx.description ? String(tx.description) : '—'),
        customer: customerId ? userMap.get(customerId) || '—' : '—',
        technician: technicianId ? userMap.get(technicianId) || '—' : '—',
        amount: Number(tx.amount ?? 0),
        currency: String(tx.currency || 'UGX'),
        fee,
        platformCommission,
        releaseDate: tx.createdAt ? new Date(tx.createdAt).toISOString() : null,
        status: String(tx.status),
        type,
        typeLabel: TYPE_LABELS[type] || type,
        paymentMethod: String(meta.provider || '—'),
        category: String(job?.categoryName || '—'),
        district: String(job?.location?.district || '—'),
      };
    });

    const rollup = (
      items: typeof recent,
      key: keyof (typeof recent)[number],
      limit = 10,
    ) => {
      const map = new Map<string, { label: string; count: number; amount: number }>();
      for (const row of items) {
        const label = String(row[key] || '—');
        if (!label || label === '—') continue;
        const cur = map.get(label) || { label, count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += Number(row.amount || 0);
        map.set(label, cur);
      }
      return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
    };

    const mapSeries = (
      rows: Array<{ _id: string; count: number; amount: number }>,
      kind: 'day' | 'week' | 'month',
    ) =>
      rows.map((r) => ({
        key: String(r._id),
        label:
          kind === 'day'
            ? String(r._id).slice(5)
            : kind === 'week'
              ? String(r._id).replace('-', ' ')
              : String(r._id),
        count: Number(r.count ?? 0),
        amount: Number(r.amount ?? 0),
      }));

    return {
      report: {
        period: {
          days: safeDays,
          since: since.toISOString(),
          until: until.toISOString(),
        },
        summary: {
          totalSettlements: byTypeRows.reduce((n, r) => n + Number(r.count || 0), 0),
          totalReleased: released,
          totalHeld: { count: Number(held.count ?? 0), amount: Number(held.amount ?? 0) },
          totalRefunded: refunded,
          totalDebits: debits,
          totalCredits: credits,
          totalPayouts: payouts,
          totalFees: fees,
        },
        series: {
          daily: mapSeries(dailyRows, 'day'),
          weekly: mapSeries(weeklyRows, 'week'),
          monthly: mapSeries(monthlyRows, 'month'),
        },
        breakdowns: {
          byType: byTypeRows.map((r) => ({
            key: String(r._id),
            label: TYPE_LABELS[String(r._id)] || String(r._id),
            count: Number(r.count ?? 0),
            amount: Number(r.amount ?? 0),
          })),
          byPaymentMethod: byProviderRows.map((r) => ({
            key: String(r._id),
            label: String(r._id)
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            count: Number(r.count ?? 0),
            amount: Number(r.amount ?? 0),
          })),
          byTechnician: rollup(recent, 'technician'),
          byCustomer: rollup(recent, 'customer'),
          byCategory: rollup(recent, 'category'),
          byDistrict: rollup(recent, 'district'),
          byStatus: byStatusRows.map((r) => ({
            key: String(r._id),
            label: String(r._id)
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            count: Number(r.count ?? 0),
            amount: Number(r.amount ?? 0),
          })),
        },
        recent,
      },
    };
  },
};

export const escrowService = {
  async getForJob(actor: { userId: string; role: string }, jobId: string) {
    const job = await Job.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');
    const isParty =
      job.customerId.toString() === actor.userId ||
      job.assignedTechnicianId?.toString() === actor.userId ||
      actor.role === 'admin';
    if (!isParty) throw AppError.forbidden();

    const escrow = await EscrowTransaction.findOne({ jobId }).sort({ createdAt: -1 });
    const related = escrow
      ? await Transaction.find({ escrowId: escrow._id }).sort({ createdAt: -1 }).lean()
      : [];
    return { escrow, transactions: related };
  },

  async list(
    actor: { userId: string; role: string },
    query: { status?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (actor.role === 'customer') filter.customerId = oid(actor.userId);
    else if (actor.role === 'technician') filter.technicianId = oid(actor.userId);

    const [rawItems, total] = await Promise.all([
      EscrowTransaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      EscrowTransaction.countDocuments(filter),
    ]);

    let items = rawItems;
    if (actor.role === 'admin' && rawItems.length) {
      const jobIds = [...new Set(rawItems.map((e) => String(e.jobId)))];
      const partyIds = [
        ...new Set(
          rawItems.flatMap((e) => [String(e.customerId), String(e.technicianId)].filter(Boolean)),
        ),
      ];
      const [jobs, users] = await Promise.all([
        Job.find({ _id: { $in: jobIds.map((id) => oid(id)) } })
          .select('title')
          .lean(),
        User.find({ _id: { $in: partyIds.map((id) => oid(id)) } })
          .select('fullName')
          .lean(),
      ]);
      const jobTitles = new Map(jobs.map((j) => [String(j._id), j.title]));
      const names = new Map(users.map((u) => [String(u._id), u.fullName || 'Unknown']));
      items = rawItems.map((e) => ({
        ...e,
        jobTitle: jobTitles.get(String(e.jobId)) || 'Job',
        customerName: names.get(String(e.customerId)) || 'Customer',
        technicianName: names.get(String(e.technicianId)) || 'Technician',
      }));
    }

    return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  },

  async releaseForJob(
    jobId: string,
    actor?: { userId: string; role: string },
    meta: Meta = {},
    opts: { force?: boolean } = {},
  ) {
    const escrow = await EscrowTransaction.findOne({
      jobId,
      status: { $in: [ESCROW_STATUS.HELD, ESCROW_STATUS.PARTIALLY_RELEASED, ESCROW_STATUS.DISPUTED] },
    });
    if (!escrow) return { released: false, reason: 'no escrow' };

    if (escrow.status === ESCROW_STATUS.DISPUTED && !opts.force && actor?.role !== 'admin') {
      throw AppError.badRequest('Disputed escrow requires admin release');
    }

    const alreadyReleased = await Transaction.findOne({
      escrowId: escrow._id,
      type: TRANSACTION_TYPE.RELEASE,
      status: TRANSACTION_STATUS.COMPLETED,
    });
    if (alreadyReleased && escrow.status === ESCROW_STATUS.RELEASED) {
      return { released: true, escrow, idempotent: true };
    }

    const refundedAgg = await Transaction.aggregate([
      {
        $match: {
          escrowId: escrow._id,
          type: TRANSACTION_TYPE.REFUND,
          status: TRANSACTION_STATUS.COMPLETED,
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const refunded = refundedAgg[0]?.total ?? 0;
    const releaseAmount = Math.max(0, escrow.amount - refunded);
    if (releaseAmount <= 0) {
      escrow.status = ESCROW_STATUS.REFUNDED;
      escrow.refundedAt = escrow.refundedAt ?? new Date();
      await escrow.save();
      return { released: false, escrow, reason: 'fully refunded' };
    }

    const techWallet = await getOrCreateWallet(escrow.technicianId.toString(), escrow.currency);
    await assertWalletActive(techWallet);
    const updatedWallet = await creditAvailable(techWallet._id.toString(), releaseAmount);

    const releaseTx = await Transaction.create({
      walletId: techWallet._id,
      userId: escrow.technicianId,
      type: TRANSACTION_TYPE.RELEASE,
      status: TRANSACTION_STATUS.COMPLETED,
      amount: releaseAmount,
      currency: escrow.currency,
      reference: newRef('rel'),
      providerRef: escrow.providerRef,
      jobId: escrow.jobId,
      escrowId: escrow._id,
      description: 'Escrow release to technician',
      balanceAfter: updatedWallet.availableBalance,
      meta: { actorId: actor?.userId, force: Boolean(opts.force) },
    });

    escrow.status = ESCROW_STATUS.RELEASED;
    escrow.releasedAt = new Date();
    await escrow.save();

    const payload = {
      userId: escrow.technicianId.toString(),
      customerId: escrow.customerId.toString(),
      technicianId: escrow.technicianId.toString(),
      jobId: escrow.jobId.toString(),
      escrowId: escrow._id.toString(),
      amount: releaseAmount,
      currency: escrow.currency,
      transactionId: releaseTx._id.toString(),
    };
    emitEscrowReleased(payload);

    await createDbNotification({
      userId: escrow.technicianId.toString(),
      type: PUSH_EVENTS.ESCROW_RELEASED,
      title: 'Escrow released',
      body: `${releaseAmount} ${escrow.currency} was released to your wallet.`,
      jobId: escrow.jobId.toString(),
    });
    await createDbNotification({
      userId: escrow.customerId.toString(),
      type: PUSH_EVENTS.ESCROW_RELEASED,
      title: 'Payment released',
      body: `Funds for your job were released to the technician.`,
      jobId: escrow.jobId.toString(),
    });

    await writeAuditLog({
      actorId: actor?.userId,
      actorRole: actor?.role,
      action: 'escrow.released',
      resourceType: 'EscrowTransaction',
      resourceId: escrow._id.toString(),
      ip: meta.ip,
      meta: { amount: releaseAmount, jobId },
    });

    return { released: true, escrow, transaction: releaseTx };
  },

  async requestRefund(
    actor: { userId: string; role: string },
    input: { jobId: string; amount?: number; reason?: string },
    meta: Meta = {},
  ) {
    const escrow = await EscrowTransaction.findOne({
      jobId: input.jobId,
      status: { $in: [ESCROW_STATUS.HELD, ESCROW_STATUS.DISPUTED, ESCROW_STATUS.PARTIALLY_RELEASED] },
    });
    if (!escrow) throw AppError.notFound('Active escrow not found');

    const isCustomer = escrow.customerId.toString() === actor.userId;
    if (!isCustomer && actor.role !== 'admin') throw AppError.forbidden();

    const refundedAgg = await Transaction.aggregate([
      {
        $match: {
          escrowId: escrow._id,
          type: TRANSACTION_TYPE.REFUND,
          status: { $in: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.COMPLETED, TRANSACTION_STATUS.PROCESSING] },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const already = refundedAgg[0]?.total ?? 0;
    const maxRefundable = escrow.amount - already;
    const amount = input.amount && input.amount > 0 ? input.amount : maxRefundable;
    if (amount <= 0 || amount > maxRefundable) {
      throw AppError.badRequest('Invalid refund amount');
    }

    const wallet = await getOrCreateWallet(escrow.customerId.toString(), escrow.currency);
    const tx = await Transaction.create({
      walletId: wallet._id,
      userId: escrow.customerId,
      type: TRANSACTION_TYPE.REFUND,
      status: TRANSACTION_STATUS.PENDING,
      amount,
      currency: escrow.currency,
      reference: newRef('rfnd'),
      jobId: escrow.jobId,
      escrowId: escrow._id,
      description: input.reason || 'Refund requested',
      meta: { requestedBy: actor.userId, reason: input.reason },
    });

    emitRefundRequested({
      userId: escrow.customerId.toString(),
      customerId: escrow.customerId.toString(),
      technicianId: escrow.technicianId.toString(),
      jobId: escrow.jobId.toString(),
      escrowId: escrow._id.toString(),
      transactionId: tx._id.toString(),
      amount,
    });

    await createDbNotification({
      userId: escrow.customerId.toString(),
      type: PUSH_EVENTS.REFUND_REQUESTED,
      title: 'Refund requested',
      body: `Your refund request of ${amount} ${escrow.currency} is pending admin approval.`,
      jobId: escrow.jobId.toString(),
      data: { transactionId: tx._id.toString() },
    });

    try {
      const { notifyAdmins } = await import('../push/push.service.js');
      await notifyAdmins({
        type: PUSH_EVENTS.REFUND_REQUESTED,
        title: 'Refund approval needed',
        body: `Refund of ${amount} ${escrow.currency} requested for job ${escrow.jobId.toString()}.`,
        jobId: escrow.jobId.toString(),
        data: { transactionId: tx._id.toString() },
      });
    } catch {
      /* non-fatal */
    }

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'refund.requested',
      resourceType: 'Transaction',
      resourceId: tx._id.toString(),
      ip: meta.ip,
      meta: { amount, jobId: input.jobId },
    });

    // Admin self-request auto-approves; customer requests wait for admin unless full auto in console mode
    if (actor.role === 'admin') {
      return this.approveRefund({ userId: actor.userId, role: 'admin' }, tx._id.toString(), meta);
    }

    return { transaction: tx, escrow, pendingApproval: true };
  },

  async approveRefund(actor: { userId: string; role: string }, transactionId: string, meta: Meta = {}) {
    if (actor.role !== 'admin') throw AppError.forbidden();
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== TRANSACTION_TYPE.REFUND) throw AppError.notFound('Refund not found');
    if (tx.status === TRANSACTION_STATUS.COMPLETED) return { transaction: tx, idempotent: true };
    if (tx.status !== TRANSACTION_STATUS.PENDING && tx.status !== TRANSACTION_STATUS.PROCESSING) {
      throw AppError.badRequest(`Cannot approve refund in status ${tx.status}`);
    }

    const escrow = tx.escrowId ? await EscrowTransaction.findById(tx.escrowId) : null;
    if (!escrow) throw AppError.notFound('Escrow not found');

    const provider = getPaymentProvider(String((tx.meta as { provider?: string } | undefined)?.provider || env.PAYMENT_DEFAULT_PROVIDER));
    const result = await provider.refund({
      amount: tx.amount,
      currency: tx.currency,
      providerRef: escrow.providerRef || tx.reference,
      reference: tx.reference,
      reason: tx.description,
    });

    if (result.status === 'failed') {
      tx.status = TRANSACTION_STATUS.FAILED;
      await tx.save();
      throw AppError.badRequest('Provider refund failed');
    }

    const wallet = await getOrCreateWallet(tx.userId.toString(), tx.currency);
    const updated = await creditAvailable(wallet._id.toString(), tx.amount);
    tx.status = TRANSACTION_STATUS.COMPLETED;
    tx.providerRef = result.providerRef;
    tx.balanceAfter = updated.availableBalance;
    await tx.save();

    const refundedAgg = await Transaction.aggregate([
      {
        $match: {
          escrowId: escrow._id,
          type: TRANSACTION_TYPE.REFUND,
          status: TRANSACTION_STATUS.COMPLETED,
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalRefunded = refundedAgg[0]?.total ?? 0;
    if (totalRefunded >= escrow.amount) {
      escrow.status = ESCROW_STATUS.REFUNDED;
      escrow.refundedAt = new Date();
    } else {
      escrow.status = ESCROW_STATUS.PARTIALLY_RELEASED;
    }
    await escrow.save();

    emitRefundApproved({
      userId: tx.userId.toString(),
      customerId: escrow.customerId.toString(),
      technicianId: escrow.technicianId.toString(),
      jobId: escrow.jobId.toString(),
      escrowId: escrow._id.toString(),
      transactionId: tx._id.toString(),
      amount: tx.amount,
    });

    await createDbNotification({
      userId: tx.userId.toString(),
      type: PUSH_EVENTS.REFUND_PROCESSED,
      title: 'Refund processed',
      body: `A refund of ${tx.amount} ${tx.currency} was credited to your wallet.`,
      jobId: escrow.jobId.toString(),
    });

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'refund.approved',
      resourceType: 'Transaction',
      resourceId: tx._id.toString(),
      ip: meta.ip,
      meta: { amount: tx.amount },
    });

    return { transaction: tx, escrow };
  },

  async openDispute(
    actor: { userId: string; role: string },
    input: { jobId: string; reason: string },
    meta: Meta = {},
  ) {
    const escrow = await EscrowTransaction.findOne({
      jobId: input.jobId,
      status: { $in: [ESCROW_STATUS.HELD, ESCROW_STATUS.PARTIALLY_RELEASED] },
    });
    if (!escrow) throw AppError.notFound('Active escrow not found');

    const isParty =
      escrow.customerId.toString() === actor.userId ||
      escrow.technicianId.toString() === actor.userId ||
      actor.role === 'admin';
    if (!isParty) throw AppError.forbidden();

    escrow.status = ESCROW_STATUS.DISPUTED;
    escrow.disputeReason = input.reason;
    await escrow.save();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'escrow.disputed',
      resourceType: 'EscrowTransaction',
      resourceId: escrow._id.toString(),
      ip: meta.ip,
      meta: { reason: input.reason },
      severity: 'warning',
    });

    try {
      const { notifyAdmins } = await import('../push/push.service.js');
      await notifyAdmins({
        type: PUSH_EVENTS.MARKETPLACE_ALERT,
        title: 'Escrow dispute opened',
        body: `Dispute on job ${escrow.jobId.toString()}: ${input.reason.slice(0, 120)}`,
        jobId: escrow.jobId.toString(),
        data: { escrowId: escrow._id.toString() },
      });
    } catch {
      /* non-fatal */
    }

    return { escrow };
  },

  async resolveDispute(
    actor: { userId: string; role: string },
    input: { jobId: string; action: 'release' | 'refund'; amount?: number; reason?: string },
    meta: Meta = {},
  ) {
    if (actor.role !== 'admin') throw AppError.forbidden();
    if (input.action === 'release') {
      return this.releaseForJob(input.jobId, actor, meta, { force: true });
    }
    const refund = await this.requestRefund(
      actor,
      { jobId: input.jobId, amount: input.amount, reason: input.reason || 'Admin dispute resolution' },
      meta,
    );
    return refund;
  },

  async adminDashboard() {
    const [held, disputed, released, refunded] = await Promise.all([
      EscrowTransaction.countDocuments({ status: ESCROW_STATUS.HELD }),
      EscrowTransaction.countDocuments({ status: ESCROW_STATUS.DISPUTED }),
      EscrowTransaction.countDocuments({ status: ESCROW_STATUS.RELEASED }),
      EscrowTransaction.countDocuments({ status: ESCROW_STATUS.REFUNDED }),
    ]);
    const heldAmount = await EscrowTransaction.aggregate([
      { $match: { status: ESCROW_STATUS.HELD } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return {
      dashboard: {
        held,
        disputed,
        released,
        refunded,
        heldAmount: heldAmount[0]?.total ?? 0,
      },
    };
  },
};

export const payoutService = {
  async earnings(technicianId: string) {
    const wallet = await getOrCreateWallet(technicianId);
    const [pendingEscrow, completedPayouts, releases] = await Promise.all([
      EscrowTransaction.aggregate([
        { $match: { technicianId: oid(technicianId), status: ESCROW_STATUS.HELD } },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            userId: oid(technicianId),
            type: TRANSACTION_TYPE.PAYOUT,
            status: TRANSACTION_STATUS.COMPLETED,
          },
        },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            userId: oid(technicianId),
            type: TRANSACTION_TYPE.RELEASE,
            status: TRANSACTION_STATUS.COMPLETED,
          },
        },
        { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const pendingPayouts = await Transaction.find({
      userId: technicianId,
      type: TRANSACTION_TYPE.PAYOUT,
      status: { $in: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.PROCESSING] },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const completedPayoutList = await Transaction.find({
      userId: technicianId,
      type: TRANSACTION_TYPE.PAYOUT,
      status: TRANSACTION_STATUS.COMPLETED,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const ledger = await Transaction.find({ userId: technicianId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return {
      wallet,
      summary: {
        availableBalance: wallet.availableBalance,
        heldInEscrow: pendingEscrow[0]?.amount ?? 0,
        pendingEscrowCount: pendingEscrow[0]?.count ?? 0,
        lifetimeReleased: releases[0]?.amount ?? 0,
        lifetimePayouts: completedPayouts[0]?.amount ?? 0,
      },
      pendingPayouts,
      completedPayouts: completedPayoutList,
      ledger,
    };
  },

  async requestPayout(
    technicianId: string,
    input: { amount: number; msisdn?: string; provider?: string },
    meta: Meta = {},
  ) {
    if (!input.amount || input.amount <= 0) throw AppError.badRequest('Invalid payout amount');
    const wallet = await getOrCreateWallet(technicianId);
    await assertWalletActive(wallet);
    if (wallet.availableBalance < input.amount) throw AppError.badRequest('Insufficient balance');

    let msisdn = input.msisdn;
    let accountName: string | undefined;
    if (!msisdn) {
      const account = await MobileMoneyAccount.findOne({ userId: technicianId, isDefault: true });
      msisdn = account?.msisdn;
      accountName = account?.accountName;
    }
    if (!msisdn) throw AppError.badRequest('Mobile money MSISDN required for payout');

    const reference = newRef('payout');
    await debitAvailable(wallet._id.toString(), input.amount);
    const refreshed = await getOrCreateWallet(technicianId);

    const tx = await Transaction.create({
      walletId: wallet._id,
      userId: oid(technicianId),
      type: TRANSACTION_TYPE.PAYOUT,
      status: TRANSACTION_STATUS.PENDING,
      amount: input.amount,
      currency: wallet.currency,
      reference,
      description: 'Payout request',
      balanceAfter: refreshed.availableBalance,
      meta: { msisdn, accountName, provider: input.provider || env.PAYMENT_DEFAULT_PROVIDER },
    });

    await writeAuditLog({
      actorId: technicianId,
      actorRole: 'technician',
      action: 'payout.requested',
      resourceType: 'Transaction',
      resourceId: tx._id.toString(),
      ip: meta.ip,
      meta: { amount: input.amount },
    });

    try {
      const { notifyAdmins } = await import('../push/push.service.js');
      await notifyAdmins({
        type: PUSH_EVENTS.MARKETPLACE_ALERT,
        title: 'Payout approval needed',
        body: `Technician requested payout of ${input.amount} ${wallet.currency}.`,
        data: { transactionId: tx._id.toString() },
      });
    } catch {
      /* non-fatal */
    }

    return { transaction: tx, requiresApproval: true };
  },

  async approvePayout(actor: { userId: string; role: string }, transactionId: string, meta: Meta = {}) {
    if (actor.role !== 'admin') throw AppError.forbidden();
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== TRANSACTION_TYPE.PAYOUT) throw AppError.notFound('Payout not found');
    if (tx.status === TRANSACTION_STATUS.COMPLETED) return { transaction: tx, idempotent: true };
    if (tx.status !== TRANSACTION_STATUS.PENDING) {
      throw AppError.badRequest(`Cannot approve payout in status ${tx.status}`);
    }

    tx.status = TRANSACTION_STATUS.PROCESSING;
    await tx.save();

    const providerName = String((tx.meta as { provider?: string } | undefined)?.provider || env.PAYMENT_DEFAULT_PROVIDER);
    const msisdn = String((tx.meta as { msisdn?: string } | undefined)?.msisdn || '');
    const provider = getPaymentProvider(providerName);
    const result = await provider.payout({
      amount: tx.amount,
      currency: tx.currency,
      reference: tx.reference,
      msisdn,
      accountName: (tx.meta as { accountName?: string } | undefined)?.accountName,
    });

    if (result.status === 'failed') {
      // Restore balance on failure
      await creditAvailable(tx.walletId.toString(), tx.amount);
      tx.status = TRANSACTION_STATUS.FAILED;
      await tx.save();
      throw AppError.badRequest('Payout provider failed');
    }

    if (result.status === 'successful') {
      tx.status = TRANSACTION_STATUS.COMPLETED;
      tx.providerRef = result.providerRef;
      await tx.save();

      emitPayoutCompleted({
        userId: tx.userId.toString(),
        technicianId: tx.userId.toString(),
        transactionId: tx._id.toString(),
        amount: tx.amount,
        currency: tx.currency,
      });

      await createDbNotification({
        userId: tx.userId.toString(),
        type: PUSH_EVENTS.PAYOUT_COMPLETED,
        title: 'Payout completed',
        body: `${tx.amount} ${tx.currency} was sent to your Mobile Money.`,
      });

      await writeAuditLog({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'payout.completed',
        resourceType: 'Transaction',
        resourceId: tx._id.toString(),
        ip: meta.ip,
        meta: { amount: tx.amount },
      });
    } else {
      tx.providerRef = result.providerRef;
      await tx.save();
    }

    return { transaction: tx };
  },

  async listPending(query: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter = {
      type: TRANSACTION_TYPE.PAYOUT,
      status: { $in: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.PROCESSING] },
    };
    const [items, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);
    return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  },
};

export async function processEscrowAutoReleases(): Promise<number> {
  if (env.ESCROW_AUTO_RELEASE_MS <= 0) return 0;
  const due = await EscrowTransaction.find({
    status: ESCROW_STATUS.HELD,
    releaseScheduleAt: { $lte: new Date() },
  }).limit(50);

  let n = 0;
  for (const escrow of due) {
    const job = await Job.findById(escrow.jobId);
    if (!job || job.status !== JOB_STATUS.COMPLETED) continue;
    try {
      const result = await escrowService.releaseForJob(escrow.jobId.toString(), {
        userId: 'system',
        role: 'admin',
      });
      if (result.released) n += 1;
    } catch {
      // continue
    }
  }
  return n;
}

export type { IEscrowTransaction };
