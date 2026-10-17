// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {DecisionLog} from "../src/DecisionLog.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";
import {IDecisionLog} from "../src/interfaces/IDecisionLog.sol";
import {MandateCategories} from "../src/libraries/MandateCategories.sol";

/**
 * @title SmokeTestTreasury
 * @notice Four real transactions that exercise a fresh deployment end to end, signed by ONE key (the business owner):
 *         register a business, grant a mandate to an agent address nobody holds a key for, record one decision,
 *         revoke the mandate. ARC TESTNET ONLY. Moves no funds; the amounts in the records are bookkeeping.
 *
 * @dev    Run only after the deployment has been verified and you have said go:
 *
 *           MANDATE_REGISTRY=0x... DECISION_LOG=0x... arc-forge script script/SmokeTestTreasury.s.sol:SmokeTestTreasury \
 *             --rpc-url arc_testnet --account <keystore> --sender <address> --with-gas-price 40gwei --priority-gas-price 1gwei \
 *             --broadcast --slow
 *
 *         It logs the ids to check afterwards with `cast call` (see docs/ARC_TESTNET_DEPLOYMENT.md, step D4).
 */
contract SmokeTestTreasury is Script {
    function run() external returns (bytes32 businessId, bytes32 mandateId, bytes32 decisionId) {
        MandateRegistry registry = MandateRegistry(vm.envAddress("MANDATE_REGISTRY"));
        DecisionLog decisionLog = DecisionLog(vm.envAddress("DECISION_LOG"));

        // Addresses derived from a label, so no one holds a key for them. The agent can never consume this mandate.
        address agent = address(uint160(uint256(keccak256("credentia smoke-test agent: no key exists"))));
        address vendor = address(uint160(uint256(keccak256("credentia smoke-test vendor: no key exists"))));
        bytes32 salt = keccak256(abi.encode("credentia smoke test", block.timestamp, msg.sender));

        address[] memory recipients = new address[](1);
        recipients[0] = vendor;

        vm.startBroadcast();
        (, address owner,) = vm.readCallers();

        businessId = registry.registerBusiness(salt, keccak256("smoke test business"));

        IMandateRegistry.MandateParams memory p = IMandateRegistry.MandateParams({
            businessId: businessId,
            agent: agent,
            agentId: keccak256("smoke-test-agent"),
            allowedCategories: MandateCategories.bit(MandateCategories.VENDOR_INVOICE),
            perTxLimit: 100e6,
            dailyCap: 200e6,
            weeklyCap: 500e6,
            monthlyCap: 1_000e6,
            approvalThreshold: 50e6,
            maxRiskTier: 1,
            singleUse: false,
            expiresAt: uint64(block.timestamp + 1 days),
            nonce: uint256(salt),
            recipients: recipients
        });
        mandateId = registry.createMandate(p);

        decisionId = decisionLog.recordDecision(
            IDecisionLog.DecisionInput({
                businessId: businessId,
                agentId: keccak256("smoke-test-agent"),
                mandateId: mandateId,
                action: IDecisionLog.ActionType.Payment,
                counterparty: vendor,
                amount: 25e6,
                rulesEvaluated: 0xFF,
                rulesFailed: 0,
                riskTier: 0,
                riskScore: 500,
                outcome: IDecisionLog.Outcome.Proposed,
                rationaleHash: keccak256("smoke test: nothing was paid"),
                txHash: bytes32(0),
                approvalRef: bytes32(0),
                parentDecisionId: bytes32(0),
                clientRef: bytes32(0)
            })
        );

        registry.revokeMandate(mandateId, keccak256("smoke test finished"));
        vm.stopBroadcast();

        console.log("Owner (signer)           ", owner);
        console.log("businessId");
        console.logBytes32(businessId);
        console.log("mandateId");
        console.logBytes32(mandateId);
        console.log("decisionId");
        console.logBytes32(decisionId);
    }
}
