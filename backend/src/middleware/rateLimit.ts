import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { sendError } from './errorHandler.js';

const onLimit = (req: Request, res: Response): void => {
  sendError(req, res, 429, 'RATE_LIMITED', 'Too many requests, slow down');
};

/**
 * Per-API-key limit: 100 req/min on the free tier (RATE_LIMIT_FREE_PER_MIN), higher on pro.
 * In-memory store: with more than one instance, swap in a shared store (e.g. Redis).
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.auth.windowMs,
  limit: (req) => config.auth.limits[req.auth?.tier ?? 'free'],
  keyGenerator: (req) => req.auth?.keyId ?? 'anonymous',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: onLimit,
});

/** Slows brute-forcing of API keys: counts only 401 responses per IP, before auth runs. */
export const authFailureLimiter = rateLimit({
  windowMs: config.auth.windowMs,
  limit: 30,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  standardHeaders: false,
  legacyHeaders: false,
  handler: onLimit,
});
