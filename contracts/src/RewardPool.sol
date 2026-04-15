// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {IAgentStaking} from "./interfaces/IAgentStaking.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";

contract RewardPool is Ownable, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    error NotAuthorizedController(address caller);
    error InvalidAddress(address account);
    error InvalidAmount();
    error InvalidTokenTransfer(uint256 received, uint256 expected);
    error InvalidNativeDeposit(uint256 received, uint256 expected);
    error NativeTransferFailed(address recipient, uint256 amount);
    error RewardStakeSinkNotConfigured();
    error InsufficientVaultBalance(uint256 vaultId, uint256 requested, uint256 available);
    error InsufficientChallengeBond(uint256 vaultId, uint256 challengeId, uint256 requested, uint256 available);

    struct VaultBalance {
        uint256 setupDepositBalance;
        uint256 resolutionRewardBalance;
    }

    IERC20 public immutable stakeToken;
    address public treasury;
    address public rewardStakeSink;
    bool public stakeRewardClaims;

    mapping(address controller => bool allowed) public authorizedControllers;
    mapping(uint256 vaultId => VaultBalance balance) private _vaultBalances;
    mapping(bytes32 key => uint256 amount) private _challengeBondBalances;
    mapping(address account => uint256 amount) public claimableRewards;
    mapping(address account => uint256 amount) public claimableSetupRewards;

    event ControllerAuthorizationUpdated(address indexed controller, bool allowed);
    event TreasuryUpdated(address indexed treasury);
    event RewardStakeSinkUpdated(address indexed rewardStakeSink, bool stakeRewardClaims);
    event SetupDepositCollected(uint256 indexed vaultId, address indexed payer, uint256 amount);
    event ResolutionRewardDepositCollected(uint256 indexed vaultId, address indexed payer, uint256 amount);
    event ChallengeBondCollected(
        uint256 indexed vaultId, uint256 indexed challengeId, address indexed payer, uint256 amount
    );
    event SetupRewardAllocated(uint256 indexed vaultId, address indexed recipient, uint256 amount);
    event ResolutionRewardAllocated(uint256 indexed vaultId, address indexed recipient, uint256 amount);
    event SetupDepositRefunded(uint256 indexed vaultId, address indexed recipient, uint256 amount);
    event ResolutionRewardRefunded(uint256 indexed vaultId, address indexed recipient, uint256 amount);
    event ChallengeBondRefunded(
        uint256 indexed vaultId, uint256 indexed challengeId, address indexed recipient, uint256 amount
    );
    event ChallengeBondAllocated(
        uint256 indexed vaultId, uint256 indexed challengeId, address indexed recipient, uint256 amount
    );
    event ChallengeBondTreasurySweep(uint256 indexed vaultId, uint256 indexed challengeId, uint256 amount);
    event TreasuryCredited(uint256 indexed vaultId, uint256 amount, string bucket);
    event RewardClaimed(address indexed account, uint256 amount);
    event RewardStaked(address indexed account, uint256 amount);
    event SetupRewardClaimed(address indexed account, uint256 amount);

    constructor(address initialOwner, address stakeToken_, address treasury_) Ownable(initialOwner) {
        if (stakeToken_ == address(0) || treasury_ == address(0)) {
            revert InvalidAddress(address(0));
        }

        stakeToken = IERC20(stakeToken_);
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

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

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) {
            revert InvalidAddress(address(0));
        }

        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setRewardStakeSink(address rewardStakeSink_, bool stakeRewardClaims_) external onlyOwner {
        if (stakeRewardClaims_ && rewardStakeSink_ == address(0)) {
            revert InvalidAddress(address(0));
        }

        rewardStakeSink = rewardStakeSink_;
        stakeRewardClaims = stakeRewardClaims_;
        emit RewardStakeSinkUpdated(rewardStakeSink_, stakeRewardClaims_);
    }

    function collectSetupDeposit(uint256 vaultId, address payer, uint256 amount) external payable onlyController {
        if (amount == 0) revert InvalidAmount();
        if (msg.value != amount) revert InvalidNativeDeposit(msg.value, amount);

        _vaultBalances[vaultId].setupDepositBalance += amount;

        emit SetupDepositCollected(vaultId, payer, amount);
    }

    function collectResolutionRewardDeposit(uint256 vaultId, address payer, uint256 amount) external onlyController {
        if (amount == 0) revert InvalidAmount();

        _pullExact(payer, amount);
        _vaultBalances[vaultId].resolutionRewardBalance += amount;

        emit ResolutionRewardDepositCollected(vaultId, payer, amount);
    }

    function collectChallengeBond(uint256 vaultId, uint256 challengeId, address payer, uint256 amount)
        external
        onlyController
    {
        if (amount == 0) revert InvalidAmount();

        _pullExact(payer, amount);
        _challengeBondBalances[_challengeKey(vaultId, challengeId)] += amount;

        emit ChallengeBondCollected(vaultId, challengeId, payer, amount);
    }

    function allocateSetupReward(uint256 vaultId, address recipient, uint256 amount) external onlyController {
        _debitSetup(vaultId, amount);
        claimableSetupRewards[recipient] += amount;
        emit SetupRewardAllocated(vaultId, recipient, amount);
    }

    function allocateResolutionReward(uint256 vaultId, address recipient, uint256 amount) external onlyController {
        _debitResolution(vaultId, amount);
        claimableRewards[recipient] += amount;
        emit ResolutionRewardAllocated(vaultId, recipient, amount);
    }

    function refundSetupDeposit(uint256 vaultId, address recipient, uint256 amount) external onlyController {
        _debitSetup(vaultId, amount);
        _transferNative(recipient, amount);
        emit SetupDepositRefunded(vaultId, recipient, amount);
    }

    function refundResolutionRewardDeposit(uint256 vaultId, address recipient, uint256 amount) external onlyController {
        _debitResolution(vaultId, amount);
        stakeToken.safeTransfer(recipient, amount);
        emit ResolutionRewardRefunded(vaultId, recipient, amount);
    }

    function refundChallengeBond(uint256 vaultId, uint256 challengeId, address recipient, uint256 amount)
        external
        onlyController
    {
        _debitChallenge(vaultId, challengeId, amount);
        stakeToken.safeTransfer(recipient, amount);
        emit ChallengeBondRefunded(vaultId, challengeId, recipient, amount);
    }

    function allocateChallengeBondReward(uint256 vaultId, uint256 challengeId, address recipient, uint256 amount)
        external
        onlyController
    {
        _debitChallenge(vaultId, challengeId, amount);
        claimableRewards[recipient] += amount;
        emit ChallengeBondAllocated(vaultId, challengeId, recipient, amount);
    }

    function sweepChallengeBondToTreasury(uint256 vaultId, uint256 challengeId, uint256 amount)
        external
        onlyController
    {
        _debitChallenge(vaultId, challengeId, amount);
        stakeToken.safeTransfer(treasury, amount);
        emit ChallengeBondTreasurySweep(vaultId, challengeId, amount);
    }

    function payTreasuryFromSetup(uint256 vaultId, uint256 amount) external onlyController {
        _debitSetup(vaultId, amount);
        _transferNative(treasury, amount);
        emit TreasuryCredited(vaultId, amount, "setup");
    }

    function payTreasuryFromResolution(uint256 vaultId, uint256 amount) external onlyController {
        _debitResolution(vaultId, amount);
        stakeToken.safeTransfer(treasury, amount);
        emit TreasuryCredited(vaultId, amount, "resolution");
    }

    function claimRewards() external nonReentrant returns (uint256 amount) {
        amount = claimableRewards[msg.sender];
        if (amount == 0) revert InvalidAmount();

        claimableRewards[msg.sender] = 0;
        _payStakeReward(msg.sender, amount);
        emit RewardClaimed(msg.sender, amount);
    }

    function claimRewardsFor(address account) external onlyController nonReentrant returns (uint256 amount) {
        amount = claimableRewards[account];
        if (amount == 0) revert InvalidAmount();

        claimableRewards[account] = 0;
        _payStakeReward(account, amount);
        emit RewardClaimed(account, amount);
    }

    function claimSetupRewards() external nonReentrant returns (uint256 amount) {
        amount = claimableSetupRewards[msg.sender];
        if (amount == 0) revert InvalidAmount();

        claimableSetupRewards[msg.sender] = 0;
        _transferNative(msg.sender, amount);
        emit SetupRewardClaimed(msg.sender, amount);
    }

    function claimSetupRewardsFor(address account) external onlyController nonReentrant returns (uint256 amount) {
        amount = claimableSetupRewards[account];
        if (amount == 0) revert InvalidAmount();

        claimableSetupRewards[account] = 0;
        _transferNative(account, amount);
        emit SetupRewardClaimed(account, amount);
    }

    function vaultBalanceOf(uint256 vaultId) external view returns (VaultBalance memory) {
        return _vaultBalances[vaultId];
    }

    function challengeBondBalanceOf(uint256 vaultId, uint256 challengeId) external view returns (uint256) {
        return _challengeBondBalances[_challengeKey(vaultId, challengeId)];
    }

    function _debitSetup(uint256 vaultId, uint256 amount) internal {
        if (amount == 0) revert InvalidAmount();

        uint256 available = _vaultBalances[vaultId].setupDepositBalance;
        if (amount > available) {
            revert InsufficientVaultBalance(vaultId, amount, available);
        }

        _vaultBalances[vaultId].setupDepositBalance = available - amount;
    }

    function _debitResolution(uint256 vaultId, uint256 amount) internal {
        if (amount == 0) revert InvalidAmount();

        uint256 available = _vaultBalances[vaultId].resolutionRewardBalance;
        if (amount > available) {
            revert InsufficientVaultBalance(vaultId, amount, available);
        }

        _vaultBalances[vaultId].resolutionRewardBalance = available - amount;
    }

    function _debitChallenge(uint256 vaultId, uint256 challengeId, uint256 amount) internal {
        if (amount == 0) revert InvalidAmount();

        bytes32 key = _challengeKey(vaultId, challengeId);
        uint256 available = _challengeBondBalances[key];
        if (amount > available) {
            revert InsufficientChallengeBond(vaultId, challengeId, amount, available);
        }

        _challengeBondBalances[key] = available - amount;
    }

    function _challengeKey(uint256 vaultId, uint256 challengeId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(vaultId, challengeId));
    }

    function _payStakeReward(address account, uint256 amount) internal {
        if (!stakeRewardClaims) {
            stakeToken.safeTransfer(account, amount);
            return;
        }
        if (rewardStakeSink == address(0)) revert RewardStakeSinkNotConfigured();

        stakeToken.safeTransfer(rewardStakeSink, amount);
        IAgentStaking(rewardStakeSink).creditRewardStake(account, amount);
        emit RewardStaked(account, amount);
    }

    function _transferNative(address recipient, uint256 amount) internal {
        if (recipient == address(0)) revert InvalidAddress(address(0));

        (bool success,) = payable(recipient).call{value: amount}("");
        if (!success) revert NativeTransferFailed(recipient, amount);
    }

    function _pullExact(address payer, uint256 amount) internal {
        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(payer, address(this), amount);
        uint256 received = stakeToken.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert InvalidTokenTransfer(received, amount);
    }
}
