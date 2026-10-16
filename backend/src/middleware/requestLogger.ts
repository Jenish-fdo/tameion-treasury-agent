import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Assigns a request id and logs one structured line per request when it completes.
 * Deliberately does not log bodies, query strings or auth headers (they may carry
 * secrets / personal data).
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${durationMs.toFixed(1)}ms`, {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: req.ip,
      keyId: req.auth?.keyId,
      tier: req.auth?.tier,
      userAgent: req.header('user-agent'),
    });
  });

  next();
};
