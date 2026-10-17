/**
 * Arc network constants: the one place the backend learns about Arc (Circle's L1, where USDC is the native gas token).
 * Source: https://docs.arc.io/integrate/connect-to-arc and https://docs.arc.io/arc/references/contract-addresses
 * (checked 2026-10-17). Everything here can be overridden with ARC_* environment variables; see config/index.ts.
 */
export const ARC_NETWORKS = {
  testnet: {
    chainId: 5042002,
    name: 'Arc Testnet',
    rpcUrl: 'https://rpc.testnet.arc.io',
    explorerUrl: 'https://explorer.testnet.arc.io',
  },
  mainnet: {
    chainId: 5042,
    name: 'Arc',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorerUrl: 'https://explorer.arc.io',
  },
} as const;

export type ArcNetworkName = keyof typeof ARC_NETWORKS;

/** Same address on testnet and mainnet. */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

/**
 * USDC is the native gas token and has 18 decimals as a native balance; the ERC-20 interface at USDC_ADDRESS
 * reports 6. They are the same balance in two units: never show or add them as separate rows.
 */
export const USDC_NATIVE_DECIMALS = 18;
export const USDC_ERC20_DECIMALS = 6;
