/**
 * Assigns / ensures a human-friendly publicJobReference on a Job document.
 * Does not replace Mongo `_id`.
 */

import { type HydratedDocument } from 'mongoose';
import { Job, type IJob } from '../models/index.js';
import { formatJobReferenceParts } from './jobReference.js';

export async function ensurePublicJobReference(job: HydratedDocument<IJob>): Promise<string> {
  if (job.publicJobReference) return job.publicJobReference;

  const at = job.createdAt ? new Date(job.createdAt) : new Date();
  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(at);
  dayEnd.setHours(23, 59, 59, 999);

  const seq =
    (await Job.countDocuments({
      createdAt: { $gte: dayStart, $lte: dayEnd },
      _id: { $lte: job._id },
    })) || 1;

  const reference = formatJobReferenceParts({
    categoryName: job.categoryName,
    district: job.location?.district,
    at,
    sequence: seq,
  });

  job.publicJobReference = reference;
  // Include reference in searchText for admin search without schema migration of text index.
  const existing = String(job.searchText || '');
  if (!existing.includes(reference)) {
    job.searchText = `${existing} ${reference}`.trim();
  }

  try {
    await job.save();
  } catch {
    // Unique collision — append object id suffix fragment.
    job.publicJobReference = `${reference}-${String(job._id).slice(-3).toUpperCase()}`;
    await job.save();
  }

  return job.publicJobReference;
}
