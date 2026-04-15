// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";
import {IAgentStaking} from "./interfaces/IAgentStaking.sol";
import {IFeeManager} from "./interfaces/IFeeManager.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";
import {ProofOfVaultTypes} from "./libraries/ProofOfVaultTypes.sol";
import {VaultFactoryResolutionLib} from "./libraries/VaultFactoryResolutionLib.sol";
import {VaultFactoryRuleLib} from "./libraries/VaultFactoryRuleLib.sol";
import {CommitteeRegistry} from "./CommitteeRegistry.sol";
import {ResolutionRegistry} from "./ResolutionRegistry.sol";
import {RewardPool} from "./RewardPool.sol";
import {VaultEscrow} from "./VaultEscrow.sol";

contract VaultFactory is Ownable, ReentrancyGuard {
    using SafeTransferLib for IERC20;

    uint8 internal constant MAX_RULE_REJECTIONS = 1;
    uint8 internal constant MAX_RESOLUTION_ROUNDS = 2;

    error ProtocolPaused();
    error InvalidAddress(address account);
    error InvalidAmount();
    error InvalidTokenTransfer(uint256 received, uint256 expected);
    error InvalidNativeDeposit(uint256 received, uint256 expected);
    error InvalidSettlementTime(uint64 settlementTime);
    error InvalidCriteriaHash();
    error InvalidMetadataURI();
    error InvalidDisputeWindow(uint64 disputeWindow);
    error InvalidVaultId(uint256 vaultId);
    error InvalidCommitteePhase(uint256 vaultId, ProofOfVaultTypes.VaultStatus status);
    error InvalidCommitteeMember(address caller, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role);
    error InvalidRole();
    error InvalidChallengeWindow(uint256 vaultId);
    error VaultNotReadyForResolution(uint256 vaultId);
    error VaultAlreadyResolved(uint256 vaultId);
    error VaultInDispute(uint256 vaultId);
    error ResolutionNotReady(uint256 vaultId);
    error CallerNotActiveAgent(address caller);
    error CallerNotAuthorizedFinalizer(address caller);
    error CallerNotSafetyCouncil(address caller);
    error CallerNotAuthorizedOrchestrator(address caller);
    error CallerNotSetter(address caller, uint256 vaultId);
    error RuleSetNotReady(uint256 vaultId);
    error RuleSetUnavailable(uint256 vaultId);
    error ChallengeTargetNotAllowed(address target);
    error DuplicateRewardRecipient(address recipient);
    error CurrentCommitteeMemberCannotChallenge(address caller, uint256 vaultId);
    error UnresolvedChallenges(uint256 vaultId);
    error CollateralNotAllowed(address collateralToken);
    error CollateralCapExceeded(address collateralToken, uint256 requestedAmount, uint256 cap);
    error CollateralPolicyFrozen(address collateralToken);
    error InvalidCollateralCap(address collateralToken, uint256 cap);

    struct CollateralPolicy {
        bool configured;
        bool allowed;
        uint256 cap;
    }

    ResolutionRegistry public immutable resolutionRegistry;
    VaultEscrow public immutable vaultEscrow;
    IAgentStaking public immutable agentStaking;
    IFeeManager public immutable feeManager;
    CommitteeRegistry public immutable committeeRegistry;
    RewardPool public immutable rewardPool;
    address public immutable compensationPool;

    uint64 public defaultDisputeWindow;
    uint256 public nextVaultId = 1;
    bool public paused;

    mapping(uint256 vaultId => ProofOfVaultTypes.VaultRecord vault) private _vaults;
    mapping(address finalizer => bool allowed) public authorizedFinalizers;
    mapping(address member => bool allowed) public safetyCouncil;
    mapping(address orchestrator => bool allowed) public authorizedOrchestrators;
    mapping(address collateralToken => CollateralPolicy policy) public collateralPolicies;
    bool public collateralPolicyFrozen;
    mapping(
        uint256 vaultId => mapping(uint8 round => mapping(address maker => ProofOfVaultTypes.RuleDraftRecord draft))
    ) private _ruleDrafts;
    mapping(
        uint256 vaultId => mapping(uint8 round => mapping(address verifier => ProofOfVaultTypes.RuleIssueRecord issue))
    ) private _ruleIssues;
    mapping(uint256 vaultId => string uri) private _pendingRuleMetadataURI;

    event ProtocolPauseUpdated(bool paused);
    event DefaultDisputeWindowUpdated(uint64 disputeWindow);
    event FinalizerAuthorizationUpdated(address indexed finalizer, bool allowed);
    event SafetyCouncilAuthorizationUpdated(address indexed member, bool allowed);
    event OrchestratorAuthorizationUpdated(address indexed orchestrator, bool allowed);
    event CollateralPolicyUpdated(address indexed collateralToken, bool allowed, uint256 cap);
    event CollateralPolicyFrozenForBeta();
    event VaultCreated(
        uint256 indexed vaultId,
        address indexed setter,
        address indexed collateralToken,
        uint256 grossCollateralAmount,
        uint256 lockedCollateralAmount,
        uint256 creationFee,
        uint64 settlementTime,
        bytes32 criteriaHash,
        string metadataURI
    );
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
    event ResolutionSubmitted(
        uint256 indexed vaultId,
        address indexed submitter,
        ProofOfVaultTypes.ResolutionOutcome indexed outcome,
        bytes32 resolutionHash,
        string payloadURI,
        uint64 disputeWindowEnd
    );
    event VaultDisputed(uint256 indexed vaultId, string reasonURI);
    event VaultFinalized(
        uint256 indexed vaultId,
        ProofOfVaultTypes.ResolutionOutcome indexed outcome,
        bytes32 resolutionHash,
        address indexed submittedBy,
        uint256 settlementFee
    );

    constructor(
        address initialOwner,
        address resolutionRegistry_,
        address vaultEscrow_,
        address agentStaking_,
        address feeManager_,
        address committeeRegistry_,
        address rewardPool_,
        address compensationPool_,
        uint64 defaultDisputeWindow_
    ) Ownable(initialOwner) {
        if (
            resolutionRegistry_ == address(0) || vaultEscrow_ == address(0) || agentStaking_ == address(0)
                || feeManager_ == address(0) || committeeRegistry_ == address(0) || rewardPool_ == address(0)
                || compensationPool_ == address(0)
        ) revert InvalidAddress(address(0));
        if (defaultDisputeWindow_ == 0) revert InvalidDisputeWindow(defaultDisputeWindow_);

        resolutionRegistry = ResolutionRegistry(resolutionRegistry_);
        vaultEscrow = VaultEscrow(vaultEscrow_);
        agentStaking = IAgentStaking(agentStaking_);
        feeManager = IFeeManager(feeManager_);
        committeeRegistry = CommitteeRegistry(committeeRegistry_);
        rewardPool = RewardPool(rewardPool_);
        compensationPool = compensationPool_;
        defaultDisputeWindow = defaultDisputeWindow_;

        emit DefaultDisputeWindowUpdated(defaultDisputeWindow_);
    }

    modifier whenNotPaused() {
        if (paused) revert ProtocolPaused();
        _;
    }

    modifier onlyAuthorizedFinalizer() {
        if (msg.sender != owner && !authorizedFinalizers[msg.sender]) {
            revert CallerNotAuthorizedFinalizer(msg.sender);
        }
        _;
    }

    modifier onlySafetyCouncil() {
        if (msg.sender != owner && !safetyCouncil[msg.sender]) {
            revert CallerNotSafetyCouncil(msg.sender);
        }
        _;
    }

    modifier onlyAuthorizedOrchestrator() {
        if (msg.sender != owner && !authorizedOrchestrators[msg.sender]) {
            revert CallerNotAuthorizedOrchestrator(msg.sender);
        }
        _;
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit ProtocolPauseUpdated(paused_);
    }

    function setDefaultDisputeWindow(uint64 defaultDisputeWindow_) external onlyOwner {
        if (defaultDisputeWindow_ == 0) revert InvalidDisputeWindow(defaultDisputeWindow_);
        defaultDisputeWindow = defaultDisputeWindow_;
        emit DefaultDisputeWindowUpdated(defaultDisputeWindow_);
    }

    function setAuthorizedFinalizer(address finalizer, bool allowed) external onlyOwner {
        authorizedFinalizers[finalizer] = allowed;
        emit FinalizerAuthorizationUpdated(finalizer, allowed);
    }

    function setSafetyCouncil(address member, bool allowed) external onlyOwner {
        safetyCouncil[member] = allowed;
        emit SafetyCouncilAuthorizationUpdated(member, allowed);
    }

    function setAuthorizedOrchestrator(address orchestrator, bool allowed) external onlyOwner {
        authorizedOrchestrators[orchestrator] = allowed;
        emit OrchestratorAuthorizationUpdated(orchestrator, allowed);
    }

    function setCollateralPolicy(address collateralToken, bool allowed, uint256 cap) external onlyOwner {
        if (collateralToken == address(0)) revert InvalidAddress(address(0));
        if (allowed && cap == 0) revert InvalidCollateralCap(collateralToken, cap);

        CollateralPolicy memory current = collateralPolicies[collateralToken];
        if (collateralPolicyFrozen) {
            if (!current.configured || cap > current.cap) revert CollateralPolicyFrozen(collateralToken);
        } else if (current.configured && current.cap > 0 && cap > current.cap) {
            revert CollateralPolicyFrozen(collateralToken);
        }

        collateralPolicies[collateralToken] = CollateralPolicy({configured: true, allowed: allowed, cap: cap});
        emit CollateralPolicyUpdated(collateralToken, allowed, cap);
    }

    function freezeCollateralPolicy() external onlyOwner {
        collateralPolicyFrozen = true;
        emit CollateralPolicyFrozenForBeta();
    }

    function createVaultAndDeposit(
        address collateralToken,
        uint256 grossCollateralAmount,
        uint64 settlementTime,
        bytes32 criteriaHash,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused returns (uint256 vaultId) {
        if (collateralToken == address(0)) revert InvalidAddress(address(0));
        if (grossCollateralAmount == 0) revert InvalidAmount();
        if (criteriaHash == bytes32(0)) revert InvalidCriteriaHash();
        if (bytes(metadataURI).length == 0) revert InvalidMetadataURI();
        if (settlementTime <= block.timestamp) revert InvalidSettlementTime(settlementTime);
        _enforceCollateralPolicy(collateralToken, grossCollateralAmount);

        uint256 creationFee = feeManager.previewCreationFee(grossCollateralAmount);
        uint256 lockedCollateralAmount = grossCollateralAmount - creationFee;
        if (lockedCollateralAmount == 0) revert InvalidAmount();

        IERC20 collateral = IERC20(collateralToken);
        if (creationFee > 0) {
            _transferFromExact(collateral, msg.sender, feeManager.treasury(), creationFee);
        }
        _transferFromExact(collateral, msg.sender, address(vaultEscrow), lockedCollateralAmount);

        vaultId = nextVaultId++;
        _vaults[vaultId] = ProofOfVaultTypes.VaultRecord({
            setter: msg.sender,
            collateralToken: collateralToken,
            grossCollateralAmount: grossCollateralAmount,
            lockedCollateralAmount: lockedCollateralAmount,
            setupDepositAmount: 0,
            resolutionRewardDepositAmount: 0,
            settlementTime: settlementTime,
            createdAt: uint64(block.timestamp),
            activatedAt: uint64(block.timestamp),
            criteriaHash: criteriaHash,
            metadataURI: metadataURI,
            status: ProofOfVaultTypes.VaultStatus.Active,
            legacyMode: true,
            ruleSetAccepted: true,
            ruleRound: 0,
            resolutionRound: 0,
            rejectionCount: 0
        });

        resolutionRegistry.registerCriteria(vaultId, criteriaHash, metadataURI, msg.sender);
        vaultEscrow.lockCollateral(vaultId, msg.sender, collateralToken, lockedCollateralAmount);

        emit VaultCreated(
            vaultId,
            msg.sender,
            collateralToken,
            grossCollateralAmount,
            lockedCollateralAmount,
            creationFee,
            settlementTime,
            criteriaHash,
            metadataURI
        );
    }

    function createVaultRequest(
        address collateralToken,
        uint256 grossCollateralAmount,
        uint64 settlementTime,
        string calldata metadataURI
    ) external payable nonReentrant whenNotPaused returns (uint256 vaultId) {
        _enforceCollateralPolicy(collateralToken, grossCollateralAmount);
        uint256 minimumSetupDeposit = feeManager.previewSetupDeposit();
        if (msg.value < minimumSetupDeposit) revert InvalidNativeDeposit(msg.value, minimumSetupDeposit);

        vaultId = nextVaultId++;
        uint256 setupDeposit = msg.value;
        rewardPool.collectSetupDeposit{value: setupDeposit}(vaultId, msg.sender, setupDeposit);
        VaultFactoryRuleLib.createVaultRequest(
            _vaults,
            vaultId,
            msg.sender,
            collateralToken,
            grossCollateralAmount,
            setupDeposit,
            settlementTime,
            metadataURI
        );
    }

    function registerRuleCommittee(
        uint256 vaultId,
        address[] calldata makers,
        address[] calldata verifiers,
        uint64 draftDeadline,
        uint64 issueDeadline
    ) external onlyAuthorizedOrchestrator whenNotPaused {
        VaultFactoryRuleLib.registerRuleCommittee(
            _vaults,
            committeeRegistry,
            agentStaking,
            feeManager,
            vaultId,
            makers,
            verifiers,
            draftDeadline,
            issueDeadline
        );
    }

    function submitRuleDraft(uint256 vaultId, bytes32 draftHash, string calldata payloadURI) external whenNotPaused {
        VaultFactoryRuleLib.submitRuleDraft(_vaults, _ruleDrafts, committeeRegistry, vaultId, draftHash, payloadURI);
    }

    function submitRuleIssue(
        uint256 vaultId,
        ProofOfVaultTypes.IssueSeverity severity,
        bytes32 issueHash,
        string calldata payloadURI
    ) external whenNotPaused {
        VaultFactoryRuleLib.submitRuleIssue(
            _vaults, _ruleIssues, committeeRegistry, vaultId, severity, issueHash, payloadURI
        );
    }

    function finalizeRuleSet(
        uint256 vaultId,
        bytes32 criteriaHash,
        string calldata metadataURI,
        address[] calldata approvedMakers,
        address[] calldata acceptedVerifiers,
        address[] calldata maliciousMakers,
        address[] calldata maliciousVerifiers
    ) external onlyAuthorizedOrchestrator whenNotPaused {
        VaultFactoryRuleLib.finalizeRuleSet(
            _vaults,
            _ruleDrafts,
            _ruleIssues,
            _pendingRuleMetadataURI,
            committeeRegistry,
            agentStaking,
            feeManager,
            rewardPool,
            vaultId,
            criteriaHash,
            metadataURI,
            approvedMakers,
            acceptedVerifiers,
            maliciousMakers,
            maliciousVerifiers
        );
    }

    function rejectRuleSet(uint256 vaultId, string calldata reasonURI) external nonReentrant whenNotPaused {
        VaultFactoryRuleLib.rejectRuleSet(_vaults, _pendingRuleMetadataURI, rewardPool, vaultId, reasonURI);
    }

    function acceptRuleSetAndFund(uint256 vaultId) external nonReentrant whenNotPaused {
        VaultFactoryRuleLib.acceptRuleSetAndFund(
            _vaults, _pendingRuleMetadataURI, rewardPool, feeManager, resolutionRegistry, vaultEscrow, vaultId
        );
    }

    function getVault(uint256 vaultId) external view returns (ProofOfVaultTypes.VaultRecord memory) {
        return _getVault(vaultId);
    }

    function ruleDraftOf(uint256 vaultId, uint8 round, address maker)
        external
        view
        returns (ProofOfVaultTypes.RuleDraftRecord memory)
    {
        return _ruleDrafts[vaultId][round][maker];
    }

    function ruleIssueOf(uint256 vaultId, uint8 round, address verifier)
        external
        view
        returns (ProofOfVaultTypes.RuleIssueRecord memory)
    {
        return _ruleIssues[vaultId][round][verifier];
    }

    function pendingRuleMetadataURIOf(uint256 vaultId) external view returns (string memory) {
        return _pendingRuleMetadataURI[vaultId];
    }

    function _getVault(uint256 vaultId) internal view returns (ProofOfVaultTypes.VaultRecord storage vault) {
        vault = _vaults[vaultId];
        if (vault.setter == address(0)) revert InvalidVaultId(vaultId);
    }

    function _enforceCollateralPolicy(address collateralToken, uint256 grossCollateralAmount) internal view {
        CollateralPolicy memory policy = collateralPolicies[collateralToken];
        if (!policy.configured || !policy.allowed) revert CollateralNotAllowed(collateralToken);
        if (grossCollateralAmount > policy.cap) {
            revert CollateralCapExceeded(collateralToken, grossCollateralAmount, policy.cap);
        }
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
    ) external onlyAuthorizedOrchestrator whenNotPaused {
        VaultFactoryResolutionLib.registerResolutionCommittee(
            _vaults,
            committeeRegistry,
            agentStaking,
            feeManager,
            vaultId,
            validators,
            auditors,
            commitDeadline,
            revealDeadline,
            auditDeadline,
            challengeDeadline,
            minValidCount
        );
    }

    function commitResolution(uint256 vaultId, bytes32 commitHash) external whenNotPaused {
        VaultFactoryResolutionLib.commitResolution(_vaults, committeeRegistry, resolutionRegistry, vaultId, commitHash);
    }

    function revealResolution(
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        bytes32 salt,
        string calldata payloadURI
    ) external whenNotPaused nonReentrant {
        VaultFactoryResolutionLib.revealResolution(
            _vaults,
            committeeRegistry,
            resolutionRegistry,
            agentStaking,
            feeManager,
            vaultId,
            outcome,
            proofHash,
            salt,
            payloadURI
        );
    }

    function submitAuditVerdict(
        uint256 vaultId,
        address validator,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string calldata payloadURI
    ) external whenNotPaused {
        VaultFactoryResolutionLib.submitAuditVerdict(
            _vaults, committeeRegistry, resolutionRegistry, vaultId, validator, verdict, verdictHash, payloadURI
        );
    }

    function openPublicChallenge(uint256 vaultId, address target, bytes32 challengeHash, string calldata payloadURI)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 challengeId)
    {
        challengeId = VaultFactoryResolutionLib.openPublicChallenge(
            _vaults,
            safetyCouncil,
            owner,
            committeeRegistry,
            resolutionRegistry,
            rewardPool,
            agentStaking,
            feeManager,
            vaultId,
            target,
            challengeHash,
            payloadURI
        );
    }

    function resolveChallenge(
        uint256 vaultId,
        uint256 challengeId,
        bool successful,
        ProofOfVaultTypes.CommitteeRole targetRole,
        ProofOfVaultTypes.SlashReasonCode reasonCode,
        uint256 slashAmount
    ) external onlyAuthorizedFinalizer whenNotPaused nonReentrant {
        VaultFactoryResolutionLib.resolveChallenge(
            _vaults,
            committeeRegistry,
            resolutionRegistry,
            rewardPool,
            agentStaking,
            feeManager,
            vaultId,
            challengeId,
            successful,
            targetRole,
            reasonCode,
            slashAmount
        );
    }

    function submitResolutionHash(
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 resolutionHash,
        string calldata payloadURI
    ) external nonReentrant whenNotPaused {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaultId);
        if (block.timestamp < vault.settlementTime) revert VaultNotReadyForResolution(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.Active
                && vault.status != ProofOfVaultTypes.VaultStatus.Resolving
                && vault.status != ProofOfVaultTypes.VaultStatus.Disputed
        ) revert VaultAlreadyResolved(vaultId);
        if (!agentStaking.isActiveAgent(msg.sender)) revert CallerNotActiveAgent(msg.sender);

        feeManager.collectProofFee(msg.sender);

        uint64 disputeWindowEnd = uint64(block.timestamp) + defaultDisputeWindow;
        resolutionRegistry.submitResolutionHash(
            vaultId, outcome, resolutionHash, payloadURI, msg.sender, disputeWindowEnd
        );
        vault.status = ProofOfVaultTypes.VaultStatus.Resolving;

        emit ResolutionSubmitted(vaultId, msg.sender, outcome, resolutionHash, payloadURI, disputeWindowEnd);
    }

    function markVaultDisputed(uint256 vaultId, string calldata reasonURI) external onlySafetyCouncil {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaultId);
        if (vault.status != ProofOfVaultTypes.VaultStatus.Resolving) revert ResolutionNotReady(vaultId);

        resolutionRegistry.markDisputed(vaultId, reasonURI);
        vault.status = ProofOfVaultTypes.VaultStatus.Disputed;
        emit VaultDisputed(vaultId, reasonURI);
    }

    function finalizeVault(uint256 vaultId) external nonReentrant onlyAuthorizedFinalizer whenNotPaused {
        ProofOfVaultTypes.VaultRecord storage vault = _getVault(vaultId);
        if (
            vault.status != ProofOfVaultTypes.VaultStatus.Resolving
                && vault.status != ProofOfVaultTypes.VaultStatus.Disputed
        ) revert ResolutionNotReady(vaultId);

        ProofOfVaultTypes.ResolutionRecord memory resolution = resolutionRegistry.resolutionOf(vaultId);
        if (resolution.disputed) revert VaultInDispute(vaultId);

        (ProofOfVaultTypes.ResolutionOutcome outcome, bytes32 resolutionHash, address submittedBy) =
            resolutionRegistry.finalizeResolution(vaultId);

        uint256 settlementFee = outcome == ProofOfVaultTypes.ResolutionOutcome.Invalid
            ? 0
            : feeManager.previewSettlementFee(vault.lockedCollateralAmount);

        _executeVaultOutcome(vaultId, outcome, submittedBy, resolutionHash, resolution.payloadURI, settlementFee);
    }

    function finalizeV2Vault(uint256 vaultId) external nonReentrant onlyAuthorizedFinalizer whenNotPaused {
        VaultFactoryResolutionLib.finalizeV2Vault(
            _vaults,
            committeeRegistry,
            resolutionRegistry,
            rewardPool,
            agentStaking,
            feeManager,
            vaultEscrow,
            compensationPool,
            vaultId
        );
    }

    function claimRewards() external nonReentrant returns (uint256 povAmount, uint256 nativeOkbAmount) {
        povAmount = rewardPool.claimableRewards(msg.sender);
        nativeOkbAmount = rewardPool.claimableSetupRewards(msg.sender);
        if (povAmount == 0 && nativeOkbAmount == 0) revert InvalidAmount();

        if (povAmount > 0) {
            rewardPool.claimRewardsFor(msg.sender);
        }
        if (nativeOkbAmount > 0) {
            rewardPool.claimSetupRewardsFor(msg.sender);
        }
    }

    function _executeVaultOutcome(
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        address submittedBy,
        bytes32 resolutionHash,
        string memory payloadURI,
        uint256 settlementFee
    ) internal {
        ProofOfVaultTypes.VaultRecord storage vault = _vaults[vaultId];

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

    function _transferFromExact(IERC20 token, address from, address to, uint256 amount) internal {
        uint256 balanceBefore = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        uint256 received = token.balanceOf(to) - balanceBefore;
        if (received != amount) revert InvalidTokenTransfer(received, amount);
    }
}
