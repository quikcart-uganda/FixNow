import { createHash } from 'node:crypto';
import { Job } from '../../models/marketplace/Job.js';
import { LiveTrackingSession, VisitVerification } from '../../models/safety/Safety.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { createDbNotification } from '../../utils/notify.js';
import {
  emitTrackingArrived,
  emitTrackingPaused,
  emitTrackingResumed,
  emitTrackingStarted,
  emitTrackingStopped,
  emitTrackingUpdate,
} from '../../sockets/realtime.js';
import {
  estimateEtaSeconds,
  geoFromLngLat,
  haversineMeters,
  lngLatFromGeo,
  straightPolyline,
} from './geo.util.js';
import { env } from '../../config/env.js';

const MAX_HISTORY = 120;
const MIN_MOVE_METERS = 8;
const MIN_PING_INTERVAL_MS = 4_000;
const NEARBY_METERS = 120;
const ARRIVED_METERS = 60;
const DEFAULT_RETENTION_DAYS = env.TRACKING_RETENTION_DAYS;

type Actor = { userId: string; role: string };

type PingInput = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  heading?: number;
  speedMps?: number;
  recordedAt?: string | Date;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function assertCoords(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw AppError.badRequest('Invalid coordinates');
  }
}

function destinationFromJob(job: {
  geo?: { coordinates?: number[] };
  location?: { geo?: { coordinates?: number[] }; parish?: string; district?: string; landmark?: string };
  title?: string;
}) {
  const fromTop = lngLatFromGeo(job.geo);
  const fromLoc = lngLatFromGeo(job.location?.geo);
  const point = fromTop || fromLoc;
  const label = [job.location?.landmark, job.location?.parish, job.location?.district, job.title]
    .filter(Boolean)
    .join(', ');
  return {
    geo: point ? geoFromLngLat(point.lng, point.lat) : undefined,
    label: label || 'Job location',
    point,
  };
}

function toDto(session: InstanceType<typeof LiveTrackingSession>, opts?: { includeHistory?: boolean }) {
  const tech = lngLatFromGeo(session.lastGeo);
  const dest = lngLatFromGeo(session.destinationGeo);
  return {
    id: session._id.toString(),
    jobId: session.jobId.toString(),
    technicianId: session.technicianId.toString(),
    customerId: session.customerId.toString(),
    status: session.status,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    resumedAt: session.resumedAt,
    arrivedAt: session.arrivedAt,
    endedAt: session.endedAt,
    lastPingAt: session.lastPingAt,
    technicianLocation: tech,
    destination: dest
      ? { ...dest, label: session.destinationLabel }
      : session.destinationLabel
        ? { lat: null, lng: null, label: session.destinationLabel }
        : null,
    heading: session.lastHeading,
    speedMps: session.lastSpeedMps,
    accuracyMeters: session.lastAccuracyMeters,
    etaSeconds: session.etaSeconds,
    distanceMeters: session.distanceMeters,
    routePolyline: session.routePolyline || [],
    updateCount: session.updateCount,
    endReason: session.endReason,
    history: opts?.includeHistory
      ? (session.history || []).map((h) => ({
          at: h.at,
          ...lngLatFromGeo(h.geo),
          heading: h.heading,
          speedMps: h.speedMps,
          accuracyMeters: h.accuracyMeters,
        }))
      : undefined,
  };
}

async function loadAuthorizedJob(jobId: string, actor: Actor) {
  const job = await Job.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  const isCustomer = job.customerId.toString() === actor.userId;
  const isTech = job.assignedTechnicianId?.toString() === actor.userId;
  const isAdmin = actor.role === 'admin';
  if (!isCustomer && !isTech && !isAdmin) throw AppError.forbidden('Not a participant on this job');
  return { job, isCustomer, isTech, isAdmin };
}

export const trackingService = {
  async startForJob(jobId: string, actor: Actor, meta: { ip?: string } = {}) {
    const { job, isTech, isAdmin } = await loadAuthorizedJob(jobId, actor);
    if (!isTech && !isAdmin) throw AppError.forbidden('Only the assigned technician can start tracking');
    if (!job.assignedTechnicianId) throw AppError.badRequest('Job has no assigned technician');

    const existing = await LiveTrackingSession.findOne({
      jobId,
      status: { $in: ['active', 'paused', 'arrived'] },
    });
    if (existing) return { session: toDto(existing), resumed: true };

    const dest = destinationFromJob(job);
    const session = await LiveTrackingSession.create({
      jobId: job._id,
      technicianId: job.assignedTechnicianId,
      customerId: job.customerId,
      status: 'active',
      startedAt: new Date(),
      destinationGeo: dest.geo,
      destinationLabel: dest.label,
      retentionDays: DEFAULT_RETENTION_DAYS,
      history: [],
      updateCount: 0,
      shareTokenHash: hashToken(`${jobId}:${job.assignedTechnicianId}:${Date.now()}`),
    });

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'tracking.started',
      resourceType: 'LiveTrackingSession',
      resourceId: session._id.toString(),
      ip: meta.ip,
      meta: { jobId },
    });

    const dto = toDto(session);
    emitTrackingStarted(dto);
    try {
      await createDbNotification({
        userId: job.customerId.toString(),
        type: 'tracking.started',
        title: 'Technician is on the way',
        body: `Live tracking started for "${job.title}".`,
        jobId: job._id.toString(),
      });
    } catch {
      /* non-fatal */
    }
    return { session: dto, resumed: false };
  },

  async pause(jobId: string, actor: Actor) {
    const { isTech, isAdmin } = await loadAuthorizedJob(jobId, actor);
    if (!isTech && !isAdmin) throw AppError.forbidden();
    const session = await LiveTrackingSession.findOne({ jobId, status: 'active' });
    if (!session) throw AppError.notFound('No active tracking session');
    session.status = 'paused';
    session.pausedAt = new Date();
    await session.save();
    const dto = toDto(session);
    emitTrackingPaused(dto);
    try {
      await createDbNotification({
        userId: session.customerId.toString(),
        type: 'tracking.paused',
        title: 'Tracking paused',
        body: 'Technician temporarily paused live location sharing.',
        jobId,
      });
    } catch {
      /* non-fatal */
    }
    return { session: dto };
  },

  async resume(jobId: string, actor: Actor) {
    const { isTech, isAdmin } = await loadAuthorizedJob(jobId, actor);
    if (!isTech && !isAdmin) throw AppError.forbidden();
    const session = await LiveTrackingSession.findOne({ jobId, status: 'paused' });
    if (!session) throw AppError.notFound('No paused tracking session');
    session.status = 'active';
    session.resumedAt = new Date();
    await session.save();
    const dto = toDto(session);
    emitTrackingResumed(dto);
    try {
      await createDbNotification({
        userId: session.customerId.toString(),
        type: 'tracking.resumed',
        title: 'Tracking resumed',
        body: 'Live technician location is available again.',
        jobId,
      });
    } catch {
      /* non-fatal */
    }
    return { session: dto };
  },

  async ping(jobId: string, actor: Actor, input: PingInput) {
    const { job, isTech, isAdmin } = await loadAuthorizedJob(jobId, actor);
    if (!isTech && !isAdmin) throw AppError.forbidden('Only the assigned technician can publish location');
    assertCoords(input.latitude, input.longitude);

    let session = await LiveTrackingSession.findOne({
      jobId,
      status: { $in: ['active', 'paused', 'arrived'] },
    });
    if (!session) {
      const started = await this.startForJob(jobId, actor);
      session = await LiveTrackingSession.findById(started.session.id);
      if (!session) throw AppError.notFound('Tracking session missing');
    }
    if (session.status === 'paused') {
      throw AppError.badRequest('Tracking is paused. Resume before sending updates.');
    }
    if (session.status === 'ended' || session.status === 'cancelled') {
      throw AppError.badRequest('Tracking session has ended');
    }

    const now = input.recordedAt ? new Date(input.recordedAt) : new Date();
    if (session.lastPingAt && now.getTime() - session.lastPingAt.getTime() < MIN_PING_INTERVAL_MS) {
      return { session: toDto(session), throttled: true };
    }

    const nextGeo = geoFromLngLat(input.longitude, input.latitude, input.accuracyMeters);
    const prev = lngLatFromGeo(session.lastGeo);
    if (prev) {
      const moved = haversineMeters(prev, { lat: input.latitude, lng: input.longitude });
      const stationary = moved < MIN_MOVE_METERS && (input.speedMps ?? 0) < 0.4;
      if (stationary && session.lastPingAt && now.getTime() - session.lastPingAt.getTime() < 20_000) {
        session.lastPingAt = now;
        session.lastAccuracyMeters = input.accuracyMeters;
        await session.save();
        return { session: toDto(session), throttled: true, reason: 'stationary' };
      }
    }

    session.lastGeo = nextGeo;
    session.lastPingAt = now;
    session.lastHeading = input.heading;
    session.lastSpeedMps = input.speedMps;
    session.lastAccuracyMeters = input.accuracyMeters;
    session.updateCount += 1;

    const dest = lngLatFromGeo(session.destinationGeo) || destinationFromJob(job).point;
    if (dest) {
      const distance = haversineMeters({ lat: input.latitude, lng: input.longitude }, dest);
      session.distanceMeters = Math.round(distance);
      session.etaSeconds = estimateEtaSeconds(distance, input.speedMps);
      session.routePolyline = straightPolyline({ lat: input.latitude, lng: input.longitude }, dest);
      if (!session.destinationGeo) session.destinationGeo = geoFromLngLat(dest.lng, dest.lat);
    }

    session.history = session.history || [];
    session.history.push({
      at: now,
      geo: nextGeo,
      heading: input.heading,
      speedMps: input.speedMps,
      accuracyMeters: input.accuracyMeters,
    });
    if (session.history.length > MAX_HISTORY) {
      session.history = session.history.slice(-MAX_HISTORY);
    }

    let nearby = false;
    let arrived = false;
    if (session.distanceMeters != null && session.distanceMeters <= NEARBY_METERS) nearby = true;
    if (session.distanceMeters != null && session.distanceMeters <= ARRIVED_METERS && session.status === 'active') {
      session.status = 'arrived';
      session.arrivedAt = now;
      arrived = true;
    }

    const shouldNotifyNearby =
      nearby &&
      !arrived &&
      !(session as { meta?: { nearbyNotifiedAt?: Date } }).meta?.nearbyNotifiedAt &&
      session.updateCount > 0 &&
      session.updateCount % 8 === 0;

    await session.save();
    const dto = toDto(session);
    emitTrackingUpdate(dto);

    if (shouldNotifyNearby) {
      try {
        await createDbNotification({
          userId: session.customerId.toString(),
          type: 'tracking.nearby',
          title: 'Technician nearby',
          body: `Your technician is about ${Math.round(session.distanceMeters || 0)} m away.`,
          jobId,
        });
      } catch {
        /* non-fatal */
      }
    }
    if (arrived) {
      emitTrackingArrived(dto);
      try {
        await createDbNotification({
          userId: session.customerId.toString(),
          type: 'tracking.arrived',
          title: 'Technician arrived',
          body: `Your technician has arrived for "${job.title}".`,
          jobId,
        });
        await VisitVerification.findOneAndUpdate(
          { jobId: job._id, technicianId: session.technicianId },
          {
            $setOnInsert: {
              customerId: session.customerId,
              status: 'pending',
              photoUrls: [],
              customerConfirmed: false,
            },
            $set: {
              checkInAt: now,
              checkInGeo: nextGeo,
            },
          },
          { upsert: true, new: true },
        );
      } catch {
        /* non-fatal */
      }
    }

    return { session: dto, throttled: false, nearby, arrived };
  },

  async markArrived(jobId: string, actor: Actor) {
    const { isTech, isAdmin } = await loadAuthorizedJob(jobId, actor);
    if (!isTech && !isAdmin) throw AppError.forbidden();
    const session = await LiveTrackingSession.findOne({
      jobId,
      status: { $in: ['active', 'paused', 'arrived'] },
    });
    if (!session) throw AppError.notFound('No tracking session');
    session.status = 'arrived';
    session.arrivedAt = session.arrivedAt || new Date();
    await session.save();
    const dto = toDto(session);
    emitTrackingArrived(dto);
    return { session: dto };
  },

  async stopForJob(jobId: string, actor: Actor | null, reason = 'stopped') {
    const session = await LiveTrackingSession.findOne({
      jobId,
      status: { $in: ['active', 'paused', 'arrived'] },
    });
    if (!session) return { session: null };
    session.status = reason === 'cancelled' ? 'cancelled' : 'ended';
    session.endedAt = new Date();
    session.endReason = reason;
    // Drop detailed history after end to honour privacy (keep last ping + summary).
    if (reason === 'completed' || reason === 'cancelled') {
      session.history = session.history.slice(-5);
      session.routePolyline = [];
    }
    await session.save();
    const dto = toDto(session);
    emitTrackingStopped(dto);
    if (actor) {
      await writeAuditLog({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'tracking.stopped',
        resourceType: 'LiveTrackingSession',
        resourceId: session._id.toString(),
        meta: { jobId, reason },
      });
    }
    return { session: dto };
  },

  async getForJob(jobId: string, actor: Actor, opts?: { history?: boolean }) {
    await loadAuthorizedJob(jobId, actor);
    const session = await LiveTrackingSession.findOne({ jobId }).sort({ createdAt: -1 });
    if (!session) return { session: null };
    const includeHistory = Boolean(opts?.history) && (actor.role === 'admin' || session.status !== 'ended');
    return { session: toDto(session, { includeHistory }) };
  },

  async listActive(reqQuery: Record<string, unknown> = {}) {
    const status = typeof reqQuery.status === 'string' ? reqQuery.status : 'active';
    const filter: Record<string, unknown> =
      status === 'all'
        ? {}
        : status === 'travelling'
          ? { status: { $in: ['active', 'paused', 'arrived'] } }
          : { status };
    const q = typeof reqQuery.q === 'string' ? reqQuery.q.trim() : '';
    const sessions = await LiveTrackingSession.find(filter).sort({ updatedAt: -1 }).limit(100);
    let items: Array<
      ReturnType<typeof toDto> & { publicJobReference?: string; jobTitle?: string }
    > = sessions.map((s) => toDto(s));

    // Attach public job references for admin UI (Mongo jobId remains canonical).
    const jobIds = [...new Set(items.map((s) => s.jobId).filter(Boolean))];
    if (jobIds.length) {
      const jobs = await Job.find({ _id: { $in: jobIds } })
        .select('publicJobReference title')
        .lean();
      const byId = new Map(
        jobs.map((j) => [
          String(j._id),
          {
            publicJobReference: j.publicJobReference ? String(j.publicJobReference) : undefined,
            jobTitle: j.title ? String(j.title) : undefined,
          },
        ]),
      );
      items = items.map((s) => {
        const meta = byId.get(s.jobId);
        return meta ? { ...s, ...meta } : s;
      });
    }

    if (q) {
      const needle = q.toLowerCase();
      items = items.filter(
        (s) =>
          s.jobId.includes(needle) ||
          s.technicianId.includes(needle) ||
          s.customerId.includes(needle) ||
          String(s.publicJobReference || '')
            .toLowerCase()
            .includes(needle) ||
          String(s.jobTitle || '')
            .toLowerCase()
            .includes(needle) ||
          String(s.destination?.label || '')
            .toLowerCase()
            .includes(needle),
      );
    }
    const active = items.filter((s) => ['active', 'paused', 'arrived'].includes(s.status));
    const etas = active.map((s) => s.etaSeconds).filter((n): n is number => typeof n === 'number');
    const avgEta = etas.length ? Math.round(etas.reduce((a, b) => a + b, 0) / etas.length) : null;
    return {
      items,
      analytics: {
        activeSessions: active.length,
        travelling: items.filter((s) => s.status === 'active').length,
        paused: items.filter((s) => s.status === 'paused').length,
        arrived: items.filter((s) => s.status === 'arrived').length,
        averageEtaSeconds: avgEta,
      },
    };
  },

  async purgeExpired() {
    const cutoff = new Date(Date.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await LiveTrackingSession.deleteMany({
      status: { $in: ['ended', 'cancelled'] },
      endedAt: { $lte: cutoff },
    });
    return { deleted: result.deletedCount || 0 };
  },
};
