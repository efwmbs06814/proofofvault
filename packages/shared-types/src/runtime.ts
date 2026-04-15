import { z } from "zod";

import {
  DEFAULT_OKX_CHAIN_INDEX,
  addressSchema,
  chainIdSchema,
  hashSchema,
  stringAmountSchema,
  timestampSchema,
  uriSchema,
  vaultStatusSchema
} from "./enums.js";
import { executionTraceSchema } from "./agent.js";

export const onchainGatewayModeValues = ["mock", "viem"] as const;
export const walletProviderModeValues = ["mock", "okx"] as const;
export const marketProviderModeValues = ["mock", "okx"] as const;

export const onchainGatewayModeSchema = z.enum(onchainGatewayModeValues);
export const walletProviderModeSchema = z.enum(walletProviderModeValues);
export const marketProviderModeSchema = z.enum(marketProviderModeValues);
export const okxChainIndexSchema = z.coerce.number().int().positive().default(DEFAULT_OKX_CHAIN_INDEX);
export const runtimeNetworkContextSchema = z.object({
  targetEvmChainId: chainIdSchema,
  okxChainIndex: okxChainIndexSchema
});

export const onchainRuleCommitteeSnapshotSchema = z.object({
  makers: z.array(addressSchema).default([]),
  verifiers: z.array(addressSchema).default([]),
  draftDeadlineAt: timestampSchema.optional(),
  issueDeadlineAt: timestampSchema.optional()
});

export const onchainResolutionCommitteeSnapshotSchema = z.object({
  validators: z.array(addressSchema).default([]),
  auditors: z.array(addressSchema).default([]),
  commitDeadlineAt: timestampSchema.optional(),
  revealDeadlineAt: timestampSchema.optional(),
  auditDeadlineAt: timestampSchema.optional(),
  challengeDeadlineAt: timestampSchema.optional(),
  minValidCount: z.coerce.number().int().nonnegative().default(0)
});

export const onchainVaultSnapshotSchema = z.object({
  vaultId: z.coerce.number().int().nonnegative(),
  chainId: chainIdSchema,
  status: vaultStatusSchema,
  setterAddress: addressSchema.optional(),
  collateralToken: addressSchema.optional(),
  collateralDecimals: z.coerce.number().int().min(0).max(255).optional(),
  grossCollateralAmount: stringAmountSchema.default("0"),
  lockedCollateralAmount: stringAmountSchema.default("0"),
  setupDepositAmount: stringAmountSchema.default("0"),
  resolutionRewardDepositAmount: stringAmountSchema.default("0"),
  settlementTime: timestampSchema.optional(),
  createdAt: timestampSchema.optional(),
  activatedAt: timestampSchema.optional(),
  criteriaHash: hashSchema.optional(),
  metadataURI: uriSchema.optional(),
  legacyMode: z.boolean().default(false),
  ruleSetAccepted: z.boolean().default(false),
  ruleRound: z.coerce.number().int().nonnegative().default(0),
  resolutionRound: z.coerce.number().int().nonnegative().default(0),
  rejectionCount: z.coerce.number().int().nonnegative().default(0),
  ruleCommittee: onchainRuleCommitteeSnapshotSchema.optional(),
  resolutionCommittee: onchainResolutionCommitteeSnapshotSchema.optional(),
  syncedAt: timestampSchema
});

export const agentStakeRequestSchema = z.object({
  agentAddress: addressSchema,
  amount: stringAmountSchema,
  txHash: hashSchema.optional(),
  payloadURI: uriSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const claimRewardsRequestSchema = z.object({
  agentAddress: addressSchema,
  vaultIds: z.array(z.string().min(1)).default([]),
  txHash: hashSchema.optional(),
  payloadURI: uriSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const preparedExecutionStepSchema = z.object({
  kind: z.enum(["approval", "transaction"]),
  chainId: chainIdSchema,
  to: addressSchema,
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, "Expected hex calldata."),
  value: stringAmountSchema.default("0"),
  description: z.string().min(1),
  contractAddress: addressSchema.optional(),
  contractName: z.string().min(1).optional(),
  functionName: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const preparedExecutionSchema = z.object({
  sourceProvider: z.string().min(1),
  actorAddress: addressSchema,
  approvals: z.array(preparedExecutionStepSchema).default([]),
  transaction: preparedExecutionStepSchema,
  proofHash: hashSchema.optional(),
  payloadHash: hashSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const runtimeHealthSchema = z.object({
  ok: z.boolean(),
  chainId: chainIdSchema,
  targetEvmChainId: chainIdSchema,
  okxChainIndex: okxChainIndexSchema,
  onchainGatewayMode: onchainGatewayModeSchema,
  walletProviderMode: walletProviderModeSchema,
  marketProviderMode: marketProviderModeSchema,
  realOnchainConfigured: z.boolean(),
  okxConfigured: z.boolean(),
  realDemoReady: z.boolean(),
  requiredModesSatisfied: z.boolean(),
  blockingReasons: z.array(z.string()).default([]),
  viemSignerModel: z.enum(["server-configured-local-account", "not-used"]),
  vaultFactoryAddress: addressSchema.optional(),
  traces: z.array(executionTraceSchema).default([])
});

export type OnchainGatewayMode = z.infer<typeof onchainGatewayModeSchema>;
export type WalletProviderMode = z.infer<typeof walletProviderModeSchema>;
export type MarketProviderMode = z.infer<typeof marketProviderModeSchema>;
export type RuntimeNetworkContext = z.infer<typeof runtimeNetworkContextSchema>;
export type OnchainRuleCommitteeSnapshot = z.infer<typeof onchainRuleCommitteeSnapshotSchema>;
export type OnchainResolutionCommitteeSnapshot = z.infer<typeof onchainResolutionCommitteeSnapshotSchema>;
export type OnchainVaultSnapshot = z.infer<typeof onchainVaultSnapshotSchema>;
export type AgentStakeRequest = z.infer<typeof agentStakeRequestSchema>;
export type ClaimRewardsRequest = z.infer<typeof claimRewardsRequestSchema>;
export type PreparedExecutionStep = z.infer<typeof preparedExecutionStepSchema>;
export type PreparedExecution = z.infer<typeof preparedExecutionSchema>;
export type RuntimeHealth = z.infer<typeof runtimeHealthSchema>;
