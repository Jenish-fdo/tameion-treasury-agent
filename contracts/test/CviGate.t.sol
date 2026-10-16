// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CredentialRegistry } from "../src/CredentialRegistry.sol";
import { CviAttestationOracle } from "../src/CviAttestationOracle.sol";
import { ICredentialRegistry } from "../src/interfaces/ICredentialRegistry.sol";

/**
 * @title CviGateTest
 * @notice Covers the Cleanverse CVI gate on issuance, the high-assurance path, the attestation
 *         oracle behind the gate, and on-chain verification receipts.
 */
contract CviGateTest is Test {
    CredentialRegistry internal registry;
    CviAttestationOracle internal oracle;

    address internal owner = address(this);
    address internal attester = makeAddr("attester");
    address internal issuer = makeAddr("issuer");
    address internal holder = makeAddr("holder");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant TYPE = keccak256("Certificate of Completion");
    bytes32 internal constant DATA = keccak256("record");
    bytes32 internal constant EVIDENCE = keccak256("cleanverse check #1");

    function setUp() public {
        registry = new CredentialRegistry("Credentia", "1", owner);
        oracle = new CviAttestationOracle(owner);
        oracle.setAttester(attester, true);
        registry.authorizeIssuer(issuer);
    }

    function _gateOn() internal {
        registry.setCviVerifier(address(oracle));
    }

    function _attest(address wallet) internal {
        vm.prank(attester);
        oracle.attest(wallet, 2, 0, EVIDENCE);
    }

    // ─── oracle
    // ─────────────────────────────────────────────────────

    function test_Oracle_AttestMarksWalletVerified() public {
        assertFalse(oracle.isVerified(issuer));
        _attest(issuer);

        (bool verified, uint8 tier, uint64 expiresAt, uint64 updatedAt) = oracle.statusOf(issuer);
        assertTrue(verified);
        assertEq(tier, 2);
        assertEq(expiresAt, 0);
        assertEq(updatedAt, block.timestamp);
        assertEq(oracle.evidenceOf(issuer), EVIDENCE);
        assertEq(oracle.attestedCount(), 1);
    }

    function test_Oracle_OnlyAttestersWrite() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CviAttestationOracle.NotAttester.selector, stranger));
        oracle.attest(issuer, 1, 0, EVIDENCE);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        oracle.setAttester(stranger, true);
    }

    function test_Oracle_VerificationExpires() public {
        vm.prank(attester);
        oracle.attest(issuer, 1, uint64(block.timestamp + 1 days), EVIDENCE);
        assertTrue(oracle.isVerified(issuer));

        vm.warp(block.timestamp + 1 days);
        assertFalse(oracle.isVerified(issuer));
    }

    function test_Oracle_RevokeAndReattest() public {
        _attest(issuer);
        vm.prank(attester);
        oracle.revoke(issuer, keccak256("frozen"));
        assertFalse(oracle.isVerified(issuer));
        assertEq(oracle.attestedCount(), 0);

        vm.prank(attester);
        vm.expectRevert(abi.encodeWithSelector(CviAttestationOracle.NotAttested.selector, issuer));
        oracle.revoke(issuer, bytes32(0));

        _attest(issuer);
        assertTrue(oracle.isVerified(issuer));
        assertEq(oracle.attestedCount(), 1);
    }

    function test_Oracle_RejectsPastExpiryAndZeroWallet() public {
        vm.warp(1000);
        vm.startPrank(attester);
        vm.expectRevert(abi.encodeWithSelector(CviAttestationOracle.InvalidExpiry.selector, uint64(999)));
        oracle.attest(issuer, 1, 999, EVIDENCE);
        vm.expectRevert(CviAttestationOracle.ZeroAddress.selector);
        oracle.attest(address(0), 1, 0, EVIDENCE);
        vm.stopPrank();
    }

    // ─── gate on issuance
    // ───────────────────────────────────────────

    function test_Gate_OffByDefault() public {
        assertEq(registry.cviVerifier(), address(0));
        vm.prank(issuer);
        registry.issueCredential(holder, TYPE, DATA, 0);
        assertEq(registry.totalCredentials(), 1);
    }

    function test_Gate_OnlyOwnerSetsVerifier() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.setCviVerifier(address(oracle));

        vm.expectEmit(true, false, false, false);
        emit ICredentialRegistry.CviVerifierUpdated(address(oracle));
        _gateOn();
        assertEq(registry.cviVerifier(), address(oracle));
    }

    function test_Gate_BlocksUnverifiedIssuer() public {
        _gateOn();
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.IssuerNotCviVerified.selector, issuer));
        registry.issueCredential(holder, TYPE, DATA, 0);
    }

    function test_Gate_AllowsVerifiedIssuer() public {
        _gateOn();
        _attest(issuer);
        vm.prank(issuer);
        bytes32 id = registry.issueCredential(holder, TYPE, DATA, 0);
        assertTrue(registry.verifyCredential(id));
        assertFalse(registry.isHighAssurance(id));
    }

    function test_Gate_StillRequiresOwnerAuthorization() public {
        _gateOn();
        _attest(stranger);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.NotAuthorizedIssuer.selector, stranger));
        registry.issueCredential(holder, TYPE, DATA, 0);
    }

    function test_Gate_ClosesWhenVerificationIsRevoked() public {
        _gateOn();
        _attest(issuer);
        vm.prank(issuer);
        bytes32 id = registry.issueCredential(holder, TYPE, DATA, 0);

        vm.prank(attester);
        oracle.revoke(issuer, keccak256("frozen"));

        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.IssuerNotCviVerified.selector, issuer));
        registry.issueCredential(holder, TYPE, keccak256("second"), 0);

        // What was issued while verified stays on the record.
        assertTrue(registry.verifyCredential(id));
    }

    function test_Gate_AppliesToSignedIssuance() public {
        (address signer, uint256 pk) = makeAddrAndKey("signer");
        registry.authorizeIssuer(signer);
        _gateOn();

        ICredentialRegistry.CredentialRequest memory request = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: TYPE,
            dataHash: DATA,
            expiryTimestamp: 0,
            nonce: registry.nonces(holder),
            deadline: block.timestamp + 1 hours
        });
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "CredentialRequest(address holder,bytes32 credentialType,bytes32 dataHash,uint256 expiryTimestamp,uint256 nonce,uint256 deadline)"
                ),
                request.holder,
                request.credentialType,
                request.dataHash,
                request.expiryTimestamp,
                request.nonce,
                request.deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", registry.getDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.IssuerNotCviVerified.selector, signer));
        registry.issueCredentialWithSig(request, signature);

        _attest(signer);
        bytes32 id = registry.issueCredentialWithSig(request, signature);
        assertEq(registry.getCredential(id).issuer, signer);
    }

    // ─── high-assurance path
    // ────────────────────────────────────────

    function test_HighAssurance_NeedsGateConfigured() public {
        vm.prank(issuer);
        vm.expectRevert(CredentialRegistry.CviGateNotConfigured.selector);
        registry.issueHighAssuranceCredential(holder, TYPE, DATA, 0);
    }

    function test_HighAssurance_NeedsVerifiedHolder() public {
        _gateOn();
        _attest(issuer);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.HolderNotCviVerified.selector, holder));
        registry.issueHighAssuranceCredential(holder, TYPE, DATA, 0);
    }

    function test_HighAssurance_IssuesWhenBothVerified() public {
        _gateOn();
        _attest(issuer);
        _attest(holder);

        vm.prank(issuer);
        bytes32 id = registry.issueHighAssuranceCredential(holder, TYPE, DATA, 0);

        assertTrue(registry.isHighAssurance(id));
        assertTrue(registry.verifyCredential(id));
        assertEq(id, keccak256(abi.encodePacked(issuer, holder, TYPE, DATA)));
    }

    // ─── verification receipts
    // ──────────────────────────────────────

    function test_Receipt_RecordsValidCheck() public {
        vm.prank(issuer);
        bytes32 id = registry.issueCredential(holder, TYPE, DATA, 0);

        vm.expectEmit(true, true, false, true);
        emit ICredentialRegistry.CredentialChecked(id, stranger, true);
        vm.prank(stranger);
        assertTrue(registry.recordVerification(id));
        assertEq(registry.verificationCount(id), 1);
    }

    function test_Receipt_RecordsRevokedAndExpiredAsInvalid() public {
        vm.prank(issuer);
        bytes32 revoked = registry.issueCredential(holder, TYPE, DATA, 0);
        vm.prank(issuer);
        bytes32 expiring = registry.issueCredential(holder, TYPE, keccak256("b"), uint64(block.timestamp + 1 days));

        vm.prank(issuer);
        registry.revokeCredential(revoked, bytes32(0));
        vm.warp(block.timestamp + 2 days);

        assertFalse(registry.recordVerification(revoked));
        assertFalse(registry.recordVerification(expiring));
        assertEq(registry.verificationCount(revoked), 1);
        assertEq(registry.verificationCount(expiring), 1);
    }

    function test_Receipt_UnknownCredentialReverts() public {
        bytes32 unknown = keccak256("nope");
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.CredentialNotFound.selector, unknown));
        registry.recordVerification(unknown);
    }
}
