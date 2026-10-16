// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITrustScore} from "./interfaces/ITrustScore.sol";
import {ICredentialRegistry} from "./interfaces/ICredentialRegistry.sol";

/**
 * @title TrustScore
 * @notice Computes and manages reputation scores for identities based on
 *         credentials, attestations, and staking activity. Scores are
 *         expressed in basis points (0-10000, representing 0.00-100.00)
 *         and weighted by configurable factor types.
 *
 * @dev Score factors are recorded by authorized callers (CredentialRegistry,
 *      AttestationRegistry, StakingPool) via `onlyTrustedSource` modifier.
 *      Weights for each factor type are set by the owner and must sum to
 *      <= 10000 basis points.
 *
 * @custom:deploy-target Monad testnet (chain ID 10143)
 */
contract TrustScore is ITrustScore, Ownable, ReentrancyGuard {
    // ──────────────────────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────────────────────

    /// @notice Score factor type for credentials
    bytes32 public constant CREDENTIAL_FACTOR = keccak256("CREDENTIAL");

    /// @notice Score factor type for attestations
    bytes32 public constant ATTESTATION_FACTOR = keccak256("ATTESTATION");

    /// @notice Score factor type for staking
    bytes32 public constant STAKING_FACTOR = keccak256("STAKING");

    /// @notice Maximum score value (10000 = 100.00%)
    uint256 public constant MAX_SCORE = 10000;

    // ──────────────────────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────────────────────

    /// @notice Trusted source contracts allowed to record factors
    mapping(address => bool) internal _trustedSources;

    /// @notice Factor weights per type (in basis points)
    mapping(bytes32 => uint256) internal _factorWeights;

    /// @notice Per-identity, per-factor-type accumulated values
    mapping(address => mapping(bytes32 => uint256)) internal _factorValues;

    /// @notice Per-identity final score (cached, recalculated on update)
    mapping(address => uint256) internal _scores;

    /// @notice Timestamp of last score update per identity
    mapping(address => uint256) internal _lastUpdated;

    /// @notice CredentialRegistry contract reference
    ICredentialRegistry public credentialRegistry;

    /// @notice StakingPool contract reference (address, set by owner)
    address public stakingPool;

    // ──────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────

    /// @dev Restricts to trusted source contracts only
    modifier onlyTrustedSource() {
        if (!_trustedSources[msg.sender]) {
            revert NotTrustedSource(msg.sender);
        }
        _;
    }

    /// @dev Restricts to trusted source or owner (for recalculation)
    modifier onlyTrustedSourceOrOwner() {
        if (!_trustedSources[msg.sender] && msg.sender != owner()) {
            revert NotTrustedSource(msg.sender);
        }
        _;
    }

    // ──────────────────────────────────────────────────────────────
    // Custom Errors
    // ──────────────────────────────────────────────────────────────

    error NotTrustedSource(address caller);
    error ZeroAddress();
    error InvalidWeight(uint256 weight);
    error WeightsExceedMax(uint256 total);
    error InvalidFactorType(bytes32 factorType);

    // ──────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────

    /**
     * @notice Initializes the TrustScore contract with default weights
     * @param initialOwner Address of the contract owner
     * @param _credentialRegistry Address of the CredentialRegistry contract
     * @param _stakingPool Address of the StakingPool contract
     *
     * @dev Default weights: CREDENTIAL 40%, ATTESTATION 35%, STAKING 25%.
     *      These can be adjusted by the owner via {setFactorWeight}.
     */
    constructor(
        address initialOwner,
        address _credentialRegistry,
        address _stakingPool
    ) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();

        // Set default factor weights (basis points)
        _factorWeights[CREDENTIAL_FACTOR] = 4000;   // 40%
        _factorWeights[ATTESTATION_FACTOR] = 3500;  // 35%
        _factorWeights[STAKING_FACTOR] = 2500;       // 25%

        if (_credentialRegistry != address(0)) {
            credentialRegistry = ICredentialRegistry(_credentialRegistry);
            _trustedSources[_credentialRegistry] = true;
        }
        if (_stakingPool != address(0)) {
            stakingPool = _stakingPool;
            _trustedSources[_stakingPool] = true;
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Factor Recording (trusted sources only)
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Callable only by the CredentialRegistry or other trusted source.
     *      Records the value as the new cumulative credential factor for
     *      the identity, then triggers score recalculation.
     */
    function recordCredentialFactor(
        address identity,
        bytes32 credentialType,
        uint256 value
    ) external override onlyTrustedSource nonReentrant {
        // Accumulate per credential type into the credential factor bucket
        uint256 current = _factorValues[identity][CREDENTIAL_FACTOR];
        _factorValues[identity][CREDENTIAL_FACTOR] = current + value;

        emit ScoreFactorRecorded(identity, CREDENTIAL_FACTOR, _factorWeights[CREDENTIAL_FACTOR], value);

        _updateScore(identity);
    }

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Callable only by trusted attestation sources. Accumulates the
     *      attestation value into the attestation factor bucket.
     */
    function recordAttestationFactor(
        address identity,
        bytes32 attestationType,
        uint256 value
    ) external override onlyTrustedSource nonReentrant {
        uint256 current = _factorValues[identity][ATTESTATION_FACTOR];
        _factorValues[identity][ATTESTATION_FACTOR] = current + value;

        emit ScoreFactorRecorded(identity, ATTESTATION_FACTOR, _factorWeights[ATTESTATION_FACTOR], value);

        _updateScore(identity);
    }

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Callable only by the StakingPool. Converts raw stake amount
     *      into a score value (capped at MAX_SCORE) and records it.
     */
    function recordStakingFactor(address identity, uint256 stakeAmount)
        external
        override
        onlyTrustedSource
        nonReentrant
    {
        // Cap staking value at MAX_SCORE (10000 = 100%)
        uint256 value = stakeAmount > MAX_SCORE ? MAX_SCORE : stakeAmount;
        _factorValues[identity][STAKING_FACTOR] = value;

        emit ScoreFactorRecorded(identity, STAKING_FACTOR, _factorWeights[STAKING_FACTOR], value);

        _updateScore(identity);
    }

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Zeroes out the factor value and recalculates the score.
     *      Only trusted sources or owner can remove factors.
     */
    function removeFactor(address identity, bytes32 factorType)
        external
        override
        onlyTrustedSourceOrOwner
    {
        _factorValues[identity][factorType] = 0;

        emit ScoreFactorRemoved(identity, factorType);

        _updateScore(identity);
    }

    // ──────────────────────────────────────────────────────────────
    // Score Calculation
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Returns the cached score. The score is always up-to-date
     *      because it is recalculated whenever a factor is recorded
     *      or removed. For external read-heavy consumers, this is O(1).
     */
    function getScore(address identity) external view override returns (uint256 score) {
        return _scores[identity];
    }

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Returns a full breakdown of the score components.
     *      Each sub-score is the weighted value of its factor.
     */
    function getScoreBreakdown(address identity)
        external
        view
        override
        returns (uint256 score, uint256 credentialScore, uint256 attestationScore, uint256 stakingScore)
    {
        credentialScore = (_factorValues[identity][CREDENTIAL_FACTOR] *
            _factorWeights[CREDENTIAL_FACTOR]) / MAX_SCORE;

        attestationScore = (_factorValues[identity][ATTESTATION_FACTOR] *
            _factorWeights[ATTESTATION_FACTOR]) / MAX_SCORE;

        stakingScore = (_factorValues[identity][STAKING_FACTOR] *
            _factorWeights[STAKING_FACTOR]) / MAX_SCORE;

        // Sum capped at MAX_SCORE
        uint256 total = credentialScore + attestationScore + stakingScore;
        score = total > MAX_SCORE ? MAX_SCORE : total;
    }

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Forces a recalculation of the identity's score. Anyone can
     *      call this if they want to ensure the cached score is fresh.
     *      In practice, scores are always fresh due to auto-recalculation.
     */
    function recalculateScore(address identity) external override {
        _updateScore(identity);
    }

    // ──────────────────────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Sets the weight for a factor type. Weights are in basis points.
     *      The sum of all weights must not exceed MAX_SCORE (10000).
     *      Emits {FactorWeightUpdated}.
     */
    function setFactorWeight(bytes32 factorType, uint256 weight) external override onlyOwner {
        if (weight > MAX_SCORE) revert InvalidWeight(weight);

        uint256 oldWeight = _factorWeights[factorType];
        _factorWeights[factorType] = weight;

        emit FactorWeightUpdated(factorType, oldWeight, weight);

        // Verify total weights do not exceed max
        uint256 total = _factorWeights[CREDENTIAL_FACTOR] +
            _factorWeights[ATTESTATION_FACTOR] +
            _factorWeights[STAKING_FACTOR];
        if (total > MAX_SCORE) revert WeightsExceedMax(total);
    }

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Updates the CredentialRegistry reference and grants
     *      trusted source status to the new address. Removes trusted
     *      status from the old address.
     */
    function setCredentialRegistry(address newRegistry) external override onlyOwner {
        if (newRegistry == address(0)) revert ZeroAddress();

        // Remove old trusted source
        address oldRegistry = address(credentialRegistry);
        if (oldRegistry != address(0)) {
            _trustedSources[oldRegistry] = false;
        }

        credentialRegistry = ICredentialRegistry(newRegistry);
        _trustedSources[newRegistry] = true;

        emit CredentialRegistryUpdated(newRegistry);
    }

    /**
     * @inheritdoc ITrustScore
     *
     * @dev Updates the StakingPool reference and grants trusted source
     *      status to the new address.
     */
    function setStakingPool(address newStakingPool) external override onlyOwner {
        if (newStakingPool == address(0)) revert ZeroAddress();

        if (stakingPool != address(0)) {
            _trustedSources[stakingPool] = false;
        }

        stakingPool = newStakingPool;
        _trustedSources[newStakingPool] = true;

        emit StakingPoolUpdated(newStakingPool);
    }

    // ──────────────────────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────────────────────

    /**
     * @notice Get the raw factor value for a specific identity and type
     * @param identity Address to query
     * @param factorType Type of factor
     * @return value The raw (unweighted) factor value
     */
    function getFactorValue(address identity, bytes32 factorType)
        external
        view
        returns (uint256 value)
    {
        return _factorValues[identity][factorType];
    }

    /**
     * @notice Get the weight for a specific factor type
     * @param factorType Type of factor
     * @return weight The weight in basis points
     */
    function getFactorWeight(bytes32 factorType) external view returns (uint256 weight) {
        return _factorWeights[factorType];
    }

    /**
     * @notice Get the last update timestamp for an identity's score
     * @param identity Address to query
     * @return timestamp Block timestamp of last update
     */
    function getLastUpdated(address identity) external view returns (uint256 timestamp) {
        return _lastUpdated[identity];
    }

    /**
     * @notice Check if an address is a trusted source
     * @param source Address to check
     * @return isTrusted Whether the address is trusted
     */
    function isTrustedSource(address source) external view returns (bool isTrusted) {
        return _trustedSources[source];
    }

    // ──────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────

    /**
     * @dev Recalculates the total score for an identity by summing
     *      weighted factor values. Capped at MAX_SCORE (10000).
     *      Emits {TrustScoreUpdated} when the score changes.
     *
     * Gas optimization: Uses cached reads from storage, computes in
     * memory, then writes once. `unchecked` used for arithmetic since
     * values are bounded by MAX_SCORE.
     */
    function _updateScore(address identity) internal {
        uint256 oldScore = _scores[identity];

        uint256 credScore = (_factorValues[identity][CREDENTIAL_FACTOR] *
            _factorWeights[CREDENTIAL_FACTOR]) / MAX_SCORE;

        uint256 attestScore = (_factorValues[identity][ATTESTATION_FACTOR] *
            _factorWeights[ATTESTATION_FACTOR]) / MAX_SCORE;

        uint256 stakeScore = (_factorValues[identity][STAKING_FACTOR] *
            _factorWeights[STAKING_FACTOR]) / MAX_SCORE;

        uint256 newScore;
        unchecked {
            newScore = credScore + attestScore + stakeScore;
        }
        if (newScore > MAX_SCORE) {
            newScore = MAX_SCORE;
        }

        _scores[identity] = newScore;
        _lastUpdated[identity] = block.timestamp;

        if (newScore != oldScore) {
            emit TrustScoreUpdated(identity, oldScore, newScore, block.timestamp);
        }
    }
}
