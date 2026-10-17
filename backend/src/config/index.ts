import dotenv from 'dotenv';
import { isAddress } from 'viem';
import { z } from 'zod';
import { ARC_NETWORKS } from '../chain/arc.js';

dotenv.config();

const csv = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex string');
const optionalAddress = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isAddress(v, { strict: false }), 'must be a valid EVM address');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  TRUST_PROXY: z.string().default('false'),

  // Auth & rate limiting. Keys are compared against these env values; there is no default key.
  API_KEYS: z.string().default(''),
  PRO_API_KEYS: z.string().default(''),
  RATE_LIMIT_FREE_PER_MIN: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_PRO_PER_MIN: z.coerce.number().int().positive().default(1000),
  // /intent/evaluate fans out to paid model APIs, so it has its own, much lower hourly limit.
  INTENT_RATE_LIMIT_FREE_PER_HOUR: z.coerce.number().int().positive().default(10),
  INTENT_RATE_LIMIT_PRO_PER_HOUR: z.coerce.number().int().positive().default(100),

  // Chain
  // Arc network. RPC URL, chain ID and explorer default to the selected network; override them for a local node.
  ARC_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  ARC_RPC_URL: z.string().url().optional(),
  ARC_CHAIN_ID: z.coerce.number().int().positive().optional(),
  ARC_EXPLORER_URL: z.string().url().optional(),
  CREDENTIAL_REGISTRY_ADDRESS: optionalAddress,
  // Phase 3: mandates and the decision log. Deployed addresses; unset = the /mandates and /decisions routes answer 503.
  MANDATE_REGISTRY_ADDRESS: optionalAddress,
  DECISION_LOG_ADDRESS: optionalAddress,
  // Pays gas for issueCredentialWithSig. Falls back to the issuer key when unset.
  BACKEND_WALLET_PRIVATE_KEY: z.string().optional(),
  // Comma-separated private keys the API may sign credentials with (one per managed issuer).
  ISSUER_PRIVATE_KEYS: z.string().default(''),
  // TESTNET DEMO ONLY: comma-separated private keys of business owners the API may act for (create/revoke mandates).
  // Real owners will sign in their own Circle wallet. Never commit these; they come from the runtime environment.
  BUSINESS_OWNER_PRIVATE_KEYS: z.string().default(''),
  TX_CONFIRM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  // Storage for off-chain credential metadata (the contract only stores a hash)
  DATA_DIR: z.string().default('./data'),

  // AI models (OpenAI-compatible chat completions). A model without a key is reported as not_configured.
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MODEL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  MODEL_RETRY_BASE_MS: z.coerce.number().int().min(0).default(1000),
  KIMI_API_KEY: z.string().default(''),
  // Provider model IDs are never hard-coded: take them from the provider's current docs/console.
  // An empty value counts as "unset" and the model is then reported as not_configured.
  KIMI_BASE_URL: z.string().default('https://api.moonshot.ai/v1').transform((v) => v.trim() || 'https://api.moonshot.ai/v1'),
  KIMI_MODEL: z.string().default(''),
  QWEN_API_KEY: z.string().default(''),
  // Alibaba base URLs differ by region/account, so there is no default (see .env.example).
  QWEN_BASE_URL: z.string().default(''),
  QWEN_MODEL: z.string().default(''),
  JEV_API_KEY: z.string().default(''),
  JEV_BASE_URL: z.string().default(''),
  JEV_MODEL: z.string().default(''),

  ALLOW_NO_AUTH_FOR_TESTS: bool,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Invalid environment configuration');
}
const env = parsed.data;

const issuerKeys = csv(env.ISSUER_PRIVATE_KEYS);
for (const k of issuerKeys) {
  const r = privateKey.safeParse(k);
  if (!r.success) throw new Error('ISSUER_PRIVATE_KEYS contains an invalid private key (value not shown)');
}
if (env.BACKEND_WALLET_PRIVATE_KEY && !privateKey.safeParse(env.BACKEND_WALLET_PRIVATE_KEY).success) {
  throw new Error('BACKEND_WALLET_PRIVATE_KEY is not a valid private key (value not shown)');
}

const ownerKeys = csv(env.BUSINESS_OWNER_PRIVATE_KEYS);
for (const k of ownerKeys) {
  const r = privateKey.safeParse(k);
  if (!r.success) throw new Error('BUSINESS_OWNER_PRIVATE_KEYS contains an invalid private key (value not shown)');
}

const MIN_KEY_LENGTH = 24;
const apiKeys = csv(env.API_KEYS);
const proKeys = csv(env.PRO_API_KEYS);
for (const k of [...apiKeys, ...proKeys]) {
  if (k.length < MIN_KEY_LENGTH) {
    throw new Error(`API keys must be at least ${MIN_KEY_LENGTH} characters long`);
  }
}
// Fail closed: the API never starts without credentials configured.
if (apiKeys.length + proKeys.length === 0 && !env.ALLOW_NO_AUTH_FOR_TESTS) {
  throw new Error('API_KEYS is not set. Generate one with: openssl rand -hex 32');
}

const trustProxy: boolean | number | string =
  env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY === 'false' ? false : /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY;

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  corsOrigin: env.CORS_ORIGIN,
  trustProxy,
  auth: {
    freeKeys: apiKeys,
    proKeys,
    limits: { free: env.RATE_LIMIT_FREE_PER_MIN, pro: env.RATE_LIMIT_PRO_PER_MIN },
    windowMs: 60_000,
    intentLimits: { free: env.INTENT_RATE_LIMIT_FREE_PER_HOUR, pro: env.INTENT_RATE_LIMIT_PRO_PER_HOUR },
    intentWindowMs: 3_600_000,
  },
  chain: {
    network: env.ARC_NETWORK,
    networkName: ARC_NETWORKS[env.ARC_NETWORK].name,
    rpcUrl: env.ARC_RPC_URL ?? ARC_NETWORKS[env.ARC_NETWORK].rpcUrl,
    chainId: env.ARC_CHAIN_ID ?? ARC_NETWORKS[env.ARC_NETWORK].chainId,
    explorerUrl: env.ARC_EXPLORER_URL ?? ARC_NETWORKS[env.ARC_NETWORK].explorerUrl,
    credentialRegistry: env.CREDENTIAL_REGISTRY_ADDRESS as `0x${string}` | undefined,
    mandateRegistry: env.MANDATE_REGISTRY_ADDRESS as `0x${string}` | undefined,
    decisionLog: env.DECISION_LOG_ADDRESS as `0x${string}` | undefined,
    relayerKey: env.BACKEND_WALLET_PRIVATE_KEY as `0x${string}` | undefined,
    issuerKeys: issuerKeys as `0x${string}`[],
    ownerKeys: ownerKeys as `0x${string}`[],
    txConfirmTimeoutMs: env.TX_CONFIRM_TIMEOUT_MS,
  },
  dataDir: env.DATA_DIR,
  models: {
    timeoutMs: env.MODEL_TIMEOUT_MS,
    maxRetries: env.MODEL_MAX_RETRIES,
    retryBaseMs: env.MODEL_RETRY_BASE_MS,
    kimi: { apiKey: env.KIMI_API_KEY, baseUrl: env.KIMI_BASE_URL, model: env.KIMI_MODEL },
    qwen: { apiKey: env.QWEN_API_KEY, baseUrl: env.QWEN_BASE_URL, model: env.QWEN_MODEL },
    jev: { apiKey: env.JEV_API_KEY, baseUrl: env.JEV_BASE_URL, model: env.JEV_MODEL },
  },
} as const;

export type Config = typeof config;
