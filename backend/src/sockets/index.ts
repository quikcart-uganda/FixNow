import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { isAllowedRequestOrigin } from '../config/cors.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ROLES } from '../constants/roles.js';
import { Conversation, Job, User } from '../models/index.js';
import { ACCOUNT_STATUS } from '../models/shared/enums.js';
import {
  recordSocketAuthFailure,
  recordSocketConnect,
  recordSocketDisconnect,
} from '../observability/metrics.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { ROOMS, SOCKET_EVENTS } from './events.js';
import { emitTyping } from './messaging.js';
import { emitUserOffline, emitUserOnline, setSocketServer } from './realtime.js';

export { SOCKET_EVENTS, ROOMS } from './events.js';
export * from './realtime.js';

/** Active socket counts per user — offline only when the last connection drops. */
const onlineCounts = new Map<string, number>();

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        callback(null, isAllowedRequestOrigin(origin));
      },
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    // Engine.IO heartbeats
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  setSocketServer(io);

  io.use((socket, next) => {
    void (async () => {
      try {
        const token =
          (socket.handshake.auth?.token as string | undefined) ||
          (socket.handshake.headers.authorization?.startsWith('Bearer ')
            ? socket.handshake.headers.authorization.slice(7)
            : undefined);

        if (!token) {
          recordSocketAuthFailure();
          next(new Error('Unauthorized'));
          return;
        }

        const payload = verifyAccessToken(token);
        const user = await User.findById(payload.sub);
        if (!user || user.isDeleted || user.accountStatus === ACCOUNT_STATUS.DELETED) {
          recordSocketAuthFailure();
          next(new Error('Unauthorized'));
          return;
        }
        if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
          recordSocketAuthFailure();
          next(new Error('Account suspended'));
          return;
        }
        // Locked technicians may still receive realtime lock/job updates (view-only UX).
        if (payload.rv !== user.refreshTokenVersion) {
          recordSocketAuthFailure();
          next(new Error('Session invalidated'));
          return;
        }

        socket.data.userId = user._id.toString();
        socket.data.role = user.role;
        next();
      } catch {
        recordSocketAuthFailure();
        next(new Error('Unauthorized'));
      }
    })();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const role = socket.data.role as string;
    recordSocketConnect();

    socket.join(ROOMS.user(userId));
    socket.join(ROOMS.role(role));
    if (role === ROLES.ADMIN) {
      socket.join(ROOMS.admin());
    }

    const prev = onlineCounts.get(userId) ?? 0;
    onlineCounts.set(userId, prev + 1);
    if (prev === 0) {
      emitUserOnline(userId, role);
    }

    socket.emit(SOCKET_EVENTS.CONNECTION_READY, {
      userId,
      role,
      rooms: [ROOMS.user(userId), ROOMS.role(role)],
      at: new Date().toISOString(),
      serverTime: Date.now(),
    });

    logger.debug('socket connected', { userId, role, sid: socket.id });

    socket.on(SOCKET_EVENTS.HEARTBEAT, (clientTs?: unknown) => {
      socket.emit(SOCKET_EVENTS.HEARTBEAT_ACK, {
        serverTime: Date.now(),
        clientTime: typeof clientTs === 'number' ? clientTs : undefined,
      });
    });

    socket.on('job:join', (jobId: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
      void (async () => {
        try {
          if (typeof jobId !== 'string' || !jobId) {
            ack?.({ ok: false, error: 'Invalid job id' });
            return;
          }
          const job = await Job.findById(jobId).select('customerId assignedTechnicianId');
          if (!job) {
            ack?.({ ok: false, error: 'Job not found' });
            return;
          }
          const isOwner = job.customerId.toString() === userId;
          const isAssignee = job.assignedTechnicianId?.toString() === userId;
          const isAdmin = role === ROLES.ADMIN;
          if (!isOwner && !isAssignee && !isAdmin) {
            ack?.({ ok: false, error: 'Forbidden' });
            return;
          }
          await socket.join(ROOMS.job(jobId));
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: 'Failed to join job room' });
        }
      })();
    });

    socket.on('job:leave', (jobId: unknown) => {
      if (typeof jobId === 'string' && jobId) {
        void socket.leave(ROOMS.job(jobId));
      }
    });

    socket.on(
      'conversation:join',
      (conversationId: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
        void (async () => {
          try {
            if (typeof conversationId !== 'string' || !conversationId) {
              ack?.({ ok: false, error: 'Invalid conversation id' });
              return;
            }
            const conversation = await Conversation.findById(conversationId).select('participantUserIds');
            if (!conversation) {
              ack?.({ ok: false, error: 'Conversation not found' });
              return;
            }
            const isMember = conversation.participantUserIds.some((id) => id.toString() === userId);
            const isAdmin = role === ROLES.ADMIN;
            if (!isMember && !isAdmin) {
              ack?.({ ok: false, error: 'Forbidden' });
              return;
            }
            await socket.join(ROOMS.conversation(conversationId));
            ack?.({ ok: true });
          } catch {
            ack?.({ ok: false, error: 'Failed to join conversation' });
          }
        })();
      },
    );

    socket.on('conversation:leave', (conversationId: unknown) => {
      if (typeof conversationId === 'string' && conversationId) {
        void socket.leave(ROOMS.conversation(conversationId));
      }
    });

    socket.on('typing:start', (payload: unknown) => {
      void (async () => {
        if (!payload || typeof payload !== 'object') return;
        const conversationId = (payload as { conversationId?: string }).conversationId;
        if (!conversationId) return;
        const conversation = await Conversation.findById(conversationId).select('participantUserIds');
        if (!conversation) return;
        const isMember = conversation.participantUserIds.some((id) => id.toString() === userId);
        if (!isMember && role !== ROLES.ADMIN) return;
        emitTyping(
          conversationId,
          userId,
          true,
          conversation.participantUserIds.map((id) => id.toString()),
        );
      })();
    });

    socket.on('typing:stop', (payload: unknown) => {
      void (async () => {
        if (!payload || typeof payload !== 'object') return;
        const conversationId = (payload as { conversationId?: string }).conversationId;
        if (!conversationId) return;
        const conversation = await Conversation.findById(conversationId).select('participantUserIds');
        if (!conversation) return;
        const isMember = conversation.participantUserIds.some((id) => id.toString() === userId);
        if (!isMember && role !== ROLES.ADMIN) return;
        emitTyping(
          conversationId,
          userId,
          false,
          conversation.participantUserIds.map((id) => id.toString()),
        );
      })();
    });

    socket.on('disconnect', (reason) => {
      recordSocketDisconnect();
      const count = (onlineCounts.get(userId) ?? 1) - 1;
      if (count <= 0) {
        onlineCounts.delete(userId);
        emitUserOffline(userId, role);
      } else {
        onlineCounts.set(userId, count);
      }
      logger.debug('socket disconnected', { userId, sid: socket.id, reason });
    });
  });

  return io;
}
