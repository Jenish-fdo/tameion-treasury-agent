// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { CredentialRegistry } from "../src/CredentialRegistry.sol";
import { CviAttestationOracle } from "../src/CviAttestationOracle.sol";

/**
 * @title DeployCredentialFlow
 * @notice Deploys what the issue -> share -> verify -> receipt flow needs: the CredentialRegistry,
 *         the CVI attestation oracle, and the gate that ties them together.
 *
 * @dev Run by a person, with their own signer. No key is read from the environment:
 *
 *        forge script script/DeployCredentialFlow.s.sol --rpc-url monad_testnet --broadcast --account <keystore>
 *
 *      Optional environment:
 *        ISSUER        address to authorize as an issuer and attest on the testnet demo CVI oracle
 *                      (e.g. your Mera passkey address). This is a testnet demo stand-in; no real
 *                      Cleanverse check is performed and no bounty eligibility is claimed.
 *        CVI_GATE=0    deploy without switching the CVI gate on.
 */
contract DeployCredentialFlow is Script {
    function run() external {
        address issuer = vm.envOr("ISSUER", address(0));
        bool gate = vm.envOr("CVI_GATE", true);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        CredentialRegistry registry = new CredentialRegistry("Credentia", "1", deployer);
        CviAttestationOracle oracle = new CviAttestationOracle(deployer);
        if (gate) registry.setCviVerifier(address(oracle));

        if (issuer != address(0)) {
            registry.authorizeIssuer(issuer);
            oracle.attest(issuer, 1, 0, keccak256("testnet demo attestation"));
        }
        vm.stopBroadcast();

        console.log("Deploy block             ", block.number);
        console.log("CredentialRegistry       ", address(registry));
        console.log("CviAttestationOracle     ", address(oracle));
        console.log("CVI gate on              ", gate);
        if (issuer != address(0)) console.log("Authorized + attested    ", issuer);
        console.log("");
        console.log("web-app/.env.local:");
        console.log("  NEXT_PUBLIC_CREDENTIAL_REGISTRY_ADDRESS=", address(registry));
        console.log("  NEXT_PUBLIC_CVI_ORACLE_ADDRESS=", address(oracle));
    }
}
