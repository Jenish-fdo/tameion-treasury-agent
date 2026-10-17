// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";

/// @notice ARC TESTNET ONLY. Cross-checks the contract's EIP-712 encoding against an independent implementation.
/// @dev The expected digests and ids below come from `node backend/scripts/eip712-vectors.mjs`, which uses viem and
///      none of this repository's Solidity. If the contract and viem disagree about a struct hash, the signature over
///      the viem digest recovers a different address and the call reverts. Regenerate the constants whenever a typed-data
///      type, the domain, or a fixed input below changes. The keys are public test constants.
contract Eip712VectorsTest is Test {
    address internal constant REGISTRY = 0x00000000000000000000000000000000000c0dE1;
    uint256 internal constant OWNER_PK = 0xa11ce;
    uint256 internal constant APPROVER_PK = 0xb0b;
    address internal constant AGENT = 0x00000000000000000000000000000000000a93E7;
    address internal constant VENDOR = 0x00000000000000000000000000000000007e4D02;

    uint64 internal constant NOW = 1_800_000_000;
    uint64 internal constant DEADLINE = NOW + 1 hours;
    uint128 internal constant USDC = 1e6;

    // From viem (backend/scripts/eip712-vectors.mjs)
    bytes32 internal constant BUSINESS_ID = 0xc7b4e3e5427076d26b5b2200c09dd5aa527349e02127bd4f6cd48199892861aa;
    bytes32 internal constant MANDATE_ID_NONCE7 = 0x80437256ab47f6f38569d4d9ecdcfeb362f7c839c5d3fbd9b42c368d85490c4a;
    bytes32 internal constant MANDATE_ID_NONCE9 = 0x8f4db78df0ba009106c9bda46a25b01497ba50a77fb93f497d79074af12dff19;
    bytes32 internal constant VIEM_MANDATE_DIGEST = 0x5594f88e6f9cc8600b6ba1c020298036a5fd01bafcabfe02f0f50e06720bed7c;
    bytes32 internal constant VIEM_REVOKE_DIGEST = 0x6b604f919cf05c266a9d4329e0797d749fa33df06d37ad9b7dee5217e4ee0166;
    bytes32 internal constant VIEM_APPROVAL_DIGEST = 0x39aa59b065a01102166d216dfa794240b039d33c95d222b1905e7603e45a9d4f;

    bytes32 internal constant SALT = keccak256("acme");
    bytes32 internal constant AGENT_ID = keccak256("agent-1");
    bytes32 internal constant REASON = keccak256("compromised");
    bytes32 internal constant PAYMENT_ID = keccak256("pay-1");

    MandateRegistry internal registry;
    address internal owner;
    address internal approver;

    function setUp() public {
        vm.chainId(5042002);
        vm.warp(NOW);
        deployCodeTo("MandateRegistry.sol:MandateRegistry", REGISTRY);
        registry = MandateRegistry(REGISTRY);
        owner = vm.addr(OWNER_PK);
        approver = vm.addr(APPROVER_PK);

        vm.prank(owner);
        assertEq(registry.registerBusiness(SALT, keccak256("acme metadata")), BUSINESS_ID, "business id differs from viem");
    }

    function _params(uint256 nonce) internal pure returns (IMandateRegistry.MandateParams memory p) {
        address[] memory recipients = new address[](1);
        recipients[0] = VENDOR;
        p = IMandateRegistry.MandateParams({
            businessId: BUSINESS_ID,
            agent: AGENT,
            agentId: AGENT_ID,
            allowedCategories: 3,
            perTxLimit: 1000 * USDC,
            dailyCap: 2000 * USDC,
            weeklyCap: 5000 * USDC,
            monthlyCap: 10_000 * USDC,
            approvalThreshold: 500 * USDC,
            maxRiskTier: 1,
            singleUse: false,
            expiresAt: NOW + 30 days,
            nonce: nonce,
            recipients: recipients
        });
    }

    function _sig(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_Vector_MandateSignatureOverViemDigestIsAccepted() public {
        bytes memory sig = _sig(OWNER_PK, VIEM_MANDATE_DIGEST);
        bytes32 id = registry.createMandateWithSig(_params(7), DEADLINE, sig); // anyone may relay
        assertEq(id, MANDATE_ID_NONCE7, "mandate id differs from viem");
        assertEq(registry.getMandate(id).agent, AGENT);
    }

    function test_Vector_RevokeSignatureOverViemDigestIsAccepted() public {
        vm.prank(owner);
        bytes32 id = registry.createMandate(_params(9));
        assertEq(id, MANDATE_ID_NONCE9, "mandate id differs from viem");

        registry.revokeMandateWithSig(id, REASON, 10, DEADLINE, _sig(OWNER_PK, VIEM_REVOKE_DIGEST));
        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Revoked));
    }

    function test_Vector_ApprovalSignatureOverViemDigestIsAccepted() public {
        vm.startPrank(owner);
        bytes32 id = registry.createMandate(_params(7));
        registry.setApprover(BUSINESS_ID, approver, true);
        vm.stopPrank();
        assertEq(id, MANDATE_ID_NONCE7);

        IMandateRegistry.PaymentRequest memory req = IMandateRegistry.PaymentRequest({
            recipient: VENDOR, amount: 600 * USDC, category: 1, riskTier: 0, paymentId: PAYMENT_ID
        });
        IMandateRegistry.Approval memory a = IMandateRegistry.Approval({
            approver: approver, deadline: DEADLINE, signature: _sig(APPROVER_PK, VIEM_APPROVAL_DIGEST)
        });

        vm.prank(AGENT);
        registry.consume(id, req, a); // reverts InvalidSignature if the approval struct hash differs from viem's
        (uint128 day,,) = registry.getSpend(id);
        assertEq(day, 600 * USDC);
    }

    /// @dev A digest that differs in one field must not verify: guards the vectors above against passing vacuously.
    function test_Vector_WrongDigestIsRejected() public {
        bytes memory sig = _sig(OWNER_PK, VIEM_REVOKE_DIGEST); // valid signature, wrong type
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.createMandateWithSig(_params(7), DEADLINE, sig);
    }
}
