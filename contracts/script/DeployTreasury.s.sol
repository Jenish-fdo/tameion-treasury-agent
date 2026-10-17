// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {DecisionLog} from "../src/DecisionLog.sol";

/**
 * @title DeployTreasury
 * @notice Deploys MandateRegistry and then DecisionLog (pointing at it). ARC TESTNET ONLY. UNAUDITED.
 *
 * @dev Neither contract has an owner or any admin function, so there is nothing to configure after deployment and
 *      no key keeps any special power. The deployer pays gas and nothing else.
 *
 *      No key is read from the environment or the repository. Sign with a Foundry keystore you control:
 *
 *        forge script script/DeployTreasury.s.sol --rpc-url arc_testnet --broadcast --account <keystore>
 *
 *      Do not run this against mainnet. Running it against Arc testnet is a deliberate, separate step.
 */
contract DeployTreasury is Script {
    function run() external returns (MandateRegistry registry, DecisionLog decisionLog) {
        vm.startBroadcast();
        registry = new MandateRegistry();
        decisionLog = new DecisionLog(registry);
        vm.stopBroadcast();

        console.log("Network chain id         ", block.chainid);
        console.log("MandateRegistry          ", address(registry));
        console.log("DecisionLog              ", address(decisionLog));
        console.log("");
        console.log("backend/.env:");
        console.log("  MANDATE_REGISTRY_ADDRESS=", address(registry));
        console.log("  DECISION_LOG_ADDRESS=", address(decisionLog));
    }
}
