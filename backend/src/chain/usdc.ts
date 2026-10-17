import { parseAbi } from 'viem';

/** The ERC-20 interface of Arc's USDC (6 decimals; its balance mirrors the native balance). Only what the API calls. */
export const usdcAbi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);
