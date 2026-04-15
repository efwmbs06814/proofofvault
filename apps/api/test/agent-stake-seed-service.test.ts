import { describe, expect, it, vi } from "vitest";

import type { AgentProfile, AgentRegistration, JudgeListEntry } from "@proof-of-vault/shared-types";

import { InMemoryWorkflowStore } from "../src/repositories/in-memory-store.js";
import { AgentStakeSeedService } from "../src/services/agent-stake-seed-service.js";

const baseEnv = {
  NODE_ENV: "production",
  PORT: 4000,
  HOST: "127.0.0.1",
  PROOF_OF_VAULT_STORAGE: "memory",
  PROOF_OF_VAULT_DEMO_MODE: false,
  PROOF_OF_VAULT_DB_POOL_MAX: 10,
  PROOF_OF_VAULT_RECONCILIATION_INTERVAL_MS: 60_000,
  PROOF_OF_VAULT_ONCHAIN_GATEWAY: "viem",
  PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
  PROOF_OF_VAULT_MARKET_PROVIDER: "okx",
  PROOF_OF_VAULT_PAYLOAD_PROVIDER: "ipfs",
  PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: true,
  PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890",
  PROOF_OF_VAULT_OPERATOR_API_TOKEN: "proof-of-vault-operator-token-for-tests",
  PROOF_OF_VAULT_USING_LEGACY_CHAIN_ALIAS: false,
  PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
  PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
  PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
  PROOF_OF_VAULT_OKX_MCP_URL: "https://web3.okx.com/api/v1/onchainos-mcp",
  PROOF_OF_VAULT_PUBLIC_API_BASE_URL: "https://api.proofofvault.test",
  PROOF_OF_VAULT_WEB_BASE_URL: "https://app.proofofvault.test",
  PROOF_OF_VAULT_CHAIN_ID: undefined,
  PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID: 196,
  PROOF_OF_VAULT_OKX_CHAIN_INDEX: 196,
  PROOF_OF_VAULT_RPC_URL: "https://rpc.xlayer.tech",
  PROOF_OF_VAULT_EXPLORER_URL: "https://www.oklink.com/xlayer",
  PROOF_OF_VAULT_IPFS_PINNING_URL: "https://ipfs.example.test/pin",
  PROOF_OF_VAULT_IPFS_PINNING_JWT: "test-ipfs-jwt",
  PROOF_OF_VAULT_IPFS_GATEWAY_URL: "https://ipfs.io/ipfs",
  PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY: `0x${"1".repeat(64)}`,
  PROOF_OF_VAULT_FINALIZER_PRIVATE_KEY: `0x${"2".repeat(64)}`,
  PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY: `0x${"3".repeat(64)}`,
  PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_FUNDER_PRIVATE_KEY: `0x${"3".repeat(64)}`,
  PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
  PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
  PROOF_OF_VAULT_POV_TOKEN_ADDRESS: "0x3333333333333333333333333333333333333333",
  PROOF_OF_VAULT_REWARD_POOL_ADDRESS: "0x4444444444444444444444444444444444444444",
  PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT: "1000000000000000000",
  PROOF_OF_VAULT_WOKB_ADDRESS: undefined,
  PROOF_OF_VAULT_WOKB_CAP: "10000000000000000000",
  PROOF_OF_VAULT_WOKB_DECIMALS: 18,
  PROOF_OF_VAULT_USDCE_ADDRESS: undefined,
  PROOF_OF_VAULT_USDCE_CAP: "1000000000",
  PROOF_OF_VAULT_USDCE_DECIMALS: 6
} as const;

function makeJudgeEntry(): JudgeListEntry {
  return {
    id: "judge-1",
    registrationId: "reg-1",
    walletAddress: "0x9999999999999999999999999999999999999999",
    agentLabel: "Seeded Agent",
    capabilityTags: ["validator"],
    chainId: 196,
    listedAt: Date.now(),
    activeStake: "0",
    reputationScore: 50,
    status: "available",
    sourceProvider: "okx-agentic-wallet"
  };
}

function makeRegistration(entry = makeJudgeEntry()): AgentRegistration {
  return {
    id: entry.registrationId,
    walletAddress: entry.walletAddress,
    agentLabel: entry.agentLabel,
    capabilityTags: entry.capabilityTags,
    chainId: entry.chainId,
    registeredAt: Date.now(),
    status: "pre_registered",
    sourceProvider: entry.sourceProvider
  };
}

function makeAgent(entry: JudgeListEntry): AgentProfile {
  return {
    address: entry.walletAddress,
    walletAddress: entry.walletAddress,
    label: entry.agentLabel,
    capabilityTags: entry.capabilityTags,
    reputationScore: entry.reputationScore,
    activeStake: entry.activeStake,
    canUseAgenticWallet: true,
    status: entry.status,
    walletProvider: "okx-agentic-wallet"
  };
}

describe("AgentStakeSeedService", () => {
  it("seeds a newly registered agent into active stake without scanning historical logs", async () => {
    const store = new InMemoryWorkflowStore();
    const registration = makeRegistration();

    const writeContract = vi
      .fn()
      .mockResolvedValueOnce("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
      .mockResolvedValueOnce("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(1_000_000_000_000_000_000n);
    const waitForTransactionReceipt = vi
      .fn()
      .mockResolvedValueOnce({ status: "success", blockNumber: 122n })
      .mockResolvedValueOnce({ status: "success", blockNumber: 123n });

    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: { readContract, waitForTransactionReceipt },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      }
    });

    const result = await service.seedRegisteredAgent(registration);

    expect(result.activeStake).toBe("1000000000000000000");
    const savedAgent = await store.getAgent(registration.walletAddress);
    expect(savedAgent?.activeStake).toBe("1000000000000000000");
    expect(savedAgent?.walletProviderEvidence?.registrationStakeSeed).toMatchObject({
      strategy: "fixed_registration_bootstrap",
      amount: "1000000000000000000",
      txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      signer: "0x7777777777777777777777777777777777777777"
    });
    expect(writeContract).toHaveBeenCalledTimes(2);
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it("updates the judge list entry when the agent was already seeded during registration", async () => {
    const store = new InMemoryWorkflowStore();
    const entry = makeJudgeEntry();
    const agent = makeAgent(entry);
    agent.activeStake = "1000000000000000000";
    agent.walletProviderEvidence = {
      registrationStakeSeed: {
        strategy: "fixed_registration_bootstrap",
        amount: "1000000000000000000",
        txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        seededAt: Date.now(),
        signer: "0x7777777777777777777777777777777777777777"
      }
    };
    await store.saveAgent(agent);
    await store.saveJudgeListEntry(entry);

    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: {
        readContract: vi.fn(),
        waitForTransactionReceipt: vi.fn()
      },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract: vi.fn()
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract: vi.fn()
      }
    });

    const result = await service.seedJudgeListedAgent(entry);

    expect(result.activeStake).toBe("1000000000000000000");
  });

  it("does not send another seed transaction when a bootstrap seed is already pending", async () => {
    const store = new InMemoryWorkflowStore();
    const registration = makeRegistration();
    await store.saveAgent({
      address: registration.walletAddress,
      walletAddress: registration.walletAddress,
      label: registration.agentLabel,
      capabilityTags: registration.capabilityTags,
      reputationScore: 50,
      activeStake: "0",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: registration.sourceProvider,
      walletProviderEvidence: {
        registrationStakeSeedPending: {
          strategy: "fixed_registration_bootstrap",
          amount: "1000000000000000000",
          startedAt: Date.now(),
          signer: "0x7777777777777777777777777777777777777777",
          stage: "broadcasted",
          txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        }
      }
    });
    const writeContract = vi.fn();

    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: {
        readContract: vi.fn().mockResolvedValueOnce(0n),
        waitForTransactionReceipt: vi.fn().mockRejectedValueOnce(new Error("still pending"))
      },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      }
    });

    const result = await service.seedRegisteredAgent(registration);

    expect(result.activeStake).toBe("0");
    expect(writeContract).not.toHaveBeenCalled();
    expect((await store.getAgent(registration.walletAddress))?.walletProviderEvidence?.registrationStakeSeedPending).toMatchObject({
      txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    });
  });

  it("recovers a broadcasted pending seed once the stored transaction is confirmed", async () => {
    const store = new InMemoryWorkflowStore();
    const registration = makeRegistration();
    await store.saveAgent({
      address: registration.walletAddress,
      walletAddress: registration.walletAddress,
      label: registration.agentLabel,
      capabilityTags: registration.capabilityTags,
      reputationScore: 50,
      activeStake: "0",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: registration.sourceProvider,
      walletProviderEvidence: {
        registrationStakeSeedPending: {
          strategy: "fixed_registration_bootstrap",
          amount: "1000000000000000000",
          startedAt: Date.now(),
          signer: "0x7777777777777777777777777777777777777777",
          stage: "broadcasted",
          txHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        }
      }
    });

    const writeContract = vi.fn();
    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: {
        readContract: vi.fn().mockResolvedValueOnce(1_000_000_000_000_000_000n),
        waitForTransactionReceipt: vi.fn().mockResolvedValueOnce({ status: "success", blockNumber: 124n })
      },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      }
    });

    const result = await service.seedRegisteredAgent(registration);

    expect(result.activeStake).toBe("1000000000000000000");
    expect(writeContract).not.toHaveBeenCalled();
    expect((await store.getAgent(registration.walletAddress))?.walletProviderEvidence?.registrationStakeSeed).toMatchObject({
      txHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    });
  });

  it("retries a failed pending seed with no broadcast transaction hash", async () => {
    const store = new InMemoryWorkflowStore();
    const registration = makeRegistration();
    await store.saveAgent({
      address: registration.walletAddress,
      walletAddress: registration.walletAddress,
      label: registration.agentLabel,
      capabilityTags: registration.capabilityTags,
      reputationScore: 50,
      activeStake: "0",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: registration.sourceProvider,
      walletProviderEvidence: {
        registrationStakeSeedPending: {
          strategy: "fixed_registration_bootstrap",
          amount: "1000000000000000000",
          startedAt: Date.now() - 1_000,
          signer: "0x7777777777777777777777777777777777777777",
          stage: "failed",
          error: "seed tx failed",
          attemptedAt: Date.now() - 1_000
        }
      }
    });

    const writeContract = vi
      .fn()
      .mockResolvedValueOnce("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
      .mockResolvedValueOnce("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(1_000_000_000_000_000_000n);
    const waitForTransactionReceipt = vi
      .fn()
      .mockResolvedValueOnce({ status: "success", blockNumber: 125n })
      .mockResolvedValueOnce({ status: "success", blockNumber: 126n });

    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: { readContract, waitForTransactionReceipt },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      }
    });

    const result = await service.seedRegisteredAgent(registration);

    expect(result.activeStake).toBe("1000000000000000000");
    expect(writeContract).toHaveBeenCalledTimes(2);
  });

  it("retries a stale broadcasted pending seed when the stored tx never finalizes", async () => {
    const store = new InMemoryWorkflowStore();
    const registration = makeRegistration();
    await store.saveAgent({
      address: registration.walletAddress,
      walletAddress: registration.walletAddress,
      label: registration.agentLabel,
      capabilityTags: registration.capabilityTags,
      reputationScore: 50,
      activeStake: "0",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: registration.sourceProvider,
      walletProviderEvidence: {
        registrationStakeSeedPending: {
          strategy: "fixed_registration_bootstrap",
          amount: "1000000000000000000",
          startedAt: Date.now() - 10 * 60 * 1000,
          signer: "0x7777777777777777777777777777777777777777",
          stage: "broadcasted",
          txHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        }
      }
    });

    const writeContract = vi
      .fn()
      .mockResolvedValueOnce("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
      .mockResolvedValueOnce("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(1_000_000_000_000_000_000n);
    const waitForTransactionReceipt = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ status: "success", blockNumber: 127n })
      .mockResolvedValueOnce({ status: "success", blockNumber: 128n });

    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: { readContract, waitForTransactionReceipt },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      }
    });

    const result = await service.seedRegisteredAgent(registration);

    expect(result.activeStake).toBe("1000000000000000000");
    expect(writeContract).toHaveBeenCalledTimes(2);
  });

  it("fails closed when onchain active stake already exists without bootstrap evidence", async () => {
    const store = new InMemoryWorkflowStore();
    const registration = makeRegistration();
    const writeContract = vi.fn();
    const readContract = vi.fn().mockResolvedValueOnce(1_000_000_000_000_000_000n);

    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: {
        readContract,
        waitForTransactionReceipt: vi.fn()
      },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract
      }
    });

    await expect(service.seedRegisteredAgent(registration)).rejects.toThrow(
      "automatic registration seeding is blocked to avoid duplicate funding"
    );
    expect(writeContract).not.toHaveBeenCalled();
    expect((await store.getAgent(registration.walletAddress))?.walletProviderEvidence?.registrationStakeSeedPending).toMatchObject(
      {
        stage: "failed"
      }
    );
  });

  it("reports runtime issues when the seed signer is not the AgentStaking owner", async () => {
    const store = new InMemoryWorkflowStore();
    const service = new AgentStakeSeedService(store, baseEnv as never, {
      publicClient: {
        readContract: vi
          .fn()
          .mockResolvedValueOnce("0x8888888888888888888888888888888888888888")
          .mockResolvedValueOnce(1_000_000_000_000_000_000n),
        waitForTransactionReceipt: vi.fn()
      },
      signerWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract: vi.fn()
      },
      funderWalletClient: {
        account: { address: "0x7777777777777777777777777777777777777777" },
        writeContract: vi.fn()
      }
    });

    const issues = await service.getRuntimeIssues();

    expect(issues).toEqual([
      "agent registration seed signer 0x7777777777777777777777777777777777777777 is not the AgentStaking owner 0x8888888888888888888888888888888888888888"
    ]);
  });
});
