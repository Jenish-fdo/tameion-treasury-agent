// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ICredentialRegistry} from "./interfaces/ICredentialRegistry.sol";
import {ICviVerifier} from "./interfaces/ICviVerifier.sol";

/**
 * @title CredentialRegistry
 * @notice Manages issuance, revocation, and verification of verifiable
 *         credentials on Monad using EIP-712 typed structured data signing.
 *
 * @dev Credential IDs are derived from (issuer, holder, credentialType, dataHash)
 *      ensuring deterministic uniqueness. Issuers must be authorized by the
 *      contract owner. EIP-712 signatures allow gasless credential issuance
 *      where a relayer submits the transaction on behalf of the issuer.
 *
 * @custom:deploy-target Monad testnet (chain ID 10143)
 */
contract CredentialRegistry is
    ICredentialRegistry,
    Ownable,
    ReentrancyGuard,
    EIP712,
    Nonces
{
    // ──────────────────────────────────────────────────────────────
    // Constants & Immutables
    // ──────────────────────────────────────────────────────────────

    /// @notice EIP-712 type hash for the CredentialRequest struct
    bytes32 private constant CREDENTIAL_REQUEST_TYPEHASH = keccak256(
        "CredentialRequest(address holder,bytes32 credentialType,bytes32 dataHash,uint256 expiryTimestamp,uint256 nonce,uint256 deadline)"
    );

    /// @notice Maximum allowed expiry timestamp (year 2100)
    uint256 private constant MAX_EXPIRY = 4102444800;

    // ──────────────────────────────────────────────────────────────
    // Storage — packed for gas efficiency
    // ──────────────────────────────────────────────────────────────

    /// @notice Credential data keyed by credential ID
    mapping(bytes32 => ICredentialRegistry.Credential) internal _credentials;

    /// @notice Authorized issuers mapping
    mapping(address => bool) internal _authorizedIssuers;

    /// @notice Total credentials issued (never decremented on revoke)
    uint256 public totalCredentials;

    /// @notice Total active (non-revoked, non-expired) credentials
    uint256 public activeCredentials;

    /// @notice Cleanverse CVI gate. When set, only CVI-verified issuers can issue.
    ///         address(0) leaves issuance gated by owner authorization alone.
    address public override cviVerifier;

    /// @dev credential ID => issued through the high-assurance path
    mapping(bytes32 => bool) internal _highAssurance;

    /// @notice credential ID => number of on-chain verification receipts
    mapping(bytes32 => uint256) public override verificationCount;

    // ──────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────

    /// @dev Restricts to authorized issuers only
    modifier onlyIssuer() {
        if (!_authorizedIssuers[msg.sender]) {
            revert NotAuthorizedIssuer(msg.sender);
        }
        _;
    }

    // ──────────────────────────────────────────────────────────────
    // Custom Errors (gas-efficient vs require strings)
    // ──────────────────────────────────────────────────────────────

    error NotAuthorizedIssuer(address caller);
    error CredentialAlreadyExists(bytes32 id);
    error CredentialNotFound(bytes32 id);
    error CredentialExpired(bytes32 id);
    error CredentialRevokedErr(bytes32 id);
    error InvalidExpiry(uint256 expiry);
    error InvalidSignature();
    error SignatureExpired(uint256 deadline);
    error InvalidHolder();
    error ZeroAddress();
    error InvalidDeadline();
    /// @dev The issuer does not hold a valid Cleanverse Verified Identity
    error IssuerNotCviVerified(address issuer);
    /// @dev The holder does not hold a valid Cleanverse Verified Identity
    error HolderNotCviVerified(address holder);
    /// @dev The high-assurance path needs a CVI verifier to be configured
    error CviGateNotConfigured();

    // ──────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────

    /**
     * @notice Initializes the CredentialRegistry with EIP-712 domain
     * @param name_ EIP-712 domain name (e.g. "Credentia")
     * @param version_ EIP-712 domain version (e.g. "1")
     * @param initialOwner Address of the contract owner
     */
    constructor(
        string memory name_,
        string memory version_,
        address initialOwner
    ) EIP712(name_, version_) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    // ──────────────────────────────────────────────────────────────
    // Core: Issuance
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev The credential ID is keccak256(issuer, holder, credentialType, dataHash).
     *      This ensures that the same credential cannot be issued twice.
     *      The issuer must be previously authorized via {authorizeIssuer}.
     *
     * Gas optimization: `issuedAt` and `expiryTimestamp` are packed as uint64,
     * saving 2 storage slots vs uint256. `unchecked` is used for the
     * `activeCredentials` increment since it cannot overflow realistically.
     */
    function issueCredential(
        address holder,
        bytes32 credentialType,
        bytes32 dataHash,
        uint64 expiryTimestamp
    ) external override onlyIssuer nonReentrant returns (bytes32 id) {
        if (holder == address(0)) revert InvalidHolder();
        if (expiryTimestamp != 0 && expiryTimestamp > MAX_EXPIRY) revert InvalidExpiry(expiryTimestamp);
        if (expiryTimestamp != 0 && expiryTimestamp <= block.timestamp) revert InvalidExpiry(expiryTimestamp);

        _requireCviVerifiedIssuer(msg.sender);
        id = _issue(msg.sender, holder, credentialType, dataHash, expiryTimestamp);
    }

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Verifies the EIP-712 typed data signature from the issuer.
     *      The signer must be an authorized issuer. The nonce prevents
     *      replay attacks and is incremented via {Nonces} mixin.
     *
     * Gas optimization: signature recovery is done in-memory; the nonce
     * increment uses `unchecked` since Nonces tracks per-address and
     * overflow at 2^256 is not a practical concern.
     */
    function issueCredentialWithSig(
        CredentialRequest calldata request,
        bytes calldata signature
    ) external override nonReentrant returns (bytes32 id) {
        if (request.holder == address(0)) revert InvalidHolder();
        if (request.deadline < block.timestamp) revert SignatureExpired(request.deadline);
        if (request.expiryTimestamp != 0 && request.expiryTimestamp > MAX_EXPIRY)
            revert InvalidExpiry(request.expiryTimestamp);

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            CREDENTIAL_REQUEST_TYPEHASH,
            request.holder,
            request.credentialType,
            request.dataHash,
            request.expiryTimestamp,
            _useNonce(request.holder), // consumes nonce, reverts on mismatch
            request.deadline
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        if (!_authorizedIssuers[signer]) revert NotAuthorizedIssuer(signer);

        _requireCviVerifiedIssuer(signer);
        id = _issue(signer, request.holder, request.credentialType, request.dataHash, uint64(request.expiryTimestamp));
    }

    // ──────────────────────────────────────────────────────────────
    // Core: Revocation
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Only the original issuer or the contract owner can revoke a
     *      credential. `activeCredentials` is decremented in `unchecked`
     *      because it is guaranteed to be > 0 (credential exists and is active).
     */
    function revokeCredential(bytes32 id, bytes32 reason) external override {
        ICredentialRegistry.Credential storage cred = _credentials[id];
        if (cred.issuer == address(0)) revert CredentialNotFound(id);
        if (cred.revoked) revert CredentialRevokedErr(id);

        bool isOwner = msg.sender == owner();
        bool isIssuer = cred.issuer == msg.sender;
        if (!isOwner && !isIssuer) revert NotAuthorizedIssuer(msg.sender);

        cred.revoked = true;

        unchecked {
            --activeCredentials;
        }

        emit CredentialRevoked(id, msg.sender, reason);
    }

    // ──────────────────────────────────────────────────────────────
    // Core: Verification
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Checks four conditions: existence, not revoked, not expired,
     *      and issuer still authorized. Returns false if any condition fails.
     *      Designed for constant-time, read-only verification by dApps.
     */
    function verifyCredential(bytes32 id) external view override returns (bool valid) {
        ICredentialRegistry.Credential storage cred = _credentials[id];

        if (cred.issuer == address(0)) return false;
        if (cred.revoked) return false;
        if (cred.expiryTimestamp != 0 && cred.expiryTimestamp <= block.timestamp) return false;
        if (!_authorizedIssuers[cred.issuer]) return false;

        return true;
    }

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Alias for {verifyCredential} — checks that a credential
     *      exists and is currently valid. Provided as a convenience
     *      method matching common dApp integration patterns.
     */
    function isCredentialValid(bytes32 id) external view override returns (bool) {
        ICredentialRegistry.Credential storage cred = _credentials[id];

        if (cred.issuer == address(0)) return false;
        if (cred.revoked) return false;
        if (cred.expiryTimestamp != 0 && cred.expiryTimestamp <= block.timestamp) return false;
        if (!_authorizedIssuers[cred.issuer]) return false;

        return true;
    }

    // ──────────────────────────────────────────────────────────────
    // Admin: Issuer Management
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Only callable by the contract owner. Emits {IssuerAuthorized}.
     *      Authorizing an already-authorized issuer is a no-op (idempotent).
     */
    function authorizeIssuer(address issuer) external override onlyOwner {
        if (issuer == address(0)) revert ZeroAddress();
        _authorizedIssuers[issuer] = true;
        emit IssuerAuthorized(issuer);
    }

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Only callable by the contract owner. Emits {IssuerRevoked}.
     *      Existing credentials from a de-authorized issuer will fail
     *      {verifyCredential} since the issuer check returns false.
     */
    function revokeIssuer(address issuer) external override onlyOwner {
        _authorizedIssuers[issuer] = false;
        emit IssuerRevoked(issuer);
    }

    /**
     * @inheritdoc ICredentialRegistry
     */
    function isAuthorizedIssuer(address issuer) external view override returns (bool) {
        return _authorizedIssuers[issuer];
    }

    // ──────────────────────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────────────────────

    /**
     * @inheritdoc ICredentialRegistry
     */
    function getCredential(bytes32 id) external view override returns (ICredentialRegistry.Credential memory credential) {
        credential = _credentials[id];
        if (credential.issuer == address(0)) revert CredentialNotFound(id);
    }

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Returns the EIP-712 domain separator computed by OpenZeppelin's
     *      EIP712 module. This value is used off-chain to construct typed
     *      data signatures for {issueCredentialWithSig}.
     */
    function getDomainSeparator() external view override returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ──────────────────────────────────────────────────────────────
    // Internal Helpers
    // ──────────────────────────────────────────────────────────────

    // ═══════════════════════════════════════════════════════════════
    // Cleanverse CVI gate
    // ═══════════════════════════════════════════════════════════════

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Owner authorization and CVI verification are independent checks: an issuer needs both
     *      when a verifier is set. Credentials already issued are unaffected by later changes.
     */
    function setCviVerifier(address verifier) external override onlyOwner {
        cviVerifier = verifier;
        emit CviVerifierUpdated(verifier);
    }

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev For credentials where it matters that the recipient is a verified person or entity too.
     *      Unlike {issueCredential}, this path refuses to run without a CVI verifier.
     */
    function issueHighAssuranceCredential(
        address holder,
        bytes32 credentialType,
        bytes32 dataHash,
        uint64 expiryTimestamp
    ) external override onlyIssuer nonReentrant returns (bytes32 id) {
        if (holder == address(0)) revert InvalidHolder();
        if (expiryTimestamp != 0 && expiryTimestamp > MAX_EXPIRY) revert InvalidExpiry(expiryTimestamp);
        if (expiryTimestamp != 0 && expiryTimestamp <= block.timestamp) revert InvalidExpiry(expiryTimestamp);

        address verifier = cviVerifier;
        if (verifier == address(0)) revert CviGateNotConfigured();
        if (!ICviVerifier(verifier).isVerified(msg.sender)) revert IssuerNotCviVerified(msg.sender);
        if (!ICviVerifier(verifier).isVerified(holder)) revert HolderNotCviVerified(holder);

        id = _issue(msg.sender, holder, credentialType, dataHash, expiryTimestamp);
        _highAssurance[id] = true;
        emit HighAssuranceCredentialIssued(id);
    }

    /// @inheritdoc ICredentialRegistry
    function isHighAssurance(bytes32 id) external view override returns (bool) {
        return _highAssurance[id];
    }

    // ═══════════════════════════════════════════════════════════════
    // Verification receipts
    // ═══════════════════════════════════════════════════════════════

    /**
     * @inheritdoc ICredentialRegistry
     *
     * @dev Verifying is a free read; this is the optional write that leaves a trace of it.
     *      Anyone can call it for any existing credential. The receipt records what the registry
     *      said at that block, including "not valid", so a history of checks can be indexed.
     */
    function recordVerification(bytes32 id) external override returns (bool valid) {
        ICredentialRegistry.Credential storage cred = _credentials[id];
        if (cred.issuer == address(0)) revert CredentialNotFound(id);

        valid = !cred.revoked && (cred.expiryTimestamp == 0 || cred.expiryTimestamp > block.timestamp)
            && _authorizedIssuers[cred.issuer];

        unchecked {
            ++verificationCount[id];
        }
        emit CredentialChecked(id, msg.sender, valid);
    }

    // ═══════════════════════════════════════════════════════════════
    // Internal
    // ═══════════════════════════════════════════════════════════════

    /// @dev Reverts when a CVI verifier is set and `issuer` does not pass it. No-op when unset.
    function _requireCviVerifiedIssuer(address issuer) internal view {
        address verifier = cviVerifier;
        if (verifier != address(0) && !ICviVerifier(verifier).isVerified(issuer)) {
            revert IssuerNotCviVerified(issuer);
        }
    }

    /// @dev Stores a new credential and emits {CredentialIssued}. Callers validate inputs first.
    function _issue(address issuer, address holder, bytes32 credentialType, bytes32 dataHash, uint64 expiryTimestamp)
        internal
        returns (bytes32 id)
    {
        id = _computeCredentialId(issuer, holder, credentialType, dataHash);
        if (_credentials[id].issuer != address(0)) revert CredentialAlreadyExists(id);

        _credentials[id] = ICredentialRegistry.Credential({
            issuer: issuer,
            holder: holder,
            credentialType: credentialType,
            dataHash: dataHash,
            issuedAt: uint64(block.timestamp),
            expiryTimestamp: expiryTimestamp,
            revoked: false
        });

        unchecked {
            ++totalCredentials;
            ++activeCredentials;
        }

        emit CredentialIssued(id, issuer, holder, credentialType, expiryTimestamp);
    }

    /**
     * @dev Computes a deterministic credential ID from its components.
     *      This ensures that the same credential (same issuer, holder, type,
     *      and data hash) can only be issued once.
     *
     * @param issuer Address of the credential issuer
     * @param holder Address of the credential holder
     * @param credentialType Type identifier of the credential
     * @param dataHash Hash of the off-chain credential data
     * @return id The computed credential ID
     */
    function _computeCredentialId(
        address issuer,
        address holder,
        bytes32 credentialType,
        bytes32 dataHash
    ) internal pure returns (bytes32 id) {
        id = keccak256(abi.encodePacked(issuer, holder, credentialType, dataHash));
    }
}
