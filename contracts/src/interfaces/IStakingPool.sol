// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStakingPool
 * @notice Interface for the StakingPool contract that allows users to stake
 *         AUSD tokens, earn rewards proportional to their stake and trust
 *         score, and supports slashing for malicious behavior.
 */
interface IStakingPool {
    /// @notice Emitted when a user stakes tokens
    /// @param staker Address of the staker
    /// @param amount Amount of tokens staked
    /// @param timestamp Block timestamp
    event Staked(address indexed staker, uint256 amount, uint256 timestamp);

    /// @notice Emitted when a user unstakes tokens
    /// @param staker Address of the staker
    /// @param amount Amount of tokens unstaked
    /// @param timestamp Block timestamp
    event Unstaked(address indexed staker, uint256 amount, uint256 timestamp);

    /// @notice Emitted when a user claims their rewards
    /// @param staker Address of the staker
    /// @param amount Amount of rewards claimed
    /// @param timestamp Block timestamp
    event RewardClaimed(address indexed staker, uint256 amount, uint256 timestamp);

    /// @notice Emitted when rewards are added to the pool
    /// @param amount Amount of rewards added
    /// @param timestamp Block timestamp
    event RewardAdded(uint256 amount, uint256 timestamp);

    /// @notice Emitted when a staker is slashed
    /// @param staker Address that was slashed
    /// @param amount Amount of tokens slashed
    /// @param reason Reason for slashing (keccak256 hash)
    /// @param timestamp Block timestamp
    event Slashed(address indexed staker, uint256 amount, bytes32 reason, uint256 timestamp);

    /// @notice Emitted when the reward rate is updated
    /// @param oldRate Previous reward rate
    /// @param newRate New reward rate
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);

    /// @notice Emitted when the TrustScore reference is updated
    /// @param newTrustScore New TrustScore contract address
    event TrustScoreUpdated(address newTrustScore);

    /// @notice Struct representing a user's staking position
    struct StakePosition {
        uint256 stakedAmount;
        uint256 rewardDebt;
        uint64 lastRewardTimestamp;
        uint64 unlockTimestamp;
        bool active;
    }

    /**
     * @notice Stake AUSD tokens into the pool
     * @param amount Amount of AUSD to stake
     */
    function stake(uint256 amount) external;

    /**
     * @notice Unstake AUSD tokens from the pool
     * @param amount Amount of AUSD to unstake
     */
    function unstake(uint256 amount) external;

    /**
     * @notice Claim accumulated staking rewards
     */
    function claimReward() external;

    /**
     * @notice Slash a staker's position (admin/governance only)
     * @param staker Address to slash
     * @param amount Amount to slash
     * @param reason Reason for slashing (keccak256 hash)
     */
    function slash(address staker, uint256 amount, bytes32 reason) external;

    /**
     * @notice Add rewards to the pool
     * @param amount Amount of AUSD to add as rewards
     */
    function addRewards(uint256 amount) external;

    /**
     * @notice Get a user's staking position
     * @param staker Address to query
     * @return position The staking position struct
     */
    function getStake(address staker) external view returns (StakePosition memory position);

    /**
     * @notice Get the pending rewards for a staker
     * @param staker Address to query
     * @return pendingReward Amount of pending rewards
     */
    function getPendingReward(address staker) external view returns (uint256 pendingReward);

    /**
     * @notice Get the total staked amount in the pool
     * @return totalStaked Total tokens staked
     */
    function getTotalStaked() external view returns (uint256 totalStaked);

    /**
     * @notice Set the reward rate (admin only)
     * @param newRate New reward rate per second (in tokens)
     */
    function setRewardRate(uint256 newRate) external;

    /**
     * @notice Update the TrustScore contract reference
     * @param newTrustScore New TrustScore address
     */
    function setTrustScore(address newTrustScore) external;
}
