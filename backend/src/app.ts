import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { apiKeyAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { apiRateLimiter, authFailureLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import healthRoutes from './routes/health.routes.js';
import intentRoutes from './routes/intent.js';
import treasuryRoutes from './routes/treasury.routes.js';
import v1Routes from './routes/v1.routes.js';

export const API_PREFIX = '/api/v1';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestLogger);
  app.use(helmet());
  // Auth is by API key header, not cookies, so credentialed CORS is not needed.
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), credentials: false }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (_req: Request, res: Response) => {
    res.json({ name: 'Credentia API', version: 'v1', status: 'running', openapi: 'docs/api.yaml' });
  });
  app.use(`${API_PREFIX}/health`, healthRoutes); // public

  // Everything below requires an API key and is rate limited per key.
  app.use(API_PREFIX, authFailureLimiter, apiKeyAuth, apiRateLimiter);
  app.use(`${API_PREFIX}/intent`, intentRoutes);
  app.use(API_PREFIX, treasuryRoutes);
  app.use(API_PREFIX, v1Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
