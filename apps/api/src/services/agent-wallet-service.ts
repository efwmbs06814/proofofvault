import type {
  AgentProfile,
  AgentStakeRequest,
  ClaimRewardsRequest,
  ExecutionTrace,
  PreparedExecution
} from "@proof-of-vault/shared-types";
import type { AgenticWalletProvider } from "@proof-of-vault/agent-runtime";

import { ValidationError } from "../lib/errors.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";

const OKX_AGENTIC_WALLET_PROVIDER = "okx-agentic-wallet";

function createFallbackAgent(address: string): AgentProfile {
  return {
    address: address.toLowerCase(),
    walletAddress: address.toLowerCase(),
    label: `Agent ${address.slice(0, 8)}`,
    capabilityTags: ["all-rounder"],
    reputationScore: 50,
    activeStake: "0",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  };
}

function addIntegerString(left: string, right: string): string {
  try {
    return (BigInt(left) + BigInt(right)).toString();
  } catch {
    return left;
  }
}

function requireExternalTxHash(providerName: string, flow: string): void {
  if (providerName !== OKX_AGENTIC_WALLET_PROVIDER) {
    return;
  }

  throw new ValidationError(
    `Real agent wallet mode requires ${flow}/prepare, an agent wallet broadcast, and then a verified txHash.`
  );
}

export class AgentWalletService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly walletProvider: AgenticWalletProvider
  ) {}

  async prepareStakeForAgent(request: AgentStakeRequest): Promise<PreparedExecution> {
    const agent = await this.ensureAgent(request.agentAddress);
    return this.walletProvider.prepareExecution({
      action: "stakeForAgent",
      agent,
      amount: request.amount,
      payloadURI: request.payloadURI,
      metadata: request.metadata
    });
  }

  async stakeForAgent(request: AgentStakeRequest): Promise<ExecutionTrace> {
    const agent = await this.ensureAgent(request.agentAddress);
    const walletRequest = {
      action: "stakeForAgent" as const,
      agent,
      amount: request.amount,
      payloadURI: request.payloadURI,
      metadata: request.metadata
    };
    if (!request.txHash) {
      requireExternalTxHash(this.walletProvider.name, "/agents/stake");
    }

    const trace = request.txHash
      ? await this.walletProvider.verifyExecution(walletRequest, request.txHash as `0x${string}`)
      : await this.walletProvider.execute(walletRequest);

    await this.store.runInTransaction(async (store) => {
      const currentAgent = (await store.getAgent(agent.address)) ?? agent;
      const newlyRecordedStakeTx = await store.recordAgentStakeTransaction(
        currentAgent.address,
        trace.txHash,
        request.amount,
        Date.now()
      );

      await store.saveAgent({
        ...currentAgent,
        activeStake: newlyRecordedStakeTx
          ? addIntegerString(currentAgent.activeStake, request.amount)
          : currentAgent.activeStake
      });
    });
    return trace;
  }

  async prepareClaimRewards(request: ClaimRewardsRequest): Promise<PreparedExecution> {
    const agent = await this.ensureAgent(request.agentAddress);
    return this.walletProvider.prepareExecution({
      action: "claimRewards",
      agent,
      vaultIds: request.vaultIds,
      payloadURI: request.payloadURI,
      metadata: request.metadata
    });
  }

  async claimRewards(request: ClaimRewardsRequest): Promise<ExecutionTrace> {
    const agent = await this.ensureAgent(request.agentAddress);
    const walletRequest = {
      action: "claimRewards" as const,
      agent,
      vaultIds: request.vaultIds,
      payloadURI: request.payloadURI,
      metadata: request.metadata
    };
    if (!request.txHash) {
      requireExternalTxHash(this.walletProvider.name, "/agents/claim-rewards");
    }

    const trace = request.txHash
      ? await this.walletProvider.verifyExecution(walletRequest, request.txHash as `0x${string}`)
      : await this.walletProvider.execute(walletRequest);

    for (const vaultId of request.vaultIds) {
      const vault = await this.store.getVault(vaultId);
      if (!vault) {
        continue;
      }

      await this.store.saveVault({
        ...vault,
        traces: [...vault.traces, trace],
        updatedAt: Date.now()
      });
    }

    return trace;
  }

  private async ensureAgent(address: string): Promise<AgentProfile> {
    const existing = await this.store.getAgent(address);
    const ensured = await this.walletProvider.ensureWallet(existing ?? createFallbackAgent(address));
    await this.store.saveAgent(ensured);
    return ensured;
  }
}
