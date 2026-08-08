import mongoose from 'mongoose';
import { logger } from '../config/logger.js';

/** Run work in a transaction when supported; otherwise run without one (standalone MongoDB). */
export async function withOptionalTransaction<T>(
  fn: (session: mongoose.ClientSession | null) => Promise<T>,
): Promise<T> {
  let session: mongoose.ClientSession | null = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session?.inTransaction()) {
      await session.abortTransaction();
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/Transaction numbers are only allowed|replica set|not supported/i.test(message)) {
      logger.warn('MongoDB transactions unavailable; retrying without session');
      return fn(null);
    }
    throw err;
  } finally {
    session?.endSession();
  }
}
