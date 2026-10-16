// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry public registry;
    address public owner;
    address public user1;
    address public user2;

    bytes32 public constant TEST_DID = keccak256("did:credentia:test1");
    string public constant TEST_DID_DOCUMENT = '{"@context":"https://www.w3.org/ns/did/v1"}';

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        registry = new IdentityRegistry();
    }

    function testRegisterIdentity() public {
        vm.prank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);

        IdentityRegistry.Identity memory identity = registry.getIdentity(TEST_DID);
        assertEq(identity.owner, user1);
        assertEq(identity.didDocument, TEST_DID_DOCUMENT);
        assertTrue(identity.isActive);
        assertFalse(identity.isAIAgent);
        assertEq(registry.totalIdentities(), 1);
    }

    function testRegisterAIAgentIdentity() public {
        vm.prank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, true);

        IdentityRegistry.Identity memory identity = registry.getIdentity(TEST_DID);
        assertTrue(identity.isAIAgent);
    }

    function testCannotRegisterDuplicateIdentity() public {
        vm.prank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);

        vm.prank(user2);
        vm.expectRevert(IdentityRegistry.IdentityAlreadyExists.selector);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);
    }

    function testUpdateIdentity() public {
        vm.startPrank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);

        string memory newDocument = '{"@context":"https://www.w3.org/ns/did/v1","updated":true}';
        registry.updateIdentity(TEST_DID, newDocument);

        IdentityRegistry.Identity memory identity = registry.getIdentity(TEST_DID);
        assertEq(identity.didDocument, newDocument);
        vm.stopPrank();
    }

    function testCannotUpdateOthersIdentity() public {
        vm.prank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);

        vm.prank(user2);
        vm.expectRevert(IdentityRegistry.NotIdentityOwner.selector);
        registry.updateIdentity(TEST_DID, "new document");
    }

    function testDeactivateIdentity() public {
        vm.startPrank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);
        registry.deactivateIdentity(TEST_DID);

        IdentityRegistry.Identity memory identity = registry.getIdentity(TEST_DID);
        assertFalse(identity.isActive);
        assertFalse(registry.isActiveIdentity(TEST_DID));
        vm.stopPrank();
    }

    function testReactivateIdentity() public {
        vm.startPrank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);
        registry.deactivateIdentity(TEST_DID);
        registry.reactivateIdentity(TEST_DID);

        assertTrue(registry.isActiveIdentity(TEST_DID));
        vm.stopPrank();
    }

    function testTransferIdentityOwnership() public {
        vm.prank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);

        vm.prank(user1);
        registry.transferIdentityOwnership(TEST_DID, user2);

        IdentityRegistry.Identity memory identity = registry.getIdentity(TEST_DID);
        assertEq(identity.owner, user2);
        assertEq(registry.getDIDByAddress(user2), TEST_DID);
        assertEq(registry.getDIDByAddress(user1), bytes32(0));
    }

    function testGetDIDByAddress() public {
        vm.prank(user1);
        registry.registerIdentity(TEST_DID, TEST_DID_DOCUMENT, false);

        assertEq(registry.getDIDByAddress(user1), TEST_DID);
    }
}
