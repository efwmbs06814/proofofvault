import { describe, expect, it, vi } from "vitest";

import { MockAgenticWalletProvider, hashPayload } from "@proof-of-vault/agent-runtime";
import {
  DEFAULT_OKX_CHAIN_INDEX,
  DEFAULT_TARGET_EVM_CHAIN_ID,
  type AgentProfile,
  type MarketProviderMode,
  type SourceSnapshot
} from "@proof-of-vault/shared-types";

import { createMemoryPersistence } from "../src/db/factory.js";
import { AgentRegistrationService } from "../src/services/agent-registration-service.js";
import { OperatorWalletBootstrapService } from "../src/services/operator-wallet-bootstrap-service.js";
import { SubmissionService } from "../src/services/submission-service.js";

describe("OperatorWalletBootstrapService", () => {
  it("provisions a wallet without persisting email or otp", async () => {
    const persistence = createMemoryPersistence();
    const walletProvider = new MockAgenticWalletProvider();
    const registrationStakeSeeder = {
      seedRegisteredAgent: vi.fn(async (registration) => {
        const existingAgent = await persistence.workflowStore.getAgent(registration.walletAddress);
        return persistence.workflowStore.saveAgent({
          ...existingAgent!,
          activeStake: "100000000000000000000",
          walletProviderEvidence: {
            ...(existingAgent?.walletProviderEvidence ?? {}),
            registrationStakeSeed: {
              strategy: "fixed_registration_bootstrap",
              amount: "100000000000000000000",
              txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              seededAt: Date.now(),
              signer: "0x7777777777777777777777777777777777777777"
            }
          }
        });
      })
    };
    const registrationService = new AgentRegistrationService(
      persistence.workflowStore,
      walletProvider,
      DEFAULT_TARGET_EVM_CHAIN_ID,
      undefined,
      registrationStakeSeeder
    );
    const service = new OperatorWalletBootstrapService(
      persistence.workflowStore,
      walletProvider,
      registrationService,
      DEFAULT_TARGET_EVM_CHAIN_ID
    );

    const result = await service.bootstrap({
      agentLabel: "Operator Bootstrapped Agent",
      capabilityTags: ["validator"],
      email: "operator@example.test",
      otp: "123456",
      joinJudgeList: true
    });

    const storedAgent = await persistence.workflowStore.getAgent(result.walletAddress);
    const storedRegistration = await persistence.workflowStore.getRegistration(result.registration.id);

    expect(result.walletAddress).toBe(storedAgent?.walletAddress);
    expect(result.judgeListEntry?.registrationId).toBe(result.registration.id);
    expect(storedAgent?.walletProvisionedAt).toBeGreaterThan(0);
    expect(storedAgent?.walletProviderEvidence).toMatchObject({
      provisioningMode: "operator-cli",
      targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
      registrationStakeSeed: {
        amount: "100000000000000000000"
      }
    });
    expect(storedAgent?.walletProviderEvidence).not.toHaveProperty("email");
    expect(storedAgent?.walletProviderEvidence).not.toHaveProperty("otp");
    expect(storedRegistration).toMatchObject({
      id: result.registration.id,
      walletAddress: result.walletAddress,
      status: "judge_listed"
    });
    expect(result.registration).toMatchObject({
      id: result.registration.id,
      walletAddress: result.walletAddress,
      status: "judge_listed",
      walletProvisionedAt: storedAgent?.walletProvisionedAt,
      walletProvider: "mock-agentic-wallet"
    });
    expect(registrationStakeSeeder.seedRegisteredAgent).toHaveBeenCalledTimes(1);
  });

  it("retries registration stake seeding when operator bootstrap is rerun for an existing registration", async () => {
    const persistence = createMemoryPersistence();
    const walletProvider = new MockAgenticWalletProvider();
    let attempt = 0;
    const registrationStakeSeeder = {
      seedRegisteredAgent: vi.fn(async (registration) => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error("seed tx failed");
        }

        const existingAgent = await persistence.workflowStore.getAgent(registration.walletAddress);
        return persistence.workflowStore.saveAgent({
          ...existingAgent!,
          activeStake: "100000000000000000000",
          walletProviderEvidence: {
            ...(existingAgent?.walletProviderEvidence ?? {}),
            registrationStakeSeed: {
              strategy: "fixed_registration_bootstrap",
              amount: "100000000000000000000",
              txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              seededAt: Date.now(),
              signer: "0x7777777777777777777777777777777777777777"
            }
          }
        });
      })
    };
    const registrationService = new AgentRegistrationService(
      persistence.workflowStore,
      walletProvider,
      DEFAULT_TARGET_EVM_CHAIN_ID,
      undefined,
      registrationStakeSeeder
    );
    const service = new OperatorWalletBootstrapService(
      persistence.workflowStore,
      walletProvider,
      registrationService,
      DEFAULT_TARGET_EVM_CHAIN_ID
    );

    const first = await service.bootstrap({
      agentLabel: "Retry Agent",
      capabilityTags: ["validator"],
      email: "retry@example.test",
      otp: "123456",
      joinJudgeList: true
    });
    expect(first.registration.walletProviderEvidence?.registrationStakeSeedPending).toMatchObject({
      stage: "failed",
      error: "seed tx failed"
    });

    const second = await service.bootstrap({
      agentLabel: "Retry Agent",
      capabilityTags: ["validator"],
      email: "retry@example.test",
      otp: "123456",
      joinJudgeList: true
    });

    expect(second.registration.walletProviderEvidence?.registrationStakeSeed).toMatchObject({
      amount: "100000000000000000000"
    });
    expect(second.judgeListEntry?.activeStake).toBe("100000000000000000000");
    expect(registrationStakeSeeder.seedRegisteredAgent).toHaveBeenCalledTimes(2);
  });
});

describe("SubmissionService real-demo validation", () => {
  it("rejects resolution reveals that do not carry normalized OKX market snapshots", async () => {
    const persistence = createMemoryPersistence();
    const walletProvider = new MockAgenticWalletProvider();
    const marketDataProvider = {
      name: "mock-market-data" as MarketProviderMode | "mock-market-data",
      async collectSnapshots(): Promise<SourceSnapshot[]> {
        return [
          {
            provider: "mock-market-data",
            kind: "resolution",
            value: "100",
            timestamp: new Date().toISOString(),
            metadata: {}
          }
        ];
      }
    };
    const service = new SubmissionService(
      persistence,
      walletProvider,
      marketDataProvider,
      undefined,
      {
        enforceRealDemo: true,
        targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        okxChainIndex: DEFAULT_OKX_CHAIN_INDEX
      }
    );
    const validator = "0x1111111111111111111111111111111111111111" as const;
    const agent: AgentProfile = {
      address: validator,
      walletAddress: validator,
      label: "Validator",
      capabilityTags: ["validator"],
      reputationScore: 90,
      activeStake: "1000",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    };

    await persistence.workflowStore.saveAgent(agent);
    await persistence.workflowStore.saveVault({
      id: "1",
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      legacyMode: false,
      status: "CommitPhase",
      metadataURI: "ipfs://proof-of-vault/tests/real-demo-validation",
      grossCollateralAmount: "1000",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ruleRound: 1,
      resolutionRound: 1,
      rejectionCount: 0,
      traces: [],
      resolutionCommittee: {
        validators: [validator],
        auditors: [],
        minValidCount: 1,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    await expect(
      service.submit({
        kind: "resolution_reveal",
        vaultId: 1,
        round: 1,
        agentAddress: validator,
        payloadURI: "ipfs://proof-of-vault/tests/reveal-real-demo",
        proofHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        salt: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        payload: {
          vaultId: 1,
          round: 1,
          result: "TRUE",
          confidenceScore: 0.9,
          sources: [],
          reasoning: "mock data should be rejected in real-demo mode",
          submittedByAgent: validator,
          version: 1
        }
      })
    ).rejects.toThrow(/okx-market-mcp/i);
  });

  it("rejects client-forged OKX snapshot metadata when the provider did not supply it", async () => {
    const persistence = createMemoryPersistence();
    const walletProvider = new MockAgenticWalletProvider();
    const marketDataProvider = {
      name: "mock-market-data",
      async collectSnapshots(): Promise<SourceSnapshot[]> {
        return [];
      }
    };
    const service = new SubmissionService(
      persistence,
      walletProvider,
      marketDataProvider,
      undefined,
      {
        enforceRealDemo: true,
        targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        okxChainIndex: DEFAULT_OKX_CHAIN_INDEX
      }
    );
    const validator = "0x1111111111111111111111111111111111111111" as const;

    await persistence.workflowStore.saveAgent({
      address: validator,
      walletAddress: validator,
      label: "Validator",
      capabilityTags: ["validator"],
      reputationScore: 90,
      activeStake: "1000",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    });
    await persistence.workflowStore.saveVault({
      id: "3",
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      legacyMode: false,
      status: "CommitPhase",
      metadataURI: "ipfs://proof-of-vault/tests/forged-source",
      grossCollateralAmount: "1000",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ruleRound: 1,
      resolutionRound: 1,
      rejectionCount: 0,
      traces: [],
      resolutionCommittee: {
        validators: [validator],
        auditors: [],
        minValidCount: 1,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    await expect(
      service.submit({
        kind: "resolution_reveal",
        vaultId: 3,
        round: 1,
        agentAddress: validator,
        payloadURI: "ipfs://proof-of-vault/tests/forged-source",
        salt: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        payload: {
          vaultId: 3,
          round: 1,
          result: "TRUE",
          confidenceScore: 0.9,
          sources: [
            {
              provider: "okx-market-mcp",
              kind: "resolution",
              value: "999",
              timestamp: new Date().toISOString(),
              metadata: {
                providerCollected: true,
                okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
                targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID
              }
            }
          ],
          reasoning: "client-forged metadata should not satisfy demo validation",
          submittedByAgent: validator,
          version: 1
        }
      })
    ).rejects.toThrow(/okx-market-mcp/i);
  });

  it("keeps proof snapshots aligned with the persisted proof hash", async () => {
    const persistence = createMemoryPersistence();
    const walletProvider = new MockAgenticWalletProvider();
    const marketDataProvider = {
      name: "okx-market-mcp",
      async collectSnapshots(): Promise<SourceSnapshot[]> {
        return [
          {
            provider: "okx-market-mcp",
            kind: "resolution",
            value: "101",
            timestamp: new Date().toISOString(),
            metadata: {
              providerCollected: true,
              okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
              targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID
            }
          }
        ];
      }
    };
    const service = new SubmissionService(
      persistence,
      walletProvider,
      marketDataProvider,
      undefined,
      {
        enforceRealDemo: true,
        targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        okxChainIndex: DEFAULT_OKX_CHAIN_INDEX
      }
    );
    const validator = "0x1111111111111111111111111111111111111111" as const;

    await persistence.workflowStore.saveAgent({
      address: validator,
      walletAddress: validator,
      label: "Validator",
      capabilityTags: ["validator"],
      reputationScore: 90,
      activeStake: "1000",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    });
    await persistence.workflowStore.saveVault({
      id: "2",
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      legacyMode: false,
      status: "CommitPhase",
      metadataURI: "ipfs://proof-of-vault/tests/reveal-proof-consistency",
      grossCollateralAmount: "1000",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ruleRound: 1,
      resolutionRound: 1,
      rejectionCount: 0,
      traces: [],
      resolutionCommittee: {
        validators: [validator],
        auditors: [],
        minValidCount: 1,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    const submission = await service.submit({
      kind: "resolution_reveal",
      vaultId: 2,
      round: 1,
      agentAddress: validator,
      payloadURI: "ipfs://proof-of-vault/tests/reveal-proof-consistency",
      salt: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      payload: {
        vaultId: 2,
        round: 1,
        result: "TRUE",
        confidenceScore: 0.9,
        sources: [],
        reasoning: "provider evidence should survive into proof snapshots",
        submittedByAgent: validator,
        version: 1
      }
    });
    if (submission.kind !== "resolution_reveal") {
      throw new Error("Expected a resolution_reveal submission.");
    }

    expect(submission.payload.sources).toEqual([]);
    expect(submission.proof?.snapshot.length).toBeGreaterThan(0);
    expect(submission.proofHash).toBe(
      hashPayload({
        payload: submission.payload,
        snapshots: submission.proof?.snapshot ?? []
      })
    );
  });
});
