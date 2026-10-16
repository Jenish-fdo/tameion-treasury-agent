// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IdentityRegistry
 * @notice Core registry for decentralized identities on Credentia
 * @dev Manages DID registration, resolution, and lifecycle for humans and AI agents
 */
contract IdentityRegistry is Ownable, ReentrancyGuard {
    /// @notice Identity structure
    struct Identity {
        address owner;
        string didDocument;
        uint256 createdAt;
        uint256 updatedAt;
        bool isActive;
        bool isAIAgent;
    }

    /// @notice Mapping from DID to Identity
    mapping(bytes32 => Identity) public identities;

    /// @notice Mapping from address to DID
    mapping(address => bytes32) public addressToDID;

    /// @notice Total number of registered identities
    uint256 public totalIdentities;

    /// @notice Events
    event IdentityRegistered(bytes32 indexed did, address indexed owner, bool isAIAgent);
    event IdentityUpdated(bytes32 indexed did, string didDocument);
    event IdentityDeactivated(bytes32 indexed did);
    event IdentityReactivated(bytes32 indexed did);
    event OwnershipTransferred(bytes32 indexed did, address indexed previousOwner, address indexed newOwner);

    /// @notice Errors
    error IdentityAlreadyExists();
    error IdentityNotFound();
    error NotIdentityOwner();
    error IdentityInactive();
    error InvalidDIDDocument();

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register a new identity
     * @param did Decentralized identifier
     * @param didDocument DID document containing public keys and endpoints
     * @param isAIAgent Whether this identity is for an AI agent
     */
    function registerIdentity(bytes32 did, string calldata didDocument, bool isAIAgent) external nonReentrant {
        if (identities[did].owner != address(0)) revert IdentityAlreadyExists();
        if (bytes(didDocument).length == 0) revert InvalidDIDDocument();

        identities[did] = Identity({
            owner: msg.sender,
            didDocument: didDocument,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            isActive: true,
            isAIAgent: isAIAgent
        });

        addressToDID[msg.sender] = did;
        totalIdentities++;

        emit IdentityRegistered(did, msg.sender, isAIAgent);
    }

    /**
     * @notice Update DID document
     * @param did Decentralized identifier
     * @param newDidDocument New DID document
     */
    function updateIdentity(bytes32 did, string calldata newDidDocument) external {
        Identity storage identity = identities[did];
        if (identity.owner == address(0)) revert IdentityNotFound();
        if (identity.owner != msg.sender) revert NotIdentityOwner();
        if (!identity.isActive) revert IdentityInactive();
        if (bytes(newDidDocument).length == 0) revert InvalidDIDDocument();

        identity.didDocument = newDidDocument;
        identity.updatedAt = block.timestamp;

        emit IdentityUpdated(did, newDidDocument);
    }

    /**
     * @notice Deactivate an identity
     * @param did Decentralized identifier
     */
    function deactivateIdentity(bytes32 did) external {
        Identity storage identity = identities[did];
        if (identity.owner == address(0)) revert IdentityNotFound();
        if (identity.owner != msg.sender) revert NotIdentityOwner();

        identity.isActive = false;
        identity.updatedAt = block.timestamp;

        emit IdentityDeactivated(did);
    }

    /**
     * @notice Reactivate an identity
     * @param did Decentralized identifier
     */
    function reactivateIdentity(bytes32 did) external {
        Identity storage identity = identities[did];
        if (identity.owner == address(0)) revert IdentityNotFound();
        if (identity.owner != msg.sender) revert NotIdentityOwner();

        identity.isActive = true;
        identity.updatedAt = block.timestamp;

        emit IdentityReactivated(did);
    }

    /**
     * @notice Transfer identity ownership
     * @param did Decentralized identifier
     * @param newOwner New owner address
     */
    function transferIdentityOwnership(bytes32 did, address newOwner) external {
        Identity storage identity = identities[did];
        if (identity.owner == address(0)) revert IdentityNotFound();
        if (identity.owner != msg.sender) revert NotIdentityOwner();
        require(newOwner != address(0), "Invalid new owner");

        address previousOwner = identity.owner;
        identity.owner = newOwner;
        identity.updatedAt = block.timestamp;

        delete addressToDID[previousOwner];
        addressToDID[newOwner] = did;

        emit OwnershipTransferred(did, previousOwner, newOwner);
    }

    /**
     * @notice Get identity by DID
     * @param did Decentralized identifier
     * @return Identity struct
     */
    function getIdentity(bytes32 did) external view returns (Identity memory) {
        return identities[did];
    }

    /**
     * @notice Get DID by address
     * @param owner Owner address
     * @return DID
     */
    function getDIDByAddress(address owner) external view returns (bytes32) {
        return addressToDID[owner];
    }

    /**
     * @notice Check if identity exists and is active
     * @param did Decentralized identifier
     * @return bool
     */
    function isActiveIdentity(bytes32 did) external view returns (bool) {
        return identities[did].owner != address(0) && identities[did].isActive;
    }
}
