import type {
  AgentProfile,
  CreateVaultRequest,
  DemoMockState
} from "@proof-of-vault/shared-types";
import { DEFAULT_TARGET_EVM_CHAIN_ID } from "@proof-of-vault/shared-types";

import type { WorkflowStore } from "../repositories/workflow-store.js";
import { WorkflowService } from "./workflow-service.js";

function demoAgents(): AgentProfile[] {
  return [
    {
      address: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
      label: "Maker Alpha",
      capabilityTags: ["rule-maker", "all-rounder"],
      reputationScore: 88,
      activeStake: "2000",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    },
    {
      address: "0x2222222222222222222222222222222222222222",
      walletAddress: "0x2222222222222222222222222222222222222222",
      label: "Maker Beta",
      capabilityTags: ["rule-maker", "rule-verifier"],
      reputationScore: 83,
      activeStake: "1900",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    },
    {
      address: "0x3333333333333333333333333333333333333333",
      walletAddress: "0x3333333333333333333333333333333333333333",
      label: "Verifier Gamma",
      capabilityTags: ["rule-verifier", "auditor"],
      reputationScore: 86,
      activeStake: "1800",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    },
    {
      address: "0x4444444444444444444444444444444444444444",
      walletAddress: "0x4444444444444444444444444444444444444444",
      label: "Validator Delta",
      capabilityTags: ["validator", "challenger"],
      reputationScore: 92,
      activeStake: "3000",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    },
    {
      address: "0x5555555555555555555555555555555555555555",
      walletAddress: "0x5555555555555555555555555555555555555555",
      label: "Validator Epsilon",
      capabilityTags: ["validator", "all-rounder"],
      reputationScore: 90,
      activeStake: "2800",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    },
    {
      address: "0x6666666666666666666666666666666666666666",
      walletAddress: "0x6666666666666666666666666666666666666666",
      label: "Validator Zeta",
      capabilityTags: ["validator", "auditor"],
      reputationScore: 85,
      activeStake: "2600",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    },
    {
      address: "0x7777777777777777777777777777777777777777",
      walletAddress: "0x7777777777777777777777777777777777777777",
      label: "Auditor Eta",
      capabilityTags: ["auditor", "challenger"],
      reputationScore: 84,
      activeStake: "2400",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "mock-agentic-wallet"
    }
  ];
}

export class MockDataService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly workflowService: WorkflowService,
    private readonly chainId = DEFAULT_TARGET_EVM_CHAIN_ID
  ) {}

  async ensureBaseAgents(): Promise<AgentProfile[]> {
    if ((await this.store.listAgents()).length === 0) {
      await Promise.all(demoAgents().map((agent) => this.store.seedJudgeListedAgent(agent)));
    }

    return this.store.listAgents();
  }

  async getDemoState(): Promise<DemoMockState> {
    await this.ensureBaseAgents();

    const sampleCreateVault: CreateVaultRequest = {
      mode: "draft",
      legacyMode: false,
      setterAddress: "0x9999999999999999999999999999999999999999",
      metadataURI: "ipfs://proof-of-vault/demo/vault",
      statement: "FDV must stay above 1000000 USD at settlement time.",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() + 3600_000,
        chainId: this.chainId
      };

    return {
      vaults: await Promise.all((await this.store.listVaults()).map((vault) => this.workflowService.getVaultDetail(vault.id))),
      agents: await this.store.listAgents(),
      sampleRequests: {
        createVault: sampleCreateVault,
        ruleDraft: {
          vaultId: 1,
          round: 1,
          template: "fdv_above_at_time",
          statement: sampleCreateVault.statement ?? "",
          inputs: {
            tokenAddress: sampleCreateVault.collateralToken,
            thresholdUsd: "1000000",
            observationTime: new Date(sampleCreateVault.settlementTime ?? Date.now()).toISOString()
          },
          sources: [],
          version: 1
        },
        ruleIssue: {
          vaultId: 1,
          round: 1,
          severity: "HIGH",
          issueType: "ambiguous_source_policy",
          notes: "Primary source priority should be explicit.",
          version: 1
        },
        resolutionReveal: {
          vaultId: 1,
          round: 1,
          result: "TRUE",
          confidenceScore: 0.92,
          sources: [],
          reasoning: "Observed FDV remained above the threshold at settlement time.",
          submittedByAgent: "0x4444444444444444444444444444444444444444",
          version: 1
        },
        auditVerdict: {
          vaultId: 1,
          round: 1,
          validator: "0x4444444444444444444444444444444444444444",
          verdict: "VALID",
          findings: [],
          reviewerAgent: "0x7777777777777777777777777777777777777777",
          version: 1
        }
      }
    };
  }
}
