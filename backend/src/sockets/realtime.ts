import type { Server } from 'socket.io';
import { logger } from '../config/logger.js';
import { ROOMS, SOCKET_EVENTS } from './events.js';

let ioRef: Server | null = null;
let metricsTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMetricsMeta: Record<string, unknown> = {};

export function setSocketServer(io: Server): void {
  ioRef = io;
}

export function getSocketServer(): Server | null {
  return ioRef;
}

function emitSafe(targets: string[], event: string, payload: unknown): void {
  const io = ioRef;
  if (!io) return;
  try {
    const unique = [...new Set(targets.filter(Boolean))];
    for (const room of unique) {
      io.to(room).emit(event, payload);
    }
  } catch (err) {
    logger.warn('socket emit failed', { event, err });
  }
}

function jobPayload(job: { toObject?: () => unknown } | Record<string, unknown> | null | undefined) {
  if (!job) return null;
  if (typeof (job as { toObject?: () => unknown }).toObject === 'function') {
    return (job as { toObject: () => unknown }).toObject();
  }
  return job;
}

function idOf(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function jobRooms(job: Record<string, unknown>): string[] {
  const jobId = idOf(job._id ?? job.id);
  const customerId = idOf(job.customerId);
  const techId = idOf(job.assignedTechnicianId);
  const rooms = [ROOMS.admin()];
  if (jobId) rooms.push(ROOMS.job(jobId));
  if (customerId) rooms.push(ROOMS.user(customerId));
  if (techId) rooms.push(ROOMS.user(techId));
  return rooms;
}

/** Debounced admin metrics signal (coalesces bursty marketplace mutations). */
export function emitDashboardMetricsUpdated(reason: string, meta?: Record<string, unknown>): void {
  pendingMetricsMeta = {
    ...pendingMetricsMeta,
    ...meta,
    reason,
    at: new Date().toISOString(),
    reasons: [...new Set([...(Array.isArray(pendingMetricsMeta.reasons) ? (pendingMetricsMeta.reasons as string[]) : []), reason])],
  };
  if (metricsTimer) clearTimeout(metricsTimer);
  metricsTimer = setTimeout(() => {
    const payload = { ...pendingMetricsMeta };
    pendingMetricsMeta = {};
    metricsTimer = null;
    emitSafe([ROOMS.admin()], SOCKET_EVENTS.DASHBOARD_METRICS_UPDATED, payload);
    emitSafe([ROOMS.admin()], SOCKET_EVENTS.MARKETPLACE_STATS_UPDATED, payload);
  }, 400);
}

export function emitUserOnline(userId: string, role: string): void {
  const payload = { userId, role, at: new Date().toISOString() };
  emitSafe([ROOMS.admin(), ROOMS.user(userId)], SOCKET_EVENTS.USER_ONLINE, payload);
}

export function emitUserOffline(userId: string, role: string): void {
  const payload = { userId, role, at: new Date().toISOString() };
  emitSafe([ROOMS.admin(), ROOMS.user(userId)], SOCKET_EVENTS.USER_OFFLINE, payload);
}

export function emitUserRegistered(user: {
  id?: string;
  _id?: unknown;
  role?: string;
  fullName?: string;
  email?: string;
}): void {
  const userId = idOf(user.id ?? user._id);
  emitSafe([ROOMS.admin()], SOCKET_EVENTS.USER_REGISTERED, {
    user: {
      id: userId,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    },
    at: new Date().toISOString(),
  });
  emitDashboardMetricsUpdated('user.registered', { userId, role: user.role });
}

export function emitJobCreated(jobDoc: unknown): void {
  const job = jobPayload(jobDoc as never) as Record<string, unknown>;
  const status = String(job.status ?? '');
  const rooms = [...jobRooms(job)];
  // Only notify the creating customer + admins for drafts; technicians on publish.
  if (status === 'posted') {
    rooms.push(ROOMS.role('technician'));
  }
  emitSafe(rooms, SOCKET_EVENTS.JOB_CREATED, { job });
  if (status === 'posted') {
    emitSafe(
      [...jobRooms(job), ROOMS.role('technician'), ROOMS.admin()],
      SOCKET_EVENTS.JOB_PUBLISHED,
      { job },
    );
  }
  emitDashboardMetricsUpdated('job.created', { jobId: idOf(job._id) });
}

export function emitJobUpdated(jobDoc: unknown): void {
  const job = jobPayload(jobDoc as never) as Record<string, unknown>;
  const rooms = [...jobRooms(job)];
  if (String(job.status) === 'posted') rooms.push(ROOMS.role('technician'));
  emitSafe(rooms, SOCKET_EVENTS.JOB_UPDATED, { job });
}

export function emitJobPublished(jobDoc: unknown): void {
  const job = jobPayload(jobDoc as never) as Record<string, unknown>;
  emitSafe(
    [...jobRooms(job), ROOMS.role('technician'), ROOMS.admin()],
    SOCKET_EVENTS.JOB_PUBLISHED,
    { job },
  );
  emitDashboardMetricsUpdated('job.published', { jobId: idOf(job._id) });
}

export function emitJobStatusChanged(jobDoc: unknown, from: string, to: string): void {
  const job = jobPayload(jobDoc as never) as Record<string, unknown>;
  const payload = { job, from, to, at: new Date().toISOString() };
  const rooms = [...jobRooms(job), ROOMS.admin()];
  if (to === 'posted' || from === 'posted') rooms.push(ROOMS.role('technician'));
  emitSafe(rooms, SOCKET_EVENTS.JOB_STATUS_CHANGED, payload);

  if (to === 'cancelled') {
    emitSafe([...rooms, ROOMS.role('technician')], SOCKET_EVENTS.JOB_CANCELLED, payload);
  }
  if (to === 'completed') {
    emitSafe(rooms, SOCKET_EVENTS.JOB_COMPLETED, payload);
  }
  if (to === 'assigned') {
    emitSafe(rooms, SOCKET_EVENTS.JOB_ASSIGNED, payload);
  }
  emitDashboardMetricsUpdated('job.status_changed', { jobId: idOf(job._id), from, to });
}

export function emitApplicationSubmitted(applicationDoc: unknown, jobDoc: unknown): void {
  const application = jobPayload(applicationDoc as never);
  const job = jobPayload(jobDoc as never) as Record<string, unknown>;
  const customerId = idOf(job.customerId);
  const techId = idOf((application as Record<string, unknown>)?.technicianId);
  const jobId = idOf(job._id);
  const rooms = [ROOMS.admin()];
  if (customerId) rooms.push(ROOMS.user(customerId));
  if (techId) rooms.push(ROOMS.user(techId));
  if (jobId) rooms.push(ROOMS.job(jobId));
  emitSafe(rooms, SOCKET_EVENTS.APPLICATION_SUBMITTED, { application, job });
  emitDashboardMetricsUpdated('application.submitted', { jobId });
}

export function emitApplicationWithdrawn(
  applicationDoc: unknown,
  jobId?: string,
  customerId?: string,
): void {
  const application = jobPayload(applicationDoc as never) as Record<string, unknown>;
  const techId = idOf(application.technicianId);
  const resolvedJobId = jobId ?? idOf(application.jobId);
  const rooms = [ROOMS.admin()];
  if (techId) rooms.push(ROOMS.user(techId));
  if (customerId) rooms.push(ROOMS.user(customerId));
  if (resolvedJobId) rooms.push(ROOMS.job(resolvedJobId));
  emitSafe(rooms, SOCKET_EVENTS.APPLICATION_WITHDRAWN, { application, jobId: resolvedJobId });
  emitDashboardMetricsUpdated('application.withdrawn', { jobId: resolvedJobId });
}

export function emitApplicationRejected(applicationDoc: unknown, jobDoc?: unknown): void {
  const application = jobPayload(applicationDoc as never) as Record<string, unknown>;
  const job = jobPayload(jobDoc as never) as Record<string, unknown> | null;
  const techId = idOf(application.technicianId);
  const customerId = job ? idOf(job.customerId) : undefined;
  const jobId = idOf(application.jobId) ?? (job ? idOf(job._id) : undefined);
  const rooms = [ROOMS.admin()];
  if (techId) rooms.push(ROOMS.user(techId));
  if (customerId) rooms.push(ROOMS.user(customerId));
  if (jobId) rooms.push(ROOMS.job(jobId));
  emitSafe(rooms, SOCKET_EVENTS.APPLICATION_REJECTED, { application, job });
}

export function emitTechnicianAssigned(
  jobDoc: unknown,
  applicationDoc: unknown,
  assignmentDoc?: unknown,
): void {
  const job = jobPayload(jobDoc as never) as Record<string, unknown>;
  const application = jobPayload(applicationDoc as never);
  const assignment = jobPayload(assignmentDoc as never);
  const rooms = [...jobRooms(job), ROOMS.role('technician'), ROOMS.admin()];
  const payload = { job, application, assignment, at: new Date().toISOString() };

  emitSafe(rooms, SOCKET_EVENTS.TECHNICIAN_ASSIGNED, payload);
  emitSafe(rooms, SOCKET_EVENTS.JOB_ASSIGNED, payload);
  emitSafe(rooms, SOCKET_EVENTS.APPLICATION_ACCEPTED, payload);
  emitSafe(rooms, SOCKET_EVENTS.JOB_STATUS_CHANGED, {
    job,
    from: 'posted',
    to: 'assigned',
    at: new Date().toISOString(),
  });
  emitDashboardMetricsUpdated('technician.assigned', { jobId: idOf(job._id) });
}

export function emitAvailabilityChanged(
  technicianUserId: string,
  availability: unknown,
): void {
  emitSafe(
    [ROOMS.user(technicianUserId), ROOMS.admin()],
    SOCKET_EVENTS.AVAILABILITY_CHANGED,
    {
      technicianUserId,
      availability: jobPayload(availability as never),
      at: new Date().toISOString(),
    },
  );
}

export function emitSubscriptionCatalogueUpdated(reason = 'config'): void {
  emitSafe(
    [ROOMS.role('technician'), ROOMS.admin()],
    SOCKET_EVENTS.SUBSCRIPTION_CATALOGUE_UPDATED,
    { reason, at: new Date().toISOString() },
  );
}

export function emitFreeJobLimitUpdated(
  technicianUserId: string,
  profileDoc?: unknown,
): void {
  const profile = jobPayload(profileDoc as never) as Record<string, unknown> | null;
  emitSafe(
    [ROOMS.user(technicianUserId), ROOMS.admin()],
    SOCKET_EVENTS.FREE_JOB_LIMIT_UPDATED,
    {
      technicianUserId,
      freeJobs: profile
        ? {
            used: profile.freeJobsUsed,
            limit: profile.freeJobLimit,
            remaining: profile.remainingFreeJobs,
            locked: profile.accountLocked,
          }
        : undefined,
      profile,
      at: new Date().toISOString(),
    },
  );
  emitDashboardMetricsUpdated('technician.free_jobs', { technicianUserId });
}

export function emitTechnicianLocked(technicianUserId: string, profileDoc?: unknown): void {
  const profile = jobPayload(profileDoc as never);
  emitSafe(
    [ROOMS.user(technicianUserId), ROOMS.admin()],
    SOCKET_EVENTS.TECHNICIAN_LOCKED,
    { technicianUserId, profile, at: new Date().toISOString() },
  );
  emitDashboardMetricsUpdated('technician.locked', { technicianUserId });
}

export function emitTechnicianUnlocked(technicianUserId: string, profileDoc?: unknown): void {
  const profile = jobPayload(profileDoc as never);
  emitSafe(
    [ROOMS.user(technicianUserId), ROOMS.admin()],
    SOCKET_EVENTS.TECHNICIAN_UNLOCKED,
    { technicianUserId, profile, at: new Date().toISOString() },
  );
  emitDashboardMetricsUpdated('technician.unlocked', { technicianUserId });
}

export function emitTrustScoreUpdated(technicianUserId: string, scores?: Record<string, unknown>): void {
  emitSafe(
    [ROOMS.user(technicianUserId), ROOMS.admin()],
    SOCKET_EVENTS.TRUST_SCORE_UPDATED,
    { technicianUserId, scores, at: new Date().toISOString() },
  );
}

export function emitReviewSubmitted(payload: Record<string, unknown>): void {
  const revieweeId = String(payload.revieweeId ?? '');
  const reviewerId = String(payload.reviewerId ?? '');
  emitSafe(
    [ROOMS.user(revieweeId), ROOMS.user(reviewerId), ROOMS.admin()].filter(Boolean),
    SOCKET_EVENTS.REVIEW_SUBMITTED,
    { ...payload, at: new Date().toISOString() },
  );
}

export function emitReviewEdited(payload: Record<string, unknown>): void {
  const revieweeId = String(payload.revieweeId ?? '');
  emitSafe(
    [ROOMS.user(revieweeId), ROOMS.admin()].filter(Boolean),
    SOCKET_EVENTS.REVIEW_EDITED,
    { ...payload, at: new Date().toISOString() },
  );
}

export function emitReputationUpdated(
  userId: string,
  role: string,
  reputation: Record<string, unknown>,
): void {
  emitSafe(
    [ROOMS.user(userId), ROOMS.admin()],
    SOCKET_EVENTS.REPUTATION_UPDATED,
    { userId, role, reputation, at: new Date().toISOString() },
  );
}

export function emitBadgeEarned(userId: string, badge: Record<string, unknown>): void {
  emitSafe(
    [ROOMS.user(userId), ROOMS.admin()],
    SOCKET_EVENTS.BADGE_EARNED,
    { userId, badge, at: new Date().toISOString() },
  );
}

function paymentRooms(payload: Record<string, unknown>): string[] {
  const rooms = [ROOMS.admin()];
  for (const key of ['userId', 'customerId', 'technicianId'] as const) {
    const id = payload[key];
    if (typeof id === 'string' && id) rooms.push(ROOMS.user(id));
  }
  return rooms;
}

export function emitPaymentCreated(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.PAYMENT_CREATED, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitPaymentSuccessful(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.PAYMENT_SUCCESSFUL, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitPaymentFailed(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.PAYMENT_FAILED, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitEscrowFunded(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.ESCROW_FUNDED, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitEscrowReleased(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.ESCROW_RELEASED, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitRefundRequested(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.REFUND_REQUESTED, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitRefundApproved(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.REFUND_APPROVED, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitPayoutCompleted(payload: Record<string, unknown>): void {
  emitSafe(paymentRooms(payload), SOCKET_EVENTS.PAYOUT_COMPLETED, {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitContentUpdated(
  entity: unknown,
  action: string,
): void {
  emitSafe(
    [ROOMS.admin(), ROOMS.role('customer'), ROOMS.role('technician')],
    SOCKET_EVENTS.CONTENT_UPDATED,
    { entity, action, at: new Date().toISOString() },
  );
}

export function emitCategoryUpdated(
  entity: unknown,
  action: 'created' | 'updated' | 'deleted' | 'reordered',
): void {
  const category = jobPayload(entity as never);
  emitSafe(
    [ROOMS.role('customer'), ROOMS.role('technician'), ROOMS.admin()],
    SOCKET_EVENTS.CATEGORY_UPDATED,
    { category, action, at: new Date().toISOString() },
  );
}

function trackingRooms(session: {
  jobId?: string;
  customerId?: string;
  technicianId?: string;
}): string[] {
  const rooms = [ROOMS.admin()];
  if (session.jobId) rooms.push(ROOMS.job(String(session.jobId)));
  if (session.customerId) rooms.push(ROOMS.user(String(session.customerId)));
  if (session.technicianId) rooms.push(ROOMS.user(String(session.technicianId)));
  return rooms;
}

export function emitTrackingStarted(session: Record<string, unknown>): void {
  emitSafe(trackingRooms(session as never), SOCKET_EVENTS.TRACKING_STARTED, {
    session,
    at: new Date().toISOString(),
  });
}

export function emitTrackingUpdate(session: Record<string, unknown>): void {
  emitSafe(trackingRooms(session as never), SOCKET_EVENTS.TRACKING_UPDATE, {
    session,
    at: new Date().toISOString(),
  });
}

export function emitTrackingPaused(session: Record<string, unknown>): void {
  emitSafe(trackingRooms(session as never), SOCKET_EVENTS.TRACKING_PAUSED, {
    session,
    at: new Date().toISOString(),
  });
}

export function emitTrackingResumed(session: Record<string, unknown>): void {
  emitSafe(trackingRooms(session as never), SOCKET_EVENTS.TRACKING_RESUMED, {
    session,
    at: new Date().toISOString(),
  });
}

export function emitTrackingArrived(session: Record<string, unknown>): void {
  emitSafe(trackingRooms(session as never), SOCKET_EVENTS.TRACKING_ARRIVED, {
    session,
    at: new Date().toISOString(),
  });
}

export function emitTrackingStopped(session: Record<string, unknown>): void {
  emitSafe(trackingRooms(session as never), SOCKET_EVENTS.TRACKING_STOPPED, {
    session,
    at: new Date().toISOString(),
  });
  emitSafe(trackingRooms(session as never), SOCKET_EVENTS.TRACKING_COMPLETED, {
    session,
    at: new Date().toISOString(),
  });
}
