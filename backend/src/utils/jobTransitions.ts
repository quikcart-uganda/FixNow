import { JOB_STATUS, type JobStatus } from '../models/shared/enums.js';
import { AppError } from './AppError.js';

/** Valid directed transitions for the FixNow job state machine. */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JOB_STATUS.DRAFT]: [JOB_STATUS.POSTED, JOB_STATUS.CANCELLED, JOB_STATUS.ARCHIVED],
  [JOB_STATUS.POSTED]: [JOB_STATUS.ASSIGNED, JOB_STATUS.CANCELLED, JOB_STATUS.ARCHIVED],
  [JOB_STATUS.ASSIGNED]: [
    JOB_STATUS.TECHNICIAN_EN_ROUTE,
    JOB_STATUS.CANCELLED,
    JOB_STATUS.DISPUTED,
  ],
  [JOB_STATUS.TECHNICIAN_EN_ROUTE]: [
    JOB_STATUS.IN_PROGRESS,
    JOB_STATUS.CANCELLED,
    JOB_STATUS.DISPUTED,
  ],
  [JOB_STATUS.IN_PROGRESS]: [
    JOB_STATUS.AWAITING_CONFIRMATION,
    JOB_STATUS.DISPUTED,
    JOB_STATUS.CANCELLED,
  ],
  [JOB_STATUS.AWAITING_CONFIRMATION]: [
    JOB_STATUS.COMPLETED,
    JOB_STATUS.IN_PROGRESS,
    JOB_STATUS.DISPUTED,
  ],
  [JOB_STATUS.COMPLETED]: [JOB_STATUS.ARCHIVED],
  [JOB_STATUS.CANCELLED]: [JOB_STATUS.ARCHIVED],
  [JOB_STATUS.DISPUTED]: [
    JOB_STATUS.IN_PROGRESS,
    JOB_STATUS.CANCELLED,
    JOB_STATUS.COMPLETED,
    JOB_STATUS.ARCHIVED,
  ],
  [JOB_STATUS.ARCHIVED]: [],
};

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  const allowed = JOB_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw AppError.badRequest(`Illegal job status transition: ${from} → ${to}`);
  }
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === JOB_STATUS.ARCHIVED;
}
