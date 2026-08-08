import { ERROR_CODES, type ErrorCode } from '../constants/errorCodes.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCode = ERROR_CODES.INTERNAL_ERROR,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(message, 400, ERROR_CODES.BAD_REQUEST, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(message, 401, ERROR_CODES.UNAUTHORIZED);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(message, 403, ERROR_CODES.FORBIDDEN);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, ERROR_CODES.NOT_FOUND);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(message, 409, ERROR_CODES.CONFLICT, details);
  }

  static validation(message: string, details?: unknown) {
    return new AppError(message, 422, ERROR_CODES.VALIDATION_ERROR, details);
  }

  static notImplemented(feature: string) {
    return new AppError(
      `${feature} is not implemented yet`,
      501,
      ERROR_CODES.NOT_IMPLEMENTED,
    );
  }

  static accountLocked(message = 'Account is locked. Try again later or contact support.') {
    return new AppError(message, 403, ERROR_CODES.ACCOUNT_LOCKED);
  }

  static accountSuspended(message = 'Account is suspended.') {
    return new AppError(message, 403, ERROR_CODES.ACCOUNT_SUSPENDED);
  }

  static invalidOtp(message = 'Invalid or expired verification code') {
    return new AppError(message, 400, ERROR_CODES.INVALID_OTP);
  }

  static timeout(message = 'Request timed out') {
    return new AppError(message, 408, ERROR_CODES.TIMEOUT);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new AppError(message, 503, ERROR_CODES.SERVICE_UNAVAILABLE);
  }

  static dependencyFailed(message = 'Upstream dependency failed') {
    return new AppError(message, 502, ERROR_CODES.DEPENDENCY_FAILED);
  }

  static circuitOpen(message = 'Service temporarily unavailable') {
    return new AppError(message, 503, ERROR_CODES.CIRCUIT_OPEN);
  }
}
