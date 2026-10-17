import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, defineChain, http, type Address } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { config } from '../config/index.js';
import { USDC_NATIVE_DECIMALS } from './arc.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const chain = defineChain({
  id: config.chain.chainId,
  name: config.chain.networkName,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: USDC_NATIVE_DECIMALS },
  rpcUrls: { default: { http: [config.chain.rpcUrl] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: config.chain.explorerUrl } },
});

const transport = http(config.chain.rpcUrl, { timeout: 10_000, retryCount: 2 });

// Poll once a second for receipts.
export const publicClient = createPublicClient({ chain, transport, pollingInterval: 1_000 });

const issuerAccounts = new Map<string, PrivateKeyAccount>();
for (const key of config.chain.issuerKeys) {
  const account = privateKeyToAccount(key);
  issuerAccounts.set(account.address.toLowerCase(), account);
}
const relayerAccount = config.chain.relayerKey ? privateKeyToAccount(config.chain.relayerKey) : undefined;

export const getIssuerAccount = (issuer: Address): PrivateKeyAccount | undefined => issuerAccounts.get(issuer.toLowerCase());
export const getRelayerAccount = (): PrivateKeyAccount | undefined => relayerAccount;
export const managedIssuers = (): Address[] => [...issuerAccounts.values()].map((a) => a.address);

export const getWalletClient = (account: PrivateKeyAccount) => createWalletClient({ account, chain, transport });

export const requireRegistry = (): Address => {
  if (!config.chain.credentialRegistry) {
    throw new AppError('CredentialRegistry address is not configured', 503, 'NOT_CONFIGURED');
  }
  return config.chain.credentialRegistry;
};

/** Name of the custom error a contract call reverted with, if any. */
export function revertName(err: unknown): string | undefined {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.reason;
  }
  return undefined;
}

/** Convert an unknown chain/RPC failure into a client-safe AppError (details stay in the logs). */
export function toUpstreamError(err: unknown, what: string): AppError {
  if (err instanceof AppError) return err;
  const msg = err instanceof BaseError ? err.shortMessage : err instanceof Error ? err.message : String(err);
  logger.error(`Chain call failed (${what}): ${msg}`);
  return new AppError(`Blockchain RPC error while ${what}`, 502, 'UPSTREAM_CHAIN_ERROR');
}
