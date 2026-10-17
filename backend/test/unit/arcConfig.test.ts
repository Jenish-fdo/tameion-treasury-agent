import { describe, expect, it } from '@jest/globals';
import { ARC_NETWORKS, USDC_ADDRESS, USDC_ERC20_DECIMALS, USDC_NATIVE_DECIMALS } from '../../src/chain/arc.js';
import { config } from '../../src/config/index.js';

describe('Arc chain config', () => {
  it('defaults to Arc testnet, with the values from Circle’s docs', () => {
    expect(config.chain.network).toBe('testnet');
    expect(config.chain.chainId).toBe(5042002);
    expect(config.chain.rpcUrl).toBe('https://rpc.testnet.arc.io');
    expect(config.chain.explorerUrl).toBe('https://explorer.testnet.arc.io');
    expect(ARC_NETWORKS.mainnet.chainId).toBe(5042);
  });

  it('keeps native (18) and ERC-20 (6) USDC decimals apart', () => {
    expect(USDC_NATIVE_DECIMALS).toBe(18);
    expect(USDC_ERC20_DECIMALS).toBe(6);
    expect(USDC_ADDRESS).toBe('0x3600000000000000000000000000000000000000');
  });
});
