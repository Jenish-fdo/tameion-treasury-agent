// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {ICredentialRegistry} from "../src/interfaces/ICredentialRegistry.sol";

/**
 * @title CredentialRegistryTest
 * @notice Comprehensive tests for the CredentialRegistry contract covering
 *         issuance, verification, revocation, EIP-712 signatures, and edge cases.
 */
contract CredentialRegistryTest is Test {
    CredentialRegistry public registry;
    address public owner;
    address public issuer;
    address public holder;
    address public unauthorized;

    uint256 internal issuerPk;
    uint256 internal unauthorizedPk;

    bytes32 internal constant CRED_TYPE = keccak256("EMAIL_VERIFICATION");
    bytes32 internal constant DATA_HASH = keccak256("credential data payload");
    bytes32 internal constant REASON = keccak256("credential compromised");
    uint64 internal constant FAR_FUTURE_EXPIRY = 4102444800; // year 2100

    function setUp() public {
        owner = address(this);
        (issuer, issuerPk) = makeAddrAndKey("issuer");
        holder = makeAddr("holder");
        (unauthorized, unauthorizedPk) = makeAddrAndKey("unauthorized");

        registry = new CredentialRegistry("Credentia", "1", owner);
        registry.authorizeIssuer(issuer);
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    function _issue(address _issuer, address _holder, bytes32 _type, bytes32 _data, uint64 _expiry)
        internal
        returns (bytes32 id)
    {
        vm.prank(_issuer);
        id = registry.issueCredential(_holder, _type, _data, _expiry);
    }

    function _computeId(address _issuer, address _holder, bytes32 _type, bytes32 _data)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(_issuer, _holder, _type, _data));
    }

    function _signCredentialRequest(
        address _holder,
        bytes32 _credType,
        bytes32 _dataHash,
        uint256 _expiry,
        uint256 _nonce,
        uint256 _deadline,
        uint256 _signerPk
    ) internal view returns (bytes memory sig) {
        bytes32 typeHash = keccak256(
            "CredentialRequest(address holder,bytes32 credentialType,bytes32 dataHash,uint256 expiryTimestamp,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(abi.encode(
            typeHash, _holder, _credType, _dataHash, _expiry, _nonce, _deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", registry.getDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_signerPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    // ═══════════════════════════════════════════════════════════════
    // Deployment & Constructor
    // ═══════════════════════════════════════════════════════════════

    function test_Constructor_SetsOwner() public view {
        assertEq(registry.owner(), owner);
    }

    function test_Constructor_RevertZeroOwner() public {
        vm.expectRevert(); // OZ Ownable reverts with OwnableInvalidOwner
        new CredentialRegistry("Credentia", "1", address(0));
    }

    function test_DomainSeparator_IsNonZero() public view {
        assertTrue(registry.getDomainSeparator() != bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════
    // Issuance — Success Cases
    // ═══════════════════════════════════════════════════════════════

    function test_IssueCredential_Success() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        assertTrue(registry.isCredentialValid(id));
        assertEq(registry.totalCredentials(), 1);
        assertEq(registry.activeCredentials(), 1);
    }

    function test_IssueCredential_EmitsEvent() public {
        vm.prank(issuer);
        vm.expectEmit(true, true, true, true);
        bytes32 expectedId = _computeId(issuer, holder, CRED_TYPE, DATA_HASH);
        emit ICredentialRegistry.CredentialIssued(expectedId, issuer, holder, CRED_TYPE, 0);
        registry.issueCredential(holder, CRED_TYPE, DATA_HASH, 0);
    }

    function test_IssueCredential_WithExpiry() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, expiry);

        assertTrue(registry.isCredentialValid(id));

        ICredentialRegistry.Credential memory cred = registry.getCredential(id);
        assertEq(cred.expiryTimestamp, expiry);
    }

    function test_IssueCredential_GetCredentialData() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        ICredentialRegistry.Credential memory cred = registry.getCredential(id);
        assertEq(cred.issuer, issuer);
        assertEq(cred.holder, holder);
        assertEq(cred.credentialType, CRED_TYPE);
        assertEq(cred.dataHash, DATA_HASH);
        assertEq(cred.revoked, false);
        assertEq(cred.expiryTimestamp, 0);
        assertGt(cred.issuedAt, 0);
    }

    function test_IssueCredential_MultipleCredentials() public {
        _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);
        _issue(issuer, holder, keccak256("KYC"), keccak256("kyc data"), 0);
        _issue(issuer, holder, keccak256("DEGREE"), keccak256("degree data"), 0);

        assertEq(registry.totalCredentials(), 3);
        assertEq(registry.activeCredentials(), 3);
    }

    function test_IssueCredential_DeterministicId() public {
        bytes32 id1 = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);
        bytes32 id2 = _computeId(issuer, holder, CRED_TYPE, DATA_HASH);
        assertEq(id1, id2);
    }

    // ═══════════════════════════════════════════════════════════════
    // Issuance — Failure Cases
    // ═══════════════════════════════════════════════════════════════

    function test_IssueCredential_RevertUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.NotAuthorizedIssuer.selector, unauthorized)
        );
        registry.issueCredential(holder, CRED_TYPE, DATA_HASH, 0);
    }

    function test_IssueCredential_RevertZeroHolder() public {
        vm.prank(issuer);
        vm.expectRevert(CredentialRegistry.InvalidHolder.selector);
        registry.issueCredential(address(0), CRED_TYPE, DATA_HASH, 0);
    }

    function test_IssueCredential_RevertDuplicate() public {
        _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        bytes32 expectedId = _computeId(issuer, holder, CRED_TYPE, DATA_HASH);
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.CredentialAlreadyExists.selector, expectedId)
        );
        registry.issueCredential(holder, CRED_TYPE, DATA_HASH, 0);
    }

    function test_IssueCredential_RevertExpiryInPast() public {
        vm.warp(1700000000); // set a proper timestamp
        uint64 pastExpiry = uint64(block.timestamp - 1);
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidExpiry.selector, pastExpiry)
        );
        registry.issueCredential(holder, CRED_TYPE, DATA_HASH, pastExpiry);
    }

    function test_IssueCredential_RevertExpiryTooFar() public {
        uint64 tooFar = uint64(FAR_FUTURE_EXPIRY + 1);
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.InvalidExpiry.selector, tooFar)
        );
        registry.issueCredential(holder, CRED_TYPE, DATA_HASH, tooFar);
    }

    // ═══════════════════════════════════════════════════════════════
    // Verification
    // ═══════════════════════════════════════════════════════════════

    function test_VerifyCredential_Valid() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);
        assertTrue(registry.verifyCredential(id));
    }

    function test_VerifyCredential_NonExistent() public {
        assertFalse(registry.verifyCredential(bytes32(0)));
        assertFalse(registry.verifyCredential(keccak256("nonexistent")));
    }

    function test_VerifyCredential_Expired() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, expiry);

        // Not expired yet
        assertTrue(registry.verifyCredential(id));

        // Warp past expiry
        vm.warp(block.timestamp + 2 days);
        assertFalse(registry.verifyCredential(id));
    }

    function test_VerifyCredential_Revoked() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        vm.prank(issuer);
        registry.revokeCredential(id, REASON);

        assertFalse(registry.verifyCredential(id));
    }

    function test_VerifyCredential_IssuerRevoked() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);
        assertTrue(registry.verifyCredential(id));

        // Owner de-authorizes the issuer
        registry.revokeIssuer(issuer);

        assertFalse(registry.verifyCredential(id));
    }

    function test_VerifyCredential_NoExpiryNeverExpires() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        // Warp far into the future
        vm.warp(FAR_FUTURE_EXPIRY);
        assertTrue(registry.verifyCredential(id));
    }

    function test_IsCredentialValid_MatchesVerify() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);
        assertEq(registry.isCredentialValid(id), registry.verifyCredential(id));
    }

    // ═══════════════════════════════════════════════════════════════
    // Revocation
    // ═══════════════════════════════════════════════════════════════

    function test_RevokeCredential_ByIssuer() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        vm.prank(issuer);
        registry.revokeCredential(id, REASON);

        assertFalse(registry.isCredentialValid(id));
        assertEq(registry.activeCredentials(), 0);
        assertEq(registry.totalCredentials(), 1); // total never decreases
    }

    function test_RevokeCredential_ByOwner() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        // Owner can revoke any credential
        registry.revokeCredential(id, REASON);

        assertFalse(registry.isCredentialValid(id));
    }

    function test_RevokeCredential_EmitsEvent() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        vm.prank(issuer);
        vm.expectEmit(true, false, false, true);
        emit ICredentialRegistry.CredentialRevoked(id, issuer, REASON);
        registry.revokeCredential(id, REASON);
    }

    function test_RevokeCredential_RevertNonExistent() public {
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.CredentialNotFound.selector, keccak256("fake"))
        );
        registry.revokeCredential(keccak256("fake"), REASON);
    }

    function test_RevokeCredential_RevertAlreadyRevoked() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        vm.prank(issuer);
        registry.revokeCredential(id, REASON);

        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.CredentialRevokedErr.selector, id)
        );
        registry.revokeCredential(id, REASON);
    }

    function test_RevokeCredential_RevertUnauthorized() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.NotAuthorizedIssuer.selector, unauthorized)
        );
        registry.revokeCredential(id, REASON);
    }

    function test_RevokeCredential_CredentialDataPreserved() public {
        bytes32 id = _issue(issuer, holder, CRED_TYPE, DATA_HASH, 0);

        vm.prank(issuer);
        registry.revokeCredential(id, REASON);

        ICredentialRegistry.Credential memory cred = registry.getCredential(id);
        assertEq(cred.issuer, issuer);
        assertEq(cred.holder, holder);
        assertTrue(cred.revoked);
    }

    // ═══════════════════════════════════════════════════════════════
    // Issuer Management
    // ═══════════════════════════════════════════════════════════════

    function test_AuthorizeIssuer_Success() public {
        address newIssuer = makeAddr("newIssuer");
        assertFalse(registry.isAuthorizedIssuer(newIssuer));

        registry.authorizeIssuer(newIssuer);
        assertTrue(registry.isAuthorizedIssuer(newIssuer));
    }

    function test_AuthorizeIssuer_EmitsEvent() public {
        address newIssuer = makeAddr("newIssuer");
        vm.expectEmit(true, false, false, false);
        emit ICredentialRegistry.IssuerAuthorized(newIssuer);
        registry.authorizeIssuer(newIssuer);
    }

    function test_AuthorizeIssuer_RevertZeroAddress() public {
        vm.expectRevert(CredentialRegistry.ZeroAddress.selector);
        registry.authorizeIssuer(address(0));
    }

    function test_AuthorizeIssuer_RevertNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        registry.authorizeIssuer(makeAddr("new"));
    }

    function test_RevokeIssuer_Success() public {
        registry.revokeIssuer(issuer);
        assertFalse(registry.isAuthorizedIssuer(issuer));
    }

    function test_RevokeIssuer_EmitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit ICredentialRegistry.IssuerRevoked(issuer);
        registry.revokeIssuer(issuer);
    }

    function test_RevokeIssuer_AfterRevocation_IssuanceFails() public {
        registry.revokeIssuer(issuer);

        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.NotAuthorizedIssuer.selector, issuer)
        );
        registry.issueCredential(holder, CRED_TYPE, DATA_HASH, 0);
    }

    function test_RevokeIssuer_RevertNotOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        registry.revokeIssuer(issuer);
    }

    // ═══════════════════════════════════════════════════════════════
    // View: getCredential
    // ═══════════════════════════════════════════════════════════════

    function test_GetCredential_RevertNotFound() public {
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.CredentialNotFound.selector, keccak256("fake"))
        );
        registry.getCredential(keccak256("fake"));
    }

    // ═══════════════════════════════════════════════════════════════
    // EIP-712 Signature-Based Issuance
    // ═══════════════════════════════════════════════════════════════

    function test_IssueCredentialWithSig_Success() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0; // holder's first nonce

        ICredentialRegistry.CredentialRequest memory req = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: nonce,
            deadline: deadline
        });

        bytes memory sig = _signCredentialRequest(
            holder, CRED_TYPE, DATA_HASH, 0, nonce, deadline, issuerPk
        );

        bytes32 id = registry.issueCredentialWithSig(req, sig);

        assertTrue(registry.isCredentialValid(id));
        assertEq(registry.totalCredentials(), 1);

        ICredentialRegistry.Credential memory cred = registry.getCredential(id);
        assertEq(cred.issuer, issuer);
        assertEq(cred.holder, holder);
    }

    function test_IssueCredentialWithSig_EmitsEvent() public {
        uint256 deadline = block.timestamp + 1 hours;

        ICredentialRegistry.CredentialRequest memory req = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 0,
            deadline: deadline
        });

        bytes memory sig = _signCredentialRequest(
            holder, CRED_TYPE, DATA_HASH, 0, 0, deadline, issuerPk
        );

        bytes32 expectedId = _computeId(issuer, holder, CRED_TYPE, DATA_HASH);
        vm.expectEmit(true, true, true, true);
        emit ICredentialRegistry.CredentialIssued(expectedId, issuer, holder, CRED_TYPE, 0);

        registry.issueCredentialWithSig(req, sig);
    }

    function test_IssueCredentialWithSig_RevertInvalidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;

        ICredentialRegistry.CredentialRequest memory req = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 0,
            deadline: deadline
        });

        // Sign with wrong key (unauthorized)
        bytes memory sig = _signCredentialRequest(
            holder, CRED_TYPE, DATA_HASH, 0, 0, deadline, unauthorizedPk
        );

        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.NotAuthorizedIssuer.selector, unauthorized)
        );
        registry.issueCredentialWithSig(req, sig);
    }

    function test_IssueCredentialWithSig_RevertExpiredDeadline() public {
        uint256 deadline = block.timestamp - 1; // already expired

        ICredentialRegistry.CredentialRequest memory req = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 0,
            deadline: deadline
        });

        bytes memory sig = _signCredentialRequest(
            holder, CRED_TYPE, DATA_HASH, 0, 0, deadline, issuerPk
        );

        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.SignatureExpired.selector, deadline)
        );
        registry.issueCredentialWithSig(req, sig);
    }

    function test_IssueCredentialWithSig_RevertZeroHolder() public {
        uint256 deadline = block.timestamp + 1 hours;

        ICredentialRegistry.CredentialRequest memory req = ICredentialRegistry.CredentialRequest({
            holder: address(0),
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 0,
            deadline: deadline
        });

        bytes memory sig = _signCredentialRequest(
            address(0), CRED_TYPE, DATA_HASH, 0, 0, deadline, issuerPk
        );

        vm.expectRevert(CredentialRegistry.InvalidHolder.selector);
        registry.issueCredentialWithSig(req, sig);
    }

    function test_IssueCredentialWithSig_RevertDuplicate() public {
        uint256 deadline = block.timestamp + 1 hours;

        // First issuance succeeds
        ICredentialRegistry.CredentialRequest memory req1 = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 0,
            deadline: deadline
        });

        bytes memory sig1 = _signCredentialRequest(
            holder, CRED_TYPE, DATA_HASH, 0, 0, deadline, issuerPk
        );
        registry.issueCredentialWithSig(req1, sig1);

        // Second issuance with same (issuer, holder, type, data) should fail
        ICredentialRegistry.CredentialRequest memory req2 = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 1, // new nonce
            deadline: deadline
        });

        bytes memory sig2 = _signCredentialRequest(
            holder, CRED_TYPE, DATA_HASH, 0, 1, deadline, issuerPk
        );

        bytes32 expectedId = _computeId(issuer, holder, CRED_TYPE, DATA_HASH);
        vm.expectRevert(
            abi.encodeWithSelector(CredentialRegistry.CredentialAlreadyExists.selector, expectedId)
        );
        registry.issueCredentialWithSig(req2, sig2);
    }

    function test_IssueCredentialWithSig_ReplayProtection() public {
        uint256 deadline = block.timestamp + 1 hours;

        ICredentialRegistry.CredentialRequest memory req = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: keccak256("CRED_A"),
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 0,
            deadline: deadline
        });

        bytes memory sig = _signCredentialRequest(
            holder, keccak256("CRED_A"), DATA_HASH, 0, 0, deadline, issuerPk
        );

        // First call succeeds
        registry.issueCredentialWithSig(req, sig);

        // Second call with same signature fails (nonce consumed)
        ICredentialRegistry.CredentialRequest memory req2 = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: keccak256("CRED_B"),
            dataHash: DATA_HASH,
            expiryTimestamp: 0,
            nonce: 0, // stale nonce
            deadline: deadline
        });

        bytes memory sig2 = _signCredentialRequest(
            holder, keccak256("CRED_B"), DATA_HASH, 0, 0, deadline, issuerPk
        );

        // Should revert because nonce 0 was already consumed for this holder
        vm.expectRevert();
        registry.issueCredentialWithSig(req2, sig2);
    }

    function test_IssueCredentialWithSig_WithExpiry() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 expiry = block.timestamp + 30 days;

        ICredentialRegistry.CredentialRequest memory req = ICredentialRegistry.CredentialRequest({
            holder: holder,
            credentialType: CRED_TYPE,
            dataHash: DATA_HASH,
            expiryTimestamp: expiry,
            nonce: 0,
            deadline: deadline
        });

        bytes memory sig = _signCredentialRequest(
            holder, CRED_TYPE, DATA_HASH, expiry, 0, deadline, issuerPk
        );

        bytes32 id = registry.issueCredentialWithSig(req, sig);
        assertTrue(registry.isCredentialValid(id));

        ICredentialRegistry.Credential memory cred = registry.getCredential(id);
        assertEq(cred.expiryTimestamp, uint64(expiry));
    }

    // ═══════════════════════════════════════════════════════════════
    // Fuzz Tests
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_IssueCredential_VaryingHolder(address fuzzHolder) public {
        vm.assume(fuzzHolder != address(0));

        bytes32 id = _issue(issuer, fuzzHolder, CRED_TYPE, DATA_HASH, 0);
        assertTrue(registry.isCredentialValid(id));
    }

    function testFuzz_IssueCredential_VaryingTypeAndData(bytes32 fuzzType, bytes32 fuzzData) public {
        bytes32 id = _issue(issuer, holder, fuzzType, fuzzData, 0);
        assertTrue(registry.isCredentialValid(id));
        assertEq(id, _computeId(issuer, holder, fuzzType, fuzzData));
    }
}
