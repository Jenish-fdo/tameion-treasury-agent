// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {DecisionLog} from "../src/DecisionLog.sol";
import {IDecisionLog} from "../src/interfaces/IDecisionLog.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";
import {MandateCategories} from "../src/libraries/MandateCategories.sol";

/// @notice ARC TESTNET ONLY. Tests for the append-only decision decisions.
contract DecisionLogTest is Test {
    MandateRegistry internal registry;
    DecisionLog internal decisions;

    address internal owner;
    address internal agent;
    address internal relayer;
    address internal stranger;
    address internal vendor;

    bytes32 internal constant AGENT_ID = keccak256("agent-1");
    bytes32 internal businessId;
    bytes32 internal mandateId;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new MandateRegistry();
        decisions = new DecisionLog(registry);
        owner = makeAddr("owner");
        agent = makeAddr("agent");
        relayer = makeAddr("relayer");
        stranger = makeAddr("stranger");
        vendor = makeAddr("vendor");

        vm.startPrank(owner);
        businessId = registry.registerBusiness("acme", "meta");
        registry.setRecorder(businessId, relayer, true);
        mandateId = registry.createMandate(_params(businessId, agent, AGENT_ID, 1));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    function _params(bytes32 biz, address ag, bytes32 agId, uint256 nonce) internal view returns (IMandateRegistry.MandateParams memory p) {
        address[] memory recipients = new address[](1);
        recipients[0] = vendor;
        p = IMandateRegistry.MandateParams({
            businessId: biz, agent: ag, agentId: agId,
            allowedCategories: MandateCategories.bit(MandateCategories.VENDOR_INVOICE),
            perTxLimit: 1_000e6, dailyCap: 2_000e6, weeklyCap: 5_000e6, monthlyCap: 10_000e6,
            approvalThreshold: 500e6, maxRiskTier: 1, singleUse: false,
            expiresAt: uint64(block.timestamp + 30 days), nonce: nonce, recipients: recipients
        });
    }

    function _input() internal view returns (IDecisionLog.DecisionInput memory d) {
        d = IDecisionLog.DecisionInput({
            businessId: businessId, agentId: AGENT_ID, mandateId: mandateId,
            action: IDecisionLog.ActionType.Payment, counterparty: vendor, amount: 250e6,
            rulesEvaluated: 0xFF, rulesFailed: 0, riskTier: 0, riskScore: 1_200,
            outcome: IDecisionLog.Outcome.Proposed, rationaleHash: keccak256("because the invoice matches PO 7"),
            txHash: bytes32(0), approvalRef: bytes32(0), parentDecisionId: bytes32(0), clientRef: bytes32(0)
        });
    }

    function _record(address who, IDecisionLog.DecisionInput memory d) internal returns (bytes32 id) {
        vm.prank(who);
        id = decisions.recordDecision(d);
    }

    function _agentRecord() internal returns (bytes32) {
        return _record(agent, _input());
    }

    /// @dev Every record of a business, oldest first, checked for hash-chain integrity.
    function _assertChainIntact(bytes32 biz) internal view {
        (bytes32 head, uint64 count) = decisions.chainHead(biz);
        IDecisionLog.Decision[] memory all = decisions.getDecisionsByBusiness(biz, 0, 50);
        assertEq(all.length, count);
        bytes32 prev = bytes32(0);
        for (uint256 i; i < all.length; ++i) {
            assertEq(all[i].seq, i, "seq is gap-free");
            assertEq(all[i].prevHash, prev, "prevHash links to the previous record");
            assertEq(all[i].recordHash, decisions.computeRecordHash(all[i]), "stored hash matches the rule");
            assertTrue(decisions.verifyRecord(all[i].decisionId));
            prev = all[i].recordHash;
        }
        assertEq(head, prev, "the head is the last record's hash");
    }

    // ═══════════════════════════════════════════════════════════════
    // Writing: who may
    // ═══════════════════════════════════════════════════════════════

    function test_Record_TheMandatesAgentMayWrite() public {
        bytes32 id = _agentRecord();
        IDecisionLog.Decision memory r = decisions.getDecision(id);
        assertEq(r.decisionId, id);
        assertEq(r.recorder, agent);
        assertEq(r.businessId, businessId);
        assertEq(r.agentId, AGENT_ID);
        assertEq(r.mandateId, mandateId);
        assertEq(r.counterparty, vendor);
        assertEq(r.amount, 250e6);
        assertEq(r.rulesEvaluated, 0xFF);
        assertEq(r.riskScore, 1_200);
        assertEq(r.timestamp, uint64(block.timestamp));
        assertEq(r.seq, 0);
        assertEq(r.prevHash, bytes32(0));
        assertEq(id, keccak256(abi.encode(address(decisions), businessId, uint256(0))));
    }

    function test_Record_ARecorderRelayerAndTheOwnerMayWrite() public {
        _record(relayer, _input());
        _record(owner, _input());
        assertEq(decisions.countByBusiness(businessId), 2);
    }

    function test_Record_ARecorderMayWriteWithoutAMandate() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.mandateId = bytes32(0);
        d.action = IDecisionLog.ActionType.Rejection;
        d.outcome = IDecisionLog.Outcome.Rejected;
        bytes32 id = _record(relayer, d);
        assertEq(decisions.getDecision(id).mandateId, bytes32(0));
        assertEq(decisions.countByMandate(bytes32(0)), 0, "no mandate index entry for a mandate-less record");
    }

    function test_Record_AnAgentCannotWriteWithoutAMandate() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.mandateId = bytes32(0);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.NotAuthorized.selector, agent));
        decisions.recordDecision(d);
    }

    function test_Record_StrangersAreRefused() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.NotAuthorized.selector, stranger));
        decisions.recordDecision(_input());

        IDecisionLog.DecisionInput memory d = _input();
        d.mandateId = bytes32(0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.NotAuthorized.selector, stranger));
        decisions.recordDecision(d);
    }

    function test_Record_AnotherAgentOfTheSameBusinessCannotUseThisMandate() public {
        address agent2 = makeAddr("agent2");
        vm.prank(owner);
        registry.createMandate(_params(businessId, agent2, keccak256("agent-2"), 2));
        vm.prank(agent2);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.NotAuthorized.selector, agent2));
        decisions.recordDecision(_input()); // references agent 1's mandate
    }

    function test_Record_AnotherBusinessesAgentCannotWriteIntoThisBusiness() public {
        address ownerB = makeAddr("ownerB");
        address agentB = makeAddr("agentB");
        vm.startPrank(ownerB);
        bytes32 bizB = registry.registerBusiness("beta", "meta");
        bytes32 mandateB = registry.createMandate(_params(bizB, agentB, keccak256("agent-b"), 1));
        vm.stopPrank();

        // agent B tries to use A's mandate, and to write into A's business with its own mandate
        vm.prank(agentB);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.NotAuthorized.selector, agentB));
        decisions.recordDecision(_input());

        IDecisionLog.DecisionInput memory d = _input();
        d.mandateId = mandateB;
        d.agentId = keccak256("agent-b");
        vm.prank(agentB);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.MandateBusinessMismatch.selector, mandateB, businessId));
        decisions.recordDecision(d);

        // not even A's own recorder can attach a record to B's mandate
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.MandateBusinessMismatch.selector, mandateB, businessId));
        decisions.recordDecision(d);
    }

    function test_Record_TheOtherBusinessesOwnerOrRelayerCannotWriteHere() public {
        address ownerB = makeAddr("ownerB");
        vm.prank(ownerB);
        registry.registerBusiness("beta", "meta");
        vm.prank(ownerB);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.NotAuthorized.selector, ownerB));
        decisions.recordDecision(_input());
    }

    function test_Record_ARemovedRecorderLosesAccess() public {
        _record(relayer, _input());
        vm.prank(owner);
        registry.setRecorder(businessId, relayer, false);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.NotAuthorized.selector, relayer));
        decisions.recordDecision(_input());
    }

    function test_Record_UnknownBusinessAndUnknownMandate() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.businessId = bytes32(uint256(5));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.UnknownBusiness.selector, d.businessId));
        decisions.recordDecision(d);

        d = _input();
        d.mandateId = bytes32(uint256(6));
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.UnknownMandate.selector, d.mandateId));
        decisions.recordDecision(d);
    }

    function test_Record_AgentIdMustMatchTheMandate() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.agentId = keccak256("someone else");
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.AgentMismatch.selector, mandateId, d.agentId));
        decisions.recordDecision(d);
    }

    function test_Record_ARevokedMandateStillLetsItsAgentLogARejection() public {
        vm.prank(owner);
        registry.revokeMandate(mandateId, "x");
        IDecisionLog.DecisionInput memory d = _input();
        d.action = IDecisionLog.ActionType.Rejection;
        d.outcome = IDecisionLog.Outcome.Rejected;
        _record(agent, d); // recording what happened is never blocked by mandate status
        assertEq(decisions.countByMandate(mandateId), 1);
    }

    // ═══════════════════════════════════════════════════════════════
    // Writing: input rules
    // ═══════════════════════════════════════════════════════════════

    function test_Rules_ExecutedNeedsATxHash_AndOnlyExecutedMayHaveOne() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.outcome = IDecisionLog.Outcome.Executed;
        vm.prank(agent);
        vm.expectRevert(DecisionLog.ExecutedNeedsTxHash.selector);
        decisions.recordDecision(d);

        d.txHash = keccak256("tx");
        _record(agent, d); // fine

        d = _input(); // Proposed with a tx hash
        d.txHash = keccak256("tx");
        vm.prank(agent);
        vm.expectRevert(DecisionLog.TxHashOnlyWhenExecuted.selector);
        decisions.recordDecision(d);
    }

    function test_Rules_ActionAndOutcomeMustAgree() public {
        IDecisionLog.ActionType[6] memory actions = [
            IDecisionLog.ActionType.Payment, IDecisionLog.ActionType.Delay, IDecisionLog.ActionType.YieldAllocation,
            IDecisionLog.ActionType.Redemption, IDecisionLog.ActionType.Escalation, IDecisionLog.ActionType.Rejection
        ];
        IDecisionLog.Outcome[5] memory outcomes = [
            IDecisionLog.Outcome.Proposed, IDecisionLog.Outcome.Executed, IDecisionLog.Outcome.Rejected,
            IDecisionLog.Outcome.Escalated, IDecisionLog.Outcome.Delayed
        ];
        for (uint256 a; a < actions.length; ++a) {
            for (uint256 o; o < outcomes.length; ++o) {
                IDecisionLog.DecisionInput memory d = _input();
                d.action = actions[a];
                d.outcome = outcomes[o];
                if (outcomes[o] == IDecisionLog.Outcome.Executed) d.txHash = keccak256("tx");
                if (outcomes[o] == IDecisionLog.Outcome.Escalated) d.approvalRef = keccak256("ref");

                bool money = actions[a] == IDecisionLog.ActionType.Payment || actions[a] == IDecisionLog.ActionType.YieldAllocation
                    || actions[a] == IDecisionLog.ActionType.Redemption;
                bool valid = (actions[a] == IDecisionLog.ActionType.Delay && outcomes[o] == IDecisionLog.Outcome.Delayed)
                    || (actions[a] == IDecisionLog.ActionType.Escalation && outcomes[o] == IDecisionLog.Outcome.Escalated)
                    || (actions[a] == IDecisionLog.ActionType.Rejection && outcomes[o] == IDecisionLog.Outcome.Rejected)
                    || (money && (outcomes[o] == IDecisionLog.Outcome.Proposed || outcomes[o] == IDecisionLog.Outcome.Executed));

                vm.prank(agent);
                if (valid) {
                    decisions.recordDecision(d);
                } else {
                    vm.expectRevert(abi.encodeWithSelector(DecisionLog.InvalidActionOutcome.selector, actions[a], outcomes[o]));
                    decisions.recordDecision(d);
                }
            }
        }
    }

    function test_Rules_EscalationNeedsAnApprovalReference() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.action = IDecisionLog.ActionType.Escalation;
        d.outcome = IDecisionLog.Outcome.Escalated;
        vm.prank(agent);
        vm.expectRevert(DecisionLog.EscalationNeedsApprovalRef.selector);
        decisions.recordDecision(d);
        d.approvalRef = keccak256("approval-request-1");
        bytes32 id = _record(agent, d);
        assertEq(decisions.getDecision(id).approvalRef, keccak256("approval-request-1"));
    }

    function test_Rules_RiskTierAndScoreAreBounded() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.riskTier = 4;
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.InvalidRiskTier.selector, uint8(4)));
        decisions.recordDecision(d);

        d = _input();
        d.riskScore = 10_001;
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.InvalidRiskScore.selector, uint16(10_001)));
        decisions.recordDecision(d);

        d = _input();
        d.riskTier = 3;
        d.riskScore = 10_000; // the extremes are allowed
        _record(agent, d);
    }

    function test_Rules_ParentMustExistAndBelongToTheSameBusiness() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.parentDecisionId = bytes32(uint256(77));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.UnknownParent.selector, d.parentDecisionId));
        decisions.recordDecision(d);

        address ownerB = makeAddr("ownerB");
        vm.startPrank(ownerB);
        bytes32 bizB = registry.registerBusiness("beta", "meta");
        vm.stopPrank();
        IDecisionLog.DecisionInput memory other = _input();
        other.businessId = bizB;
        other.mandateId = bytes32(0);
        bytes32 foreign = _record(ownerB, other);

        d = _input();
        d.parentDecisionId = foreign;
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.ParentBusinessMismatch.selector, foreign));
        decisions.recordDecision(d);
    }

    // ═══════════════════════════════════════════════════════════════
    // Idempotency and follow-ups (pending approvals)
    // ═══════════════════════════════════════════════════════════════

    function test_ClientRef_IsAnIdempotencyKeyPerBusiness() public {
        IDecisionLog.DecisionInput memory d = _input();
        d.clientRef = keccak256("offchain-decision-9");
        bytes32 id = _record(agent, d);
        assertEq(decisions.decisionIdByClientRef(businessId, d.clientRef), id);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.DuplicateClientRef.selector, businessId, d.clientRef, id));
        decisions.recordDecision(d); // a retry does not create a second record
        assertEq(decisions.countByBusiness(businessId), 1);

        // another business may use the same reference
        address ownerB = makeAddr("ownerB");
        vm.prank(ownerB);
        bytes32 bizB = registry.registerBusiness("beta", "meta");
        IDecisionLog.DecisionInput memory other = _input();
        other.businessId = bizB;
        other.mandateId = bytes32(0);
        other.clientRef = d.clientRef;
        _record(ownerB, other);
    }

    function test_FollowUp_AnEscalationIsPendingUntilAChildRecordExists() public {
        IDecisionLog.DecisionInput memory esc = _input();
        esc.action = IDecisionLog.ActionType.Escalation;
        esc.outcome = IDecisionLog.Outcome.Escalated;
        esc.approvalRef = keccak256("req-1");
        bytes32 escId = _record(agent, esc);
        assertEq(decisions.firstFollowUp(escId), bytes32(0), "pending");

        IDecisionLog.DecisionInput memory exec = _input();
        exec.outcome = IDecisionLog.Outcome.Executed;
        exec.txHash = keccak256("tx-1");
        exec.approvalRef = keccak256("req-1"); // the human approval is carried on the follow-up
        exec.parentDecisionId = escId;
        bytes32 execId = _record(agent, exec);
        assertEq(decisions.firstFollowUp(escId), execId, "resolved");

        // a later second child does not replace the first
        IDecisionLog.DecisionInput memory second = _input();
        second.parentDecisionId = escId;
        _record(agent, second);
        assertEq(decisions.firstFollowUp(escId), execId);
        assertEq(decisions.getDecision(execId).parentDecisionId, escId);
    }

    // ═══════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════

    function test_Event_EveryRecordEmitsDecisionRecorded() public {
        IDecisionLog.DecisionInput memory d = _input();
        bytes32 id = keccak256(abi.encode(address(decisions), businessId, uint256(0)));

        vm.recordLogs();
        bytes32 got = _record(agent, d);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(got, id);
        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(decisions));
        assertEq(logs[0].topics[0], IDecisionLog.DecisionRecorded.selector);
        assertEq(logs[0].topics[1], id);
        assertEq(logs[0].topics[2], businessId);
        assertEq(logs[0].topics[3], AGENT_ID);

        IDecisionLog.Decision memory r = decisions.getDecision(id);
        (bytes32 mandate,,,,,,,,,) = abi.decode(logs[0].data, (bytes32, uint8, uint8, address, uint128, uint8, uint16, bytes32, bytes32, uint64));
        assertEq(mandate, mandateId);
        // the event carries the record hash, so a log consumer can verify without reading storage
        (,,,,,,, bytes32 evHash,,) = abi.decode(logs[0].data, (bytes32, uint8, uint8, address, uint128, uint8, uint16, bytes32, bytes32, uint64));
        assertEq(evHash, r.recordHash);
    }

    // ═══════════════════════════════════════════════════════════════
    // Immutability and tamper evidence
    // ═══════════════════════════════════════════════════════════════

    function test_Immutable_EarlierRecordsNeverChangeWhenLaterOnesAreWritten() public {
        bytes32 first = _agentRecord();
        IDecisionLog.Decision memory snapshot = decisions.getDecision(first);
        for (uint256 i; i < 10; ++i) {
            vm.warp(block.timestamp + 1 days);
            IDecisionLog.DecisionInput memory d = _input();
            d.amount = uint128(i + 1) * 1e6;
            _record(i % 2 == 0 ? agent : relayer, d);
        }
        IDecisionLog.Decision memory after_ = decisions.getDecision(first);
        assertEq(keccak256(abi.encode(after_)), keccak256(abi.encode(snapshot)), "record 0 is byte-for-byte unchanged");
        _assertChainIntact(businessId);
    }

    function test_Immutable_NoUpdateOrDeleteSurfaceExists() public {
        bytes32 id = _agentRecord();
        string[10] memory names = [
            "updateDecision(bytes32)", "deleteDecision(bytes32)", "removeDecision(bytes32)", "editDecision(bytes32)",
            "overwriteDecision(bytes32)", "setDecision(bytes32)", "revokeDecision(bytes32)", "amendDecision(bytes32)",
            "owner()", "selfdestruct()"
        ];
        for (uint256 i; i < names.length; ++i) {
            vm.prank(owner);
            (bool ok,) = address(decisions).call(abi.encodeWithSignature(names[i], id));
            assertFalse(ok, names[i]);
            vm.prank(agent);
            (ok,) = address(decisions).call(abi.encodeWithSignature(names[i], id));
            assertFalse(ok, names[i]);
        }
        assertTrue(decisions.verifyRecord(id));
        assertEq(decisions.getDecision(id).amount, 250e6);
    }

    function test_Immutable_AnAlteredCopyFailsTheHashCheck() public {
        _agentRecord();
        bytes32 id2 = _agentRecord();
        IDecisionLog.Decision memory real = decisions.getDecision(id2);
        assertEq(decisions.computeRecordHash(real), real.recordHash);

        IDecisionLog.Decision memory t = decisions.getDecision(id2);
        t.amount = real.amount + 1;
        assertTrue(decisions.computeRecordHash(t) != real.recordHash, "amount");

        t = decisions.getDecision(id2);
        t.counterparty = stranger;
        assertTrue(decisions.computeRecordHash(t) != real.recordHash, "counterparty");

        t = decisions.getDecision(id2);
        t.outcome = IDecisionLog.Outcome.Executed;
        assertTrue(decisions.computeRecordHash(t) != real.recordHash, "outcome");

        t = decisions.getDecision(id2);
        t.rationaleHash = keccak256("a different story");
        assertTrue(decisions.computeRecordHash(t) != real.recordHash, "rationale");

        t = decisions.getDecision(id2);
        t.timestamp = real.timestamp + 1;
        assertTrue(decisions.computeRecordHash(t) != real.recordHash, "timestamp");

        t = decisions.getDecision(id2);
        t.prevHash = bytes32(0); // pretend record 1 is the first: detaches the chain
        assertTrue(decisions.computeRecordHash(t) != real.recordHash, "prevHash");
    }

    function test_Immutable_RemovingAMiddleRecordFromACopyBreaksTheChain() public {
        _agentRecord();
        _agentRecord();
        _agentRecord();
        IDecisionLog.Decision[] memory all = decisions.getDecisionsByBusiness(businessId, 0, 10);
        // an off-chain copy that drops record 1: record 2's prevHash no longer matches its predecessor
        assertTrue(all[2].prevHash != all[0].recordHash);
        assertEq(all[2].prevHash, all[1].recordHash);
    }

    function test_Immutable_VerifyRecordIsFalseForUnknownIds() public view {
        assertFalse(decisions.verifyRecord(bytes32(uint256(123))));
    }

    // ═══════════════════════════════════════════════════════════════
    // Retrieval
    // ═══════════════════════════════════════════════════════════════

    function test_Retrieve_ByIdBusinessAgentAndMandate() public {
        address agent2 = makeAddr("agent2");
        bytes32 agent2Id = keccak256("agent-2");
        vm.prank(owner);
        bytes32 mandate2 = registry.createMandate(_params(businessId, agent2, agent2Id, 2));

        bytes32 a = _agentRecord(); // agent 1, mandate 1
        IDecisionLog.DecisionInput memory d2 = _input();
        d2.agentId = agent2Id;
        d2.mandateId = mandate2;
        bytes32 b = _record(agent2, d2); // agent 2, mandate 2
        bytes32 c = _agentRecord(); // agent 1, mandate 1

        assertEq(decisions.getDecision(b).agentId, agent2Id);
        assertEq(decisions.countByBusiness(businessId), 3);
        assertEq(decisions.countByAgent(AGENT_ID), 2);
        assertEq(decisions.countByAgent(agent2Id), 1);
        assertEq(decisions.countByMandate(mandateId), 2);
        assertEq(decisions.countByMandate(mandate2), 1);

        IDecisionLog.Decision[] memory byBiz = decisions.getDecisionsByBusiness(businessId, 0, 10);
        assertEq(byBiz.length, 3);
        assertEq(byBiz[0].decisionId, a);
        assertEq(byBiz[1].decisionId, b);
        assertEq(byBiz[2].decisionId, c);

        IDecisionLog.Decision[] memory byAgent = decisions.getDecisionsByAgent(AGENT_ID, 0, 10);
        assertEq(byAgent.length, 2);
        assertEq(byAgent[0].decisionId, a);
        assertEq(byAgent[1].decisionId, c);

        IDecisionLog.Decision[] memory byMandate = decisions.getDecisionsByMandate(mandate2, 0, 10);
        assertEq(byMandate.length, 1);
        assertEq(byMandate[0].decisionId, b);
    }

    function test_Retrieve_Pagination() public {
        for (uint256 i; i < 5; ++i) _agentRecord();
        assertEq(decisions.getDecisionsByBusiness(businessId, 0, 2).length, 2);
        assertEq(decisions.getDecisionsByBusiness(businessId, 2, 2).length, 2);
        assertEq(decisions.getDecisionsByBusiness(businessId, 4, 2).length, 1);
        assertEq(decisions.getDecisionsByBusiness(businessId, 5, 2).length, 0, "offset at the end");
        assertEq(decisions.getDecisionsByBusiness(businessId, 99, 2).length, 0, "offset past the end");
        assertEq(decisions.getDecisionsByBusiness(businessId, 1, 2)[0].seq, 1);
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.PageTooLarge.selector, uint256(51)));
        decisions.getDecisionsByBusiness(businessId, 0, 51);
    }

    function test_Retrieve_UnknownDecisionReverts_AndEmptyListsAreEmpty() public {
        vm.expectRevert(abi.encodeWithSelector(DecisionLog.UnknownDecision.selector, bytes32(uint256(9))));
        decisions.getDecision(bytes32(uint256(9)));
        assertEq(decisions.getDecisionsByBusiness(bytes32(uint256(9)), 0, 10).length, 0);
        assertEq(decisions.countByAgent(bytes32(uint256(9))), 0);
        (bytes32 head, uint64 n) = decisions.chainHead(bytes32(uint256(9)));
        assertEq(head, bytes32(0));
        assertEq(n, 0);
    }

    function test_Retrieve_BusinessesHaveSeparateChains() public {
        _agentRecord();
        address ownerB = makeAddr("ownerB");
        vm.prank(ownerB);
        bytes32 bizB = registry.registerBusiness("beta", "meta");
        IDecisionLog.DecisionInput memory d = _input();
        d.businessId = bizB;
        d.mandateId = bytes32(0);
        bytes32 idB = _record(ownerB, d);

        IDecisionLog.Decision memory r = decisions.getDecision(idB);
        assertEq(r.seq, 0, "business B starts its own sequence");
        assertEq(r.prevHash, bytes32(0), "and its own chain");
        _assertChainIntact(businessId);
        _assertChainIntact(bizB);
    }

    function test_SameBlockRecordsAreOrderedBySequenceNotTimestamp() public {
        bytes32 a = _agentRecord();
        bytes32 b = _agentRecord(); // identical timestamp (same block)
        assertEq(decisions.getDecision(a).timestamp, decisions.getDecision(b).timestamp);
        assertEq(decisions.getDecision(a).seq, 0);
        assertEq(decisions.getDecision(b).seq, 1);
        assertEq(decisions.getDecision(b).prevHash, decisions.getDecision(a).recordHash);
    }

    // ═══════════════════════════════════════════════════════════════
    // Fuzz
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_AnyValidSequenceKeepsTheChainIntact(uint256 seed, uint8 n) public {
        uint256 count = bound(n, 1, 25);
        for (uint256 i; i < count; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            IDecisionLog.DecisionInput memory d = _input();
            uint256 kind = r % 6;
            if (kind == 0) { d.action = IDecisionLog.ActionType.Payment; d.outcome = IDecisionLog.Outcome.Proposed; }
            else if (kind == 1) { d.action = IDecisionLog.ActionType.YieldAllocation; d.outcome = IDecisionLog.Outcome.Executed; d.txHash = bytes32(r | 1); }
            else if (kind == 2) { d.action = IDecisionLog.ActionType.Delay; d.outcome = IDecisionLog.Outcome.Delayed; }
            else if (kind == 3) { d.action = IDecisionLog.ActionType.Escalation; d.outcome = IDecisionLog.Outcome.Escalated; d.approvalRef = bytes32(r | 1); }
            else if (kind == 4) { d.action = IDecisionLog.ActionType.Rejection; d.outcome = IDecisionLog.Outcome.Rejected; }
            else { d.action = IDecisionLog.ActionType.Redemption; d.outcome = IDecisionLog.Outcome.Executed; d.txHash = bytes32(r | 1); }
            d.amount = uint128(r >> 128);
            d.riskTier = uint8((r >> 8) % 4);
            d.riskScore = uint16((r >> 16) % 10_001);
            d.rulesEvaluated = uint64(r >> 64);
            d.rationaleHash = bytes32(r);
            vm.warp(block.timestamp + (r % 3) * 1 hours); // sometimes the same second
            _record(r % 2 == 0 ? agent : relayer, d);
        }
        _assertChainIntact(businessId);
    }
}
