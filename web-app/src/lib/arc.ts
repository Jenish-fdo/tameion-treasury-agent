import { defineChain } from 'viem';

/**
 * Arc network settings (Circle's L1; USDC is the native gas token). Public settings only: never put a secret here.
 * Source: https://docs.arc.io/integrate/connect-to-arc and https://docs.arc.io/arc/references/contract-addresses
 * (checked 2026-10-17). NEXT_PUBLIC_ARC_NETWORK picks the defaults; RPC and explorer can be overridden.
 */
const NETWORKS = {
  testnet: { id: 5042002, name: 'Arc Testnet', rpcUrl: 'https://rpc.testnet.arc.io', explorerUrl: 'https://explorer.testnet.arc.io', testnet: true },
  mainnet: { id: 5042, name: 'Arc', rpcUrl: 'https://rpc.mainnet.arc.io', explorerUrl: 'https://explorer.arc.io', testnet: false },
} as const;

export type ArcNetwork = keyof typeof NETWORKS;
export const ARC_NETWORK: ArcNetwork = process.env.NEXT_PUBLIC_ARC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const net = NETWORKS[ARC_NETWORK];

export const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || net.rpcUrl;
export const ARC_EXPLORER_URL = (process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || net.explorerUrl).replace(/\/+$/, '');
export const ARC_NETWORK_NAME = net.name;
export const ARC_CHAIN_ID = net.id;

/** Same address on testnet and mainnet. */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
/**
 * USDC is the native gas token with 18 decimals as a native balance; the ERC-20 interface at USDC_ADDRESS reports 6.
 * They are the same balance in two units: never show or add them as separate rows.
 */
export const USDC_NATIVE_DECIMALS = 18;
export const USDC_ERC20_DECIMALS = 6;

export const arcChain = defineChain({
  id: net.id,
  name: net.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: USDC_NATIVE_DECIMALS },
  rpcUrls: { default: { http: [ARC_RPC_URL] }, public: { http: [ARC_RPC_URL] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: ARC_EXPLORER_URL } },
  testnet: net.testnet,
});

export const FAUCET_URL = 'https://faucet.circle.com';
