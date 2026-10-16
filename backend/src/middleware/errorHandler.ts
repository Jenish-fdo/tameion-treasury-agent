import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode = 500, code?: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? defaultCode(statusCode);
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 429: return 'RATE_LIMITED';
    case 503: return 'SERVICE_UNAVAILABLE';
    default: return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}

export const sendError = (
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void => {
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) }, requestId: req.id });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    sendError(
      req, res, 400, 'VALIDATION_ERROR', 'Request validation failed',
      err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  // express.json() failures (malformed JSON, payload too large)
  const bodyErr = err as { type?: string; status?: number };
  if (bodyErr?.type === 'entity.parse.failed') {
    sendError(req, res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    return;
  }
  if (bodyErr?.type === 'entity.too.large') {
    sendError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error(`AppError ${err.code}: ${err.message}`, { requestId: req.id });
    sendError(req, res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // Never leak internals (RPC URLs, stack traces, upstream bodies) to clients.
  const e = err instanceof Error ? err : new Error(String(err));
  logger.error(`Unhandled error: ${e.message}`, { requestId: req.id, stack: e.stack });
  sendError(req, res, 500, 'INTERNAL_ERROR', 'Internal server error');
};
