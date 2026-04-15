// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {IAgentStaking} from "./interfaces/IAgentStaking.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";
import {ProofOfVaultTypes} from "./libraries/ProofOfVaultTypes.sol";

contract AgentStaking is Ownable, ReentrancyGuard, IAgentStaking {
    using SafeTransferLib for IERC20;

    error InvalidAmount();
    error InvalidIncidentHash();
    error InvalidTokenTransfer(uint256 received, uint256 expected);
    error WithdrawalDisabled();
    error WithdrawalNotReady(uint64 readyAt);
    error InsufficientStake(uint256 requested, uint256 available);
    error InvalidReceiver(address receiver);
    error NotAuthorizedSlasher(address caller);
    error NotAuthorizedController(address caller);
    error TaskBondAlreadyLocked(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role);
    error TaskBondNotFound(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role);
    error DuplicateIncident(bytes32 incidentHash);
    error DuplicateAgent(address agent);

    IERC20 public immutable stakeToken;
    uint64 public withdrawalCooldown;
    bool public withdrawalsEnabled;
    uint256 public totalAccountedStake;

    mapping(address agent => ProofOfVaultTypes.AgentStakeState state) private _stakes;
    mapping(address slasher => bool allowed) public authorizedSlashers;
    mapping(address controller => bool allowed) public authorizedControllers;
    mapping(bytes32 taskKey => ProofOfVaultTypes.TaskBondRecord record) private _taskBonds;
    mapping(bytes32 incidentHash => bool used) public consumedIncidents;

    event AgentStaked(address indexed agent, uint256 amount, uint256 newStake);
    event AgentStakeSeeded(address indexed agent, uint256 amount, uint256 newStake);
    event AgentRewardStaked(address indexed agent, uint256 amount, uint256 newStake);
    event WithdrawalRequested(address indexed agent, uint256 amount, uint64 readyAt);
    event WithdrawalCompleted(address indexed agent, uint256 amount);
    event TaskBondLocked(
        address indexed agent, uint256 indexed vaultId, ProofOfVaultTypes.CommitteeRole indexed role, uint256 amount
    );
    event TaskBondReleased(
        address indexed agent, uint256 indexed vaultId, ProofOfVaultTypes.CommitteeRole indexed role, uint256 amount
    );
    event TaskBondSlashed(
        address indexed agent,
        uint256 indexed vaultId,
        ProofOfVaultTypes.CommitteeRole indexed role,
        address receiver,
        uint256 amount,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        bytes32 incidentHash
    );
    event AgentSlashed(
        address indexed agent, address indexed receiver, uint256 amount, ProofOfVaultTypes.SlashReasonCode reasonCode
    );
    event WithdrawalCooldownUpdated(uint64 withdrawalCooldown);
    event WithdrawalsEnabledUpdated(bool enabled);
    event SlasherAuthorizationUpdated(address indexed slasher, bool allowed);
    event ControllerAuthorizationUpdated(address indexed controller, bool allowed);

    constructor(address initialOwner, address stakeToken_, uint64 withdrawalCooldown_) Ownable(initialOwner) {
        if (stakeToken_ == address(0)) revert OwnableInvalidOwner(address(0));

        stakeToken = IERC20(stakeToken_);
        withdrawalCooldown = withdrawalCooldown_;
        emit WithdrawalCooldownUpdated(withdrawalCooldown_);
    }

    modifier onlyController() {
        if (!authorizedControllers[msg.sender]) {
            revert NotAuthorizedController(msg.sender);
        }
        _;
    }

    function setWithdrawalCooldown(uint64 withdrawalCooldown_) external onlyOwner {
        withdrawalCooldown = withdrawalCooldown_;
        emit WithdrawalCooldownUpdated(withdrawalCooldown_);
    }

    function setWithdrawalsEnabled(bool enabled) external onlyOwner {
        withdrawalsEnabled = enabled;
        emit WithdrawalsEnabledUpdated(enabled);
    }

    function setAuthorizedSlasher(address slasher, bool allowed) external onlyOwner {
        authorizedSlashers[slasher] = allowed;
        emit SlasherAuthorizationUpdated(slasher, allowed);
    }

    function setAuthorizedController(address controller, bool allowed) external onlyOwner {
        authorizedControllers[controller] = allowed;
        emit ControllerAuthorizationUpdated(controller, allowed);
    }

    function stakeForAgent(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        _pullExact(msg.sender, amount);
        _stakes[msg.sender].activeStake += amount;
        totalAccountedStake += amount;

        emit AgentStaked(msg.sender, amount, _stakes[msg.sender].activeStake);
    }

    function seedAgentStakesFrom(address funder, address[] calldata agents, uint256 totalAmount)
        external
        onlyOwner
        nonReentrant
    {
        if (funder == address(0)) revert InvalidReceiver(address(0));
        if (totalAmount == 0 || agents.length == 0 || totalAmount < agents.length) revert InvalidAmount();

        _pullExact(funder, totalAmount);

        uint256 baseAmount = totalAmount / agents.length;
        uint256 remainder = totalAmount % agents.length;
        for (uint256 i = 0; i < agents.length; i++) {
            address agent = agents[i];
            if (agent == address(0)) revert InvalidReceiver(address(0));
            for (uint256 j = 0; j < i; j++) {
                if (agents[j] == agent) revert DuplicateAgent(agent);
            }

            uint256 amount = baseAmount;
            if (i < remainder) {
                amount += 1;
            }

            _stakes[agent].activeStake += amount;
            emit AgentStakeSeeded(agent, amount, _stakes[agent].activeStake);
        }

        totalAccountedStake += totalAmount;
    }

    function creditRewardStake(address agent, uint256 amount) external onlyController nonReentrant {
        if (agent == address(0)) revert InvalidReceiver(address(0));
        if (amount == 0) revert InvalidAmount();

        uint256 requiredBalance = totalAccountedStake + amount;
        uint256 currentBalance = stakeToken.balanceOf(address(this));
        if (currentBalance < requiredBalance) revert InvalidTokenTransfer(currentBalance, requiredBalance);

        _stakes[agent].activeStake += amount;
        totalAccountedStake = requiredBalance;

        emit AgentRewardStaked(agent, amount, _stakes[agent].activeStake);
    }

    function requestWithdrawal(uint256 amount) external nonReentrant {
        if (!withdrawalsEnabled) revert WithdrawalDisabled();
        if (amount == 0) revert InvalidAmount();

        ProofOfVaultTypes.AgentStakeState storage state = _stakes[msg.sender];
        uint256 freeStake = state.activeStake - state.lockedTaskStake;
        if (freeStake < amount) {
            revert InsufficientStake(amount, freeStake);
        }

        state.activeStake -= amount;
        state.pendingWithdrawal += amount;
        state.withdrawalReadyAt = uint64(block.timestamp) + withdrawalCooldown;

        emit WithdrawalRequested(msg.sender, amount, state.withdrawalReadyAt);
    }

    function completeWithdrawal() external nonReentrant {
        ProofOfVaultTypes.AgentStakeState storage state = _stakes[msg.sender];
        if (state.pendingWithdrawal == 0) revert InvalidAmount();
        if (block.timestamp < state.withdrawalReadyAt) {
            revert WithdrawalNotReady(state.withdrawalReadyAt);
        }

        uint256 amount = state.pendingWithdrawal;
        state.pendingWithdrawal = 0;
        state.withdrawalReadyAt = 0;
        totalAccountedStake -= amount;

        stakeToken.safeTransfer(msg.sender, amount);
        emit WithdrawalCompleted(msg.sender, amount);
    }

    function lockTaskBond(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role, uint256 amount)
        external
        onlyController
    {
        if (amount == 0) revert InvalidAmount();

        ProofOfVaultTypes.AgentStakeState storage state = _stakes[agent];
        uint256 freeStake = state.activeStake - state.lockedTaskStake;
        if (freeStake < amount) {
            revert InsufficientStake(amount, freeStake);
        }

        bytes32 key = _taskKey(agent, vaultId, role);
        ProofOfVaultTypes.TaskBondRecord storage taskBond = _taskBonds[key];
        if (taskBond.active) {
            revert TaskBondAlreadyLocked(agent, vaultId, role);
        }

        taskBond.amount = amount;
        taskBond.slashedAmount = 0;
        taskBond.active = true;
        state.lockedTaskStake += amount;

        emit TaskBondLocked(agent, vaultId, role, amount);
    }

    function releaseTaskBond(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role)
        external
        onlyController
    {
        bytes32 key = _taskKey(agent, vaultId, role);
        ProofOfVaultTypes.TaskBondRecord storage taskBond = _taskBonds[key];
        if (!taskBond.active) {
            revert TaskBondNotFound(agent, vaultId, role);
        }

        uint256 remaining = taskBond.amount - taskBond.slashedAmount;
        _stakes[agent].lockedTaskStake -= remaining;
        delete _taskBonds[key];

        emit TaskBondReleased(agent, vaultId, role, remaining);
    }

    function slashTaskBond(
        address agent,
        uint256 vaultId,
        ProofOfVaultTypes.CommitteeRole role,
        uint256 amount,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        address receiver,
        bytes32 incidentHash
    ) external onlyController nonReentrant {
        if (receiver == address(0)) revert InvalidReceiver(address(0));
        if (amount == 0) revert InvalidAmount();
        if (incidentHash == bytes32(0)) revert InvalidIncidentHash();
        if (consumedIncidents[incidentHash]) revert DuplicateIncident(incidentHash);

        bytes32 key = _taskKey(agent, vaultId, role);
        ProofOfVaultTypes.TaskBondRecord storage taskBond = _taskBonds[key];
        if (!taskBond.active) {
            revert TaskBondNotFound(agent, vaultId, role);
        }

        uint256 remaining = taskBond.amount - taskBond.slashedAmount;
        if (remaining < amount) {
            revert InsufficientStake(amount, remaining);
        }

        consumedIncidents[incidentHash] = true;
        taskBond.slashedAmount += amount;

        ProofOfVaultTypes.AgentStakeState storage state = _stakes[agent];
        state.activeStake -= amount;
        state.lockedTaskStake -= amount;
        totalAccountedStake -= amount;

        stakeToken.safeTransfer(receiver, amount);

        emit TaskBondSlashed(agent, vaultId, role, receiver, amount, reasonCode, incidentHash);
    }

    function slashAgent(address agent, uint256 amount, ProofOfVaultTypes.SlashReasonCode reasonCode, address receiver)
        external
        nonReentrant
    {
        if (!authorizedSlashers[msg.sender]) {
            revert NotAuthorizedSlasher(msg.sender);
        }
        if (amount == 0) revert InvalidAmount();
        if (receiver == address(0)) revert InvalidReceiver(address(0));

        ProofOfVaultTypes.AgentStakeState storage state = _stakes[agent];
        uint256 freeStake = state.activeStake - state.lockedTaskStake;
        uint256 available = freeStake + state.pendingWithdrawal;
        if (available < amount) {
            revert InsufficientStake(amount, available);
        }

        uint256 remaining = amount;
        if (freeStake >= remaining) {
            state.activeStake -= remaining;
        } else {
            state.activeStake -= freeStake;
            remaining -= freeStake;
            state.pendingWithdrawal -= remaining;
            if (state.pendingWithdrawal == 0) {
                state.withdrawalReadyAt = 0;
            }
        }

        totalAccountedStake -= amount;
        stakeToken.safeTransfer(receiver, amount);

        emit AgentSlashed(agent, receiver, amount, reasonCode);
    }

    function activeStakeOf(address agent) external view returns (uint256) {
        return _stakes[agent].activeStake;
    }

    function freeStakeOf(address agent) external view override returns (uint256) {
        ProofOfVaultTypes.AgentStakeState storage state = _stakes[agent];
        return state.activeStake - state.lockedTaskStake;
    }

    function pendingWithdrawalOf(address agent) external view returns (uint256 amount, uint64 readyAt) {
        ProofOfVaultTypes.AgentStakeState storage state = _stakes[agent];
        return (state.pendingWithdrawal, state.withdrawalReadyAt);
    }

    function taskBondOf(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role)
        external
        view
        override
        returns (ProofOfVaultTypes.TaskBondRecord memory)
    {
        return _taskBonds[_taskKey(agent, vaultId, role)];
    }

    function isActiveAgent(address agent) external view override returns (bool) {
        return _stakes[agent].activeStake > 0;
    }

    function _taskKey(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(agent, vaultId, role));
    }

    function _pullExact(address payer, uint256 amount) internal {
        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(payer, address(this), amount);
        uint256 received = stakeToken.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert InvalidTokenTransfer(received, amount);
    }
}
