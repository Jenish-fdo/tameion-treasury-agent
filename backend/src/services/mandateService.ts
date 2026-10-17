import { randomBytes } from 'node:crypto';
import { encodeAbiParameters, keccak256, parseAbiItem, zeroHash, type Address, type Hex } from 'viem';
import { mandateRegistryAbi } from '../chain/abis/mandateRegistry.js';
import { getOwnerAccount, getRelayerAccount, managedOwners, publicClient, requireMandateRegistry } from '../chain/clients.js';
import { CATEGORY_BITS, MANDATE_STATUS, REASONS, categoriesFromMask, type CategoryName } from '../chain/treasury.js';
import { AppError } from '../middleware/errorHandler.js';
import type { CreateBusinessBody, CreateMandateBody, ValidatePaymentBody } from '../schemas/treasury.js';
import { mapRevert, sendTx } from './treasuryTx.js';

const abi = mandateRegistryAbi;
const randomHex32 = (): Hex => `0x${randomBytes(32).toString('hex')}`;
const randomUint256 = (): bigint => BigInt(randomHex32());

export interface MandateView {
  mandateId: Hex;
  businessId: Hex;
  owner: Address;
  agent: Address;
  agentId: Hex;
  /** What the contract stores. */
  status: (typeof MANDATE_STATUS)[number];
  /** `status`, except an ACTIVE mandate past its expiry reads EXPIRED (expiry takes effect without a transaction). */
  effectiveStatus: (typeof MANDATE_STATUS)[number];
  categories: CategoryName[];
  perTxLimit: string;
  dailyCap: string;
  weeklyCap: string;
  monthlyCap: string;
  approvalThreshold: string;
  maxRiskTier: number;
  singleUse: boolean;
  expiresAt: number;
  createdAt: number;
  nonce: string;
  spend: { day: string; week: string; month: string };
  /** Allowlisted recipients, rebuilt from RecipientSet events and re-checked on-chain. null when the RPC cannot serve logs. */
  recipients: Address[] | null;
}

type RawMandate = {
  agent: Address; expiresAt: bigint; maxRiskTier: number; status: number; singleUse: boolean; businessId: Hex; agentId: Hex;
  perTxLimit: bigint; approvalThreshold: bigint; dailyCap: bigint; weeklyCap: bigint; monthlyCap: bigint;
  allowedCategories: number; createdAt: bigint; nonce: bigint;
};

const recipientSetEvent = parseAbiItem('event RecipientSet(bytes32 indexed mandateId, address indexed recipient, bool allowed)');

async function readRecipients(registry: Address, mandateId: Hex): Promise<Address[] | null> {
  try {
    const logs = await publicClient.getLogs({ address: registry, event: recipientSetEvent, args: { mandateId }, fromBlock: 0n });
    const candidates = [...new Set(logs.map((l) => l.args.recipient as Address))];
    const live = await Promise.all(
      candidates.map((r) => publicClient.readContract({ address: registry, abi, functionName: 'isRecipientAllowed', args: [mandateId, r] })),
    );
    return candidates.filter((_, i) => live[i]);
  } catch {
    return null;
  }
}

async function readBusiness(registry: Address, businessId: Hex) {
  const [owner, pendingOwner, metadataHash, createdAt] = await publicClient.readContract({ address: registry, abi, functionName: 'getBusiness', args: [businessId] });
  return { owner, pendingOwner, metadataHash, createdAt: Number(createdAt) };
}

async function readMandateView(registry: Address, mandateId: Hex, withRecipients: boolean): Promise<MandateView> {
  const m = (await publicClient.readContract({ address: registry, abi, functionName: 'getMandate', args: [mandateId] })) as unknown as RawMandate;
  if (m.status === 0) throw new AppError('Mandate not found', 404, 'MANDATE_NOT_FOUND', { mandateId });
  const [business, spend, recipients] = await Promise.all([
    readBusiness(registry, m.businessId),
    publicClient.readContract({ address: registry, abi, functionName: 'getSpend', args: [mandateId] }),
    withRecipients ? readRecipients(registry, mandateId) : Promise.resolve(null),
  ]);
  const status = MANDATE_STATUS[m.status] ?? 'NONE';
  const expiresAt = Number(m.expiresAt);
  return {
    mandateId,
    businessId: m.businessId,
    owner: business.owner,
    agent: m.agent,
    agentId: m.agentId,
    status,
    effectiveStatus: status === 'ACTIVE' && Math.floor(Date.now() / 1000) >= expiresAt ? 'EXPIRED' : status,
    categories: categoriesFromMask(m.allowedCategories),
    perTxLimit: m.perTxLimit.toString(),
    dailyCap: m.dailyCap.toString(),
    weeklyCap: m.weeklyCap.toString(),
    monthlyCap: m.monthlyCap.toString(),
    approvalThreshold: m.approvalThreshold.toString(),
    maxRiskTier: m.maxRiskTier,
    singleUse: m.singleUse,
    expiresAt,
    createdAt: Number(m.createdAt),
    nonce: m.nonce.toString(),
    spend: { day: spend[0].toString(), week: spend[1].toString(), month: spend[2].toString() },
    recipients,
  };
}

/** Business and mandate operations for the TESTNET DEMO: the API acts for the business owners whose keys it holds. */
export class MandateService {
  static managedOwners(): Address[] {
    return managedOwners();
  }

  static async registerBusiness(body: CreateBusinessBody) {
    const registry = requireMandateRegistry();
    const owner = getOwnerAccount(body.owner);
    if (!owner) throw new AppError('The API holds no key for this owner (testnet demo owners only)', 403, 'OWNER_NOT_MANAGED');

    const created = await sendTx<Hex>(
      owner,
      { address: registry, abi, functionName: 'registerBusiness', args: [body.salt ?? randomHex32(), body.metadata ?? zeroHash] },
      'registering the business',
    );
    const businessId = created.result;

    // Let the API's relayer record decisions for this business. Skipped when no relayer is configured or the first step is still pending.
    const relayer = getRelayerAccount();
    let relayerAuthorized = false;
    let recorderTx: Hex | undefined;
    if (relayer && created.status === 'confirmed') {
      const rec = await sendTx(owner, { address: registry, abi, functionName: 'setRecorder', args: [businessId, relayer.address, true] }, 'authorising the relayer');
      relayerAuthorized = rec.status === 'confirmed';
      recorderTx = rec.txHash;
    }
    return { businessId, owner: owner.address, relayer: relayer?.address ?? null, relayerAuthorized, txHash: created.txHash, recorderTxHash: recorderTx ?? null, status: created.status };
  }

  static async getBusiness(businessId: Hex) {
    const registry = requireMandateRegistry();
    const b = await readBusiness(registry, businessId);
    if (b.owner === '0x0000000000000000000000000000000000000000') throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND', { businessId });
    const relayer = getRelayerAccount();
    const relayerIsRecorder = relayer
      ? await publicClient.readContract({ address: registry, abi, functionName: 'isRecorder', args: [businessId, relayer.address] })
      : false;
    return { businessId, ...b, relayer: relayer?.address ?? null, relayerIsRecorder, ownerIsManaged: Boolean(getOwnerAccount(b.owner)) };
  }

  static async createMandate(body: CreateMandateBody): Promise<MandateView | { mandateId: Hex; txHash: Hex; status: 'pending' }> {
    const registry = requireMandateRegistry();
    const business = await readBusiness(registry, body.businessId);
    if (business.owner === '0x0000000000000000000000000000000000000000') throw new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND', { businessId: body.businessId });
    const owner = getOwnerAccount(business.owner);
    if (!owner) throw new AppError('The API holds no key for this business\'s owner (testnet demo owners only)', 403, 'OWNER_NOT_MANAGED');

    const nonce = randomUint256();
    const params = {
      businessId: body.businessId,
      agent: body.agent,
      agentId: body.agentId,
      allowedCategories: body.allowedCategories,
      perTxLimit: body.perTxLimit,
      dailyCap: body.dailyCap,
      weeklyCap: body.weeklyCap,
      monthlyCap: body.monthlyCap,
      approvalThreshold: body.approvalThreshold,
      maxRiskTier: body.maxRiskTier,
      singleUse: body.singleUse,
      expiresAt: BigInt(body.expiresAt),
      nonce,
      recipients: body.recipients,
    };
    const tx = await sendTx<Hex>(owner, { address: registry, abi, functionName: 'createMandate', args: [params] }, 'creating the mandate');
    const mandateId = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }], [body.businessId, owner.address, nonce]));
    if (tx.status !== 'confirmed') return { mandateId, txHash: tx.txHash, status: 'pending' };
    return readMandateView(registry, mandateId, true);
  }

  static async revoke(mandateId: Hex, reason: Hex | undefined): Promise<MandateView> {
    const registry = requireMandateRegistry();
    const current = await readMandateView(registry, mandateId, false);
    const owner = getOwnerAccount(current.owner);
    if (!owner) throw new AppError('The API holds no key for this business\'s owner (testnet demo owners only)', 403, 'OWNER_NOT_MANAGED');
    await sendTx(owner, { address: registry, abi, functionName: 'revokeMandate', args: [mandateId, reason ?? zeroHash] }, 'revoking the mandate');
    return readMandateView(registry, mandateId, true);
  }

  static async get(mandateId: Hex): Promise<MandateView> {
    return readMandateView(requireMandateRegistry(), mandateId, true);
  }

  static async list(q: { businessId?: Hex; agent?: Address; offset: number; limit: number }) {
    const registry = requireMandateRegistry();
    try {
      const [total, ids] = q.businessId
        ? await Promise.all([
            publicClient.readContract({ address: registry, abi, functionName: 'mandateCountByBusiness', args: [q.businessId] }),
            publicClient.readContract({ address: registry, abi, functionName: 'mandateIdsByBusiness', args: [q.businessId, BigInt(q.offset), BigInt(q.limit)] }),
          ])
        : await Promise.all([
            Promise.resolve(undefined),
            publicClient.readContract({ address: registry, abi, functionName: 'mandateIdsByAgent', args: [q.agent!, BigInt(q.offset), BigInt(q.limit)] }),
          ]);
      const items = await Promise.all(ids.map((id) => readMandateView(registry, id, false)));
      return { total: total === undefined ? null : Number(total), offset: q.offset, limit: q.limit, items };
    } catch (err) {
      throw mapRevert(err, 'listing mandates');
    }
  }

  /** Read-only: would the contract allow this payment under this mandate right now? Spends nothing. */
  static async validate(mandateId: Hex, body: ValidatePaymentBody) {
    const registry = requireMandateRegistry();
    try {
      const r = await publicClient.readContract({
        address: registry,
        abi,
        functionName: 'validate',
        args: [mandateId, body.agent, { recipient: body.recipient, amount: body.amount, category: CATEGORY_BITS[body.category], riskTier: body.riskTier, paymentId: body.paymentId }],
      });
      return {
        mandateId,
        allowed: r.allowed,
        needsApproval: r.needsApproval,
        reason: REASONS[r.reason] ?? 'NONE',
        remaining: { daily: r.dailyRemaining.toString(), weekly: r.weeklyRemaining.toString(), monthly: r.monthlyRemaining.toString() },
        checkedAt: Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      throw mapRevert(err, 'validating the payment');
    }
  }
}
