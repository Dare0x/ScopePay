// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token that calls back into a target during transfers, like a hook-enabled token.
///      It records whether the callback succeeded so tests can prove re-entry was refused.
contract MockReentrantToken is ERC20 {
    address public target;
    bytes public payload;
    bool public attempted;
    bool public reentered;

    constructor() ERC20("Hook Token", "HOOK") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address recipient, uint256 amount) external { _mint(recipient, amount); }
    function arm(address newTarget, bytes calldata newPayload) external { target = newTarget; payload = newPayload; }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (target != address(0) && from == target) {
            address callee = target;
            target = address(0);
            attempted = true;
            (reentered, ) = callee.call(payload);
        }
    }
}
