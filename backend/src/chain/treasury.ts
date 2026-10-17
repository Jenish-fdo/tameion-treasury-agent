import { encodeAbiParameters, keccak256, zeroAddress, zeroHash, type Address, type Hex } from 'viem';

/**
 * Names and encodings for the MandateRegistry and DecisionLog contracts (Arc testnet, unaudited).
 * Mirrors contracts/src/libraries/MandateCategories.sol and the enums in the two interfaces. If a contract enum
 * changes, change it here and in web-app/src/lib/treasury.ts, and regenerate src/chain/abis with scripts/gen-abis.mjs.
 */

export const CATEGORY_BITS = {
  PAYROLL: 0,
  VENDOR_INVOICE: 1,
  TAX: 2,
  SUBSCRIPTION: 3,
  UTILITIES: 4,
  RENT: 5,
  CONTRACTOR: 6,
  REFUND: 7,
  OTHER: 8,
} as const;
export type CategoryName = keyof typeof CATEGORY_BITS;
export const CATEGORY_NAMES = Object.keys(CATEGORY_BITS) as [CategoryName, ...CategoryName[]];

export const categoryMask = (names: readonly CategoryName[]): number =>
  names.reduce((mask, n) => (mask | (1 << CATEGORY_BITS[n])) >>> 0, 0);

export const categoriesFromMask = (mask: number): CategoryName[] =>
  CATEGORY_NAMES.filter((n) => (mask & (1 << CATEGORY_BITS[n])) !== 0);

/** Enum order must match IMandateRegistry / IDecisionLog. */
export const MANDATE_STATUS = ['NONE', 'ACTIVE', 'REVOKED', 'CONSUMED', 'EXPIRED'] as const;
export const REASONS = [
  'NONE', 'UNKNOWN_MANDATE', 'REVOKED', 'CONSUMED', 'EXPIRED', 'WRONG_AGENT', 'ZERO_AMOUNT', 'CATEGORY_NOT_ALLOWED',
  'RECIPIENT_NOT_ALLOWED', 'RISK_TIER_TOO_HIGH', 'OVER_PER_TX_LIMIT', 'OVER_DAILY_CAP', 'OVER_WEEKLY_CAP', 'OVER_MONTHLY_CAP',
  'PAYMENT_ALREADY_USED',
] as const;
export const ACTIONS = ['PAYMENT', 'DELAY', 'YIELD_ALLOCATION', 'REDEMPTION', 'ESCALATION', 'REJECTION'] as const;
export const OUTCOMES = ['PROPOSED', 'EXECUTED', 'REJECTED', 'ESCALATED', 'DELAYED'] as const;

export type ActionName = (typeof ACTIONS)[number];
export type OutcomeName = (typeof OUTCOMES)[number];

export const nullIfZero = <T extends Hex | Address>(v: T): T | null => ((v as string) === zeroHash || (v as string) === zeroAddress ? null : v);

export interface RawDecision {
  decisionId: Hex; seq: bigint; timestamp: bigint; recorder: Address;
  businessId: Hex; agentId: Hex; mandateId: Hex;
  action: number; counterparty: Address; amount: bigint;
  rulesEvaluated: bigint; rulesFailed: bigint;
  riskTier: number; riskScore: number; outcome: number;
  rationaleHash: Hex; txHash: Hex; approvalRef: Hex; parentDecisionId: Hex; clientRef: Hex;
  prevHash: Hex; recordHash: Hex;
}

/**
 * The DecisionLog's record hash, computed here from the stored fields: keccak256(abi.encode(record)) with
 * recordHash zeroed. Lets the API show whether what it read still matches the rule, without trusting the RPC's
 * word for it.
 */
export function computeDecisionHash(d: RawDecision): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'uint64' }, { type: 'uint64' }, { type: 'address' },
        { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' },
        { type: 'uint8' }, { type: 'address' }, { type: 'uint128' },
        { type: 'uint64' }, { type: 'uint64' },
        { type: 'uint8' }, { type: 'uint16' }, { type: 'uint8' },
        { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' },
        { type: 'bytes32' }, { type: 'bytes32' },
      ],
      [
        d.decisionId, d.seq, d.timestamp, d.recorder,
        d.businessId, d.agentId, d.mandateId,
        d.action, d.counterparty, d.amount,
        d.rulesEvaluated, d.rulesFailed,
        d.riskTier, d.riskScore, d.outcome,
        d.rationaleHash, d.txHash, d.approvalRef, d.parentDecisionId, d.clientRef,
        d.prevHash, zeroHash,
      ],
    ),
  );
}
