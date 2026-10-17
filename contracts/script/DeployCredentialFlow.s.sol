// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { CredentialRegistry } from "../src/CredentialRegistry.sol";

/**
 * @title DeployCredentialFlow
 * @notice Deploys the CredentialRegistry. Renamed and extended in Phase 3 (MandateRegistry).
 *
 * @dev Run by a person, with their own signer. No key is read from the environment:
 *
 *        forge script script/DeployCredentialFlow.s.sol --rpc-url arc_testnet --broadcast --account <keystore>
 *
 *      Optional environment:
 *        ISSUER        address to authorize as an issuer right after deployment.
 */
contract DeployCredentialFlow is Script {
    function run() external {
        address issuer = vm.envOr("ISSUER", address(0));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        CredentialRegistry registry = new CredentialRegistry("Credentia", "1", deployer);
        if (issuer != address(0)) registry.authorizeIssuer(issuer);
        vm.stopBroadcast();

        console.log("Deploy block             ", block.number);
        console.log("CredentialRegistry       ", address(registry));
        if (issuer != address(0)) console.log("Authorized issuer        ", issuer);
        console.log("");
        console.log("web-app/.env.local:");
        console.log("  NEXT_PUBLIC_CREDENTIAL_REGISTRY_ADDRESS=", address(registry));
    }
}
