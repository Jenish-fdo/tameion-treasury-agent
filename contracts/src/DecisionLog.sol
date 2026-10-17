// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDecisionLog} from "./interfaces/IDecisionLog.sol";
import {IMandateRegistry} from "./interfaces/IMandateRegistry.sol";

/**
 * @title DecisionLog
 * @notice Append-only, hash-chained record of treasury decisions. ARC TESTNET ONLY. UNAUDITED.
 *
 * @dev Immutability: there is no function that updates or deletes a record, no owner, no proxy, no delegatecall
 *      and no selfdestruct. Each record stores the hash of the business's previous record, so any off-chain copy
 *      that was altered, dropped or reordered fails {verifyRecord} / {computeRecordHash}.
 *
 *      Who may write: the mandate's agent (for records that reference its own mandate), and the business owner and
 *      the recorders (relayers) the owner authorised in the {IMandateRegistry}. Nobody else.
 *
 *      Ordering uses `seq`, not `timestamp`: Arc block timestamps are non-decreasing, not strictly increasing.
 *
 *      The log records what authorised writers CLAIM happened. It cannot verify risk scores, rule results or
 *      transaction hashes; it makes them public, ordered and tamper-evident.
 */
contract DecisionLog is IDecisionLog {
    IMandateRegistry public immutable registry;

    uint256 public constant MAX_PAGE = 50;
    uint8 internal constant MAX_RISK_TIER = 3;
    uint16 internal constant MAX_RISK_SCORE = 10_000;

    mapping(bytes32 decisionId => Decision) internal _decisions;
    mapping(bytes32 businessId => bytes32[]) internal _byBusiness;
    mapping(bytes32 agentId => bytes32[]) internal _byAgent;
    mapping(bytes32 mandateId => bytes32[]) internal _byMandate;
    mapping(bytes32 businessId => bytes32) internal _head;
    mapping(bytes32 parentId => bytes32) internal _firstChild;
    mapping(bytes32 businessId => mapping(bytes32 clientRef => bytes32 decisionId)) internal _byClientRef;

    error ZeroAddress();
    error UnknownBusiness(bytes32 businessId);
    error UnknownMandate(bytes32 mandateId);
    error MandateBusinessMismatch(bytes32 mandateId, bytes32 businessId);
    error AgentMismatch(bytes32 mandateId, bytes32 agentId);
    error NotAuthorized(address caller);
    error InvalidRiskTier(uint8 tier);
    error InvalidRiskScore(uint16 score);
    error InvalidActionOutcome(ActionType action, Outcome outcome);
    error ExecutedNeedsTxHash();
    error TxHashOnlyWhenExecuted();
    error EscalationNeedsApprovalRef();
    error UnknownParent(bytes32 parentDecisionId);
    error ParentBusinessMismatch(bytes32 parentDecisionId);
    error DuplicateClientRef(bytes32 businessId, bytes32 clientRef, bytes32 existingDecisionId);
    error UnknownDecision(bytes32 decisionId);
    error PageTooLarge(uint256 limit);

    constructor(IMandateRegistry registry_) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
    }

    // ──────────────────────────────────────────────────────────────
    // Write (append only)
    // ──────────────────────────────────────────────────────────────

    /// @inheritdoc IDecisionLog
    function recordDecision(DecisionInput calldata d) external returns (bytes32 decisionId) {
        _authorize(d);
        _validate(d);

        uint64 seq = uint64(_byBusiness[d.businessId].length);
        decisionId = keccak256(abi.encode(address(this), d.businessId, seq));
        bytes32 prev = _head[d.businessId];

        Decision memory rec = _build(d, decisionId, seq, prev);
        rec.recordHash = _hash(rec);
        _decisions[decisionId] = rec;

        _byBusiness[d.businessId].push(decisionId);
        _byAgent[d.agentId].push(decisionId);
        if (d.mandateId != bytes32(0)) _byMandate[d.mandateId].push(decisionId);
        _head[d.businessId] = rec.recordHash;
        if (d.clientRef != bytes32(0)) _byClientRef[d.businessId][d.clientRef] = decisionId;
        if (d.parentDecisionId != bytes32(0) && _firstChild[d.parentDecisionId] == bytes32(0)) {
            _firstChild[d.parentDecisionId] = decisionId;
        }

        emit DecisionRecorded(
            decisionId,
            d.businessId,
            d.agentId,
            d.mandateId,
            d.action,
            d.outcome,
            d.counterparty,
            d.amount,
            d.riskTier,
            d.riskScore,
            rec.recordHash,
            prev,
            seq
        );
    }

    // ──────────────────────────────────────────────────────────────
    // Read
    // ──────────────────────────────────────────────────────────────

    /// @inheritdoc IDecisionLog
    function getDecision(bytes32 decisionId) external view returns (Decision memory) {
        if (_decisions[decisionId].timestamp == 0) revert UnknownDecision(decisionId);
        return _decisions[decisionId];
    }

    /// @inheritdoc IDecisionLog
    /// @dev Recomputes the hash of the stored record. False for an unknown id.
    function verifyRecord(bytes32 decisionId) external view returns (bool) {
        Decision memory rec = _decisions[decisionId];
        if (rec.timestamp == 0) return false;
        return _hash(rec) == rec.recordHash;
    }

    /// @inheritdoc IDecisionLog
    /// @dev Lets anyone check an off-chain copy of a record against the on-chain rule.
    function computeRecordHash(Decision memory d) external pure returns (bytes32) {
        return _hash(d);
    }

    /// @inheritdoc IDecisionLog
    function chainHead(bytes32 businessId) external view returns (bytes32 headHash, uint64 count) {
        return (_head[businessId], uint64(_byBusiness[businessId].length));
    }

    /// @inheritdoc IDecisionLog
    /// @dev Zero until some record names `decisionId` as its parent. Used to find escalations nobody has resolved.
    function firstFollowUp(bytes32 decisionId) external view returns (bytes32) {
        return _firstChild[decisionId];
    }

    function decisionIdByClientRef(bytes32 businessId, bytes32 clientRef) external view returns (bytes32) {
        return _byClientRef[businessId][clientRef];
    }

    function countByBusiness(bytes32 businessId) external view returns (uint256) {
        return _byBusiness[businessId].length;
    }

    function countByAgent(bytes32 agentId) external view returns (uint256) {
        return _byAgent[agentId].length;
    }

    function countByMandate(bytes32 mandateId) external view returns (uint256) {
        return _byMandate[mandateId].length;
    }

    function getDecisionsByBusiness(bytes32 businessId, uint256 offset, uint256 limit) external view returns (Decision[] memory) {
        return _load(_byBusiness[businessId], offset, limit);
    }

    function getDecisionsByAgent(bytes32 agentId, uint256 offset, uint256 limit) external view returns (Decision[] memory) {
        return _load(_byAgent[agentId], offset, limit);
    }

    function getDecisionsByMandate(bytes32 mandateId, uint256 offset, uint256 limit) external view returns (Decision[] memory) {
        return _load(_byMandate[mandateId], offset, limit);
    }

    // ──────────────────────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────────────────────

    function _authorize(DecisionInput calldata d) internal view {
        (address owner,,,) = registry.getBusiness(d.businessId);
        if (owner == address(0)) revert UnknownBusiness(d.businessId);

        bool allowed = registry.isRecorder(d.businessId, msg.sender);
        if (d.mandateId != bytes32(0)) {
            IMandateRegistry.Mandate memory m = registry.getMandate(d.mandateId);
            if (m.status == IMandateRegistry.MandateStatus.None) revert UnknownMandate(d.mandateId);
            // A mandate of another business can never be referenced, whoever the caller is.
            if (m.businessId != d.businessId) revert MandateBusinessMismatch(d.mandateId, d.businessId);
            if (m.agentId != d.agentId) revert AgentMismatch(d.mandateId, d.agentId);
            if (msg.sender == m.agent) allowed = true;
        }
        if (!allowed) revert NotAuthorized(msg.sender);
    }

    function _validate(DecisionInput calldata d) internal view {
        if (d.riskTier > MAX_RISK_TIER) revert InvalidRiskTier(d.riskTier);
        if (d.riskScore > MAX_RISK_SCORE) revert InvalidRiskScore(d.riskScore);

        // Action <-> outcome coupling
        bool ok;
        if (d.action == ActionType.Delay) ok = d.outcome == Outcome.Delayed;
        else if (d.action == ActionType.Escalation) ok = d.outcome == Outcome.Escalated;
        else if (d.action == ActionType.Rejection) ok = d.outcome == Outcome.Rejected;
        else ok = d.outcome == Outcome.Proposed || d.outcome == Outcome.Executed;
        if (!ok) revert InvalidActionOutcome(d.action, d.outcome);

        if (d.outcome == Outcome.Executed) {
            if (d.txHash == bytes32(0)) revert ExecutedNeedsTxHash();
        } else if (d.txHash != bytes32(0)) {
            revert TxHashOnlyWhenExecuted();
        }
        if (d.outcome == Outcome.Escalated && d.approvalRef == bytes32(0)) revert EscalationNeedsApprovalRef();

        if (d.parentDecisionId != bytes32(0)) {
            Decision storage parent = _decisions[d.parentDecisionId];
            if (parent.timestamp == 0) revert UnknownParent(d.parentDecisionId);
            if (parent.businessId != d.businessId) revert ParentBusinessMismatch(d.parentDecisionId);
        }
        if (d.clientRef != bytes32(0)) {
            bytes32 existing = _byClientRef[d.businessId][d.clientRef];
            if (existing != bytes32(0)) revert DuplicateClientRef(d.businessId, d.clientRef, existing);
        }
    }

    function _build(DecisionInput calldata d, bytes32 decisionId, uint64 seq, bytes32 prev)
        internal
        view
        returns (Decision memory rec)
    {
        rec.decisionId = decisionId;
        rec.seq = seq;
        rec.timestamp = uint64(block.timestamp);
        rec.recorder = msg.sender;
        rec.businessId = d.businessId;
        rec.agentId = d.agentId;
        rec.mandateId = d.mandateId;
        rec.action = d.action;
        rec.counterparty = d.counterparty;
        rec.amount = d.amount;
        rec.rulesEvaluated = d.rulesEvaluated;
        rec.rulesFailed = d.rulesFailed;
        rec.riskTier = d.riskTier;
        rec.riskScore = d.riskScore;
        rec.outcome = d.outcome;
        rec.rationaleHash = d.rationaleHash;
        rec.txHash = d.txHash;
        rec.approvalRef = d.approvalRef;
        rec.parentDecisionId = d.parentDecisionId;
        rec.clientRef = d.clientRef;
        rec.prevHash = prev;
    }

    /// @dev Hash over every field with `recordHash` treated as zero.
    function _hash(Decision memory d) internal pure returns (bytes32) {
        bytes32 stored = d.recordHash;
        d.recordHash = bytes32(0);
        bytes32 h = keccak256(abi.encode(d));
        d.recordHash = stored;
        return h;
    }

    function _load(bytes32[] storage ids, uint256 offset, uint256 limit) internal view returns (Decision[] memory out) {
        if (limit > MAX_PAGE) revert PageTooLarge(limit);
        uint256 n = ids.length;
        if (offset >= n) return new Decision[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        out = new Decision[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = _decisions[ids[i]];
        }
    }
}
