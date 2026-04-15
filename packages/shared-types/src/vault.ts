import { z } from "zod";

import { agentProfileSchema, executionTraceSchema } from "./agent.js";
import {
  addressSchema,
  chainIdSchema,
  committeeRoleSchema,
  finalResolutionResultSchema,
  hashSchema,
  slashReasonCodeSchema,
  stringAmountSchema,
  timestampSchema,
  uriSchema,
  vaultStatusSchema,
  workflowTaskAssigneeTypeSchema,
  workflowTaskStageSchema,
  workflowTaskStatusSchema
} from "./enums.js";
import {
  agentSubmissionSchema,
  consensusMetricsSchema,
  proofReferenceSchema
} from "./submission.js";
import { onchainVaultSnapshotSchema } from "./runtime.js";

export const ruleCommitteeSchema = z.object({
  makers: z.array(addressSchema).default([]),
  verifiers: z.array(addressSchema).default([]),
  draftDeadlineAt: timestampSchema.optional(),
  issueDeadlineAt: timestampSchema.optional(),
  orchestratorAddress: addressSchema.optional()
});

export const resolutionCommitteeSchema = z.object({
  validators: z.array(addressSchema).default([]),
  auditors: z.array(addressSchema).default([]),
  commitDeadlineAt: timestampSchema.optional(),
  revealDeadlineAt: timestampSchema.optional(),
  auditDeadlineAt: timestampSchema.optional(),
  challengeDeadlineAt: timestampSchema.optional(),
  minValidCount: z.coerce.number().int().positive().default(2),
  orchestratorAddress: addressSchema.optional()
});

export const finalResolutionSchema = z.object({
  result: finalResolutionResultSchema,
  confidenceScore: z.number().min(0).max(1),
  finalizedAt: timestampSchema,
  reason: z.string().min(1),
  slashCandidates: z.array(
    z.object({
      agentAddress: addressSchema,
      role: committeeRoleSchema,
      reasonCode: slashReasonCodeSchema,
      evidencePayloadHash: hashSchema.optional(),
      notes: z.array(z.string()).default([])
    })
  )
});

export const workflowTaskSchema = z.object({
  id: z.string().min(1),
  vaultId: z.string().min(1),
  stage: workflowTaskStageSchema,
  assigneeType: workflowTaskAssigneeTypeSchema,
  assigneeAddress: addressSchema.optional(),
  title: z.string().min(1),
  status: workflowTaskStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const vaultSummarySchema = z.object({
  id: z.string().min(1),
  externalVaultId: z.number().int().nonnegative().optional(),
  chainId: chainIdSchema,
  legacyMode: z.boolean().default(false),
  setterAddress: addressSchema.optional(),
  status: vaultStatusSchema,
  statement: z.string().optional(),
  metadataURI: uriSchema,
  collateralToken: addressSchema.optional(),
  collateralDecimals: z.coerce.number().int().min(0).max(255).optional(),
  grossCollateralAmount: stringAmountSchema.default("0"),
  settlementTime: timestampSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  ruleRound: z.coerce.number().int().nonnegative().default(1),
  resolutionRound: z.coerce.number().int().nonnegative().default(1),
  rejectionCount: z.coerce.number().int().nonnegative().default(0),
  criteriaHash: hashSchema.optional(),
  ruleCommittee: ruleCommitteeSchema.optional(),
  resolutionCommittee: resolutionCommitteeSchema.optional(),
  finalResolution: finalResolutionSchema.optional(),
  onchainSnapshot: onchainVaultSnapshotSchema.optional(),
  traces: z.array(executionTraceSchema).default([])
});

export const vaultDetailSchema = vaultSummarySchema.extend({
  submissions: z.array(agentSubmissionSchema).default([]),
  proofs: z.array(proofReferenceSchema).default([]),
  consensusMetrics: consensusMetricsSchema.optional(),
  agentProfiles: z.array(agentProfileSchema).default([]),
  tasks: z.array(workflowTaskSchema).default([])
});

export const createVaultRequestSchema = z.object({
  mode: z.enum(["draft", "register_onchain"]).default("draft"),
  externalVaultId: z.coerce.number().int().nonnegative().optional(),
  chainId: chainIdSchema,
  legacyMode: z.boolean().default(false),
  setterAddress: addressSchema.optional(),
  statement: z.string().optional(),
  metadataURI: uriSchema,
  collateralToken: addressSchema.optional(),
  collateralDecimals: z.coerce.number().int().min(0).max(255).optional(),
  grossCollateralAmount: stringAmountSchema.default("0"),
  setupDepositAmount: stringAmountSchema.optional(),
  settlementTime: timestampSchema.optional(),
  initialTrace: executionTraceSchema.optional()
});

export const registerRuleCommitteeRequestSchema = z.object({
  candidateAgents: z.array(agentProfileSchema).default([]),
  makerCount: z.coerce.number().int().positive().default(2),
  verifierCount: z.coerce.number().int().positive().default(2),
  draftDeadlineAt: timestampSchema.optional(),
  issueDeadlineAt: timestampSchema.optional(),
  orchestratorAddress: addressSchema.optional()
});

export const finalizeRuleSetRequestSchema = z.object({
  orchestratorAddress: addressSchema.optional(),
  metadataURI: uriSchema.default("ipfs://proof-of-vault/criteria-final"),
  finalSourcePolicy: z.record(z.string(), z.unknown()).default({})
});

export const ruleSetDecisionRequestSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  setterAddress: addressSchema.optional(),
  reasonURI: uriSchema.optional()
});

export const registerResolutionCommitteeRequestSchema = z.object({
  candidateAgents: z.array(agentProfileSchema).default([]),
  validatorCount: z.coerce.number().int().positive().default(3),
  auditorCount: z.coerce.number().int().positive().default(2),
  commitDeadlineAt: timestampSchema.optional(),
  revealDeadlineAt: timestampSchema.optional(),
  auditDeadlineAt: timestampSchema.optional(),
  challengeDeadlineAt: timestampSchema.optional(),
  minValidCount: z.coerce.number().int().positive().default(2),
  orchestratorAddress: addressSchema.optional()
});

export const challengeResolutionSchema = z.object({
  submissionId: z.string().min(1),
  challengeId: z.coerce.number().int().positive().optional(),
  successful: z.boolean(),
  targetRole: committeeRoleSchema,
  reasonCode: slashReasonCodeSchema,
  slashAmount: stringAmountSchema.default("0")
});

export const finalizeResolutionRequestSchema = z.object({
  finalizerAddress: addressSchema.optional(),
  reopenOnInsufficientEvidence: z.boolean().default(true),
  challengeResolutions: z.array(challengeResolutionSchema).default([])
});

export type RuleCommittee = z.infer<typeof ruleCommitteeSchema>;
export type ResolutionCommittee = z.infer<typeof resolutionCommitteeSchema>;
export type FinalResolution = z.infer<typeof finalResolutionSchema>;
export type WorkflowTask = z.infer<typeof workflowTaskSchema>;
export type VaultSummary = z.infer<typeof vaultSummarySchema>;
export type VaultDetail = z.infer<typeof vaultDetailSchema>;
export type CreateVaultRequest = z.infer<typeof createVaultRequestSchema>;
export type RegisterRuleCommitteeRequest = z.infer<typeof registerRuleCommitteeRequestSchema>;
export type FinalizeRuleSetRequest = z.infer<typeof finalizeRuleSetRequestSchema>;
export type RuleSetDecisionRequest = z.infer<typeof ruleSetDecisionRequestSchema>;
export type RegisterResolutionCommitteeRequest = z.infer<typeof registerResolutionCommitteeRequestSchema>;
export type ChallengeResolution = z.infer<typeof challengeResolutionSchema>;
export type FinalizeResolutionRequest = z.infer<typeof finalizeResolutionRequestSchema>;
