import { zeroAddress, zeroHash, type Address, type Hex } from 'viem';
import { decisionLogAbi } from '../chain/abis/decisionLog.js';
import { getRelayerAccount, publicClient, requireDecisionLog } from '../chain/clients.js';
import { ACTIONS, OUTCOMES, computeDecisionHash, nullIfZero, type RawDecision } from '../chain/treasury.js';
import { AppError } from '../middleware/errorHandler.js';
import type { CreateDecisionBody } from '../schemas/treasury.js';
import { mapRevert, sendTx } from './treasuryTx.js';

const abi = decisionLogAbi;
const SCAN_TAIL = 200; // pending approvals look at this many of a business's newest records
const PAGE = 50;

export interface DecisionView {
  decisionId: Hex;
  seq: number;
  timestamp: number;
  recorder: Address;
  businessId: Hex;
  agentId: Hex;
  mandateId: Hex | null;
  action: (typeof ACTIONS)[number];
  counterparty: Address | null;
  amount: string;
  rulesEvaluated: string;
  rulesFailed: string;
  riskTier: number;
  riskScore: number;
  outcome: (typeof OUTCOMES)[number];
  rationaleHash: Hex;
  txHash: Hex | null;
  approvalRef: Hex | null;
  parentDecisionId: Hex | null;
  clientRef: Hex | null;
  prevHash: Hex | null;
  recordHash: Hex;
  /** True when the stored hash equals the DecisionLog rule recomputed here from the stored fields. */
  hashVerified: boolean;
}

function toView(d: RawDecision): DecisionView {
  return {
    decisionId: d.decisionId,
    seq: Number(d.seq),
    timestamp: Number(d.timestamp),
    recorder: d.recorder,
    businessId: d.businessId,
    agentId: d.agentId,
    mandateId: nullIfZero(d.mandateId),
    action: ACTIONS[d.action] ?? 'PAYMENT',
    counterparty: nullIfZero(d.counterparty),
    amount: d.amount.toString(),
    rulesEvaluated: d.rulesEvaluated.toString(),
    rulesFailed: d.rulesFailed.toString(),
    riskTier: d.riskTier,
    riskScore: d.riskScore,
    outcome: OUTCOMES[d.outcome] ?? 'PROPOSED',
    rationaleHash: d.rationaleHash,
    txHash: nullIfZero(d.txHash),
    approvalRef: nullIfZero(d.approvalRef),
    parentDecisionId: nullIfZero(d.parentDecisionId),
    clientRef: nullIfZero(d.clientRef),
    prevHash: nullIfZero(d.prevHash),
    recordHash: d.recordHash,
    hashVerified: computeDecisionHash(d) === d.recordHash,
  };
}

export class DecisionService {
  /** Writes a record through the API's relayer, which the business owner must have authorised as a recorder. */
  static async record(body: CreateDecisionBody) {
    const log = requireDecisionLog();
    const relayer = getRelayerAccount();
    if (!relayer) throw new AppError('No relayer key is configured to record decisions', 503, 'RELAYER_NOT_CONFIGURED');

    const input = {
      businessId: body.businessId,
      agentId: body.agentId,
      mandateId: body.mandateId ?? zeroHash,
      action: ACTIONS.indexOf(body.action),
      counterparty: body.counterparty ?? zeroAddress,
      amount: body.amount,
      rulesEvaluated: body.rulesEvaluated,
      rulesFailed: body.rulesFailed,
      riskTier: body.riskTier,
      riskScore: body.riskScore,
      outcome: OUTCOMES.indexOf(body.outcome),
      rationaleHash: body.rationaleHash,
      txHash: body.txHash ?? zeroHash,
      approvalRef: body.approvalRef ?? zeroHash,
      parentDecisionId: body.parentDecisionId ?? zeroHash,
      clientRef: body.clientRef ?? zeroHash,
    };
    const tx = await sendTx<Hex>(relayer, { address: log, abi, functionName: 'recordDecision', args: [input] }, 'recording the decision');
    const decisionId = tx.result;
    if (tx.status !== 'confirmed') return { decisionId, txHash: tx.txHash, status: tx.status, decision: null };
    return { decisionId, txHash: tx.txHash, status: tx.status, decision: await DecisionService.get(decisionId) };
  }

  static async get(decisionId: Hex): Promise<DecisionView> {
    const log = requireDecisionLog();
    try {
      const d = (await publicClient.readContract({ address: log, abi, functionName: 'getDecision', args: [decisionId] })) as unknown as RawDecision;
      return toView(d);
    } catch (err) {
      throw mapRevert(err, 'reading the decision');
    }
  }

  static async list(q: { businessId?: Hex; agentId?: Hex; mandateId?: Hex; offset: number; limit: number }) {
    const log = requireDecisionLog();
    const offset = BigInt(q.offset);
    const limit = BigInt(q.limit);
    try {
      let total: bigint;
      let rows: readonly RawDecision[];
      if (q.businessId) {
        [total, rows] = (await Promise.all([
          publicClient.readContract({ address: log, abi, functionName: 'countByBusiness', args: [q.businessId] }),
          publicClient.readContract({ address: log, abi, functionName: 'getDecisionsByBusiness', args: [q.businessId, offset, limit] }),
        ])) as unknown as [bigint, RawDecision[]];
      } else if (q.agentId) {
        [total, rows] = (await Promise.all([
          publicClient.readContract({ address: log, abi, functionName: 'countByAgent', args: [q.agentId] }),
          publicClient.readContract({ address: log, abi, functionName: 'getDecisionsByAgent', args: [q.agentId, offset, limit] }),
        ])) as unknown as [bigint, RawDecision[]];
      } else {
        [total, rows] = (await Promise.all([
          publicClient.readContract({ address: log, abi, functionName: 'countByMandate', args: [q.mandateId!] }),
          publicClient.readContract({ address: log, abi, functionName: 'getDecisionsByMandate', args: [q.mandateId!, offset, limit] }),
        ])) as unknown as [bigint, RawDecision[]];
      }
      const items = rows.map(toView);
      // Inside a business's own list each record must name its predecessor's hash. (Agent and mandate lists skip records of
      // other agents, so adjacent entries are not neighbours there.)
      const linked = q.businessId ? items.every((d, i) => i === 0 || d.prevHash === items[i - 1].recordHash) : null;
      return { total: Number(total), offset: q.offset, limit: q.limit, items, linked };
    } catch (err) {
      throw mapRevert(err, 'listing decisions');
    }
  }

  /**
   * Escalations still waiting for a human: ESCALATED records of the business that no later record names as its parent.
   * Looks at the newest SCAN_TAIL records only.
   */
  static async pendingApprovals(businessId: Hex) {
    const log = requireDecisionLog();
    try {
      const total = Number(await publicClient.readContract({ address: log, abi, functionName: 'countByBusiness', args: [businessId] }));
      const start = Math.max(0, total - SCAN_TAIL);
      const recent: DecisionView[] = [];
      for (let offset = start; offset < total; offset += PAGE) {
        const rows = (await publicClient.readContract({
          address: log, abi, functionName: 'getDecisionsByBusiness', args: [businessId, BigInt(offset), BigInt(Math.min(PAGE, total - offset))],
        })) as unknown as RawDecision[];
        recent.push(...rows.map(toView));
      }
      const escalated = recent.filter((d) => d.outcome === 'ESCALATED');
      const follow = await Promise.all(
        escalated.map((d) => publicClient.readContract({ address: log, abi, functionName: 'firstFollowUp', args: [d.decisionId] })),
      );
      const items = escalated.filter((_, i) => follow[i] === zeroHash).reverse(); // newest first
      return { businessId, scanned: recent.length, totalRecords: total, items };
    } catch (err) {
      throw mapRevert(err, 'listing pending approvals');
    }
  }
}
