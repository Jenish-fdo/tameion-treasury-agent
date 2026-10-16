import { encodeFunctionData, keccak256, toBytes, zeroHash } from 'viem';
import type { MintParams, TxResult } from '../types';
import { assertAddress, assertChainId, assertCredentialType, assertExpiry, assertMetadataUri } from './validation';
import { CredentiaError } from './errors';

/** Only the function the SDK prepares. Matches CredentialRegistry.issueCredential (onlyIssuer). */
export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'issueCredential',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'holder', type: 'address' },
      { name: 'credentialType', type: 'bytes32' },
      { name: 'dataHash', type: 'bytes32' },
      { name: 'expiryTimestamp', type: 'uint64' },
    ],
    outputs: [{ name: 'id', type: 'bytes32' }],
  },
] as const;

/** A 0x…64-hex value is used as-is; free text is hashed with keccak256 (the same rule the backend uses). */
export const credentialTypeToBytes32 = (t: string): `0x${string}` => (/^0x[0-9a-fA-F]{64}$/.test(t) ? (t.toLowerCase() as `0x${string}`) : keccak256(toBytes(t)));

export interface PrepareContext {
  chainId?: number;
  registryAddress?: string;
}

/**
 * Builds an UNSIGNED transaction for CredentialRegistry.issueCredential. Nothing is signed or sent:
 * the caller's wallet must sign it, and the signer must be an authorised issuer or the call will revert.
 * Returns UNAVAILABLE (never a made-up result) when the chain or registry address is not configured.
 */
export function prepareIssueCredential(params: MintParams, ctx: PrepareContext): TxResult {
  const subject = assertAddress(params.subject, 'subject');
  const type = assertCredentialType(params.credentialType);
  const expiresAt = assertExpiry(params.expiresAt);
  const uri = assertMetadataUri(params.metadataUri);

  if (ctx.chainId === undefined || !ctx.registryAddress) {
    return {
      status: 'UNAVAILABLE',
      message: 'Minting cannot be prepared: configure both chainId and registryAddress. Nothing was signed or sent.',
    };
  }
  const chainId = assertChainId(ctx.chainId);
  let registry: string;
  try {
    registry = assertAddress(ctx.registryAddress, 'registryAddress');
  } catch (e) {
    throw e instanceof CredentiaError ? e : new CredentiaError('VALIDATION', 'registryAddress is invalid.');
  }

  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: 'issueCredential',
    args: [subject as `0x${string}`, credentialTypeToBytes32(type), uri ? keccak256(toBytes(uri)) : zeroHash, BigInt(expiresAt)],
  });
  return {
    status: 'PREPARED',
    preparedTransaction: { to: registry, data, value: '0', chainId },
    message: 'Unsigned transaction prepared. It has NOT been signed or sent. It must be signed by an authorised issuer wallet.',
  };
}
