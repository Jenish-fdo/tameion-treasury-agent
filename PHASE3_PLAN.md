# PHASE3_PLAN.md — MandateRegistry and DecisionLog (Arc testnet)

Status: **plan, written before any Phase 3 code.** Everything here is for **Arc testnet only**. Nothing is deployed, nothing is audited, and nothing in this phase claims mainnet readiness. **No deployment of any kind happens without your explicit approval** (see §9).

## 1. Scope and what the contracts do (and do not) do

Two new contracts, plus fixes to the existing `CredentialRegistry`.

- **MandateRegistry**: a policy ledger. A business owner grants one AI agent a scoped, expiring, revocable *mandate*. The agent calls `consume` before each payment; the contract checks the mandate and updates spend counters.
- **DecisionLog**: an append-only, hash-chained record of every proposed or executed treasury action.

**Neither contract holds or moves funds.** `consume` is an authorization-and-accounting step: it does not transfer USDC. A compromised agent key can still send USDC from its own wallet without calling `consume`. What the contracts give you is (a) a public, replayable statement of what the agent was allowed to do, (b) enforcement of that statement *for anyone who routes payments through `consume`*, and (c) a tamper-evident history. Making the wallet itself refuse out-of-policy payments is a later phase (Circle wallet policy / a policy-enforcing smart account) and is out of scope here.

The decision log proves **who wrote what, and when**. It does not prove that a transfer happened; `txHash` is a claim that anyone can check against Arc.

### Arc facts that shape the design (Circle docs, checked 2026-10-17)
- Baseline is the **Osaka** hardfork, so modern opcodes are available. We still do not use transient storage or any exotic opcode.
- **Block timestamps are non-decreasing, not strictly increasing** (1 s granularity). Therefore ordering inside the log uses a **per-business sequence number**, never the timestamp.
- Transactions **finalize on inclusion**; a single confirmation is enough for off-chain systems.
- Standard `anvil` does **not** reproduce Arc behaviour (docs recommend `arc-anvil --network arc`). Our Foundry and Anvil tests therefore prove contract logic, not Arc-specific behaviour. A pass on Arc testnet is a separate, post-approval step.
- Amounts use the **ERC-20 USDC interface: 6 decimals**. Native USDC (gas) has 18. Every amount in these contracts is a `uint128` of 6-decimal base units.
- Transactions with `maxFeePerGas` below 20 gwei are silently dropped by Arc's mempool. The backend must not hard-code a lower fee.

## 2. Contract interfaces

Solidity `^0.8.24` (OpenZeppelin 5.7.0 `SignatureChecker` needs it). OpenZeppelin: `EIP712`, `SignatureChecker` (EOA and ERC-1271, so Circle smart-account owners work), `ECDSA`.

### 2.1 `IMandateRegistry`

```solidity
enum MandateStatus { None, Active, Revoked, Consumed, Expired }
enum Reason {                       // why a check failed; None == allowed
    None, UnknownMandate, Revoked, Consumed, Expired, WrongAgent, ZeroAmount,
    CategoryNotAllowed, RecipientNotAllowed, RiskTierTooHigh,
    OverPerTxLimit, OverDailyCap, OverWeeklyCap, OverMonthlyCap, PaymentAlreadyUsed
}

struct MandateParams {
    bytes32 businessId;
    address agent;              // the only address that may call consume()
    bytes32 agentId;            // logical agent id; must match DecisionLog records
    uint32  allowedCategories;  // bitmask, see Categories below; must be non-zero
    uint128 perTxLimit;         // USDC, 6 decimals
    uint128 dailyCap;
    uint128 weeklyCap;
    uint128 monthlyCap;
    uint128 approvalThreshold;  // amount >= this needs a human approval signature; 0 = always
    uint8   maxRiskTier;        // highest risk tier the agent may act under, 0..2 (Critical=3 is never allowed)
    bool    singleUse;          // mandate is spent after one successful consume
    uint64  expiresAt;          // unix seconds
    uint256 nonce;              // chosen by the signer, unordered, unique per signer
    address[] recipients;       // initial allowlist (deny by default)
}

struct PaymentRequest {
    address recipient;
    uint128 amount;
    uint8   category;           // 0..31
    uint8   riskTier;           // as assessed by the agent's risk engine, 0..3
    bytes32 paymentId;          // unique per payment; replay guard
}

struct Approval {               // only read when amount >= approvalThreshold
    address approver;           // business owner or an authorised approver, never the agent
    uint64  deadline;
    bytes   signature;          // EIP-712 PaymentApproval, EOA or ERC-1271
}

struct CheckResult {
    bool allowed;
    bool needsApproval;
    Reason reason;
    uint128 dailyRemaining; uint128 weeklyRemaining; uint128 monthlyRemaining;
}

// --- businesses (the principal that owns mandates)
function registerBusiness(bytes32 salt, bytes32 metadataHash) external returns (bytes32 businessId);
function proposeBusinessOwner(bytes32 businessId, address newOwner) external;   // owner only
function acceptBusinessOwner(bytes32 businessId) external;                      // pending owner only
function setRecorder(bytes32 businessId, address who, bool allowed) external;   // owner only
function setApprover(bytes32 businessId, address who, bool allowed) external;   // owner only

// --- mandates
function createMandate(MandateParams calldata p) external returns (bytes32 mandateId);          // msg.sender == owner
function createMandateWithSig(MandateParams calldata p, uint64 deadline, bytes calldata sig)
    external returns (bytes32 mandateId);                                                       // anyone relays an owner signature
function revokeMandate(bytes32 mandateId, bytes32 reason) external;                             // owner only, immediate
function revokeMandateWithSig(bytes32 mandateId, bytes32 reason, uint256 nonce, uint64 deadline, bytes calldata sig) external;
function setRecipient(bytes32 mandateId, address recipient, bool allowed) external;             // owner only
function cancelNonce(uint256 nonce) external;                                                   // kill a signed-but-unsubmitted request
function markExpired(bytes32 mandateId) external;                                               // permissionless, emits MandateExpired

// --- use
function validate(bytes32 mandateId, address agent, PaymentRequest calldata req)
    external view returns (CheckResult memory);                                                 // no state change
function consume(bytes32 mandateId, PaymentRequest calldata req, Approval calldata approval) external;  // msg.sender == mandate.agent

// --- views
function getMandate(bytes32 mandateId) external view returns (Mandate memory);
function getBusiness(bytes32 businessId) external view returns (address owner, address pendingOwner, bytes32 metadataHash, uint64 createdAt);
function isRecipientAllowed(bytes32 mandateId, address recipient) external view returns (bool);
function isRecorder(bytes32 businessId, address who) external view returns (bool);               // owner counts as recorder
function isApprover(bytes32 businessId, address who) external view returns (bool);               // owner counts as approver
function getSpend(bytes32 mandateId) external view returns (uint128 day, uint128 week, uint128 month);   // current-window spend
function mandateCountByBusiness(bytes32) external view returns (uint256);
function mandateIdsByBusiness(bytes32 businessId, uint256 offset, uint256 limit) external view returns (bytes32[] memory);
function mandateIdsByAgent(address agent, uint256 offset, uint256 limit) external view returns (bytes32[] memory);
```

`Categories` (bit positions, `uint32` mask; the set is a library constant so the frontend and backend share it): `0 PAYROLL, 1 VENDOR_INVOICE, 2 TAX, 3 SUBSCRIPTION, 4 UTILITIES, 5 RENT, 6 CONTRACTOR, 7 REFUND, 8 OTHER`; bits 9..31 reserved.

Events: `BusinessRegistered`, `BusinessOwnerProposed`, `BusinessOwnerTransferred`, `RecorderSet`, `ApproverSet`, `MandateCreated` (ids, owner, expiry, singleUse), `MandateLimitsSet` (limits, categories, risk tier, threshold), `RecipientSet`, `MandateRevoked`, `MandateExpired`, `MandateUsed` (mandate, agent, paymentId, recipient, amount, category, risk tier, approver), `MandateConsumed` (single-use finished), `NonceCancelled`.

### 2.2 `IDecisionLog`

```solidity
enum ActionType { Payment, Delay, YieldAllocation, Redemption, Escalation, Rejection }
enum Outcome    { Proposed, Executed, Rejected, Escalated, Delayed }

struct DecisionInput {
    bytes32 businessId;  bytes32 agentId;  bytes32 mandateId;      // mandateId may be 0 (e.g. a rejection with no usable mandate)
    ActionType action;   address counterparty;  uint128 amount;
    uint64  rulesEvaluated;  uint64 rulesFailed;                    // bitmaps of policy rule ids (ids defined off-chain, see docs)
    uint8   riskTier;    uint16 riskScore;                          // tier 0..3, score 0..10000 (basis points)
    Outcome outcome;     bytes32 rationaleHash;                     // hash only; the rationale stays off-chain
    bytes32 txHash;                                                 // required iff outcome == Executed
    bytes32 approvalRef;                                            // required iff Escalated / Escalation
    bytes32 parentDecisionId;                                       // links an Executed/Rejected record to its Proposed/Escalated one
    bytes32 clientRef;                                              // idempotency key, unique per business
}
struct Decision {  // what is stored
    bytes32 decisionId;  uint64 seq;  uint64 timestamp;  address recorder;
    /* ...every DecisionInput field... */
    bytes32 prevHash;    bytes32 recordHash;
}

function recordDecision(DecisionInput calldata d) external returns (bytes32 decisionId);
function getDecision(bytes32 decisionId) external view returns (Decision memory);
function verifyRecord(bytes32 decisionId) external view returns (bool);                       // recomputes the hash
function chainHead(bytes32 businessId) external view returns (bytes32 headHash, uint64 count);
function firstFollowUp(bytes32 decisionId) external view returns (bytes32);                   // 0 until a child record exists
function decisionIdByClientRef(bytes32 businessId, bytes32 clientRef) external view returns (bytes32);
function countByBusiness(bytes32) / countByAgent(bytes32) / countByMandate(bytes32) external view returns (uint256);
function getDecisionsByBusiness(bytes32 businessId, uint256 offset, uint256 limit) external view returns (Decision[] memory);
function getDecisionsByAgent(bytes32 agentId, uint256 offset, uint256 limit) external view returns (Decision[] memory);
function getDecisionsByMandate(bytes32 mandateId, uint256 offset, uint256 limit) external view returns (Decision[] memory);
```

Event: `DecisionRecorded(decisionId indexed, businessId indexed, agentId indexed, mandateId, action, outcome, counterparty, amount, riskTier, riskScore, recordHash, prevHash, seq)`.

**There is no function that updates or deletes a record.** There is no owner, no proxy, no `delegatecall`, no `selfdestruct`.

## 3. Storage layout

### MandateRegistry
| Slot (mapping) | Meaning |
|---|---|
| `businesses[businessId]` | `Business { address owner; address pendingOwner; bytes32 metadataHash; uint64 createdAt }` |
| `recorders[businessId][addr]`, `approvers[businessId][addr]` | role flags set only by the business owner |
| `mandates[mandateId]` | `Mandate`: `agent, expiresAt, maxRiskTier, status, singleUse` packed in one slot; then `businessId`, `agentId`, `allowedCategories+createdAt+nonce` and the six `uint128` limits packed in pairs |
| `allowedRecipients[mandateId][addr]` | recipient allowlist (deny by default) |
| `spend[mandateId]` | `Spend { uint32 dayId, weekId, monthId; uint128 daySpent, weekSpent, monthSpent }` |
| `nonceUsed[signer][nonce]` | **unordered per-signer nonces** (the M-1 fix) |
| `paymentUsed[keccak256(mandateId, paymentId)]` | each payment id can be consumed once |
| `mandatesByBusiness[businessId]`, `mandatesByAgent[agent]` | enumeration |

IDs: `businessId = keccak256(abi.encode(address(this), msg.sender, salt))` (derived from the registrant, so nobody can squat an id). `mandateId = keccak256(abi.encode(businessId, signer, nonce))`.

Spend windows are **fixed buckets**: `dayId = ts / 1 days`, `weekId = ts / 7 days`, `monthId = ts / 30 days` (30-day buckets, not calendar months). **Known limitation:** an agent can spend a full cap at the end of one bucket and another full cap at the start of the next, so worst-case spend across a boundary is 2x the cap. The per-transaction limit is unaffected. Rolling windows are a later improvement.

### DecisionLog
`decisions[decisionId]` (full struct), `idsByBusiness / idsByAgent / idsByMandate` arrays, `headOf[businessId]` (last `recordHash`), `countOf[businessId]`, `firstChild[parentId]`, `byClientRef[businessId][clientRef]`.
`decisionId = keccak256(abi.encode(address(this), businessId, seq))` where `seq` is the business's running count (contract-assigned, so ids cannot be chosen or collided). `recordHash = keccak256(abi.encode(<all fields>, prevHash))` with `prevHash` = the business's previous `recordHash` (zero for the first).

## 4. Access-control model

**There is no global admin, owner, pause switch or upgrade path in either contract.** The only powers are per-business and explicit:

| Actor | Can | Cannot |
|---|---|---|
| Business owner | register the business; create/revoke mandates; add/remove allowlisted recipients; set recorders and approvers; propose a new owner (two-step) | consume a mandate (unless it is also the agent address; creation rejects `agent == owner`) |
| Agent (`mandate.agent`) | `consume` its own mandate; record decisions that reference its own mandate | use another business's mandate; change any mandate; approve its own payments |
| Recorder / relayer | record decisions for its business | consume mandates; change mandates |
| Approver | sign `PaymentApproval` for its business's mandates | be the agent of the mandate being approved |
| Anyone | relay a valid owner signature; call `markExpired`; read everything | anything else |

Replay and signature rules:
- Every signed message uses the EIP-712 domain (`name`, `version`, `chainId`, `verifyingContract`), so signatures cannot be replayed across chains or contracts.
- **M-1 fix:** nonces are **per signer and unordered**, the nonce is part of the signed data, it is checked after the signature is verified, and `cancelNonce` lets a signer void a signed-but-unsubmitted request.
- **M-2 fix:** one shared expiry validator is used by *every* creation path (direct and signed): `expiresAt` must be in the future and at most 365 days out. Signed requests also carry their own `deadline`.
- Signature checks use `SignatureChecker` so the owner and approvers can be EOAs or ERC-1271 smart accounts.
- A payment id can be consumed once per mandate; the approval signature binds mandate, payment id, recipient, amount and deadline.
- A mandate is not a bearer token: `consume` requires `msg.sender == mandate.agent`.

### Fixes to the existing `CredentialRegistry` (same review)
- **M-1:** replace the per-holder sequential nonce with per-signer unordered `nonceUsed`, bind `request.nonce` into the check, add `cancelNonce`.
- **M-2:** shared expiry validator for the direct and signed paths.
- **M-7:** `Ownable2Step`; `renounceOwnership` reverts.
- Consequence: the backend's `CredentialService.mint` stops reading `nonces(holder)` and picks a fresh random nonce. Existing tests are updated and extended.

## 5. API routes (backend, `/api/v1`, API-key protected like the rest)

Custody note: for this testnet build the backend holds **managed business-owner keys** (`BUSINESS_OWNER_PRIVATE_KEYS`) exactly like it already holds managed issuer keys, and a relayer key that pays gas and is registered as a business *recorder*. This is a **testnet demo shortcut**: real owners will sign in their own Circle wallet (Phases 5/6). No key is ever stored in the repo; all come from the runtime environment.

| Route | Purpose |
|---|---|
| `GET /businesses/owners` | addresses of the managed demo owners (never keys) |
| `POST /businesses` | register a business with a managed owner and authorise the relayer as recorder |
| `GET /businesses/:businessId` | owner, metadata hash, recorder/approver flags for the relayer |
| `POST /mandates` | create a mandate (managed owner); body = `MandateParams` in human units (USDC decimals as strings) |
| `GET /mandates?businessId=&agent=&offset=&limit=` | list mandates with status |
| `GET /mandates/:mandateId` | details, status, current-window spend, allowlist |
| `POST /mandates/:mandateId/revoke` | revoke (managed owner) |
| `POST /mandates/:mandateId/validate` | read-only check of a proposed payment (agent, recipient, amount, category, risk tier, payment id); returns `allowed`, `needsApproval`, `reason`, remaining caps |
| `POST /decisions` | write a decision record through the relayer |
| `GET /decisions/:decisionId` | one record, plus `verified` (hash recomputed) |
| `GET /decisions?businessId=\|agentId=\|mandateId=&offset=&limit=` | list records |
| `GET /approvals/pending?businessId=` | `Escalated` records with no follow-up record |

Validation: zod on every body and param (address, bytes32, bounded amounts as decimal strings, bounded arrays); errors use the existing sanitised error envelope. Amount fields cross the API as decimal strings in USDC base units (6 decimals) to avoid float errors.

Web: a same-origin proxy `/api/backend/[...path]` forwards an allow-list of these routes to the backend so the API key never reaches the browser.

## 6. Frontend (minimal)

- `/founder/mandates`: create a mandate; list mandates; revoke.
- `/founder/decisions`: pending approvals and the decision log for a business (read-only; **approving is not built**: it needs a signing wallet, Phase 5/6).
- `/agent/validate`: an agent (or its operator) checks a mandate against a proposed payment before proposing it.
Each page carries an "Arc testnet, managed demo keys, not audited" banner.

## 7. Test plan

Foundry (`contracts/test`):
- **CredentialRegistry (updated):** nonce reuse, cancel, nonce bound to data, signed path rejects expired credentials (M-2), `Ownable2Step`, `renounceOwnership` reverts.
- **MandateRegistry:** creation (fields, events, every validation failure); expiry (exact-boundary, `markExpired`, validate/consume after expiry); revocation (immediate, non-owner, double revoke, consume after revoke, signed revoke + replay); nonce replay (same signature twice, cancelled nonce, tampered params, wrong signer, ERC-1271 owner); single-use; unauthorized agent (other agent, other business's agent, recorder cannot consume); caps (per-tx, daily, weekly, monthly, exact-cap boundary, window rollover with `vm.warp`, fuzz that cumulative spend never exceeds a cap); recipient allowlist (deny by default, add/remove, owner-only); category and risk-tier enforcement; human approval (below/at/above threshold, owner and approver signatures, stranger, agent self-approval, wrong amount/recipient, expired deadline, payment id replay); `validate`/`consume` parity (fuzz); business ownership (two-step, id derivation).
- **DecisionLog:** recording by agent / recorder / owner; every unauthorized path (stranger, other business's agent, mandate-business mismatch, agent-id mismatch); input rules (`txHash` iff executed, `approvalRef` for escalations, tier/score bounds); **immutability** (earlier records unchanged after later writes, no update/delete selectors exist, hash chain verifies, tampering detected by `verifyRecord` on a mutated copy); idempotent `clientRef`; parent links and `firstFollowUp`; retrieval by business/agent/mandate/id with pagination and out-of-range offsets; fuzz that a random sequence of records always verifies end to end.

Backend: zod schema unit tests; e2e against a local Anvil chain (deploy both contracts, then the full route set including a revoked mandate, a rejected validate, an over-cap validate, decision write/read, pending approvals, auth failures).
Web: component tests with a mocked backend for the three pages, and for the proxy route (allow-list, method limits, key not leaked).
All existing suites must stay green: Foundry, backend jest, backend e2e, web jest, `tsc`, `next build`.

## 8. Known limitations (stated up front)
- Fixed-bucket spend windows (2x cap across a boundary).
- Neither contract can stop a payment made outside `consume`; the log cannot prove a transfer happened.
- Risk tier and score are supplied by the caller; the contract bounds-checks them but cannot verify the assessment.
- Managed owner keys in the backend are a testnet demo shortcut, not custody for real funds.
- Tests run on standard Foundry/Anvil, which does not reproduce Arc specifics (native-USDC transfer reverts, blocklist behaviour). Not exercised.
- Full-struct storage in `DecisionLog` costs roughly a dozen storage slots per record. Acceptable on testnet; the cheaper variant (hash + event only) is a later option.
- Unaudited. Arc testnet only.

## 9. Gate
Implementation proceeds on this plan. **I will not deploy to any network, and will not send any transaction to Arc testnet or mainnet, until you approve a deployment.** Local Foundry and Anvil only. `deploy` scripts will be written and tested locally; running them against Arc testnet needs your explicit go-ahead and a keystore you control (never a key in the repo).

---

## Implementation status (2026-10-17, branch `feat/phase3-mandates`)

Built to the plan above. **Nothing is deployed; no transaction was sent to Arc testnet or mainnet.** Everything ran against the local Foundry VM and a local Anvil node.

| Part | Commit |
|---|---|
| This plan | `84234f2` |
| `CredentialRegistry` fixes M-1, M-2, M-7 + backend nonce change | `c519774` |
| `MandateRegistry` (+ `IMandateRegistry`, `MandateCategories`) | `d476819` |
| `DecisionLog` (+ `IDecisionLog`) and `DeployTreasury.s.sol` | `abfa16f` |
| Backend services, routes, ABIs, e2e | `3f28591` |
| Founder and agent screens, proxy | `ae5f67a` |

Where the build differs from, or adds to, the plan:
- **Owner actions are direct transactions** from the managed owner key (register business, `setRecorder`, `createMandate`, `revokeMandate`). The contract also supports gasless `createMandateWithSig` / `revokeMandateWithSig`; they are tested in Foundry but the backend does not use them yet (that is the Circle-wallet phase).
- **`POST /businesses`** is an addition: a business must exist before a mandate can, and the relayer must be a recorder before it can write decisions.
- **`DecisionLog` extras beyond the spec:** `rulesFailed` bitmap, `parentDecisionId` (links a follow-up to the record it resolves, which is how pending approvals are found), `clientRef` (idempotent retries), `seq` and `prevHash` (ordering and the hash chain).
- **Human approval** is enforced in `consume` (EIP-712 `PaymentApproval`, EOA or ERC-1271). The UI can only *show* pending approvals; there is no approve button because the browser has no signing wallet.
- **Demo owner key:** `deploy-local.sh` generates a fresh random owner key for each local run and writes it to the git-ignored `backend/.env.local`. The script still contains Anvil's well-known public test keys from before this phase; none were added.
- The local deploy script and tests use standard Anvil, which **does not reproduce Arc** (native-USDC transfer reverts, blocklist behaviour). Arc's own simulator (`arc-anvil --network arc`) was not used.

How the tests were checked beyond passing: the two new contracts were deliberately broken 25 ways (11 in `MandateRegistry`, 14 in `DecisionLog`: threshold and expiry boundaries, nonce reuse, agent and approver checks, cap off-by-one, single-use, allowlist, replay, revoked status, signature deadline, business/agent mismatch, tx-hash and escalation rules, chain head and `prevHash`, idempotency, hash coverage); every mutant failed the suite. The screens were also run by hand against the real stack and driven in a browser.

Before any Arc testnet deployment (needs your go-ahead): re-run the contract tests under `arc-anvil`, have the contracts independently reviewed, confirm the EVM version Arc accepts for the compiled bytecode, fund a keystore you control, and decide who the real business owner signs as.
