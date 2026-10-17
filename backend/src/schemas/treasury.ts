import { keccak256, toBytes, zeroAddress } from 'viem';
import { z } from 'zod';
import { ACTIONS, CATEGORY_NAMES, OUTCOMES, categoryMask } from '../chain/treasury.js';
import { MAX_EXPIRY, addressSchema, bytes32Schema } from './api.js';

const MAX_UINT128 = (1n << 128n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;

/** USDC in 6-decimal base units, as a decimal string (never a float). */
const baseUnits = z
  .string()
  .regex(/^\d{1,39}$/, 'must be a base-10 integer string in USDC base units (6 decimals)')
  .transform((v) => BigInt(v))
  .refine((v) => v <= MAX_UINT128, 'is larger than a uint128');
const positiveBaseUnits = baseUnits.refine((v) => v > 0n, 'must be greater than zero');

const uint64String = z
  .union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative()])
  .transform((v) => BigInt(v))
  .refine((v) => v <= MAX_UINT64, 'is larger than a uint64');

/** A 0x…64-hex value is used as given; free text (1 to 128 chars) is hashed with keccak256. */
export const refSchema = z
  .string()
  .min(1)
  .max(128)
  .transform((v) => (/^0x[0-9a-fA-F]{64}$/.test(v) ? (v.toLowerCase() as `0x${string}`) : keccak256(toBytes(v))));

const riskTier = z.number().int().min(0).max(3);

export const createBusinessSchema = z
  .object({ owner: addressSchema, salt: refSchema.optional(), metadata: refSchema.optional() })
  .strict();

export const createMandateSchema = z
  .object({
    businessId: bytes32Schema,
    agent: addressSchema,
    agentId: refSchema,
    categories: z.array(z.enum(CATEGORY_NAMES)).min(1).max(CATEGORY_NAMES.length),
    perTxLimit: positiveBaseUnits,
    dailyCap: positiveBaseUnits,
    weeklyCap: positiveBaseUnits,
    monthlyCap: positiveBaseUnits,
    // Payments at or above this need a human approval signature. "0" = every payment.
    approvalThreshold: baseUnits,
    maxRiskTier: z.number().int().min(0).max(2),
    singleUse: z.boolean().default(false),
    expiresAt: z.number().int().positive().max(MAX_EXPIRY),
    recipients: z.array(addressSchema).max(100).default([]),
  })
  .strict()
  .refine((m) => m.perTxLimit <= m.dailyCap && m.dailyCap <= m.weeklyCap && m.weeklyCap <= m.monthlyCap, {
    message: 'limits must satisfy perTxLimit <= dailyCap <= weeklyCap <= monthlyCap',
    path: ['perTxLimit'],
  })
  .transform((m) => ({ ...m, allowedCategories: categoryMask([...new Set(m.categories)]) }));

export const revokeMandateSchema = z.object({ reason: refSchema.optional() }).strict();

export const validatePaymentSchema = z
  .object({
    agent: addressSchema,
    recipient: addressSchema,
    amount: baseUnits,
    category: z.enum(CATEGORY_NAMES),
    riskTier,
    paymentId: refSchema,
  })
  .strict();

/** An agent's request to pay: the API validates it against the mandate, sends the USDC and logs the decision. */
export const payMandateSchema = z
  .object({
    recipient: addressSchema,
    amount: positiveBaseUnits,
    category: z.enum(CATEGORY_NAMES),
    riskTier: riskTier.default(0),
    riskScore: z.number().int().min(0).max(10_000).default(0),
    // Unique per payment (replay guard and idempotency key). Generated when omitted.
    paymentId: refSchema.optional(),
    // Why the agent decided to pay. Hashed into the decision log; the text itself stays off-chain.
    rationale: z.string().min(1).max(2000),
    // The ESCALATED decision this payment resolves (links the executed record to it so it leaves the pending list).
    escalationId: bytes32Schema.optional(),
    // Required when the amount reaches the mandate's approval threshold.
    approval: z
      .object({ approver: addressSchema, deadline: z.number().int().positive(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) })
      .strict()
      .optional(),
  })
  .strict();

export const createDecisionSchema = z
  .object({
    businessId: bytes32Schema,
    agentId: refSchema,
    mandateId: bytes32Schema.optional(),
    action: z.enum(ACTIONS),
    counterparty: addressSchema.default(zeroAddress),
    amount: baseUnits.default('0'),
    rulesEvaluated: uint64String.default(0),
    rulesFailed: uint64String.default(0),
    riskTier,
    riskScore: z.number().int().min(0).max(10_000),
    outcome: z.enum(OUTCOMES),
    // The hash of the rationale; the rationale itself must stay off-chain, so plain text is not accepted here.
    rationaleHash: bytes32Schema,
    txHash: bytes32Schema.optional(),
    approvalRef: refSchema.optional(),
    parentDecisionId: bytes32Schema.optional(),
    clientRef: refSchema.optional(),
  })
  .strict();

const page = {
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

export const listMandatesQuerySchema = z
  .object({ businessId: bytes32Schema.optional(), agent: addressSchema.optional(), ...page })
  .refine((q) => Boolean(q.businessId) !== Boolean(q.agent), { message: 'give exactly one of businessId or agent', path: ['businessId'] });

export const listDecisionsQuerySchema = z
  .object({ businessId: bytes32Schema.optional(), agentId: refSchema.optional(), mandateId: bytes32Schema.optional(), ...page })
  .refine((q) => [q.businessId, q.agentId, q.mandateId].filter(Boolean).length === 1, {
    message: 'give exactly one of businessId, agentId or mandateId',
    path: ['businessId'],
  });

export const pendingApprovalsQuerySchema = z.object({ businessId: bytes32Schema }).strict();

export const mandateIdParamSchema = z.object({ mandateId: bytes32Schema });
export const decisionIdParamSchema = z.object({ decisionId: bytes32Schema });
export const businessIdParamSchema = z.object({ businessId: bytes32Schema });

export type CreateBusinessBody = z.infer<typeof createBusinessSchema>;
export type CreateMandateBody = z.infer<typeof createMandateSchema>;
export type ValidatePaymentBody = z.infer<typeof validatePaymentSchema>;
export type PayMandateBody = z.infer<typeof payMandateSchema>;
export type CreateDecisionBody = z.infer<typeof createDecisionSchema>;
