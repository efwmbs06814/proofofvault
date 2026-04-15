// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "../interfaces/IERC20.sol";
import {IAgentStaking} from "../interfaces/IAgentStaking.sol";
import {IFeeManager} from "../interfaces/IFeeManager.sol";
import {SafeTransferLib} from "../utils/SafeTransferLib.sol";
import {ProofOfVaultTypes} from "./ProofOfVaultTypes.sol";
import {CommitteeRegistry} from "../CommitteeRegistry.sol";
import {ResolutionRegistry} from "../ResolutionRegistry.sol";
import {RewardPool} from "../RewardPool.sol";
import {VaultEscrow} from "../VaultEscrow.sol";

library VaultFactoryRuleLib {
    using SafeTransferLib for IERC20;

    uint8 internal constant MAX_RULE_REJECTIONS = 1;

    error InvalidAddress(address account);
    error InvalidAmount();
    error InvalidTokenTransfer(uint256 received, uint256 expected);
    error InvalidSettlementTime(uint64 settlementTime);
    error InvalidCriteriaHash();
    error InvalidMetadataURI();
    error InvalidVaultId(uint256 vaultId);
    error InvalidCommitteePhase(uint256 vaultId, ProofOfVaultTypes.VaultStatus status);
    error InvalidCommitteeMember(address caller, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role);
    error InvalidRole();
    error CallerNotSetter(address caller, uint256 vaultId);
    error RuleSetNotReady(uint256 vaultId);
    error RuleSetUnavailable(uint256 vaultId);
    error DuplicateRewardRecipient(address recipient);

    event VaultRequestCreated(
        uint256 indexed vaultId,
        address indexed setter,
        address indexed collateralToken,
        uint256 grossCollateralAmount,
        uint64 settlementTime,
        uint256 setupDepositAmount,
        string metadataURI
    );
    event RuleCommitteeRegistered(
        uint256 indexed vaultId,
        uint8 indexed round,
        address[] makers,
        address[] verifiers,
        uint64 draftDeadline,
        uint64 issueDeadline
    );
    event RuleDraftSubmitted(
        uint256 indexed vaultId, uint8 indexed round, address indexed maker, bytes32 draftHash, string payloadURI
    );
    event RuleIssueSubmitted(
        uint256 indexed vaultId,
        uint8 indexed round,
        address indexed verifier,
        ProofOfVaultTypes.IssueSeverity severity,
        bytes32 issueHash,
        string payloadURI
    );
    event RuleSetFinalized(uint256 indexed vaultId, uint8 indexed round, bytes32 criteriaHash, string metadataURI);
    event RuleSetRejected(uint256 indexed vaultId, uint8 indexed round, uint8 rejectionCount, string reasonURI);
    event RuleSetAccepted(
        uint256 indexed vaultId, uint8 indexed round, uint256 resolutionRewardDeposit, bytes32 criteriaHash
    );

    function createVaultRequest(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        uint256 vaultId,
        address setter,
        address collateralToken,
        uint256 grossCollateralAmount,
        uint256 setupDeposit,
        uint64 settlementTime,
        string calldata metadataURI
    ) public {
        if (collateralToken == address(0)) revert InvalidAddress(address(0));
        if (grossCollateralAmount == 0) revert InvalidAmount();
        if (bytes(metadataURI).length == 0) revert InvalidMetadataURI();
        if (settlementTime <= block.timestamp) revert InvalidSettlementTime(settlementTime);

        vaults[vaultId] = ProofOfVaultTypes.VaultRecord({
            setter: setter,
            collateralToken: collateralToken,
            grossCollateralAmount: grossCollateralAmount,
            lockedCollateralAmount: 0,
            setupDepositAmount: setupDeposit,
            resolutionRewardDepositAmount: 0,
            settlementTime: settlementTime,
            createdAt: uint64(block.timestamp),
            activatedAt: 0,
            criteriaHash: bytes32(0),
            metadataURI: metadataURI,
            status: ProofOfVaultTypes.VaultStatus.RuleAuction,
            legacyMode: false,
            ruleSetAccepted: false,
            ruleRound: 0,
            resolutionRound: 0,
            rejectionCount: 0
        });

        emit VaultRequestCreated(
            vaultId, setter, collateralToken, grossCollateralAmount, settlementTime, setupDeposit, metadataURI
        );
    }

    function registerRuleCommittee(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        CommitteeRegistry committeeRegistry,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        address[] calldata makers,
        address[] calldata verifiers,
        uint64 draftDeadline,
        uint64 issueDeadline
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.RuleAuction
                && vault.status != ProofOfVaultTypes.VaultStatus.DraftRequest
        ) revert InvalidCommitteePhase(vaultId, vault.status);

        vault.ruleRound += 1;
        committeeRegistry.registerRuleCommittee(
            vaultId, vault.ruleRound, makers, verifiers, draftDeadline, issueDeadline
        );

        uint256 makerBond = feeManager.bondForRole(ProofOfVaultTypes.CommitteeRole.RuleMaker);
        uint256 verifierBond = feeManager.bondForRole(ProofOfVaultTypes.CommitteeRole.RuleVerifier);

        for (uint256 i = 0; i < makers.length; i++) {
            agentStaking.lockTaskBond(makers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker, makerBond);
        }
        for (uint256 i = 0; i < verifiers.length; i++) {
            agentStaking.lockTaskBond(verifiers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier, verifierBond);
        }

        vault.status = ProofOfVaultTypes.VaultStatus.RuleDrafting;
        emit RuleCommitteeRegistered(vaultId, vault.ruleRound, makers, verifiers, draftDeadline, issueDeadline);
    }

    function submitRuleDraft(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        mapping(
            uint256 vaultId => mapping(uint8 round => mapping(address maker => ProofOfVaultTypes.RuleDraftRecord draft))
        ) storage ruleDrafts,
        CommitteeRegistry committeeRegistry,
        uint256 vaultId,
        bytes32 draftHash,
        string calldata payloadURI
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.RuleDrafting) {
            revert InvalidCommitteePhase(vaultId, vault.status);
        }
        if (committeeRegistry.ruleRoleOf(vaultId, msg.sender) != ProofOfVaultTypes.CommitteeRole.RuleMaker) {
            revert InvalidCommitteeMember(msg.sender, vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker);
        }
        if (draftHash == bytes32(0)) revert InvalidCriteriaHash();
        if (bytes(payloadURI).length == 0) revert InvalidMetadataURI();

        ruleDrafts[vaultId][vault.ruleRound][msg.sender] = ProofOfVaultTypes.RuleDraftRecord({
            draftHash: draftHash, payloadURI: payloadURI, submittedAt: uint64(block.timestamp), submitted: true
        });

        emit RuleDraftSubmitted(vaultId, vault.ruleRound, msg.sender, draftHash, payloadURI);
    }

    function submitRuleIssue(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        mapping(
            uint256 vaultId
                => mapping(uint8 round => mapping(address verifier => ProofOfVaultTypes.RuleIssueRecord issue))
        ) storage ruleIssues,
        CommitteeRegistry committeeRegistry,
        uint256 vaultId,
        ProofOfVaultTypes.IssueSeverity severity,
        bytes32 issueHash,
        string calldata payloadURI
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.RuleDrafting) {
            revert InvalidCommitteePhase(vaultId, vault.status);
        }
        if (committeeRegistry.ruleRoleOf(vaultId, msg.sender) != ProofOfVaultTypes.CommitteeRole.RuleVerifier) {
            revert InvalidCommitteeMember(msg.sender, vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier);
        }
        if (severity == ProofOfVaultTypes.IssueSeverity.None) revert InvalidRole();
        if (issueHash == bytes32(0)) revert InvalidCriteriaHash();
        if (bytes(payloadURI).length == 0) revert InvalidMetadataURI();

        ruleIssues[vaultId][vault.ruleRound][msg.sender] = ProofOfVaultTypes.RuleIssueRecord({
            severity: severity,
            issueHash: issueHash,
            payloadURI: payloadURI,
            submittedAt: uint64(block.timestamp),
            submitted: true
        });

        emit RuleIssueSubmitted(vaultId, vault.ruleRound, msg.sender, severity, issueHash, payloadURI);
    }

    function finalizeRuleSet(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        mapping(
            uint256 vaultId => mapping(uint8 round => mapping(address maker => ProofOfVaultTypes.RuleDraftRecord draft))
        ) storage ruleDrafts,
        mapping(
            uint256 vaultId
                => mapping(uint8 round => mapping(address verifier => ProofOfVaultTypes.RuleIssueRecord issue))
        ) storage ruleIssues,
        mapping(uint256 vaultId => string uri) storage pendingRuleMetadataURI,
        CommitteeRegistry committeeRegistry,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        RewardPool rewardPool,
        uint256 vaultId,
        bytes32 criteriaHash,
        string calldata metadataURI,
        address[] calldata approvedMakers,
        address[] calldata acceptedVerifiers,
        address[] calldata maliciousMakers,
        address[] calldata maliciousVerifiers
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.RuleDrafting) {
            revert InvalidCommitteePhase(vaultId, vault.status);
        }
        if (criteriaHash == bytes32(0)) revert InvalidCriteriaHash();
        if (bytes(metadataURI).length == 0) revert InvalidMetadataURI();

        vault.criteriaHash = criteriaHash;
        pendingRuleMetadataURI[vaultId] = metadataURI;

        _allocateRuleRoundRewards(
            committeeRegistry,
            feeManager,
            rewardPool,
            ruleDrafts,
            ruleIssues,
            vaultId,
            vault.ruleRound,
            approvedMakers,
            acceptedVerifiers
        );
        _slashRuleParticipants(
            agentStaking,
            feeManager,
            vaultId,
            vault.ruleRound,
            maliciousMakers,
            ProofOfVaultTypes.CommitteeRole.RuleMaker,
            ProofOfVaultTypes.SlashReasonCode.InvalidRuleSet
        );
        _slashRuleParticipants(
            agentStaking,
            feeManager,
            vaultId,
            vault.ruleRound,
            maliciousVerifiers,
            ProofOfVaultTypes.CommitteeRole.RuleVerifier,
            ProofOfVaultTypes.SlashReasonCode.VerifierMisconduct
        );
        _slashMissingRuleSubmissions(
            agentStaking, committeeRegistry, feeManager, ruleDrafts, ruleIssues, vaultId, vault.ruleRound
        );
        _releaseRuleCommittee(agentStaking, committeeRegistry, vaultId);
        committeeRegistry.clearRuleCommittee(vaultId);

        vault.status = ProofOfVaultTypes.VaultStatus.UserRuleReview;
        emit RuleSetFinalized(vaultId, vault.ruleRound, criteriaHash, metadataURI);
    }

    function rejectRuleSet(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        mapping(uint256 vaultId => string uri) storage pendingRuleMetadataURI,
        RewardPool rewardPool,
        uint256 vaultId,
        string calldata reasonURI
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (msg.sender != vault.setter) revert CallerNotSetter(msg.sender, vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.UserRuleReview) revert RuleSetNotReady(vaultId);
        if (bytes(reasonURI).length == 0) revert InvalidMetadataURI();

        vault.rejectionCount += 1;
        delete pendingRuleMetadataURI[vaultId];
        vault.criteriaHash = bytes32(0);

        if (vault.rejectionCount > MAX_RULE_REJECTIONS) {
            uint256 refundAmount = rewardPool.vaultBalanceOf(vaultId).setupDepositBalance;
            if (refundAmount > 0) {
                rewardPool.refundSetupDeposit(vaultId, vault.setter, refundAmount);
            }
            vault.status = ProofOfVaultTypes.VaultStatus.Cancelled;
        } else {
            vault.status = ProofOfVaultTypes.VaultStatus.RuleAuction;
        }

        emit RuleSetRejected(vaultId, vault.ruleRound, vault.rejectionCount, reasonURI);
    }

    function acceptRuleSetAndFund(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        mapping(
            uint256 vaultId => string uri
        ) storage pendingRuleMetadataURI,
        RewardPool rewardPool,
        IFeeManager feeManager,
        ResolutionRegistry resolutionRegistry,
        VaultEscrow vaultEscrow,
        uint256 vaultId
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (msg.sender != vault.setter) revert CallerNotSetter(msg.sender, vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.UserRuleReview) revert RuleSetNotReady(vaultId);
        if (vault.criteriaHash == bytes32(0) || bytes(pendingRuleMetadataURI[vaultId]).length == 0) {
            revert RuleSetUnavailable(vaultId);
        }

        uint256 rewardDeposit = feeManager.previewResolutionRewardDeposit();
        rewardPool.collectResolutionRewardDeposit(vaultId, msg.sender, rewardDeposit);

        uint256 creationFee = feeManager.previewCreationFee(vault.grossCollateralAmount);
        uint256 lockedCollateralAmount = vault.grossCollateralAmount - creationFee;
        if (lockedCollateralAmount == 0) revert InvalidAmount();

        IERC20 collateral = IERC20(vault.collateralToken);
        if (creationFee > 0) {
            _transferFromExact(collateral, msg.sender, feeManager.treasury(), creationFee);
        }
        _transferFromExact(collateral, msg.sender, address(vaultEscrow), lockedCollateralAmount);

        vaultEscrow.lockCollateral(vaultId, vault.setter, vault.collateralToken, lockedCollateralAmount);
        resolutionRegistry.registerCriteria(vaultId, vault.criteriaHash, pendingRuleMetadataURI[vaultId], msg.sender);

        vault.lockedCollateralAmount = lockedCollateralAmount;
        vault.resolutionRewardDepositAmount = rewardDeposit;
        vault.ruleSetAccepted = true;
        vault.activatedAt = uint64(block.timestamp);
        vault.status = ProofOfVaultTypes.VaultStatus.Active;

        RewardPool.VaultBalance memory balances = rewardPool.vaultBalanceOf(vaultId);
        if (balances.setupDepositBalance > 0) {
            rewardPool.payTreasuryFromSetup(vaultId, balances.setupDepositBalance);
        }

        emit RuleSetAccepted(vaultId, vault.ruleRound, rewardDeposit, vault.criteriaHash);
    }

    function _getVault(mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults, uint256 vaultId)
        private
        view
        returns (ProofOfVaultTypes.VaultRecord storage vault)
    {
        vault = vaults[vaultId];
        if (vault.setter == address(0)) revert InvalidVaultId(vaultId);
    }

    function _allocateRuleRoundRewards(
        CommitteeRegistry committeeRegistry,
        IFeeManager feeManager,
        RewardPool rewardPool,
        mapping(
            uint256 vaultId => mapping(uint8 round => mapping(address maker => ProofOfVaultTypes.RuleDraftRecord draft))
        ) storage ruleDrafts,
        mapping(
            uint256 vaultId
                => mapping(uint8 round => mapping(address verifier => ProofOfVaultTypes.RuleIssueRecord issue))
        ) storage ruleIssues,
        uint256 vaultId,
        uint8 round,
        address[] calldata approvedMakers,
        address[] calldata acceptedVerifiers
    ) private {
        address[] memory makers = committeeRegistry.ruleMakersOf(vaultId);
        for (uint256 i = 0; i < makers.length; i++) {
            if (ruleDrafts[vaultId][round][makers[i]].submitted) {
                _allocateSetupRewardCapped(rewardPool, vaultId, makers[i], feeManager.ruleMakerBaseReward());
            }
        }

        for (uint256 i = 0; i < approvedMakers.length; i++) {
            if (_containsAddressBefore(approvedMakers, i, approvedMakers[i])) {
                revert DuplicateRewardRecipient(approvedMakers[i]);
            }
            if (committeeRegistry.ruleRoleOf(vaultId, approvedMakers[i]) != ProofOfVaultTypes.CommitteeRole.RuleMaker) {
                revert InvalidCommitteeMember(approvedMakers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker);
            }
            if (!ruleDrafts[vaultId][round][approvedMakers[i]].submitted) {
                revert InvalidCommitteeMember(approvedMakers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker);
            }
            _allocateSetupRewardCapped(
                rewardPool, vaultId, approvedMakers[i], feeManager.ruleMakerApprovalBonusReward()
            );
        }

        for (uint256 i = 0; i < acceptedVerifiers.length; i++) {
            if (_containsAddressBefore(acceptedVerifiers, i, acceptedVerifiers[i])) {
                revert DuplicateRewardRecipient(acceptedVerifiers[i]);
            }
            if (
                committeeRegistry.ruleRoleOf(vaultId, acceptedVerifiers[i])
                    != ProofOfVaultTypes.CommitteeRole.RuleVerifier
            ) {
                revert InvalidCommitteeMember(
                    acceptedVerifiers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier
                );
            }
            ProofOfVaultTypes.RuleIssueRecord memory issueRecord = ruleIssues[vaultId][round][acceptedVerifiers[i]];
            if (issueRecord.submitted) {
                _allocateSetupRewardCapped(
                    rewardPool, vaultId, acceptedVerifiers[i], feeManager.ruleVerifierReward(issueRecord.severity)
                );
            } else {
                revert InvalidCommitteeMember(
                    acceptedVerifiers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier
                );
            }
        }
    }

    function _slashRuleParticipants(
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        uint8 round,
        address[] calldata participants,
        ProofOfVaultTypes.CommitteeRole role,
        ProofOfVaultTypes.SlashReasonCode reasonCode
    ) private {
        for (uint256 i = 0; i < participants.length; i++) {
            ProofOfVaultTypes.TaskBondRecord memory taskBond = agentStaking.taskBondOf(participants[i], vaultId, role);
            uint256 remainingBond = taskBond.amount - taskBond.slashedAmount;
            if (remainingBond == 0) continue;

            bytes32 incidentHash =
                keccak256(abi.encode("rule-participant-slash", vaultId, round, participants[i], role));
            agentStaking.slashTaskBond(
                participants[i], vaultId, role, remainingBond, reasonCode, feeManager.treasury(), incidentHash
            );
        }
    }

    function _slashMissingRuleSubmissions(
        IAgentStaking agentStaking,
        CommitteeRegistry committeeRegistry,
        IFeeManager feeManager,
        mapping(
            uint256 vaultId => mapping(uint8 round => mapping(address maker => ProofOfVaultTypes.RuleDraftRecord draft))
        ) storage ruleDrafts,
        mapping(
            uint256 vaultId
                => mapping(uint8 round => mapping(address verifier => ProofOfVaultTypes.RuleIssueRecord issue))
        ) storage ruleIssues,
        uint256 vaultId,
        uint8 round
    ) private {
        address[] memory makers = committeeRegistry.ruleMakersOf(vaultId);
        address[] memory verifiers = committeeRegistry.ruleVerifiersOf(vaultId);

        for (uint256 i = 0; i < makers.length; i++) {
            if (!ruleDrafts[vaultId][round][makers[i]].submitted) {
                _slashRemainingTaskBond(
                    agentStaking,
                    feeManager,
                    makers[i],
                    vaultId,
                    round,
                    ProofOfVaultTypes.CommitteeRole.RuleMaker,
                    ProofOfVaultTypes.SlashReasonCode.NonParticipation,
                    "missing-rule-draft"
                );
            }
        }

        for (uint256 i = 0; i < verifiers.length; i++) {
            if (!ruleIssues[vaultId][round][verifiers[i]].submitted) {
                _slashRemainingTaskBond(
                    agentStaking,
                    feeManager,
                    verifiers[i],
                    vaultId,
                    round,
                    ProofOfVaultTypes.CommitteeRole.RuleVerifier,
                    ProofOfVaultTypes.SlashReasonCode.NonParticipation,
                    "missing-rule-issue"
                );
            }
        }
    }

    function _slashRemainingTaskBond(
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        address participant,
        uint256 vaultId,
        uint8 round,
        ProofOfVaultTypes.CommitteeRole role,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        string memory incidentLabel
    ) private {
        ProofOfVaultTypes.TaskBondRecord memory taskBond = agentStaking.taskBondOf(participant, vaultId, role);
        uint256 remainingBond = taskBond.amount - taskBond.slashedAmount;
        if (remainingBond == 0) return;

        bytes32 incidentHash = keccak256(abi.encode(incidentLabel, vaultId, round, participant, role));
        agentStaking.slashTaskBond(
            participant, vaultId, role, remainingBond, reasonCode, feeManager.treasury(), incidentHash
        );
    }

    function _containsAddressBefore(address[] calldata accounts, uint256 index, address target)
        private
        pure
        returns (bool)
    {
        for (uint256 i = 0; i < index; i++) {
            if (accounts[i] == target) return true;
        }
        return false;
    }

    function _releaseRuleCommittee(IAgentStaking agentStaking, CommitteeRegistry committeeRegistry, uint256 vaultId)
        private
    {
        address[] memory makers = committeeRegistry.ruleMakersOf(vaultId);
        address[] memory verifiers = committeeRegistry.ruleVerifiersOf(vaultId);

        for (uint256 i = 0; i < makers.length; i++) {
            _releaseTaskBondIfActive(agentStaking, makers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker);
        }
        for (uint256 i = 0; i < verifiers.length; i++) {
            _releaseTaskBondIfActive(agentStaking, verifiers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier);
        }
    }

    function _releaseTaskBondIfActive(
        IAgentStaking agentStaking,
        address agent,
        uint256 vaultId,
        ProofOfVaultTypes.CommitteeRole role
    ) private {
        ProofOfVaultTypes.TaskBondRecord memory taskBond = agentStaking.taskBondOf(agent, vaultId, role);
        if (taskBond.active) {
            agentStaking.releaseTaskBond(agent, vaultId, role);
        }
    }

    function _allocateSetupRewardCapped(RewardPool rewardPool, uint256 vaultId, address recipient, uint256 amount)
        private
    {
        if (amount == 0) return;
        uint256 available = rewardPool.vaultBalanceOf(vaultId).setupDepositBalance;
        if (available == 0) return;

        uint256 payout = amount > available ? available : amount;
        rewardPool.allocateSetupReward(vaultId, recipient, payout);
    }

    function _transferFromExact(IERC20 token, address from, address to, uint256 amount) private {
        uint256 balanceBefore = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        uint256 received = token.balanceOf(to) - balanceBefore;
        if (received != amount) revert InvalidTokenTransfer(received, amount);
    }
}
