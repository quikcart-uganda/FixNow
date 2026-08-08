/** Canonical Socket.IO event names for FixNow realtime sync. */
export const SOCKET_EVENTS = {
  // Connection / presence
  CONNECTION_READY: 'connection:ready',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat:ack',

  // Auth / growth (admin-facing)
  USER_REGISTERED: 'user:registered',

  // Jobs
  JOB_CREATED: 'job:created',
  JOB_UPDATED: 'job:updated',
  JOB_PUBLISHED: 'job:published',
  JOB_CANCELLED: 'job:cancelled',
  JOB_ASSIGNED: 'job:assigned',
  JOB_STATUS_CHANGED: 'job:status_changed',
  JOB_COMPLETED: 'job:completed',

  // Applications
  APPLICATION_SUBMITTED: 'application:submitted',
  APPLICATION_WITHDRAWN: 'application:withdrawn',
  APPLICATION_ACCEPTED: 'application:accepted',
  APPLICATION_REJECTED: 'application:rejected',

  // Technicians
  TECHNICIAN_ASSIGNED: 'technician:assigned',
  AVAILABILITY_CHANGED: 'technician:availability_changed',
  FREE_JOB_LIMIT_UPDATED: 'technician:free_job_limit_updated',
  TECHNICIAN_LOCKED: 'technician:locked',
  TECHNICIAN_UNLOCKED: 'technician:unlocked',
  TRUST_SCORE_UPDATED: 'trust:updated',

  // Reviews / reputation
  REVIEW_SUBMITTED: 'review:submitted',
  REVIEW_EDITED: 'review:edited',
  REPUTATION_UPDATED: 'reputation:updated',
  BADGE_EARNED: 'badge:earned',

  // Payments / escrow
  PAYMENT_CREATED: 'payment:created',
  PAYMENT_SUCCESSFUL: 'payment:successful',
  PAYMENT_FAILED: 'payment:failed',
  ESCROW_FUNDED: 'escrow:funded',
  ESCROW_RELEASED: 'escrow:released',
  REFUND_REQUESTED: 'refund:requested',
  REFUND_APPROVED: 'refund:approved',
  PAYOUT_COMPLETED: 'payout:completed',

  // Admin / marketplace
  DASHBOARD_METRICS_UPDATED: 'dashboard:metrics_updated',
  MARKETPLACE_STATS_UPDATED: 'marketplace:stats_updated',
  CATEGORY_UPDATED: 'category:updated',
  CONTENT_UPDATED: 'content:updated',
  SUBSCRIPTION_CATALOGUE_UPDATED: 'subscription:catalogue_updated',

  // Live tracking
  TRACKING_STARTED: 'tracking:started',
  TRACKING_UPDATE: 'tracking:update',
  TRACKING_PAUSED: 'tracking:paused',
  TRACKING_RESUMED: 'tracking:resumed',
  TRACKING_ARRIVED: 'tracking:arrived',
  TRACKING_COMPLETED: 'tracking:completed',
  TRACKING_STOPPED: 'tracking:stopped',

  // Messaging
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELIVERED: 'message:delivered',
  TYPING_STARTED: 'typing:started',
  TYPING_STOPPED: 'typing:stopped',
  CONVERSATION_UPDATED: 'conversation:updated',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export const ROOMS = {
  user: (userId: string) => `user:${userId}`,
  role: (role: string) => `role:${role}`,
  job: (jobId: string) => `job:${jobId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  admin: () => 'role:admin',
} as const;
