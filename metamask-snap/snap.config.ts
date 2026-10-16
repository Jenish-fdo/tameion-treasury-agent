import type { SnapConfig } from '@metamask/snaps-cli';

// These values are copied into the bundle at build time and are readable by anyone. No secrets here.
const config: SnapConfig = {
  input: 'src/index.ts',
  server: { port: 8080 },
  environment: {
    CREDENTIA_API_URL: process.env.CREDENTIA_API_URL ?? '',
    CREDENTIA_API_KEY: process.env.CREDENTIA_API_KEY ?? '',
    CREDENTIA_TIMEOUT_MS: process.env.CREDENTIA_TIMEOUT_MS ?? '',
    CREDENTIA_NETWORKS: process.env.CREDENTIA_NETWORKS ?? '',
    CREDENTIA_DEMO_MODE: process.env.CREDENTIA_DEMO_MODE ?? '',
  },
  polyfills: false,
};

export default config;
