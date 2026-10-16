// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICredentialRegistry
 * @notice Interface for the CredentialRegistry contract that manages
 *         issuance, revocation, and verification of verifiable credentials
 *         using EIP-712 typed structured data signing.
 */
interface ICredentialRegistry {
    /// @notice Emitted when a new credential is issued
    /// @param id Unique credential identifier
    /// @param issuer Address of the credential issuer
    /// @param holder Address of the credential holder
    /// @param credentialType Type identifier of the credential
    /// @param expiryTimestamp Timestamp when the credential expires (0 = no expiry)
    event CredentialIssued(
        bytes32 indexed id,
        address indexed issuer,
        address indexed holder,
        bytes32 credentialType,
        uint256 expiryTimestamp
    );

    /// @notice Emitted when a credential is revoked
    /// @param id Unique credential identifier
    /// @param revokedBy Address that revoked the credential
    /// @param reason Reason for revocation (keccak256 hash of reason string)
    event CredentialRevoked(bytes32 indexed id, address indexed revokedBy, bytes32 reason);

    /// @notice Emitted when an issuer is authorized
    /// @param issuer Address authorized to issue credentials
    event IssuerAuthorized(address indexed issuer);

    /// @notice Emitted when an issuer's authorization is revoked
    /// @param issuer Address that was de-authorized
    event IssuerRevoked(address indexed issuer);

    /// @notice Emitted when the EIP-712 domain separator is updated
    /// @param newDomainSeparator The new domain separator value
    event DomainSeparatorUpdated(bytes32 newDomainSeparator);

    /// @notice Emitted when the owner sets or clears the Cleanverse CVI gate
    /// @param verifier The new verifier contract, or address(0) when the gate is switched off
    event CviVerifierUpdated(address indexed verifier);

    /// @notice Emitted when a credential is issued through the high-assurance path
    /// @param id The credential ID. Both issuer and holder were CVI-verified at issuance.
    event HighAssuranceCredentialIssued(bytes32 indexed id);

    /// @notice Emitted when someone records a verification of a credential on-chain
    /// @param id The credential that was checked
    /// @param verifier The account that recorded the check
    /// @param valid Whether the credential was valid at that moment
    event CredentialChecked(bytes32 indexed id, address indexed verifier, bool valid);

    /// @notice Struct representing a verifiable credential
    struct Credential {
        address issuer;
        address holder;
        bytes32 credentialType;
        bytes32 dataHash;
        uint64 issuedAt;
        uint64 expiryTimestamp;
        bool revoked;
    }

    /// @notice EIP-712 structured data for credential issuance
    struct CredentialRequest {
        address holder;
        bytes32 credentialType;
        bytes32 dataHash;
        uint256 expiryTimestamp;
        uint256 nonce;
        uint256 deadline;
    }

    /**
     * @notice Issue a credential directly as an authorized issuer
     * @param holder Address of the credential holder
     * @param credentialType Type identifier (keccak256 of type name)
     * @param dataHash Hash of the credential data (stored off-chain)
     * @param expiryTimestamp When the credential expires (0 = no expiry)
     * @return id The unique credential identifier
     */
    function issueCredential(
        address holder,
        bytes32 credentialType,
        bytes32 dataHash,
        uint64 expiryTimestamp
    ) external returns (bytes32 id);

    /**
     * @notice Issue a credential via EIP-712 typed data signature
     * @param request The credential request struct
     * @param signature EIP-712 signature from the issuer
     * @return id The unique credential identifier
     */
    function issueCredentialWithSig(
        CredentialRequest calldata request,
        bytes calldata signature
    ) external returns (bytes32 id);

    /**
     * @notice Revoke a previously issued credential
     * @param id Unique credential identifier
     * @param reason Reason for revocation (keccak256 hash)
     */
    function revokeCredential(bytes32 id, bytes32 reason) external;

    /**
     * @notice Verify if a credential is valid (not revoked, not expired, issuer authorized)
     * @param id Unique credential identifier
     * @return valid Whether the credential is valid
     */
    function verifyCredential(bytes32 id) external view returns (bool valid);

    /**
     * @notice Check if a credential exists
     * @param id Unique credential identifier
     * @return exists Whether the credential exists
     */
    function isCredentialValid(bytes32 id) external view returns (bool);

    /**
     * @notice Get full credential data
     * @param id Unique credential identifier
     * @return credential The credential struct
     */
    function getCredential(bytes32 id) external view returns (Credential memory credential);

    /**
     * @notice Authorize an address to issue credentials
     * @param issuer Address to authorize
     */
    function authorizeIssuer(address issuer) external;

    /**
     * @notice Revoke an issuer's authorization
     * @param issuer Address to de-authorize
     */
    function revokeIssuer(address issuer) external;

    /**
     * @notice Check if an address is an authorized issuer
     * @param issuer Address to check
     * @return isAuthorized Whether the address is authorized
     */
    function isAuthorizedIssuer(address issuer) external view returns (bool);

    /**
     * @notice Get the EIP-712 domain separator
     * @return domainSeparator The domain separator hash
     */
    function getDomainSeparator() external view returns (bytes32);

    // ─── Cleanverse CVI gate ────────────────────────────────────────

    /// @notice Set the contract that answers "is this wallet CVI-verified?". Owner only.
    /// @param verifier An {ICviVerifier}, or address(0) to switch the gate off
    function setCviVerifier(address verifier) external;

    /// @notice The current CVI verifier, or address(0) when issuance is not CVI-gated
    function cviVerifier() external view returns (address);

    /// @notice Issue a credential that also requires the HOLDER to be CVI-verified
    /// @dev Reverts unless a CVI verifier is set and both issuer and holder pass it
    function issueHighAssuranceCredential(
        address holder,
        bytes32 credentialType,
        bytes32 dataHash,
        uint64 expiryTimestamp
    ) external returns (bytes32 id);

    /// @notice Whether a credential was issued through the high-assurance path
    function isHighAssurance(bytes32 id) external view returns (bool);

    // ─── Verification receipts ──────────────────────────────────────

    /// @notice Leave an on-chain receipt that the caller checked a credential
    /// @param id The credential ID
    /// @return valid The credential's validity at this block
    function recordVerification(bytes32 id) external returns (bool valid);

    /// @notice How many verification receipts a credential has
    function verificationCount(bytes32 id) external view returns (uint256);
}
