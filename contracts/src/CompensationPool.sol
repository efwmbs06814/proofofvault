// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {Ownable} from "./utils/Ownable.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";

contract CompensationPool is Ownable {
    using SafeTransferLib for IERC20;

    error NotAuthorizedNotifier(address caller);
    error InvalidReceiver(address receiver);
    error InsufficientRescueableBalance(address token, uint256 requested, uint256 available);

    mapping(address notifier => bool allowed) public authorizedNotifiers;
    mapping(address token => uint256 amount) public totalReceivedByToken;

    event NotifierAuthorizationUpdated(address indexed notifier, bool allowed);
    event SlashDepositRecorded(uint256 indexed vaultId, address indexed token, uint256 amount);
    event RescueExecuted(address indexed token, address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyNotifier() {
        if (!authorizedNotifiers[msg.sender]) {
            revert NotAuthorizedNotifier(msg.sender);
        }
        _;
    }

    function setAuthorizedNotifier(address notifier, bool allowed) external onlyOwner {
        authorizedNotifiers[notifier] = allowed;
        emit NotifierAuthorizationUpdated(notifier, allowed);
    }

    function notifySlashDeposit(uint256 vaultId, address token, uint256 amount) external onlyNotifier {
        totalReceivedByToken[token] += amount;
        emit SlashDepositRecorded(vaultId, token, amount);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) {
            revert InvalidReceiver(address(0));
        }

        uint256 accountedBalance = totalReceivedByToken[token];
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        uint256 rescueableBalance = actualBalance > accountedBalance ? actualBalance - accountedBalance : 0;
        if (amount > rescueableBalance) {
            revert InsufficientRescueableBalance(token, amount, rescueableBalance);
        }

        IERC20(token).safeTransfer(to, amount);
        emit RescueExecuted(token, to, amount);
    }
}
