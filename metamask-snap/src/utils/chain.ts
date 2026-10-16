/** CAIP-2 handling for EVM chains: "eip155:<decimal chain id>". */

const CAIP2_EIP155 = /^eip155:([1-9][0-9]{0,15})$/;

/** Returns the decimal chain id, or null for anything that is not a well-formed eip155 id. */
export function parseCaip2(chainId: unknown): number | null {
  if (typeof chainId !== 'string') return null;
  const m = CAIP2_EIP155.exec(chainId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** Display name when the chain is explicitly configured as supported, otherwise null. */
export function supportedNetworkName(chainId: unknown, networks: Record<string, string>): string | null {
  return parseCaip2(chainId) === null ? null : Object.prototype.hasOwnProperty.call(networks, chainId as string) ? networks[chainId as string] : null;
}
