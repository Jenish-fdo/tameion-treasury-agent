// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployTreasury} from "../script/DeployTreasury.s.sol";
import {SmokeTestTreasury} from "../script/SmokeTestTreasury.s.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {DecisionLog} from "../src/DecisionLog.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";

/// @notice The post-deployment smoke test leaves exactly the state the checklist expects. Local test VM only.
contract SmokeTestTreasuryTest is Test {
    function test_SmokeScriptLeavesTheExpectedState() public {
        (MandateRegistry registry, DecisionLog log) = new DeployTreasury().run();
        vm.setEnv("MANDATE_REGISTRY", vm.toString(address(registry)));
        vm.setEnv("DECISION_LOG", vm.toString(address(log)));

        (bytes32 businessId, bytes32 mandateId, bytes32 decisionId) = new SmokeTestTreasury().run();

        assertEq(registry.mandateCountByBusiness(businessId), 1);
        assertEq(uint8(registry.getMandate(mandateId).status), uint8(IMandateRegistry.MandateStatus.Revoked), "the mandate ends revoked");
        assertEq(log.countByBusiness(businessId), 1);
        assertTrue(log.verifyRecord(decisionId), "the record verifies");
        assertEq(log.getDecision(decisionId).mandateId, mandateId);
        (bytes32 head, uint64 n) = log.chainHead(businessId);
        assertEq(n, 1);
        assertEq(head, log.getDecision(decisionId).recordHash);
    }
}
