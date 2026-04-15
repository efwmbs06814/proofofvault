import { z } from "zod";

import { capabilityTagSchema, agentStatusSchema, walletProviderSchema } from "./agent.js";
import { addressSchema, chainIdSchema, stringAmountSchema, timestampSchema } from "./enums.js";

export const agentRegistrationStatusValues = [
  "challenge_issued",
  "pre_registered",
  "judge_listed",
  "disabled"
] as const;

export const walletSignatureActionValues = ["signPreRegistration", "signLogin"] as const;

export const agentRegistrationStatusSchema = z.enum(agentRegistrationStatusValues);
export const walletSignatureActionSchema = z.enum(walletSignatureActionValues);
export const signatureSchema = z.string().regex(/^0x[a-fA-F0-9]+$/, "Expected a hex signature.");

export const walletSignatureProofSchema = z.object({
  action: walletSignatureActionSchema,
  walletAddress: addressSchema,
  chainId: chainIdSchema,
  nonce: z.string().min(8),
  message: z.string().min(1),
  signature: signatureSchema,
  sourceProvider: z.string().min(1),
  signedAt: timestampSchema,
  verifiedAt: timestampSchema.optional()
});

export const preRegistrationChallengeRequestSchema = z.object({
  walletAddress: addressSchema,
  agentLabel: z.string().min(1),
  capabilityTags: z.array(capabilityTagSchema).min(1),
  chainId: chainIdSchema
});

export const preRegistrationChallengeSchema = z.object({
  nonce: z.string().min(8),
  walletAddress: addressSchema,
  agentLabel: z.string().min(1),
  capabilityTags: z.array(capabilityTagSchema).min(1),
  chainId: chainIdSchema,
  message: z.string().min(1),
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
  sourceProvider: z.string().min(1)
});

export const preRegistrationRequestSchema = z.object({
  walletAddress: addressSchema,
  nonce: z.string().min(8),
  signature: signatureSchema,
  chainId: chainIdSchema
});

export const agentRegistrationSchema = z.object({
  id: z.string().min(1),
  walletAddress: addressSchema,
  agentLabel: z.string().min(1),
  capabilityTags: z.array(capabilityTagSchema).min(1),
  chainId: chainIdSchema,
  registeredAt: timestampSchema,
  lastLoginAt: timestampSchema.optional(),
  status: agentRegistrationStatusSchema,
  sourceProvider: walletProviderSchema,
  walletProvider: walletProviderSchema.optional(),
  walletProvisionedAt: timestampSchema.optional(),
  walletProviderEvidence: z.record(z.string(), z.unknown()).optional()
});

export const preRegistrationResponseSchema = z.object({
  registration: agentRegistrationSchema,
  proof: walletSignatureProofSchema
});

export const agentLoginChallengeRequestSchema = z.object({
  walletAddress: addressSchema,
  chainId: chainIdSchema
});

export const agentLoginChallengeSchema = z.object({
  nonce: z.string().min(8),
  walletAddress: addressSchema,
  chainId: chainIdSchema,
  message: z.string().min(1),
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
  sourceProvider: z.string().min(1)
});

export const agentLoginRequestSchema = z.object({
  walletAddress: addressSchema,
  nonce: z.string().min(8),
  signature: signatureSchema,
  chainId: chainIdSchema
});

export const agentLoginResponseSchema = z.object({
  registration: agentRegistrationSchema,
  proof: walletSignatureProofSchema,
  sessionToken: z.string().min(32),
  sessionExpiresAt: timestampSchema
});

export const joinJudgeListRequestSchema = z.object({
  registrationId: z.string().min(1)
});

export const judgeListEntrySchema = z.object({
  id: z.string().min(1),
  registrationId: z.string().min(1),
  walletAddress: addressSchema,
  agentLabel: z.string().min(1),
  capabilityTags: z.array(capabilityTagSchema).min(1),
  chainId: chainIdSchema,
  listedAt: timestampSchema,
  activeStake: stringAmountSchema.default("0"),
  stakeSeedStatus: z.enum(["seeded", "pending"]).optional(),
  stakeSeedError: z.string().min(1).optional(),
  reputationScore: z.number().min(0).max(100).default(50),
  status: agentStatusSchema.default("available"),
  sourceProvider: walletProviderSchema
});

export type AgentRegistrationStatus = z.infer<typeof agentRegistrationStatusSchema>;
export type WalletSignatureAction = z.infer<typeof walletSignatureActionSchema>;
export type WalletSignatureProof = z.infer<typeof walletSignatureProofSchema>;
export type PreRegistrationChallengeRequest = z.infer<typeof preRegistrationChallengeRequestSchema>;
export type PreRegistrationChallenge = z.infer<typeof preRegistrationChallengeSchema>;
export type PreRegistrationRequest = z.infer<typeof preRegistrationRequestSchema>;
export type AgentRegistration = z.infer<typeof agentRegistrationSchema>;
export type PreRegistrationResponse = z.infer<typeof preRegistrationResponseSchema>;
export type AgentLoginChallengeRequest = z.infer<typeof agentLoginChallengeRequestSchema>;
export type AgentLoginChallenge = z.infer<typeof agentLoginChallengeSchema>;
export type AgentLoginRequest = z.infer<typeof agentLoginRequestSchema>;
export type AgentLoginResponse = z.infer<typeof agentLoginResponseSchema>;
export type JoinJudgeListRequest = z.infer<typeof joinJudgeListRequestSchema>;
export type JudgeListEntry = z.infer<typeof judgeListEntrySchema>;
