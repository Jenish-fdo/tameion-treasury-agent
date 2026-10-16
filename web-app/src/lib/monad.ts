import { defineChain } from 'viem';

// Monad testnet. Public settings only; reads go through this RPC and passkey-signed writes are sent to it.
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
    public: {
      http: [RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL || 'https://explorer.testnet.monad.xyz',
    },
  },
  testnet: true,
});

export const FAUCET_URL = 'https://faucet.monad.xyz';
