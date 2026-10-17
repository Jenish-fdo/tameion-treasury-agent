import type { Abi, Address, Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { getWalletClient, publicClient, revertName, toUpstreamError } from '../chain/clients.js';
import { config } from '../config/index.js';
import { Mutex } from '../lib/mutex.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// A sender's transaction nonce is read-then-used, so one sender's transactions are serialised within this process.
const queues = new Map<string, Mutex>();
const queueFor = (sender: Address): Mutex => {
  const key = sender.toLowerCase();
  let q = queues.get(key);
  if (!q) queues.set(key, (q = new Mutex()));
  return q;
};

export interface TxResult<R> {
  txHash: Hex;
  status: 'confirmed' | 'pending';
  /** What the call would return, from the simulation that preceded it. */
  result: R;
}

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * Simulates the call (so a revert surfaces as a named custom error before any gas is spent), sends it from
 * `account`, and waits briefly for the receipt. Reports "pending" rather than failing when the receipt is slow.
 */
export async function sendTx<R = unknown>(account: PrivateKeyAccount, call: ContractCall, what: string): Promise<TxResult<R>> {
  try {
    return await queueFor(account.address).run(async () => {
      const { request, result } = await publicClient.simulateContract({ account, ...call } as never);
      const txHash = await getWalletClient(account).writeContract(request as never);
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: config.chain.txConfirmTimeoutMs });
        if (receipt.status !== 'success') throw new AppError('The transaction reverted on-chain', 502, 'TX_REVERTED', { txHash });
        return { txHash, status: 'confirmed' as const, result: result as R };
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.warn(`Receipt for ${txHash} (${what}) not available within ${config.chain.txConfirmTimeoutMs}ms; reporting pending`);
        return { txHash, status: 'pending' as const, result: result as R };
      }
    });
  } catch (err) {
    throw mapRevert(err, what);
  }
}

const REVERTS: Record<string, [status: number, code: string, message: string]> = {
  // MandateRegistry
  BusinessExists: [409, 'BUSINESS_EXISTS', 'A business with this owner and salt already exists'],
  UnknownBusiness: [404, 'BUSINESS_NOT_FOUND', 'No such business'],
  NotBusinessOwner: [403, 'NOT_BUSINESS_OWNER', 'The caller does not own this business'],
  UnknownMandate: [404, 'MANDATE_NOT_FOUND', 'No such mandate'],
  NotActive: [409, 'MANDATE_NOT_ACTIVE', 'The mandate is not active (revoked, consumed or expired)'],
  AgentIsOwner: [400, 'AGENT_IS_OWNER', 'The agent address must differ from the business owner'],
  NoCategories: [400, 'NO_CATEGORIES', 'At least one payment category is required'],
  InvalidLimits: [400, 'INVALID_LIMITS', 'Limits must satisfy perTxLimit <= dailyCap <= weeklyCap <= monthlyCap, all above zero'],
  InvalidRiskTier: [400, 'INVALID_RISK_TIER', 'maxRiskTier must be 0, 1 or 2'],
  InvalidExpiry: [400, 'INVALID_EXPIRY', 'expiresAt must be in the future and at most 365 days from now'],
  TooManyRecipients: [400, 'TOO_MANY_RECIPIENTS', 'Too many recipients'],
  InvalidRecipient: [400, 'INVALID_RECIPIENT', 'A recipient is the zero address or the agent itself'],
  NonceUsed: [409, 'NONCE_USED', 'This nonce was already used'],
  ZeroAddress: [400, 'ZERO_ADDRESS', 'A required address is the zero address'],
  // DecisionLog
  NotAuthorized: [403, 'NOT_AUTHORIZED', 'The API relayer is not authorised to record decisions for this business'],
  MandateBusinessMismatch: [400, 'MANDATE_BUSINESS_MISMATCH', 'The mandate belongs to a different business'],
  AgentMismatch: [400, 'AGENT_MISMATCH', 'The agent id does not match the mandate'],
  InvalidRiskScore: [400, 'INVALID_RISK_SCORE', 'riskScore must be 0 to 10000'],
  InvalidActionOutcome: [400, 'INVALID_ACTION_OUTCOME', 'This action cannot have this outcome'],
  ExecutedNeedsTxHash: [400, 'EXECUTED_NEEDS_TX_HASH', 'An executed decision needs a txHash'],
  TxHashOnlyWhenExecuted: [400, 'TX_HASH_ONLY_WHEN_EXECUTED', 'Only an executed decision may carry a txHash'],
  EscalationNeedsApprovalRef: [400, 'ESCALATION_NEEDS_APPROVAL_REF', 'An escalated decision needs an approvalRef'],
  UnknownParent: [400, 'UNKNOWN_PARENT', 'parentDecisionId does not exist'],
  ParentBusinessMismatch: [400, 'PARENT_BUSINESS_MISMATCH', 'The parent decision belongs to a different business'],
  DuplicateClientRef: [409, 'DUPLICATE_CLIENT_REF', 'This clientRef was already recorded for the business'],
  UnknownDecision: [404, 'DECISION_NOT_FOUND', 'No such decision'],
  // Payments
  NotMandateAgent: [403, 'NOT_MANDATE_AGENT', 'Only the mandate\'s agent may spend under it'],
  CheckFailed: [409, 'PAYMENT_NOT_ALLOWED', 'The mandate does not allow this payment'],
  ApprovalRequired: [409, 'APPROVAL_REQUIRED', 'This payment needs a human approval signature'],
  ApprovalExpired: [409, 'APPROVAL_EXPIRED', 'The approval signature has expired'],
  AgentCannotApprove: [400, 'AGENT_CANNOT_APPROVE', 'The agent cannot approve its own payment'],
  NotApprover: [403, 'NOT_APPROVER', 'The approval was not signed by an authorised approver'],
  InvalidSignature: [400, 'INVALID_SIGNATURE', 'The approval signature is not valid for this payment'],
};

/** Turns a contract revert into a client-safe AppError; anything unrecognised becomes an upstream error. */
export function mapRevert(err: unknown, what: string): AppError {
  if (err instanceof AppError) return err;
  const name = revertName(err);
  const known = name ? REVERTS[name] : undefined;
  if (known) return new AppError(known[2], known[0], known[1]);
  return toUpstreamError(err, what);
}
