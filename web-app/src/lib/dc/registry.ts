import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http, type Address, type Hex, type LocalAccount } from 'viem';
import { arcChain } from '@/lib/arc';
import { REGISTRY_ADDRESS } from '@/lib/chain';
import type { OnChainCredential } from './credential';
import { ZERO_ADDRESS } from './credential';

const issueInputs = [
  { name: 'holder', type: 'address' },
  { name: 'credentialType', type: 'bytes32' },
  { name: 'dataHash', type: 'bytes32' },
  { name: 'expiryTimestamp', type: 'uint64' },
] as const;

/** The subset of CredentialRegistry this app calls. */
export const registryAbi = [
  { type: 'function', name: 'issueCredential', stateMutability: 'nonpayable', inputs: issueInputs, outputs: [{ name: 'id', type: 'bytes32' }] },
  { type: 'function', name: 'recordVerification', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ name: 'valid', type: 'bool' }] },
  {
    type: 'function',
    name: 'getCredential',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [
      {
        name: 'credential',
        type: 'tuple',
        components: [
          { name: 'issuer', type: 'address' },
          { name: 'holder', type: 'address' },
          { name: 'credentialType', type: 'bytes32' },
          { name: 'dataHash', type: 'bytes32' },
          { name: 'issuedAt', type: 'uint64' },
          { name: 'expiryTimestamp', type: 'uint64' },
          { name: 'revoked', type: 'bool' },
        ],
      },
    ],
  },
  { type: 'function', name: 'isAuthorizedIssuer', stateMutability: 'view', inputs: [{ name: 'issuer', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'verificationCount', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'error', name: 'CredentialNotFound', inputs: [{ name: 'id', type: 'bytes32' }] },
  { type: 'error', name: 'CredentialAlreadyExists', inputs: [{ name: 'id', type: 'bytes32' }] },
  { type: 'error', name: 'NotAuthorizedIssuer', inputs: [{ name: 'caller', type: 'address' }] },
] as const;

export const registryAddress = (REGISTRY_ADDRESS || undefined) as Address | undefined;
/** True when a registry address is configured. Without it the app runs in clearly labelled demo mode. */
export const isAnchoringEnabled = Boolean(registryAddress);

let client: ReturnType<typeof createPublicClient> | null = null;
function publicClient() {
  client ??= createPublicClient({ chain: arcChain, transport: http(arcChain.rpcUrls.default.http[0]) });
  return client;
}

function revertName(e: unknown): string | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
}

/** null = the registry has no such credential. Throws if the registry cannot be read. */
export async function readCredential(id: Hex): Promise<OnChainCredential | null> {
  if (!registryAddress) throw new Error('registry not configured');
  try {
    const c = await publicClient().readContract({ address: registryAddress, abi: registryAbi, functionName: 'getCredential', args: [id] });
    if (c.issuer === ZERO_ADDRESS) return null;
    return {
      issuer: c.issuer,
      holder: c.holder,
      credentialType: c.credentialType,
      dataHash: c.dataHash,
      issuedAt: Number(c.issuedAt),
      expiryTimestamp: Number(c.expiryTimestamp),
      revoked: c.revoked,
    };
  } catch (e) {
    // The registry reverts for an unknown ID; that is an answer ("not found"), not an outage.
    if (revertName(e) === 'CredentialNotFound') return null;
    throw e;
  }
}

export async function readIssuerAuthorized(issuer: Address): Promise<boolean> {
  if (!registryAddress) throw new Error('registry not configured');
  return publicClient().readContract({ address: registryAddress, abi: registryAbi, functionName: 'isAuthorizedIssuer', args: [issuer] });
}

export interface CredentialExtras {
  verificationCount: number;
}

export async function readCredentialExtras(id: Hex): Promise<CredentialExtras> {
  if (!registryAddress) throw new Error('registry not configured');
  const count = await publicClient().readContract({ address: registryAddress, abi: registryAbi, functionName: 'verificationCount', args: [id] });
  return { verificationCount: Number(count) };
}

// --- writes, signed in this tab by the connected account -------------------------------------------------------------

type RegistryWrite =
  | { functionName: 'issueCredential'; args: readonly [Address, Hex, Hex, bigint] }
  | { functionName: 'recordVerification'; args: readonly [Hex] };

/** Sends one registry transaction from the connected account and waits for it to be mined. */
export async function writeRegistry(signer: LocalAccount, call: RegistryWrite): Promise<Hex> {
  if (!registryAddress) throw new Error('registry not configured');
  const wallet = createWalletClient({ account: signer, chain: arcChain, transport: http(arcChain.rpcUrls.default.http[0]) });
  const hash =
    call.functionName === 'recordVerification'
      ? await wallet.writeContract({ address: registryAddress, abi: registryAbi, functionName: 'recordVerification', args: call.args })
      : await wallet.writeContract({ address: registryAddress, abi: registryAbi, functionName: call.functionName, args: call.args });
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The transaction was reverted.');
  return hash;
}

/** Turns a failed write into a sentence the person can act on. */
export function writeErrorMessage(e: unknown, fallback: string): string {
  const name = revertName(e);
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (name === 'NotAuthorizedIssuer' || /NotAuthorizedIssuer/.test(msg)) return 'This account is not an authorised issuer on the registry. Ask the registry owner to authorise it, then try again.';
  if (name === 'CredentialAlreadyExists' || /CredentialAlreadyExists|already exists/i.test(msg)) return 'An identical credential already exists. Change any detail and try again.';
  if (/insufficient funds|exceeds the balance/i.test(msg)) return 'This account has no USDC for gas on Arc. On testnet, get USDC from the Circle faucet and try again.';
  return fallback;
}
