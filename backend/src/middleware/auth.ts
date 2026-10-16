import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendError } from './errorHandler.js';

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();

interface KeyEntry { digest: Buffer; keyId: string; tier: 'free' | 'pro' }

const entries: KeyEntry[] = [
  ...config.auth.freeKeys.map((k): KeyEntry => ({ digest: sha256(k), keyId: sha256(k).toString('hex').slice(0, 12), tier: 'free' })),
  ...config.auth.proKeys.map((k): KeyEntry => ({ digest: sha256(k), keyId: sha256(k).toString('hex').slice(0, 12), tier: 'pro' })),
];

function extractKey(req: Request): string | undefined {
  const header = req.header('x-api-key');
  if (header) return header.trim();
  const authz = req.header('authorization');
  if (authz && /^Bearer\s+/i.test(authz)) return authz.replace(/^Bearer\s+/i, '').trim();
  return undefined; // keys in query strings are intentionally not accepted (they end up in logs)
}

/** Constant-time check against every configured key, so response time does not reveal a prefix match. */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
  const presented = extractKey(req);
  if (presented) {
    const digest = sha256(presented);
    let match: KeyEntry | undefined;
    for (const e of entries) {
      if (timingSafeEqual(digest, e.digest) && !match) match = e;
    }
    if (match) {
      req.auth = { keyId: match.keyId, tier: match.tier };
      next();
      return;
    }
  } else if (config.auth.freeKeys.length + config.auth.proKeys.length === 0) {
    // Only reachable with ALLOW_NO_AUTH_FOR_TESTS; config refuses to start otherwise.
    req.auth = { keyId: 'anonymous', tier: 'free' };
    next();
    return;
  }

  logger.warn(`Rejected request: invalid or missing API key`, { requestId: req.id, ip: req.ip, path: req.originalUrl.split('?')[0] });
  res.setHeader('WWW-Authenticate', 'Bearer realm="credentia"');
  sendError(req, res, 401, 'UNAUTHORIZED', 'Invalid or missing API key');
};
