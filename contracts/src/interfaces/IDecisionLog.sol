// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDecisionLog
 * @notice Append-only, hash-chained record of every proposed or executed treasury action.
 *
 * @dev ARC TESTNET ONLY. Unaudited. The log proves WHO WROTE WHAT AND WHEN. It does not prove that a transfer
 *      happened: `txHash` is a claim that anyone can check against Arc. Amounts are USDC in 6-decimal base units.
 */
interface IDecisionLog {
    /// @dev Delay, Escalation and Rejection describe how the agent handled a request; the other three describe
    ///      the money movement itself. The coupling with {Outcome} is enforced on write.
    enum ActionType { Payment, Delay, YieldAllocation, Redemption, Escalation, Rejection }

    enum Outcome { Proposed, Executed, Rejected, Escalated, Delayed }

    struct DecisionInput {
        bytes32 businessId;
        bytes32 agentId;
        bytes32 mandateId;          // may be zero (for example a rejection when no mandate applies)
        ActionType action;
        address counterparty;
        uint128 amount;
        uint64 rulesEvaluated;      // bitmap of policy rule ids that were evaluated (ids are defined off-chain)
        uint64 rulesFailed;         // bitmap of the rules that did not pass
        uint8 riskTier;             // 0..3
        uint16 riskScore;           // 0..10000 basis points
        Outcome outcome;
        bytes32 rationaleHash;      // hash only: the rationale itself stays off-chain
        bytes32 txHash;             // required iff outcome == Executed
        bytes32 approvalRef;        // required iff outcome == Escalated; also records the human approval on a follow-up
        bytes32 parentDecisionId;   // links a follow-up record to the record it resolves
        bytes32 clientRef;          // idempotency key, unique per business when non-zero
    }

    struct Decision {
        bytes32 decisionId;
        uint64 seq;                 // per-business running count; the ordering authority (timestamps can repeat)
        uint64 timestamp;
        address recorder;
        bytes32 businessId;
        bytes32 agentId;
        bytes32 mandateId;
        ActionType action;
        address counterparty;
        uint128 amount;
        uint64 rulesEvaluated;
        uint64 rulesFailed;
        uint8 riskTier;
        uint16 riskScore;
        Outcome outcome;
        bytes32 rationaleHash;
        bytes32 txHash;
        bytes32 approvalRef;
        bytes32 parentDecisionId;
        bytes32 clientRef;
        bytes32 prevHash;           // recordHash of the business's previous record (zero for the first)
        bytes32 recordHash;         // keccak256 over every field above with recordHash zeroed
    }

    event DecisionRecorded(
        bytes32 indexed decisionId,
        bytes32 indexed businessId,
        bytes32 indexed agentId,
        bytes32 mandateId,
        ActionType action,
        Outcome outcome,
        address counterparty,
        uint128 amount,
        uint8 riskTier,
        uint16 riskScore,
        bytes32 recordHash,
        bytes32 prevHash,
        uint64 seq
    );

    function recordDecision(DecisionInput calldata d) external returns (bytes32 decisionId);

    function getDecision(bytes32 decisionId) external view returns (Decision memory);
    function verifyRecord(bytes32 decisionId) external view returns (bool);
    function computeRecordHash(Decision memory d) external pure returns (bytes32);
    function chainHead(bytes32 businessId) external view returns (bytes32 headHash, uint64 count);
    function firstFollowUp(bytes32 decisionId) external view returns (bytes32);
    function decisionIdByClientRef(bytes32 businessId, bytes32 clientRef) external view returns (bytes32);

    function countByBusiness(bytes32 businessId) external view returns (uint256);
    function countByAgent(bytes32 agentId) external view returns (uint256);
    function countByMandate(bytes32 mandateId) external view returns (uint256);
    function getDecisionsByBusiness(bytes32 businessId, uint256 offset, uint256 limit) external view returns (Decision[] memory);
    function getDecisionsByAgent(bytes32 agentId, uint256 offset, uint256 limit) external view returns (Decision[] memory);
    function getDecisionsByMandate(bytes32 mandateId, uint256 offset, uint256 limit) external view returns (Decision[] memory);
}
