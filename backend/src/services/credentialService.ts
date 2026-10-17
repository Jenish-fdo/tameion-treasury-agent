import { randomBytes } from 'node:crypto';
import { encodePacked, isAddressEqual, keccak256, toBytes, zeroAddress, type Address, type Hex } from 'viem';
import { CREDENTIAL_REQUEST_TYPES, credentialRegistryAbi } from '../chain/abis.js';
import {
  getIssuerAccount, getRelayerAccount, getWalletClient, publicClient, requireRegistry, revertName, toUpstreamError,
} from '../chain/clients.js';
import { config } from '../config/index.js';
import { Mutex } from '../lib/mutex.js';
import { AppError } from '../middleware/errorHandler.js';
import type { MintBody } from '../schemas/api.js';
import { credentialStore, type CredentialRecord } from '../store/credentialStore.js';
import { logger } from '../utils/logger.js';

const SIGNATURE_VALIDITY_SECONDS = 600;
const MIN_EXPIRY_LEAD_SECONDS = 60;

// The relayer's own transaction nonce must be sequential, so mints are serialised within this process.
const mintLock = new Mutex();

export interface MintResult { credentialId: Hex; txHash: Hex; status: 'pending' | 'confirmed' }

export interface CredentialView {
  credentialId: Hex;
  valid: boolean;
  isRevoked: boolean;
  issuer: Address;
  subject: Address;
  credentialTypeHash: Hex;
  credentialType: string | null;
  issuedAt: number;
  expiresAt: number;
  dataHash: Hex;
  metadataUri: string | null;
}

/** bytes32 types are passed through; free-text types are hashed. */
export const credentialTypeToBytes32 = (t: string): Hex => (/^0x[0-9a-fA-F]{64}$/.test(t) ? (t.toLowerCase() as Hex) : keccak256(toBytes(t)));
export const metadataToDataHash = (uri: string): Hex => keccak256(toBytes(uri));
/** Mirrors CredentialRegistry._computeCredentialId. */
export const computeCredentialId = (issuer: Address, holder: Address, type: Hex, dataHash: Hex): Hex =>
  keccak256(encodePacked(['address', 'address', 'bytes32', 'bytes32'], [issuer, holder, type, dataHash]));

async function readOnChain(id: Hex) {
  const registry = requireRegistry();
  try {
    const credential = await publicClient.readContract({ address: registry, abi: credentialRegistryAbi, functionName: 'getCredential', args: [id] });
    const valid = await publicClient.readContract({ address: registry, abi: credentialRegistryAbi, functionName: 'verifyCredential', args: [id] });
    return { credential, valid };
  } catch (err) {
    if (revertName(err) === 'CredentialNotFound') return null;
    throw toUpstreamError(err, 'reading the credential');
  }
}

function toView(id: Hex, chainData: NonNullable<Awaited<ReturnType<typeof readOnChain>>>, record?: CredentialRecord): CredentialView {
  const { credential: c, valid } = chainData;
  // Only serve off-chain metadata that matches the hash committed on-chain.
  const trusted = record && metadataToDataHash(record.metadataUri) === c.dataHash ? record : undefined;
  return {
    credentialId: id,
    valid,
    isRevoked: c.revoked,
    issuer: c.issuer,
    subject: c.holder,
    credentialTypeHash: c.credentialType,
    credentialType: trusted && credentialTypeToBytes32(trusted.credentialType) === c.credentialType ? trusted.credentialType : null,
    issuedAt: Number(c.issuedAt),
    expiresAt: Number(c.expiryTimestamp),
    dataHash: c.dataHash,
    metadataUri: trusted?.metadataUri ?? null,
  };
}

export class CredentialService {
  static async mint(body: MintBody): Promise<MintResult> {
    const registry = requireRegistry();
    const now = Math.floor(Date.now() / 1000);

    if (isAddressEqual(body.subject, zeroAddress)) throw new AppError('subject must not be the zero address', 400, 'INVALID_SUBJECT');
    if (body.expiresAt !== 0 && body.expiresAt < now + MIN_EXPIRY_LEAD_SECONDS) {
      throw new AppError('expiresAt must be 0 (no expiry) or at least 60 seconds in the future', 400, 'INVALID_EXPIRY');
    }

    const issuerAccount = getIssuerAccount(body.issuer);
    if (!issuerAccount) {
      throw new AppError('No signing key is configured for this issuer', 403, 'ISSUER_NOT_MANAGED');
    }
    const sender = getRelayerAccount() ?? issuerAccount;

    const credentialType = credentialTypeToBytes32(body.credentialType);
    const dataHash = metadataToDataHash(body.metadataUri);
    const credentialId = computeCredentialId(issuerAccount.address, body.subject, credentialType, dataHash);

    try {
      const authorized = await publicClient.readContract({ address: registry, abi: credentialRegistryAbi, functionName: 'isAuthorizedIssuer', args: [issuerAccount.address] });
      if (!authorized) throw new AppError('Issuer is not authorized in the CredentialRegistry', 403, 'ISSUER_NOT_AUTHORIZED');
      if (await readOnChain(credentialId)) {
        throw new AppError('A credential with identical issuer, subject, type and metadata already exists', 409, 'CREDENTIAL_EXISTS', { credentialId });
      }

      const txHash = await mintLock.run(async () => {
        // Nonces are per signer and unordered (security review M-1): a fresh random 256-bit value is unique with overwhelming probability.
        const nonce = BigInt(`0x${randomBytes(32).toString('hex')}`);
        const domain = await publicClient.readContract({ address: registry, abi: credentialRegistryAbi, functionName: 'eip712Domain' });
        const [, name, version, chainId, verifyingContract] = domain;
        const request = {
          holder: body.subject,
          credentialType,
          dataHash,
          expiryTimestamp: BigInt(body.expiresAt),
          nonce,
          deadline: BigInt(now + SIGNATURE_VALIDITY_SECONDS),
        };
        const signature = await issuerAccount.signTypedData({
          domain: { name, version, chainId, verifyingContract },
          types: CREDENTIAL_REQUEST_TYPES,
          primaryType: 'CredentialRequest',
          message: request,
        });

        const { request: txRequest } = await publicClient.simulateContract({
          account: sender, address: registry, abi: credentialRegistryAbi, functionName: 'issueCredentialWithSig', args: [request, signature],
        });
        return getWalletClient(sender).writeContract(txRequest);
      });

      await credentialStore.put({
        credentialId, issuer: issuerAccount.address, subject: body.subject, credentialType: body.credentialType,
        metadataUri: body.metadataUri, dataHash, txHash, createdAt: now,
      });
      logger.info(`Credential ${credentialId} submitted in tx ${txHash}`);

      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: config.chain.txConfirmTimeoutMs });
        if (receipt.status !== 'success') {
          await credentialStore.remove(credentialId);
          throw new AppError('Credential transaction reverted on-chain', 502, 'TX_REVERTED', { txHash });
        }
        return { credentialId, txHash, status: 'confirmed' };
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.warn(`Receipt for ${txHash} not available within ${config.chain.txConfirmTimeoutMs}ms; reporting pending`);
        return { credentialId, txHash, status: 'pending' };
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      const name = revertName(err);
      if (name === 'CredentialAlreadyExists') throw new AppError('Credential already exists', 409, 'CREDENTIAL_EXISTS', { credentialId });
      if (name === 'NotAuthorizedIssuer') throw new AppError('Issuer is not authorized in the CredentialRegistry', 403, 'ISSUER_NOT_AUTHORIZED');
      if (name === 'InvalidExpiry' || name === 'SignatureExpired' || name === 'InvalidHolder') {
        throw new AppError(`Registry rejected the credential: ${name}`, 400, name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase());
      }
      throw toUpstreamError(err, 'submitting the credential');
    }
  }

  static async get(credentialId: Hex): Promise<CredentialView> {
    const chainData = await readOnChain(credentialId);
    if (!chainData) throw new AppError('Credential not found', 404, 'CREDENTIAL_NOT_FOUND', { credentialId });
    return toView(credentialId, chainData, await credentialStore.get(credentialId));
  }

  static async verify(credentialId: Hex): Promise<{ valid: boolean; isRevoked: boolean; expiresAt: number; metadataUri: string | null } & Pick<CredentialView, 'credentialId' | 'issuer' | 'subject' | 'issuedAt'>> {
    const v = await this.get(credentialId);
    return {
      valid: v.valid, isRevoked: v.isRevoked, expiresAt: v.expiresAt, metadataUri: v.metadataUri,
      credentialId: v.credentialId, issuer: v.issuer, subject: v.subject, issuedAt: v.issuedAt,
    };
  }

  /** All credentials this API has issued to `subject` that are currently valid on-chain. */
  static async listActiveForSubject(subject: Address): Promise<CredentialView[]> {
    const MAX = 200;
    const records = (await credentialStore.listBySubject(subject)).slice(0, MAX);
    const views = await Promise.all(
      records.map(async (r) => {
        const chainData = await readOnChain(r.credentialId);
        return chainData ? toView(r.credentialId, chainData, r) : null;
      })
    );
    return views.filter((v): v is CredentialView => v !== null && v.valid);
  }
}
