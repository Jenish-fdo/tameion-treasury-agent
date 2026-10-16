# Credentia Contracts — Security & Gas Review

**Scope:** `contracts/src/CredentialRegistry.sol`, `StakingPool.sol`, `TrustScore.sol` (plus their interfaces), as they exist in the working tree on 2026-10-08.
**Method:** manual read-through, then exploit tests for the headline findings (Foundry, `docs/audit/AuditPoC.t.sol.txt`). The existing suite (160 tests) passes but does not catch any of the Critical/High items below.
**Not a formal audit.** Get an independent audit before holding real value.

> **Heads-up:** the implemented contracts do **not** follow `docs/architecture.md`. There is no unstake cooldown, `slash` has no on-chain evidence requirement, the score has 3 push-fed factors instead of 5 pull-computed ones, and there is no `calculateScore`. Either update the doc or move the code toward it. Most Critical/High items below disappear if the design from the doc is adopted.

## Summary

| ID | Severity | Contract | Title |
|---|---|---|---|
| C-1 | **Critical** | StakingPool | Reward accounting has no per-user checkpoint: unlimited re-claims and rewards for time before staking |
| H-1 | **High** | StakingPool | `_totalEffectiveStake` drifts when a score changes, corrupting rewards for everyone |
| H-2 | **High** | StakingPool | Withdrawals depend on an external, owner-replaceable `TrustScore` call |
| H-3 | **High** | StakingPool | Emissions are not backed by funding; rewards paid out of other users' principal |
| H-4 | **High** | StakingPool | Unrestricted owner `slash`, paid to `owner()` (centralization) |
| H-5 | **High** | StakingPool | `MIN_STAKE = 1e18` assumes 18 decimals; AUSD is expected to have 6 |
| H-6 | **High** | TrustScore / all | Nothing ever feeds the score; the "trusted sources" never call it |
| M-1 | Medium | CredentialRegistry | Signature nonce keyed by holder; `request.nonce` ignored; no cancel |
| M-2 | Medium | CredentialRegistry | Signed path allows already-expired credentials |
| M-3 | Medium | StakingPool | `slash` can be front-run by `unstake` once the lock has elapsed |
| M-4 | Medium | TrustScore | One factor can saturate the whole score; trusted sources are not scoped per factor |
| M-5 | Medium | TrustScore | Staking factor is raw token units capped at 10 000: dust stake = max factor |
| M-6 | Medium | TrustScore | Revoked/expired credentials never reduce the score; cached score goes stale |
| M-7 | Medium | all | No pause, `Ownable` (not 2-step), `renounceOwnership` live |
| L-1 | Low | StakingPool | `unchecked` math on owner-controlled `rewardRate` |
| L-2 | Low | StakingPool | Lock timer resets for the whole position on every `stake` |
| L-3 | Low | StakingPool | `unstake` auto-claim skips `totalRewardsDistributed` |
| L-4 | Low | CredentialRegistry | Credential ID collision blocks renewal with identical data |
| L-5 | Low | all | Error handling / dead code / events |

---

## Critical

### C-1 · StakingPool: no per-user reward checkpoint (verified)

**Where:** `_updateAccountReward` (`StakingPool.sol:477`), `claimReward` (`:244`), `stake` (`:151`).

**Description.** `_updateAccountReward` computes `earned = effectiveStake * _rewardPerShareStored / 1e18`, which is the user's stake times the *cumulative* reward-per-share since the pool started. There is no `userRewardPerSharePaid` snapshot, so the "already settled" part is never subtracted. `rewardDebt` is then overwritten with `earned` whenever it is smaller. `claimReward` sets it to 0, so the next update restores the full cumulative amount.

**Exploit 1: re-claim loop.** Alice stakes 100 AUSD and waits 100 s at 1 AUSD/s. She calls `claimReward()` three times in a row and receives **300 AUSD for 100 s of rewards** (test `test_PoC_DoubleClaim`). Looping drains every AUSD in the contract, including other users' principal, since principal and rewards share one balance.

**Exploit 2: back-dated rewards.** The pool runs for 1 000 s with one staker. An attacker stakes 100 AUSD and calls `claimReward()`. They are credited `100 × rewardPerShare` as if they had been staked since the beginning. A second claim in the same block pays out again (`test_PoC_LateStakerGetsHistory` paid 1 000 AUSD on a 100 AUSD stake with 0 s elapsed). The 7-day lock only blocks `unstake`, not `claimReward`, so the attacker keeps the principal locked but takes the rewards.

**Fix.** Use the standard checkpoint pattern, and keep the *effective* stake per user so changes are applied consistently (this also fixes H-1):

```solidity
mapping(address => uint256) public userRewardPerSharePaid;
mapping(address => uint256) public effectiveOf;           // checkpointed weighted stake

modifier updateReward(address a) {
    _updateRewardAccounting();                            // global index first
    if (a != address(0)) {
        StakePosition storage p = _positions[a];
        p.rewardDebt += effectiveOf[a] * (_rewardPerShareStored - userRewardPerSharePaid[a]) / 1e18;
        userRewardPerSharePaid[a] = _rewardPerShareStored;
    }
    _;
}

function _syncEffective(address a) internal {             // call at the END of stake/unstake/slash
    uint256 newEff = _getEffectiveStake(a, _positions[a].stakedAmount);
    _totalEffectiveStake = _totalEffectiveStake - effectiveOf[a] + newEff;
    effectiveOf[a] = newEff;
}
```

`claimReward` then only pays `rewardDebt` (rename it `rewardsAccrued`) and zeroes it; it can no longer be re-credited.

---

## High

### H-1 · `_totalEffectiveStake` drift (verified)

**Where:** `stake` (`:175`), `unstake` (`:219`), `slash` (`:288`), `_getEffectiveStake` (`:436`).

**Description.** Effective stake is added using the score *at stake time* and removed using the score *at exit time*. The two differ whenever `TrustScore` changes, or when the owner calls `setTrustScore`. The `else { _totalEffectiveStake = 0; }` branch hides the underflow instead of surfacing it.

**Exploit.** Alice and Bob each stake 100 AUSD (total 200). Alice's staking factor is raised, which raises her score. Alice unstakes. The pool removes *more* than she added. In the test the total went from 200 to **75 while Bob still has 100 staked**. With a denominator that is too small, reward-per-share is inflated and the pool overpays. If it clamps to 0, emissions silently stop. The owner can trigger the same corruption for all users at once with `setTrustScore`.

**Fix.** Store the weighted stake per user (see C-1's `effectiveOf` / `_syncEffective`) and adjust the total by the stored value, never by a recomputed one. On `setTrustScore`, either forbid changes while `_totalEffectiveStake > 0` or force a pool-wide re-sync.

### H-2 · Withdrawals depend on external `TrustScore` (liveness)

**Where:** every function with `updateReward`, including `unstake`, calls `trustScore.getScore()` (`:441`).

**Description.** If the configured `TrustScore` reverts, runs out of gas, or is replaced by the owner with a bad address, `stake`, `unstake`, `claimReward` and `slash` all revert. Users cannot exit.

**Fix.** Make exit paths independent of the score, and fail-soft elsewhere:

```solidity
function _scoreOf(address a) internal view returns (uint256 s) {
    if (address(trustScore) == address(0)) return 0;
    try trustScore.getScore{gas: 50_000}(a) returns (uint256 v) { s = v > MAX_SCORE ? MAX_SCORE : v; }
    catch { s = 0; }
}
```

With per-user `effectiveOf` checkpoints (C-1), `unstake` doesn't need to call the score at all.

### H-3 · Emissions not backed by funding

**Where:** `rewardRate`, `setRewardRate` (`:338`), `addRewards` (`:321`).

**Description.** `addRewards` just transfers AUSD in. Emission is `rewardRate` per second regardless of how much was funded. When emissions outrun deposits, rewards are paid from staked principal, and the last users to exit cannot withdraw. `addRewards` donations are also never tied to any schedule and have no recovery path.

**Fix.** Synthetix-style funded periods, with a hard solvency check and separate accounting of principal:

```solidity
uint256 public totalStaked;        // raw principal
uint256 public rewardsReserve;     // funded, not yet claimed

function notifyRewardAmount(uint256 amount) external onlyOwner updateReward(address(0)) {
    ausd.safeTransferFrom(msg.sender, address(this), amount);
    uint256 remaining = periodFinish > block.timestamp ? (periodFinish - block.timestamp) * rewardRate : 0;
    rewardRate = (amount + remaining) / rewardsDuration;
    periodFinish = uint64(block.timestamp + rewardsDuration);
    rewardsReserve += amount;
    if (rewardRate * rewardsDuration > rewardsReserve) revert InvalidRewardRate(rewardRate);
}
```

Emission stops at `periodFinish`. Invariant to fuzz: `ausd.balanceOf(pool) >= totalStaked + rewardsReserve`.

### H-4 · Unrestricted `slash` to the owner

**Where:** `slash` (`:271`).

**Description.** One owner key can take any amount from any staker at any time, with no evidence, no delay and no link to `CredentialRegistry` (the stated purpose was slashing for fraud revocations). Proceeds go to `owner()`, so a compromised owner is paid directly. `Ownable` has no 2-step transfer or timelock.

**Fix.** Require on-chain evidence and send funds to a dedicated recipient:

```solidity
function slash(address staker, uint256 amount, bytes32 credentialId) external onlyOwner nonReentrant updateReward(staker) {
    ICredentialRegistry.Credential memory c = registry.getCredential(credentialId);
    if (c.holder != staker || !c.revoked || c.revokeReason != FRAUD) revert NoFraudEvidence();
    if (slashed[credentialId]) revert AlreadySlashed();
    slashed[credentialId] = true;
    // ... reduce stake, _syncEffective(staker) ...
    ausd.safeTransfer(slashRecipient, amount);
}
```

The registry will need to store a revocation reason (it currently only emits one). Make `owner` a multisig behind a timelock.

### H-5 · `MIN_STAKE = 1e18` vs a 6-decimal token (verified)

**Where:** `StakingPool.sol:46`.

**Description.** The comment says "1 AUSD = 1e18". If AUSD has 6 decimals (as I expect, verify against the real token), `MIN_STAKE` is 10¹² AUSD and every `stake()` reverts (`test_PoC_MinStakeWith6Decimals`: staking 1 000 000 AUSD reverts). The tests use an 18-decimal mock, so this passes CI.

**Fix.** Derive from the token, and test against a 6-decimal mock:

```solidity
uint256 public immutable minStake;
constructor(...) { minStake = 10 ** IERC20Metadata(ausdAddress).decimals(); }   // 1 token
```

Also assert the expected decimals in the deploy script.

### H-6 · The score is never fed (integration gap, verified by grep)

**Where:** `TrustScore.recordCredentialFactor / recordAttestationFactor / recordStakingFactor` are `onlyTrustedSource`; `CredentialRegistry` and `StakingPool` are registered as trusted sources, but **neither contract contains a call to TrustScore** (the only reference in `StakingPool` is the read `getScore`).

**Consequence.**
- In a real deployment every score is 0, so the StakingPool trust boost is dead.
- The 35 % `ATTESTATION` weight can never be written: there is no `setTrustedSource`, and only the registry and pool addresses are trusted.
- It looks wired up, which is worse: unit tests prank as the trusted source, so they pass.

**Fix.** Prefer the **pull model** from `docs/architecture.md`: `TrustScore.calculateScore(addr)` reads the registry and pool directly (immutable references, no write path to attack). If you keep push, add the calls explicitly and add an integration test that issues a credential and stakes through the real contracts and asserts the score changed:

```solidity
// StakingPool, end of stake()/unstake()/slash():
if (address(trustScore) != address(0)) {
    try trustScore.recordStakingFactor(staker, pos.stakedAmount) {} catch {}
}
```

---

## Medium

### M-1 · Per-holder nonce, `request.nonce` ignored, no cancel (CredentialRegistry)

**Where:** `issueCredentialWithSig` (`:171-181`).

The struct hash uses `_useNonce(request.holder)` and never reads `request.nonce`. The comment "reverts on mismatch" is wrong; a mismatch just makes `ECDSA.recover` return a different address, which then fails the issuer check with a misleading `NotAuthorizedIssuer`.

**Exploit/impact.** Two issuers each pre-sign for the same holder with nonce 0. Whichever is submitted first consumes the holder's nonce and the other signature is dead (griefing and ordering races). An issuer cannot revoke a signed-but-unsubmitted request, so a signature stays redeemable until its deadline.

**Fix.** Use a per-issuer nonce, bind it to the signed data, and add a cancel:

```solidity
mapping(address issuer => mapping(uint256 => bool)) public nonceUsed;

if (nonceUsed[signer][request.nonce]) revert NonceUsed();
nonceUsed[signer][request.nonce] = true;           // after recovering signer from a hash that includes request.nonce

function cancelNonce(uint256 n) external { nonceUsed[msg.sender][n] = true; emit NonceCancelled(msg.sender, n); }
```

Because the signer is recovered from the digest, check the nonce *after* recovery and before writing the credential. Also use `SignatureChecker` (ERC-1271) if contract issuers are expected.

### M-2 · Signed path accepts already-expired credentials

**Where:** `:165-168` vs the direct path at `:127`.

The direct path rejects `expiryTimestamp <= block.timestamp`; the signature path does not. A credential can be issued already expired, and `activeCredentials` is still incremented.

**Fix.** Same check in both paths (factor into `_validateExpiry`).

### M-3 · `slash` front-run by `unstake`

Once the 7-day lock has passed there is no cooldown. When the owner's `slash` tx hits the mempool the staker can `unstake` first, and `slash` then reverts with `InsufficientBalance` (or takes a smaller part).

**Fix.** Two-step unstake with a cooldown during which funds remain slashable, as in `docs/architecture.md` §3. Also cap `slash` at the staker's current balance instead of reverting.

### M-4 · Factor saturation and unscoped trusted sources (TrustScore)

**Where:** `recordCredentialFactor` (`:141`), `removeFactor` (`:201`), `_updateScore`.

- Factor values accumulate without a cap, and only the *total* is capped. A single factor with value 25 000 yields `25 000 × 4 000 / 10 000 = 10 000`, i.e. a 100 % score from credentials alone, so the configured weights are meaningless.
- Any trusted source can call any `record*` function and `removeFactor` for any identity and any factor. The staking pool (trusted) can overwrite the credential factor.
- `current + value` is checked, so a huge `value` makes the call revert forever for that identity (self-DoS), cleared only by `removeFactor`.

**Fix.** Cap each factor to `MAX_SCORE` before weighting, and scope sources to factors:

```solidity
mapping(address => bytes32) public sourceFactor;   // one factor per source

modifier onlySourceFor(bytes32 f) { if (sourceFactor[msg.sender] != f) revert NotTrustedSource(msg.sender); _; }

uint256 v = _factorValues[id][f] + value;
_factorValues[id][f] = v > MAX_SCORE ? MAX_SCORE : v;
```

Add `setTrustedSource(address, bytes32 factor)` with an event, so the attestation source can actually be registered (see H-6).

### M-5 · Staking factor units (TrustScore)

**Where:** `recordStakingFactor` (`:187`): `value = min(stakeAmount, 10_000)`.

`stakeAmount` is raw token base units. With 6 decimals 0.01 AUSD, and with 18 decimals 10⁻¹⁴ AUSD, gives the full factor (+25 points). Dust staking maxes it (`test_PoC_DustStakeMaxesFactor`: 10 000 wei → score 2 500 bps).

**Fix.** Normalise with a configured `stakeCap` in token units: `value = min(stake, stakeCap) * MAX_SCORE / stakeCap`.

### M-6 · Revocation/expiry never lower the score; cached score goes stale

Factors are only ever added to (or zeroed by `removeFactor`). When a credential is revoked or expires, nothing decrements the factor, and when the issuer is de-authorised in the registry the score keeps counting its credentials. `getScore` returns the cached `_scores` while `getScoreBreakdown` recomputes live, so after `setFactorWeight` they disagree until someone calls `recalculateScore`.

**Fix.** Compute the score live from the registry (pull model, H-6) so revocation, expiry and issuer de-listing are reflected automatically. Otherwise have `revokeCredential` call `removeFactor`/decrement, and have `setFactorWeight` document that scores are stale until recalculated.

### M-7 · Governance hygiene (all three)

- All contracts use `Ownable`: a wrong-address transfer is irreversible and `renounceOwnership()` permanently disables issuer management, slashing and rate setting. Use `Ownable2Step` and override `renounceOwnership` to revert.
- No `Pausable` on `StakingPool`. If C-1 is exploited in production there is no way to stop `stake`/`claimReward`. Add `whenNotPaused` to `stake`/`claimReward` only; keep `unstake` unpausable.
- Owner powers that deserve a timelock: `authorizeIssuer`/`revokeIssuer` (de-listing invalidates all of an issuer's credentials instantly; this is a feature but also a kill switch), owner-revoke of any credential, `setFactorWeight`, `setRewardRate`, `setTrustScore`, `slash`.

---

## Low

**L-1 · `unchecked` on owner-controlled input.** `_updateRewardAccounting` and `getPendingReward` do `elapsed * rewardRate` and `reward * 1e18` inside `unchecked`. `rewardRate` is unbounded, so `setRewardRate(type(uint256).max)` silently wraps and corrupts the index. Cap the rate (`MAX_RATE`) and use checked math (the cost is negligible next to the SLOADs). `_getEffectiveStake` is also `unchecked` on a value returned by an external contract.

**L-2 · Lock reset.** `stake()` sets `unlockTimestamp = now + 7 days` for the *entire* position; adding 1 AUSD re-locks everything. Use per-deposit locks or only set the lock when the position is new.

**L-3 · Accounting inconsistency.** The auto-claim inside `unstake` (`:206-211`) emits `RewardClaimed` but does not increment `totalRewardsDistributed`, unlike `claimReward`. It also transfers *before* reducing `stakedAmount` (safe only because of `nonReentrant`). Reorder to effects-then-interactions.

**L-4 · ID collision.** `id = keccak256(issuer, holder, type, dataHash)` means a revoked or expired credential cannot be re-issued with identical data; the issuer has to alter `dataHash`. Include an issuer nonce or `issuedAt` in the ID if renewal is wanted.

**L-5 · Error handling, events and dead code.**
- `Ownable(initialOwner)` already reverts for the zero address, so the `ZeroAddress` checks after it (Registry `:101`, Pool `:124`, TrustScore `:113`) are unreachable.
- `NotAuthorizedIssuer` is reused for "caller is neither owner nor issuer" in `revokeCredential`; `TransferFailed` is used for "received == 0"; `InvalidSignature`, `InvalidDeadline` are declared and never used (a bad signature surfaces as OZ's `ECDSAInvalidSignature` instead).
- `TrustScore.credentialRegistry`, `stakingPool` are stored and never read; `recordCredentialFactor`'s `credentialType` and `recordAttestationFactor`'s `attestationType` are unused (compiler warns). The pool's `getRawTotalStaked()` returns `balanceOf(this)`, which includes rewards, and its NatSpec is garbled.
- `authorizeIssuer` emits `IssuerAuthorized` even when nothing changed; `revokeIssuer` has no zero-address or "was not authorised" check. `revokeCredential` doesn't record who/why on-chain beyond the event (needed for H-4's evidence).
- Events are mostly complete. Gaps: `TrustScore` flips `_trustedSources` inside `setCredentialRegistry`/`setStakingPool` without a dedicated event (add `TrustedSourceUpdated`), and `revokeCredential` stores no reason on-chain (needed for H-4).
- Pin the pragma (`pragma solidity 0.8.24;`) and set `solc_version` explicitly instead of `auto_detect_solc`.

---

## Front-running summary (checklist item 4)

| Surface | Issue | Verdict |
|---|---|---|
| `issueCredentialWithSig` | Anyone can submit a signed request; shared holder nonce means ordering changes which signature survives | Medium, M-1 |
| `slash` vs `unstake` | Staker exits ahead of the slash | Medium, M-3 |
| Reward JIT staking | Stake just before a rate increase and claim (amplified by C-1) | Fixed by C-1 checkpointing + funded periods |
| `recalculateScore` | Permissionless, deterministic | Harmless |
| Signature replay | Domain separator includes `chainId` and `verifyingContract`; recovered signer must be an authorised issuer | OK |

## Reentrancy (checklist item 1)

All state-changing `StakingPool` functions are `nonReentrant`, `stake` uses a balance delta, and AUSD is not a hook token, so no reentrancy exploit was found. In `unstake`, the auto-claim transfer happens before the balance is reduced (L-3); safe only because of the guard. The `nonReentrant` modifiers on `CredentialRegistry.issueCredential*` and `TrustScore.record*` protect nothing, because those functions make no external calls (see gas item 1).

---

## Gas optimisations

Estimates assume Ethereum-style pricing (~22 k gas for a fresh `SSTORE`, ~2.1 k cold `SLOAD`). Monad reprices cold storage access, so measure with `forge snapshot` / `forge test --gas-report` on your own numbers.

**1. Drop `nonReentrant` where there are no external calls** (~2.5–5 k gas per call; the guard slot is also a shared hot slot on Monad).

```solidity
// before
function issueCredential(...) external override onlyIssuer nonReentrant returns (bytes32 id)
function recordStakingFactor(...) external override onlyTrustedSource nonReentrant
// after
function issueCredential(...) external override onlyIssuer returns (bytes32 id)
function recordStakingFactor(...) external override onlyTrustedSource
```

**2. Pack `Credential` from 5 slots to 4** (one fewer ~22 k `SSTORE` per issue).

```solidity
// before: issuer | holder | credentialType | dataHash | issuedAt(8)+expiry(8)+revoked(1)  → 5 slots
// after
struct Credential {
    address issuer;      // 20
    uint48  issuedAt;    // 6
    uint48  expiryTimestamp; // 6   → slot 0 (32 bytes)
    address holder;      // 20
    bool    revoked;     // 1   → slot 1
    bytes32 credentialType;
    bytes32 dataHash;
}
```

**3. Remove global counters `totalCredentials` / `activeCredentials`** (two writes to the same two slots on every issue, ~10 k warm / ~44 k cold, and a contention point under Monad's parallel execution). `activeCredentials` is also wrong because expiry never decrements it. Derive totals from `CredentialIssued` / `CredentialRevoked` events off-chain.

```solidity
// before
unchecked { ++totalCredentials; ++activeCredentials; }
// after: (delete both variables and the decrement in revokeCredential)
```

**4. Deduplicate `verifyCredential` / `isCredentialValid`** (smaller bytecode, one code path to audit).

```solidity
function verifyCredential(bytes32 id) external view returns (bool) { return _isValid(id); }
function isCredentialValid(bytes32 id) external view returns (bool) { return _isValid(id); }
function _isValid(bytes32 id) internal view returns (bool) {
    Credential storage c = _credentials[id];
    return c.issuer != address(0) && !c.revoked
        && (c.expiryTimestamp == 0 || c.expiryTimestamp > block.timestamp)
        && _authorizedIssuers[c.issuer];
}
```

**5. Remove dead `SSTORE`s in `StakePosition`** — `lastRewardTimestamp` is written on every reward update (`:481`, `:494`) and `active` on every stake/unstake, but neither is ever read. Shrinking the struct also cuts slots:

```solidity
// before: stakedAmount(256) | rewardDebt(256) | lastRewardTimestamp(64)+unlockTimestamp(64)+active(8)  → 3 slots
// after
struct StakePosition { uint128 stakedAmount; uint128 rewardsAccrued; uint64 unlockTimestamp; }  // 2 slots
```

**6. Cache storage reads in `_updateRewardAccounting`** and pack the timestamp next to `trustScore`.

```solidity
// before: reads _totalEffectiveStake twice, rewardRate and _lastRewardTimestamp once each from storage as written
// after
uint256 total = _totalEffectiveStake;
if (total == 0) { _lastRewardTimestamp = uint64(block.timestamp); return; }
uint256 elapsed = block.timestamp - _lastRewardTimestamp;
if (elapsed == 0) return;
_rewardPerShareStored += elapsed * rewardRate * 1e18 / total;   // checked math (see L-1)
_lastRewardTimestamp = uint64(block.timestamp);

// state layout: put `ITrustScore public trustScore; uint64 internal _lastRewardTimestamp;` adjacent → one slot
```

**7. Cut the repeated external `getScore` calls.** Today `stake` calls the score contract in the modifier (`_updateAccountReward`) and again in `_getEffectiveStake`; `unstake` and `slash` do the same. Checkpointed `effectiveOf[user]` (C-1 fix) removes all but one call per state change and none on `claimReward` or exit.

**8. Share the scoring math in TrustScore.** `_updateScore` and `getScoreBreakdown` duplicate the same three multiplications and 6 SLOADs. Pack the weights into one slot and the three factor values into one struct, and compute once:

```solidity
// before
mapping(bytes32 => uint256) _factorWeights;                    // 3 SLOADs
mapping(address => mapping(bytes32 => uint256)) _factorValues; // 3 SLOADs
// after
struct Weights { uint16 cred; uint16 attest; uint16 stake; }   // 1 SLOAD
struct Factors { uint96 cred; uint96 attest; uint64 stake; }   // 1 SLOAD per identity (cap values at MAX_SCORE so they fit)
function _compute(address id) internal view returns (uint256 c, uint256 a, uint256 s, uint256 total);
```

**9. Skip no-op writes.** `_updateScore` always writes `_scores` and `_lastUpdated`, even if the score is unchanged (e.g. a public `recalculateScore` call).

```solidity
// before
_scores[identity] = newScore;
_lastUpdated[identity] = block.timestamp;
if (newScore != oldScore) emit TrustScoreUpdated(...);
// after
if (newScore != oldScore) {
    _scores[identity] = newScore;
    _lastUpdated[identity] = block.timestamp;
    emit TrustScoreUpdated(identity, oldScore, newScore, block.timestamp);
}
```

**10. Unordered nonce bitmap** (if you adopt M-1's per-issuer nonce): 256 nonces share one slot, so only the first use per word pays the fresh-slot cost.

```solidity
mapping(address => mapping(uint256 => uint256)) nonceBitmap;
function _useNonce(address issuer, uint256 n) internal {
    uint256 word = n >> 8; uint256 bit = 1 << (n & 0xff);
    uint256 w = nonceBitmap[issuer][word];
    if (w & bit != 0) revert NonceUsed();
    nonceBitmap[issuer][word] = w | bit;
}
```

---

## Security checklist before mainnet

**Correctness & tests**
- [ ] Fix C-1/H-1 and add regression tests from `docs/audit/AuditPoC.t.sol.txt` (they currently *pass* because the bugs exist; invert the assertions).
- [ ] Invariant/fuzz tests: `ausd.balanceOf(pool) >= totalStaked + rewardsReserve`; `Σ effectiveOf == _totalEffectiveStake`; a user's lifetime rewards ≤ funded rewards; `claimReward` twice in a row pays the second time 0.
- [ ] End-to-end integration test through the *real* contracts (issue → stake → score changes). No `vm.prank(trustedSource)` shortcuts.
- [ ] Test with a **6-decimal** token and with a token that reverts/returns false, and with a `TrustScore` that reverts.
- [ ] Coverage report ≥ 95 % on branches; mutation testing (e.g. `vertigo-rs`/`gambit`) on the reward math.
- [ ] Run Slither and Aderyn; triage every finding. Run `forge build --sizes` (contracts must stay under limits) and `forge fmt --check`.

**Config & deployment**
- [ ] Confirm the real AUSD address, decimals, and whether it is pausable/blacklistable. The `0x…012a` in the NatSpec is a placeholder.
- [ ] Pin `pragma` and `solc_version` (0.8.24+), `evm_version`, and the optimizer runs; commit the exact settings. Pin the OpenZeppelin version (5.7.0 installed).
- [ ] The deploy script (`script/Deploy.s.sol`) currently deploys only `IdentityRegistry` and has a TODO list naming contracts that don't exist. Write the real deployment, with post-deploy assertions (owner, trusted sources, decimals, weights sum) and a recorded address manifest.
- [ ] Deploy with a hardware wallet or keystore (`--account`/`--ledger`), not `DEPLOYER_PRIVATE_KEY` in `.env`. Never reuse the testnet key.
- [ ] Verify all contracts on the explorer; publish compiler settings.

**Access control & governance**
- [ ] `Ownable2Step`, `renounceOwnership` disabled; owner is a multisig (≥ 3/5) with a timelock on `slash`, `setRewardRate`, `setTrustScore`, `setFactorWeight`, issuer authorisation.
- [ ] Documented, public process for adding issuers, trusted sources and slash decisions (who, evidence, appeals).
- [ ] Emergency plan: `pause`, who can pause, how users still exit, and a rehearsed incident runbook.
- [ ] Separate roles (issuer admin, slasher, reward funder, pauser) instead of a single owner.

**Economic & operational**
- [ ] Reward funding model documented and enforced on-chain (H-3); caps on `rewardRate`.
- [ ] Sybil analysis of the score: who can report activity, what it costs to fake each factor, and what the score is allowed to gate. Don't use it to gate large value until reviewed.
- [ ] Monad specifics: confirm gas is charged on the gas limit (keep limits tight), check the current storage pricing, and re-run gas snapshots on testnet.
- [ ] Monitoring/alerts on `Slashed`, `RewardRateUpdated`, `IssuerRevoked`, `OwnershipTransferStarted`, large `Unstaked`.
- [ ] Independent audit, a bug bounty, and a staged rollout (capped TVL, then raise the cap) after audit fixes are verified.
