import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { captureException } from '../config/monitoring.js';
import { categorizeError, ERROR_CODES } from '../constants/errorCodes.js';
import { recordErrorCode } from '../observability/metrics.js';
import { maskSensitive, sanitizeErrorMessage } from '../security/mask.js';
import { AppError } from '../utils/AppError.js';
import type { ApiFailure } from '../utils/response.js';

function isMongoFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = String((err as { name?: string }).name || '')
  const message = String((err as { message?: string }).message || '')
  if (err instanceof mongoose.Error) return true
  if (name === 'MongoServerError' || name === 'MongoNetworkError' || name === 'MongoTimeoutError') {
    return true
  }
  return /ECONNREFUSED|MongoNetworkError|buffering timed out|topology was destroyed|server selection timed out/i.test(
    `${name} ${message}`,
  )
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const message = env.isProduction
    ? 'Resource not found'
    : `Cannot ${req.method} ${req.originalUrl}`;
  next(AppError.notFound(message));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let error: AppError;

  if (err instanceof AppError) {
    error = err;
  } else if (err instanceof ZodError) {
    error = AppError.validation('Request validation failed', maskSensitive(err.flatten()));
  } else if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      error = new AppError('File too large', 413, ERROR_CODES.PAYLOAD_TOO_LARGE);
    } else {
      const safe =
        err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Unexpected upload field' : 'Upload failed';
      error = new AppError(safe, 400, ERROR_CODES.UPLOAD_FAILED, env.isProduction ? undefined : { code: err.code });
    }
  } else if (err instanceof Error && err.name === 'CircuitOpenError') {
    error = new AppError('Service temporarily unavailable', 503, ERROR_CODES.CIRCUIT_OPEN);
  } else if (err instanceof Error && /CORS/i.test(err.message)) {
    error = AppError.forbidden(env.isProduction ? 'Origin not allowed' : err.message);
  } else if (isMongoFailure(err)) {
    error = new AppError(
      'Database temporarily unavailable',
      503,
      ERROR_CODES.DATABASE_UNAVAILABLE,
    );
  } else {
    error = new AppError(
      'Internal server error',
      500,
      ERROR_CODES.INTERNAL_ERROR,
    );
  }

  const category = categorizeError(error.code, error.statusCode);
  recordErrorCode(`${category}:${error.code}`);

  if (!error.isOperational || error.statusCode >= 500) {
    logger.error('Unhandled error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      code: error.code,
      status: error.statusCode,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    captureException(err, {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: error.statusCode,
    });
  }

  const publicMessage = sanitizeErrorMessage(error.message, env.isProduction);
  const details =
    error.statusCode >= 500
      ? undefined
      : error.details !== undefined
        ? maskSensitive(error.details)
        : undefined;

  const body: ApiFailure = {
    success: false,
    message: publicMessage,
    data: null,
    errors: details,
    error: {
      code: error.code,
      category,
      message: publicMessage,
      details,
      requestId: req.requestId,
    },
  };

  res.status(error.statusCode).json(body);
}
