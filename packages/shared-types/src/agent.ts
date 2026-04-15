import { z } from "zod";

import {
  addressSchema,
  chainIdSchema,
  stringAmountSchema,
  timestampSchema,
  txHashSchema,
  uriSchema
} from "./enums.js";

export const capabilityTagValues = [
  "rule-maker",
  "rule-verifier",
  "validator",
  "auditor",
  "challenger",
  "all-rounder"
] as const;
export const agentStatusValues = ["available", "busy", "disabled"] as const;
export const walletProviderValues = ["mock-agentic-wallet", "okx-agentic-wallet"] as const;

export const capabilityTagSchema = z.enum(capabilityTagValues);
export const agentStatusSchema = z.enum(agentStatusValues);
export const walletProviderSchema = z.enum(walletProviderValues);

export const agentProfileSchema = z.object({
  address: addressSchema,
  walletAddress: addressSchema.optional(),
  label: z.string().min(1),
  capabilityTags: z.array(capabilityTagSchema).min(1),
  reputationScore: z.number().min(0).max(100).default(50),
  activeStake: stringAmountSchema.default("0"),
  canUseAgenticWallet: z.boolean().default(true),
  status: agentStatusSchema.default("available"),
  walletProvider: walletProviderSchema.default("mock-agentic-wallet"),
  walletProvisionedAt: timestampSchema.optional(),
  walletProviderEvidence: z.record(z.string(), z.unknown()).optional()
});

export const executionTraceSchema = z.object({
  action: z.string().min(1),
  actorAddress: addressSchema.optional(),
  executedByWallet: addressSchema,
  txHash: txHashSchema,
  chainId: chainIdSchema,
  sourceProvider: z.string().min(1),
  payloadURI: uriSchema.optional(),
  proofHash: txHashSchema.optional(),
  callArgs: z.record(z.string(), z.unknown()).optional(),
  callResult: z.record(z.string(), z.unknown()).optional(),
  recordedAt: timestampSchema
});

export type CapabilityTag = z.infer<typeof capabilityTagSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type WalletProvider = z.infer<typeof walletProviderSchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type ExecutionTrace = z.infer<typeof executionTraceSchema>;
