> **Status (2026-10-17): historical design, partly superseded.** This describes the original Monad-era plan (identity registry, AUSD staking pool, trust score).
> `StakingPool`, `TrustScore` and `IdentityRegistry` were removed in Phase 1 of `CLEANUP_PLAN.md`, the CVI gate in Phase 2, and the target chain is now Arc.
> Only `CredentialRegistry` remains; it becomes the mandate/decision registry in Phase 3. This file is rewritten in Phase 7.

# Credentia — Smart Contract Architecture

> Portable identity and trust layer for AI agents and humans on Monad.
> Target: **Monad testnet (chain ID `10143`)** · Settlement token: **AUSD (ERC-20)**

| Contract | Role | Depends on |
|---|---|---|
| `CredentialRegistry` | Issues, verifies and revokes EIP-712 credentials | — |
| `StakingPool` | AUSD collateral behind an agent's credentials; yield; slashing | `CredentialRegistry`, AUSD |
| `TrustScore` | Computes a 0–100 score from registry, pool and reported activity | `CredentialRegistry`, `StakingPool` |

Deploy order is `CredentialRegistry` → `StakingPool` → `TrustScore`. There are no circular dependencies: the pool only reads the registry, and the score only reads the registry and the pool.

---

## 0. Read this first

### 0.1 Deviations from the brief

These are deliberate. Each one closes a hole that the literal spec would leave open.

| Brief | This design | Why |
|---|---|---|
| `slash(address agent, uint256 amount)` | `slash(address agent, uint256 amount, bytes32 credentialId)` | A bare owner-slash is an unbounded power over everyone's stake. Requiring a credential that is **on-chain revoked with reason `Fraud`** ties every slash to evidence and makes it one-shot per credential. |
| `unstake(uint256)` pays out immediately | `unstake` starts a cooldown; `withdraw()` pays out | Without a cooldown an agent can front-run a fraud revocation and exit before being slashed. The cooldown also blocks flash-staking to inflate a score. |
| `CredentialVerified` event | Emitted by a non-view `verifyAndLog`; pure views stay free | Events cannot be emitted from `view` functions. |
| "Anyone" can mint credentials (implied) | Only **owner-approved issuers** can mint | Permissionless minting lets anyone self-issue credentials to inflate the "active credentials" and "age" score components. It also lets anyone spam a subject's credential list. |
| Yield "on staked AUSD" | Yield is **funded rewards** streamed pro-rata (Synthetix-style) | AUSD is a plain stablecoin and does not rebase, as far as I know. The yield has to come from somewhere, so a funder (treasury, Agora yield share, protocol fees) deposits AUSD to be streamed. A pluggable `IYieldSource` adapter is a v2 item. |

### 0.2 Assumptions to verify before deploying

1. **AUSD address.** `0x000000000000000000000000000000000000012a` is a placeholder. A real ERC-20 would not sit at an address that is 19 zero bytes plus `0x2a`. The address is a **constructor argument** (`immutable`), so nothing is hard-coded. The deploy script must assert `code.length > 0` and `decimals() == 6`. Look up the real address in Agora's docs for Monad testnet. If AUSD has no testnet deployment, deploy a `MockAUSD` (6 decimals) for the hackathon.
2. **AUSD decimals.** The design assumes **6 decimals**. All AUSD constants below use `1e6` as one AUSD, and the TrustScore stake cap is a constructor parameter, so a different decimals value is a config change.
3. **Token behaviour.** The stablecoin may be pausable or blacklistable. Every transfer goes through `SafeERC20`, withdrawals use a pull pattern, and `slashRecipient` must be an address that cannot realistically be blacklisted.
4. **Toolchain.** The installed OpenZeppelin is 5.7.0. `SignatureChecker` and `ReentrancyGuardTransient` need `pragma ^0.8.24`, but `contracts/foundry.toml` pins `solc_version = "0.8.20"`. **Bump to `0.8.24` or later** and set `evm_version = "cancun"`. Confirm Monad testnet supports Cancun opcodes before relying on transient storage.
5. **Existing stubs.** `contracts/src/CredentialRegistry.sol` is a 40-line placeholder with a different API (`issueCredential`, no EIP-712). This design replaces it. `IdentityRegistry.sol` (DID registry) is **out of scope** and untouched. The `subject` of a credential is an address, which can be mapped to a DID off-chain or via `IdentityRegistry.getDIDByAddress`.

### 0.3 Monad-specific notes

- **Gas is charged on the gas limit, not gas used.** Keep the worst-case path of every function tight. Avoid unbounded loops, and bound the ones that remain (see `MAX_CREDENTIALS_PER_SUBJECT`).
- **Cold storage reads are repriced** (several times Ethereum's cost). Read-heavy on-chain consumers should use `TrustScore.cachedScore` (1 SLOAD), not `calculateScore` (about 100 SLOADs worst case).
- **Parallel execution.** Contention on hot slots forces re-execution, so avoid global counters that every transaction writes (for example `totalCredentials++`). This design keeps all state keyed per credential or per account. Global aggregates are derived from events off-chain, or kept only in rarely-written config.
- **Fast blocks (~400 ms).** Use `uint48` timestamps in seconds as normal. Do not use `block.number` for durations.

---

## 1. Shared types & interfaces

```solidity
// ---- ICredentialRegistry.sol ----
interface ICredentialRegistry {
    enum SubjectKind { Unspecified, Human, Agent }
    enum RevocationReason { None, Unspecified, Superseded, KeyCompromise, Fraud }
    enum Status { NotFound, Valid, Expired, Revoked, IssuerNotApproved }

    struct Credential {
        // slot 0
        address issuer;
        uint48  issuedAt;
        uint48  expiresAt;          // 0 = never expires
        // slot 1
        address subject;
        uint48  revokedAt;          // 0 = not revoked
        SubjectKind kind;           // uint8
        RevocationReason reason;    // uint8
        // slot 2, 3
        bytes32 credentialType;     // e.g. keccak256("credentia.kyc.v1"), keccak256("credentia.agent.model-attestation.v1")
        bytes32 metadataHash;       // keccak256(bytes(metadataURI)) — binds the URI inside the signature
    }

    /// Typed-data payload an issuer signs (or submits directly).
    struct MintParams {
        address issuer;
        address subject;
        bytes32 credentialType;
        SubjectKind kind;
        uint48  expiresAt;
        string  metadataURI;
        uint256 nonce;              // unordered, per issuer
        uint256 deadline;           // signature validity (unix seconds); ignored on the direct path
    }

    function getCredential(bytes32 id) external view returns (Credential memory);
    function getStatus(bytes32 id) external view returns (Status);
    function isValid(bytes32 id) external view returns (bool);
    function fraudRevocationCount(address subject) external view returns (uint256);
    function getSubjectStats(address subject)
        external view returns (uint256 activeCount, uint48 oldestActiveIssuedAt);
}

// ---- IStakingPool.sol ----
interface IStakingPool {
    /// Active stake only. Excludes pending-unstake and unclaimed rewards.
    function stakedOf(address agent) external view returns (uint256);
}

// ---- ITrustScore.sol ----
interface ITrustScore {
    function calculateScore(address subject) external view returns (uint256);          // 0..100, live
    function cachedScore(address subject) external view returns (uint256 score, uint48 updatedAt);
}
```

From OpenZeppelin 5.x: `EIP712`, `SignatureChecker` (EOA ECDSA **and** ERC-1271), `Ownable2Step`, `ReentrancyGuard`, `Pausable`, `SafeERC20`, `IERC20Metadata`, `Math`.

---

## 2. `CredentialRegistry.sol`

**Inherits:** `EIP712("Credentia CredentialRegistry", "1")`, `Ownable2Step`

### 2.1 Design

- A credential is a signed statement by an **issuer** about a **subject** address. The subject can be a human EOA or an AI agent (a smart-contract wallet, a 7702-delegated EOA, or a plain EOA key held by the agent runtime). The registry does not try to detect which. `address.code.length` is unreliable (constructor-time calls, EIP-7702), so the issuer asserts `SubjectKind` and it is treated as a **label, not a security property**. Anything that matters should key off `credentialType`.
- **Two mint paths share one code path** (`_mint`):
  1. `mintCredential(p)`: the issuer calls directly (`msg.sender == p.issuer`).
  2. `mintCredentialWithSignature(p, sig)`: the issuer signs the EIP-712 payload off-chain. Anyone (the subject, a relayer, a paymaster) submits it. `SignatureChecker` validates ECDSA for EOAs and **ERC-1271 for contract issuers**. This matters because AI agents and organisations will often issue from smart-contract wallets.
- **Credential ID = EIP-712 digest** of the `MintParams` struct (`_hashTypedDataV4(structHash)`). It is deterministic and computable off-chain before submission. It is also unique per `(issuer, nonce)`, so the pre-mint ID and the on-chain ID always match.
- **Revocation** is issuer-only, with a reason code. `Fraud` is special: it increments `fraudRevocationCount[subject]`, which `StakingPool` reads to freeze withdrawals and authorise slashing.
- **Validity** is computed live: `exists && !revoked && !expired && issuerApproved(issuer)`. De-listing a compromised issuer therefore invalidates all its credentials at once, without touching each one.

### 2.2 EIP-712 domain & types

```solidity
// Domain: { name: "Credentia CredentialRegistry", version: "1", chainId: 10143, verifyingContract: <registry> }

bytes32 public constant CREDENTIAL_TYPEHASH = keccak256(
    "Credential(address issuer,address subject,bytes32 credentialType,uint8 kind,"
    "uint48 expiresAt,bytes32 metadataHash,uint256 nonce,uint256 deadline)"
);
// structHash = keccak256(abi.encode(CREDENTIAL_TYPEHASH, issuer, subject, credentialType,
//                                   uint8(kind), expiresAt, keccak256(bytes(metadataURI)), nonce, deadline));
```

`deadline` is part of the signed struct, so it also affects the ID. The direct path uses `deadline = 0`, which is skipped in the check. The same struct therefore always yields the same ID.

### 2.3 State variables

| Name | Type | Visibility | Notes |
|---|---|---|---|
| `CREDENTIAL_TYPEHASH` | `bytes32` | `public constant` | See above |
| `MAX_CREDENTIALS_PER_SUBJECT` | `uint256` | `public constant` | `32`. Bounds every loop (see 2.6) |
| `_credentials` | `mapping(bytes32 => Credential)` | `private` | Packed: 4 slots |
| `_metadataURI` | `mapping(bytes32 => string)` | `private` | Kept out of the struct so the hot path stays 4 slots. Also emitted in the event |
| `_subjectCredentials` | `mapping(address => bytes32[])` | `private` | Capped at `MAX_CREDENTIALS_PER_SUBJECT`. Compacted by `pruneInactive` |
| `isIssuer` | `mapping(address => bool)` | `public` | Owner-managed allow-list |
| `_nonceUsed` | `mapping(address => mapping(uint256 => bool))` | `private` | Unordered nonces (parallel-friendly). Upgrade to a 256-bit bitmap if gas matters |
| `fraudRevocationCount` | `mapping(address => uint256)` | `public` | Read by `StakingPool` |

No global `totalCredentials` counter (parallel-execution contention). Derive totals from `CredentialMinted` events.

### 2.4 Functions

**Admin**

```solidity
constructor(address initialOwner) EIP712("Credentia CredentialRegistry", "1") Ownable(initialOwner);

function setIssuer(address issuer, bool approved) external onlyOwner;
// emits IssuerUpdated. Owner is a multisig. Ownable2Step is inherited, so ownership transfer is two-step.
```

**Minting**

```solidity
function mintCredential(MintParams calldata p)
    external returns (bytes32 id);
// require(msg.sender == p.issuer && isIssuer[p.issuer])

function mintCredentialWithSignature(MintParams calldata p, bytes calldata signature)
    external returns (bytes32 id);
// require(isIssuer[p.issuer]); require(block.timestamp <= p.deadline);
// require(SignatureChecker.isValidSignatureNow(p.issuer, digest, signature));

function cancelNonce(uint256 nonce) external;
// issuer burns an unused nonce → invalidates an outstanding signed-but-unsubmitted credential
```

`_mint(p, digest)` internal, in this order (checks → effects → interactions):
1. `require(p.subject != address(0))`
2. `require(p.expiresAt == 0 || p.expiresAt > block.timestamp)`
3. `require(!_nonceUsed[p.issuer][p.nonce])`, then set it
4. `require(_subjectCredentials[p.subject].length < MAX_CREDENTIALS_PER_SUBJECT)`
5. Write the `Credential` struct and `_metadataURI[id]`, then push the id onto `_subjectCredentials`
6. Emit `CredentialMinted`

**Revocation**

```solidity
function revokeCredential(bytes32 id, RevocationReason reason) external;
// require(msg.sender == c.issuer); require(c.revokedAt == 0); require(reason != None)
// sets revokedAt/reason; if reason == Fraud → ++fraudRevocationCount[c.subject]
// Works even if the issuer has since been de-listed, so a de-listed issuer can still flag fraud.
```

**Verification**

```solidity
function getStatus(bytes32 id) public view returns (Status);
function isValid(bytes32 id) external view returns (bool);

function verifyAndLog(bytes32 id) external returns (bool valid);
// emits CredentialVerified(id, msg.sender, valid, status). For on-chain consumers that want an audit trail
// (for example a marketplace recording that it checked a credential before a trade). Off-chain callers use the views.

function verifyCredentialSignature(MintParams calldata p, bytes calldata signature)
    external view returns (bool);
// Stateless check that `p` is signed by p.issuer (EOA or ERC-1271), the issuer is approved, the nonce is
// unused, and the deadline has not passed. Lets a verifier accept a signed-but-unminted credential presented off-chain.
```

**Views / maintenance**

```solidity
function getCredential(bytes32 id) external view returns (Credential memory);
function credentialURI(bytes32 id) external view returns (string memory);
function getSubjectCredentialIds(address subject) external view returns (bytes32[] memory);
function getSubjectStats(address subject)
    external view returns (uint256 activeCount, uint48 oldestActiveIssuedAt);
// Loops ≤ 32 entries; "active" = Status.Valid. oldestActiveIssuedAt = 0 when activeCount == 0.

function hashCredential(MintParams calldata p) external view returns (bytes32 digest);  // = the credential id
function nonceUsed(address issuer, uint256 nonce) external view returns (bool);
function domainSeparator() external view returns (bytes32);

function pruneInactive(address subject, uint256 maxScan) external;
// Permissionless. Removes expired/revoked ids from the subject's array so the 32-slot cap can't be
// permanently filled with dead credentials. Swap-and-pop; does not delete the credential records.
```

### 2.5 Events

```solidity
event CredentialMinted(
    bytes32 indexed id, address indexed issuer, address indexed subject,
    bytes32 credentialType, SubjectKind kind, uint48 issuedAt, uint48 expiresAt, string metadataURI
);
event CredentialRevoked(
    bytes32 indexed id, address indexed issuer, address indexed subject,
    RevocationReason reason, uint48 revokedAt
);
event CredentialVerified(bytes32 indexed id, address indexed verifier, bool valid, Status status);
event IssuerUpdated(address indexed issuer, bool approved);
event NonceCancelled(address indexed issuer, uint256 nonce);
```

### 2.6 Security considerations

| Risk | Mitigation |
|---|---|
| **Signature replay** (same chain) | Per-issuer unordered nonce, consumed before any external interaction. The ID is derived from the nonce, so a replay would collide anyway. |
| **Cross-chain / cross-contract replay** | EIP-712 domain includes `chainId` and `verifyingContract`. OZ `EIP712` recomputes the separator if `chainId` changes (fork). |
| **Signature malleability** | OZ `ECDSA` rejects high-`s` signatures. Nonce-based replay protection never relies on signature uniqueness. |
| **Stale signed credentials** | Mandatory `deadline` on the signature path. Issuers can `cancelNonce`. |
| **ERC-1271 reentrancy** | `isValidSignature` is invoked via `staticcall` by `SignatureChecker`, so it cannot mutate state. The nonce is still burned first, as defence in depth. |
| **Unwanted credentials / consent** | Subjects do not co-sign. A credential about you that you did not ask for is harmless to you, because it only adds to your score if from an approved issuer. If subject consent becomes a requirement (for example KYC attestations), add an optional `subjectSignature` field. |
| **Spam / list-stuffing** | Only approved issuers mint. Cap of 32 per subject. `pruneInactive` frees dead slots. |
| **Issuer key compromise** | `setIssuer(issuer, false)` invalidates all its credentials instantly (validity checks the allow-list live). The issuer can still call `revokeCredential` for specific cases. |
| **Malicious/mistaken `Fraud` revocation** | Fraud revocation only *flags*. The pool freezes withdrawals until the owner either `slash`es or `dismissFraudFlag`s. It never moves funds by itself. |
| **Admin centralisation** | The owner controls the issuer allow-list. Use a multisig and, post-hackathon, a timelock. `Ownable2Step` prevents transfer-to-wrong-address. |
| **URI content** | Treat as untrusted data. `metadataHash` binds the URI to the signature, so any off-chain document can be integrity-checked. Recommend IPFS CIDs or `data:` URIs. |
| **Timestamps** | `uint48` seconds. Miner/validator skew is irrelevant at this granularity. |
| **No self-destruct / upgrade** | Not upgradeable by design. Data lives in the registry, and consumers point at an address, so migration means a new registry plus a `TrustScore` redeploy. |

### 2.7 Gas optimisation

- 4-slot packed `Credential`. URI is kept in a separate mapping so reads of validity never touch the string.
- `calldata` for `MintParams` and `signature`. Custom errors instead of revert strings.
- Compute the struct hash once and reuse it for both the ID and the signature check.
- Nonce: switch to a `mapping(address => mapping(uint256 => uint256))` **bitmap** (`nonce >> 8` as key, `1 << (nonce & 0xff)` as bit) to amortise the cold SSTORE across 256 credentials.
- `unchecked` increments on bounded loops.
- Optional `mintBatch(MintParams[] calldata, bytes[] calldata)`. Skip until a real issuer needs it.
- Don't read `isIssuer` per element in `getSubjectStats` when all elements share an issuer. Cache the last-seen issuer and its status in a local.

---

## 3. `StakingPool.sol`

**Inherits:** `Ownable2Step`, `ReentrancyGuard`, `Pausable`
**Uses:** `SafeERC20` for `IERC20`

### 3.1 Design

- Agents lock AUSD as **collateral for their credentials**. It is one pool per agent address, not per credential, because the stake backs the agent's whole reputation.
- **Unstaking is two-step:** `unstake(amount)` moves funds from *active* to *pending* and starts (or restarts) the cooldown. `withdraw()` pays out after `unstakeDelay`. Pending funds remain **slashable** and do **not** count as active stake for the score.
- **Yield** follows the Synthetix `StakingRewards` model. A funder deposits AUSD with `fundRewards`, which streams over `rewardsDuration`. Each staker accrues pro-rata via `rewardPerTokenStored`. Rewards are paid from a separate **`rewardsReserve`**, which never mixes with principal.
- **Slashing** is evidence-gated. `slash(agent, amount, credentialId)` needs a credential in the `CredentialRegistry` that is revoked with reason `Fraud`, belongs to `agent`, and has not yet been resolved. Slashed AUSD goes to `slashRecipient` (a treasury or compensation escrow).
- **Freeze on fraud flag.** While an agent has an unresolved fraud-revoked credential (`fraudRevocationCount(agent) > resolvedFraudCount[agent]`), `withdraw()` reverts and `stake()` is blocked. The owner resolves each flag via `slash` or `dismissFraudFlag`. This closes the "revoke → front-run exit" race.
- **Accounting invariant** (enforced in tests, never from `balanceOf`):
  `AUSD.balanceOf(pool) >= totalStaked + totalPending + rewardsReserve`. Accounting uses internal counters only, so direct donations cannot break it.

### 3.2 State variables

| Name | Type | Visibility | Notes |
|---|---|---|---|
| `ausd` | `IERC20` | `public immutable` | Constructor arg |
| `registry` | `ICredentialRegistry` | `public immutable` | Constructor arg |
| `unstakeDelay` | `uint64` | `public` | Default `7 days`, bounds `[1 days, 30 days]` |
| `slashRecipient` | `address` | `public` | Non-zero. Must not be blacklistable |
| `totalStaked` | `uint256` | `public` | Sum of active stake |
| `totalPending` | `uint256` | `public` | Sum of cooling-down stake |
| `rewardsReserve` | `uint256` | `public` | AUSD earmarked for yield (funded − claimed) |
| `positions` | `mapping(address => Position)` | `private` | `struct Position { uint128 staked; uint128 pending; uint64 unlockAt; }`, 2 slots |
| `rewardsDuration` | `uint64` | `public` | Default `7 days` |
| `periodFinish` | `uint64` | `public` | |
| `lastUpdateTime` | `uint64` | `public` | |
| `rewardRate` | `uint256` | `public` | AUSD units per second |
| `rewardPerTokenStored` | `uint256` | `public` | Scaled by `1e18` |
| `userRewardPerTokenPaid` | `mapping(address => uint256)` | `public` | |
| `rewards` | `mapping(address => uint256)` | `public` | Accrued, unclaimed |
| `fraudResolved` | `mapping(bytes32 => bool)` | `public` | Per credential id |
| `resolvedFraudCount` | `mapping(address => uint256)` | `public` | |
| `rewardFunder` | `mapping(address => bool)` | `public` | Addresses allowed to call `fundRewards` (owner always can) |

### 3.3 Functions

**Staking**

```solidity
constructor(IERC20 ausd_, ICredentialRegistry registry_, address slashRecipient_, address initialOwner)
    Ownable(initialOwner);

function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender);
// require(amount > 0); require(!_isFrozen(msg.sender)); pulls AUSD via safeTransferFrom.
// Use the balance-delta (before/after) if the token ever charges transfer fees. For AUSD it is 1:1.

function unstake(uint256 amount) external nonReentrant updateReward(msg.sender);
// require(0 < amount <= staked). Moves staked → pending, unlockAt = now + unstakeDelay (restarts the timer
// for ALL pending funds — simple and conservative; a per-request queue is a v2 option).
// NOT pausable: users can always begin an exit.

function withdraw() external nonReentrant;
// require(pending > 0); require(block.timestamp >= unlockAt); require(!_isFrozen(msg.sender))
// Zeroes pending, then safeTransfer to msg.sender. NOT pausable.

function claimYield() external nonReentrant updateReward(msg.sender) returns (uint256 amount);
// Pays accrued rewards from rewardsReserve. NOT pausable.

function exit() external;  // convenience: unstake(all) + claimYield(). Withdraw still follows the cooldown.
```

**Yield funding**

```solidity
function fundRewards(uint256 amount) external nonReentrant updateReward(address(0));
// onlyFunder (owner or rewardFunder). Pulls AUSD, then:
//   remaining = periodFinish > now ? (periodFinish - now) * rewardRate : 0
//   rewardRate = (amount + remaining) / rewardsDuration;  periodFinish = now + rewardsDuration
//   rewardsReserve += amount
// require(totalStaked > 0): stream can't start with no stakers (prevents silently lost emissions).
// require(rewardRate * rewardsDuration <= rewardsReserve): never promise more than is reserved.

function setRewardsDuration(uint64 d) external onlyOwner;  // only when the current period has finished
function setRewardFunder(address a, bool ok) external onlyOwner;
```

**Slashing & fraud resolution**

```solidity
function slash(address agent, uint256 amount, bytes32 credentialId)
    external onlyOwner nonReentrant updateReward(agent);
// 1. c = registry.getCredential(credentialId)
//    require(c.subject == agent && c.reason == Fraud && c.revokedAt != 0)   // on-chain evidence
// 2. require(!fraudResolved[credentialId])                                  // one slash per credential
// 3. require(amount > 0 && amount <= staked + pending)
// 4. take from `staked` first, remainder from `pending`; update totalStaked/totalPending
// 5. fraudResolved[credentialId] = true; ++resolvedFraudCount[agent]
// 6. safeTransfer(slashRecipient, amount)
// Works while paused.

function dismissFraudFlag(address agent, bytes32 credentialId) external onlyOwner;
// Owner determines the fraud revocation was mistaken/malicious: same checks as (1)-(2) but no funds move.
// Marks resolved so the agent is unfrozen.

function setSlashRecipient(address r) external onlyOwner;  // non-zero
function setUnstakeDelay(uint64 d) external onlyOwner;     // within bounds. Applies to new unstake() calls only
function pause() external onlyOwner;   function unpause() external onlyOwner;
```

**Views**

```solidity
function stakedOf(address agent) external view returns (uint256);       // active stake — what TrustScore reads
function pendingOf(address agent) external view returns (uint256 amount, uint64 unlockAt);
function earned(address agent) external view returns (uint256);
function rewardPerToken() public view returns (uint256);
function lastTimeRewardApplicable() public view returns (uint64);
function isFrozen(address agent) external view returns (bool);          // unresolved fraud flags > 0
function unresolvedFraud(address agent) external view returns (uint256);
```

`updateReward(account)` modifier: refresh `rewardPerTokenStored` and `lastUpdateTime`. If `account != address(0)`, also set `rewards[account] = earned(account)` and `userRewardPerTokenPaid[account] = rewardPerTokenStored`.

### 3.4 Events

```solidity
event Staked(address indexed agent, uint256 amount, uint256 newStaked);
event UnstakeRequested(address indexed agent, uint256 amount, uint64 unlockAt);
event Unstaked(address indexed agent, uint256 amount);              // emitted by withdraw() on payout
event YieldClaimed(address indexed agent, uint256 amount);
event Slashed(address indexed agent, bytes32 indexed credentialId, uint256 amount, address recipient);
event FraudFlagDismissed(address indexed agent, bytes32 indexed credentialId);
event RewardsFunded(address indexed funder, uint256 amount, uint256 rewardRate, uint64 periodFinish);
event SlashRecipientUpdated(address indexed recipient);
event UnstakeDelayUpdated(uint64 delay);
event RewardsDurationUpdated(uint64 duration);
event RewardFunderUpdated(address indexed funder, bool allowed);
```

### 3.5 Security considerations

| Risk | Mitigation |
|---|---|
| **Reentrancy** | `nonReentrant` on every state-changing external function that moves tokens. Checks-effects-interactions: zero balances *before* `safeTransfer`. AUSD is not ERC-777, but this is defence in depth. |
| **Exit-before-slash race** | Unstake cooldown plus freeze on unresolved fraud flags. Pending funds stay slashable. The slash order (active first, then pending) leaves no escape path. |
| **Owner abuse of `slash`** | Gated by an on-chain `Fraud` revocation for that agent, one-shot per credential, and the amount capped at the agent's balance. The residual risk is a colluding issuer + owner. Put the owner behind a multisig + timelock, and publish `slash` rationales as event data or a URI in v2. |
| **Malicious fraud revocation → permanent freeze** | A rogue approved issuer can freeze an agent's stake by flagging. Mitigations: issuers are allow-listed and accountable, and the owner can `dismissFraudFlag`. **Open item:** auto-expire a flag after N days with no owner action, which needs a per-flag timestamp. |
| **Reward-accounting drift / donation attacks** | Internal counters only. `rewardsReserve` is separate from principal. `fundRewards` caps `rewardRate * duration` by the reserve. |
| **Rounding** | `rewardPerToken` scaled `1e18`. Division truncates toward the pool (dust stays in the reserve). |
| **First-staker / zero-supply** | `fundRewards` requires `totalStaked > 0`. If everyone exits mid-period, those emissions stay in the reserve and are rolled into the next `fundRewards` call. This is the one accepted Synthetix edge case. |
| **Token quirks** | `SafeERC20`. A blacklistable token can brick one user's `withdraw`, not the pool, because there are no push payments to third parties besides `slashRecipient`. Assert 1:1 transfers with balance-delta checks if a fee-on-transfer token is ever substituted. |
| **Pause** | Pausing blocks only `stake`/`fundRewards`. Exit paths (`unstake`, `withdraw`, `claimYield`) and `slash` stay live, so pause can never trap funds. |
| **Integer width** | `uint128` positions: AUSD supply is far below 2^128, but cast with `SafeCast` and revert on overflow. |
| **Admin** | `Ownable2Step`. `slashRecipient` and `unstakeDelay` changes are bounded and evented. Changing `unstakeDelay` does not retroactively shorten existing cooldowns. |

### 3.6 Gas optimisation

- `Position` packs into 2 slots (`uint128 staked`, `uint128 pending`, `uint64 unlockAt`). Read once into memory, write back once.
- `immutable` for `ausd` and `registry`. Custom errors.
- `updateReward` writes only when the account has a non-zero position or accrued rewards.
- No loops anywhere in the pool. All operations are O(1).
- `exit()` shares one `updateReward` call between its sub-steps (internal functions, not external self-calls).
- Skip the `registry` external call in `stake`/`withdraw` when `fraudRevocationCount == 0`, which is the common case and a single SLOAD in the registry.

---

## 4. `TrustScore.sol`

**Inherits:** `Ownable2Step`

### 4.1 Design

- A **pure function of on-chain state**: `calculateScore(address)` is `view` and always live. A cached snapshot (`cachedScore`) exists for cheap on-chain reads and for emitting `ScoreUpdated`.
- Five components, each normalised to **basis points (0–10 000)**, combined with weights that sum to 10 000:

| Component | Weight | Source | Normalisation (default params) |
|---|---|---|---|
| Successful transactions | **30 %** | `activity[subject].successfulTx` | `min(successfulTx, txCap) / txCap`, `txCap = 100` |
| Credential age | **20 %** | `registry.getSubjectStats().oldestActiveIssuedAt` | `min(ageDays, ageCapDays) / ageCapDays`, `ageCapDays = 365` |
| Active credentials | **25 %** | `registry.getSubjectStats().activeCount` | `min(activeCount, credCap) / credCap`, `credCap = 5` |
| Dispute rate | **15 %** | `activity[subject].{disputes, totalTx}` | see below |
| Staked AUSD | **10 %** | `stakingPool.stakedOf(subject)` | `min(staked, stakeCap) / stakeCap`, `stakeCap = 1 000 AUSD` (`1_000e6`) |

- **Final score** = `Σ weightᵢ(bps) × componentᵢ(bps) / 1_000_000` → integer 0–100. `calculateScoreBps` returns the same value ×100 (0–10 000) when finer granularity is needed.
- **Dispute component.** `disputeBps = totalTx < minSample ? 0 : 10_000 × (1 − min(rate, maxDisputeRate) / maxDisputeRate)`, where `rate = disputes / totalTx`, `minSample = 5` and `maxDisputeRate = 20 %`. A subject with no history does **not** get the full 15 points for free: the component only pays out once there is evidence of low disputes.
- **Caps are linear and saturating** on purpose: easy to reason about and audit. A square-root or log curve is a drop-in change to `_normalise`.
- **Where do "transactions" and "disputes" come from?** The chain cannot know what an agent *did* off-protocol. They are **reported by allow-listed reporters** (marketplaces, escrow contracts, agent-to-agent payment rails) through `recordOutcome`. Without a reporter allow-list, anyone could mint infinite "successful transactions". This is the central trust assumption of the score, and the allow-list is the control (see 4.5).

### 4.2 State variables

| Name | Type | Visibility | Notes |
|---|---|---|---|
| `registry` | `ICredentialRegistry` | `public immutable` | |
| `stakingPool` | `IStakingPool` | `public immutable` | |
| `weights` | `Weights` | `public` | `struct Weights { uint16 txBps; uint16 ageBps; uint16 credBps; uint16 disputeBps; uint16 stakeBps; }`. Packed into one slot. Sum is validated to `10_000` |
| `params` | `Params` | `public` | `struct Params { uint32 txCap; uint32 ageCapDays; uint32 credCap; uint32 minDisputeSample; uint16 maxDisputeRateBps; uint128 stakeCap; }`. Two slots |
| `isReporter` | `mapping(address => bool)` | `public` | Owner-managed |
| `activity` | `mapping(address => Activity)` | `public` | `struct Activity { uint32 successfulTx; uint32 totalTx; uint32 disputes; }`, one slot |
| `_snapshot` | `mapping(address => Snapshot)` | `private` | `struct Snapshot { uint8 score; uint48 updatedAt; }` |
| `BPS` | `uint256` | `public constant` | `10_000` |

### 4.3 Functions

**Scoring (core)**

```solidity
function calculateScore(address subject) public view returns (uint256 score);          // 0..100, live
function calculateScoreBps(address subject) public view returns (uint256 scoreBps);     // 0..10_000, live

function getScoreBreakdown(address subject) external view returns (ScoreBreakdown memory b);

struct ScoreBreakdown {
    // raw inputs
    uint256 successfulTx;
    uint256 totalTx;
    uint256 disputes;
    uint256 oldestCredentialAgeDays;
    uint256 activeCredentials;
    uint256 stakedAUSD;
    // normalised components (bps, 0..10_000)
    uint256 txComponentBps;
    uint256 ageComponentBps;
    uint256 credComponentBps;
    uint256 disputeComponentBps;
    uint256 stakeComponentBps;
    // weighted contribution of each component (in score points ×100, i.e. bps of the 0..100 scale)
    uint256 txContribution;
    uint256 ageContribution;
    uint256 credContribution;
    uint256 disputeContribution;
    uint256 stakeContribution;
    // result
    uint256 score;              // 0..100
}
```

**Cache & on-chain consumption**

```solidity
function refreshScore(address subject) external returns (uint256 newScore);
// Permissionless (anyone can pay to freshen a score). Writes the snapshot and emits ScoreUpdated
// only if the value changed. Skips the SSTORE if unchanged.

function cachedScore(address subject) external view returns (uint256 score, uint48 updatedAt);
// O(1). updatedAt == 0 means never cached. Consumers decide how stale is acceptable.

function meetsThreshold(address subject, uint256 minScore) external view returns (bool);
// Convenience for gating: live score ≥ minScore.
```

**Activity reporting**

```solidity
function recordOutcome(address subject, bool successful, bool disputed) external onlyReporter;
// totalTx++; if (successful) successfulTx++; if (disputed) disputes++.
// A disputed transaction still counts in totalTx; whether it also counts as successful is the reporter's call.
// Then refreshes the snapshot and emits ScoreUpdated.

function recordOutcomes(address[] calldata subjects, bool[] calldata successful, bool[] calldata disputed)
    external onlyReporter;   // batch variant, same checks
```

**Admin**

```solidity
function setReporter(address reporter, bool allowed) external onlyOwner;
function setWeights(Weights calldata w) external onlyOwner;   // require sum == 10_000
function setParams(Params calldata p) external onlyOwner;     // all caps > 0; maxDisputeRateBps in (0, 10_000]
```

Scoring math (internal, all `view`/`pure`):

```solidity
function _normalise(uint256 value, uint256 cap) internal pure returns (uint256 bps) {
    return value >= cap ? BPS : value * BPS / cap;
}
function _disputeBps(Activity memory a, Params memory p) internal pure returns (uint256);
function _score(Inputs memory i) internal view returns (ScoreBreakdown memory);
```

### 4.4 Events

```solidity
event ScoreUpdated(address indexed subject, uint256 oldScore, uint256 newScore, uint48 timestamp);
event OutcomeRecorded(address indexed subject, address indexed reporter, bool successful, bool disputed);
event ReporterUpdated(address indexed reporter, bool allowed);
event WeightsUpdated(Weights weights);
event ParamsUpdated(Params params);
```

### 4.5 Security considerations

| Risk | Mitigation |
|---|---|
| **Sybil inflation of transaction counts** | Only owner-approved reporters can write activity. Reporters are the trust root: onboard only protocols that settle real value (escrow, payment rails). Document that a malicious reporter can inflate scores, and keep the reporter set small and multisig-controlled. |
| **Self-dealing (A↔B loops)** | The contract cannot see counterparties. Reporters should dedupe or weight by counterparty. **v2:** add `counterparty` to `recordOutcome` and cap contribution per `(subject, counterparty)`. Staking and credentials (the other 65 %) are independent of this. |
| **Score manipulation via stake** | Pool cooldown means stake must stay locked ≥ `unstakeDelay`, and `stakedOf` excludes pending funds, so a score drops the moment an exit starts. Flash-loan staking is impossible because capital is locked for days. |
| **Credential gaming** | Only approved-issuer credentials exist in the registry. De-listing an issuer drops its credentials from the score immediately. Age uses the **oldest *active*** credential, so revoking/expiring the old one resets age. |
| **Griefing via expensive reads** | The only loop is `registry.getSubjectStats`, bounded to 32 entries. `TrustScore` itself has no loops except the batch reporter call. Contracts that need low gas read `cachedScore`. |
| **Stale cache** | `cachedScore` can lag after revocation or slashing. Safety-critical consumers should call `calculateScore`/`meetsThreshold` (live) or require `updatedAt` freshness. `refreshScore` is permissionless so anyone, including keepers, can update. |
| **Parameter manipulation** | `setWeights`/`setParams` are `onlyOwner` and sum-checked, but changing them shifts every score at once. Emit events, put the owner behind a multisig + timelock, and publish parameter changes. Never lower `stakeCap`/caps silently. |
| **Divide-by-zero** | All caps validated `> 0`. `totalTx == 0` short-circuits the dispute component. |
| **Overflow** | Solidity 0.8 checked math. Every product is `bps × bps` or `value × 10_000`, and `uint32` counters saturate at `type(uint32).max` rather than reverting, so a reporter can't brick a subject. |
| **Front-running a refresh** | Harmless. The result is a deterministic function of state. |
| **Interface trust** | `registry` and `stakingPool` are `immutable`. No arbitrary external addresses are called. |

### 4.6 Gas optimisation

- Weights fit in one slot, params in two. Load each into memory once per call.
- `calculateScore` makes exactly two external calls (`getSubjectStats`, `stakedOf`) plus 2–3 local SLOADs.
- `refreshScore` compares the new score with the stored `uint8` and skips the `SSTORE` when unchanged.
- `Activity` is one slot (3 × `uint32`). Saturating increments use `unchecked` with an explicit max-guard.
- Return the full `ScoreBreakdown` only from the breakdown getter. `calculateScore` computes just the weighted sum without populating the struct.
- Batch `recordOutcomes` to amortise the call overhead for reporters.

---

## 5. Cross-contract flows

```
 Issuer ──mint (direct or EIP-712 sig)──▶ CredentialRegistry ◀──getCredential / fraudRevocationCount── StakingPool
                                               ▲                                                         ▲
                       getSubjectStats ────────┘                                              stakedOf ───┘
                                               ╲                                                       ╱
                                                ╲──────────────────  TrustScore  ────────────────────╱
                                                                          ▲
                                          recordOutcome(subject, ok, disputed)   (allow-listed reporters)
```

**Happy path.** Issuer mints a credential → agent `stake`s AUSD → reporters record successful trades → anyone `refreshScore`s → a counterparty calls `meetsThreshold(agent, 60)` before dealing with it.

**Fraud path.**
1. Issuer calls `revokeCredential(id, Fraud)` → `fraudRevocationCount[agent]++`.
2. `StakingPool` now reports the agent as frozen: `withdraw()` and `stake()` revert.
3. The owner reviews, then either `slash(agent, amount, id)` (funds → `slashRecipient`) or `dismissFraudFlag(agent, id)`. Either unfreezes.
4. Anyone calls `TrustScore.refreshScore(agent)`. The score has dropped (credential inactive, stake reduced) and `ScoreUpdated` fires.

---

## 6. Deployment (Monad testnet, chain 10143)

1. Set `solc_version = "0.8.24"` (or later) and `evm_version = "cancun"` in `contracts/foundry.toml`.
2. `CredentialRegistry(owner)`
3. `StakingPool(ausd, registry, slashRecipient, owner)`
4. `TrustScore(registry, stakingPool, owner, defaultWeights, defaultParams)`
5. Post-deploy (owner): `registry.setIssuer(...)`, `trustScore.setReporter(...)`, and optionally `pool.setRewardFunder(...)`.
6. Script assertions: `ausd.code.length > 0`, `IERC20Metadata(ausd).decimals() == 6`, `weights` sum to 10 000.

Environment variables already in `.env.example`: `MONAD_RPC_URL`, `MONAD_CHAIN_ID`. Add `AUSD_ADDRESS`, `SLASH_RECIPIENT`, `OWNER_MULTISIG`.

## 7. Test plan (Foundry)

- **Registry:** direct mint; signed mint with EOA; signed mint with an ERC-1271 contract issuer; replay, wrong-chain, expired-deadline, cancelled-nonce, non-issuer and 33rd-credential reverts; revoke paths; `Status` for every branch (including issuer de-listed); `pruneInactive`.
- **Pool:** stake/unstake/withdraw timing; cooldown restart; reward accrual across multiple stakers and a funding top-up; `slash` evidence checks, double-slash revert, slash from pending; freeze/unfreeze via `dismissFraudFlag`; pause semantics.
- **Score:** each component at 0, mid and cap; weights-sum check; dispute-rate edge cases (`totalTx < minSample`); breakdown sums equal the total (±rounding); `refreshScore` event emission only on change.
- **Invariants (fuzz):** `balance ≥ totalStaked + totalPending + rewardsReserve`; `Σ positions == totals`; score ∈ [0, 100]; a revoked credential never counts as active.
- **Fork/integration:** end-to-end happy and fraud paths on a local Anvil with a 6-decimal `MockAUSD`.

## 8. Open questions

1. **Real AUSD address and decimals on Monad testnet?** (Section 0.2.)
2. **Who is the initial reporter set?** The score is only as honest as its reporters. For the hackathon, a single demo reporter contract is acceptable.
3. **Should subjects co-sign credentials** (consent)? Needed for KYC-style credentials; cheap to add.
4. **Auto-expiring fraud flags** to remove the owner-liveness dependency (Section 3.5).
5. **Permissionless issuance** with an issuer-reputation filter instead of an allow-list? That is more open, but it shifts the sybil problem into the issuer registry.
