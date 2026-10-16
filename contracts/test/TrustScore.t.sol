// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TrustScore} from "../src/TrustScore.sol";
import {ITrustScore} from "../src/interfaces/ITrustScore.sol";
import {ICredentialRegistry} from "../src/interfaces/ICredentialRegistry.sol";

/**
 * @title TrustScoreTest
 * @notice Comprehensive tests for the TrustScore contract covering
 *         score calculation, breakdown, updates, boundary conditions,
 *         weight management, and access control.
 */
contract TrustScoreTest is Test {
    TrustScore public trustScore;
    address public owner;
    address public trustedSource;
    address public identity;
    address public untrusted;

    bytes32 internal constant CRED_TYPE = keccak256("EMAIL_VERIFICATION");
    bytes32 internal constant ATTEST_TYPE = keccak256("REPUTATION");

    function setUp() public {
        owner = address(this);
        trustedSource = makeAddr("trustedSource");
        identity = makeAddr("identity");
        untrusted = makeAddr("untrusted");

        // Deploy with no initial references; we'll add trusted source manually
        trustScore = new TrustScore(owner, address(0), address(0));

        // Manually add a trusted source by setting the credential registry ref
        // We use the setCredentialRegistry to add a trusted source
        // But setCredentialRegistry validates non-zero address
        // So we deploy a minimal mock to use as a trusted source
        // Actually, we can use setCredentialRegistry with any address
        trustScore.setCredentialRegistry(trustedSource);
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    function _recordCredential(address idn, uint256 value) internal {
        vm.prank(trustedSource);
        trustScore.recordCredentialFactor(idn, CRED_TYPE, value);
    }

    function _recordAttestation(address idn, uint256 value) internal {
        vm.prank(trustedSource);
        trustScore.recordAttestationFactor(idn, ATTEST_TYPE, value);
    }

    function _recordStaking(address idn, uint256 amount) internal {
        vm.prank(trustedSource);
        trustScore.recordStakingFactor(idn, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    // Constructor & Deployment
    // ═══════════════════════════════════════════════════════════════

    function test_Constructor_SetsOwner() public view {
        assertEq(trustScore.owner(), owner);
    }

    function test_Constructor_SetsDefaultWeights() public view {
        assertEq(trustScore.getFactorWeight(trustScore.CREDENTIAL_FACTOR()), 4000);
        assertEq(trustScore.getFactorWeight(trustScore.ATTESTATION_FACTOR()), 3500);
        assertEq(trustScore.getFactorWeight(trustScore.STAKING_FACTOR()), 2500);
    }

    function test_Constructor_RevertZeroOwner() public {
        vm.expectRevert(); // OZ Ownable reverts with OwnableInvalidOwner
        new TrustScore(address(0), address(0), address(0));
    }

    function test_Constructor_WithInitialReferences() public {
        address credReg = makeAddr("credReg");
        address stakePool = makeAddr("stakePool");

        TrustScore ts = new TrustScore(owner, credReg, stakePool);

        assertTrue(ts.isTrustedSource(credReg));
        assertTrue(ts.isTrustedSource(stakePool));
    }

    // ═══════════════════════════════════════════════════════════════
    // Score Calculation
    // ═══════════════════════════════════════════════════════════════

    function test_Score_InitiallyZero() public view {
        assertEq(trustScore.getScore(identity), 0);
    }

    function test_Score_AfterCredentialFactor() public {
        _recordCredential(identity, 2500); // 2500 * 4000 / 10000 = 1000

        assertEq(trustScore.getScore(identity), 1000);
    }

    function test_Score_AfterAttestationFactor() public {
        _recordAttestation(identity, 2000); // 2000 * 3500 / 10000 = 700

        assertEq(trustScore.getScore(identity), 700);
    }

    function test_Score_AfterStakingFactor() public {
        _recordStaking(identity, 4000); // 4000 * 2500 / 10000 = 1000

        assertEq(trustScore.getScore(identity), 1000);
    }

    function test_Score_AllFactorsCombined() public {
        _recordCredential(identity, 2500);  // 1000
        _recordAttestation(identity, 2000);  // 700
        _recordStaking(identity, 4000);       // 1000

        assertEq(trustScore.getScore(identity), 2700);
    }

    function test_Score_AccumulatesAcrossRecords() public {
        _recordCredential(identity, 1000);  // 400
        _recordCredential(identity, 1500);  // +600 => 1000 total

        assertEq(trustScore.getScore(identity), 1000);
    }

    function test_Score_UpdatesAfterFactorRemoval() public {
        _recordCredential(identity, 2500); // score = 1000
        assertEq(trustScore.getScore(identity), 1000);

        vm.prank(trustedSource);
        trustScore.removeFactor(identity, trustScore.CREDENTIAL_FACTOR());

        assertEq(trustScore.getScore(identity), 0);
    }

    function test_Score_EmitsUpdatedEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ITrustScore.TrustScoreUpdated(identity, 0, 1000, block.timestamp);
        _recordCredential(identity, 2500);
    }

    // ═══════════════════════════════════════════════════════════════
    // Score Breakdown
    // ═══════════════════════════════════════════════════════════════

    function test_GetScoreBreakdown_AllFactors() public {
        _recordCredential(identity, 2500);  // weighted: 1000
        _recordAttestation(identity, 2000);  // weighted: 700
        _recordStaking(identity, 4000);       // weighted: 1000

        (
            uint256 total,
            uint256 credScore,
            uint256 attestScore,
            uint256 stakeScore
        ) = trustScore.getScoreBreakdown(identity);

        assertEq(total, 2700);
        assertEq(credScore, 1000);
        assertEq(attestScore, 700);
        assertEq(stakeScore, 1000);
    }

    function test_GetScoreBreakdown_PartialFactors() public {
        _recordCredential(identity, 2500); // only credential

        (uint256 total, uint256 credScore, uint256 attestScore, uint256 stakeScore) =
            trustScore.getScoreBreakdown(identity);

        assertEq(total, 1000);
        assertEq(credScore, 1000);
        assertEq(attestScore, 0);
        assertEq(stakeScore, 0);
    }

    function test_GetScoreBreakdown_NoFactors() public view {
        (uint256 total, uint256 credScore, uint256 attestScore, uint256 stakeScore) =
            trustScore.getScoreBreakdown(identity);

        assertEq(total, 0);
        assertEq(credScore, 0);
        assertEq(attestScore, 0);
        assertEq(stakeScore, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // Boundary Conditions
    // ═══════════════════════════════════════════════════════════════

    function test_Score_BoundaryZero() public {
        // Record zero value
        _recordCredential(identity, 0);
        assertEq(trustScore.getScore(identity), 0);
    }

    function test_Score_BoundaryMaxScore() public {
        // CREDENTIAL_FACTOR weight = 4000 (40%)
        // To get max (10000), need factor value = 10000 * 10000 / 4000 = 25000
        _recordCredential(identity, 25000);
        _recordAttestation(identity, 25000); // 25000 * 3500/10000 = 8750 => capped
        _recordStaking(identity, 10000);       // 10000 * 2500/10000 = 2500

        uint256 score = trustScore.getScore(identity);
        assertEq(score, 10000); // Capped at MAX_SCORE
    }

    function test_Score_StakingCappedAtMaxScore() public {
        // recordStakingFactor caps value at MAX_SCORE (10000) internally
        _recordStaking(identity, 999999);

        // factor value should be capped at 10000
        assertEq(trustScore.getFactorValue(identity, trustScore.STAKING_FACTOR()), 10000);
    }

    function test_Score_DoesNotExceedMax() public {
        // Set all factors to max
        _recordCredential(identity, 100000);
        _recordAttestation(identity, 100000);
        _recordStaking(identity, 100000);

        uint256 score = trustScore.getScore(identity);
        assertLe(score, trustScore.MAX_SCORE());
    }

    // ═══════════════════════════════════════════════════════════════
    // Staking Factor Special Behavior
    // ═══════════════════════════════════════════════════════════════

    function test_RecordStakingFactor_ReplacesPreviousValue() public {
        _recordStaking(identity, 5000);
        assertEq(trustScore.getFactorValue(identity, trustScore.STAKING_FACTOR()), 5000);

        // recordStakingFactor sets (not accumulates) the staking value
        _recordStaking(identity, 3000);
        assertEq(trustScore.getFactorValue(identity, trustScore.STAKING_FACTOR()), 3000);
    }

    function test_RecordCredentialFactor_Accumulates() public {
        _recordCredential(identity, 1000);
        assertEq(trustScore.getFactorValue(identity, trustScore.CREDENTIAL_FACTOR()), 1000);

        _recordCredential(identity, 500);
        assertEq(trustScore.getFactorValue(identity, trustScore.CREDENTIAL_FACTOR()), 1500);
    }

    // ═══════════════════════════════════════════════════════════════
    // Recalculation
    // ═══════════════════════════════════════════════════════════════

    function test_RecalculateScore_NoChange() public {
        _recordCredential(identity, 2500);
        uint256 scoreBefore = trustScore.getScore(identity);

        trustScore.recalculateScore(identity);

        assertEq(trustScore.getScore(identity), scoreBefore);
    }

    function test_GetLastUpdated_SetOnRecord() public {
        _recordCredential(identity, 2500);
        assertGt(trustScore.getLastUpdated(identity), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // Weight Management
    // ═══════════════════════════════════════════════════════════════

    function test_SetFactorWeight_Success() public {
        // Reduce other weights first so total stays <= MAX_SCORE
        trustScore.setFactorWeight(trustScore.ATTESTATION_FACTOR(), 3000);
        trustScore.setFactorWeight(trustScore.STAKING_FACTOR(), 2000);
        // Now CREDENTIAL(4000) + 3000 + 2000 = 9000, can set to 5000 => total 10000
        trustScore.setFactorWeight(trustScore.CREDENTIAL_FACTOR(), 5000);
        assertEq(trustScore.getFactorWeight(trustScore.CREDENTIAL_FACTOR()), 5000);
    }

    function test_SetFactorWeight_EmitsEvent() public {
        trustScore.setFactorWeight(trustScore.ATTESTATION_FACTOR(), 3000);
        trustScore.setFactorWeight(trustScore.STAKING_FACTOR(), 2000);

        vm.expectEmit(false, false, false, true);
        emit ITrustScore.FactorWeightUpdated(trustScore.CREDENTIAL_FACTOR(), 4000, 5000);
        trustScore.setFactorWeight(trustScore.CREDENTIAL_FACTOR(), 5000);
    }

    function test_SetFactorWeight_RevertExceedsMax() public {
        bytes32 credFactor = trustScore.CREDENTIAL_FACTOR();
        vm.expectRevert(
            abi.encodeWithSelector(TrustScore.InvalidWeight.selector, uint256(10001))
        );
        trustScore.setFactorWeight(credFactor, 10001);
    }

    function test_SetFactorWeight_RevertWeightsExceedMax() public {
        bytes32 credFactor = trustScore.CREDENTIAL_FACTOR();
        vm.expectRevert(abi.encodeWithSelector(TrustScore.WeightsExceedMax.selector, uint256(12001)));
        trustScore.setFactorWeight(credFactor, 6001);
    }

    function test_SetFactorWeight_RevertNotOwner() public {
        bytes32 credFactor = trustScore.CREDENTIAL_FACTOR();
        vm.expectRevert(); // OZ OwnableUnauthorizedAccount
        vm.prank(untrusted);
        trustScore.setFactorWeight(credFactor, 5000);
    }

    function test_Score_UpdatesAfterWeightChange() public {
        _recordCredential(identity, 2500); // 2500 * 4000/10000 = 1000
        assertEq(trustScore.getScore(identity), 1000);

        // Change CREDENTIAL weight to 8000 (80%), reduce others to 1000 each
        trustScore.setFactorWeight(trustScore.ATTESTATION_FACTOR(), 1000);
        trustScore.setFactorWeight(trustScore.STAKING_FACTOR(), 1000);
        trustScore.setFactorWeight(trustScore.CREDENTIAL_FACTOR(), 8000);

        // Recalculate
        trustScore.recalculateScore(identity);

        // 2500 * 8000/10000 = 2000
        assertEq(trustScore.getScore(identity), 2000);
    }

    // ═══════════════════════════════════════════════════════════════
    // Reference Management
    // ═══════════════════════════════════════════════════════════════

    function test_SetCredentialRegistry_Success() public {
        address newRegistry = makeAddr("newRegistry");

        vm.expectEmit(false, false, false, true);
        emit ITrustScore.CredentialRegistryUpdated(newRegistry);
        trustScore.setCredentialRegistry(newRegistry);

        assertTrue(trustScore.isTrustedSource(newRegistry));
        // Old trusted source should be removed
        assertFalse(trustScore.isTrustedSource(trustedSource));
    }

    function test_SetStakingPool_Success() public {
        address newPool = makeAddr("newPool");

        vm.expectEmit(false, false, false, true);
        emit ITrustScore.StakingPoolUpdated(newPool);
        trustScore.setStakingPool(newPool);

        assertTrue(trustScore.isTrustedSource(newPool));
        assertEq(trustScore.stakingPool(), newPool);
    }

    function test_SetCredentialRegistry_RevertZeroAddress() public {
        vm.expectRevert(TrustScore.ZeroAddress.selector);
        trustScore.setCredentialRegistry(address(0));
    }

    function test_SetStakingPool_RevertZeroAddress() public {
        vm.expectRevert(TrustScore.ZeroAddress.selector);
        trustScore.setStakingPool(address(0));
    }

    function test_SetCredentialRegistry_RevertNotOwner() public {
        vm.prank(untrusted);
        vm.expectRevert();
        trustScore.setCredentialRegistry(makeAddr("new"));
    }

    // ═══════════════════════════════════════════════════════════════
    // Access Control
    // ═══════════════════════════════════════════════════════════════

    function test_RecordCredentialFactor_RevertUntrusted() public {
        vm.prank(untrusted);
        vm.expectRevert(
            abi.encodeWithSelector(TrustScore.NotTrustedSource.selector, untrusted)
        );
        trustScore.recordCredentialFactor(identity, CRED_TYPE, 1000);
    }

    function test_RecordAttestationFactor_RevertUntrusted() public {
        vm.prank(untrusted);
        vm.expectRevert(
            abi.encodeWithSelector(TrustScore.NotTrustedSource.selector, untrusted)
        );
        trustScore.recordAttestationFactor(identity, ATTEST_TYPE, 1000);
    }

    function test_RecordStakingFactor_RevertUntrusted() public {
        vm.prank(untrusted);
        vm.expectRevert(
            abi.encodeWithSelector(TrustScore.NotTrustedSource.selector, untrusted)
        );
        trustScore.recordStakingFactor(identity, 1000);
    }

    function test_RemoveFactor_RevertUntrusted() public {
        _recordCredential(identity, 1000);

        bytes32 credFactor = trustScore.CREDENTIAL_FACTOR();
        vm.expectRevert(
            abi.encodeWithSelector(TrustScore.NotTrustedSource.selector, untrusted)
        );
        vm.prank(untrusted);
        trustScore.removeFactor(identity, credFactor);
    }

    function test_RemoveFactor_ByOwner() public {
        _recordCredential(identity, 2500);
        assertEq(trustScore.getScore(identity), 1000);

        // Owner can remove factors
        trustScore.removeFactor(identity, trustScore.CREDENTIAL_FACTOR());
        assertEq(trustScore.getScore(identity), 0);
    }

    function test_RemoveFactor_EmitsEvent() public {
        _recordCredential(identity, 1000);

        vm.expectEmit(true, false, false, false);
        emit ITrustScore.ScoreFactorRemoved(identity, trustScore.CREDENTIAL_FACTOR());
        trustScore.removeFactor(identity, trustScore.CREDENTIAL_FACTOR());
    }

    // ═══════════════════════════════════════════════════════════════
    // Factor Recording Events
    // ═══════════════════════════════════════════════════════════════

    function test_RecordCredentialFactor_EmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ITrustScore.ScoreFactorRecorded(
            identity,
            trustScore.CREDENTIAL_FACTOR(),
            4000,
            2500
        );
        _recordCredential(identity, 2500);
    }

    function test_RecordStakingFactor_EmitsEvent() public {
        uint256 amount = 5000;
        vm.expectEmit(true, false, false, true);
        emit ITrustScore.ScoreFactorRecorded(
            identity,
            trustScore.STAKING_FACTOR(),
            2500,
            amount
        );
        _recordStaking(identity, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    // Independent Identities
    // ═══════════════════════════════════════════════════════════════

    function test_Scores_AreIndependent() public {
        address identity2 = makeAddr("identity2");

        _recordCredential(identity, 2500);
        _recordCredential(identity2, 5000);

        assertEq(trustScore.getScore(identity), 1000);
        assertEq(trustScore.getScore(identity2), 2000);
    }

    // ═══════════════════════════════════════════════════════════════
    // Fuzz Tests
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_Score_NeverExceedsMax(uint256 credValue, uint256 attestValue, uint256 stakeAmount) public {
        // Bound to avoid overflow in accumulation
        credValue = bound(credValue, 0, 10000);
        attestValue = bound(attestValue, 0, 10000);
        stakeAmount = bound(stakeAmount, 0, 10000);

        _recordCredential(identity, credValue);
        _recordAttestation(identity, attestValue);
        _recordStaking(identity, stakeAmount);

        assertLe(trustScore.getScore(identity), trustScore.MAX_SCORE());
    }

    function testFuzz_RemoveFactor_ResetsScore(uint256 value) public {
        // Bound to avoid overflow
        value = bound(value, 25, 10000);

        _recordCredential(identity, value);
        assertGt(trustScore.getScore(identity), 0);

        trustScore.removeFactor(identity, trustScore.CREDENTIAL_FACTOR());
        assertEq(trustScore.getScore(identity), 0);
    }
}
