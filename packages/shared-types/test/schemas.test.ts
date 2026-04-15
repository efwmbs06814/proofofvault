import { describe, expect, it } from "vitest";

import {
  DEFAULT_OKX_CHAIN_INDEX,
  DEFAULT_TARGET_EVM_CHAIN_ID,
  agentSubmissionSchema,
  agentStakeRequestSchema,
  claimRewardsRequestSchema,
  createVaultRequestSchema,
  joinJudgeListRequestSchema,
  onchainGatewayModeSchema,
  onchainVaultSnapshotSchema,
  preRegistrationChallengeRequestSchema,
  preRegistrationRequestSchema,
  resolutionRevealPayloadSchema,
  runtimeHealthSchema,
  runtimeNetworkContextSchema
} from "../src/index.js";

describe("shared-type schemas", () => {
  it("parses a minimal vault draft request", () => {
    const parsed = createVaultRequestSchema.parse({
      mode: "draft",
      metadataURI: "ipfs://proof-of-vault/demo",
      grossCollateralAmount: 1000,
      setupDepositAmount: 10
    });

    expect(parsed.mode).toBe("draft");
    expect(parsed.grossCollateralAmount).toBe("1000");
    expect(parsed.setupDepositAmount).toBe("10");
    expect(parsed.chainId).toBe(DEFAULT_TARGET_EVM_CHAIN_ID);
  });

  it("accepts a resolution reveal payload with uppercase result", () => {
    const parsed = resolutionRevealPayloadSchema.parse({
      vaultId: 1,
      round: 1,
      result: "TRUE",
      confidenceScore: 0.9,
      sources: [],
      reasoning: "demo",
      submittedByAgent: "0x1111111111111111111111111111111111111111",
      version: 1
    });

    expect(parsed.result).toBe("TRUE");
  });

  it("validates a resolution commit submission envelope", () => {
    const parsed = agentSubmissionSchema.parse({
      kind: "resolution_commit",
      vaultId: 1,
      round: 1,
      agentAddress: "0x1111111111111111111111111111111111111111",
      payloadURI: "ipfs://proof-of-vault/commit/1",
      payload: {
        vaultId: 1,
        round: 1,
        outcome: "TRUE",
        proofHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        salt: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        submittedByAgent: "0x1111111111111111111111111111111111111111",
        version: 1
      }
    });

    expect(parsed.kind).toBe("resolution_commit");
  });

  it("parses runtime provider modes and agent wallet DTOs", () => {
    expect(onchainGatewayModeSchema.parse("viem")).toBe("viem");
    expect(
      agentStakeRequestSchema.parse({
        agentAddress: "0x1111111111111111111111111111111111111111",
        amount: 1000
      }).amount
    ).toBe("1000");
    expect(
      claimRewardsRequestSchema.parse({
        agentAddress: "0x1111111111111111111111111111111111111111"
      }).metadata
    ).toEqual({});
  });

  it("parses an on-chain vault snapshot", () => {
    const parsed = onchainVaultSnapshotSchema.parse({
      vaultId: 1,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      status: "RuleAuction",
      grossCollateralAmount: 1000,
      lockedCollateralAmount: 0,
      setupDepositAmount: 50,
      resolutionRewardDepositAmount: 0,
      legacyMode: false,
      ruleSetAccepted: false,
      ruleRound: 0,
      resolutionRound: 0,
      rejectionCount: 0,
      syncedAt: Date.now()
    });

    expect(parsed.setupDepositAmount).toBe("50");
    expect(parsed.status).toBe("RuleAuction");
  });

  it("parses pre-registration and judge-list DTOs", () => {
    const challenge = preRegistrationChallengeRequestSchema.parse({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      agentLabel: "Registration Agent",
      capabilityTags: ["validator"],
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
    const registration = preRegistrationRequestSchema.parse({
      walletAddress: challenge.walletAddress,
      nonce: "registration-nonce",
      signature: `0x${"a".repeat(130)}`,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
    const judgeList = joinJudgeListRequestSchema.parse({
      registrationId: "agent-reg-test",
      activeStake: 1000,
      reputationScore: 70
    });

    expect(challenge.capabilityTags).toEqual(["validator"]);
    expect(registration.signature).toMatch(/^0x/);
    expect(judgeList).toEqual({ registrationId: "agent-reg-test" });
  });

  it("parses split runtime network context and health fields", () => {
    const network = runtimeNetworkContextSchema.parse({});
    const health = runtimeHealthSchema.parse({
      ok: true,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
      onchainGatewayMode: "mock",
      walletProviderMode: "mock",
      marketProviderMode: "mock",
      realOnchainConfigured: false,
      okxConfigured: false,
      realDemoReady: false,
      requiredModesSatisfied: false,
      blockingReasons: ["wallet provider must be okx"],
      viemSignerModel: "not-used"
    });

    expect(network).toEqual({
      targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: DEFAULT_OKX_CHAIN_INDEX
    });
    expect(health.targetEvmChainId).toBe(DEFAULT_TARGET_EVM_CHAIN_ID);
    expect(health.okxChainIndex).toBe(DEFAULT_OKX_CHAIN_INDEX);
  });
});
