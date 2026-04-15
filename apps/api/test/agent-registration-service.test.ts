import { describe, expect, it, vi } from "vitest";

import { MOCK_AGENTIC_WALLET_ADDRESS, MockAgenticWalletProvider } from "@proof-of-vault/agent-runtime";
import { DEFAULT_TARGET_EVM_CHAIN_ID } from "@proof-of-vault/shared-types";

import { InMemoryWorkflowStore } from "../src/repositories/in-memory-store.js";
import { AgentRegistrationService } from "../src/services/agent-registration-service.js";

describe("AgentRegistrationService", () => {
  it("seeds the registration stake during registration so judge list entries inherit active stake", async () => {
    const store = new InMemoryWorkflowStore();
    const walletProvider = new MockAgenticWalletProvider();
    const registrationSeedAmount = "100000000000000000000";

    const registrationStakeSeeder = {
      seedRegisteredAgent: vi.fn(async (registration) => {
        const existingAgent = await store.getAgent(registration.walletAddress);
        return store.saveAgent({
          ...existingAgent!,
          activeStake: registrationSeedAmount,
          walletProviderEvidence: {
            ...(existingAgent?.walletProviderEvidence ?? {}),
            registrationStakeSeed: {
              strategy: "fixed_registration_bootstrap",
              amount: registrationSeedAmount,
              txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              seededAt: Date.now(),
              signer: "0x7777777777777777777777777777777777777777"
            }
          }
        });
      }),
      seedJudgeListedAgent: vi.fn(async (entry) => entry)
    };

    const service = new AgentRegistrationService(
      store,
      walletProvider,
      DEFAULT_TARGET_EVM_CHAIN_ID,
      undefined,
      registrationStakeSeeder
    );

    const challenge = await service.createPreRegistrationChallenge({
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      agentLabel: "Registered Agent",
      capabilityTags: ["validator"],
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
    const signature = await walletProvider.signMessage({
      action: "signPreRegistration",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: challenge.message,
      nonce: challenge.nonce,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    const registrationResponse = await service.register({
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      nonce: challenge.nonce,
      signature: signature.signature,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    expect(registrationStakeSeeder.seedRegisteredAgent).toHaveBeenCalledTimes(1);
    expect(registrationResponse.registration.walletProviderEvidence?.registrationStakeSeed).toMatchObject({
      amount: registrationSeedAmount
    });

    const judgeListEntry = await service.joinJudgeList({
      registrationId: registrationResponse.registration.id
    });

    expect(judgeListEntry.activeStake).toBe(registrationSeedAmount);
    expect(judgeListEntry.stakeSeedStatus).toBe("seeded");
    expect(registrationStakeSeeder.seedJudgeListedAgent).not.toHaveBeenCalled();
  });

  it("keeps stake seeding pending metadata when registration seeding fails and does not retry on judge-list join", async () => {
    const store = new InMemoryWorkflowStore();
    const walletProvider = new MockAgenticWalletProvider();
    const registrationStakeSeeder = {
      seedRegisteredAgent: vi.fn(async () => {
        throw new Error("seed tx failed");
      }),
      seedJudgeListedAgent: vi.fn(async (entry) => entry)
    };

    const service = new AgentRegistrationService(
      store,
      walletProvider,
      DEFAULT_TARGET_EVM_CHAIN_ID,
      undefined,
      registrationStakeSeeder
    );

    const challenge = await service.createPreRegistrationChallenge({
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      agentLabel: "Pending Agent",
      capabilityTags: ["validator"],
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
    const signature = await walletProvider.signMessage({
      action: "signPreRegistration",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: challenge.message,
      nonce: challenge.nonce,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    const registrationResponse = await service.register({
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      nonce: challenge.nonce,
      signature: signature.signature,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    expect(registrationResponse.registration.walletProviderEvidence?.registrationStakeSeedPending).toMatchObject({
      strategy: "fixed_registration_bootstrap",
      stage: "failed",
      error: "seed tx failed"
    });

    const judgeListEntry = await service.joinJudgeList({
      registrationId: registrationResponse.registration.id
    });

    expect(judgeListEntry.activeStake).toBe("0");
    expect(judgeListEntry.stakeSeedStatus).toBe("pending");
    expect(registrationStakeSeeder.seedJudgeListedAgent).not.toHaveBeenCalled();
  });
});
