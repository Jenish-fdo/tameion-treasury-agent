import { randomBytes } from 'node:crypto';
import { keccak256, toBytes, zeroAddress, type Address, type Hex } from 'viem';
import { mandateRegistryAbi } from '../chain/abis/mandateRegistry.js';
import { USDC_ADDRESS } from '../chain/arc.js';
import { getAgentAccount, publicClient, requireMandateRegistry } from '../chain/clients.js';
import { CATEGORY_BITS, REASONS } from '../chain/treasury.js';
import { usdcAbi } from '../chain/usdc.js';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';
import type { PayMandateBody } from '../schemas/treasury.js';
import { logger } from '../utils/logger.js';
import { DecisionService } from './decisionService.js';
import { MandateService, type MandateView } from './mandateService.js';
import { sendTx } from './treasuryTx.js';

/**
 * The rule checks the registry runs, as bit positions in a decision's rulesEvaluated / rulesFailed. The order is part
 * of the log's meaning: change it and old records read differently.
 */
export const RULES = [
  'MANDATE_ACTIVE', 'AGENT_MATCHES', 'CATEGORY_ALLOWED', 'RECIPIENT_ALLOWED', 'RISK_TIER_WITHIN_MANDATE', 'PER_TX_LIMIT',
  'PAYMENT_NOT_REPLAYED', 'DAILY_CAP', 'WEEKLY_CAP', 'MONTHLY_CAP', 'HUMAN_APPROVAL_IF_REQUIRED',
] as const;
const ALL_RULES = (1n << BigInt(RULES.length)) - 1n;
const bit = (rule: (typeof RULES)[number]): bigint => 1n << BigInt(RULES.indexOf(rule));

const REASON_TO_RULE: Record<string, (typeof RULES)[number]> = {
  UNKNOWN_MANDATE: 'MANDATE_ACTIVE', REVOKED: 'MANDATE_ACTIVE', CONSUMED: 'MANDATE_ACTIVE', EXPIRED: 'MANDATE_ACTIVE',
  WRONG_AGENT: 'AGENT_MATCHES', ZERO_AMOUNT: 'PER_TX_LIMIT', CATEGORY_NOT_ALLOWED: 'CATEGORY_ALLOWED',
  RECIPIENT_NOT_ALLOWED: 'RECIPIENT_ALLOWED', RISK_TIER_TOO_HIGH: 'RISK_TIER_WITHIN_MANDATE', OVER_PER_TX_LIMIT: 'PER_TX_LIMIT',
  PAYMENT_ALREADY_USED: 'PAYMENT_NOT_REPLAYED', OVER_DAILY_CAP: 'DAILY_CAP', OVER_WEEKLY_CAP: 'WEEKLY_CAP', OVER_MONTHLY_CAP: 'MONTHLY_CAP',
};

const explorerTx = (hash: Hex): string => `${config.chain.explorerUrl.replace(/\/$/, '')}/tx/${hash}`;

/**
 * An agent's payment, end to end (TESTNET DEMO: the API holds the agent wallet's key):
 *   1. ask the registry whether the mandate allows it (read-only);
 *   2. refused  -> log a REJECTION; needs a human -> log an ESCALATION and stop; allowed -> continue;
 *   3. check the wallet can cover it, then `consume` on the registry (counts the spend, verifies any approval);
 *   4. send the USDC to the allowed recipient;
 *   5. log the PAYMENT as EXECUTED with the transfer's hash.
 * The registry stays a policy ledger: it cannot move the money, so step 4 is this service's job. If the transfer fails
 * after `consume`, the spend is already counted and the failure is logged as a PROPOSED payment without a hash.
 */
export class PaymentService {
  static async pay(mandateId: Hex, body: PayMandateBody) {
    const registry = requireMandateRegistry();
    const mandate = await MandateService.get(mandateId);
    const agent = getAgentAccount(mandate.agent);
    if (!agent) throw new AppError("The API holds no wallet key for this mandate's agent (testnet demo agents only)", 403, 'AGENT_NOT_MANAGED');

    const paymentId = body.paymentId ?? (`0x${randomBytes(32).toString('hex')}` as Hex);
    const rationaleHash = keccak256(toBytes(body.rationale));
    const check = await MandateService.validate(mandateId, {
      agent: agent.address, recipient: body.recipient, amount: body.amount, category: body.category, riskTier: body.riskTier, paymentId,
    });

    const base = {
      businessId: mandate.businessId, agentId: mandate.agentId, mandateId, counterparty: body.recipient, amount: body.amount,
      riskTier: body.riskTier, riskScore: body.riskScore, rationaleHash, rulesEvaluated: ALL_RULES,
    };

    if (!check.allowed) {
      const failed = bit(REASON_TO_RULE[check.reason] ?? 'MANDATE_ACTIVE');
      const logged = await DecisionService.record({ ...base, action: 'REJECTION', outcome: 'REJECTED', rulesFailed: failed }, agent);
      return { status: 'rejected' as const, reason: check.reason, remaining: check.remaining, paymentId, decision: logged.decision, decisionId: logged.decisionId };
    }

    if (check.needsApproval && !body.approval) {
      const logged = await DecisionService.record(
        { ...base, action: 'ESCALATION', outcome: 'ESCALATED', rulesFailed: bit('HUMAN_APPROVAL_IF_REQUIRED'), approvalRef: paymentId }, agent,
      );
      return {
        status: 'escalated' as const, reason: 'APPROVAL_REQUIRED', paymentId, decisionId: logged.decisionId, decision: logged.decision,
        next: 'Have an authorised approver sign the PaymentApproval, then call pay again with the same paymentId, the approval and escalationId.',
      };
    }

    const balance = (await publicClient.readContract({ address: USDC_ADDRESS, abi: usdcAbi, functionName: 'balanceOf', args: [agent.address] })) as bigint;
    if (balance < body.amount) {
      throw new AppError('The agent wallet does not hold enough USDC for this payment', 409, 'INSUFFICIENT_FUNDS', { agentWallet: agent.address, balance: balance.toString(), needed: body.amount.toString() });
    }

    const approval = body.approval
      ? { approver: body.approval.approver, deadline: BigInt(body.approval.deadline), signature: body.approval.signature as Hex }
      : { approver: zeroAddress as Address, deadline: 0n, signature: '0x' as Hex };
    const request = { recipient: body.recipient, amount: body.amount, category: CATEGORY_BITS[body.category], riskTier: body.riskTier, paymentId };
    const consumed = await sendTx(agent, { address: registry, abi: mandateRegistryAbi, functionName: 'consume', args: [mandateId, request, approval] }, 'recording the spend');
    if (consumed.status !== 'confirmed') {
      return { status: 'pending' as const, paymentId, consumeTxHash: consumed.txHash, note: 'The spend is not confirmed yet; nothing was sent.' };
    }

    let transfer;
    try {
      transfer = await sendTx(agent, { address: USDC_ADDRESS, abi: usdcAbi, functionName: 'transfer', args: [body.recipient, body.amount] }, 'sending the USDC');
    } catch (err) {
      logger.error(`USDC transfer failed after consume for mandate ${mandateId}`);
      const logged = await DecisionService.record({ ...base, action: 'PAYMENT', outcome: 'PROPOSED', rulesFailed: 0n, clientRef: undefined }, agent).catch(() => null);
      throw new AppError('The spend was recorded but the USDC transfer failed; the failure is in the decision log', 502, 'TRANSFER_FAILED_AFTER_CONSUME', {
        consumeTxHash: consumed.txHash, decisionId: logged?.decisionId ?? null, cause: err instanceof AppError ? err.code : 'UNKNOWN',
      });
    }
    if (transfer.status !== 'confirmed') {
      return { status: 'pending' as const, paymentId, consumeTxHash: consumed.txHash, transferTxHash: transfer.txHash, note: 'The transfer is not confirmed yet; it is not logged as executed.' };
    }

    const logged = await DecisionService.record(
      {
        ...base, action: 'PAYMENT', outcome: 'EXECUTED', rulesFailed: 0n, txHash: transfer.txHash, clientRef: paymentId,
        approvalRef: body.approval ? keccak256(body.approval.signature as Hex) : undefined, parentDecisionId: body.escalationId,
      },
      agent,
    );
    const after: MandateView = await MandateService.get(mandateId);
    return {
      status: 'executed' as const, paymentId, amount: body.amount.toString(), recipient: body.recipient, agentWallet: agent.address,
      consumeTxHash: consumed.txHash, transferTxHash: transfer.txHash, explorerUrl: explorerTx(transfer.txHash),
      decisionId: logged.decisionId, decision: logged.decision, spend: after.spend, rationaleHash, usdcContract: USDC_ADDRESS,
    };
  }
}
