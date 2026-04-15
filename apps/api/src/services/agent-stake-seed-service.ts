import type { AgentProfile, AgentRegistration, JudgeListEntry } from "@proof-of-vault/shared-types";
import { createPublicClient, createWalletClient, defineChain, http, maxUint256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { AppEnv } from "../config/env.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";
import {
  buildPendingSeedEvidence,
  readPendingSeedEvidence,
  readSeedEvidence,
  type PendingSeedEvidence,
  type SeedEvidence
} from "./agent-stake-seed-evidence.js";

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const agentStakingAdminAbi = [
  {
    type: "function",
    name: "seedAgentStakesFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "funder", type: "address" },
      { name: "agents", type: "address[]" },
      { name: "totalAmount", type: "uint256" }
    ],
    outputs: []
  }
] as const;

const agentStakingViewAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "activeStakeOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

type SeedTarget = {
  walletAddress: Address;
  agentLabel: string;
  capabilityTags: AgentProfile["capabilityTags"];
  walletProvider: AgentProfile["walletProvider"];
  judgeListEntry?: JudgeListEntry;
};

type SeedOutcome = {
  agent: AgentProfile;
  judgeListEntry?: JudgeListEntry;
};

type SeedPreparation =
  | {
      status: "seeded";
      agent: AgentProfile;
      evidence: SeedEvidence;
    }
  | {
      status: "pending";
      agent: AgentProfile;
      pending: PendingSeedEvidence;
    }
  | {
      status: "ready";
      agent: AgentProfile;
    };

type SeedBroadcast =
  | Extract<SeedPreparation, { status: "seeded" | "pending" }>
  | {
      status: "broadcasted";
      agent: AgentProfile;
      txHash: Hex;
    };

type SeedClients = {
  publicClient: {
    readContract(args: unknown): Promise<unknown>;
    waitForTransactionReceipt(args: { hash: Hex; timeout?: number }): Promise<{ status: string; blockNumber: bigint }>;
  };
  signerWalletClient: {
    writeContract(args: unknown): Promise<Hex>;
    account?: {
      address: Address;
    };
  };
  funderWalletClient?: {
    writeContract(args: unknown): Promise<Hex>;
    account?: {
      address: Address;
    };
  };
};

const PENDING_SEED_LEASE_MS = 5 * 60 * 1000;
const RECEIPT_RECOVERY_TIMEOUT_MS = 5_000;

function currentActiveStake(agent: AgentProfile | undefined, entry?: JudgeListEntry): string {
  return agent?.activeStake ?? entry?.activeStake ?? "0";
}

function bootstrapSeedLockKey(agentAddress: Address): string {
  return `registration-bootstrap-lock:${agentAddress.toLowerCase()}`;
}

function buildFallbackAgent(target: SeedTarget): AgentProfile {
  return {
    address: target.walletAddress,
    walletAddress: target.walletAddress,
    label: target.agentLabel,
    capabilityTags: target.capabilityTags,
    reputationScore: target.judgeListEntry?.reputationScore ?? 50,
    activeStake: target.judgeListEntry?.activeStake ?? "0",
    canUseAgenticWallet: true,
    status: target.judgeListEntry?.status ?? "available",
    walletProvider: target.walletProvider
  };
}

export class AgentStakeSeedService {
  private readonly enabled: boolean;
  private readonly registrationStakeAmount: bigint;
  private readonly publicClient?: SeedClients["publicClient"];
  private readonly signerWalletClient?: SeedClients["signerWalletClient"];
  private readonly funderWalletClient?: SeedClients["funderWalletClient"];
  private readonly signerAddress?: Address;
  private readonly funderAddress?: Address;
  private readonly agentStakingAddress?: Address;
  private readonly povTokenAddress?: Address;

  constructor(
    private readonly store: WorkflowStore,
    env: AppEnv,
    clients?: SeedClients
  ) {
    this.registrationStakeAmount = BigInt(env.PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT);
    this.enabled = this.registrationStakeAmount > 0n;
    this.agentStakingAddress = env.PROOF_OF_VAULT_AGENT_STAKING_ADDRESS as Address | undefined;
    this.povTokenAddress = env.PROOF_OF_VAULT_POV_TOKEN_ADDRESS as Address | undefined;

    if (!this.enabled) {
      return;
    }

    if (clients) {
      this.publicClient = clients.publicClient;
      this.signerWalletClient = clients.signerWalletClient;
      this.funderWalletClient = clients.funderWalletClient ?? clients.signerWalletClient;
      this.signerAddress = clients.signerWalletClient.account?.address;
      this.funderAddress = (clients.funderWalletClient ?? clients.signerWalletClient).account?.address;
      return;
    }

    const signerPrivateKey =
      (env.PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY ??
        env.PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY) as Hex | undefined;
    const funderPrivateKey =
      (env.PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_FUNDER_PRIVATE_KEY ??
        env.PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY ??
        env.PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY) as Hex | undefined;
    const rpcUrl = env.PROOF_OF_VAULT_RPC_URL;
    if (!signerPrivateKey || !funderPrivateKey || !rpcUrl || !this.agentStakingAddress || !this.povTokenAddress) {
      throw new Error("Agent stake seeding requires RPC, signer key, funder key, POV token, and AgentStaking addresses.");
    }

    const chain = defineChain({
      id: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
      name: "X Layer",
      nativeCurrency: {
        name: "OKB",
        symbol: "OKB",
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [rpcUrl]
        }
      }
    });
    const signerAccount = privateKeyToAccount(signerPrivateKey);
    const funderAccount = privateKeyToAccount(funderPrivateKey);
    this.signerAddress = signerAccount.address;
    this.funderAddress = funderAccount.address;
    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl)
    });
    this.signerWalletClient = createWalletClient({
      chain,
      account: signerAccount,
      transport: http(rpcUrl)
    });
    this.funderWalletClient = createWalletClient({
      chain,
      account: funderAccount,
      transport: http(rpcUrl)
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async seedRegisteredAgent(registration: AgentRegistration): Promise<AgentProfile> {
    const outcome = await this.seedTarget({
      walletAddress: registration.walletAddress.toLowerCase() as Address,
      agentLabel: registration.agentLabel,
      capabilityTags: registration.capabilityTags,
      walletProvider: registration.sourceProvider
    });

    return outcome.agent;
  }

  async getRuntimeIssues(): Promise<string[]> {
    if (!this.enabled) {
      return [];
    }

    if (
      !this.publicClient ||
      !this.signerWalletClient ||
      !this.funderWalletClient ||
      !this.signerAddress ||
      !this.funderAddress ||
      !this.agentStakingAddress ||
      !this.povTokenAddress
    ) {
      return ["agent registration stake seeding is enabled but clients or contract addresses are missing"];
    }

    const issues: string[] = [];
    const [agentStakingOwner, funderBalance] = await Promise.all([
      this.publicClient.readContract({
        address: this.agentStakingAddress,
        abi: agentStakingViewAbi,
        functionName: "owner",
        args: []
      }) as Promise<Address>,
      this.publicClient.readContract({
        address: this.povTokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [this.funderAddress]
      }) as Promise<bigint>
    ]);

    if (agentStakingOwner.toLowerCase() !== this.signerAddress.toLowerCase()) {
      issues.push(
        `agent registration seed signer ${this.signerAddress} is not the AgentStaking owner ${agentStakingOwner}`
      );
    }

    if (funderBalance < this.registrationStakeAmount) {
      issues.push(
        `agent registration seed funder ${this.funderAddress} has insufficient POV balance for one bootstrap seed`
      );
    }

    return issues;
  }

  async seedJudgeListedAgent(entry: JudgeListEntry): Promise<JudgeListEntry> {
    const outcome = await this.seedTarget({
      walletAddress: entry.walletAddress.toLowerCase() as Address,
      agentLabel: entry.agentLabel,
      capabilityTags: entry.capabilityTags,
      walletProvider: entry.sourceProvider,
      judgeListEntry: entry
    });

    return outcome.judgeListEntry ?? entry;
  }

  private async seedTarget(target: SeedTarget): Promise<SeedOutcome> {
    if (!this.enabled) {
      const agent =
        (await this.store.getAgent(target.walletAddress)) ??
        buildFallbackAgent(target);
      return { agent, judgeListEntry: target.judgeListEntry };
    }

    if (
      !this.publicClient ||
      !this.signerWalletClient ||
      !this.funderWalletClient ||
      !this.signerAddress ||
      !this.funderAddress ||
      !this.agentStakingAddress ||
      !this.povTokenAddress
    ) {
      throw new Error("Agent stake seeding is enabled but the on-chain clients are not configured.");
    }

    const walletAddress = target.walletAddress.toLowerCase() as Address;
    let prepared = await this.prepareSeedTarget(target);
    if (prepared.status === "pending") {
      prepared = await this.recoverPendingSeed(target, prepared);
    }

    if (prepared.status === "seeded") {
      return this.persistSeed(
        target,
        prepared.agent,
        currentActiveStake(prepared.agent, target.judgeListEntry),
        prepared.evidence
      );
    }

    if (prepared.status === "pending") {
      return this.persistPending(target, prepared.agent, prepared.pending);
    }

    const onchainStakeBefore = BigInt(await this.readOnchainActiveStake(walletAddress));
    if (onchainStakeBefore > 0n) {
      const errorMessage =
        `Agent ${walletAddress} already has on-chain active stake ${onchainStakeBefore} without persisted bootstrap evidence; ` +
        "automatic registration seeding is blocked to avoid duplicate funding.";
      await this.persistPending(
        target,
        prepared.agent,
        buildPendingSeedEvidence({
          amount: this.registrationStakeAmount,
          signer: this.signerAddress!,
          stage: "failed",
          error: errorMessage,
          attemptedAt: Date.now()
        })
      );
      throw new Error(errorMessage);
    }

    await this.ensureAllowance(this.registrationStakeAmount);
    let txHash: Hex | undefined;
    try {
      const broadcast = await this.beginSeedBroadcast(target, prepared.agent);
      if (broadcast.status === "seeded") {
        return this.persistSeed(
          target,
          broadcast.agent,
          currentActiveStake(broadcast.agent, target.judgeListEntry),
          broadcast.evidence
        );
      }
      if (broadcast.status === "pending") {
        return this.persistPending(target, broadcast.agent, broadcast.pending);
      }
      txHash = broadcast.txHash;

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error(`Registration stake seed transaction ${txHash} failed.`);
      }

      const onchainStakeAfter = BigInt(await this.readOnchainActiveStake(walletAddress));
      const minimumExpectedStake = onchainStakeBefore + this.registrationStakeAmount;
      if (onchainStakeAfter < minimumExpectedStake) {
        throw new Error(
          `Registration stake seed transaction ${txHash} completed but active stake only reached ${onchainStakeAfter}; expected at least ${minimumExpectedStake}.`
        );
      }

      const evidence: SeedEvidence = {
        strategy: "fixed_registration_bootstrap",
        amount: this.registrationStakeAmount.toString(),
        txHash,
        seededAt: Date.now(),
        signer: this.signerAddress!
      };

      return this.persistSeed(target, broadcast.agent, onchainStakeAfter.toString(), evidence);
    } catch (error) {
      await this.persistPending(
        target,
        prepared.agent,
        buildPendingSeedEvidence({
          amount: this.registrationStakeAmount,
          signer: this.signerAddress!,
          stage: "failed",
          txHash,
          error: error instanceof Error ? error.message : "unknown registration stake seed failure",
          attemptedAt: Date.now()
        })
      );
      throw error;
    }
  }

  private async prepareSeedTarget(target: SeedTarget): Promise<SeedPreparation> {
    return this.store.runInTransaction(async (transactionStore) => {
      const currentAgent = (await transactionStore.lockAgent(target.walletAddress)) ?? buildFallbackAgent(target);
      const existingEvidence = readSeedEvidence(currentAgent);
      if (existingEvidence) {
        return {
          status: "seeded",
          agent: currentAgent,
          evidence: existingEvidence
        };
      }

      const existingPending = readPendingSeedEvidence(currentAgent);
      if (existingPending) {
        return {
          status: "pending",
          agent: currentAgent,
          pending: existingPending
        };
      }

      const claimedBootstrapLease = await transactionStore.recordAgentStakeTransaction(
        target.walletAddress,
        bootstrapSeedLockKey(target.walletAddress),
        this.registrationStakeAmount.toString(),
        Date.now()
      );
      if (!claimedBootstrapLease) {
        const updatedAgent = await transactionStore.saveAgent(
          this.buildAgentRecord(
            target,
            currentAgent,
            currentActiveStake(currentAgent, target.judgeListEntry),
            {
              ...(currentAgent.walletProviderEvidence ?? {}),
              registrationStakeSeedPending: buildPendingSeedEvidence({
                amount: this.registrationStakeAmount,
                signer: this.signerAddress!,
                stage: "failed",
                attemptedAt: Date.now(),
                error: "Registration bootstrap seed lease already exists; waiting for on-chain recovery or manual review."
              })
            }
          )
        );

        return {
          status: "pending",
          agent: updatedAgent,
          pending: readPendingSeedEvidence(updatedAgent) ?? buildPendingSeedEvidence({
            amount: this.registrationStakeAmount,
            signer: this.signerAddress!,
            stage: "failed",
            attemptedAt: Date.now(),
            error: "Registration bootstrap seed lease already exists; waiting for on-chain recovery or manual review."
          })
        };
      }

      const updatedAgent = await transactionStore.saveAgent(
        this.buildAgentRecord(
          target,
          currentAgent,
          currentActiveStake(currentAgent, target.judgeListEntry),
          {
            ...(currentAgent.walletProviderEvidence ?? {}),
            registrationStakeSeedPending: buildPendingSeedEvidence({
              amount: this.registrationStakeAmount,
              signer: this.signerAddress!,
              stage: "awaiting_tx_hash"
            })
          }
        )
      );

      return {
        status: "ready",
        agent: updatedAgent
      };
    });
  }

  private async beginSeedBroadcast(target: SeedTarget, existingAgent: AgentProfile): Promise<SeedBroadcast> {
    return this.store.runInTransaction(async (transactionStore) => {
      const currentAgent = (await transactionStore.lockAgent(target.walletAddress)) ?? existingAgent;
      const existingEvidence = readSeedEvidence(currentAgent);
      if (existingEvidence) {
        return {
          status: "seeded",
          agent: currentAgent,
          evidence: existingEvidence
        };
      }

      const existingPending = readPendingSeedEvidence(currentAgent);
      if (existingPending) {
        const expectedPending = readPendingSeedEvidence(existingAgent);
        const canUseAwaitingLease =
          existingPending.stage === "awaiting_tx_hash" &&
          expectedPending?.stage === "awaiting_tx_hash" &&
          existingPending.startedAt === expectedPending.startedAt;
        if (!canUseAwaitingLease) {
          return {
            status: "pending",
            agent: currentAgent,
            pending: existingPending
          };
        }
      }

      const txHash = await this.signerWalletClient!.writeContract({
        chain: undefined,
        address: this.agentStakingAddress!,
        abi: agentStakingAdminAbi,
        functionName: "seedAgentStakesFrom",
        args: [this.funderAddress!, [target.walletAddress], this.registrationStakeAmount]
      });

      const updatedAgent = await transactionStore.saveAgent(
        this.buildAgentRecord(
          target,
          currentAgent,
          currentActiveStake(currentAgent, target.judgeListEntry),
          {
            ...(currentAgent.walletProviderEvidence ?? {}),
            registrationStakeSeedPending: buildPendingSeedEvidence({
              amount: this.registrationStakeAmount,
              signer: this.signerAddress!,
              stage: "broadcasted",
              txHash
            })
          }
        )
      );

      return {
        status: "broadcasted",
        agent: updatedAgent,
        txHash
      };
    });
  }

  private async recoverPendingSeed(
    target: SeedTarget,
    prepared: Extract<SeedPreparation, { status: "pending" }>
  ): Promise<SeedPreparation> {
    const walletAddress = target.walletAddress.toLowerCase() as Address;
    const minimumSeedAmount = BigInt(prepared.pending.amount);
    const leaseExpired = Date.now() - prepared.pending.startedAt >= PENDING_SEED_LEASE_MS;

    if (prepared.pending.txHash) {
      try {
        const receipt = await this.publicClient!.waitForTransactionReceipt({
          hash: prepared.pending.txHash as Hex,
          timeout: RECEIPT_RECOVERY_TIMEOUT_MS
        });
        const currentStake = BigInt(await this.readOnchainActiveStake(walletAddress));
        if (receipt.status === "success" && currentStake >= minimumSeedAmount) {
          return {
            status: "seeded",
            agent: {
              ...prepared.agent,
              activeStake: currentStake.toString()
            },
            evidence: {
              strategy: "fixed_registration_bootstrap",
              amount: prepared.pending.amount,
              txHash: prepared.pending.txHash,
              seededAt: Date.now(),
              signer: prepared.pending.signer
            }
          };
        }

        if (currentStake === 0n) {
          return this.rearmPendingSeed(target, prepared, {
            error: `Registration stake seed transaction ${prepared.pending.txHash} did not finalize successfully.`
          });
        }
      } catch {
        const currentStake = BigInt(await this.readOnchainActiveStake(walletAddress));
        if (currentStake >= minimumSeedAmount) {
          return {
            status: "seeded",
            agent: {
              ...prepared.agent,
              activeStake: currentStake.toString()
            },
            evidence: {
              strategy: "fixed_registration_bootstrap",
              amount: prepared.pending.amount,
              txHash: prepared.pending.txHash,
              seededAt: Date.now(),
              signer: prepared.pending.signer
            }
          };
        }

        if (leaseExpired) {
          return this.rearmPendingSeed(target, prepared, {
            error: `Registration stake seed transaction ${prepared.pending.txHash} remained pending past the recovery lease.`
          });
        }
      }
    } else if (BigInt(await this.readOnchainActiveStake(walletAddress)) >= minimumSeedAmount) {
      const currentStake = await this.readOnchainActiveStake(walletAddress);
      return {
        status: "seeded",
        agent: {
          ...prepared.agent,
          activeStake: currentStake
        },
        evidence: {
          strategy: "fixed_registration_bootstrap",
          amount: prepared.pending.amount,
          txHash: `recovered-pending-bootstrap:${walletAddress}`,
          seededAt: Date.now(),
          signer: prepared.pending.signer
        }
      };
    }

    const canRetryWithoutTxHash =
      !prepared.pending.txHash && prepared.pending.stage === "failed";
    if (!canRetryWithoutTxHash) {
      return prepared;
    }

    return this.rearmPendingSeed(target, prepared);
  }

  private async rearmPendingSeed(
    target: SeedTarget,
    prepared: Extract<SeedPreparation, { status: "pending" }>,
    input?: { error?: string }
  ): Promise<SeedPreparation> {
    return this.store.runInTransaction(async (transactionStore) => {
      const currentAgent = (await transactionStore.lockAgent(target.walletAddress)) ?? buildFallbackAgent(target);
      const existingEvidence = readSeedEvidence(currentAgent);
      if (existingEvidence) {
        return {
          status: "seeded",
          agent: currentAgent,
          evidence: existingEvidence
        };
      }

      const currentPending = readPendingSeedEvidence(currentAgent);
      if (
        !currentPending ||
        currentPending.startedAt !== prepared.pending.startedAt ||
        currentPending.stage !== prepared.pending.stage ||
        currentPending.txHash !== prepared.pending.txHash
      ) {
        return currentPending
          ? {
              status: "pending",
              agent: currentAgent,
              pending: currentPending
            }
          : {
              status: "ready",
              agent: currentAgent
            };
      }

      const updatedAgent = await transactionStore.saveAgent(
        this.buildAgentRecord(
          target,
          currentAgent,
          currentActiveStake(currentAgent, target.judgeListEntry),
          (() => {
            const nextWalletProviderEvidence = {
              ...(currentAgent.walletProviderEvidence ?? {})
            } as Record<string, unknown>;
            delete nextWalletProviderEvidence.registrationStakeSeedPending;
            if (input?.error) {
              nextWalletProviderEvidence.lastRegistrationStakeSeedRecoveryError = input.error;
            }
            return nextWalletProviderEvidence;
          })()
        )
      );

      return {
        status: "ready",
        agent: updatedAgent
      };
    });
  }

  private async persistPending(
    target: SeedTarget,
    existingAgent: AgentProfile | undefined,
    pendingEvidence: PendingSeedEvidence
  ): Promise<SeedOutcome> {
    return this.store.runInTransaction(async (transactionStore) => {
      const currentAgent = (await transactionStore.lockAgent(target.walletAddress)) ?? existingAgent ?? buildFallbackAgent(target);
      const existingEvidence = readSeedEvidence(currentAgent);
      if (existingEvidence) {
        const updatedJudgeListEntry = target.judgeListEntry
          ? await transactionStore.saveJudgeListEntry({
              ...target.judgeListEntry,
              activeStake: currentAgent.activeStake
            })
          : undefined;
        return {
          agent: currentAgent,
          judgeListEntry: updatedJudgeListEntry
        };
      }
      const updatedAgent = await transactionStore.saveAgent(
        this.buildAgentRecord(
          target,
          currentAgent,
          currentActiveStake(currentAgent, target.judgeListEntry),
          {
            ...(currentAgent.walletProviderEvidence ?? {}),
            registrationStakeSeedPending: pendingEvidence
          }
        )
      );

      if (!target.judgeListEntry) {
        return { agent: updatedAgent };
      }

      const updatedJudgeListEntry = await transactionStore.saveJudgeListEntry({
        ...target.judgeListEntry,
        activeStake: updatedAgent.activeStake
      });

      return {
        agent: updatedAgent,
        judgeListEntry: updatedJudgeListEntry
      };
    });
  }

  private buildAgentRecord(
    target: SeedTarget,
    currentAgent: AgentProfile,
    nextStake: string,
    walletProviderEvidence: Record<string, unknown>
  ): AgentProfile {
    return {
      ...currentAgent,
      address: target.walletAddress,
      walletAddress: target.walletAddress,
      label: target.agentLabel,
      capabilityTags: target.capabilityTags,
      activeStake: nextStake,
      walletProvider: target.walletProvider,
      walletProviderEvidence
    };
  }

  private async persistSeed(
    target: SeedTarget,
    existingAgent: AgentProfile | undefined,
    nextStake: string,
    evidence: SeedEvidence
  ): Promise<SeedOutcome> {
    return this.store.runInTransaction(async (transactionStore) => {
      const currentAgent = (await transactionStore.lockAgent(target.walletAddress)) ?? existingAgent ?? buildFallbackAgent(target);
      if (readSeedEvidence(currentAgent)) {
        const updatedJudgeListEntry = target.judgeListEntry
          ? await transactionStore.saveJudgeListEntry({
              ...target.judgeListEntry,
              activeStake: currentAgent.activeStake
            })
          : undefined;
        return { agent: currentAgent, judgeListEntry: updatedJudgeListEntry };
      }

      const nextWalletProviderEvidence = {
        ...(currentAgent.walletProviderEvidence ?? {}),
        registrationStakeSeed: evidence
      } as Record<string, unknown>;
      const currentPending = readPendingSeedEvidence(currentAgent);
      const expectedPending = readPendingSeedEvidence(existingAgent);
      const shouldClearPending =
        !currentPending ||
        (currentPending.txHash === evidence.txHash &&
          expectedPending?.txHash === currentPending.txHash &&
          expectedPending.stage === currentPending.stage) ||
        (currentPending.stage === "awaiting_tx_hash" &&
          expectedPending?.stage === "awaiting_tx_hash" &&
          currentPending.startedAt === expectedPending.startedAt &&
          currentPending.amount === evidence.amount) ||
        (!currentPending.txHash &&
          evidence.txHash.startsWith("recovered-pending-bootstrap:") &&
          expectedPending?.stage === currentPending.stage &&
          expectedPending.startedAt === currentPending.startedAt);
      if (shouldClearPending) {
        delete nextWalletProviderEvidence.registrationStakeSeedPending;
      }

      const updatedAgent = await transactionStore.saveAgent(
        this.buildAgentRecord(target, currentAgent, nextStake, {
          ...nextWalletProviderEvidence
        })
      );

      if (!target.judgeListEntry) {
        return { agent: updatedAgent };
      }

      const updatedJudgeListEntry = await transactionStore.saveJudgeListEntry({
        ...target.judgeListEntry,
        activeStake: updatedAgent.activeStake
      });

      return {
        agent: updatedAgent,
        judgeListEntry: updatedJudgeListEntry
      };
    });
  }

  private async ensureAllowance(minimumAmount: bigint): Promise<void> {
    const allowance = (await this.publicClient!.readContract({
      address: this.povTokenAddress!,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.funderAddress!, this.agentStakingAddress!]
    })) as bigint;

    if (allowance >= minimumAmount) {
      return;
    }

    const approveTxHash = await this.funderWalletClient!.writeContract({
      chain: undefined,
      address: this.povTokenAddress!,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.agentStakingAddress!, maxUint256]
    });
    const approveReceipt = await this.publicClient!.waitForTransactionReceipt({ hash: approveTxHash });
    if (approveReceipt.status !== "success") {
      throw new Error(`POV approve transaction ${approveTxHash} failed.`);
    }
  }

  private async readOnchainActiveStake(agent: Address): Promise<string> {
    return (
      (await this.publicClient!.readContract({
        address: this.agentStakingAddress!,
        abi: agentStakingViewAbi,
        functionName: "activeStakeOf",
        args: [agent]
      })) as bigint
    ).toString();
  }
}
