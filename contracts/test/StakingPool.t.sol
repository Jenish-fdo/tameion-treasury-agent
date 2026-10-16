// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StakingPool} from "../src/StakingPool.sol";
import {TrustScore} from "../src/TrustScore.sol";
import {IStakingPool} from "../src/interfaces/IStakingPool.sol";
import {ITrustScore} from "../src/interfaces/ITrustScore.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

/**
 * @title StakingPoolTest
 * @notice Comprehensive tests for the StakingPool contract covering
 *         staking, unstaking with cooldown, reward claiming, slashing,
 *         and reentrancy protection.
 */
contract StakingPoolTest is Test {
    MockAUSD public ausd;
    StakingPool public stakingPool;
    TrustScore public trustScore;

    address public owner;
    address public alice;
    address public bob;
    address public attacker;

    uint256 internal constant STAKE_AMOUNT = 100 ether;
    uint256 internal constant REWARD_RATE = 1 ether; // 1 AUSD/sec
    uint256 internal constant LOCK_PERIOD = 7 days;

    function setUp() public {
        owner = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        attacker = makeAddr("attacker");

        // Deploy mock AUSD
        ausd = new MockAUSD();

        // Deploy TrustScore (no trusted sources needed for basic tests)
        trustScore = new TrustScore(owner, address(0), address(0));

        // Deploy StakingPool with AUSD and reward rate
        stakingPool = new StakingPool(
            address(ausd),
            owner,
            address(0), // no trust score for basic tests
            REWARD_RATE
        );

        // Fund pool with rewards
        ausd.mint(address(stakingPool), 1_000_000 ether);

        // Fund users
        ausd.mint(alice, 1000 ether);
        ausd.mint(bob, 1000 ether);
        ausd.mint(attacker, 1000 ether);

        // Approve staking pool
        vm.startPrank(alice);
        ausd.approve(address(stakingPool), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        ausd.approve(address(stakingPool), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(attacker);
        ausd.approve(address(stakingPool), type(uint256).max);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    function _stake(address staker, uint256 amount) internal {
        vm.prank(staker);
        stakingPool.stake(amount);
    }

    function _unstake(address staker, uint256 amount) internal {
        vm.prank(staker);
        stakingPool.unstake(amount);
    }

    function _deployWithTrustScore() internal returns (StakingPool pool, TrustScore ts) {
        ts = new TrustScore(owner, address(0), address(0));
        pool = new StakingPool(address(ausd), owner, address(ts), REWARD_RATE);
        ts.setStakingPool(address(pool));
        ausd.mint(address(pool), 1_000_000 ether);

        // Re-approve for new pool
        vm.startPrank(alice);
        ausd.approve(address(pool), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(bob);
        ausd.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    // Constructor & Deployment
    // ═══════════════════════════════════════════════════════════════

    function test_Constructor_SetsOwner() public view {
        assertEq(stakingPool.owner(), owner);
    }

    function test_Constructor_SetsAusd() public view {
        assertEq(address(stakingPool.ausd()), address(ausd));
    }

    function test_Constructor_SetsRewardRate() public view {
        assertEq(stakingPool.rewardRate(), REWARD_RATE);
    }

    function test_Constructor_RevertZeroAusd() public {
        vm.expectRevert(StakingPool.ZeroAddress.selector);
        new StakingPool(address(0), owner, address(0), REWARD_RATE);
    }

    function test_Constructor_RevertZeroOwner() public {
        vm.expectRevert(); // OZ OwnableInvalidOwner
        new StakingPool(address(ausd), address(0), address(0), REWARD_RATE);
    }

    function test_Constructor_WithTrustScore() public {
        StakingPool pool = new StakingPool(address(ausd), owner, address(trustScore), REWARD_RATE);
        assertEq(address(pool.trustScore()), address(trustScore));
    }

    // ═══════════════════════════════════════════════════════════════
    // Staking — Success Cases
    // ═══════════════════════════════════════════════════════════════

    function test_Stake_Success() public {
        _stake(alice, STAKE_AMOUNT);

        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, STAKE_AMOUNT);
        assertTrue(pos.active);
        assertEq(pos.unlockTimestamp, uint64(block.timestamp) + LOCK_PERIOD);
    }

    function test_Stake_TransfersTokens() public {
        uint256 poolBefore = ausd.balanceOf(address(stakingPool));
        uint256 aliceBefore = ausd.balanceOf(alice);

        _stake(alice, STAKE_AMOUNT);

        assertEq(ausd.balanceOf(address(stakingPool)), poolBefore + STAKE_AMOUNT);
        assertEq(ausd.balanceOf(alice), aliceBefore - STAKE_AMOUNT);
    }

    function test_Stake_EmitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit IStakingPool.Staked(alice, STAKE_AMOUNT, block.timestamp);
        stakingPool.stake(STAKE_AMOUNT);
    }

    function test_Stake_UpdatesTotalStaked() public {
        _stake(alice, STAKE_AMOUNT);
        assertEq(stakingPool.getTotalStaked(), STAKE_AMOUNT);
    }

    function test_Stake_MultipleUsers() public {
        _stake(alice, STAKE_AMOUNT);
        _stake(bob, STAKE_AMOUNT);

        assertEq(stakingPool.getTotalStaked(), STAKE_AMOUNT * 2);
    }

    function test_Stake_IncreasesExistingPosition() public {
        _stake(alice, STAKE_AMOUNT);
        _stake(alice, STAKE_AMOUNT);

        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, STAKE_AMOUNT * 2);
    }

    function test_Stake_MinimumAmount() public {
        _stake(alice, stakingPool.MIN_STAKE());

        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, stakingPool.MIN_STAKE());
    }

    // ═══════════════════════════════════════════════════════════════
    // Staking — Failure Cases
    // ═══════════════════════════════════════════════════════════════

    function test_Stake_RevertBelowMinimum() public {
        uint256 minStake = stakingPool.MIN_STAKE();
        vm.expectRevert(
            abi.encodeWithSelector(
                StakingPool.InsufficientStake.selector,
                minStake,
                minStake - 1
            )
        );
        vm.prank(alice);
        stakingPool.stake(minStake - 1);
    }

    function test_Stake_RevertZeroAmount() public {
        // Zero amount hits InsufficientStake before AmountZero since 0 < MIN_STAKE
        uint256 minStake = stakingPool.MIN_STAKE();
        vm.expectRevert(
            abi.encodeWithSelector(
                StakingPool.InsufficientStake.selector,
                minStake,
                uint256(0)
            )
        );
        vm.prank(alice);
        stakingPool.stake(0);
    }

    // ═══════════════════════════════════════════════════════════════
    // Unstaking — Success Cases
    // ═══════════════════════════════════════════════════════════════

    function test_Unstake_AfterCooldown() public {
        _stake(alice, STAKE_AMOUNT);

        // Warp past lock period
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        _unstake(alice, STAKE_AMOUNT);

        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, 0);
        assertFalse(pos.active);
    }

    function test_Unstake_TransfersTokens() public {
        _stake(alice, STAKE_AMOUNT);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        uint256 aliceBefore = ausd.balanceOf(alice);

        _unstake(alice, STAKE_AMOUNT);

        assertGt(ausd.balanceOf(alice), aliceBefore + STAKE_AMOUNT, "should receive staked amount plus accrued rewards");
    }

    function test_Unstake_EmitsEvent() public {
        _stake(alice, STAKE_AMOUNT);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit IStakingPool.Unstaked(alice, STAKE_AMOUNT, block.timestamp);
        stakingPool.unstake(STAKE_AMOUNT);
    }

    function test_Unstake_Partial() public {
        _stake(alice, STAKE_AMOUNT * 2);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        _unstake(alice, STAKE_AMOUNT);

        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, STAKE_AMOUNT);
        assertTrue(pos.active);
    }

    function test_Unstake_UpdatesTotalStaked() public {
        _stake(alice, STAKE_AMOUNT);
        _stake(bob, STAKE_AMOUNT);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        _unstake(alice, STAKE_AMOUNT);

        assertEq(stakingPool.getTotalStaked(), STAKE_AMOUNT);
    }

    // ═══════════════════════════════════════════════════════════════
    // Unstaking — Failure Cases
    // ═══════════════════════════════════════════════════════════════

    function test_Unstake_RevertStillLocked() public {
        _stake(alice, STAKE_AMOUNT);

        uint64 unlockTs = stakingPool.getUnlockTimestamp(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StakingPool.StakeLocked.selector, unlockTs));
        stakingPool.unstake(STAKE_AMOUNT);
    }

    function test_Unstake_RevertZeroAmount() public {
        _stake(alice, STAKE_AMOUNT);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.prank(alice);
        vm.expectRevert(StakingPool.AmountZero.selector);
        stakingPool.unstake(0);
    }

    function test_Unstake_RevertInsufficientBalance() public {
        _stake(alice, STAKE_AMOUNT);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(StakingPool.InsufficientBalance.selector, STAKE_AMOUNT, STAKE_AMOUNT + 1)
        );
        stakingPool.unstake(STAKE_AMOUNT + 1);
    }

    function test_Unstake_RevertNoPosition() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(StakingPool.InsufficientBalance.selector, uint256(0), STAKE_AMOUNT)
        );
        stakingPool.unstake(STAKE_AMOUNT);
    }

    // ═══════════════════════════════════════════════════════════════
    // Reward Claiming
    // ═══════════════════════════════════════════════════════════════

    function test_ClaimReward_AfterAccrual() public {
        _stake(alice, STAKE_AMOUNT);

        // Warp 100 seconds
        uint256 elapsed = 100;
        vm.warp(block.timestamp + elapsed + 1);

        // Trigger reward accounting by staking again (or unstaking)
        // Actually, let's use claimReward directly — it calls updateReward
        uint256 balanceBefore = ausd.balanceOf(alice);

        vm.prank(alice);
        stakingPool.claimReward();

        uint256 balanceAfter = ausd.balanceOf(alice);
        assertGt(balanceAfter, balanceBefore, "should have received rewards");
    }

    function test_ClaimReward_EmitsEvent() public {
        _stake(alice, STAKE_AMOUNT);
        vm.warp(block.timestamp + 100 + 1);

        uint256 pending = stakingPool.getPendingReward(alice);
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit IStakingPool.RewardClaimed(alice, pending, block.timestamp);
        stakingPool.claimReward();
    }

    function test_ClaimReward_RevertNoReward() public {
        // Alice has staked but no time has passed
        _stake(alice, STAKE_AMOUNT);

        vm.prank(alice);
        vm.expectRevert(StakingPool.NoPendingReward.selector);
        stakingPool.claimReward();
    }

    function test_ClaimReward_RevertNoPosition() public {
        vm.prank(alice);
        vm.expectRevert(StakingPool.NoPendingReward.selector);
        stakingPool.claimReward();
    }

    function test_ClaimReward_DistributedProportionally() public {
        _stake(alice, STAKE_AMOUNT);
        _stake(bob, STAKE_AMOUNT);

        // Warp 100 seconds
        vm.warp(block.timestamp + 100 + 1);

        uint256 aliceBalBefore = ausd.balanceOf(alice);
        uint256 bobBalBefore = ausd.balanceOf(bob);

        vm.prank(alice);
        stakingPool.claimReward();

        vm.prank(bob);
        stakingPool.claimReward();

        uint256 aliceReward = ausd.balanceOf(alice) - aliceBalBefore;
        uint256 bobReward = ausd.balanceOf(bob) - bobBalBefore;

        // Equal stakes => roughly equal rewards
        assertApproxEqAbs(aliceReward, bobReward, 1e18);
    }

    function test_GetPendingReward_ZeroBeforeStaking() public {
        assertEq(stakingPool.getPendingReward(alice), 0);
    }

    function test_GetPendingReward_IncreasesOverTime() public {
        _stake(alice, STAKE_AMOUNT);

        vm.warp(block.timestamp + 50 + 1);
        uint256 pending50 = stakingPool.getPendingReward(alice);

        vm.warp(block.timestamp + 50);
        uint256 pending100 = stakingPool.getPendingReward(alice);

        assertGt(pending100, pending50, "reward should increase");
    }

    function test_Unstake_AutoClaimsRewards() public {
        _stake(alice, STAKE_AMOUNT);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);

        uint256 aliceBefore = ausd.balanceOf(alice);

        _unstake(alice, STAKE_AMOUNT);

        // Should receive staked amount + rewards
        uint256 received = ausd.balanceOf(alice) - aliceBefore;
        assertGt(received, STAKE_AMOUNT, "should include rewards");
    }

    // ═══════════════════════════════════════════════════════════════
    // Slashing
    // ═══════════════════════════════════════════════════════════════

    function test_Slash_Success() public {
        _stake(alice, STAKE_AMOUNT);
        uint256 slashAmount = STAKE_AMOUNT / 2;

        uint256 ownerBefore = ausd.balanceOf(owner);

        stakingPool.slash(alice, slashAmount, keccak256("malicious"));

        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, STAKE_AMOUNT - slashAmount);
        assertEq(stakingPool.totalSlashed(), slashAmount);

        // Slashed funds go to owner
        assertEq(ausd.balanceOf(owner), ownerBefore + slashAmount);
    }

    function test_Slash_EmitsEvent() public {
        _stake(alice, STAKE_AMOUNT);
        uint256 slashAmount = STAKE_AMOUNT / 2;

        vm.expectEmit(true, false, false, true);
        emit IStakingPool.Slashed(alice, slashAmount, keccak256("malicious"), block.timestamp);
        stakingPool.slash(alice, slashAmount, keccak256("malicious"));
    }

    function test_Slash_FullAmount_Deactivates() public {
        _stake(alice, STAKE_AMOUNT);

        stakingPool.slash(alice, STAKE_AMOUNT, keccak256("all slashed"));

        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, 0);
        assertFalse(pos.active);
    }

    function test_Slash_RevertZeroAmount() public {
        _stake(alice, STAKE_AMOUNT);

        vm.expectRevert(StakingPool.AmountZero.selector);
        stakingPool.slash(alice, 0, keccak256("zero"));
    }

    function test_Slash_RevertInsufficientBalance() public {
        _stake(alice, STAKE_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(StakingPool.InsufficientBalance.selector, STAKE_AMOUNT, STAKE_AMOUNT + 1)
        );
        stakingPool.slash(alice, STAKE_AMOUNT + 1, keccak256("over slash"));
    }

    function test_Slash_RevertNotOwner() public {
        _stake(alice, STAKE_AMOUNT);

        vm.prank(attacker);
        vm.expectRevert();
        stakingPool.slash(alice, 100, keccak256("unauthorized"));
    }

    function test_Slash_UpdatesTotalStaked() public {
        _stake(alice, STAKE_AMOUNT);

        stakingPool.slash(alice, STAKE_AMOUNT / 2, keccak256("slash"));

        assertEq(stakingPool.getTotalStaked(), STAKE_AMOUNT / 2);
    }

    // ═══════════════════════════════════════════════════════════════
    // Reward Management
    // ═══════════════════════════════════════════════════════════════

    function test_SetRewardRate_Success() public {
        stakingPool.setRewardRate(2e18);
        assertEq(stakingPool.rewardRate(), 2e18);
    }

    function test_SetRewardRate_EmitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit IStakingPool.RewardRateUpdated(REWARD_RATE, 2e18);
        stakingPool.setRewardRate(2e18);
    }

    function test_SetRewardRate_RevertNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        stakingPool.setRewardRate(2e18);
    }

    function test_AddRewards_Success() public {
        uint256 rewardsAmount = 500 ether;
        ausd.mint(owner, rewardsAmount);
        ausd.approve(address(stakingPool), rewardsAmount);

        uint256 poolBefore = ausd.balanceOf(address(stakingPool));
        stakingPool.addRewards(rewardsAmount);
        assertEq(ausd.balanceOf(address(stakingPool)), poolBefore + rewardsAmount);
    }

    function test_AddRewards_EmitsEvent() public {
        uint256 rewardsAmount = 500 ether;
        ausd.mint(owner, rewardsAmount);
        ausd.approve(address(stakingPool), rewardsAmount);

        vm.expectEmit(false, false, false, true);
        emit IStakingPool.RewardAdded(rewardsAmount, block.timestamp);
        stakingPool.addRewards(rewardsAmount);
    }

    function test_AddRewards_RevertZeroAmount() public {
        vm.expectRevert(StakingPool.AmountZero.selector);
        stakingPool.addRewards(0);
    }

    function test_SetTrustScore_Success() public {
        address ts = makeAddr("newTS");
        stakingPool.setTrustScore(ts);
        assertEq(address(stakingPool.trustScore()), ts);
    }

    function test_SetTrustScore_SetZero() public {
        stakingPool.setTrustScore(address(0));
        assertEq(address(stakingPool.trustScore()), address(0));
    }

    function test_SetTrustScore_EmitsEvent() public {
        address ts = makeAddr("newTS");
        vm.expectEmit(false, false, false, true);
        emit IStakingPool.TrustScoreUpdated(ts);
        stakingPool.setTrustScore(ts);
    }

    function test_SetTrustScore_RevertNotOwner() public {
        vm.prank(attacker);
        vm.expectRevert();
        stakingPool.setTrustScore(makeAddr("ts"));
    }

    // ═══════════════════════════════════════════════════════════════
    // Trust Score Boosted Rewards
    // ═══════════════════════════════════════════════════════════════

    function test_TrustScoreBoost_HigherRewards() public {
        (StakingPool pool, TrustScore ts) = _deployWithTrustScore();

        // Alice gets a high trust score via staking factor
        // (recordStakingFactor via trusted source = pool address)
        vm.prank(address(pool));
        ts.recordStakingFactor(alice, 5000); // 50% boost

        // Bob gets zero score
        // Both stake equal amounts
        vm.prank(alice);
        pool.stake(STAKE_AMOUNT);

        vm.prank(bob);
        pool.stake(STAKE_AMOUNT);

        // Warp 100 seconds
        vm.warp(block.timestamp + 100 + 1);

        uint256 aliceBalBefore = ausd.balanceOf(alice);
        uint256 bobBalBefore = ausd.balanceOf(bob);

        vm.prank(alice);
        pool.claimReward();
        vm.prank(bob);
        pool.claimReward();

        uint256 aliceReward = ausd.balanceOf(alice) - aliceBalBefore;
        uint256 bobReward = ausd.balanceOf(bob) - bobBalBefore;

        // Alice should earn more due to trust score boost
        assertGt(aliceReward, bobReward, "alice should earn more with higher trust score");
    }

    // ═══════════════════════════════════════════════════════════════
    // Views
    // ═══════════════════════════════════════════════════════════════

    function test_GetStake_ReturnsZeroBeforeStaking() public view {
        IStakingPool.StakePosition memory pos = stakingPool.getStake(alice);
        assertEq(pos.stakedAmount, 0);
        assertFalse(pos.active);
    }

    function test_GetRawTotalStaked_ReturnsBalance() public {
        uint256 initialPoolBal = ausd.balanceOf(address(stakingPool));
        _stake(alice, STAKE_AMOUNT);
        _stake(bob, STAKE_AMOUNT);
        assertEq(stakingPool.getRawTotalStaked(), initialPoolBal + STAKE_AMOUNT * 2);
    }

    function test_GetUnlockTimestamp() public {
        _stake(alice, STAKE_AMOUNT);
        uint64 unlockTs = stakingPool.getUnlockTimestamp(alice);
        assertEq(unlockTs, uint64(block.timestamp) + LOCK_PERIOD);
    }

    // ═══════════════════════════════════════════════════════════════
    // Fuzz Tests
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_StakeAndUnstake(uint256 amount) public {
        vm.assume(amount >= stakingPool.MIN_STAKE() && amount <= 1e30 ether);
        vm.assume(ausd.balanceOf(alice) >= amount);

        _stake(alice, amount);
        assertEq(stakingPool.getStake(alice).stakedAmount, amount);

        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        _unstake(alice, amount);
        assertEq(stakingPool.getStake(alice).stakedAmount, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // Reentrancy Protection Tests
    // ═══════════════════════════════════════════════════════════════

    function test_ReentrancyGuard_Stake() public {
        ReentrantAUSD rToken = new ReentrantAUSD();
        StakingPool rPool = new StakingPool(address(rToken), owner, address(0), 1 ether);
        rToken.mint(alice, 100 ether);

        vm.startPrank(alice);
        rToken.approve(address(rPool), type(uint256).max);
        rToken.setPoolTarget(address(rPool), ReentrantAUSD.Action.STAKE);

        vm.expectRevert();
        rPool.stake(10 ether);
        vm.stopPrank();
    }

    function test_ReentrancyGuard_Unstake() public {
        ReentrantAUSD rToken = new ReentrantAUSD();
        StakingPool rPool = new StakingPool(address(rToken), owner, address(0), 1 ether);
        rToken.mint(alice, 100 ether);
        rToken.mint(address(rPool), 100 ether);

        vm.startPrank(alice);
        rToken.approve(address(rPool), type(uint256).max);
        rPool.stake(10 ether);

        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        rToken.setPoolTarget(address(rPool), ReentrantAUSD.Action.UNSTAKE);

        vm.expectRevert();
        rPool.unstake(10 ether);
        vm.stopPrank();
    }

    function test_ReentrancyGuard_ClaimReward() public {
        ReentrantAUSD rToken = new ReentrantAUSD();
        StakingPool rPool = new StakingPool(address(rToken), owner, address(0), 1 ether);
        rToken.mint(alice, 100 ether);
        rToken.mint(address(rPool), 100 ether);

        vm.startPrank(alice);
        rToken.approve(address(rPool), type(uint256).max);
        rPool.stake(10 ether);

        vm.warp(block.timestamp + 100);
        rToken.setPoolTarget(address(rPool), ReentrantAUSD.Action.CLAIM);

        vm.expectRevert();
        rPool.claimReward();
        vm.stopPrank();
    }
}

/**
 * @dev Reentrant ERC20 token to test ReentrancyGuard on StakingPool
 */
contract ReentrantAUSD is MockAUSD {
    address public poolTarget;
    enum Action { NONE, STAKE, UNSTAKE, CLAIM }
    Action public action = Action.NONE;

    function setPoolTarget(address _target, Action _action) external {
        poolTarget = _target;
        action = _action;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        bool result = super.transferFrom(sender, recipient, amount);
        if (action != Action.NONE && msg.sender == poolTarget) {
            Action act = action;
            action = Action.NONE;
            if (act == Action.STAKE) {
                StakingPool(poolTarget).stake(1 ether);
            } else if (act == Action.UNSTAKE) {
                StakingPool(poolTarget).unstake(1 ether);
            } else if (act == Action.CLAIM) {
                StakingPool(poolTarget).claimReward();
            }
        }
        return result;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        bool result = super.transfer(recipient, amount);
        if (action != Action.NONE && msg.sender == poolTarget) {
            Action act = action;
            action = Action.NONE;
            if (act == Action.STAKE) {
                StakingPool(poolTarget).stake(1 ether);
            } else if (act == Action.UNSTAKE) {
                StakingPool(poolTarget).unstake(1 ether);
            } else if (act == Action.CLAIM) {
                StakingPool(poolTarget).claimReward();
            }
        }
        return result;
    }
}
