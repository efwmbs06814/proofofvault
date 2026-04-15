// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "./utils/Ownable.sol";
import {ProofOfVaultTypes} from "./libraries/ProofOfVaultTypes.sol";

contract ResolutionRegistry is Ownable {
    error NotAuthorizedOrchestrator(address caller);
    error InvalidVaultId(uint256 vaultId);
    error CriteriaAlreadyRegistered(uint256 vaultId);
    error ActiveResolutionExists(uint256 vaultId);
    error InvalidOutcome();
    error InvalidResolutionHash();
    error InvalidSubmittedBy();
    error InvalidDisputeWindow(uint64 disputeWindowEnd);
    error NoResolutionSubmitted(uint256 vaultId);
    error ResolutionAlreadyFinalized(uint256 vaultId);
    error ResolutionInDispute(uint256 vaultId);
    error DisputeReasonRequired();
    error DisputeWindowStillOpen(uint64 disputeWindowEnd);
    error CommitAlreadySubmitted(uint256 vaultId, uint8 round, address validator);
    error CommitNotFound(uint256 vaultId, uint8 round, address validator);
    error RevealAlreadySubmitted(uint256 vaultId, uint8 round, address validator);
    error AuditVerdictAlreadySubmitted(uint256 vaultId, uint8 round, address validator, address auditor);
    error InvalidCommitHash();
    error InvalidProofHash();
    error InvalidVerdict();
    error ChallengeAlreadyResolved(uint256 vaultId, uint8 round, uint256 challengeId);
    error ChallengeNotFound(uint256 vaultId, uint8 round, uint256 challengeId);
    error InvalidChallengeBond(uint256 amount);

    mapping(address orchestrator => bool allowed) public authorizedOrchestrators;
    mapping(uint256 vaultId => ProofOfVaultTypes.CriteriaRecord criteria) private _criteriaRecords;
    mapping(uint256 vaultId => ProofOfVaultTypes.ResolutionRecord resolution) private _resolutionRecords;
    mapping(
        uint256 vaultId
            => mapping(uint8 round => mapping(address validator => ProofOfVaultTypes.CommitRecord commitRecord))
    ) private _commitRecords;
    mapping(
        uint256 vaultId
            => mapping(uint8 round => mapping(address validator => ProofOfVaultTypes.RevealRecord revealRecord))
    ) private _revealRecords;
    mapping(
        uint256 vaultId
            => mapping(
            uint8 round
                => mapping(
                address validator => mapping(address auditor => ProofOfVaultTypes.AuditVerdictRecord verdict)
            )
        )
    ) private _auditVerdictRecords;
    mapping(uint256 vaultId => mapping(uint8 round => uint256 count)) private _challengeCounts;
    mapping(
        uint256 vaultId
            => mapping(uint8 round => mapping(uint256 challengeId => ProofOfVaultTypes.ChallengeRecord challenge))
    ) private _challengeRecords;
    mapping(uint256 vaultId => mapping(uint8 round => uint256 count)) private _openChallengeCounts;
    mapping(uint256 vaultId => mapping(uint8 round => mapping(address target => bool successful))) private
        _successfulChallengeTargets;

    event OrchestratorAuthorizationUpdated(address indexed orchestrator, bool allowed);
    event CriteriaRegistered(
        uint256 indexed vaultId, bytes32 indexed criteriaHash, string metadataURI, address indexed approvedBy
    );
    event ResolutionSubmitted(
        uint256 indexed vaultId,
        ProofOfVaultTypes.ResolutionOutcome indexed outcome,
        bytes32 indexed resolutionHash,
        address submittedBy,
        string payloadURI,
        uint64 disputeWindowEnd
    );
    event ResolutionDisputed(uint256 indexed vaultId, string reasonURI);
    event ResolutionFinalized(
        uint256 indexed vaultId,
        ProofOfVaultTypes.ResolutionOutcome indexed outcome,
        bytes32 indexed resolutionHash,
        address submittedBy
    );
    event ResolutionCommitRecorded(
        uint256 indexed vaultId, uint8 indexed round, address indexed validator, bytes32 commitHash
    );
    event ResolutionRevealRecorded(
        uint256 indexed vaultId,
        uint8 indexed round,
        address indexed validator,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        string payloadURI,
        bool disqualified
    );
    event AuditVerdictRecorded(
        uint256 indexed vaultId,
        uint8 indexed round,
        address indexed validator,
        address auditor,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string payloadURI
    );
    event ChallengeOpened(
        uint256 indexed vaultId,
        uint8 indexed round,
        uint256 indexed challengeId,
        address challenger,
        address target,
        bytes32 challengeHash,
        string payloadURI,
        uint256 bondAmount
    );
    event ChallengeResolved(
        uint256 indexed vaultId,
        uint8 indexed round,
        uint256 indexed challengeId,
        ProofOfVaultTypes.ChallengeStatus status
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyOrchestrator() {
        if (!authorizedOrchestrators[msg.sender]) {
            revert NotAuthorizedOrchestrator(msg.sender);
        }
        _;
    }

    function setAuthorizedOrchestrator(address orchestrator, bool allowed) external onlyOwner {
        authorizedOrchestrators[orchestrator] = allowed;
        emit OrchestratorAuthorizationUpdated(orchestrator, allowed);
    }

    function registerCriteria(uint256 vaultId, bytes32 criteriaHash, string calldata metadataURI, address approvedBy)
        external
        onlyOrchestrator
    {
        if (vaultId == 0) revert InvalidVaultId(vaultId);
        if (_criteriaRecords[vaultId].criteriaHash != bytes32(0)) revert CriteriaAlreadyRegistered(vaultId);

        _criteriaRecords[vaultId] = ProofOfVaultTypes.CriteriaRecord({
            criteriaHash: criteriaHash,
            metadataURI: metadataURI,
            approvedBy: approvedBy,
            approvedAt: uint64(block.timestamp)
        });

        emit CriteriaRegistered(vaultId, criteriaHash, metadataURI, approvedBy);
    }

    function submitResolutionHash(
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 resolutionHash,
        string calldata payloadURI,
        address submittedBy,
        uint64 disputeWindowEnd
    ) external onlyOrchestrator {
        ProofOfVaultTypes.ResolutionRecord storage existingResolution = _resolutionRecords[vaultId];

        if (vaultId == 0) revert InvalidVaultId(vaultId);
        if (existingResolution.finalized) revert ResolutionAlreadyFinalized(vaultId);
        if (existingResolution.submittedAt != 0 && !existingResolution.disputed) {
            revert ActiveResolutionExists(vaultId);
        }
        if (outcome == ProofOfVaultTypes.ResolutionOutcome.None) revert InvalidOutcome();
        if (resolutionHash == bytes32(0)) revert InvalidResolutionHash();
        if (submittedBy == address(0)) revert InvalidSubmittedBy();
        if (disputeWindowEnd <= block.timestamp) revert InvalidDisputeWindow(disputeWindowEnd);

        _resolutionRecords[vaultId] = ProofOfVaultTypes.ResolutionRecord({
            outcome: outcome,
            resolutionHash: resolutionHash,
            payloadURI: payloadURI,
            submittedBy: submittedBy,
            submittedAt: uint64(block.timestamp),
            disputeWindowEnd: disputeWindowEnd,
            disputed: false,
            finalized: false,
            disputeReasonURI: ""
        });

        emit ResolutionSubmitted(vaultId, outcome, resolutionHash, submittedBy, payloadURI, disputeWindowEnd);
    }

    function markDisputed(uint256 vaultId, string calldata reasonURI) external onlyOrchestrator {
        ProofOfVaultTypes.ResolutionRecord storage resolution = _resolutionRecords[vaultId];
        if (resolution.submittedAt == 0) revert NoResolutionSubmitted(vaultId);
        if (bytes(reasonURI).length == 0) revert DisputeReasonRequired();

        resolution.disputed = true;
        resolution.finalized = false;
        resolution.disputeReasonURI = reasonURI;

        emit ResolutionDisputed(vaultId, reasonURI);
    }

    function finalizeResolution(uint256 vaultId)
        external
        onlyOrchestrator
        returns (ProofOfVaultTypes.ResolutionOutcome outcome, bytes32 resolutionHash, address submittedBy)
    {
        ProofOfVaultTypes.ResolutionRecord storage resolution = _resolutionRecords[vaultId];
        if (resolution.submittedAt == 0) revert NoResolutionSubmitted(vaultId);
        if (resolution.finalized) revert ResolutionAlreadyFinalized(vaultId);
        if (resolution.disputed) revert ResolutionInDispute(vaultId);
        if (block.timestamp < resolution.disputeWindowEnd) {
            revert DisputeWindowStillOpen(resolution.disputeWindowEnd);
        }

        resolution.finalized = true;

        emit ResolutionFinalized(vaultId, resolution.outcome, resolution.resolutionHash, resolution.submittedBy);
        return (resolution.outcome, resolution.resolutionHash, resolution.submittedBy);
    }

    function recordCommit(uint256 vaultId, uint8 round, address validator, bytes32 commitHash)
        external
        onlyOrchestrator
    {
        if (commitHash == bytes32(0)) revert InvalidCommitHash();

        ProofOfVaultTypes.CommitRecord storage record = _commitRecords[vaultId][round][validator];
        if (record.committedAt != 0) revert CommitAlreadySubmitted(vaultId, round, validator);

        _commitRecords[vaultId][round][validator] = ProofOfVaultTypes.CommitRecord({
            commitHash: commitHash, committedAt: uint64(block.timestamp), revealed: false, disqualified: false
        });

        emit ResolutionCommitRecorded(vaultId, round, validator, commitHash);
    }

    function recordReveal(
        uint256 vaultId,
        uint8 round,
        address validator,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 proofHash,
        string calldata payloadURI,
        bool disqualified
    ) external onlyOrchestrator {
        if (outcome == ProofOfVaultTypes.ResolutionOutcome.None) revert InvalidOutcome();
        if (proofHash == bytes32(0)) revert InvalidProofHash();

        ProofOfVaultTypes.CommitRecord storage commitRecord = _commitRecords[vaultId][round][validator];
        if (commitRecord.committedAt == 0) revert CommitNotFound(vaultId, round, validator);
        if (commitRecord.revealed) revert RevealAlreadySubmitted(vaultId, round, validator);

        _revealRecords[vaultId][round][validator] = ProofOfVaultTypes.RevealRecord({
            outcome: outcome,
            proofHash: proofHash,
            payloadURI: payloadURI,
            revealedAt: uint64(block.timestamp),
            submitted: true
        });

        commitRecord.revealed = true;
        commitRecord.disqualified = disqualified;

        emit ResolutionRevealRecorded(vaultId, round, validator, outcome, proofHash, payloadURI, disqualified);
    }

    function recordAuditVerdict(
        uint256 vaultId,
        uint8 round,
        address validator,
        address auditor,
        ProofOfVaultTypes.AuditVerdict verdict,
        bytes32 verdictHash,
        string calldata payloadURI
    ) external onlyOrchestrator {
        if (verdict == ProofOfVaultTypes.AuditVerdict.None) revert InvalidVerdict();
        if (verdictHash == bytes32(0)) revert InvalidResolutionHash();

        ProofOfVaultTypes.AuditVerdictRecord storage record = _auditVerdictRecords[vaultId][round][validator][auditor];
        if (record.submitted) {
            revert AuditVerdictAlreadySubmitted(vaultId, round, validator, auditor);
        }

        _auditVerdictRecords[vaultId][round][validator][auditor] = ProofOfVaultTypes.AuditVerdictRecord({
            verdict: verdict,
            verdictHash: verdictHash,
            payloadURI: payloadURI,
            submittedAt: uint64(block.timestamp),
            submitted: true
        });

        emit AuditVerdictRecorded(vaultId, round, validator, auditor, verdict, verdictHash, payloadURI);
    }

    function openChallenge(
        uint256 vaultId,
        uint8 round,
        address challenger,
        address target,
        bytes32 challengeHash,
        string calldata payloadURI,
        uint256 bondAmount
    ) external onlyOrchestrator returns (uint256 challengeId) {
        if (challengeHash == bytes32(0)) revert InvalidResolutionHash();
        if (bondAmount == 0) revert InvalidChallengeBond(bondAmount);

        challengeId = ++_challengeCounts[vaultId][round];
        _openChallengeCounts[vaultId][round] += 1;
        _challengeRecords[vaultId][round][challengeId] = ProofOfVaultTypes.ChallengeRecord({
            challenger: challenger,
            target: target,
            challengeHash: challengeHash,
            payloadURI: payloadURI,
            bondAmount: bondAmount,
            openedAt: uint64(block.timestamp),
            status: ProofOfVaultTypes.ChallengeStatus.Open
        });

        emit ChallengeOpened(vaultId, round, challengeId, challenger, target, challengeHash, payloadURI, bondAmount);
    }

    function resolveChallenge(
        uint256 vaultId,
        uint8 round,
        uint256 challengeId,
        ProofOfVaultTypes.ChallengeStatus status
    ) external onlyOrchestrator {
        ProofOfVaultTypes.ChallengeRecord storage challenge = _challengeRecords[vaultId][round][challengeId];
        if (challenge.openedAt == 0) revert ChallengeNotFound(vaultId, round, challengeId);
        if (challenge.status != ProofOfVaultTypes.ChallengeStatus.Open) {
            revert ChallengeAlreadyResolved(vaultId, round, challengeId);
        }
        if (
            status != ProofOfVaultTypes.ChallengeStatus.ResolvedSuccess
                && status != ProofOfVaultTypes.ChallengeStatus.ResolvedFailure
        ) revert InvalidVerdict();

        challenge.status = status;
        _openChallengeCounts[vaultId][round] -= 1;
        if (status == ProofOfVaultTypes.ChallengeStatus.ResolvedSuccess) {
            _successfulChallengeTargets[vaultId][round][challenge.target] = true;
        }
        emit ChallengeResolved(vaultId, round, challengeId, status);
    }

    function storeFinalResolution(
        uint256 vaultId,
        ProofOfVaultTypes.ResolutionOutcome outcome,
        bytes32 resolutionHash,
        string calldata payloadURI,
        address submittedBy
    ) external onlyOrchestrator {
        if (outcome == ProofOfVaultTypes.ResolutionOutcome.None) revert InvalidOutcome();
        if (resolutionHash == bytes32(0)) revert InvalidResolutionHash();
        if (submittedBy == address(0)) revert InvalidSubmittedBy();

        _resolutionRecords[vaultId] = ProofOfVaultTypes.ResolutionRecord({
            outcome: outcome,
            resolutionHash: resolutionHash,
            payloadURI: payloadURI,
            submittedBy: submittedBy,
            submittedAt: uint64(block.timestamp),
            disputeWindowEnd: uint64(block.timestamp),
            disputed: false,
            finalized: true,
            disputeReasonURI: ""
        });

        emit ResolutionFinalized(vaultId, outcome, resolutionHash, submittedBy);
    }

    function criteriaOf(uint256 vaultId) external view returns (ProofOfVaultTypes.CriteriaRecord memory) {
        return _criteriaRecords[vaultId];
    }

    function resolutionOf(uint256 vaultId) external view returns (ProofOfVaultTypes.ResolutionRecord memory) {
        return _resolutionRecords[vaultId];
    }

    function commitOf(uint256 vaultId, uint8 round, address validator)
        external
        view
        returns (ProofOfVaultTypes.CommitRecord memory)
    {
        return _commitRecords[vaultId][round][validator];
    }

    function revealOf(uint256 vaultId, uint8 round, address validator)
        external
        view
        returns (ProofOfVaultTypes.RevealRecord memory)
    {
        return _revealRecords[vaultId][round][validator];
    }

    function auditVerdictOf(uint256 vaultId, uint8 round, address validator, address auditor)
        external
        view
        returns (ProofOfVaultTypes.AuditVerdictRecord memory)
    {
        return _auditVerdictRecords[vaultId][round][validator][auditor];
    }

    function challengeOf(uint256 vaultId, uint8 round, uint256 challengeId)
        external
        view
        returns (ProofOfVaultTypes.ChallengeRecord memory)
    {
        return _challengeRecords[vaultId][round][challengeId];
    }

    function challengeCountOf(uint256 vaultId, uint8 round) external view returns (uint256) {
        return _challengeCounts[vaultId][round];
    }

    function openChallengeCountOf(uint256 vaultId, uint8 round) external view returns (uint256) {
        return _openChallengeCounts[vaultId][round];
    }

    function hasSuccessfulChallengeAgainst(uint256 vaultId, uint8 round, address target) external view returns (bool) {
        return _successfulChallengeTargets[vaultId][round][target];
    }
}
