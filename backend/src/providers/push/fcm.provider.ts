import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { pushCircuit } from '../../utils/circuitBreaker.js';

export type PushSendResult =
  | { ok: true; messageId: string; provider: 'fcm' | 'console' }
  | {
      ok: false;
      provider: 'fcm' | 'console';
      errorCode: string;
      errorMessage: string;
      invalidToken?: boolean;
      transient?: boolean;
    };

export type PushPayload = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: boolean;
};

type FirebaseAdmin = typeof import('firebase-admin');

let firebaseAppInitialized = false;
let messaging: import('firebase-admin').messaging.Messaging | null = null;

function resolveCredentials():
  | { projectId: string; clientEmail: string; privateKey: string }
  | null {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch (err) {
      logger.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON', err);
    }
  }
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  return null;
}

async function getMessaging(): Promise<import('firebase-admin').messaging.Messaging | null> {
  if (env.PUSH_PROVIDER !== 'fcm' || !env.FCM_ENABLED) return null;
  if (messaging) return messaging;

  const creds = resolveCredentials();
  if (!creds) {
    logger.warn('FCM enabled but Firebase credentials missing — falling back to console provider');
    return null;
  }

  try {
    const admin = (await import('firebase-admin')) as FirebaseAdmin;
    if (!firebaseAppInitialized) {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: creds.projectId,
            clientEmail: creds.clientEmail,
            privateKey: creds.privateKey,
          }),
        });
      }
      firebaseAppInitialized = true;
    }
    messaging = admin.messaging();
    return messaging;
  } catch (err) {
    logger.error('Failed to initialize firebase-admin', err);
    return null;
  }
}

function classifyFcmError(err: unknown): {
  errorCode: string;
  errorMessage: string;
  invalidToken: boolean;
  transient: boolean;
} {
  const anyErr = err as { code?: string; errorInfo?: { code?: string }; message?: string };
  const code = String(anyErr?.errorInfo?.code || anyErr?.code || 'unknown');
  const message = String(anyErr?.message || 'FCM send failed');
  const invalidToken =
    code.includes('registration-token-not-registered') ||
    code.includes('invalid-registration-token') ||
    code.includes('invalid-argument') ||
    /not.?registered|invalid.?token/i.test(message);
  const transient =
    code.includes('unavailable') ||
    code.includes('internal') ||
    code.includes('resource-exhausted') ||
    /timeout|ECONNRESET|ETIMEDOUT/i.test(message);
  return { errorCode: code, errorMessage: message.slice(0, 500), invalidToken, transient };
}

export async function sendPush(payload: PushPayload): Promise<PushSendResult> {
  if (!pushCircuit.allow()) {
    return {
      ok: false,
      provider: env.PUSH_PROVIDER === 'fcm' ? 'fcm' : 'console',
      errorCode: 'CIRCUIT_OPEN',
      errorMessage: 'Push circuit open — delivery deferred',
      transient: true,
    };
  }

  const fcm = await getMessaging();
  if (!fcm) {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info('[push:console]', {
      token: `${payload.token.slice(0, 12)}…`,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      badge: payload.badge,
      messageId,
    });
    pushCircuit.recordSuccess();
    return { ok: true, messageId, provider: 'console' };
  }

  try {
    const messageId = await fcm.send({
      token: payload.token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: {
          sound: payload.sound === false ? undefined : 'default',
          channelId: 'fixnow_default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: payload.sound === false ? undefined : 'default',
            badge: payload.badge,
          },
        },
      },
      webpush: {
        notification: {
          title: payload.title,
          body: payload.body,
          // badge icon path is client-relative; count sent in data
        },
        data: payload.data,
      },
    });
    pushCircuit.recordSuccess();
    return { ok: true, messageId, provider: 'fcm' };
  } catch (err) {
    const classified = classifyFcmError(err);
    if (classified.transient) pushCircuit.recordFailure();
    else pushCircuit.recordSuccess(); // permanent token errors should not open the circuit
    return {
      ok: false,
      provider: 'fcm',
      errorCode: classified.errorCode,
      errorMessage: classified.errorMessage,
      invalidToken: classified.invalidToken,
      transient: classified.transient,
    };
  }
}
