// Independent EIP-712 test vectors for MandateRegistry, computed with viem (not with the contract's own code).
// contracts/test/Eip712Vectors.t.sol hard-codes the output and checks the deployed contract accepts signatures
// over exactly these digests. Run: node backend/scripts/eip712-vectors.mjs
// The keys below are public test constants (0xA11CE, 0xB0B). They never hold funds.
import { encodeAbiParameters, hashTypedData, keccak256, toHex, pad } from "viem";
import { privateKeyToAddress } from "viem/accounts";

const REGISTRY = "0x00000000000000000000000000000000000c0de1";
const CHAIN_ID = 5042002;
const NOW = 1_800_000_000n;
const USDC = 1_000_000n;

const ownerPk = pad("0xa11ce", { size: 32 });
const approverPk = pad("0xb0b", { size: 32 });
const owner = privateKeyToAddress(ownerPk);
const approver = privateKeyToAddress(approverPk);
const agent = "0x00000000000000000000000000000000000a93e7";
const vendor = "0x00000000000000000000000000000000007e4d02";

const salt = keccak256(toHex("acme"));
const agentId = keccak256(toHex("agent-1"));
const reason = keccak256(toHex("compromised"));
const paymentId = keccak256(toHex("pay-1"));

const businessId = keccak256(
  encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "bytes32" }], [REGISTRY, owner, salt]),
);
const mandateIdFor = (nonce) =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint256" }], [businessId, owner, nonce]));

const domain = { name: "Credentia Mandates", version: "1", chainId: CHAIN_ID, verifyingContract: REGISTRY };

const mandateMessage = {
  businessId,
  agent,
  agentId,
  allowedCategories: 3, // bit 0 (payroll) | bit 1 (vendor invoice)
  perTxLimit: 1000n * USDC,
  dailyCap: 2000n * USDC,
  weeklyCap: 5000n * USDC,
  monthlyCap: 10000n * USDC,
  approvalThreshold: 500n * USDC,
  maxRiskTier: 1,
  singleUse: false,
  expiresAt: NOW + 30n * 86400n,
  nonce: 7n,
  recipients: [vendor],
  deadline: NOW + 3600n,
};

const mandateDigest = hashTypedData({
  domain,
  primaryType: "Mandate",
  types: {
    Mandate: [
      { name: "businessId", type: "bytes32" },
      { name: "agent", type: "address" },
      { name: "agentId", type: "bytes32" },
      { name: "allowedCategories", type: "uint32" },
      { name: "perTxLimit", type: "uint128" },
      { name: "dailyCap", type: "uint128" },
      { name: "weeklyCap", type: "uint128" },
      { name: "monthlyCap", type: "uint128" },
      { name: "approvalThreshold", type: "uint128" },
      { name: "maxRiskTier", type: "uint8" },
      { name: "singleUse", type: "bool" },
      { name: "expiresAt", type: "uint64" },
      { name: "nonce", type: "uint256" },
      { name: "recipients", type: "address[]" },
      { name: "deadline", type: "uint64" },
    ],
  },
  message: mandateMessage,
});

const revokeMandateId = mandateIdFor(9n);
const revokeDigest = hashTypedData({
  domain,
  primaryType: "RevokeMandate",
  types: {
    RevokeMandate: [
      { name: "mandateId", type: "bytes32" },
      { name: "reason", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
  },
  message: { mandateId: revokeMandateId, reason, nonce: 10n, deadline: NOW + 3600n },
});

const approvalMandateId = mandateIdFor(7n);
const approvalDigest = hashTypedData({
  domain,
  primaryType: "PaymentApproval",
  types: {
    PaymentApproval: [
      { name: "mandateId", type: "bytes32" },
      { name: "paymentId", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint128" },
      { name: "deadline", type: "uint64" },
    ],
  },
  message: { mandateId: approvalMandateId, paymentId, recipient: vendor, amount: 600n * USDC, deadline: NOW + 3600n },
});

console.log(
  JSON.stringify(
    { registry: REGISTRY, chainId: CHAIN_ID, owner, approver, businessId, mandateId_nonce7: approvalMandateId, mandateId_nonce9: revokeMandateId, mandateDigest, revokeDigest, approvalDigest },
    null,
    2,
  ),
);
