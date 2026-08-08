import type { Response } from 'express';

export interface ApiSuccess<T = unknown> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  message: string;
  data: null;
  errors?: unknown;
  error?: {
    code: string;
    category?: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message = 'Success',
  meta?: Record<string, unknown> | object,
): Response {
  const payload: ApiSuccess<T> = { success: true, message, data };
  if (meta) payload.meta = meta as Record<string, unknown>;
  return res.status(statusCode).json(payload);
}

export function sendCreated<T>(
  res: Response,
  data: T,
  message = 'Created',
  meta?: Record<string, unknown>,
): Response {
  return sendSuccess(res, data, 201, message, meta);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}
