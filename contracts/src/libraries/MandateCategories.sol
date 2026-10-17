// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MandateCategories
/// @notice Payment categories a mandate can allow. A mandate stores a `uint32` bitmask; a payment names one category.
///         Bits 9..31 are reserved. The ids are part of the protocol: the web app and backend mirror them.
library MandateCategories {
    uint8 internal constant PAYROLL = 0;
    uint8 internal constant VENDOR_INVOICE = 1;
    uint8 internal constant TAX = 2;
    uint8 internal constant SUBSCRIPTION = 3;
    uint8 internal constant UTILITIES = 4;
    uint8 internal constant RENT = 5;
    uint8 internal constant CONTRACTOR = 6;
    uint8 internal constant REFUND = 7;
    uint8 internal constant OTHER = 8;

    uint8 internal constant MAX_CATEGORY = 31;

    /// @dev Bitmask for one category. Reverts through the shift overflow check if `category > 31`.
    function bit(uint8 category) internal pure returns (uint32) {
        return uint32(1) << category;
    }

    function allows(uint32 mask, uint8 category) internal pure returns (bool) {
        return category <= MAX_CATEGORY && (mask & (uint32(1) << category)) != 0;
    }
}
