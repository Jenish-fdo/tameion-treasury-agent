// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";
import {MandateCategories} from "../src/libraries/MandateCategories.sol";

/// @dev Minimal ERC-1271 wallet: valid only for digests it was told to accept.
contract Mock1271Wallet {
    mapping(bytes32 => bool) public ok;

    function accept(bytes32 digest) external {
        ok[digest] = true;
    }

    function isValidSignature(bytes32 digest, bytes calldata) external view returns (bytes4) {
        return ok[digest] ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    function call(address to, bytes calldata data) external returns (bytes memory) {
        (bool success, bytes memory ret) = to.call(data);
        require(success, "call failed");
        return ret;
    }
}

/// @notice ARC TESTNET ONLY. Tests for the mandate policy ledger. Amounts are USDC base units (6 decimals).
contract MandateRegistryTest is Test {
    MandateRegistry internal registry;

    uint256 internal ownerPk;
    address internal owner;
    address internal agent;
    address internal otherAgent;
    address internal vendor;
    address internal vendor2;
    address internal stranger;
    uint256 internal approverPk;
    address internal approver;
    address internal relayer;

    bytes32 internal constant SALT = keccak256("acme");
    bytes32 internal constant META = keccak256("acme metadata");
    bytes32 internal constant AGENT_ID = keccak256("agent-1");
    bytes32 internal constant REASON = keccak256("compromised");

    uint128 internal constant USDC = 1e6;
    bytes32 internal businessId;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new MandateRegistry();
        (owner, ownerPk) = makeAddrAndKey("owner");
        agent = makeAddr("agent");
        otherAgent = makeAddr("otherAgent");
        vendor = makeAddr("vendor");
        vendor2 = makeAddr("vendor2");
        stranger = makeAddr("stranger");
        (approver, approverPk) = makeAddrAndKey("approver");
        relayer = makeAddr("relayer");

        vm.prank(owner);
        businessId = registry.registerBusiness(SALT, META);
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    function _params(uint256 nonce) internal view returns (IMandateRegistry.MandateParams memory p) {
        address[] memory recipients = new address[](1);
        recipients[0] = vendor;
        p = IMandateRegistry.MandateParams({
            businessId: businessId,
            agent: agent,
            agentId: AGENT_ID,
            allowedCategories: MandateCategories.bit(MandateCategories.VENDOR_INVOICE) | MandateCategories.bit(MandateCategories.PAYROLL),
            perTxLimit: 1_000 * USDC,
            dailyCap: 2_000 * USDC,
            weeklyCap: 5_000 * USDC,
            monthlyCap: 10_000 * USDC,
            approvalThreshold: 500 * USDC,
            maxRiskTier: 1,
            singleUse: false,
            expiresAt: uint64(block.timestamp + 30 days),
            nonce: nonce,
            recipients: recipients
        });
    }

    function _create(IMandateRegistry.MandateParams memory p) internal returns (bytes32 id) {
        vm.prank(owner);
        id = registry.createMandate(p);
    }

    function _mandate() internal returns (bytes32) {
        return _create(_params(1));
    }

    function _pay(uint128 amount, bytes32 paymentId) internal pure returns (IMandateRegistry.PaymentRequest memory) {
        return IMandateRegistry.PaymentRequest({
            recipient: address(0), amount: amount, category: MandateCategories.VENDOR_INVOICE, riskTier: 0, paymentId: paymentId
        });
    }

    function _payTo(address to, uint128 amount, bytes32 paymentId) internal pure returns (IMandateRegistry.PaymentRequest memory r) {
        r = _pay(amount, paymentId);
        r.recipient = to;
    }

    function _noApproval() internal pure returns (IMandateRegistry.Approval memory) {
        return IMandateRegistry.Approval({approver: address(0), deadline: 0, signature: ""});
    }

    function _consume(bytes32 id, uint128 amount, bytes32 paymentId) internal {
        vm.prank(agent);
        registry.consume(id, _payTo(vendor, amount, paymentId), _noApproval());
    }

    function _expectCheckFailed(IMandateRegistry.Reason reason) internal {
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.CheckFailed.selector, reason));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Credentia Mandates"),
                keccak256("1"),
                block.chainid,
                address(registry)
            )
        );
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _mandateStructHash(IMandateRegistry.MandateParams memory p, uint64 deadline) internal pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                abi.encode(
                    keccak256(
                        "Mandate(bytes32 businessId,address agent,bytes32 agentId,uint32 allowedCategories,uint128 perTxLimit,uint128 dailyCap,uint128 weeklyCap,uint128 monthlyCap,uint128 approvalThreshold,uint8 maxRiskTier,bool singleUse,uint64 expiresAt,uint256 nonce,address[] recipients,uint64 deadline)"
                    ),
                    p.businessId, p.agent, p.agentId, p.allowedCategories, p.perTxLimit, p.dailyCap, p.weeklyCap
                ),
                abi.encode(
                    p.monthlyCap, p.approvalThreshold, p.maxRiskTier, p.singleUse, p.expiresAt, p.nonce,
                    keccak256(abi.encodePacked(p.recipients)), deadline
                )
            )
        );
    }

    function _signMandate(IMandateRegistry.MandateParams memory p, uint64 deadline, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(_mandateStructHash(p, deadline)));
        return abi.encodePacked(r, s, v);
    }

    function _revokeDigest(bytes32 id, bytes32 reason, uint256 nonce, uint64 deadline) internal view returns (bytes32) {
        return _digest(
            keccak256(
                abi.encode(keccak256("RevokeMandate(bytes32 mandateId,bytes32 reason,uint256 nonce,uint64 deadline)"), id, reason, nonce, deadline)
            )
        );
    }

    function _approvalDigest(bytes32 id, bytes32 paymentId, address to, uint128 amount, uint64 deadline) internal view returns (bytes32) {
        return _digest(
            keccak256(
                abi.encode(
                    keccak256("PaymentApproval(bytes32 mandateId,bytes32 paymentId,address recipient,uint128 amount,uint64 deadline)"),
                    id, paymentId, to, amount, deadline
                )
            )
        );
    }

    function _approval(bytes32 id, bytes32 paymentId, address to, uint128 amount, uint256 pk, address who)
        internal
        view
        returns (IMandateRegistry.Approval memory a)
    {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _approvalDigest(id, paymentId, to, amount, deadline));
        a = IMandateRegistry.Approval({approver: who, deadline: deadline, signature: abi.encodePacked(r, s, v)});
    }

    // ═══════════════════════════════════════════════════════════════
    // Businesses
    // ═══════════════════════════════════════════════════════════════

    function test_Business_IdIsDerivedFromRegistrantAndSalt() public view {
        assertEq(businessId, keccak256(abi.encode(address(registry), owner, SALT)));
        (address o, address pending, bytes32 meta, uint64 createdAt) = registry.getBusiness(businessId);
        assertEq(o, owner);
        assertEq(pending, address(0));
        assertEq(meta, META);
        assertEq(createdAt, uint64(block.timestamp));
    }

    function test_Business_SameSaltFromAnotherAccountIsADifferentBusiness() public {
        vm.prank(stranger);
        bytes32 other = registry.registerBusiness(SALT, META);
        assertTrue(other != businessId);
    }

    function test_Business_CannotRegisterTwice() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.BusinessExists.selector, businessId));
        registry.registerBusiness(SALT, META);
    }

    function test_Business_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        registry.proposeBusinessOwner(businessId, stranger);
        (address o, address pending,,) = registry.getBusiness(businessId);
        assertEq(o, owner, "owner unchanged until accepted");
        assertEq(pending, stranger);

        vm.prank(otherAgent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotPendingOwner.selector, businessId, otherAgent));
        registry.acceptBusinessOwner(businessId);

        vm.expectEmit(true, true, true, true);
        emit IMandateRegistry.BusinessOwnerTransferred(businessId, owner, stranger);
        vm.prank(stranger);
        registry.acceptBusinessOwner(businessId);
        (o, pending,,) = registry.getBusiness(businessId);
        assertEq(o, stranger);
        assertEq(pending, address(0));
    }

    function test_Business_OnlyOwnerCanProposeOrSetRoles() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, stranger));
        registry.proposeBusinessOwner(businessId, stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, stranger));
        registry.setRecorder(businessId, stranger, true);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, stranger));
        registry.setApprover(businessId, stranger, true);
        vm.stopPrank();
    }

    function test_Business_RolesIncludeTheOwnerAndNobodyElseByDefault() public {
        assertTrue(registry.isRecorder(businessId, owner));
        assertTrue(registry.isApprover(businessId, owner));
        assertFalse(registry.isRecorder(businessId, relayer));
        assertFalse(registry.isApprover(businessId, approver));

        vm.startPrank(owner);
        registry.setRecorder(businessId, relayer, true);
        registry.setApprover(businessId, approver, true);
        vm.stopPrank();
        assertTrue(registry.isRecorder(businessId, relayer));
        assertTrue(registry.isApprover(businessId, approver));

        vm.prank(owner);
        registry.setRecorder(businessId, relayer, false);
        assertFalse(registry.isRecorder(businessId, relayer));
    }

    function test_Business_UnknownBusinessHasNoRoles() public view {
        assertFalse(registry.isRecorder(bytes32(uint256(1)), owner));
        assertFalse(registry.isApprover(bytes32(uint256(1)), owner));
    }

    // ═══════════════════════════════════════════════════════════════
    // Mandate creation
    // ═══════════════════════════════════════════════════════════════

    function test_Create_StoresEveryField() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        bytes32 id = _create(p);
        assertEq(id, keccak256(abi.encode(businessId, owner, uint256(1))));

        IMandateRegistry.Mandate memory m = registry.getMandate(id);
        assertEq(m.agent, agent);
        assertEq(m.agentId, AGENT_ID);
        assertEq(m.businessId, businessId);
        assertEq(m.allowedCategories, p.allowedCategories);
        assertEq(m.perTxLimit, p.perTxLimit);
        assertEq(m.dailyCap, p.dailyCap);
        assertEq(m.weeklyCap, p.weeklyCap);
        assertEq(m.monthlyCap, p.monthlyCap);
        assertEq(m.approvalThreshold, p.approvalThreshold);
        assertEq(m.maxRiskTier, 1);
        assertFalse(m.singleUse);
        assertEq(m.expiresAt, p.expiresAt);
        assertEq(m.nonce, 1);
        assertEq(uint8(m.status), uint8(IMandateRegistry.MandateStatus.Active));
        assertTrue(registry.isRecipientAllowed(id, vendor));
        assertFalse(registry.isRecipientAllowed(id, vendor2));
        assertTrue(registry.nonceUsed(owner, 1));
    }

    function test_Create_EmitsEvents() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        bytes32 id = keccak256(abi.encode(businessId, owner, uint256(1)));

        vm.expectEmit(true, true, true, true);
        emit IMandateRegistry.RecipientSet(id, vendor, true);
        vm.expectEmit(true, true, true, true);
        emit IMandateRegistry.MandateCreated(id, businessId, agent, AGENT_ID, owner, p.expiresAt, false, 1);
        vm.expectEmit(true, false, false, true);
        emit IMandateRegistry.MandateLimitsSet(id, p.perTxLimit, p.dailyCap, p.weeklyCap, p.monthlyCap, p.approvalThreshold, 1, p.allowedCategories, 1);
        _create(p);
    }

    function test_Create_IsIndexedByBusinessAndAgent() public {
        bytes32 a = _create(_params(1));
        bytes32 b = _create(_params(2));
        assertEq(registry.mandateCountByBusiness(businessId), 2);
        bytes32[] memory ids = registry.mandateIdsByBusiness(businessId, 0, 10);
        assertEq(ids.length, 2);
        assertEq(ids[0], a);
        assertEq(ids[1], b);
        assertEq(registry.mandateIdsByAgent(agent, 1, 10)[0], b);
        assertEq(registry.mandateIdsByBusiness(businessId, 5, 10).length, 0, "offset past the end is empty");
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.PageTooLarge.selector, uint256(101)));
        registry.mandateIdsByBusiness(businessId, 0, 101);
    }

    function test_Create_OnlyTheBusinessOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, stranger));
        registry.createMandate(_params(1));

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, agent));
        registry.createMandate(_params(1));
    }

    function test_Create_UnknownBusiness() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        p.businessId = bytes32(uint256(7));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownBusiness.selector, p.businessId));
        registry.createMandate(p);
    }

    function test_Create_RejectsBadShapes() public {
        IMandateRegistry.MandateParams memory p;

        p = _params(1); p.agent = address(0);
        vm.prank(owner); vm.expectRevert(MandateRegistry.ZeroAddress.selector); registry.createMandate(p);

        p = _params(1); p.agent = owner;
        vm.prank(owner); vm.expectRevert(MandateRegistry.AgentIsOwner.selector); registry.createMandate(p);

        p = _params(1); p.allowedCategories = 0;
        vm.prank(owner); vm.expectRevert(MandateRegistry.NoCategories.selector); registry.createMandate(p);

        p = _params(1); p.perTxLimit = 0;
        vm.prank(owner); vm.expectRevert(MandateRegistry.InvalidLimits.selector); registry.createMandate(p);

        p = _params(1); p.perTxLimit = p.dailyCap + 1;
        vm.prank(owner); vm.expectRevert(MandateRegistry.InvalidLimits.selector); registry.createMandate(p);

        p = _params(1); p.dailyCap = p.weeklyCap + 1;
        vm.prank(owner); vm.expectRevert(MandateRegistry.InvalidLimits.selector); registry.createMandate(p);

        p = _params(1); p.weeklyCap = p.monthlyCap + 1;
        vm.prank(owner); vm.expectRevert(MandateRegistry.InvalidLimits.selector); registry.createMandate(p);

        p = _params(1); p.maxRiskTier = 3;
        vm.prank(owner); vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidRiskTier.selector, uint8(3))); registry.createMandate(p);
    }

    function test_Create_RejectsBadRecipients() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        p.recipients[0] = address(0);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidRecipient.selector, address(0)));
        registry.createMandate(p);

        p = _params(2);
        p.recipients[0] = agent; // an agent may not pay itself
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidRecipient.selector, agent));
        registry.createMandate(p);

        p = _params(3);
        p.recipients = new address[](101);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.TooManyRecipients.selector, uint256(101)));
        registry.createMandate(p);
    }

    function test_Create_AnEmptyAllowlistMeansNobodyCanBePaid() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        p.recipients = new address[](0);
        bytes32 id = _create(p);
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.RecipientNotAllowed);
        registry.consume(id, _payTo(vendor, 10 * USDC, "p1"), _noApproval());
    }

    function test_Create_ExpiryMustBeInTheFutureAndBounded() public {
        IMandateRegistry.MandateParams memory p = _params(1);

        p.expiresAt = uint64(block.timestamp); // exactly now is already expired
        vm.prank(owner); vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidExpiry.selector, p.expiresAt)); registry.createMandate(p);

        p = _params(2); p.expiresAt = uint64(block.timestamp - 1);
        vm.prank(owner); vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidExpiry.selector, p.expiresAt)); registry.createMandate(p);

        p = _params(3); p.expiresAt = 0; // zero is NOT "never expires" for a mandate
        vm.prank(owner); vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidExpiry.selector, p.expiresAt)); registry.createMandate(p);

        p = _params(4); p.expiresAt = uint64(block.timestamp + 365 days + 1);
        vm.prank(owner); vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidExpiry.selector, p.expiresAt)); registry.createMandate(p);

        p = _params(5); p.expiresAt = uint64(block.timestamp + 365 days); // the maximum is allowed
        _create(p);
        p = _params(6); p.expiresAt = uint64(block.timestamp + 1);
        _create(p);
    }

    // ═══════════════════════════════════════════════════════════════
    // Signed creation: nonce replay prevention (review M-1) and expiry (M-2)
    // ═══════════════════════════════════════════════════════════════

    function test_CreateWithSig_AnyoneCanRelayTheOwnersSignature() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);
        vm.prank(relayer);
        bytes32 id = registry.createMandateWithSig(p, deadline, sig);
        assertEq(id, keccak256(abi.encode(businessId, owner, uint256(11))));
        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Active));
    }

    function test_CreateWithSig_ReplayingTheSameSignatureFails() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);
        registry.createMandateWithSig(p, deadline, sig);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NonceUsed.selector, owner, uint256(11)));
        registry.createMandateWithSig(p, deadline, sig);
    }

    function test_CreateWithSig_ADirectCreationBurnsTheNonceToo() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);
        _create(p);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NonceUsed.selector, owner, uint256(11)));
        registry.createMandateWithSig(p, deadline, sig);
    }

    function test_CreateWithSig_ADirectReuseOfANonceFails() public {
        _create(_params(5));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NonceUsed.selector, owner, uint256(5)));
        registry.createMandate(_params(5));
    }

    function test_CreateWithSig_CancellingTheNonceKillsAPendingSignature() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);

        vm.expectEmit(true, false, false, true);
        emit IMandateRegistry.NonceCancelled(owner, 11);
        vm.prank(owner);
        registry.cancelNonce(11);

        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NonceUsed.selector, owner, uint256(11)));
        registry.createMandateWithSig(p, deadline, sig);
    }

    function test_CreateWithSig_CancellingSomeoneElsesNonceDoesNothing() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);
        vm.prank(stranger);
        registry.cancelNonce(11);
        registry.createMandateWithSig(p, deadline, sig);
    }

    function test_CreateWithSig_NoncesAreUnordered() public {
        IMandateRegistry.MandateParams memory hi = _params(1000);
        IMandateRegistry.MandateParams memory lo = _params(3);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        registry.createMandateWithSig(hi, deadline, _signMandate(hi, deadline, ownerPk));
        registry.createMandateWithSig(lo, deadline, _signMandate(lo, deadline, ownerPk));
    }

    function test_CreateWithSig_TamperedParametersFail() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);

        p.dailyCap = p.dailyCap + 1; // anything the signer did not sign
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.createMandateWithSig(p, deadline, sig);

        p = _params(11);
        p.recipients[0] = vendor2;
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.createMandateWithSig(p, deadline, sig);

        p = _params(11);
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.createMandateWithSig(p, deadline + 1, sig); // the deadline is signed too
    }

    function test_CreateWithSig_WrongSignerFails() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        (, uint256 strangerPk) = makeAddrAndKey("strangerKey");
        bytes memory sig = _signMandate(p, deadline, strangerPk);
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.createMandateWithSig(p, deadline, sig);
        assertFalse(registry.nonceUsed(owner, 11), "a failed signature must not burn the nonce");
    }

    function test_CreateWithSig_ExpiredDeadlineFails() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp - 1);
        bytes memory sig = _signMandate(p, deadline, ownerPk);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.SignatureExpired.selector, deadline));
        registry.createMandateWithSig(p, deadline, sig);
    }

    function test_CreateWithSig_AlreadyExpiredMandateIsRejectedOnTheSignedPathToo() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        p.expiresAt = uint64(block.timestamp - 1);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidExpiry.selector, p.expiresAt));
        registry.createMandateWithSig(p, deadline, sig);
    }

    function test_CreateWithSig_SignatureIsBoundToThisRegistryAndChain() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signMandate(p, deadline, ownerPk);

        MandateRegistry twin = new MandateRegistry();
        vm.prank(owner);
        bytes32 twinBusiness = twin.registerBusiness(SALT, META);
        p.businessId = twinBusiness; // same fields otherwise, different verifying contract
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        twin.createMandateWithSig(p, deadline, sig);

        vm.chainId(block.chainid + 1);
        p = _params(11);
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.createMandateWithSig(p, deadline, sig);
    }

    function test_CreateWithSig_UnknownBusiness() public {
        IMandateRegistry.MandateParams memory p = _params(11);
        p.businessId = bytes32(uint256(9));
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownBusiness.selector, p.businessId));
        registry.createMandateWithSig(p, uint64(block.timestamp + 1), hex"00");
    }

    function test_CreateWithSig_AnErc1271SmartAccountCanBeTheOwner() public {
        Mock1271Wallet wallet = new Mock1271Wallet();
        vm.prank(address(wallet));
        bytes32 walletBusiness = registry.registerBusiness(SALT, META);

        IMandateRegistry.MandateParams memory p = _params(21);
        p.businessId = walletBusiness;
        uint64 deadline = uint64(block.timestamp + 1 hours);
        wallet.accept(_digest(_mandateStructHash(p, deadline)));

        bytes32 id = registry.createMandateWithSig(p, deadline, hex"1234");
        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Active));
        assertTrue(registry.nonceUsed(address(wallet), 21));

        // a different mandate that the wallet never approved is refused
        IMandateRegistry.MandateParams memory q = _params(22);
        q.businessId = walletBusiness;
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.createMandateWithSig(q, deadline, hex"1234");
    }

    // ═══════════════════════════════════════════════════════════════
    // Expiry
    // ═══════════════════════════════════════════════════════════════

    function test_Expiry_ValidUntilTheLastSecondBeforeExpiresAt() public {
        bytes32 id = _mandate();
        uint64 exp = registry.getMandate(id).expiresAt;

        vm.warp(exp - 1);
        assertTrue(registry.validate(id, agent, _payTo(vendor, 10 * USDC, "a")).allowed);
        _consume(id, 10 * USDC, "a");

        vm.warp(exp); // exactly at expiresAt the mandate is expired
        IMandateRegistry.CheckResult memory r = registry.validate(id, agent, _payTo(vendor, 10 * USDC, "b"));
        assertFalse(r.allowed);
        assertEq(uint8(r.reason), uint8(IMandateRegistry.Reason.Expired));
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.Expired);
        registry.consume(id, _payTo(vendor, 10 * USDC, "b"), _noApproval());
    }

    function test_Expiry_MarkExpiredEmitsAndSetsStatus() public {
        bytes32 id = _mandate();
        uint64 exp = registry.getMandate(id).expiresAt;

        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotExpirable.selector, id));
        registry.markExpired(id); // not yet

        vm.warp(exp);
        vm.expectEmit(true, false, false, false);
        emit IMandateRegistry.MandateExpired(id);
        vm.prank(stranger); // permissionless
        registry.markExpired(id);
        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Expired));

        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotExpirable.selector, id));
        registry.markExpired(id); // only once
    }

    function test_Expiry_MarkExpiredRejectsUnknownRevokedAndConsumedMandates() public {
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotExpirable.selector, bytes32(uint256(1))));
        registry.markExpired(bytes32(uint256(1)));

        bytes32 id = _mandate();
        vm.prank(owner);
        registry.revokeMandate(id, REASON);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotExpirable.selector, id));
        registry.markExpired(id);
    }

    function test_Expiry_AnExpiredMandateCannotBeEdited() public {
        bytes32 id = _mandate();
        vm.warp(registry.getMandate(id).expiresAt);
        registry.markExpired(id);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotActive.selector, id, IMandateRegistry.MandateStatus.Expired));
        registry.setRecipient(id, vendor2, true);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotActive.selector, id, IMandateRegistry.MandateStatus.Expired));
        registry.revokeMandate(id, REASON);
    }

    // ═══════════════════════════════════════════════════════════════
    // Revocation
    // ═══════════════════════════════════════════════════════════════

    function test_Revoke_IsImmediateAndBlocksUse() public {
        bytes32 id = _mandate();
        _consume(id, 10 * USDC, "before");

        vm.expectEmit(true, true, false, true);
        emit IMandateRegistry.MandateRevoked(id, owner, REASON);
        vm.prank(owner);
        registry.revokeMandate(id, REASON);

        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Revoked));
        IMandateRegistry.CheckResult memory r = registry.validate(id, agent, _payTo(vendor, 10 * USDC, "after"));
        assertEq(uint8(r.reason), uint8(IMandateRegistry.Reason.Revoked));
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.Revoked);
        registry.consume(id, _payTo(vendor, 10 * USDC, "after"), _noApproval());
    }

    function test_Revoke_OnlyTheOwner() public {
        bytes32 id = _mandate();
        vm.prank(agent); // the agent cannot revoke its own mandate either
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, agent));
        registry.revokeMandate(id, REASON);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, stranger));
        registry.revokeMandate(id, REASON);
    }

    function test_Revoke_UnknownAndDouble() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownMandate.selector, bytes32(uint256(5))));
        registry.revokeMandate(bytes32(uint256(5)), REASON);

        bytes32 id = _mandate();
        vm.startPrank(owner);
        registry.revokeMandate(id, REASON);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotActive.selector, id, IMandateRegistry.MandateStatus.Revoked));
        registry.revokeMandate(id, REASON);
        vm.stopPrank();
    }

    function test_Revoke_FollowsBusinessOwnershipTransfer() public {
        bytes32 id = _mandate();
        vm.prank(owner);
        registry.proposeBusinessOwner(businessId, stranger);
        vm.prank(stranger);
        registry.acceptBusinessOwner(businessId);

        vm.prank(owner); // the old owner lost the power
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, owner));
        registry.revokeMandate(id, REASON);
        vm.prank(stranger);
        registry.revokeMandate(id, REASON);
    }

    function test_RevokeWithSig_WorksOnceAndCannotBeReplayed() public {
        bytes32 id = _mandate();
        uint64 deadline = uint64(block.timestamp + 1 hours);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, _revokeDigest(id, REASON, 77, deadline));
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(relayer);
        registry.revokeMandateWithSig(id, REASON, 77, deadline, sig);
        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Revoked));

        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NonceUsed.selector, owner, uint256(77)));
        registry.revokeMandateWithSig(id, REASON, 77, deadline, sig);
    }

    function test_RevokeWithSig_RejectsBadSignatureExpiredDeadlineAndCancelledNonce() public {
        bytes32 id = _mandate();
        uint64 deadline = uint64(block.timestamp + 1 hours);
        (, uint256 strangerPk) = makeAddrAndKey("strangerKey");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(strangerPk, _revokeDigest(id, REASON, 1, deadline));
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.revokeMandateWithSig(id, REASON, 1, deadline, abi.encodePacked(r, s, v));

        uint64 past = uint64(block.timestamp - 1);
        (v, r, s) = vm.sign(ownerPk, _revokeDigest(id, REASON, 2, past));
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.SignatureExpired.selector, past));
        registry.revokeMandateWithSig(id, REASON, 2, past, abi.encodePacked(r, s, v));

        (v, r, s) = vm.sign(ownerPk, _revokeDigest(id, REASON, 3, deadline));
        vm.prank(owner);
        registry.cancelNonce(3);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NonceUsed.selector, owner, uint256(3)));
        registry.revokeMandateWithSig(id, REASON, 3, deadline, abi.encodePacked(r, s, v));

        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownMandate.selector, bytes32(uint256(8))));
        registry.revokeMandateWithSig(bytes32(uint256(8)), REASON, 4, deadline, hex"00");
    }

    // ═══════════════════════════════════════════════════════════════
    // Single use
    // ═══════════════════════════════════════════════════════════════

    function test_SingleUse_CannotBeReusedAfterExecution() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        p.singleUse = true;
        bytes32 id = _create(p);

        vm.expectEmit(true, false, false, false);
        emit IMandateRegistry.MandateConsumed(id);
        _consume(id, 100 * USDC, "only");
        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Consumed));

        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.Consumed);
        registry.consume(id, _payTo(vendor, 1 * USDC, "again"), _noApproval());
        assertEq(uint8(registry.validate(id, agent, _payTo(vendor, 1 * USDC, "x")).reason), uint8(IMandateRegistry.Reason.Consumed));
    }

    function test_SingleUse_AFailedAttemptDoesNotSpendIt() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        p.singleUse = true;
        bytes32 id = _create(p);
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.OverPerTxLimit);
        registry.consume(id, _payTo(vendor, 5_000 * USDC, "big"), _noApproval());
        _consume(id, 100 * USDC, "ok"); // still usable once
    }

    function test_MultiUse_StaysActive() public {
        bytes32 id = _mandate();
        _consume(id, 10 * USDC, "1");
        _consume(id, 10 * USDC, "2");
        assertEq(uint8(registry.getMandate(id).status), uint8(IMandateRegistry.MandateStatus.Active));
    }

    // ═══════════════════════════════════════════════════════════════
    // Unauthorized agent usage
    // ═══════════════════════════════════════════════════════════════

    function test_Agent_OnlyTheNamedAgentMayConsume() public {
        bytes32 id = _mandate();
        vm.prank(otherAgent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotMandateAgent.selector, id, otherAgent));
        registry.consume(id, _payTo(vendor, 10 * USDC, "p"), _noApproval());

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotMandateAgent.selector, id, stranger));
        registry.consume(id, _payTo(vendor, 10 * USDC, "p"), _noApproval());
    }

    function test_Agent_TheOwnerAndRecordersCannotConsumeOnTheAgentsBehalf() public {
        bytes32 id = _mandate();
        vm.prank(owner);
        registry.setRecorder(businessId, relayer, true);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotMandateAgent.selector, id, owner));
        registry.consume(id, _payTo(vendor, 10 * USDC, "p"), _noApproval());
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotMandateAgent.selector, id, relayer));
        registry.consume(id, _payTo(vendor, 10 * USDC, "p"), _noApproval());
    }

    function test_Agent_AnotherBusinessesAgentCannotUseThisMandate() public {
        // Business B has its own owner and its own agent. B's agent cannot use A's mandate.
        address ownerB = makeAddr("ownerB");
        address agentB = makeAddr("agentB");
        vm.prank(ownerB);
        bytes32 businessB = registry.registerBusiness(SALT, META);
        IMandateRegistry.MandateParams memory pb = _params(1);
        pb.businessId = businessB;
        pb.agent = agentB;
        vm.prank(ownerB);
        bytes32 idB = registry.createMandate(pb);

        bytes32 idA = _mandate();

        vm.prank(agentB);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotMandateAgent.selector, idA, agentB));
        registry.consume(idA, _payTo(vendor, 10 * USDC, "p"), _noApproval());

        // and A's agent cannot use B's
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotMandateAgent.selector, idB, agent));
        registry.consume(idB, _payTo(vendor, 10 * USDC, "p"), _noApproval());

        // the other business's owner cannot create, revoke or edit this business's mandates
        vm.prank(ownerB);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, ownerB));
        registry.revokeMandate(idA, REASON);
        vm.prank(ownerB);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, ownerB));
        registry.setRecipient(idA, vendor2, true);
    }

    function test_Agent_ValidateReportsWrongAgentWithoutReverting() public {
        bytes32 id = _mandate();
        IMandateRegistry.CheckResult memory r = registry.validate(id, otherAgent, _payTo(vendor, 10 * USDC, "p"));
        assertFalse(r.allowed);
        assertEq(uint8(r.reason), uint8(IMandateRegistry.Reason.WrongAgent));
    }

    function test_Agent_UnknownMandate() public {
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.UnknownMandate);
        registry.consume(bytes32(uint256(99)), _payTo(vendor, 10 * USDC, "p"), _noApproval());
        assertEq(
            uint8(registry.validate(bytes32(uint256(99)), agent, _payTo(vendor, 10 * USDC, "p")).reason),
            uint8(IMandateRegistry.Reason.UnknownMandate)
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // Category, risk tier, amount sanity, recipient allowlist
    // ═══════════════════════════════════════════════════════════════

    function test_Category_OnlyAllowedCategoriesPass() public {
        bytes32 id = _mandate();
        IMandateRegistry.PaymentRequest memory req = _payTo(vendor, 10 * USDC, "c");

        req.category = MandateCategories.PAYROLL; // allowed
        assertTrue(registry.validate(id, agent, req).allowed);
        req.category = MandateCategories.TAX; // not allowed
        assertEq(uint8(registry.validate(id, agent, req).reason), uint8(IMandateRegistry.Reason.CategoryNotAllowed));
        req.category = 32; // out of range is simply not allowed, never a panic
        assertEq(uint8(registry.validate(id, agent, req).reason), uint8(IMandateRegistry.Reason.CategoryNotAllowed));
        req.category = 255;
        assertEq(uint8(registry.validate(id, agent, req).reason), uint8(IMandateRegistry.Reason.CategoryNotAllowed));
    }

    function test_RiskTier_AboveTheMandatesMaximumIsRefused() public {
        bytes32 id = _mandate(); // maxRiskTier = 1
        IMandateRegistry.PaymentRequest memory req = _payTo(vendor, 10 * USDC, "r");
        req.riskTier = 1;
        assertTrue(registry.validate(id, agent, req).allowed);
        req.riskTier = 2;
        assertEq(uint8(registry.validate(id, agent, req).reason), uint8(IMandateRegistry.Reason.RiskTierTooHigh));
        req.riskTier = 3;
        assertEq(uint8(registry.validate(id, agent, req).reason), uint8(IMandateRegistry.Reason.RiskTierTooHigh));
        req.riskTier = 200;
        assertEq(uint8(registry.validate(id, agent, req).reason), uint8(IMandateRegistry.Reason.RiskTierTooHigh));
    }

    function test_Amount_ZeroIsRefused() public {
        bytes32 id = _mandate();
        assertEq(uint8(registry.validate(id, agent, _payTo(vendor, 0, "z")).reason), uint8(IMandateRegistry.Reason.ZeroAmount));
    }

    function test_Allowlist_UnlistedRecipientsAreRefused() public {
        bytes32 id = _mandate();
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.RecipientNotAllowed);
        registry.consume(id, _payTo(vendor2, 10 * USDC, "p"), _noApproval());
    }

    function test_Allowlist_OwnerCanAddAndRemoveRecipients() public {
        bytes32 id = _mandate();
        vm.expectEmit(true, true, false, true);
        emit IMandateRegistry.RecipientSet(id, vendor2, true);
        vm.prank(owner);
        registry.setRecipient(id, vendor2, true);
        assertTrue(registry.validate(id, agent, _payTo(vendor2, 10 * USDC, "p")).allowed);

        vm.prank(owner);
        registry.setRecipient(id, vendor, false);
        assertEq(uint8(registry.validate(id, agent, _payTo(vendor, 10 * USDC, "p")).reason), uint8(IMandateRegistry.Reason.RecipientNotAllowed));
    }

    function test_Allowlist_OnlyTheOwnerMayEdit_AndNotTheAgent() public {
        bytes32 id = _mandate();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, agent));
        registry.setRecipient(id, stranger, true);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotBusinessOwner.selector, businessId, stranger));
        registry.setRecipient(id, stranger, true);
    }

    function test_Allowlist_RejectsZeroAndTheAgentAsRecipient() public {
        bytes32 id = _mandate();
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidRecipient.selector, address(0)));
        registry.setRecipient(id, address(0), true);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.InvalidRecipient.selector, agent));
        registry.setRecipient(id, agent, true);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownMandate.selector, bytes32(uint256(4))));
        registry.setRecipient(bytes32(uint256(4)), vendor, true);
        vm.stopPrank();
    }

    function test_Allowlist_CannotBeEditedOnARevokedMandate() public {
        bytes32 id = _mandate();
        vm.startPrank(owner);
        registry.revokeMandate(id, REASON);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotActive.selector, id, IMandateRegistry.MandateStatus.Revoked));
        registry.setRecipient(id, vendor2, true);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    // Spending caps
    // ═══════════════════════════════════════════════════════════════

    function test_Caps_PerTransactionLimit() public {
        bytes32 id = _noApprovalMandate(2); // 1000 per tx; no approval needed, so this test is only about the limit

        _consume(id, 1_000 * USDC, "exact"); // exactly the limit is allowed
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.OverPerTxLimit);
        registry.consume(id, _payTo(vendor, 1_000 * USDC + 1, "over"), _noApproval());
    }

    function _noApprovalMandate(uint256 nonce) internal returns (bytes32) {
        IMandateRegistry.MandateParams memory p = _params(nonce);
        p.approvalThreshold = type(uint128).max;
        return _create(p);
    }

    function test_Caps_DailyCapStopsTheSecondOverage() public {
        bytes32 id = _noApprovalMandate(1); // per tx 1000, daily 2000
        _consume(id, 1_000 * USDC, "a");
        _consume(id, 1_000 * USDC, "b"); // 2000 == the cap: allowed
        (uint128 day,,) = registry.getSpend(id);
        assertEq(day, 2_000 * USDC);

        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.OverDailyCap);
        registry.consume(id, _payTo(vendor, 1, "c"), _noApproval());
        IMandateRegistry.CheckResult memory r = registry.validate(id, agent, _payTo(vendor, 1, "c"));
        assertEq(uint8(r.reason), uint8(IMandateRegistry.Reason.OverDailyCap));
    }

    function test_Caps_RemainingAmountsAreReported() public {
        bytes32 id = _noApprovalMandate(1);
        _consume(id, 700 * USDC, "a");
        IMandateRegistry.CheckResult memory r = registry.validate(id, agent, _payTo(vendor, 100 * USDC, "b"));
        assertTrue(r.allowed);
        assertEq(r.dailyRemaining, 1_300 * USDC);
        assertEq(r.weeklyRemaining, 4_300 * USDC);
        assertEq(r.monthlyRemaining, 9_300 * USDC);
    }

    /// @dev Picks a timestamp where the next UTC-day boundary is not also a week or month boundary.
    function _quietTime() internal returns (uint256 t) {
        t = 1_800_000_000;
        while (t / 7 days != (t + 1 days) / 7 days || t / 30 days != (t + 1 days) / 30 days) t += 1 days;
        t = (t / 1 days) * 1 days + 3_600;
        vm.warp(t);
    }

    function test_Caps_DailyWindowRollsOverButWeekAndMonthDoNot() public {
        uint256 t = _quietTime();
        IMandateRegistry.MandateParams memory p = _params(1);
        p.approvalThreshold = type(uint128).max;
        p.expiresAt = uint64(t + 90 days);
        bytes32 id = _create(p);

        _consume(id, 1_000 * USDC, "a");
        _consume(id, 1_000 * USDC, "b");
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.OverDailyCap);
        registry.consume(id, _payTo(vendor, 1, "blocked"), _noApproval());

        vm.warp(((t / 1 days) + 1) * 1 days); // the next UTC day
        (uint128 day, uint128 week, uint128 month) = registry.getSpend(id);
        assertEq(day, 0, "daily counter resets");
        assertEq(week, 2_000 * USDC, "weekly counter persists inside the week");
        assertEq(month, 2_000 * USDC, "monthly counter persists inside the month");
        _consume(id, 1_000 * USDC, "c");
        (day, week, month) = registry.getSpend(id);
        assertEq(day, 1_000 * USDC);
        assertEq(week, 3_000 * USDC);
        assertEq(month, 3_000 * USDC);
    }

    function test_Caps_WeeklyCapEnforcedAcrossDays() public {
        uint256 t = _quietTime();
        // Need several days inside one week: start at the beginning of a week bucket.
        t = (t / 7 days) * 7 days + 100;
        vm.warp(t);
        IMandateRegistry.MandateParams memory p = _params(1);
        p.approvalThreshold = type(uint128).max;
        p.expiresAt = uint64(t + 90 days);
        bytes32 id = _create(p);

        for (uint256 day; day < 2; ++day) {
            _consume(id, 1_000 * USDC, bytes32(day * 2));
            _consume(id, 1_000 * USDC, bytes32(day * 2 + 1));
            vm.warp(t + (day + 1) * 1 days);
        }
        // 4000 spent in this week bucket so far; two days remain in the bucket (days 2..6)
        _consume(id, 1_000 * USDC, bytes32(uint256(10))); // 5000 == weekly cap
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.OverWeeklyCap);
        registry.consume(id, _payTo(vendor, 1, "over-week"), _noApproval());
    }

    function test_Caps_MonthlyCapEnforcedAndAllWindowsRollOver() public {
        uint256 start = (uint256(1_800_000_000) / 30 days) * 30 days + 100; // start of a 30-day bucket
        while (start / 7 days != (start + 5 days) / 7 days) start += 1 days; // keep the 5 test days inside one week bucket
        vm.warp(start);
        IMandateRegistry.MandateParams memory p = _params(1);
        p.approvalThreshold = type(uint128).max;
        p.weeklyCap = 9_000 * USDC; // let the monthly cap bite before the weekly cap
        p.monthlyCap = 9_000 * USDC;
        p.expiresAt = uint64(start + 120 days);
        bytes32 id = _create(p);

        uint256 n;
        // spend 9000 in 4.5 buckets of 2000/day over 5 days (each day 2 x 1000 -> 2000, last day 1000)
        for (uint256 d; d < 5; ++d) {
            vm.warp(start + d * 1 days);
            _consume(id, 1_000 * USDC, bytes32(++n));
            if (d < 4) _consume(id, 1_000 * USDC, bytes32(++n));
        }
        (,, uint128 month) = registry.getSpend(id);
        assertEq(month, 9_000 * USDC);
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.OverWeeklyCap); // weekly and monthly are equal; the weekly check comes first
        registry.consume(id, _payTo(vendor, 1, "x"), _noApproval());

        // into the next 30-day bucket everything is fresh
        vm.warp(((start / 30 days) + 1) * 30 days + 10);
        (uint128 d2, uint128 w2, uint128 m2) = registry.getSpend(id);
        assertEq(d2 + w2 + m2, 0);
        _consume(id, 1_000 * USDC, bytes32(++n));
    }

    function test_Caps_MonthlyCapIsReportedWhenItIsTheBindingOne() public {
        uint256 start = (uint256(1_800_000_000) / 30 days) * 30 days + 100;
        vm.warp(start);
        IMandateRegistry.MandateParams memory p = _params(1);
        p.approvalThreshold = type(uint128).max;
        p.weeklyCap = 10_000 * USDC;
        p.monthlyCap = 10_000 * USDC;
        p.dailyCap = 10_000 * USDC;
        p.perTxLimit = 10_000 * USDC;
        p.expiresAt = uint64(start + 120 days);
        bytes32 id = _create(p);
        _consume(id, 9_999 * USDC, "a");
        // raise only the weekly view by moving to a new week inside the same month bucket
        vm.warp(start + 8 days);
        (, uint128 w, uint128 m) = registry.getSpend(id);
        assertEq(w, 0);
        assertEq(m, 9_999 * USDC);
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.OverMonthlyCap);
        registry.consume(id, _payTo(vendor, 2 * USDC, "b"), _noApproval());
    }

    function test_Caps_AFailedConsumeSpendsNothing() public {
        bytes32 id = _noApprovalMandate(1);
        vm.prank(agent);
        vm.expectRevert();
        registry.consume(id, _payTo(vendor2, 100 * USDC, "bad-recipient"), _noApproval());
        (uint128 day,,) = registry.getSpend(id);
        assertEq(day, 0);
    }

    function testFuzz_Caps_CumulativeSpendNeverExceedsAnyCap(uint128[8] memory amounts) public {
        IMandateRegistry.MandateParams memory p = _params(1);
        p.approvalThreshold = type(uint128).max;
        bytes32 id = _create(p);
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) {
            uint128 a = uint128(bound(amounts[i], 1, 1_500 * USDC));
            vm.prank(agent);
            try registry.consume(id, _payTo(vendor, a, bytes32(i + 1)), _noApproval()) {
                total += a;
            } catch {}
            (uint128 day, uint128 week, uint128 month) = registry.getSpend(id);
            assertLe(day, p.dailyCap);
            assertLe(week, p.weeklyCap);
            assertLe(month, p.monthlyCap);
            assertEq(day, total);
        }
    }

    function testFuzz_ValidateAgreesWithConsume(uint128 amount, uint8 category, uint8 tier, bool knownRecipient) public {
        bytes32 id = _noApprovalMandate(1);
        IMandateRegistry.PaymentRequest memory req = IMandateRegistry.PaymentRequest({
            recipient: knownRecipient ? vendor : vendor2, amount: amount, category: category, riskTier: tier, paymentId: "fz"
        });
        IMandateRegistry.CheckResult memory r = registry.validate(id, agent, req);
        vm.prank(agent);
        if (r.allowed) {
            registry.consume(id, req, _noApproval());
            (uint128 day,,) = registry.getSpend(id);
            assertEq(day, amount);
        } else {
            vm.expectRevert(abi.encodeWithSelector(MandateRegistry.CheckFailed.selector, r.reason));
            registry.consume(id, req, _noApproval());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Payment id replay
    // ═══════════════════════════════════════════════════════════════

    function test_Replay_APaymentIdCanBeConsumedOnlyOnce() public {
        bytes32 id = _noApprovalMandate(1);
        _consume(id, 10 * USDC, "pay-1");
        assertEq(uint8(registry.validate(id, agent, _payTo(vendor, 10 * USDC, "pay-1")).reason), uint8(IMandateRegistry.Reason.PaymentAlreadyUsed));
        vm.prank(agent);
        _expectCheckFailed(IMandateRegistry.Reason.PaymentAlreadyUsed);
        registry.consume(id, _payTo(vendor, 10 * USDC, "pay-1"), _noApproval());
        _consume(id, 10 * USDC, "pay-2");
    }

    function test_Replay_APaymentIdIsScopedToItsMandate() public {
        bytes32 a = _noApprovalMandate(1);
        bytes32 b = _noApprovalMandate(2);
        _consume(a, 10 * USDC, "shared-id");
        _consume(b, 10 * USDC, "shared-id");
    }

    // ═══════════════════════════════════════════════════════════════
    // Human approval threshold
    // ═══════════════════════════════════════════════════════════════

    function test_Approval_BelowTheThresholdNeedsNone() public {
        bytes32 id = _mandate(); // threshold 500
        IMandateRegistry.CheckResult memory r = registry.validate(id, agent, _payTo(vendor, 499 * USDC, "p"));
        assertTrue(r.allowed);
        assertFalse(r.needsApproval);
        _consume(id, 499 * USDC, "p");
    }

    function test_Approval_AtOrAboveTheThresholdIsFlaggedAndRequired() public {
        bytes32 id = _mandate();
        IMandateRegistry.CheckResult memory r = registry.validate(id, agent, _payTo(vendor, 500 * USDC, "p"));
        assertTrue(r.allowed);
        assertTrue(r.needsApproval, "the threshold itself needs approval");

        vm.prank(agent);
        vm.expectRevert(MandateRegistry.ApprovalRequired.selector);
        registry.consume(id, _payTo(vendor, 500 * USDC, "p"), _noApproval());
        (uint128 day,,) = registry.getSpend(id);
        assertEq(day, 0);
    }

    function test_Approval_ZeroThresholdMeansEveryPaymentNeedsApproval() public {
        IMandateRegistry.MandateParams memory p = _params(1);
        p.approvalThreshold = 0;
        bytes32 id = _create(p);
        assertTrue(registry.validate(id, agent, _payTo(vendor, 1, "p")).needsApproval);
    }

    function test_Approval_AValidOwnerSignatureLetsThePaymentThrough() public {
        bytes32 id = _mandate();
        IMandateRegistry.Approval memory a = _approval(id, "big", vendor, 800 * USDC, ownerPk, owner);

        vm.expectEmit(true, true, false, true);
        emit IMandateRegistry.MandateUsed(id, agent, "big", vendor, 800 * USDC, MandateCategories.VENDOR_INVOICE, 0, owner);
        vm.prank(agent);
        registry.consume(id, _payTo(vendor, 800 * USDC, "big"), a);
        (uint128 day,,) = registry.getSpend(id);
        assertEq(day, 800 * USDC);
    }

    function test_Approval_AnAuthorisedApproverMaySign_AStrangerMayNot() public {
        bytes32 id = _mandate();

        IMandateRegistry.Approval memory notYet = _approval(id, "p1", vendor, 800 * USDC, approverPk, approver);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotApprover.selector, approver));
        registry.consume(id, _payTo(vendor, 800 * USDC, "p1"), notYet);

        vm.prank(owner);
        registry.setApprover(businessId, approver, true);
        vm.prank(agent);
        registry.consume(id, _payTo(vendor, 800 * USDC, "p1"), notYet);

        vm.prank(owner);
        registry.setApprover(businessId, approver, false); // removed approvers stop working
        IMandateRegistry.Approval memory after_ = _approval(id, "p2", vendor, 800 * USDC, approverPk, approver);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotApprover.selector, approver));
        registry.consume(id, _payTo(vendor, 800 * USDC, "p2"), after_);
    }

    function test_Approval_TheAgentCannotApproveItsOwnPayment() public {
        (address agentSigner, uint256 agentPk) = makeAddrAndKey("agentSigner");
        // Make a mandate whose agent is a key we hold, then try to self-approve with it.
        IMandateRegistry.MandateParams memory p = _params(2);
        p.agent = agentSigner;
        bytes32 id2 = _create(p);
        vm.prank(owner);
        registry.setApprover(businessId, agentSigner, true); // even if (mis)configured as an approver

        IMandateRegistry.Approval memory a = _approval(id2, "self", vendor, 800 * USDC, agentPk, agentSigner);
        vm.prank(agentSigner);
        vm.expectRevert(MandateRegistry.AgentCannotApprove.selector);
        registry.consume(id2, _payTo(vendor, 800 * USDC, "self"), a);
    }

    function test_Approval_SignatureIsBoundToPaymentRecipientAndAmount() public {
        bytes32 id = _mandate();
        vm.prank(owner);
        registry.setRecipient(id, vendor2, true);
        IMandateRegistry.Approval memory a = _approval(id, "p", vendor, 800 * USDC, ownerPk, owner);

        vm.startPrank(agent);
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.consume(id, _payTo(vendor, 900 * USDC, "p"), a); // different amount
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.consume(id, _payTo(vendor2, 800 * USDC, "p"), a); // different recipient
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.consume(id, _payTo(vendor, 800 * USDC, "other"), a); // different payment id
        registry.consume(id, _payTo(vendor, 800 * USDC, "p"), a); // the exact one works
        vm.stopPrank();
    }

    function test_Approval_SignatureIsBoundToTheMandate() public {
        bytes32 a1 = _create(_params(1));
        bytes32 a2 = _create(_params(2));
        IMandateRegistry.Approval memory ap = _approval(a1, "p", vendor, 800 * USDC, ownerPk, owner);
        vm.prank(agent);
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.consume(a2, _payTo(vendor, 800 * USDC, "p"), ap);
    }

    function test_Approval_ExpiredDeadlineAndGarbageSignatureAreRefused() public {
        bytes32 id = _mandate();
        IMandateRegistry.Approval memory a = _approval(id, "p", vendor, 800 * USDC, ownerPk, owner);
        vm.warp(a.deadline + 1);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.ApprovalExpired.selector, a.deadline));
        registry.consume(id, _payTo(vendor, 800 * USDC, "p"), a);

        IMandateRegistry.Approval memory junk = IMandateRegistry.Approval({approver: owner, deadline: uint64(block.timestamp + 1 hours), signature: hex"deadbeef"});
        vm.prank(agent);
        vm.expectRevert(MandateRegistry.InvalidSignature.selector);
        registry.consume(id, _payTo(vendor, 800 * USDC, "q"), junk);
    }

    function test_Approval_AnApprovalCannotBeReusedForTheSamePaymentId() public {
        bytes32 id = _mandate();
        IMandateRegistry.Approval memory a = _approval(id, "p", vendor, 800 * USDC, ownerPk, owner);
        vm.startPrank(agent);
        registry.consume(id, _payTo(vendor, 800 * USDC, "p"), a);
        _expectCheckFailed(IMandateRegistry.Reason.PaymentAlreadyUsed);
        registry.consume(id, _payTo(vendor, 800 * USDC, "p"), a);
        vm.stopPrank();
    }

    function test_Approval_AnErc1271SmartAccountApproverWorks() public {
        Mock1271Wallet wallet = new Mock1271Wallet();
        vm.prank(owner);
        registry.setApprover(businessId, address(wallet), true);
        bytes32 id = _mandate();
        uint64 deadline = uint64(block.timestamp + 1 hours);
        wallet.accept(_approvalDigest(id, "w", vendor, 800 * USDC, deadline));

        IMandateRegistry.Approval memory a = IMandateRegistry.Approval({approver: address(wallet), deadline: deadline, signature: hex"01"});
        vm.prank(agent);
        registry.consume(id, _payTo(vendor, 800 * USDC, "w"), a);
    }

    function test_Approval_OnlyApplyWhenRequired_ASuppliedSignatureBelowTheThresholdIsIgnored() public {
        bytes32 id = _mandate();
        IMandateRegistry.Approval memory junk = IMandateRegistry.Approval({approver: stranger, deadline: 0, signature: hex"00"});
        vm.prank(agent);
        registry.consume(id, _payTo(vendor, 100 * USDC, "p"), junk);
    }

    // ═══════════════════════════════════════════════════════════════
    // Events for usage
    // ═══════════════════════════════════════════════════════════════

    function test_Events_UsageIsEmittedWithEveryField() public {
        bytes32 id = _noApprovalMandate(1);
        IMandateRegistry.PaymentRequest memory req = IMandateRegistry.PaymentRequest({
            recipient: vendor, amount: 123 * USDC, category: MandateCategories.PAYROLL, riskTier: 1, paymentId: "evt"
        });
        vm.expectEmit(true, true, false, true);
        emit IMandateRegistry.MandateUsed(id, agent, "evt", vendor, 123 * USDC, MandateCategories.PAYROLL, 1, address(0));
        vm.prank(agent);
        registry.consume(id, req, _noApproval());
    }

    // ═══════════════════════════════════════════════════════════════
    // No hidden powers
    // ═══════════════════════════════════════════════════════════════

    function test_NoGlobalAdmin_NoOwnerOrPauseSurface() public {
        // None of the usual admin selectors exist on the contract.
        bytes4[5] memory selectors = [
            bytes4(keccak256("owner()")),
            bytes4(keccak256("transferOwnership(address)")),
            bytes4(keccak256("pause()")),
            bytes4(keccak256("upgradeTo(address)")),
            bytes4(keccak256("setAdmin(address)"))
        ];
        for (uint256 i; i < selectors.length; ++i) {
            (bool ok,) = address(registry).call(abi.encodeWithSelector(selectors[i], stranger));
            assertFalse(ok);
        }
    }

    function test_NoFundsAreHeld() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(registry).call{value: 1 wei}("");
        assertFalse(ok, "the registry accepts no native value");
        assertEq(address(registry).balance, 0);
    }
}
