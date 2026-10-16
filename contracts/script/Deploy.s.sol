// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

/**
 * @title DeployScript
 * @notice Deployment script for Credentia contracts on Monad testnet
 */
contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy IdentityRegistry
        IdentityRegistry identityRegistry = new IdentityRegistry();
        console.log("IdentityRegistry deployed at:", address(identityRegistry));

        // TODO: Deploy other contracts
        // AttestationRegistry attestationRegistry = new AttestationRegistry();
        // CredentialIssuer credentialIssuer = new CredentialIssuer();
        // TrustScore trustScore = new TrustScore();
        // AIAgentRegistry aiAgentRegistry = new AIAgentRegistry();

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("IdentityRegistry:", address(identityRegistry));
        console.log("\nUpdate your .env file with these addresses");
    }
}
