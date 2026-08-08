import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/** Ensure all domain schemas are registered with Mongoose before queries run. */
import '../models/index.js';

function describeMongoTarget(uri: string): string {
  try {
    const parsed = new URL(uri);
    const dbPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/(dbName option)';
    return `${parsed.protocol}//${parsed.host}${dbPath}`;
  } catch {
    return '(unparseable MONGODB_URI)';
  }
}

function formatMongoConnectFailure(error: unknown, uri: string): string {
  const target = describeMongoTarget(uri);
  const err = error as { name?: string; message?: string; cause?: { code?: string } };
  const code = err.cause?.code || (typeof err.message === 'string' && err.message.includes('ECONNREFUSED')
    ? 'ECONNREFUSED'
    : undefined);
  const lines = [
    `MongoDB connection failed while contacting ${target}.`,
    err.message ? `Detail: ${err.name ? `${err.name}: ` : ''}${err.message}` : null,
  ].filter(Boolean) as string[];

  if (code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(err.message || '')) {
    lines.push(
      'Diagnostics:',
      '  1. Confirm local MongoDB is installed and the Windows service "MongoDB" is Running.',
      '  2. Confirm something is listening on the URI host/port (default 127.0.0.1:27017).',
      '  3. Confirm backend/.env MONGODB_URI matches that listener (development uses local MongoDB).',
      '  4. Start service: Start-Service MongoDB   (or start mongod with your configured dbpath).',
    );
  } else if (!env.MONGODB_URI?.trim()) {
    lines.push('MONGODB_URI is missing. Set it in backend/.env (see backend/.env.development.example).');
  } else {
    lines.push(
      'Check MONGODB_URI in backend/.env, network access, and MongoDB authentication settings.',
    );
  }

  return lines.join('\n');
}

export async function connectDatabase(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);

  if (!env.MONGODB_URI?.trim()) {
    throw new Error(
      'MONGODB_URI is required but empty. Set it in backend/.env (see backend/.env.development.example).',
    );
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: 'FixNow',
      serverSelectionTimeoutMS: 10_000,
    });
  } catch (error) {
    const message = formatMongoConnectFailure(error, env.MONGODB_URI);
    logger.error(message);
    throw new Error(message, { cause: error });
  }

  mongoose.connection.on('error', (error) => {
    console.error('[mongodb] connection error', error);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[mongodb] disconnected');
  });

  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
