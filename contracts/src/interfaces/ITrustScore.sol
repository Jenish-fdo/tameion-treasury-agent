// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITrustScore
 * @notice Interface for the TrustScore contract that calculates and
 *         manages reputation scores for identities based on credentials,
 *         attestations, and staking activity.
 */
interface ITrustScore {
    /// @notice Emitted when a trust score is updated
    /// @param identity Address whose score was updated
    /// @param oldScore Previous score
    /// @param newScore New score
    /// @param timestamp Block timestamp of the update
    event TrustScoreUpdated(
        address indexed identity,
        uint256 oldScore,
        uint256 newScore,
        uint256 timestamp
    );

    /// @notice Emitted when a score factor is recorded
    /// @param identity Address whose score factor was recorded
    /// @param factorType Type of score factor (credential, attestation, stake)
    /// @param weight Weight applied to this factor
    /// @param value Value contributed by this factor
    event ScoreFactorRecorded(
        address indexed identity,
        bytes32 factorType,
        uint256 weight,
        uint256 value
    );

    /// @notice Emitted when a score factor is removed
    /// @param identity Address whose score factor was removed
    /// @param factorType Type of score factor removed
    event ScoreFactorRemoved(address indexed identity, bytes32 factorType);

    /// @notice Emitted when a factor weight is updated by the admin
    /// @param factorType Type of score factor
    /// @param oldWeight Previous weight
    /// @param newWeight New weight
    event FactorWeightUpdated(bytes32 factorType, uint256 oldWeight, uint256 newWeight);

    /// @notice Emitted when the CredentialRegistry reference is updated
    /// @param newRegistry New CredentialRegistry address
    event CredentialRegistryUpdated(address newRegistry);

    /// @notice Emitted when the StakingPool reference is updated
    /// @param newStakingPool New StakingPool address
    event StakingPoolUpdated(address newStakingPool);

    /// @notice Score factor types as constants
    /// @dev keccak256("CREDENTIAL") = credential-based score factor
    /// @dev keccak256("ATTESTATION") = attestation-based score factor
    /// @dev keccak256("STAKING") = staking-based score factor

    /**
     * @notice Record a credential-based score factor for an identity
     * @param identity Address to update
     * @param credentialType Type of credential
     * @param value Score value contributed by this credential
     */
    function recordCredentialFactor(address identity, bytes32 credentialType, uint256 value) external;

    /**
     * @notice Record an attestation-based score factor for an identity
     * @param identity Address to update
     * @param attestationType Type of attestation
     * @param value Score value contributed by this attestation
     */
    function recordAttestationFactor(address identity, bytes32 attestationType, uint256 value) external;

    /**
     * @notice Record a staking-based score factor for an identity
     * @param identity Address to update
     * @param stakeAmount Amount staked
     */
    function recordStakingFactor(address identity, uint256 stakeAmount) external;

    /**
     * @notice Remove a score factor for an identity
     * @param identity Address to update
     * @param factorType Type of factor to remove
     */
    function removeFactor(address identity, bytes32 factorType) external;

    /**
     * @notice Get the trust score for an identity
     * @param identity Address to query
     * @return score The trust score (0-10000, representing 0.00-100.00)
     */
    function getScore(address identity) external view returns (uint256 score);

    /**
     * @notice Get detailed score breakdown for an identity
     * @param identity Address to query
     * @return score Total trust score
     * @return credentialScore Score from credentials
     * @return attestationScore Score from attestations
     * @return stakingScore Score from staking
     */
    function getScoreBreakdown(address identity)
        external
        view
        returns (uint256 score, uint256 credentialScore, uint256 attestationScore, uint256 stakingScore);

    /**
     * @notice Set the weight for a score factor type (admin only)
     * @param factorType Type of score factor
     * @param weight New weight (in basis points, 10000 = 100%)
     */
    function setFactorWeight(bytes32 factorType, uint256 weight) external;

    /**
     * @notice Update the CredentialRegistry reference
     * @param newRegistry New registry address
     */
    function setCredentialRegistry(address newRegistry) external;

    /**
     * @notice Update the StakingPool reference
     * @param newStakingPool New staking pool address
     */
    function setStakingPool(address newStakingPool) external;

    /**
     * @notice Recalculate the score for an identity
     * @param identity Address to recalculate
     */
    function recalculateScore(address identity) external;
}
