// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockAUSD
 * @notice Mock AUSD ERC-20 token for testing the StakingPool contract.
 *        任何人 can mint tokens freely via the `mint` function.
 */
contract MockAUSD is ERC20 {
    constructor() ERC20("Mock AUSD", "mAUSD") {
        // Mint initial supply to deployer
        _mint(msg.sender, 10_000_000 * 10 ** decimals());
    }

    /**
     * @notice Mint tokens to any address (test-only)
     * @param to Recipient address
     * @param amount Amount to mint (in wei)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
