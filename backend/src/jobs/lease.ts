import os from 'node:os';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { recordJobTick } from '../observability/metrics.js';

/**
 * Lightweight single-leader lease so interval workers do not double-fire
 * across multiple API replicas. Uses an atomic findOneAndUpdate on a
 * dedicated collection — no external queue required.
 */
export interface JobLeaseDoc {
  _id: string;
  owner: string;
  expiresAt: Date;
}

const leaseSchema = new mongoose.Schema<JobLeaseDoc>(
  {
    _id: { type: String, required: true },
    owner: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'job_leases', versionKey: false },
);

leaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const JobLease: mongoose.Model<JobLeaseDoc> =
  (mongoose.models.JobLease as mongoose.Model<JobLeaseDoc>) ??
  mongoose.model<JobLeaseDoc>('JobLease', leaseSchema);

const OWNER = `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: number }).code === 11000);
}

/**
 * Runs `work` only if this instance owns the lease for `jobName`.
 * Returns true when the work ran on this instance.
 */
export async function withJobLease(
  jobName: string,
  ttlMs: number,
  work: () => Promise<void>,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(5_000, ttlMs));

  let lease: JobLeaseDoc | null = null;
  try {
    lease = await JobLease.findOneAndUpdate(
      { _id: jobName, $or: [{ expiresAt: { $lte: now } }, { owner: OWNER }] },
      { $set: { owner: OWNER, expiresAt } },
      { upsert: true, new: true, lean: true },
    );
  } catch (error) {
    // Another replica won the upsert race — expected under concurrency.
    if (isDuplicateKeyError(error)) return false;
    logger.error(`Job lease "${jobName}" acquisition failed`, error);
    return false;
  }

  if (!lease || lease.owner !== OWNER) return false;

  try {
    await work();
    recordJobTick(true);
    return true;
  } catch (error) {
    recordJobTick(false);
    logger.error(`Job "${jobName}" failed`, error);
    return false;
  }
}
