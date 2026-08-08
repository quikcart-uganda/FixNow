import { AppError } from '../utils/AppError.js';

/** Marker for unfinished domain logic — architecture is ready, implementation deferred. */
export function notImplemented(feature: string): never {
  throw AppError.notImplemented(feature);
}
