import { z } from "zod";

import { executionTraceSchema } from "./agent.js";
import {
  addressSchema,
  auditVerdictLabelSchema,
  chainIdSchema,
  committeeRoleSchema,
  finalResolutionResultSchema,
  hashSchema,
  issueSeverityLabelSchema,
  slashReasonCodeSchema,
  stringAmountSchema,
  submissionKindSchema,
  timestampSchema,
  uriSchema
} from "./enums.js";

export const sourceSnapshotSchema = z.object({
  provider: z.string().min(1),
  kind: z.string().min(1).optional(),
  value: z.string().optional(),
  timestamp: z.string().optional(),
  uri: uriSchema.optional(),
  chainId: chainIdSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const proofReferenceSchema = z.object({
  payloadHash: hashSchema,
  payloadURI: uriSchema,
  proofHash: hashSchema.optional(),
  sourceProvider: z.string().min(1),
  txHash: hashSchema.optional(),
  chainId: chainIdSchema,
  snapshot: z.array(sourceSnapshotSchema).default([]),
  storedAt: timestampSchema
});

export const submissionValidationSchema = z.object({
  commitHash: hashSchema.optional(),
  expectedCommitHash: hashSchema.optional(),
  commitMatchesReveal: z.boolean().optional(),
  notes: z.array(z.string()).default([])
});

export const slashCandidateSchema = z.object({
  agentAddress: addressSchema,
  role: committeeRoleSchema,
  reasonCode: slashReasonCodeSchema,
  evidencePayloadHash: hashSchema.optional(),
  notes: z.array(z.string()).default([])
});

export const ruleDraftPayloadSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().nonnegative().default(0),
  template: z.string().min(1),
  statement: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).default({}),
  sources: z.array(sourceSnapshotSchema).default([]),
  version: z.coerce.number().int().positive().default(1)
});

export const ruleIssuePayloadSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().nonnegative().default(0),
  severity: issueSeverityLabelSchema,
  issueType: z.string().min(1),
  notes: z.string().min(1),
  version: z.coerce.number().int().positive().default(1)
});

export const criteriaFinalPayloadSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().positive(),
  criteriaHash: hashSchema,
  approvedDrafts: z.array(hashSchema).default([]),
  acceptedIssues: z.array(hashSchema).default([]),
  finalSourcePolicy: z.record(z.string(), z.unknown()).default({}),
  version: z.coerce.number().int().positive().default(1)
});

export const resolutionCommitPayloadSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().nonnegative().default(0),
  outcome: finalResolutionResultSchema,
  proofHash: hashSchema,
  salt: hashSchema,
  submittedByAgent: addressSchema,
  version: z.coerce.number().int().positive().default(1)
});

export const resolutionRevealPayloadSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().nonnegative().default(0),
  result: finalResolutionResultSchema,
  confidenceScore: z.number().min(0).max(1),
  sources: z.array(sourceSnapshotSchema).default([]),
  reasoning: z.string().min(1),
  submittedByAgent: addressSchema,
  version: z.coerce.number().int().positive().default(1)
});

export const auditVerdictPayloadSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().nonnegative().default(0),
  validator: addressSchema,
  verdict: auditVerdictLabelSchema,
  findings: z.array(z.string()).default([]),
  reviewerAgent: addressSchema,
  version: z.coerce.number().int().positive().default(1)
});

export const publicChallengePayloadSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().nonnegative().default(0),
  target: addressSchema,
  targetRole: committeeRoleSchema,
  reason: z.string().min(1),
  evidence: z.array(sourceSnapshotSchema).default([]),
  challenger: addressSchema,
  version: z.coerce.number().int().positive().default(1)
});

const submissionBaseSchema = z.object({
  id: z.string().min(1).optional(),
  vaultId: z.coerce.number().int().nonnegative(),
  round: z.coerce.number().int().nonnegative().default(0),
  agentAddress: addressSchema,
  payloadURI: uriSchema,
  payloadHash: hashSchema.optional(),
  txHash: hashSchema.optional(),
  createdAt: timestampSchema.optional(),
  proof: proofReferenceSchema.optional(),
  executionTrace: executionTraceSchema.optional(),
  validation: submissionValidationSchema.optional()
});

export const ruleDraftSubmissionSchema = submissionBaseSchema.extend({
  kind: z.literal("rule_draft"),
  payload: ruleDraftPayloadSchema
});

export const ruleIssueSubmissionSchema = submissionBaseSchema.extend({
  kind: z.literal("rule_issue"),
  payload: ruleIssuePayloadSchema
});

export const resolutionCommitSubmissionSchema = submissionBaseSchema.extend({
  kind: z.literal("resolution_commit"),
  payload: resolutionCommitPayloadSchema
});

export const resolutionRevealSubmissionSchema = submissionBaseSchema.extend({
  kind: z.literal("resolution_reveal"),
  proofHash: hashSchema.optional(),
  payload: resolutionRevealPayloadSchema,
  salt: hashSchema
});

export const auditVerdictSubmissionSchema = submissionBaseSchema.extend({
  kind: z.literal("audit_verdict"),
  payload: auditVerdictPayloadSchema
});

export const publicChallengeSubmissionSchema = submissionBaseSchema.extend({
  kind: z.literal("public_challenge"),
  payload: publicChallengePayloadSchema,
  status: z.enum(["open", "resolved_success", "resolved_failure"]).default("open"),
  bondAmount: stringAmountSchema.optional()
});

export const agentSubmissionSchema = z.discriminatedUnion("kind", [
  ruleDraftSubmissionSchema,
  ruleIssueSubmissionSchema,
  resolutionCommitSubmissionSchema,
  resolutionRevealSubmissionSchema,
  auditVerdictSubmissionSchema,
  publicChallengeSubmissionSchema
]);

export const consensusMetricsSchema = z.object({
  round: z.coerce.number().int().positive(),
  minValidCount: z.coerce.number().int().positive(),
  revealCount: z.coerce.number().int().nonnegative(),
  validCount: z.coerce.number().int().nonnegative(),
  questionableCount: z.coerce.number().int().nonnegative(),
  invalidCount: z.coerce.number().int().nonnegative(),
  maliciousCount: z.coerce.number().int().nonnegative(),
  missingAuditCount: z.coerce.number().int().nonnegative(),
  readyForFinality: z.boolean(),
  needsRoundReopen: z.boolean(),
  decidedOutcome: finalResolutionResultSchema.optional(),
  confidenceScore: z.number().min(0).max(1),
  slashCandidates: z.array(slashCandidateSchema).default([])
});

export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;
export type ProofReference = z.infer<typeof proofReferenceSchema>;
export type SubmissionValidation = z.infer<typeof submissionValidationSchema>;
export type SlashCandidate = z.infer<typeof slashCandidateSchema>;
export type RuleDraftPayload = z.infer<typeof ruleDraftPayloadSchema>;
export type RuleIssuePayload = z.infer<typeof ruleIssuePayloadSchema>;
export type CriteriaFinalPayload = z.infer<typeof criteriaFinalPayloadSchema>;
export type ResolutionCommitPayload = z.infer<typeof resolutionCommitPayloadSchema>;
export type ResolutionRevealPayload = z.infer<typeof resolutionRevealPayloadSchema>;
export type AuditVerdictPayload = z.infer<typeof auditVerdictPayloadSchema>;
export type PublicChallengePayload = z.infer<typeof publicChallengePayloadSchema>;
export type RuleDraftSubmission = z.infer<typeof ruleDraftSubmissionSchema>;
export type RuleIssueSubmission = z.infer<typeof ruleIssueSubmissionSchema>;
export type ResolutionCommitSubmission = z.infer<typeof resolutionCommitSubmissionSchema>;
export type ResolutionRevealSubmission = z.infer<typeof resolutionRevealSubmissionSchema>;
export type AuditVerdictSubmission = z.infer<typeof auditVerdictSubmissionSchema>;
export type PublicChallengeSubmission = z.infer<typeof publicChallengeSubmissionSchema>;
export type AgentSubmission = z.infer<typeof agentSubmissionSchema>;
export type ConsensusMetrics = z.infer<typeof consensusMetricsSchema>;
