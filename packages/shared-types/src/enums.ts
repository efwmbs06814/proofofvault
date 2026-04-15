import { z } from "zod";

export const vaultStatusValues = [
  "DraftRequest",
  "RuleAuction",
  "RuleDrafting",
  "UserRuleReview",
  "PendingFunding",
  "Active",
  "ResolutionAuction",
  "CommitPhase",
  "RevealPhase",
  "AuditPhase",
  "PublicChallenge",
  "Resolving",
  "ResolvedTrue",
  "ResolvedFalse",
  "ResolvedInvalid",
  "Disputed",
  "Cancelled"
] as const;

export const resolutionOutcomeValues = ["None", "True", "False", "Invalid"] as const;
export const finalResolutionResultValues = ["TRUE", "FALSE", "INVALID"] as const;
export const committeeRoleValues = [
  "None",
  "RuleMaker",
  "RuleVerifier",
  "ResolutionValidator",
  "ResolutionAuditor"
] as const;
export const issueSeverityValues = ["None", "Low", "Medium", "High", "Critical"] as const;
export const issueSeverityLabelValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const auditVerdictValues = ["None", "Valid", "Questionable", "Invalid", "Malicious"] as const;
export const auditVerdictLabelValues = ["VALID", "QUESTIONABLE", "INVALID", "MALICIOUS"] as const;
export const challengeStatusValues = ["None", "Open", "ResolvedSuccess", "ResolvedFailure"] as const;
export const slashReasonCodeValues = [
  "None",
  "CommitRevealMismatch",
  "ForbiddenSource",
  "InvalidProof",
  "MaliciousResolution",
  "InvalidRuleSet",
  "VerifierMisconduct",
  "ChallengeAbuse",
  "NonParticipation",
  "ManualReview"
] as const;
export const submissionKindValues = [
  "rule_draft",
  "rule_issue",
  "resolution_commit",
  "resolution_reveal",
  "audit_verdict",
  "public_challenge"
] as const;
export const workflowTaskStageValues = [
  "rule_committee_registration",
  "rule_drafting",
  "rule_review",
  "resolution_committee_registration",
  "resolution_commit",
  "resolution_reveal",
  "audit_review",
  "public_challenge",
  "finalization",
  "reward_claim"
] as const;
export const workflowTaskAssigneeTypeValues = [
  "agent",
  "orchestrator",
  "setter",
  "finalizer",
  "challenger"
] as const;
export const workflowTaskStatusValues = ["pending", "completed", "blocked"] as const;

export const DEFAULT_TARGET_EVM_CHAIN_ID = 196;
export const DEFAULT_OKX_CHAIN_INDEX = 196;

export const chainIdSchema = z.number().int().positive().default(DEFAULT_TARGET_EVM_CHAIN_ID);
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Expected an EVM address.");
export const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Expected a bytes32 hex string.");
export const txHashSchema = hashSchema;
export const uriSchema = z.string().min(1);
export const stringAmountSchema = z.union([z.string().min(1), z.number(), z.bigint()]).transform((value) =>
  value.toString()
);
export const timestampSchema = z.coerce.number().int().nonnegative();

export const vaultStatusSchema = z.enum(vaultStatusValues);
export const resolutionOutcomeSchema = z.enum(resolutionOutcomeValues);
export const finalResolutionResultSchema = z.enum(finalResolutionResultValues);
export const committeeRoleSchema = z.enum(committeeRoleValues);
export const issueSeveritySchema = z.enum(issueSeverityValues);
export const issueSeverityLabelSchema = z.enum(issueSeverityLabelValues);
export const auditVerdictSchema = z.enum(auditVerdictValues);
export const auditVerdictLabelSchema = z.enum(auditVerdictLabelValues);
export const challengeStatusSchema = z.enum(challengeStatusValues);
export const slashReasonCodeSchema = z.enum(slashReasonCodeValues);
export const submissionKindSchema = z.enum(submissionKindValues);
export const workflowTaskStageSchema = z.enum(workflowTaskStageValues);
export const workflowTaskAssigneeTypeSchema = z.enum(workflowTaskAssigneeTypeValues);
export const workflowTaskStatusSchema = z.enum(workflowTaskStatusValues);

export type VaultStatus = z.infer<typeof vaultStatusSchema>;
export type ResolutionOutcome = z.infer<typeof resolutionOutcomeSchema>;
export type FinalResolutionResult = z.infer<typeof finalResolutionResultSchema>;
export type CommitteeRole = z.infer<typeof committeeRoleSchema>;
export type IssueSeverity = z.infer<typeof issueSeveritySchema>;
export type IssueSeverityLabel = z.infer<typeof issueSeverityLabelSchema>;
export type AuditVerdict = z.infer<typeof auditVerdictSchema>;
export type AuditVerdictLabel = z.infer<typeof auditVerdictLabelSchema>;
export type ChallengeStatus = z.infer<typeof challengeStatusSchema>;
export type SlashReasonCode = z.infer<typeof slashReasonCodeSchema>;
export type SubmissionKind = z.infer<typeof submissionKindSchema>;
export type WorkflowTaskStage = z.infer<typeof workflowTaskStageSchema>;
export type WorkflowTaskAssigneeType = z.infer<typeof workflowTaskAssigneeTypeSchema>;
export type WorkflowTaskStatus = z.infer<typeof workflowTaskStatusSchema>;
