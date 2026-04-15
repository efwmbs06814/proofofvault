// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library ProofOfVaultTypes {
    enum VaultStatus {
        DraftRequest,
        RuleAuction,
        RuleDrafting,
        UserRuleReview,
        PendingFunding,
        Active,
        ResolutionAuction,
        CommitPhase,
        RevealPhase,
        AuditPhase,
        PublicChallenge,
        Resolving,
        ResolvedTrue,
        ResolvedFalse,
        ResolvedInvalid,
        Disputed,
        Cancelled
    }

    enum ResolutionOutcome {
        None,
        True,
        False,
        Invalid
    }

    enum SlashReasonCode {
        None,
        CommitRevealMismatch,
        ForbiddenSource,
        InvalidProof,
        MaliciousResolution,
        InvalidRuleSet,
        VerifierMisconduct,
        ChallengeAbuse,
        NonParticipation,
        ManualReview
    }

    enum CommitteeRole {
        None,
        RuleMaker,
        RuleVerifier,
        ResolutionValidator,
        ResolutionAuditor
    }

    enum IssueSeverity {
        None,
        Low,
        Medium,
        High,
        Critical
    }

    enum AuditVerdict {
        None,
        Valid,
        Questionable,
        Invalid,
        Malicious
    }

    enum ChallengeStatus {
        None,
        Open,
        ResolvedSuccess,
        ResolvedFailure
    }

    struct VaultRecord {
        address setter;
        address collateralToken;
        uint256 grossCollateralAmount;
        uint256 lockedCollateralAmount;
        uint256 setupDepositAmount;
        uint256 resolutionRewardDepositAmount;
        uint64 settlementTime;
        uint64 createdAt;
        uint64 activatedAt;
        bytes32 criteriaHash;
        string metadataURI;
        VaultStatus status;
        bool legacyMode;
        bool ruleSetAccepted;
        uint8 ruleRound;
        uint8 resolutionRound;
        uint8 rejectionCount;
    }

    struct CriteriaRecord {
        bytes32 criteriaHash;
        string metadataURI;
        address approvedBy;
        uint64 approvedAt;
    }

    struct ResolutionRecord {
        ResolutionOutcome outcome;
        bytes32 resolutionHash;
        string payloadURI;
        address submittedBy;
        uint64 submittedAt;
        uint64 disputeWindowEnd;
        bool disputed;
        bool finalized;
        string disputeReasonURI;
    }

    struct AgentStakeState {
        uint256 activeStake;
        uint256 lockedTaskStake;
        uint256 pendingWithdrawal;
        uint64 withdrawalReadyAt;
    }

    struct TaskBondRecord {
        uint256 amount;
        uint256 slashedAmount;
        bool active;
    }

    struct RuleDraftRecord {
        bytes32 draftHash;
        string payloadURI;
        uint64 submittedAt;
        bool submitted;
    }

    struct RuleIssueRecord {
        IssueSeverity severity;
        bytes32 issueHash;
        string payloadURI;
        uint64 submittedAt;
        bool submitted;
    }

    struct CommitRecord {
        bytes32 commitHash;
        uint64 committedAt;
        bool revealed;
        bool disqualified;
    }

    struct RevealRecord {
        ResolutionOutcome outcome;
        bytes32 proofHash;
        string payloadURI;
        uint64 revealedAt;
        bool submitted;
    }

    struct AuditVerdictRecord {
        AuditVerdict verdict;
        bytes32 verdictHash;
        string payloadURI;
        uint64 submittedAt;
        bool submitted;
    }

    struct ChallengeRecord {
        address challenger;
        address target;
        bytes32 challengeHash;
        string payloadURI;
        uint256 bondAmount;
        uint64 openedAt;
        ChallengeStatus status;
    }
}
