// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";

contract ProofOfVaultToken is IERC20 {
    error InvalidInitialSupply();
    error InvalidRecipient(address recipient);
    error InsufficientBalance(address account, uint256 balance, uint256 amount);
    error InsufficientAllowance(address owner, address spender, uint256 allowance, uint256 amount);

    string public constant name = "Proof of Vault";
    string public constant symbol = "POV";
    uint8 public constant decimals = 18;

    uint256 public immutable override totalSupply;

    mapping(address account => uint256 balance) public override balanceOf;
    mapping(address owner => mapping(address spender => uint256 allowanceValue)) public override allowance;

    constructor(address treasury, uint256 initialSupply) {
        if (treasury == address(0)) revert InvalidRecipient(address(0));
        if (initialSupply == 0) revert InvalidInitialSupply();

        totalSupply = initialSupply;
        balanceOf[treasury] = initialSupply;
        emit Transfer(address(0), treasury, initialSupply);
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance(from, msg.sender, allowed, amount);

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowed - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidRecipient(address(0));

        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance(from, balance, amount);

        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
