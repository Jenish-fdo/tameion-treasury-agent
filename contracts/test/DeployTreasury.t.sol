// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployTreasury} from "../script/DeployTreasury.s.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {DecisionLog} from "../src/DecisionLog.sol";

/// @notice The deployment script wires the two contracts together. Runs in the local test VM only; deploys nothing anywhere.
contract DeployTreasuryTest is Test {
    function test_ScriptDeploysAndWiresBothContracts() public {
        DeployTreasury script = new DeployTreasury();
        (MandateRegistry registry, DecisionLog decisionLog) = script.run();
        assertTrue(address(registry).code.length > 0);
        assertTrue(address(decisionLog).code.length > 0);
        assertEq(address(decisionLog.registry()), address(registry));
    }
}
