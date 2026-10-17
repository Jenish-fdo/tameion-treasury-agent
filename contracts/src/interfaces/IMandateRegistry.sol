// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMandateRegistry
 * @notice A business owner grants one AI agent a scoped, expiring, revocable mandate to spend USDC.
 *
 * @dev ARC TESTNET ONLY. Unaudited. This contract is a policy ledger: it neither holds nor moves funds.
 *      `consume` authorises and accounts for a payment; it does not make one. All amounts are USDC in
 *      6-decimal base units (the ERC-20 interface), never the 18-decimal native representation.
 */
interface IMandateRegistry {
    enum MandateStatus { None, Active, Revoked, Consumed, Expired }

    /// @dev Why a check failed. `None` means the payment is allowed.
    enum Reason {
        None,
        UnknownMandate,
        Revoked,
        Consumed,
        Expired,
        WrongAgent,
        ZeroAmount,
        CategoryNotAllowed,
        RecipientNotAllowed,
        RiskTierTooHigh,
        OverPerTxLimit,
        OverDailyCap,
        OverWeeklyCap,
        OverMonthlyCap,
        PaymentAlreadyUsed
    }

    struct MandateParams {
        bytes32 businessId;
        address agent;              // the only address that may call consume()
        bytes32 agentId;            // logical agent id; must match DecisionLog records
        uint32 allowedCategories;   // bitmask, see MandateCategories; must be non-zero
        uint128 perTxLimit;
        uint128 dailyCap;
        uint128 weeklyCap;
        uint128 monthlyCap;
        uint128 approvalThreshold;  // amount >= this needs a human approval signature; 0 = every payment
        uint8 maxRiskTier;          // highest risk tier the agent may act under, 0..2
        bool singleUse;             // the mandate is spent after one successful consume
        uint64 expiresAt;           // unix seconds
        uint256 nonce;              // chosen by the signer; unordered, single-use per signer
        address[] recipients;       // initial allowlist (deny by default)
    }

    struct Mandate {
        address agent;
        uint64 expiresAt;
        uint8 maxRiskTier;
        MandateStatus status;
        bool singleUse;
        bytes32 businessId;
        bytes32 agentId;
        uint128 perTxLimit;
        uint128 approvalThreshold;
        uint128 dailyCap;
        uint128 weeklyCap;
        uint128 monthlyCap;
        uint32 allowedCategories;
        uint64 createdAt;
        uint256 nonce;
    }

    struct PaymentRequest {
        address recipient;
        uint128 amount;
        uint8 category;             // 0..31
        uint8 riskTier;             // as assessed by the agent's risk engine, 0..3
        bytes32 paymentId;          // unique per payment; replay guard
    }

    /// @dev Only read when amount >= approvalThreshold.
    struct Approval {
        address approver;           // business owner or an authorised approver; never the agent
        uint64 deadline;
        bytes signature;            // EIP-712 PaymentApproval, EOA or ERC-1271
    }

    struct CheckResult {
        bool allowed;
        bool needsApproval;
        Reason reason;
        uint128 dailyRemaining;
        uint128 weeklyRemaining;
        uint128 monthlyRemaining;
    }

    // ───────── events
    event BusinessRegistered(bytes32 indexed businessId, address indexed owner, bytes32 metadataHash);
    event BusinessOwnerProposed(bytes32 indexed businessId, address indexed currentOwner, address indexed proposedOwner);
    event BusinessOwnerTransferred(bytes32 indexed businessId, address indexed previousOwner, address indexed newOwner);
    event RecorderSet(bytes32 indexed businessId, address indexed who, bool allowed);
    event ApproverSet(bytes32 indexed businessId, address indexed who, bool allowed);

    event MandateCreated(
        bytes32 indexed mandateId,
        bytes32 indexed businessId,
        address indexed agent,
        bytes32 agentId,
        address owner,
        uint64 expiresAt,
        bool singleUse,
        uint256 nonce
    );
    event MandateLimitsSet(
        bytes32 indexed mandateId,
        uint128 perTxLimit,
        uint128 dailyCap,
        uint128 weeklyCap,
        uint128 monthlyCap,
        uint128 approvalThreshold,
        uint8 maxRiskTier,
        uint32 allowedCategories,
        uint256 recipientCount
    );
    event RecipientSet(bytes32 indexed mandateId, address indexed recipient, bool allowed);
    event MandateRevoked(bytes32 indexed mandateId, address indexed revokedBy, bytes32 reason);
    event MandateExpired(bytes32 indexed mandateId);
    event MandateUsed(
        bytes32 indexed mandateId,
        address indexed agent,
        bytes32 paymentId,
        address recipient,
        uint128 amount,
        uint8 category,
        uint8 riskTier,
        address approvedBy
    );
    event MandateConsumed(bytes32 indexed mandateId);
    event NonceCancelled(address indexed signer, uint256 nonce);

    // ───────── businesses
    function registerBusiness(bytes32 salt, bytes32 metadataHash) external returns (bytes32 businessId);
    function proposeBusinessOwner(bytes32 businessId, address newOwner) external;
    function acceptBusinessOwner(bytes32 businessId) external;
    function setRecorder(bytes32 businessId, address who, bool allowed) external;
    function setApprover(bytes32 businessId, address who, bool allowed) external;

    // ───────── mandates
    function createMandate(MandateParams calldata p) external returns (bytes32 mandateId);
    function createMandateWithSig(MandateParams calldata p, uint64 deadline, bytes calldata signature)
        external
        returns (bytes32 mandateId);
    function revokeMandate(bytes32 mandateId, bytes32 reason) external;
    function revokeMandateWithSig(
        bytes32 mandateId,
        bytes32 reason,
        uint256 nonce,
        uint64 deadline,
        bytes calldata signature
    ) external;
    function setRecipient(bytes32 mandateId, address recipient, bool allowed) external;
    function cancelNonce(uint256 nonce) external;
    function markExpired(bytes32 mandateId) external;

    // ───────── use
    function validate(bytes32 mandateId, address agent, PaymentRequest calldata req)
        external
        view
        returns (CheckResult memory);
    function consume(bytes32 mandateId, PaymentRequest calldata req, Approval calldata approval) external;

    // ───────── views
    function getMandate(bytes32 mandateId) external view returns (Mandate memory);
    function getBusiness(bytes32 businessId)
        external
        view
        returns (address owner, address pendingOwner, bytes32 metadataHash, uint64 createdAt);
    function isRecipientAllowed(bytes32 mandateId, address recipient) external view returns (bool);
    function isRecorder(bytes32 businessId, address who) external view returns (bool);
    function isApprover(bytes32 businessId, address who) external view returns (bool);
    function getSpend(bytes32 mandateId) external view returns (uint128 day, uint128 week, uint128 month);
    function mandateCountByBusiness(bytes32 businessId) external view returns (uint256);
    function mandateIdsByBusiness(bytes32 businessId, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory);
    function mandateIdsByAgent(address agent, uint256 offset, uint256 limit) external view returns (bytes32[] memory);
}
