// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AgentStaking} from "./AgentStaking.sol";
import {CommitteeRegistry} from "./CommitteeRegistry.sol";
import {CompensationPool} from "./CompensationPool.sol";
import {FeeManager} from "./FeeManager.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {ProofOfVaultTypes} from "./libraries/ProofOfVaultTypes.sol";
import {ResolutionRegistry} from "./ResolutionRegistry.sol";
import {RewardPool} from "./RewardPool.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";
import {VaultEscrow} from "./VaultEscrow.sol";

/// @notice Deployment-sized V2 factory for X Layer testnet demos.
/// @dev The full VaultFactory remains the reference implementation; this contract keeps runtime below EIP-170.
contract VaultFactoryLite is Ownable, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    error BadInput();
    error BadPhase();
    error NotActor();
    error NotAuthorized();
    error NotMember();
    error NotReady();
    error OpenChallenge();
    error InvalidNativeDeposit(uint256 received, uint256 expected);

    event FinalizerAuthorizationUpdated(address indexed finalizer, bool allowed);
    event OrchestratorAuthorizationUpdated(address indexed orchestrator, bool allowed);
    event SafetyCouncilUpdated(address indexed account, bool allowed);
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
    event RuleSetAccepted(uint256 indexed vaultId, uint8 indexed round, uint256 rewardDeposit, bytes32 criteriaHash);
    event RuleSetRejected(uint256 indexed vaultId, uint8 indexed round, string reasonURI, uint8 rejectionCount);
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

    uint256 public nextVaultId = 1;

    ResolutionRegistry public immutable resolutionRegistry;
    VaultEscrow public immutable vaultEscrow;
    AgentStaking public immutable agentStaking;
    FeeManager public immutable feeManager;
    CommitteeRegistry public immutable committeeRegistry;
    RewardPool public immutable rewardPool;
    CompensationPool public immutable compensationPool;

    mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord) private _vaults;
    mapping(uint256 vaultId => string metadataURI) private _pendingRuleMetadataURI;
    mapping(uint256 vaultId => mapping(uint8 round => mapping(address target => bool challengedOut))) private
        _successfulChallenges;
    mapping(address finalizer => bool allowed) public authorizedFinalizers;
    mapping(address orchestrator => bool allowed) public authorizedOrchestrators;
    mapping(address account => bool allowed) public safetyCouncil;

    constructor(
        address initialOwner,
        address resolutionRegistry_,
        address vaultEscrow_,
        address agentStaking_,
        address feeManager_,
        address committeeRegistry_,
        address rewardPool_,
        address compensationPool_
    ) Ownable(initialOwner) {
        if (
            resolutionRegistry_ == address(0) || vaultEscrow_ == address(0) || agentStaking_ == address(0)
                || feeManager_ == address(0) || committeeRegistry_ == address(0) || rewardPool_ == address(0)
                || compensationPool_ == address(0)
        ) revert BadInput();

        resolutionRegistry = ResolutionRegistry(resolutionRegistry_);
        vaultEscrow = VaultEscrow(vaultEscrow_);
        agentStaking = AgentStaking(agentStaking_);
        feeManager = FeeManager(feeManager_);
        committeeRegistry = CommitteeRegistry(committeeRegistry_);
        rewardPool = RewardPool(rewardPool_);
        compensationPool = CompensationPool(compensationPool_);
    }

    modifier onlyOrchestrator() {
        if (msg.sender != owner && !authorizedOrchestrators[msg.sender]) revert NotAuthorized();
        _;
    }

    modifier onlyFinalizer() {
        if (msg.sender != owner && !authorizedFinalizers[msg.sender]) revert NotAuthorized();
        _;
    }

    function setAuthorizedFinalizer(address finalizer, bool allowed) external onlyOwner {
        authorizedFinalizers[finalizer] = allowed;
        emit FinalizerAuthorizationUpdated(finalizer, allowed);
    }

    function setAuthorizedOrchestrator(address orchestrator, bool allowed) external onlyOwner {
        authorizedOrchestrators[orchestrator] = allowed;
        emit OrchestratorAuthorizationUpdated(orchestrator, allowed);
    }

    function setSafetyCouncil(address account, bool allowed) external onlyOwner {
        safetyCouncil[account] = allowed;
        emit SafetyCouncilUpdated(account, allowed);
    }

    function createVaultRequest(
        address collateralToken,
        uint256 grossCollateralAmount,
        uint64 settlementTime,
        string calldata metadataURI
    ) external payable nonReentrant returns (uint256 vaultId) {
        if (collateralToken == address(0) || grossCollateralAmount == 0 || bytes(metadataURI).length == 0) {
            revert BadInput();
        }
        if (settlementTime <= block.timestamp) revert NotReady();

        vaultId = nextVaultId++;
        uint256 minimumSetupDeposit = feeManager.previewSetupDeposit();
        if (msg.value < minimumSetupDeposit) revert InvalidNativeDeposit(msg.value, minimumSetupDeposit);
        uint256 setupDeposit = msg.value;
        rewardPool.collectSetupDeposit{value: setupDeposit}(vaultId, msg.sender, setupDeposit);

        _vaults[vaultId] = ProofOfVaultTypes.VaultRecord({
            setter: msg.sender,
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
            vaultId, msg.sender, collateralToken, grossCollateralAmount, settlementTime, setupDeposit, metadataURI
        );
    }

    function registerRuleCommittee(
        uint256 vaultId,
        address[] calldata makers,
        address[] calldata verifiers,
        uint64 draftDeadline,
        uint64 issueDeadline
    ) external onlyOrchestrator {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.RuleAuction
                && vault.status != ProofOfVaultTypes.VaultStatus.DraftRequest
        ) revert BadPhase();

        vault.ruleRound += 1;
        committeeRegistry.registerRuleCommittee(
            vaultId, vault.ruleRound, makers, verifiers, draftDeadline, issueDeadline
        );

        uint256 makerBond = feeManager.bondForRole(ProofOfVaultTypes.CommitteeRole.RuleMaker);
        uint256 verifierBond = feeManager.bondForRole(ProofOfVaultTypes.CommitteeRole.RuleVerifier);
        for (uint256 i; i < makers.length; ++i) {
            agentStaking.lockTaskBond(makers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker, makerBond);
        }
        for (uint256 i; i < verifiers.length; ++i) {
            agentStaking.lockTaskBond(verifiers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier, verifierBond);
        }

        vault.status = ProofOfVaultTypes.VaultStatus.RuleDrafting;
        emit RuleCommitteeRegistered(vaultId, vault.ruleRound, makers, verifiers, draftDeadline, issueDeadline);
    }

    function submitRuleDraft(uint256 vaultId, bytes32 draftHash, string calldata payloadURI) external {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.RuleDrafting) revert BadPhase();
        if (committeeRegistry.ruleRoleOf(vaultId, msg.sender) != ProofOfVaultTypes.CommitteeRole.RuleMaker) {
            revert NotMember();
        }
        if (block.timestamp > committeeRegistry.ruleCommitteeOf(vaultId).draftDeadline) revert BadPhase();
        if (draftHash == bytes32(0) || bytes(payloadURI).length == 0) revert BadInput();

        emit RuleDraftSubmitted(vaultId, vault.ruleRound, msg.sender, draftHash, payloadURI);
    }

    function submitRuleIssue(
        uint256 vaultId,
        ProofOfVaultTypes.IssueSeverity severity,
        bytes32 issueHash,
        string calldata payloadURI
    ) external {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.RuleDrafting) revert BadPhase();
        if (committeeRegistry.ruleRoleOf(vaultId, msg.sender) != ProofOfVaultTypes.CommitteeRole.RuleVerifier) {
            revert NotMember();
        }
        if (block.timestamp > committeeRegistry.ruleCommitteeOf(vaultId).issueDeadline) revert BadPhase();
        if (
            severity == ProofOfVaultTypes.IssueSeverity.None || issueHash == bytes32(0) || bytes(payloadURI).length == 0
        ) {
            revert BadInput();
        }

        emit RuleIssueSubmitted(vaultId, vault.ruleRound, msg.sender, severity, issueHash, payloadURI);
    }

    function finalizeRuleSet(
        uint256 vaultId,
        bytes32 criteriaHash,
        string calldata metadataURI,
        address[] calldata,
        address[] calldata,
        address[] calldata,
        address[] calldata
    ) external onlyOrchestrator {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.RuleDrafting || criteriaHash == bytes32(0)) {
            revert BadPhase();
        }
        if (bytes(metadataURI).length == 0) revert BadInput();
        if (block.timestamp <= committeeRegistry.ruleCommitteeOf(vaultId).issueDeadline) revert NotReady();

        vault.criteriaHash = criteriaHash;
        vault.status = ProofOfVaultTypes.VaultStatus.UserRuleReview;
        _pendingRuleMetadataURI[vaultId] = metadataURI;

        _releaseRuleCommittee(vaultId);
        emit RuleSetFinalized(vaultId, vault.ruleRound, criteriaHash, metadataURI);
    }

    function rejectRuleSet(uint256 vaultId, string calldata reasonURI) external {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (msg.sender != vault.setter) revert NotActor();
        if (vault.status != ProofOfVaultTypes.VaultStatus.UserRuleReview) revert BadPhase();

        vault.rejectionCount += 1;
        vault.status = vault.rejectionCount >= 2
            ? ProofOfVaultTypes.VaultStatus.Cancelled
            : ProofOfVaultTypes.VaultStatus.RuleAuction;
        if (vault.status == ProofOfVaultTypes.VaultStatus.Cancelled) {
            RewardPool.VaultBalance memory balances = rewardPool.vaultBalanceOf(vaultId);
            if (balances.setupDepositBalance > 0) {
                rewardPool.refundSetupDeposit(vaultId, vault.setter, balances.setupDepositBalance);
            }
        }

        emit RuleSetRejected(vaultId, vault.ruleRound, reasonURI, vault.rejectionCount);
    }

    function acceptRuleSetAndFund(uint256 vaultId) external nonReentrant {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (msg.sender != vault.setter) revert NotActor();
        if (vault.status != ProofOfVaultTypes.VaultStatus.UserRuleReview || vault.criteriaHash == bytes32(0)) {
            revert BadPhase();
        }

        uint256 rewardDeposit = feeManager.previewResolutionRewardDeposit();
        rewardPool.collectResolutionRewardDeposit(vaultId, msg.sender, rewardDeposit);

        uint256 creationFee = feeManager.previewCreationFee(vault.grossCollateralAmount);
        uint256 lockedAmount = vault.grossCollateralAmount - creationFee;
        if (lockedAmount == 0) revert BadInput();

        IERC20 collateral = IERC20(vault.collateralToken);
        if (creationFee > 0) collateral.safeTransferFrom(msg.sender, feeManager.treasury(), creationFee);
        collateral.safeTransferFrom(msg.sender, address(vaultEscrow), lockedAmount);
        vaultEscrow.lockCollateral(vaultId, vault.setter, vault.collateralToken, lockedAmount);
        resolutionRegistry.registerCriteria(vaultId, vault.criteriaHash, _pendingRuleMetadataURI[vaultId], msg.sender);

        vault.lockedCollateralAmount = lockedAmount;
        vault.resolutionRewardDepositAmount = rewardDeposit;
        vault.activatedAt = uint64(block.timestamp);
        vault.ruleSetAccepted = true;
        vault.status = ProofOfVaultTypes.VaultStatus.Active;
        RewardPool.VaultBalance memory balances = rewardPool.vaultBalanceOf(vaultId);
        if (balances.setupDepositBalance > 0) {
            rewardPool.payTreasuryFromSetup(vaultId, balances.setupDepositBalance);
        }

        emit RuleSetAccepted(vaultId, vault.ruleRound, rewardDeposit, vault.criteriaHash);
    }

    function registerResolutionCommittee(
        uint256 vaultId,
        address[] calldata validators,
        address[] calldata auditors,
        uint64 commitDeadline,
        uint64 revealDeadline,
        uint64 auditDeadline,
        uint64 challengeDeadline,
        uint8 minValidCount
    ) external onlyOrchestrator {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.Active
                && vault.status != ProofOfVaultTypes.VaultStatus.ResolutionAuction
        ) revert BadPhase();
        if (block.timestamp < vault.settlementTime) revert NotReady();

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
        for (uint256 i; i < validators.length; ++i) {
            agentStaking.lockTaskBond(
                validators[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator, validatorBond
            );
        }
        for (uint256 i; i < auditors.length; ++i) {
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

    function commitResolution(uint256 vaultId, bytes32 commitHash) external {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.CommitPhase) revert BadPhase();
        if (
            committeeRegistry.resolutionRoleOf(vaultId, msg.sender)
                != ProofOfVaultTypes.CommitteeRole.ResolutionValidator
        ) {
            revert NotMember();
        }
        if (block.timestamp > committeeRegistry.resolutionCommitteeOf(vaultId).commitDeadline) revert BadPhase();
        resolutionRegistry.recordCommit(vaultId, vault.resolutionRound, msg.sender, commitHash);
        emit ResolutionCommitted(vaultId, vault.resolutionRound, msg.sender, commitHash);
    }

    function revealResolution(
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        bytes32 salt,
        string calldata payloadURI
    ) external nonReentrant {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.CommitPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.RevealPhase
        ) revert BadPhase();
        if (
            committeeRegistry.resolutionRoleOf(vaultId, msg.sender)
                != ProofOfVaultTypes.CommitteeRole.ResolutionValidator
        ) {
            revert NotMember();
        }
        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (block.timestamp <= config.commitDeadline) revert NotReady();
        if (block.timestamp > config.revealDeadline) revert BadPhase();

        ProofOfVaultTypes.CommitRecord memory commitRecord =
            resolutionRegistry.commitOf(vaultId, vault.resolutionRound, msg.sender);
        bytes32 expectedCommit = keccak256(abi.encode(vaultId, msg.sender, outcome, proofHash, salt));
        bool disqualified = expectedCommit != commitRecord.commitHash;
        if (disqualified) {
            _slashRemaining(msg.sender, vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator);
        } else {
            feeManager.collectProofFee(msg.sender);
        }

        vault.status = ProofOfVaultTypes.VaultStatus.RevealPhase;
        resolutionRegistry.recordReveal(
            vaultId, vault.resolutionRound, msg.sender, outcome, proofHash, payloadURI, disqualified
        );
        emit ResolutionRevealed(
            vaultId, vault.resolutionRound, msg.sender, outcome, proofHash, payloadURI, disqualified
        );
    }

    function submitAuditVerdict(
        uint256 vaultId,
        address validator,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string calldata payloadURI
    ) external {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.RevealPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.AuditPhase
        ) revert BadPhase();
        if (
            committeeRegistry.resolutionRoleOf(vaultId, msg.sender) != ProofOfVaultTypes.CommitteeRole.ResolutionAuditor
        ) {
            revert NotMember();
        }
        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (block.timestamp <= config.revealDeadline) revert NotReady();
        if (block.timestamp > config.auditDeadline) revert BadPhase();
        if (!resolutionRegistry.revealOf(vaultId, vault.resolutionRound, validator).submitted) revert BadInput();

        vault.status = ProofOfVaultTypes.VaultStatus.AuditPhase;
        resolutionRegistry.recordAuditVerdict(
            vaultId, vault.resolutionRound, validator, msg.sender, verdict, verdictHash, payloadURI
        );
        emit AuditVerdictSubmitted(
            vaultId, vault.resolutionRound, validator, msg.sender, verdict, verdictHash, payloadURI
        );
    }

    function openPublicChallenge(uint256 vaultId, address target, bytes32 challengeHash, string calldata payloadURI)
        external
        nonReentrant
        returns (uint256 challengeId)
    {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.AuditPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.PublicChallenge
        ) revert BadPhase();
        if (!_isResolutionMember(vaultId, target)) revert BadInput();
        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (block.timestamp <= config.auditDeadline) revert NotReady();
        if (block.timestamp > config.challengeDeadline) revert BadPhase();

        ProofOfVaultTypes.CommitteeRole role = committeeRegistry.resolutionRoleOf(vaultId, msg.sender);
        bool privileged = msg.sender == vault.setter || msg.sender == owner || safetyCouncil[msg.sender];
        if (_isResolutionRole(role) && !privileged) revert NotActor();
        if (!privileged && (msg.sender == target || !agentStaking.isActiveAgent(msg.sender))) revert NotActor();

        uint256 bond = feeManager.previewChallengeBond();
        challengeId = resolutionRegistry.openChallenge(
            vaultId, vault.resolutionRound, msg.sender, target, challengeHash, payloadURI, bond
        );
        rewardPool.collectChallengeBond(vaultId, challengeId, msg.sender, bond);
        vault.status = ProofOfVaultTypes.VaultStatus.PublicChallenge;
        emit PublicChallengeOpened(
            vaultId, vault.resolutionRound, challengeId, msg.sender, target, challengeHash, payloadURI, bond
        );
    }

    function resolveChallenge(
        uint256 vaultId,
        uint256 challengeId,
        bool successful,
        ProofOfVaultTypes.CommitteeRole targetRole,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        uint256 slashAmount
    ) external onlyFinalizer nonReentrant {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        ProofOfVaultTypes.ChallengeRecord memory challenge =
            resolutionRegistry.challengeOf(vaultId, vault.resolutionRound, challengeId);
        if (challenge.status != ProofOfVaultTypes.ChallengeStatus.Open) revert BadPhase();

        resolutionRegistry.resolveChallenge(
            vaultId,
            vault.resolutionRound,
            challengeId,
            successful
                ? ProofOfVaultTypes.ChallengeStatus.ResolvedSuccess
                : ProofOfVaultTypes.ChallengeStatus.ResolvedFailure
        );

        if (successful) {
            _successfulChallenges[vaultId][vault.resolutionRound][challenge.target] = true;
            rewardPool.refundChallengeBond(vaultId, challengeId, challenge.challenger, challenge.bondAmount);
            rewardPool.allocateResolutionReward(vaultId, challenge.challenger, feeManager.challengerSuccessReward());
            if (slashAmount > 0) {
                agentStaking.slashTaskBond(
                    challenge.target,
                    vaultId,
                    targetRole,
                    slashAmount,
                    reasonCode,
                    feeManager.treasury(),
                    keccak256(abi.encode(vaultId, challengeId, challenge.target, reasonCode))
                );
            }
        } else {
            uint256 slashed = (challenge.bondAmount * feeManager.challengeFailureSlashBps()) / 10_000;
            if (slashed > 0) rewardPool.sweepChallengeBondToTreasury(vaultId, challengeId, slashed);
            rewardPool.refundChallengeBond(vaultId, challengeId, challenge.challenger, challenge.bondAmount - slashed);
        }
    }

    function finalizeV2Vault(uint256 vaultId) external onlyFinalizer nonReentrant {
        ProofOfVaultTypes.VaultRecord storage vault = _vault(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.AuditPhase
                && vault.status != ProofOfVaultTypes.VaultStatus.PublicChallenge
        ) revert BadPhase();
        if (block.timestamp <= committeeRegistry.resolutionCommitteeOf(vaultId).challengeDeadline) revert NotReady();
        if (_hasOpenChallenge(vaultId, vault.resolutionRound)) revert OpenChallenge();

        ProofOfVaultTypes.ResolutionOutcome outcome = _tallyOutcome(vaultId, vault.resolutionRound);
        _releaseResolutionCommittee(vaultId);
        committeeRegistry.clearResolutionCommittee(vaultId);
        resolutionRegistry.storeFinalResolution(
            vaultId,
            outcome,
            keccak256(abi.encode("lite-final", vaultId, vault.resolutionRound, outcome)),
            "protocol://lite-final",
            msg.sender
        );

        if (outcome == ProofOfVaultTypes.ResolutionOutcome.True) {
            vault.status = ProofOfVaultTypes.VaultStatus.ResolvedTrue;
            vaultEscrow.releaseToSetter(
                vaultId, feeManager.treasury(), feeManager.previewSettlementFee(vault.lockedCollateralAmount)
            );
        } else if (outcome == ProofOfVaultTypes.ResolutionOutcome.False) {
            vault.status = ProofOfVaultTypes.VaultStatus.ResolvedFalse;
            vaultEscrow.slashCollateral(
                vaultId,
                address(compensationPool),
                feeManager.treasury(),
                feeManager.previewSettlementFee(vault.lockedCollateralAmount)
            );
        } else {
            vault.status = ProofOfVaultTypes.VaultStatus.ResolvedInvalid;
            vaultEscrow.refundAfterInvalid(vaultId, 0);
        }

        RewardPool.VaultBalance memory balances = rewardPool.vaultBalanceOf(vaultId);
        if (balances.resolutionRewardBalance > 0) {
            rewardPool.payTreasuryFromResolution(vaultId, balances.resolutionRewardBalance);
        }
    }

    function claimRewards() external nonReentrant returns (uint256 povAmount, uint256 nativeOkbAmount) {
        povAmount = rewardPool.claimableRewards(msg.sender);
        nativeOkbAmount = rewardPool.claimableSetupRewards(msg.sender);
        if (povAmount == 0 && nativeOkbAmount == 0) revert BadInput();

        if (povAmount > 0) {
            rewardPool.claimRewardsFor(msg.sender);
        }
        if (nativeOkbAmount > 0) {
            rewardPool.claimSetupRewardsFor(msg.sender);
        }
    }

    function getVault(uint256 vaultId) external view returns (ProofOfVaultTypes.VaultRecord memory) {
        return _vaults[vaultId];
    }

    function _vault(uint256 vaultId) internal view returns (ProofOfVaultTypes.VaultRecord storage vault) {
        vault = _vaults[vaultId];
        if (vault.setter == address(0)) revert BadInput();
    }

    function _releaseRuleCommittee(uint256 vaultId) internal {
        address[] memory makers = committeeRegistry.ruleMakersOf(vaultId);
        address[] memory verifiers = committeeRegistry.ruleVerifiersOf(vaultId);
        for (uint256 i; i < makers.length; ++i) {
            agentStaking.releaseTaskBond(makers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleMaker);
        }
        for (uint256 i; i < verifiers.length; ++i) {
            agentStaking.releaseTaskBond(verifiers[i], vaultId, ProofOfVaultTypes.CommitteeRole.RuleVerifier);
        }
    }

    function _releaseResolutionCommittee(uint256 vaultId) internal {
        address[] memory validators = committeeRegistry.resolutionValidatorsOf(vaultId);
        address[] memory auditors = committeeRegistry.resolutionAuditorsOf(vaultId);
        for (uint256 i; i < validators.length; ++i) {
            _releaseBond(validators[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionValidator);
        }
        for (uint256 i; i < auditors.length; ++i) {
            _releaseBond(auditors[i], vaultId, ProofOfVaultTypes.CommitteeRole.ResolutionAuditor);
        }
    }

    function _releaseBond(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role) internal {
        ProofOfVaultTypes.TaskBondRecord memory bond = agentStaking.taskBondOf(agent, vaultId, role);
        if (bond.active) agentStaking.releaseTaskBond(agent, vaultId, role);
    }

    function _slashRemaining(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role) internal {
        ProofOfVaultTypes.TaskBondRecord memory bond = agentStaking.taskBondOf(agent, vaultId, role);
        uint256 amount = bond.amount - bond.slashedAmount;
        if (amount == 0) return;
        agentStaking.slashTaskBond(
            agent,
            vaultId,
            role,
            amount,
            ProofOfVaultTypes.SlashReasonCode.CommitRevealMismatch,
            feeManager.treasury(),
            keccak256(abi.encode("lite-mismatch", vaultId, agent))
        );
    }

    function _hasOpenChallenge(uint256 vaultId, uint8 round) internal view returns (bool) {
        uint256 challengeCount = resolutionRegistry.challengeCountOf(vaultId, round);
        for (uint256 i = 1; i <= challengeCount; ++i) {
            if (resolutionRegistry.challengeOf(vaultId, round, i).status == ProofOfVaultTypes.ChallengeStatus.Open) {
                return true;
            }
        }
        return false;
    }

    function _isResolutionMember(uint256 vaultId, address account) internal view returns (bool) {
        return _isResolutionRole(committeeRegistry.resolutionRoleOf(vaultId, account));
    }

    function _isResolutionRole(ProofOfVaultTypes.CommitteeRole role) internal pure returns (bool) {
        return role == ProofOfVaultTypes.CommitteeRole.ResolutionValidator
            || role == ProofOfVaultTypes.CommitteeRole.ResolutionAuditor;
    }

    function _tallyOutcome(uint256 vaultId, uint8 round) internal view returns (ProofOfVaultTypes.ResolutionOutcome) {
        address[] memory validators = committeeRegistry.resolutionValidatorsOf(vaultId);
        uint256 trueVotes;
        uint256 falseVotes;
        uint256 invalidVotes;
        uint256 validVotes;

        for (uint256 i; i < validators.length; ++i) {
            ProofOfVaultTypes.RevealRecord memory reveal = resolutionRegistry.revealOf(vaultId, round, validators[i]);
            if (!reveal.submitted || !_isAuditValid(vaultId, round, validators[i])) continue;
            ++validVotes;
            if (reveal.outcome == ProofOfVaultTypes.ResolutionOutcome.True) ++trueVotes;
            if (reveal.outcome == ProofOfVaultTypes.ResolutionOutcome.False) ++falseVotes;
            if (reveal.outcome == ProofOfVaultTypes.ResolutionOutcome.Invalid) ++invalidVotes;
        }

        CommitteeRegistry.ResolutionCommitteeConfig memory config = committeeRegistry.resolutionCommitteeOf(vaultId);
        if (validVotes < config.minValidCount) return ProofOfVaultTypes.ResolutionOutcome.Invalid;
        if (trueVotes * 3 > validVotes * 2) return ProofOfVaultTypes.ResolutionOutcome.True;
        if (falseVotes * 3 > validVotes * 2) return ProofOfVaultTypes.ResolutionOutcome.False;
        if (invalidVotes * 3 > validVotes * 2) return ProofOfVaultTypes.ResolutionOutcome.Invalid;
        return ProofOfVaultTypes.ResolutionOutcome.Invalid;
    }

    function _isAuditValid(uint256 vaultId, uint8 round, address validator) internal view returns (bool) {
        if (_successfulChallenges[vaultId][round][validator]) return false;
        address[] memory auditors = committeeRegistry.resolutionAuditorsOf(vaultId);
        uint256 valid;
        uint256 invalid;
        for (uint256 i; i < auditors.length; ++i) {
            ProofOfVaultTypes.AuditVerdict verdict =
            resolutionRegistry.auditVerdictOf(vaultId, round, validator, auditors[i]).verdict;
            if (verdict == ProofOfVaultTypes.AuditVerdict.Valid) ++valid;
            if (
                verdict == ProofOfVaultTypes.AuditVerdict.Invalid || verdict == ProofOfVaultTypes.AuditVerdict.Malicious
            ) ++invalid;
        }
        return valid > 0 && valid > invalid;
    }
}
