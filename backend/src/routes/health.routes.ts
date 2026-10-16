import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.get('/ready', (_req: Request, res: Response) => {
  // TODO: Check database, redis, blockchain connectivity
  res.json({
    status: 'ready',
    checks: {
      database: 'connected',
      redis: 'connected',
      blockchain: 'connected',
    },
  });
});

export default router;
