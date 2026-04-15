// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {ICompensationPool} from "./interfaces/ICompensationPool.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";

contract VaultEscrow is Ownable, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    error NotAuthorizedController(address caller);
    error EscrowAlreadyInitialized(uint256 vaultId);
    error EscrowNotFound(uint256 vaultId);
    error EscrowAlreadySettled(uint256 vaultId);
    error InvalidAddress(address account);
    error InvalidAmount();
    error InvalidFee(uint256 fee, uint256 available);
    error InsufficientFundedCollateral(address token, uint256 accountedAmount, uint256 actualBalance);
    error InsufficientRescueableBalance(address token, uint256 requested, uint256 available);

    struct EscrowRecord {
        address setter;
        address collateralToken;
        uint256 lockedAmount;
        bool settled;
    }

    mapping(address controller => bool allowed) public authorizedControllers;
    mapping(uint256 vaultId => EscrowRecord escrow) private _escrows;
    mapping(address token => uint256 amount) public accountedCollateralByToken;

    event ControllerAuthorizationUpdated(address indexed controller, bool allowed);
    event CollateralLocked(
        uint256 indexed vaultId, address indexed setter, address indexed collateralToken, uint256 amount
    );
    event CollateralReleased(
        uint256 indexed vaultId, address indexed setter, uint256 releasedAmount, uint256 settlementFee
    );
    event CollateralRefunded(uint256 indexed vaultId, address indexed setter, uint256 refundedAmount);
    event CollateralSlashed(
        uint256 indexed vaultId, address indexed compensationPool, uint256 poolAmount, uint256 settlementFee
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyController() {
        if (!authorizedControllers[msg.sender]) {
            revert NotAuthorizedController(msg.sender);
        }
        _;
    }

    function setAuthorizedController(address controller, bool allowed) external onlyOwner {
        authorizedControllers[controller] = allowed;
        emit ControllerAuthorizationUpdated(controller, allowed);
    }

    function lockCollateral(uint256 vaultId, address setter, address collateralToken, uint256 amount)
        external
        onlyController
    {
        if (setter == address(0) || collateralToken == address(0)) revert InvalidAddress(address(0));
        if (amount == 0) revert InvalidAmount();
        if (_escrows[vaultId].setter != address(0)) {
            revert EscrowAlreadyInitialized(vaultId);
        }

        accountedCollateralByToken[collateralToken] += amount;
        uint256 actualBalance = IERC20(collateralToken).balanceOf(address(this));
        if (actualBalance < accountedCollateralByToken[collateralToken]) {
            revert InsufficientFundedCollateral(
                collateralToken, accountedCollateralByToken[collateralToken], actualBalance
            );
        }

        _escrows[vaultId] =
            EscrowRecord({setter: setter, collateralToken: collateralToken, lockedAmount: amount, settled: false});

        emit CollateralLocked(vaultId, setter, collateralToken, amount);
    }

    function releaseToSetter(uint256 vaultId, address treasury, uint256 settlementFee)
        external
        onlyController
        nonReentrant
        returns (uint256 releasedAmount)
    {
        EscrowRecord storage escrow = _consumeEscrow(vaultId);
        if (settlementFee > escrow.lockedAmount) {
            revert InvalidFee(settlementFee, escrow.lockedAmount);
        }
        if (settlementFee > 0 && treasury == address(0)) revert InvalidAddress(address(0));

        IERC20 token = IERC20(escrow.collateralToken);
        if (settlementFee > 0) {
            token.safeTransfer(treasury, settlementFee);
        }

        releasedAmount = escrow.lockedAmount - settlementFee;
        token.safeTransfer(escrow.setter, releasedAmount);

        emit CollateralReleased(vaultId, escrow.setter, releasedAmount, settlementFee);
    }

    function refundAfterInvalid(uint256 vaultId, uint256 settlementFee)
        external
        onlyController
        nonReentrant
        returns (uint256 refundedAmount)
    {
        EscrowRecord storage escrow = _consumeEscrow(vaultId);
        if (settlementFee != 0) {
            revert InvalidFee(settlementFee, 0);
        }

        refundedAmount = escrow.lockedAmount - settlementFee;
        IERC20(escrow.collateralToken).safeTransfer(escrow.setter, refundedAmount);

        emit CollateralRefunded(vaultId, escrow.setter, refundedAmount);
    }

    function slashCollateral(uint256 vaultId, address compensationPool, address treasury, uint256 settlementFee)
        external
        onlyController
        nonReentrant
        returns (uint256 poolAmount)
    {
        EscrowRecord storage escrow = _consumeEscrow(vaultId);
        if (settlementFee > escrow.lockedAmount) {
            revert InvalidFee(settlementFee, escrow.lockedAmount);
        }
        if (compensationPool == address(0) || (settlementFee > 0 && treasury == address(0))) {
            revert InvalidAddress(address(0));
        }

        IERC20 token = IERC20(escrow.collateralToken);
        if (settlementFee > 0) {
            token.safeTransfer(treasury, settlementFee);
        }

        poolAmount = escrow.lockedAmount - settlementFee;
        token.safeTransfer(compensationPool, poolAmount);
        ICompensationPool(compensationPool).notifySlashDeposit(vaultId, escrow.collateralToken, poolAmount);

        emit CollateralSlashed(vaultId, compensationPool, poolAmount, settlementFee);
    }

    function escrowOf(uint256 vaultId) external view returns (EscrowRecord memory) {
        return _escrows[vaultId];
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) revert InvalidAddress(address(0));
        if (amount == 0) revert InvalidAmount();

        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        uint256 accountedAmount = accountedCollateralByToken[token];
        uint256 rescueableBalance = actualBalance > accountedAmount ? actualBalance - accountedAmount : 0;
        if (amount > rescueableBalance) {
            revert InsufficientRescueableBalance(token, amount, rescueableBalance);
        }

        IERC20(token).safeTransfer(to, amount);
    }

    function _consumeEscrow(uint256 vaultId) internal returns (EscrowRecord storage escrow) {
        escrow = _escrows[vaultId];
        if (escrow.setter == address(0)) {
            revert EscrowNotFound(vaultId);
        }
        if (escrow.settled) {
            revert EscrowAlreadySettled(vaultId);
        }

        escrow.settled = true;
        accountedCollateralByToken[escrow.collateralToken] -= escrow.lockedAmount;
    }
}
