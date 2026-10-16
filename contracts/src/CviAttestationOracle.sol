// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ICviVerifier } from "./interfaces/ICviVerifier.sol";

/**
 * @title CviAttestationOracle
 * @notice On-chain testnet demo stand-in record of which wallets hold a Cleanverse Verified Identity (CVI),
 *         written by attesters for demonstration purposes.
 *
 * @dev This contract is Credentia's testnet demo stand-in adapter, NOT an official Cleanverse contract.
 *      Credentia does NOT have real Cleanverse CVI access and does NOT claim a real Cleanverse
 *      integration or bounty eligibility. It stores only the outcome of a demo check: a verified
 *      flag, a tier, an expiry and a hash of the off-chain evidence. No personal data is written on-chain.
 *
 *      Testnet demonstration code. Unaudited.
 *
 * @custom:deploy-target Monad testnet (chain ID 10143)
 */
contract CviAttestationOracle is ICviVerifier, Ownable {
    struct Record {
        bool attested;
        bool revoked;
        uint8 tier;
        uint64 expiresAt;
        uint64 updatedAt;
        bytes32 evidenceHash;
    }

    mapping(address => Record) private _records;
    mapping(address => bool) public isAttester;

    /// @notice Number of wallets currently marked attested and not revoked (expiry is not tracked here).
    uint256 public attestedCount;

    event AttesterUpdated(address indexed attester, bool allowed);
    event IdentityAttested(
        address indexed wallet, address indexed attester, uint8 tier, uint64 expiresAt, bytes32 evidenceHash
    );
    event IdentityRevoked(address indexed wallet, address indexed attester, bytes32 reason);

    error NotAttester(address caller);
    error ZeroAddress();
    error InvalidExpiry(uint64 expiresAt);
    error NotAttested(address wallet);

    modifier onlyAttester() {
        if (!isAttester[msg.sender]) revert NotAttester(msg.sender);
        _;
    }

    /// @param initialOwner Owner, who appoints attesters. Also appointed as the first attester.
    constructor(address initialOwner) Ownable(initialOwner) {
        isAttester[initialOwner] = true;
        emit AttesterUpdated(initialOwner, true);
    }

    /// @notice Appoint or remove an attester.
    function setAttester(address attester, bool allowed) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        isAttester[attester] = allowed;
        emit AttesterUpdated(attester, allowed);
    }

    /**
     * @notice Record that `wallet` passed a Cleanverse CVI check.
     * @param wallet The verified wallet
     * @param tier Tier reported by Cleanverse (0 when not provided)
     * @param expiresAt Unix time the verification lapses, or 0 for no expiry
     * @param evidenceHash Hash of the off-chain check result, so the attestation can be audited later
     */
    function attest(address wallet, uint8 tier, uint64 expiresAt, bytes32 evidenceHash) external onlyAttester {
        if (wallet == address(0)) revert ZeroAddress();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);

        Record storage r = _records[wallet];
        if (!r.attested || r.revoked) {
            unchecked {
                ++attestedCount;
            }
        }
        r.attested = true;
        r.revoked = false;
        r.tier = tier;
        r.expiresAt = expiresAt;
        r.updatedAt = uint64(block.timestamp);
        r.evidenceHash = evidenceHash;

        emit IdentityAttested(wallet, msg.sender, tier, expiresAt, evidenceHash);
    }

    /// @notice Withdraw a wallet's verification, for example after Cleanverse revokes or freezes it.
    function revoke(address wallet, bytes32 reason) external onlyAttester {
        Record storage r = _records[wallet];
        if (!r.attested || r.revoked) revert NotAttested(wallet);
        r.revoked = true;
        r.updatedAt = uint64(block.timestamp);
        unchecked {
            --attestedCount;
        }
        emit IdentityRevoked(wallet, msg.sender, reason);
    }

    /// @inheritdoc ICviVerifier
    function isVerified(address wallet) public view override returns (bool) {
        Record storage r = _records[wallet];
        return r.attested && !r.revoked && (r.expiresAt == 0 || r.expiresAt > block.timestamp);
    }

    /// @inheritdoc ICviVerifier
    function statusOf(address wallet)
        external
        view
        override
        returns (bool verified, uint8 tier, uint64 expiresAt, uint64 updatedAt)
    {
        Record storage r = _records[wallet];
        return (isVerified(wallet), r.tier, r.expiresAt, r.updatedAt);
    }

    /// @notice Hash of the evidence behind a wallet's current record.
    function evidenceOf(address wallet) external view returns (bytes32) {
        return _records[wallet].evidenceHash;
    }
}
