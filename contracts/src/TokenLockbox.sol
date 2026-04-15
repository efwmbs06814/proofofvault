// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";

contract TokenLockbox is Ownable, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    error InvalidAddress(address account);
    error InvalidUnlockTime(uint64 unlockAt);
    error TokensLocked(uint64 unlockAt);
    error InvalidAmount();

    IERC20 public immutable token;
    address public beneficiary;
    uint64 public immutable unlockAt;

    event BeneficiaryUpdated(address indexed beneficiary);
    event TokensReleased(address indexed recipient, uint256 amount);

    constructor(address initialOwner, address token_, address beneficiary_, uint64 unlockAt_) Ownable(initialOwner) {
        if (token_ == address(0) || beneficiary_ == address(0)) revert InvalidAddress(address(0));
        if (unlockAt_ <= block.timestamp) revert InvalidUnlockTime(unlockAt_);

        token = IERC20(token_);
        beneficiary = beneficiary_;
        unlockAt = unlockAt_;
        emit BeneficiaryUpdated(beneficiary_);
    }

    function setBeneficiary(address beneficiary_) external onlyOwner {
        if (beneficiary_ == address(0)) revert InvalidAddress(address(0));

        beneficiary = beneficiary_;
        emit BeneficiaryUpdated(beneficiary_);
    }

    function release(uint256 amount) external onlyOwner nonReentrant {
        if (block.timestamp < unlockAt) revert TokensLocked(unlockAt);
        if (amount == 0) revert InvalidAmount();

        token.safeTransfer(beneficiary, amount);
        emit TokensReleased(beneficiary, amount);
    }
}
