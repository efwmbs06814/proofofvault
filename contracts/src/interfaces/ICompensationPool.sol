// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICompensationPool {
    function notifySlashDeposit(uint256 vaultId, address token, uint256 amount) external;
}
