// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAgentStaking} from "../interfaces/IAgentStaking.sol";
import {IFeeManager} from "../interfaces/IFeeManager.sol";
import {ProofOfVaultTypes} from "./ProofOfVaultTypes.sol";
import {CommitteeRegistry} from "../CommitteeRegistry.sol";
import {ResolutionRegistry} from "../ResolutionRegistry.sol";
import {RewardPool} from "../RewardPool.sol";
import {VaultEscrow} from "../VaultEscrow.sol";

library VaultFactoryResolutionLib {
    uint8 internal constant MAX_RESOLUTION_ROUNDS = 2;
    uint256 internal constant MAX_CHALLENGES_PER_ROUND = 20;

    error InvalidVaultId(uint256 vaultId);
    error InvalidCommitteePhase(uint256 vaultId, ProofOfVaultTypes.VaultStatus status);
    error InvalidCommitteeMember(address caller, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role);
    error InvalidChallengeWindow(uint256 vaultId);
    error VaultNotReadyForResolution(uint256 vaultId);
    error ResolutionNotReady(uint256 vaultId);
    error ChallengeTargetNotAllowed(address target);
    error CurrentCommitteeMemberCannotChallenge(address caller, uint256 vaultId);
    error CallerNotActiveAgent(address caller);
    error UnresolvedChallenges(uint256 vaultId);
    error TooManyChallenges(uint256 vaultId, uint8 round, uint256 challengeCount);

    event ResolutionCommitteeRegistered(
        uint256 indexed vaultId,
        uint8 indexed round,
        address[] validators,
        address[] auditors,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 auditDeadline,
        uint64 challengeDeadline,
        uint8 minValidCount
    );
    event ResolutionCommitted(
        uint256 indexed vaultId, uint8 indexed round, address indexed validator, bytes32 commitHash
    );
    event ResolutionRevealed(
        uint256 indexed vaultId,
        uint8 indexed round,
        address indexed validator,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        string payloadURI,
        bool disqualified
    );
    event AuditVerdictSubmitted(
        uint256 indexed vaultId,
        uint8 indexed round,
        address indexed validator,
        address auditor,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string payloadURI
    );
    event PublicChallengeOpened(
        uint256 indexed vaultId,
        uint8 indexed round,
        uint256 indexed challengeId,
        address challenger,
        address target,
        bytes32 challengeHash,
        string payloadURI,
        uint256 bondAmount
    );
    event PublicChallengeResolved(
        uint256 indexed vaultId, uint8 indexed round, uint256 indexed challengeId, bool successful
    );
    event ResolutionRoundReopened(uint256 indexed vaultId, uint8 indexed nextRound);
    event VaultFinalized(
        uint256 indexed vaultId,
        ProofOfVaultTypes.ResolutionOutcome indexed outcome,
        bytes32 resolutionHash,
        address indexed submittedBy,
        uint256 settlementFee
    );

    function registerResolutionCommittee(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        CommitteeRegistry committeeRegistry,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        address[] calldata validators,
        address[] calldata auditors,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 auditDeadline,
        uint64 challengeDeadline,
        uint8 minValidCount
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.Active
                && vault.status != ProofOfVaultTypes.VaultStatus.ResolutionAuction
        ) revert InvalidCommitteePhase(vaultId, vault.status);
        if (block.timestamp < vault.settlementTime) revert VaultNotReadyForResolution(vaultId);

        vault.resolutionRound += 1;
        committeeRegistry.registerResolutionCommittee(
            vaultId,
            vault.resolutionRound,
            validators,
            auditors,
            commitDeadline,
            revealDeadline,
            auditDeadline,
            challengeDeadline,
            minValidCount
        );

        uint256 validatorBond = feeManager.bondForRole(ProofOfVaultTypes.CommitteeRole.ResolutionValidator);
        uint256 auditorBond = feeManager.bondForRole(ProofOfVaultTypes.CommitteeRole.ResolutionAuditor);

        for (uint256 i = 0; i < validators.length; i++) {
            agentStaking.lockTaskBond(
                validators[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator, validatorBond
            );
        }
        for (uint256 i = 0; i < auditors.length; i++) {
            agentStaking.lockTaskBond(
                auditors[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionAuditor, auditorBond
            );
        }

        vault.status = ProofOfVaultTypes.VaultStatus.CommitPhase;
        emit ResolutionCommitteeRegistered(
            vaultId,
            vault.resolutionRound,
            validators,
            auditors,
            commitDeadline,
            revealDeadline,
            auditDeadline,
            challengeDeadline,
            minValidCount
        );
    }

    function commitResolution(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        CommitteeRegistry committeeRegistry,
        ResolutionRegistry resolutionRegistry,
        uint256 vaultId,
        bytes32 commitHash
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (
            committeeRegistry.resolutionRoleOf(vaultId, msg.sender)
                != ProofOfVaultTypes.CommitteeRole.ResolutionValidator
        ) revert InvalidCommitteeMember(msg.sender, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.CommitPhase) {
            revert InvalidCommitteePhase(vaultId, vault.status);
        }
        if (block.timestamp > config.commitDeadline) revert InvalidChallengeWindow(vaultId);

        resolutionRegistry.recordCommit(vaultId, vault.resolutionRound, msg.sender, commitHash);
        emit ResolutionCommitted(vaultId, vault.resolutionRound, msg.sender, commitHash);
    }

    function revealResolution(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        CommitteeRegistry committeeRegistry,
        ResolutionRegistry resolutionRegistry,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        bytes32 salt,
        string calldata payloadURI
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (
            committeeRegistry.resolutionRoleOf(vaultId, msg.sender)
                != ProofOfVaultTypes.CommitteeRole.ResolutionValidator
        ) revert InvalidCommitteeMember(msg.sender, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (block.timestamp <= config.commitDeadline || block.timestamp > config.revealDeadline) {
            revert InvalidChallengeWindow(vaultId);
        }

        if (vault.status == ProofOfVaultTypes.VaultStatus.CommitPhase) {
            vault.status = ProofOfVaultTypes.VaultStatus.RevealPhase;
        } else if (vault.status != ProofOfVaultTypes.VaultStatus.RevealPhase) {
            revert InvalidCommitteePhase(vaultId, vault.status);
        }

        ProofOfVaultTypes.CommitRecord memory commitRecord =
            resolutionRegistry.commitOf(vaultId, vault.resolutionRound, msg.sender);
        bytes32 expectedCommit = keccak256(abi.encode(vaultId, msg.sender, outcome, proofHash, salt));
        bool disqualified = expectedCommit != commitRecord.commitHash;

        if (disqualified) {
            bytes32 incidentHash = keccak256(
                abi.encode("commit-reveal-mismatch", vaultId, msg.sender, commitRecord.commitHash, expectedCommit)
            );
            ProofOfVaultTypes.TaskBondRecord memory bond =
                agentStaking.taskBondOf(msg.sender, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator);
            uint256 slashAmount = bond.amount - bond.slashedAmount;
            if (slashAmount > 0) {
                agentStaking.slashTaskBond(
                    msg.sender,
                    vaultId,
                    ProofOfVaultTypes.CommitteeRole.ResolutionValidator,
                    slashAmount,
                    ProofOfVaultTypes.SlashReasonCode.CommitRevealMismatch,
                    feeManager.treasury(),
                    incidentHash
                );
            }
        } else {
            feeManager.collectProofFee(msg.sender);
        }

        resolutionRegistry.recordReveal(
            vaultId, vault.resolutionRound, msg.sender, outcome, proofHash, payloadURI, disqualified
        );
        emit ResolutionRevealed(
            vaultId, vault.resolutionRound, msg.sender, outcome, proofHash, payloadURI, disqualified
        );
    }

    function submitAuditVerdict(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        CommitteeRegistry committeeRegistry,
        ResolutionRegistry resolutionRegistry,
        uint256 vaultId,
        address validator,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string calldata payloadURI
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (
            committeeRegistry.resolutionRoleOf(vaultId, msg.sender) != ProofOfVaultTypes.CommitteeRole.ResolutionAuditor
        ) revert InvalidCommitteeMember(msg.sender, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionAuditor);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (block.timestamp <= config.revealDeadline || block.timestamp > config.auditDeadline) {
            revert InvalidChallengeWindow(vaultId);
        }

        if (vault.status == ProofOfVaultTypes.VaultStatus.RevealPhase) {
            vault.status = ProofOfVaultTypes.VaultStatus.AuditPhase;
        } else if (vault.status != ProofOfVaultTypes.VaultStatus.AuditPhase) {
            revert InvalidCommitteePhase(vaultId, vault.status);
        }

        resolutionRegistry.recordAuditVerdict(
            vaultId, vault.resolutionRound, validator, msg.sender, verdict, verdictHash, payloadURI
        );
        emit AuditVerdictSubmitted(
            vaultId, vault.resolutionRound, validator, msg.sender, verdict, verdictHash, payloadURI
        );
    }

    function openPublicChallenge(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        mapping(
            address member => bool allowed
        ) storage safetyCouncil,
        address owner,
        CommitteeRegistry committeeRegistry,
        ResolutionRegistry resolutionRegistry,
        RewardPool rewardPool,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        address target,
        bytes32 challengeHash,
        string calldata payloadURI
    ) public returns (uint256 challengeId) {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (block.timestamp <= config.auditDeadline || block.timestamp > config.challengeDeadline) {
            revert InvalidChallengeWindow(vaultId);
        }
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.AuditPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.PublicChallenge
        ) revert InvalidCommitteePhase(vaultId, vault.status);

        bool isResolutionMember = committeeRegistry.resolutionRoleOf(vaultId, target)
                == ProofOfVaultTypes.CommitteeRole.ResolutionValidator
            || committeeRegistry.resolutionRoleOf(vaultId, target) == ProofOfVaultTypes.CommitteeRole.ResolutionAuditor;
        if (!isResolutionMember) revert ChallengeTargetNotAllowed(target);

        ProofOfVaultTypes.CommitteeRole challengerRole = committeeRegistry.resolutionRoleOf(vaultId, msg.sender);
        bool isCurrentResolutionMember = challengerRole == ProofOfVaultTypes.CommitteeRole.ResolutionValidator
            || challengerRole == ProofOfVaultTypes.CommitteeRole.ResolutionAuditor;
        bool isPrivilegedChallenger = msg.sender == vault.setter || msg.sender == owner || safetyCouncil[msg.sender];
        if (isCurrentResolutionMember && !isPrivilegedChallenger) {
            revert CurrentCommitteeMemberCannotChallenge(msg.sender, vaultId);
        }

        bool isAllowedChallenger =
            isPrivilegedChallenger || (msg.sender != target && agentStaking.isActiveAgent(msg.sender));
        if (!isAllowedChallenger) revert CallerNotActiveAgent(msg.sender);

        uint256 openChallengeCount = resolutionRegistry.openChallengeCountOf(vaultId, vault.resolutionRound);
        if (openChallengeCount >= MAX_CHALLENGES_PER_ROUND) {
            revert TooManyChallenges(vaultId, vault.resolutionRound, openChallengeCount);
        }

        uint256 bondAmount = feeManager.previewChallengeBond();
        challengeId = resolutionRegistry.openChallenge(
            vaultId, vault.resolutionRound, msg.sender, target, challengeHash, payloadURI, bondAmount
        );
        rewardPool.collectChallengeBond(vaultId, challengeId, msg.sender, bondAmount);
        vault.status = ProofOfVaultTypes.VaultStatus.PublicChallenge;

        emit PublicChallengeOpened(
            vaultId, vault.resolutionRound, challengeId, msg.sender, target, challengeHash, payloadURI, bondAmount
        );
    }

    function resolveChallenge(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        CommitteeRegistry committeeRegistry,
        ResolutionRegistry resolutionRegistry,
        RewardPool rewardPool,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        uint256 challengeId,
        bool successful,
        ProofOfVaultTypes.CommitteeRole targetRole,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        uint256 slashAmount
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        ProofOfVaultTypes.ChallengeRecord memory challenge =
            resolutionRegistry.challengeOf(vaultId, vault.resolutionRound, challengeId);
        if (challenge.status != ProofOfVaultTypes.ChallengeStatus.Open) revert InvalidChallengeWindow(vaultId);

        ProofOfVaultTypes.CommitteeRole actualTargetRole = committeeRegistry.resolutionRoleOf(vaultId, challenge.target);
        if (
            actualTargetRole != ProofOfVaultTypes.CommitteeRole.ResolutionValidator
                && actualTargetRole != ProofOfVaultTypes.CommitteeRole.ResolutionAuditor
        ) revert ChallengeTargetNotAllowed(challenge.target);
        if (targetRole != ProofOfVaultTypes.CommitteeRole.None && targetRole != actualTargetRole) {
            revert ChallengeTargetNotAllowed(challenge.target);
        }
        reasonCode;
        slashAmount;
        agentStaking;

        if (successful) {
            resolutionRegistry.resolveChallenge(
                vaultId, vault.resolutionRound, challengeId, ProofOfVaultTypes.ChallengeStatus.ResolvedSuccess
            );
            rewardPool.refundChallengeBond(vaultId, challengeId, challenge.challenger, challenge.bondAmount);
            _allocateResolutionRewardCapped(
                rewardPool, vaultId, challenge.challenger, feeManager.challengerSuccessReward()
            );
        } else {
            resolutionRegistry.resolveChallenge(
                vaultId, vault.resolutionRound, challengeId, ProofOfVaultTypes.ChallengeStatus.ResolvedFailure
            );
            uint256 slashAmountFromBond = (challenge.bondAmount * feeManager.challengeFailureSlashBps()) / 10_000;
            uint256 refundAmount = challenge.bondAmount - slashAmountFromBond;
            if (refundAmount > 0) {
                rewardPool.refundChallengeBond(vaultId, challengeId, challenge.challenger, refundAmount);
            }
            if (slashAmountFromBond > 0) {
                rewardPool.sweepChallengeBondToTreasury(vaultId, challengeId, slashAmountFromBond);
            }
        }

        emit PublicChallengeResolved(vaultId, vault.resolutionRound, challengeId, successful);
    }

    function finalizeV2Vault(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        CommitteeRegistry committeeRegistry,
        ResolutionRegistry resolutionRegistry,
        RewardPool rewardPool,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        VaultEscrow vaultEscrow,
        address compensationPool,
        uint256 vaultId
    ) public {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaults, vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.CommitPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.RevealPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.AuditPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.PublicChallenge
        ) revert ResolutionNotReady(vaultId);

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (block.timestamp <= config.challengeDeadline) revert InvalidChallengeWindow(vaultId);
        if (_hasOpenChallenge(resolutionRegistry, vaultId, vault.resolutionRound)) {
            revert UnresolvedChallenges(vaultId);
        }

        address[] memory validators = committeeRegistry.resolutionValidatorsOf(vaultId);
        address[] memory auditors = committeeRegistry.resolutionAuditorsOf(vaultId);

        _slashMissingResolutionSubmissions(
            resolutionRegistry, agentStaking, feeManager, vaultId, vault.resolutionRound, validators, auditors
        );
        _slashChallengedAuditors(resolutionRegistry, agentStaking, feeManager, vaultId, vault.resolutionRound, auditors);

        (
            bool reachedConsensus,
            bool needsRetry,
            ProofOfVaultTypes.ResolutionOutcome finalOutcome,
            bytes32 resolutionHash,
            string memory payloadURI,
            address submittedBy
        ) = _evaluateConsensus(
            resolutionRegistry,
            agentStaking,
            feeManager,
            vaultId,
            vault.resolutionRound,
            validators,
            auditors,
            config.minValidCount
        );

        if (needsRetry && vault.resolutionRound < MAX_RESOLUTION_ROUNDS) {
            _releaseResolutionCommittee(agentStaking, committeeRegistry, vaultId);
            committeeRegistry.clearResolutionCommittee(vaultId);
            vault.status = ProofOfVaultTypes.VaultStatus.ResolutionAuction;
            emit ResolutionRoundReopened(vaultId, vault.resolutionRound + 1);
            return;
        }

        if (!reachedConsensus) {
            finalOutcome = ProofOfVaultTypes.ResolutionOutcome.Invalid;
            resolutionHash = keccak256(abi.encodePacked("invalid-consensus", vaultId, vault.resolutionRound));
            payloadURI = "protocol://invalid-consensus";
            submittedBy = msg.sender;
        }

        _distributeResolutionRewards(
            resolutionRegistry,
            rewardPool,
            feeManager,
            vaultId,
            vault.resolutionRound,
            finalOutcome,
            validators,
            auditors
        );
        _releaseResolutionCommittee(agentStaking, committeeRegistry, vaultId);
        committeeRegistry.clearResolutionCommittee(vaultId);

        uint256 settlementFee = finalOutcome == ProofOfVaultTypes.ResolutionOutcome.Invalid
            ? 0
            : feeManager.previewSettlementFee(vault.lockedCollateralAmount);
        _executeVaultOutcome(
            vaults,
            resolutionRegistry,
            vaultEscrow,
            compensationPool,
            feeManager,
            vaultId,
            finalOutcome,
            submittedBy,
            resolutionHash,
            payloadURI,
            settlementFee
        );

        RewardPool.VaultBalance memory balances = rewardPool.vaultBalanceOf(vaultId);
        if (balances.resolutionRewardBalance > 0) {
            rewardPool.payTreasuryFromResolution(vaultId, balances.resolutionRewardBalance);
        }
    }

    function _releaseResolutionCommittee(
        IAgentStaking agentStaking,
        CommitteeRegistry committeeRegistry,
        uint256 vaultId
    ) private {
        address[] memory validators = committeeRegistry.resolutionValidatorsOf(vaultId);
        address[] memory auditors = committeeRegistry.resolutionAuditorsOf(vaultId);

        for (uint256 i = 0; i < validators.length; i++) {
            _releaseTaskBondIfActive(
                agentStaking, validators[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator
            );
        }
        for (uint256 i = 0; i < auditors.length; i++) {
            _releaseTaskBondIfActive(
                agentStaking, auditors[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionAuditor
            );
        }
    }

    function _hasOpenChallenge(ResolutionRegistry resolutionRegistry, uint256 vaultId, uint8 round)
        private
        view
        returns (bool)
    {
        return resolutionRegistry.openChallengeCountOf(vaultId, round) > 0;
    }

    function _hasSuccessfulChallengeAgainst(
        ResolutionRegistry resolutionRegistry,
        uint256 vaultId,
        uint8 round,
        address target
    ) private view returns (bool) {
        return resolutionRegistry.hasSuccessfulChallengeAgainst(vaultId, round, target);
    }

    function _slashChallengedAuditors(
        ResolutionRegistry resolutionRegistry,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        uint8 round,
        address[] memory auditors
    ) private {
        for (uint256 i = 0; i < auditors.length; i++) {
            if (!_hasSuccessfulChallengeAgainst(resolutionRegistry, vaultId, round, auditors[i])) {
                continue;
            }

            ProofOfVaultTypes.TaskBondRecord memory taskBond =
                agentStaking.taskBondOf(auditors[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionAuditor);
            uint256 remainingBond = taskBond.amount - taskBond.slashedAmount;
            if (remainingBond == 0) continue;

            bytes32 incidentHash = keccak256(abi.encode("auditor-successful-challenge", vaultId, round, auditors[i]));
            agentStaking.slashTaskBond(
                auditors[i],
                vaultId,
                ProofOfVaultTypes.CommitteeRole.ResolutionAuditor,
                remainingBond,
                ProofOfVaultTypes.SlashReasonCode.ChallengeAbuse,
                feeManager.treasury(),
                incidentHash
            );
        }
    }

    function _slashMissingResolutionSubmissions(
        ResolutionRegistry resolutionRegistry,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        uint8 round,
        address[] memory validators,
        address[] memory auditors
    ) private {
        for (uint256 i = 0; i < validators.length; i++) {
            ProofOfVaultTypes.CommitRecord memory commitRecord =
                resolutionRegistry.commitOf(vaultId, round, validators[i]);
            ProofOfVaultTypes.RevealRecord memory revealRecord =
                resolutionRegistry.revealOf(vaultId, round, validators[i]);

            if (commitRecord.committedAt == 0 || !revealRecord.submitted) {
                _slashRemainingTaskBond(
                    agentStaking,
                    feeManager,
                    validators[i],
                    vaultId,
                    round,
                    ProofOfVaultTypes.CommitteeRole.ResolutionValidator,
                    ProofOfVaultTypes.SlashReasonCode.NonParticipation,
                    "missing-resolution-submission"
                );
            }
        }

        for (uint256 i = 0; i < auditors.length; i++) {
            (uint256 reviewedCount, uint256 requiredCount,) =
                _auditorCoverage(resolutionRegistry, vaultId, round, auditors[i], validators);
            if (requiredCount > 0 && reviewedCount < requiredCount) {
                _slashRemainingTaskBond(
                    agentStaking,
                    feeManager,
                    auditors[i],
                    vaultId,
                    round,
                    ProofOfVaultTypes.CommitteeRole.ResolutionAuditor,
                    ProofOfVaultTypes.SlashReasonCode.NonParticipation,
                    "missing-audit-verdict"
                );
            }
        }
    }

    function _auditorCoverage(
        ResolutionRegistry resolutionRegistry,
        uint256 vaultId,
        uint8 round,
        address auditor,
        address[] memory validators
    ) private view returns (uint256 reviewedCount, uint256 requiredCount, bool highValue) {
        for (uint256 i = 0; i < validators.length; i++) {
            ProofOfVaultTypes.RevealRecord memory revealRecord =
                resolutionRegistry.revealOf(vaultId, round, validators[i]);
            if (!revealRecord.submitted) continue;

            requiredCount += 1;

            ProofOfVaultTypes.AuditVerdictRecord memory record =
                resolutionRegistry.auditVerdictOf(vaultId, round, validators[i], auditor);
            if (!record.submitted) continue;

            reviewedCount += 1;
            if (
                record.verdict == ProofOfVaultTypes.AuditVerdict.Invalid
                    || record.verdict == ProofOfVaultTypes.AuditVerdict.Malicious
            ) {
                highValue = true;
            }
        }
    }

    function _evaluateConsensus(
        ResolutionRegistry resolutionRegistry,
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        uint8 round,
        address[] memory validators,
        address[] memory auditors,
        uint8 minValidCount
    )
        private
        returns (
            bool reachedConsensus,
            bool needsRetry,
            ProofOfVaultTypes.ResolutionOutcome finalOutcome,
            bytes32 resolutionHash,
            string memory payloadURI,
            address submittedBy
        )
    {
        uint256 validCount;
        uint256 trueCount;
        uint256 falseCount;
        uint256 invalidCount;
        bytes32 trueHash;
        bytes32 falseHash;
        bytes32 invalidHash;
        string memory trueURI;
        string memory falseURI;
        string memory invalidURI;
        address trueSubmitter;
        address falseSubmitter;
        address invalidSubmitter;

        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            ProofOfVaultTypes.CommitRecord memory commitRecord = resolutionRegistry.commitOf(vaultId, round, validator);
            ProofOfVaultTypes.RevealRecord memory revealRecord = resolutionRegistry.revealOf(vaultId, round, validator);

            if (!revealRecord.submitted || commitRecord.disqualified) continue;

            ProofOfVaultTypes.AuditVerdict verdict =
                _effectiveAuditVerdict(resolutionRegistry, vaultId, round, validator, auditors);
            if (_hasSuccessfulChallengeAgainst(resolutionRegistry, vaultId, round, validator)) {
                verdict = ProofOfVaultTypes.AuditVerdict.Malicious;
            }

            if (
                verdict == ProofOfVaultTypes.AuditVerdict.Malicious || verdict == ProofOfVaultTypes.AuditVerdict.Invalid
            ) {
                _slashResolutionValidator(agentStaking, feeManager, vaultId, round, validator, verdict);
                continue;
            }

            if (verdict == ProofOfVaultTypes.AuditVerdict.Valid) {
                validCount += 1;
                if (revealRecord.outcome == ProofOfVaultTypes.ResolutionOutcome.True) {
                    trueCount += 1;
                    if (trueHash == bytes32(0)) {
                        trueHash = revealRecord.proofHash;
                        trueURI = revealRecord.payloadURI;
                        trueSubmitter = validator;
                    }
                } else if (revealRecord.outcome == ProofOfVaultTypes.ResolutionOutcome.False) {
                    falseCount += 1;
                    if (falseHash == bytes32(0)) {
                        falseHash = revealRecord.proofHash;
                        falseURI = revealRecord.payloadURI;
                        falseSubmitter = validator;
                    }
                } else if (revealRecord.outcome == ProofOfVaultTypes.ResolutionOutcome.Invalid) {
                    invalidCount += 1;
                    if (invalidHash == bytes32(0)) {
                        invalidHash = revealRecord.proofHash;
                        invalidURI = revealRecord.payloadURI;
                        invalidSubmitter = validator;
                    }
                }
            }
        }

        if (validCount < minValidCount) {
            return (false, true, finalOutcome, resolutionHash, payloadURI, submittedBy);
        }
        if (trueCount * 3 > validCount * 2) {
            return (true, false, ProofOfVaultTypes.ResolutionOutcome.True, trueHash, trueURI, trueSubmitter);
        }
        if (falseCount * 3 > validCount * 2) {
            return (true, false, ProofOfVaultTypes.ResolutionOutcome.False, falseHash, falseURI, falseSubmitter);
        }
        if (invalidCount * 3 > validCount * 2) {
            return (true, false, ProofOfVaultTypes.ResolutionOutcome.Invalid, invalidHash, invalidURI, invalidSubmitter);
        }

        return (false, true, finalOutcome, resolutionHash, payloadURI, submittedBy);
    }

    function _effectiveAuditVerdict(
        ResolutionRegistry resolutionRegistry,
        uint256 vaultId,
        uint8 round,
        address validator,
        address[] memory auditors
    ) private view returns (ProofOfVaultTypes.AuditVerdict) {
        uint256 validCount;
        uint256 questionableCount;
        uint256 invalidCount;
        uint256 maliciousCount;
        uint256 consideredAuditors;

        for (uint256 i = 0; i < auditors.length; i++) {
            if (_hasSuccessfulChallengeAgainst(resolutionRegistry, vaultId, round, auditors[i])) continue;

            ProofOfVaultTypes.AuditVerdictRecord memory record =
                resolutionRegistry.auditVerdictOf(vaultId, round, validator, auditors[i]);
            if (!record.submitted) continue;

            consideredAuditors += 1;
            if (record.verdict == ProofOfVaultTypes.AuditVerdict.Valid) validCount += 1;
            if (record.verdict == ProofOfVaultTypes.AuditVerdict.Questionable) questionableCount += 1;
            if (record.verdict == ProofOfVaultTypes.AuditVerdict.Invalid) invalidCount += 1;
            if (record.verdict == ProofOfVaultTypes.AuditVerdict.Malicious) maliciousCount += 1;
        }

        if (consideredAuditors == 0) return ProofOfVaultTypes.AuditVerdict.Questionable;
        if (maliciousCount * 3 > consideredAuditors * 2) return ProofOfVaultTypes.AuditVerdict.Malicious;
        if (invalidCount * 3 > consideredAuditors * 2) return ProofOfVaultTypes.AuditVerdict.Invalid;
        if (validCount * 3 > consideredAuditors * 2) return ProofOfVaultTypes.AuditVerdict.Valid;
        if (questionableCount * 3 > consideredAuditors * 2) return ProofOfVaultTypes.AuditVerdict.Questionable;
        return ProofOfVaultTypes.AuditVerdict.Questionable;
    }

    function _slashResolutionValidator(
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        uint256 vaultId,
        uint8 round,
        address validator,
        ProofOfVaultTypes.AuditVerdict verdict
    ) private {
        ProofOfVaultTypes.TaskBondRecord memory taskBond = agentStaking.taskBondOf(
            validator, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator
        );
        uint256 remainingBond = taskBond.amount - taskBond.slashedAmount;
        if (remainingBond == 0) return;

        uint256 slashAmount = verdict == ProofOfVaultTypes.AuditVerdict.Malicious ? remainingBond : remainingBond / 2;
        if (slashAmount == 0) return;

        bytes32 incidentHash = keccak256(abi.encode("resolution-validator-verdict", vaultId, round, validator, verdict));
        agentStaking.slashTaskBond(
            validator,
            vaultId,
            ProofOfVaultTypes.CommitteeRole.ResolutionValidator,
            slashAmount,
            verdict == ProofOfVaultTypes.AuditVerdict.Malicious
                ? ProofOfVaultTypes.SlashReasonCode.MaliciousResolution
                : ProofOfVaultTypes.SlashReasonCode.InvalidProof,
            feeManager.treasury(),
            incidentHash
        );
    }

    function _distributeResolutionRewards(
        ResolutionRegistry resolutionRegistry,
        RewardPool rewardPool,
        IFeeManager feeManager,
        uint256 vaultId,
        uint8 round,
        ProofOfVaultTypes.ResolutionOutcome finalOutcome,
        address[] memory validators,
        address[] memory auditors
    ) private {
        for (uint256 i = 0; i < validators.length; i++) {
            if (_hasSuccessfulChallengeAgainst(resolutionRegistry, vaultId, round, validators[i])) continue;

            ProofOfVaultTypes.CommitRecord memory commitRecord =
                resolutionRegistry.commitOf(vaultId, round, validators[i]);
            ProofOfVaultTypes.RevealRecord memory revealRecord =
                resolutionRegistry.revealOf(vaultId, round, validators[i]);
            if (!revealRecord.submitted || commitRecord.disqualified) continue;

            ProofOfVaultTypes.AuditVerdict verdict =
                _effectiveAuditVerdict(resolutionRegistry, vaultId, round, validators[i], auditors);
            if (verdict == ProofOfVaultTypes.AuditVerdict.Valid) {
                _allocateResolutionRewardCapped(rewardPool, vaultId, validators[i], feeManager.validatorBaseReward());
                _allocateResolutionRewardCapped(rewardPool, vaultId, validators[i], feeManager.validatorQualityReward());
                if (revealRecord.outcome == finalOutcome) {
                    _allocateResolutionRewardCapped(
                        rewardPool, vaultId, validators[i], feeManager.validatorConsensusReward()
                    );
                }
            } else if (verdict == ProofOfVaultTypes.AuditVerdict.Questionable) {
                _allocateResolutionRewardCapped(
                    rewardPool, vaultId, validators[i], feeManager.validatorQuestionableReward()
                );
            }
        }

        for (uint256 i = 0; i < auditors.length; i++) {
            if (_hasSuccessfulChallengeAgainst(resolutionRegistry, vaultId, round, auditors[i])) continue;
            (uint256 reviewedCount, uint256 requiredCount, bool highValue) =
                _auditorCoverage(resolutionRegistry, vaultId, round, auditors[i], validators);
            if (requiredCount == 0 || reviewedCount < requiredCount) continue;

            _allocateResolutionRewardCapped(rewardPool, vaultId, auditors[i], feeManager.auditorBaseReward());
            if (highValue) {
                _allocateResolutionRewardCapped(rewardPool, vaultId, auditors[i], feeManager.auditorHighValueReward());
            }
        }
    }

    function _executeVaultOutcome(
        mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults,
        ResolutionRegistry resolutionRegistry,
        VaultEscrow vaultEscrow,
        address compensationPool,
        IFeeManager feeManager,
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        address submittedBy,
        bytes32 resolutionHash,
        string memory payloadURI,
        uint256 settlementFee
    ) private {
        ProofOfVaultTypes.VaultRecord storage vault = vaults[vaultId];

        if (outcome == ProofOfVaultTypes.ResolutionOutcome.True) {
            vaultEscrow.releaseToSetter(vaultId, feeManager.treasury(), settlementFee);
            vault.status = ProofOfVaultTypes.VaultStatus.ResolvedTrue;
        } else if (outcome == ProofOfVaultTypes.ResolutionOutcome.False) {
            vaultEscrow.slashCollateral(vaultId, compensationPool, feeManager.treasury(), settlementFee);
            vault.status = ProofOfVaultTypes.VaultStatus.ResolvedFalse;
        } else if (outcome == ProofOfVaultTypes.ResolutionOutcome.Invalid) {
            vaultEscrow.refundAfterInvalid(vaultId, 0);
            vault.status = ProofOfVaultTypes.VaultStatus.ResolvedInvalid;
        } else {
            revert ResolutionNotReady(vaultId);
        }

        resolutionRegistry.storeFinalResolution(vaultId, outcome, resolutionHash, payloadURI, submittedBy);
        emit VaultFinalized(vaultId, outcome, resolutionHash, submittedBy, settlementFee);
    }

    function _allocateResolutionRewardCapped(RewardPool rewardPool, uint256 vaultId, address recipient, uint256 amount)
        private
    {
        if (amount == 0) return;
        uint256 available = rewardPool.vaultBalanceOf(vaultId).resolutionRewardBalance;
        if (available == 0) return;

        uint256 payout = amount > available ? available : amount;
        rewardPool.allocateResolutionReward(vaultId, recipient, payout);
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

    function _slashRemainingTaskBond(
        IAgentStaking agentStaking,
        IFeeManager feeManager,
        address agent,
        uint256 vaultId,
        uint8 round,
        ProofOfVaultTypes.CommitteeRole role,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        string memory incidentLabel
    ) private {
        ProofOfVaultTypes.TaskBondRecord memory taskBond = agentStaking.taskBondOf(agent, vaultId, role);
        uint256 remainingBond = taskBond.amount - taskBond.slashedAmount;
        if (remainingBond == 0) return;

        bytes32 incidentHash = keccak256(abi.encode(incidentLabel, vaultId, round, agent, role));
        agentStaking.slashTaskBond(agent, vaultId, role, remainingBond, reasonCode, feeManager.treasury(), incidentHash);
    }

    function _getVault(mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vaults) storage vaults, uint256 vaultId)
        private
        view
        returns (ProofOfVaultTypes.VaultRecord storage vault)
    {
        vault = vaults[vaultId];
        if (vault.setter == address(0)) revert InvalidVaultId(vaultId);
    }
}
