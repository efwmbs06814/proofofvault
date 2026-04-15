import type { AgentProfile, ExecutionTrace, WalletSignatureProof } from "@proof-of-vault/shared-types";
import { DEFAULT_OKX_CHAIN_INDEX, DEFAULT_TARGET_EVM_CHAIN_ID } from "@proof-of-vault/shared-types";
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { buildAgentStageContractCall } from "../onchain-gateway-v2.js";
import type { PreparedExecution } from "../../../shared-types/src/runtime.js";
import type {
  AgenticWalletProvider,
  AgentWalletProvisioningRequest,
  AgenticWalletRequest,
  AgenticWalletSignatureRequest
} from "./agentic-wallet-provider.js";

// Public deterministic test account, derived at runtime so secret scanners do not flag a raw private key.
const MOCK_AGENTIC_WALLET_ACCOUNT = privateKeyToAccount(
  keccak256(stringToHex("proof-of-vault/mock-agentic-wallet"))
);
export const MOCK_AGENTIC_WALLET_ADDRESS = MOCK_AGENTIC_WALLET_ACCOUNT.address;

function fallbackProvisionedAgent(request: AgentWalletProvisioningRequest): AgentProfile {
  const capabilityTags = (
    Array.isArray(request.metadata?.capabilityTags)
      ? request.metadata.capabilityTags.filter((tag) => typeof tag === "string")
      : ["all-rounder"]
  ) as AgentProfile["capabilityTags"];

  return {
    address: MOCK_AGENTIC_WALLET_ADDRESS,
    walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
    label:
      typeof request.metadata?.label === "string"
        ? request.metadata.label
        : typeof request.metadata?.agentLabel === "string"
          ? request.metadata.agentLabel
          : "Provisioned Mock Agent",
    capabilityTags,
    reputationScore: 50,
    activeStake: "0",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  };
}

function deterministicHash(seed: string): `0x${string}` {
  return keccak256(stringToHex(seed));
}

export class MockAgenticWalletProvider implements AgenticWalletProvider {
  readonly name = "mock-agentic-wallet";
  private nextChallengeId = 1;

  async ensureWallet(agent: AgentProfile): Promise<AgentProfile> {
    return {
      ...agent,
      walletAddress: agent.walletAddress ?? agent.address.toLowerCase(),
      walletProvider: "mock-agentic-wallet",
      canUseAgenticWallet: true,
      walletProvisionedAt: agent.walletProvisionedAt,
      walletProviderEvidence: agent.walletProviderEvidence ?? {}
    };
  }

  async provisionWallet(request: AgentWalletProvisioningRequest): Promise<AgentProfile> {
    const agent = await this.ensureWallet(request.agent ?? fallbackProvisionedAgent(request));
    return {
      ...agent,
      address: MOCK_AGENTIC_WALLET_ADDRESS,
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      walletProvisionedAt: Date.now(),
      walletProviderEvidence: {
        ...agent.walletProviderEvidence,
        provisioningMode: "operator-cli",
        targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
        mockProvisioning: true
      }
    };
  }

  async prepareExecution(request: AgenticWalletRequest): Promise<PreparedExecution> {
    const walletAddress = request.agent.walletAddress ?? request.agent.address;
    const contractCall = buildAgentStageContractCall(request);

    return {
      sourceProvider: this.name,
      actorAddress: walletAddress,
      approvals: [],
      transaction: {
        kind: "transaction",
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        to: walletAddress,
        data: deterministicHash(`${request.action}:prepared`),
        value: "0",
        description: `Mock prepared transaction for ${request.action}`,
        contractName: contractCall.contract,
        functionName: contractCall.functionName,
        metadata: {
          ...contractCall.args
        }
      },
      proofHash: request.proofHash,
      metadata: {
        mockPreparedExecution: true
      }
    };
  }

  async verifyExecution(request: AgenticWalletRequest, txHash: `0x${string}`): Promise<ExecutionTrace> {
    const trace = await this.execute(request);
    return {
      ...trace,
      txHash,
      sourceProvider: `${this.name}-verified`
    };
  }

  async execute(request: AgenticWalletRequest): Promise<ExecutionTrace> {
    const walletAddress = request.agent.walletAddress ?? request.agent.address;
    const seed = [request.action, request.agent.address, request.payloadURI ?? "", Date.now().toString()].join(":");
    const contractCall = buildAgentStageContractCall(request);
    const callResult =
      request.action === "openPublicChallenge"
        ? { challengeId: this.nextChallengeId++ }
        : request.action === "claimRewards"
          ? { claimedAmount: "0", vaultIds: request.vaultIds ?? [] }
          : undefined;

    return {
      action: request.action,
      actorAddress: request.agent.address,
      executedByWallet: walletAddress,
      txHash: deterministicHash(seed),
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      sourceProvider: this.name,
      payloadURI: request.payloadURI,
      proofHash: request.proofHash,
      callArgs: {
        contract: contractCall.contract,
        functionName: contractCall.functionName,
        ...contractCall.args
      },
      callResult,
      recordedAt: Date.now()
    };
  }

  async signMessage(request: AgenticWalletSignatureRequest): Promise<WalletSignatureProof> {
    if (request.walletAddress.toLowerCase() !== MOCK_AGENTIC_WALLET_ADDRESS.toLowerCase()) {
      throw new Error("Mock Agentic Wallet can only sign for the deterministic mock wallet address.");
    }

    const signature = await MOCK_AGENTIC_WALLET_ACCOUNT.signMessage({ message: request.message });

    return {
      action: request.action,
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      chainId: request.chainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      nonce: request.nonce,
      message: request.message,
      signature,
      sourceProvider: this.name,
      signedAt: Date.now()
    };
  }
}
