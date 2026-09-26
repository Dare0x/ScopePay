// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token that skims 1% of every transfer, like a fee-on-transfer token.
contract MockFeeToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address recipient, uint256 amount) external { _mint(recipient, amount); }
    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = value / 100;
        super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}
