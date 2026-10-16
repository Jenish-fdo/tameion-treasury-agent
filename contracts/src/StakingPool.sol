// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStakingPool} from "./interfaces/IStakingPool.sol";
import {ITrustScore} from "./interfaces/ITrustScore.sol";

/**
 * @title StakingPool
 * @notice Allows users to stake AUSD tokens and earn rewards proportional
 *         to their stake amount and trust score. Supports slashing for
 *         malicious behavior and a configurable lock-up period.
 *
 * @dev Reward calculation uses a modified weighted-stake model:
 *      effectiveStake = stakedAmount * (1 + trustScoreMultiplier)
 *      where trustScoreMultiplier = trustScore / MAX_SCORE.
 *      Higher trust scores yield proportionally higher rewards.
 *
 * @custom:deploy-target Monad testnet (chain ID 10143)
 * @custom:ausd-address 0x000000000000000000000000000000000000012a
 */
contract StakingPool is IStakingPool, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────────────────────
    // Constants & Immutables
    // ──────────────────────────────────────────────────────────────

    /// @notice AUSD token contract address (Monad testnet)
    /// @dev 0x000000000000000000000000000000000000012a
    IERC20 public immutable ausd;

    /// @notice Maximum trust score (10000 = 100.00%)
    uint256 public constant MAX_SCORE = 10000;

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS = 10000;

    /// @notice Default lock-up period (7 days in seconds)
    uint64 public constant DEFAULT_LOCK_PERIOD = 7 days;

    /// @notice Minimum stake amount (1 AUSD = 1e18)
    uint256 public constant MIN_STAKE = 1e18;

    // ──────────────────────────────────────────────────────────────
    // Storage — packed structs for gas efficiency
    // ──────────────────────────────────────────────────────────────

    /// @notice User staking positions keyed by staker address
    mapping(address => StakePosition) internal _positions;

    /// @notice TrustScore contract reference for reward boosting
    ITrustScore public trustScore;

    /// @notice Reward rate per second (in AUSD tokens, 1e18 = 1 AUSD/sec)
    uint256 public rewardRate;

    /// @notice Accumulated reward per share (scaled by 1e18)
    uint256 internal _rewardPerShareStored;

    /// @notice Last timestamp rewards were updated
    uint64 internal _lastRewardTimestamp;

    /// @notice Total effective stake (weighted by trust score)
    uint256 internal _totalEffectiveStake;

    /// @notice Total rewards distributed to date
    uint256 public totalRewardsDistributed;

    /// @notice Total slashed to date
    uint256 public totalSlashed;

    // ──────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────

    /// @dev Updates reward accounting before any state change
    modifier updateReward(address account) {
        _updateRewardAccounting();
        if (account != address(0)) {
            _updateAccountReward(account);
        }
        _;
    }

    // ──────────────────────────────────────────────────────────────
    // Custom Errors
    // ──────────────────────────────────────────────────────────────

    error ZeroAddress();
    error InsufficientStake(uint256 required, uint256 provided);
    error StakeLocked(uint256 unlockTimestamp);
    error NoPendingReward();
    error AmountZero();
    error InsufficientBalance(uint256 available, uint256 required);
    error TransferFailed();
    error InvalidRewardRate(uint256 rate);

    // ──────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────

    /**
     * @notice Initializes the StakingPool
     * @param ausdAddress Address of the AUSD ERC-20 token
     * @param initialOwner Address of the contract owner
     * @param _trustScore Address of the TrustScore contract (can be zero)
     * @param _rewardRate Initial reward rate per second (in AUSD, 1e18 = 1 token/sec)
     *
     * @dev The AUSD address is stored as immutable for gas savings on reads.
     *      If TrustScore address is provided, rewards will be boosted by
     *      the staker's trust score. If zero, all stakers get equal rewards.
     */
    constructor(
        address ausdAddress,
        address initialOwner,
        address _trustScore,
        uint256 _rewardRate
    ) Ownable(initialOwner) {
        if (ausdAddress == address(0)) revert ZeroAddress();
        if (initialOwner == address(0)) revert ZeroAddress();

        ausd = IERC20(ausdAddress);
        rewardRate = _rewardRate;
        _lastRewardTimestamp = uint64(block.timestamp);

        if (_trustScore != address(0)) {
            trustScore = ITrustScore(_trustScore);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Core: Staking
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Transfers AUSD from the staker to this contract, updates the
     *      staker's position, and recalculates total effective stake.
     *      The effective stake incorporates the staker's trust score
     *      for reward distribution purposes.
     *
     * Gas optimization: Uses `unchecked` for timestamp arithmetic since
     * `block.timestamp` is guaranteed > `unlockTimestamp` in the normal
     *      case. Struct fields are packed (uint64, uint64, bool) to save slots.
     */
    function stake(uint256 amount)
        external
        override
        nonReentrant
        updateReward(msg.sender)
    {
        if (amount < MIN_STAKE) revert InsufficientStake(MIN_STAKE, amount);

        // Transfer AUSD from staker to this contract
        uint256 balanceBefore = ausd.balanceOf(address(this));
        ausd.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = ausd.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert AmountZero();

        StakePosition storage pos = _positions[msg.sender];

        // Add to staked amount and set lock period
        unchecked {
            pos.stakedAmount += received;
        }
        pos.unlockTimestamp = uint64(block.timestamp) + DEFAULT_LOCK_PERIOD;
        pos.active = true;

        // Update effective stake with trust score multiplier
        uint256 effectiveAdded = _getEffectiveStake(msg.sender, received);
        unchecked {
            _totalEffectiveStake += effectiveAdded;
        }

        emit Staked(msg.sender, received, block.timestamp);
    }

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Reduces the staker's position and returns AUSD tokens. Stakers
     *      must wait until the lock-up period expires. Updates effective
     *      stake proportionally. Claims pending rewards automatically.
     *
     * Gas optimization: `unchecked` for subtraction since amount <= stakedAmount
     *      is enforced by the check. Single transfer at the end.
     */
    function unstake(uint256 amount)
        external
        override
        nonReentrant
        updateReward(msg.sender)
    {
        StakePosition storage pos = _positions[msg.sender];

        if (amount == 0) revert AmountZero();
        if (pos.stakedAmount < amount) revert InsufficientBalance(pos.stakedAmount, amount);
        if (block.timestamp < pos.unlockTimestamp) revert StakeLocked(pos.unlockTimestamp);

        // Auto-claim pending rewards
        uint256 pending = pos.rewardDebt;
        if (pending > 0) {
            pos.rewardDebt = 0;
            ausd.safeTransfer(msg.sender, pending);
            emit RewardClaimed(msg.sender, pending, block.timestamp);
        }

        // Reduce staked amount
        unchecked {
            pos.stakedAmount -= amount;
        }

        // Update effective stake
        uint256 effectiveRemoved = _getEffectiveStake(msg.sender, amount);
        if (_totalEffectiveStake >= effectiveRemoved) {
            unchecked {
                _totalEffectiveStake -= effectiveRemoved;
            }
        } else {
            _totalEffectiveStake = 0;
        }

        if (pos.stakedAmount == 0) {
            pos.active = false;
        }

        // Transfer AUSD back to staker
        ausd.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount, block.timestamp);
    }

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Claims all accumulated pending rewards without unstaking.
     *      Resets reward debt to zero after claiming.
     */
    function claimReward() external override nonReentrant updateReward(msg.sender) {
        StakePosition storage pos = _positions[msg.sender];
        uint256 pending = pos.rewardDebt;

        if (pending == 0) revert NoPendingReward();

        pos.rewardDebt = 0;
        ausd.safeTransfer(msg.sender, pending);

        unchecked {
            totalRewardsDistributed += pending;
        }

        emit RewardClaimed(msg.sender, pending, block.timestamp);
    }

    // ──────────────────────────────────────────────────────────────
    // Admin: Slashing
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Slashing reduces the staker's position and sends slashed
     *      tokens to the contract owner (treasury). Only callable by
     *      the contract owner or authorized governance.
     */
    function slash(address staker, uint256 amount, bytes32 reason)
        external
        override
        onlyOwner
        nonReentrant
        updateReward(staker)
    {
        StakePosition storage pos = _positions[staker];

        if (amount == 0) revert AmountZero();
        if (pos.stakedAmount < amount) revert InsufficientBalance(pos.stakedAmount, amount);

        unchecked {
            pos.stakedAmount -= amount;
        }

        // Update effective stake
        uint256 effectiveRemoved = _getEffectiveStake(staker, amount);
        if (_totalEffectiveStake >= effectiveRemoved) {
            unchecked {
                _totalEffectiveStake -= effectiveRemoved;
            }
        } else {
            _totalEffectiveStake = 0;
        }

        if (pos.stakedAmount == 0) {
            pos.active = false;
        }

        unchecked {
            totalSlashed += amount;
        }

        // Send slashed funds to owner (treasury)
        ausd.safeTransfer(owner(), amount);

        emit Slashed(staker, amount, reason, block.timestamp);
    }

    // ──────────────────────────────────────────────────────────────
    // Admin: Rewards
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Transfers reward tokens from the caller into this contract
     *      and updates the reward accounting. Anyone can add rewards.
     */
    function addRewards(uint256 amount) external override nonReentrant updateReward(address(0)) {
        if (amount == 0) revert AmountZero();

        uint256 balanceBefore = ausd.balanceOf(address(this));
        ausd.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = ausd.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert TransferFailed();

        emit RewardAdded(received, block.timestamp);
    }

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Sets the reward rate per second. A rate of zero effectively
     *      pauses new reward accrual. Only callable by the owner.
     */
    function setRewardRate(uint256 newRate) external override onlyOwner updateReward(address(0)) {
        uint256 oldRate = rewardRate;
        rewardRate = newRate;
        emit RewardRateUpdated(oldRate, newRate);
    }

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Updates the TrustScore contract reference. Set to zero address
     *      to disable trust-score-based reward boosting (all stakers
     *      get equal reward share proportional to stake).
     */
    function setTrustScore(address newTrustScore) external override onlyOwner {
        if (newTrustScore == address(0)) {
            trustScore = ITrustScore(address(0));
        } else {
            trustScore = ITrustScore(newTrustScore);
        }
        emit TrustScoreUpdated(newTrustScore);
    }

    // ──────────────────────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc IStakingPool
     */
    function getStake(address staker) external view override returns (StakePosition memory position) {
        return _positions[staker];
    }

    /**
     * @inheritdoc IStakingPool
     *
     * @dev Calculates the pending reward based on the staker's effective
     *      stake share and the current reward per share. Returns zero
     *      if the staker has no active position.
     */
    function getPendingReward(address staker) external view override returns (uint256 pendingReward) {
        StakePosition storage pos = _positions[staker];
        if (pos.stakedAmount == 0) return 0;

        uint256 currentRewardPerShare = _rewardPerShareStored;
        if (_totalEffectiveStake > 0) {
            uint256 elapsed = block.timestamp - _lastRewardTimestamp;
            unchecked {
                uint256 reward = elapsed * rewardRate;
                currentRewardPerShare += (reward * 1e18) / _totalEffectiveStake;
            }
        }

        uint256 effectiveStake = _getEffectiveStake(staker, pos.stakedAmount);
        uint256 earned = (effectiveStake * currentRewardPerShare) / 1e18;
        pendingReward = earned > pos.rewardDebt ? earned - pos.rewardDebt : 0;
    }

    /**
     * @inheritdoc IStakingPool
     */
    function getTotalStaked() external view override returns (uint256 totalStaked) {
        return _totalEffectiveStake;
    }

    /**
     * @notice Get the raw (unweighted) total staked by all users
     * @dev This iterates is not possible on-chain; use events for indexing.
     *      This function is kept for interface compatibility and returns
     *      the effective total stake (weighted by trust scores).
     */
    function getRawTotalStaked() external view returns (uint256) {
        return ausd.balanceOf(address(this));
    }

    /**
     * @notice Get the lock-up period for a staker
     * @param staker Address to query
     * @return unlockTimestamp When the stake unlocks (can unstake after this)
     */
    function getUnlockTimestamp(address staker) external view returns (uint64 unlockTimestamp) {
        return _positions[staker].unlockTimestamp;
    }

    // ──────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────

    /**
     * @dev Computes the effective stake amount adjusted by the staker's
     *      trust score. If no TrustScore contract is set, returns the
     *      raw amount (no boost).
     *
     * effectiveStake = stakeAmount * (BPS + trustScore) / BPS
     * where trustScore is 0-10000 (0%-100%).
     *
     * Gas optimization: Single external call to TrustScore, cached result.
     */
    function _getEffectiveStake(address staker, uint256 amount) internal view returns (uint256 effective) {
        if (address(trustScore) == address(0)) {
            return amount;
        }

        uint256 score = trustScore.getScore(staker);
        // effective = amount * (10000 + score) / 10000
        unchecked {
            effective = (amount * (BPS + score)) / BPS;
        }
    }

    /**
     * @dev Updates the global reward per share based on time elapsed
     *      and reward rate. Called before any state-changing operation.
     *
     * Gas optimization: `unchecked` for elapsed time and reward
     *      calculation since overflow is not practically achievable.
     */
    function _updateRewardAccounting() internal {
        if (_totalEffectiveStake == 0) {
            _lastRewardTimestamp = uint64(block.timestamp);
            return;
        }

        uint256 elapsed = block.timestamp - _lastRewardTimestamp;
        if (elapsed == 0) return;

        unchecked {
            uint256 reward = elapsed * rewardRate;
            _rewardPerShareStored += (reward * 1e18) / _totalEffectiveStake;
        }

        _lastRewardTimestamp = uint64(block.timestamp);
    }

    /**
     * @dev Updates a staker's reward debt based on the current reward
     *      per share and their effective stake. Credits any pending
     *      rewards into their rewardDebt balance.
     */
    function _updateAccountReward(address account) internal {
        StakePosition storage pos = _positions[account];

        if (pos.stakedAmount == 0) {
            pos.lastRewardTimestamp = uint64(block.timestamp);
            return;
        }

        uint256 effectiveStake = _getEffectiveStake(account, pos.stakedAmount);
        uint256 earned = (effectiveStake * _rewardPerShareStored) / 1e18;

        if (earned > pos.rewardDebt) {
            unchecked {
                pos.rewardDebt += (earned - pos.rewardDebt);
            }
        }

        pos.lastRewardTimestamp = uint64(block.timestamp);
    }
}
