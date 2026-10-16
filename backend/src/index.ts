import { createApp, API_PREFIX } from './app.js';
import { config } from './config/index.js';
import { managedIssuers } from './chain/clients.js';
import { logger } from './utils/logger.js';

const app = createApp();

if (!config.chain.credentialRegistry) logger.warn('CREDENTIAL_REGISTRY_ADDRESS is not set: credential endpoints will return 503');
if (!config.chain.trustScore) logger.warn('TRUST_SCORE_ADDRESS is not set: trust-score endpoints will return 503');
if (managedIssuers().length === 0) logger.warn('ISSUER_PRIVATE_KEYS is not set: POST /credential/mint will reject every issuer');

const server = app.listen(config.port, () => {
  logger.info(`Credentia backend listening on :${config.port} (${config.env}), API at ${API_PREFIX}`);
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received: closing HTTP server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
