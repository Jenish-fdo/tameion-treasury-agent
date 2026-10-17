// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IMandateRegistry} from "./interfaces/IMandateRegistry.sol";
import {MandateCategories} from "./libraries/MandateCategories.sol";

/**
 * @title MandateRegistry
 * @notice A business owner grants one AI agent a scoped, expiring, revocable mandate to spend USDC.
 *
 * @dev ARC TESTNET ONLY. UNAUDITED. Not for real funds.
 *
 *      This is a policy ledger. It holds no funds and moves no funds. `consume` authorises and accounts for
 *      a payment; it cannot stop an agent key from sending USDC without calling it. See PHASE3_PLAN.md.
 *
 *      There is no global owner, admin, pause switch or upgrade path. The only powers are per business, held
 *      by that business's owner (two-step transfer), and are listed in {IMandateRegistry}.
 *
 *      Amounts are USDC in 6-decimal base units. Spend windows are fixed buckets (UTC day, 7-day, 30-day),
 *      so an agent can spend a full cap at the end of one bucket and another at the start of the next:
 *      worst case across a boundary is 2x the cap. The per-transaction limit is unaffected.
 *
 *      Review fixes applied from docs/security-review.md: per-signer unordered nonces bound into the signed
 *      data with cancellation (M-1), one expiry rule for every creation path (M-2), two-step ownership (M-7).
 */
contract MandateRegistry is IMandateRegistry, EIP712 {
    // ──────────────────────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────────────────────

    bytes32 private constant MANDATE_TYPEHASH = keccak256(
        "Mandate(bytes32 businessId,address agent,bytes32 agentId,uint32 allowedCategories,uint128 perTxLimit,uint128 dailyCap,uint128 weeklyCap,uint128 monthlyCap,uint128 approvalThreshold,uint8 maxRiskTier,bool singleUse,uint64 expiresAt,uint256 nonce,address[] recipients,uint64 deadline)"
    );
    bytes32 private constant REVOKE_TYPEHASH =
        keccak256("RevokeMandate(bytes32 mandateId,bytes32 reason,uint256 nonce,uint64 deadline)");
    bytes32 private constant APPROVAL_TYPEHASH =
        keccak256("PaymentApproval(bytes32 mandateId,bytes32 paymentId,address recipient,uint128 amount,uint64 deadline)");

    /// @notice Longest a mandate may live from the moment it is created.
    uint64 public constant MAX_MANDATE_DURATION = 365 days;
    /// @notice Most recipients accepted when a mandate is created (more can be added one at a time).
    uint256 public constant MAX_INITIAL_RECIPIENTS = 100;
    /// @notice Highest risk tier a mandate may allow. Tier 3 (Critical) is never allowed.
    uint8 public constant MAX_ALLOWED_RISK_TIER = 2;
    uint256 public constant MAX_PAGE = 100;

    uint256 internal constant DAY = 1 days;
    uint256 internal constant WEEK = 7 days;
    uint256 internal constant MONTH = 30 days; // a 30-day bucket, not a calendar month

    // ──────────────────────────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────────────────────────

    struct Business {
        address owner;
        address pendingOwner;
        bytes32 metadataHash;
        uint64 createdAt;
    }

    struct Spend {
        uint32 dayId;
        uint32 weekId;
        uint32 monthId;
        uint128 daySpent;
        uint128 weekSpent;
        uint128 monthSpent;
    }

    mapping(bytes32 businessId => Business) internal _businesses;
    mapping(bytes32 businessId => mapping(address who => bool)) internal _recorders;
    mapping(bytes32 businessId => mapping(address who => bool)) internal _approvers;

    mapping(bytes32 mandateId => Mandate) internal _mandates;
    mapping(bytes32 mandateId => mapping(address recipient => bool)) internal _allowedRecipients;
    mapping(bytes32 mandateId => Spend) internal _spend;

    /// @notice Per-signer, unordered nonces. A nonce is single-use and can be cancelled by its signer.
    mapping(address signer => mapping(uint256 nonce => bool used)) public nonceUsed;
    /// @dev keccak256(mandateId, paymentId) => consumed
    mapping(bytes32 paymentKey => bool) internal _paymentUsed;

    mapping(bytes32 businessId => bytes32[]) internal _mandatesByBusiness;
    mapping(address agent => bytes32[]) internal _mandatesByAgent;

    // ──────────────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────────────

    error ZeroAddress();
    error BusinessExists(bytes32 businessId);
    error UnknownBusiness(bytes32 businessId);
    error NotBusinessOwner(bytes32 businessId, address caller);
    error NotPendingOwner(bytes32 businessId, address caller);
    error UnknownMandate(bytes32 mandateId);
    error NotActive(bytes32 mandateId, MandateStatus status);
    error NotExpirable(bytes32 mandateId);
    error AgentIsOwner();
    error NoCategories();
    error InvalidLimits();
    error InvalidRiskTier(uint8 tier);
    error InvalidExpiry(uint64 expiresAt);
    error TooManyRecipients(uint256 count);
    error InvalidRecipient(address recipient);
    error SignatureExpired(uint64 deadline);
    error InvalidSignature();
    error NonceUsed(address signer, uint256 nonce);
    error CheckFailed(Reason reason);
    error NotMandateAgent(bytes32 mandateId, address caller);
    error ApprovalRequired();
    error ApprovalExpired(uint64 deadline);
    error AgentCannotApprove();
    error NotApprover(address approver);
    error PageTooLarge(uint256 limit);

    // ──────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────

    constructor() EIP712("Credentia Mandates", "1") {}

    // ──────────────────────────────────────────────────────────────
    // Businesses
    // ──────────────────────────────────────────────────────────────

    /// @inheritdoc IMandateRegistry
    /// @dev The id is derived from the registrant and a salt, so nobody can register an id on someone else's behalf.
    function registerBusiness(bytes32 salt, bytes32 metadataHash) external returns (bytes32 businessId) {
        businessId = keccak256(abi.encode(address(this), msg.sender, salt));
        if (_businesses[businessId].owner != address(0)) revert BusinessExists(businessId);
        _businesses[businessId] =
            Business({owner: msg.sender, pendingOwner: address(0), metadataHash: metadataHash, createdAt: uint64(block.timestamp)});
        emit BusinessRegistered(businessId, msg.sender, metadataHash);
    }

    /// @inheritdoc IMandateRegistry
    function proposeBusinessOwner(bytes32 businessId, address newOwner) external {
        _requireOwner(businessId);
        if (newOwner == address(0)) revert ZeroAddress();
        _businesses[businessId].pendingOwner = newOwner;
        emit BusinessOwnerProposed(businessId, msg.sender, newOwner);
    }

    /// @inheritdoc IMandateRegistry
    function acceptBusinessOwner(bytes32 businessId) external {
        Business storage b = _businesses[businessId];
        if (b.owner == address(0)) revert UnknownBusiness(businessId);
        if (b.pendingOwner != msg.sender) revert NotPendingOwner(businessId, msg.sender);
        address previous = b.owner;
        b.owner = msg.sender;
        b.pendingOwner = address(0);
        emit BusinessOwnerTransferred(businessId, previous, msg.sender);
    }

    /// @inheritdoc IMandateRegistry
    function setRecorder(bytes32 businessId, address who, bool allowed) external {
        _requireOwner(businessId);
        if (who == address(0)) revert ZeroAddress();
        _recorders[businessId][who] = allowed;
        emit RecorderSet(businessId, who, allowed);
    }

    /// @inheritdoc IMandateRegistry
    function setApprover(bytes32 businessId, address who, bool allowed) external {
        _requireOwner(businessId);
        if (who == address(0)) revert ZeroAddress();
        _approvers[businessId][who] = allowed;
        emit ApproverSet(businessId, who, allowed);
    }

    // ──────────────────────────────────────────────────────────────
    // Mandates: create, revoke, expire, edit allowlist
    // ──────────────────────────────────────────────────────────────

    /// @inheritdoc IMandateRegistry
    function createMandate(MandateParams calldata p) external returns (bytes32 mandateId) {
        address owner = _requireOwner(p.businessId);
        mandateId = _create(p, owner);
    }

    /// @inheritdoc IMandateRegistry
    /// @dev Anyone may relay. The signature must be the business owner's (EOA or ERC-1271) over the full parameters,
    ///      including the nonce and deadline. The nonce is checked after the signature is verified.
    function createMandateWithSig(MandateParams calldata p, uint64 deadline, bytes calldata signature)
        external
        returns (bytes32 mandateId)
    {
        if (deadline < block.timestamp) revert SignatureExpired(deadline);
        address owner = _businesses[p.businessId].owner;
        if (owner == address(0)) revert UnknownBusiness(p.businessId);

        bytes32 digest = _hashTypedDataV4(_mandateStructHash(p, deadline));
        if (!SignatureChecker.isValidSignatureNow(owner, digest, signature)) revert InvalidSignature();

        mandateId = _create(p, owner);
    }

    /// @inheritdoc IMandateRegistry
    function revokeMandate(bytes32 mandateId, bytes32 reason) external {
        Mandate storage m = _mandates[mandateId];
        if (m.status == MandateStatus.None) revert UnknownMandate(mandateId);
        _requireOwnerOf(m, msg.sender);
        _revoke(mandateId, m, msg.sender, reason);
    }

    /// @inheritdoc IMandateRegistry
    function revokeMandateWithSig(
        bytes32 mandateId,
        bytes32 reason,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external {
        if (deadline < block.timestamp) revert SignatureExpired(deadline);
        Mandate storage m = _mandates[mandateId];
        if (m.status == MandateStatus.None) revert UnknownMandate(mandateId);
        address owner = _businesses[m.businessId].owner;

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(REVOKE_TYPEHASH, mandateId, reason, nonce, deadline)));
        if (!SignatureChecker.isValidSignatureNow(owner, digest, signature)) revert InvalidSignature();
        _useNonce(owner, nonce);

        _revoke(mandateId, m, owner, reason);
    }

    /// @inheritdoc IMandateRegistry
    function setRecipient(bytes32 mandateId, address recipient, bool allowed) external {
        Mandate storage m = _mandates[mandateId];
        if (m.status == MandateStatus.None) revert UnknownMandate(mandateId);
        _requireOwnerOf(m, msg.sender);
        if (m.status != MandateStatus.Active) revert NotActive(mandateId, m.status);
        if (recipient == address(0) || recipient == m.agent) revert InvalidRecipient(recipient);
        _allowedRecipients[mandateId][recipient] = allowed;
        emit RecipientSet(mandateId, recipient, allowed);
    }

    /// @inheritdoc IMandateRegistry
    /// @dev Voids a signed-but-unsubmitted request of the caller's. Idempotent.
    function cancelNonce(uint256 nonce) external {
        nonceUsed[msg.sender][nonce] = true;
        emit NonceCancelled(msg.sender, nonce);
    }

    /// @inheritdoc IMandateRegistry
    /// @dev Permissionless. Expiry takes effect by itself (every check reads the clock); this only records it
    ///      on-chain so the event exists.
    function markExpired(bytes32 mandateId) external {
        Mandate storage m = _mandates[mandateId];
        if (m.status != MandateStatus.Active || block.timestamp < m.expiresAt) revert NotExpirable(mandateId);
        m.status = MandateStatus.Expired;
        emit MandateExpired(mandateId);
    }

    // ──────────────────────────────────────────────────────────────
    // Use
    // ──────────────────────────────────────────────────────────────

    /// @inheritdoc IMandateRegistry
    function validate(bytes32 mandateId, address agent, PaymentRequest calldata req)
        external
        view
        returns (CheckResult memory)
    {
        return _check(mandateId, _mandates[mandateId], agent, req);
    }

    /// @inheritdoc IMandateRegistry
    /// @dev Only `mandate.agent` may call. Checks everything {validate} checks, verifies the human approval when
    ///      the amount reaches the threshold, then records the spend. Transfers nothing.
    function consume(bytes32 mandateId, PaymentRequest calldata req, Approval calldata approval) external {
        Mandate storage m = _mandates[mandateId];
        if (m.status != MandateStatus.None && msg.sender != m.agent) revert NotMandateAgent(mandateId, msg.sender);

        CheckResult memory r = _check(mandateId, m, msg.sender, req);
        if (!r.allowed) revert CheckFailed(r.reason);

        address approvedBy;
        if (r.needsApproval) {
            _verifyApproval(mandateId, m, req, approval);
            approvedBy = approval.approver;
        }

        // effects
        _paymentUsed[keccak256(abi.encode(mandateId, req.paymentId))] = true;
        Spend memory s = _rolled(_spend[mandateId], block.timestamp);
        s.daySpent += req.amount;
        s.weekSpent += req.amount;
        s.monthSpent += req.amount;
        _spend[mandateId] = s;

        emit MandateUsed(mandateId, msg.sender, req.paymentId, req.recipient, req.amount, req.category, req.riskTier, approvedBy);

        if (m.singleUse) {
            m.status = MandateStatus.Consumed;
            emit MandateConsumed(mandateId);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────────────────────

    function getMandate(bytes32 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    function getBusiness(bytes32 businessId)
        external
        view
        returns (address owner, address pendingOwner, bytes32 metadataHash, uint64 createdAt)
    {
        Business storage b = _businesses[businessId];
        return (b.owner, b.pendingOwner, b.metadataHash, b.createdAt);
    }

    function isRecipientAllowed(bytes32 mandateId, address recipient) external view returns (bool) {
        return _allowedRecipients[mandateId][recipient];
    }

    /// @notice True for the business owner and for addresses the owner authorised as recorders (relayers).
    function isRecorder(bytes32 businessId, address who) public view returns (bool) {
        address owner = _businesses[businessId].owner;
        return owner != address(0) && (who == owner || _recorders[businessId][who]);
    }

    /// @notice True for the business owner and for addresses the owner authorised as approvers.
    function isApprover(bytes32 businessId, address who) public view returns (bool) {
        address owner = _businesses[businessId].owner;
        return owner != address(0) && (who == owner || _approvers[businessId][who]);
    }

    /// @notice Spend inside the current day / week / month bucket.
    function getSpend(bytes32 mandateId) external view returns (uint128 day, uint128 week, uint128 month) {
        Spend memory s = _rolled(_spend[mandateId], block.timestamp);
        return (s.daySpent, s.weekSpent, s.monthSpent);
    }

    function mandateCountByBusiness(bytes32 businessId) external view returns (uint256) {
        return _mandatesByBusiness[businessId].length;
    }

    function mandateIdsByBusiness(bytes32 businessId, uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        return _page(_mandatesByBusiness[businessId], offset, limit);
    }

    function mandateIdsByAgent(address agent, uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        return _page(_mandatesByAgent[agent], offset, limit);
    }

    // ──────────────────────────────────────────────────────────────
    // Internal: creation
    // ──────────────────────────────────────────────────────────────

    function _create(MandateParams calldata p, address owner) internal returns (bytes32 mandateId) {
        // Shape of the mandate
        if (p.agent == address(0)) revert ZeroAddress();
        if (p.agent == owner) revert AgentIsOwner();
        if (p.allowedCategories == 0) revert NoCategories();
        if (
            p.perTxLimit == 0 || p.perTxLimit > p.dailyCap || p.dailyCap > p.weeklyCap || p.weeklyCap > p.monthlyCap
        ) revert InvalidLimits();
        if (p.maxRiskTier > MAX_ALLOWED_RISK_TIER) revert InvalidRiskTier(p.maxRiskTier);
        _validateExpiry(p.expiresAt); // the one expiry rule for every creation path (review M-2)
        if (p.recipients.length > MAX_INITIAL_RECIPIENTS) revert TooManyRecipients(p.recipients.length);

        // Replay protection: the signer's nonce is single-use whichever path created the mandate (review M-1)
        _useNonce(owner, p.nonce);

        mandateId = keccak256(abi.encode(p.businessId, owner, p.nonce));
        _mandates[mandateId] = Mandate({
            agent: p.agent,
            expiresAt: p.expiresAt,
            maxRiskTier: p.maxRiskTier,
            status: MandateStatus.Active,
            singleUse: p.singleUse,
            businessId: p.businessId,
            agentId: p.agentId,
            perTxLimit: p.perTxLimit,
            approvalThreshold: p.approvalThreshold,
            dailyCap: p.dailyCap,
            weeklyCap: p.weeklyCap,
            monthlyCap: p.monthlyCap,
            allowedCategories: p.allowedCategories,
            createdAt: uint64(block.timestamp),
            nonce: p.nonce
        });
        _mandatesByBusiness[p.businessId].push(mandateId);
        _mandatesByAgent[p.agent].push(mandateId);

        for (uint256 i; i < p.recipients.length; ++i) {
            address r = p.recipients[i];
            if (r == address(0) || r == p.agent) revert InvalidRecipient(r);
            _allowedRecipients[mandateId][r] = true;
            emit RecipientSet(mandateId, r, true);
        }

        emit MandateCreated(mandateId, p.businessId, p.agent, p.agentId, owner, p.expiresAt, p.singleUse, p.nonce);
        emit MandateLimitsSet(
            mandateId,
            p.perTxLimit,
            p.dailyCap,
            p.weeklyCap,
            p.monthlyCap,
            p.approvalThreshold,
            p.maxRiskTier,
            p.allowedCategories,
            p.recipients.length
        );
    }

    /// @dev Must be in the future and no further out than MAX_MANDATE_DURATION.
    function _validateExpiry(uint64 expiresAt) internal view {
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_MANDATE_DURATION) revert InvalidExpiry(expiresAt);
    }

    function _useNonce(address signer, uint256 nonce) internal {
        if (nonceUsed[signer][nonce]) revert NonceUsed(signer, nonce);
        nonceUsed[signer][nonce] = true;
    }

    /// @dev EIP-712 struct hash. Static fields are encoded in two chunks to stay under the stack limit.
    function _mandateStructHash(MandateParams calldata p, uint64 deadline) internal pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                abi.encode(
                    MANDATE_TYPEHASH,
                    p.businessId,
                    p.agent,
                    p.agentId,
                    p.allowedCategories,
                    p.perTxLimit,
                    p.dailyCap,
                    p.weeklyCap
                ),
                abi.encode(
                    p.monthlyCap,
                    p.approvalThreshold,
                    p.maxRiskTier,
                    p.singleUse,
                    p.expiresAt,
                    p.nonce,
                    keccak256(abi.encodePacked(p.recipients)),
                    deadline
                )
            )
        );
    }

    function _revoke(bytes32 mandateId, Mandate storage m, address by, bytes32 reason) internal {
        if (m.status != MandateStatus.Active) revert NotActive(mandateId, m.status);
        m.status = MandateStatus.Revoked;
        emit MandateRevoked(mandateId, by, reason);
    }

    function _requireOwner(bytes32 businessId) internal view returns (address owner) {
        owner = _businesses[businessId].owner;
        if (owner == address(0)) revert UnknownBusiness(businessId);
        if (msg.sender != owner) revert NotBusinessOwner(businessId, msg.sender);
    }

    function _requireOwnerOf(Mandate storage m, address caller) internal view {
        address owner = _businesses[m.businessId].owner;
        if (caller != owner) revert NotBusinessOwner(m.businessId, caller);
    }

    // ──────────────────────────────────────────────────────────────
    // Internal: checks and spend windows
    // ──────────────────────────────────────────────────────────────

    function _check(bytes32 mandateId, Mandate storage m, address agent, PaymentRequest calldata req)
        internal
        view
        returns (CheckResult memory r)
    {
        MandateStatus st = m.status;
        if (st == MandateStatus.None) return _deny(r, Reason.UnknownMandate);
        if (st == MandateStatus.Revoked) return _deny(r, Reason.Revoked);
        if (st == MandateStatus.Consumed) return _deny(r, Reason.Consumed);
        if (st == MandateStatus.Expired || block.timestamp >= m.expiresAt) return _deny(r, Reason.Expired);
        if (agent != m.agent) return _deny(r, Reason.WrongAgent);
        if (req.amount == 0) return _deny(r, Reason.ZeroAmount);
        if (!MandateCategories.allows(m.allowedCategories, req.category)) return _deny(r, Reason.CategoryNotAllowed);
        if (!_allowedRecipients[mandateId][req.recipient]) return _deny(r, Reason.RecipientNotAllowed);
        if (req.riskTier > m.maxRiskTier) return _deny(r, Reason.RiskTierTooHigh);
        if (req.amount > m.perTxLimit) return _deny(r, Reason.OverPerTxLimit);
        if (_paymentUsed[keccak256(abi.encode(mandateId, req.paymentId))]) return _deny(r, Reason.PaymentAlreadyUsed);

        Spend memory s = _rolled(_spend[mandateId], block.timestamp);
        r.dailyRemaining = m.dailyCap - s.daySpent;
        r.weeklyRemaining = m.weeklyCap - s.weekSpent;
        r.monthlyRemaining = m.monthlyCap - s.monthSpent;
        if (req.amount > r.dailyRemaining) return _deny(r, Reason.OverDailyCap);
        if (req.amount > r.weeklyRemaining) return _deny(r, Reason.OverWeeklyCap);
        if (req.amount > r.monthlyRemaining) return _deny(r, Reason.OverMonthlyCap);

        r.allowed = true;
        r.needsApproval = req.amount >= m.approvalThreshold;
    }

    function _deny(CheckResult memory r, Reason reason) internal pure returns (CheckResult memory) {
        r.allowed = false;
        r.reason = reason;
        return r;
    }

    /// @dev Returns the spend as it stands in the current buckets: counters of a past bucket read as zero.
    function _rolled(Spend memory s, uint256 ts) internal pure returns (Spend memory) {
        uint32 d = uint32(ts / DAY);
        uint32 w = uint32(ts / WEEK);
        uint32 mo = uint32(ts / MONTH);
        if (s.dayId != d) {
            s.dayId = d;
            s.daySpent = 0;
        }
        if (s.weekId != w) {
            s.weekId = w;
            s.weekSpent = 0;
        }
        if (s.monthId != mo) {
            s.monthId = mo;
            s.monthSpent = 0;
        }
        return s;
    }

    function _verifyApproval(bytes32 mandateId, Mandate storage m, PaymentRequest calldata req, Approval calldata a)
        internal
        view
    {
        if (a.signature.length == 0) revert ApprovalRequired();
        if (a.deadline < block.timestamp) revert ApprovalExpired(a.deadline);
        if (a.approver == m.agent) revert AgentCannotApprove();
        if (!isApprover(m.businessId, a.approver)) revert NotApprover(a.approver);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(APPROVAL_TYPEHASH, mandateId, req.paymentId, req.recipient, req.amount, a.deadline))
        );
        if (!SignatureChecker.isValidSignatureNow(a.approver, digest, a.signature)) revert InvalidSignature();
    }

    function _page(bytes32[] storage ids, uint256 offset, uint256 limit) internal view returns (bytes32[] memory out) {
        if (limit > MAX_PAGE) revert PageTooLarge(limit);
        uint256 n = ids.length;
        if (offset >= n) return new bytes32[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        out = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = ids[i];
        }
    }
}
