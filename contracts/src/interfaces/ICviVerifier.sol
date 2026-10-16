// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICviVerifier
 * @notice The question Credentia asks about a wallet before it lets that wallet issue:
 *         "does this address currently hold a valid Cleanverse Verified Identity (CVI)?"
 *
 * @dev This is an adapter boundary for testnet demonstration. Credentia does NOT have real
 *      Cleanverse CVI access and does NOT claim a real Cleanverse integration or bounty eligibility.
 *      Anything that can answer the question can sit behind it: {CviAttestationOracle} (testnet demo
 *      stand-in) or a future wrapper around an identity contract.
 */
interface ICviVerifier {
    /// @notice True when `wallet` holds a CVI that is attested, not revoked and not expired.
    function isVerified(address wallet) external view returns (bool);

    /**
     * @notice Full verification record for `wallet`.
     * @return verified Same value as {isVerified}
     * @return tier Verification tier reported by the identity provider (0 when unknown)
     * @return expiresAt Unix time the verification lapses, 0 for no expiry
     * @return updatedAt Unix time the record last changed, 0 if never attested
     */
    function statusOf(address wallet)
        external
        view
        returns (bool verified, uint8 tier, uint64 expiresAt, uint64 updatedAt);
}
