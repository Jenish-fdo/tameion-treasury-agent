import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { sendError } from './errorHandler.js';

/**
 * Hourly limit for POST /intent/evaluate, which fans out to three paid model APIs.
 * Free tier: 10/hour, premium (pro keys): 100/hour (INTENT_RATE_LIMIT_*_PER_HOUR). Per API key.
 * It stacks on top of the general per-minute limiter. Requests rejected by validation (400) cost
 * nothing downstream and are not counted. In-memory: use a shared store behind multiple instances.
 */
export const intentRateLimiter = rateLimit({
  windowMs: config.auth.intentWindowMs,
  limit: (req: Request) => config.auth.intentLimits[req.auth?.tier ?? 'free'],
  keyGenerator: (req: Request) => req.auth?.keyId ?? 'anonymous',
  skipFailedRequests: true,
  requestWasSuccessful: (_req: Request, res: Response) => res.statusCode !== 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    sendError(req, res, 429, 'INTENT_RATE_LIMITED', 'Hourly limit for payment-intent evaluation exceeded');
  },
});
