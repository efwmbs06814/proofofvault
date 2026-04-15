import {
  DEFAULT_OKX_CHAIN_INDEX,
  DEFAULT_TARGET_EVM_CHAIN_ID,
  addressSchema,
  txHashSchema,
  walletSignatureProofSchema,
  type AgentProfile,
  type ExecutionTrace,
  type WalletSignatureProof
} from "@proof-of-vault/shared-types";
import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient
} from "viem";

import { buildAgentStageContractCall } from "../onchain-gateway-v2.js";
import { postOkxJson } from "./okx-auth.js";
import type { PreparedExecution, PreparedExecutionStep } from "../../../shared-types/src/runtime.js";
import type {
  AgenticWalletProvider,
  AgentWalletProvisioningRequest,
  AgenticWalletRequest,
  AgenticWalletSignatureRequest
} from "./agentic-wallet-provider.js";

type OkxWalletTransport = (request: {
  endpoint: string;
  accessKey: string;
  secretKey?: string;
  passphrase?: string;
  body: Record<string, unknown>;
}) => Promise<unknown>;

type LinkedContracts = {
  rewardPool: Address;
  feeManager: Address;
  resolutionRegistry: Address;
};

type VerifiedExecution = {
  executedByWallet: Address;
  callResult?: Record<string, unknown>;
};

type EncodedAgentExecution = {
  contractAddress: Address;
  contractName: "vaultFactory" | "agentStaking" | "stakeToken";
  functionName: string;
  data: Hex;
  value: bigint;
};

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
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const vaultFactoryGetterAbi = [
  {
    type: "function",
    name: "rewardPool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "feeManager",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "resolutionRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const feeManagerAbi = [
  {
    type: "function",
    name: "previewChallengeBond",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

const agentStakingAbi = [
  {
    type: "function",
    name: "stakeForAgent",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  },
  {
    type: "event",
    name: "AgentStaked",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newStake", type: "uint256", indexed: false }
    ]
  }
] as const;

const vaultFactoryActionAbi = [
  {
    type: "function",
    name: "submitRuleDraft",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "draftHash", type: "bytes32" },
      { name: "payloadURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "submitRuleIssue",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "severity", type: "uint8" },
      { name: "issueHash", type: "bytes32" },
      { name: "payloadURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "commitResolution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "commitHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "revealResolution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "proofHash", type: "bytes32" },
      { name: "salt", type: "bytes32" },
      { name: "payloadURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "submitAuditVerdict",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "validator", type: "address" },
      { name: "verdict", type: "uint8" },
      { name: "verdictHash", type: "bytes32" },
      { name: "payloadURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "openPublicChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "target", type: "address" },
      { name: "challengeHash", type: "bytes32" },
      { name: "payloadURI", type: "string" }
    ],
    outputs: [{ name: "challengeId", type: "uint256" }]
  },
  {
    type: "function",
    name: "claimRewards",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      { name: "povAmount", type: "uint256" },
      { name: "nativeOkbAmount", type: "uint256" }
    ]
  },
  {
    type: "event",
    name: "RuleDraftSubmitted",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "draftHash", type: "bytes32", indexed: false },
      { name: "payloadURI", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "RuleIssueSubmitted",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: true },
      { name: "verifier", type: "address", indexed: true },
      { name: "severity", type: "uint8", indexed: false },
      { name: "issueHash", type: "bytes32", indexed: false },
      { name: "payloadURI", type: "string", indexed: false }
    ]
  }
] as const;

const resolutionRegistryAbi = [
  {
    type: "event",
    name: "ResolutionCommitRecorded",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: true },
      { name: "validator", type: "address", indexed: true },
      { name: "commitHash", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "event",
    name: "ResolutionRevealRecorded",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: true },
      { name: "validator", type: "address", indexed: true },
      { name: "outcome", type: "uint8", indexed: false },
      { name: "proofHash", type: "bytes32", indexed: false },
      { name: "payloadURI", type: "string", indexed: false },
      { name: "disqualified", type: "bool", indexed: false }
    ]
  },
  {
    type: "event",
    name: "AuditVerdictRecorded",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: true },
      { name: "validator", type: "address", indexed: true },
      { name: "auditor", type: "address", indexed: false },
      { name: "verdict", type: "uint8", indexed: false },
      { name: "verdictHash", type: "bytes32", indexed: false },
      { name: "payloadURI", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "ChallengeOpened",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: true },
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "challenger", type: "address", indexed: false },
      { name: "target", type: "address", indexed: false },
      { name: "challengeHash", type: "bytes32", indexed: false },
      { name: "payloadURI", type: "string", indexed: false },
      { name: "bondAmount", type: "uint256", indexed: false }
    ]
  }
] as const;

const rewardPoolAbi = [
  {
    type: "event",
    name: "RewardClaimed",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "SetupRewardClaimed",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  }
] as const;

async function defaultTransport(request: {
  endpoint: string;
  accessKey: string;
  secretKey?: string;
  passphrase?: string;
  body: Record<string, unknown>;
}): Promise<unknown> {
  return postOkxJson(request);
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const found = record[key];
  return typeof found === "string" ? found : undefined;
}

function nested(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function readCapabilityTags(value: unknown): AgentProfile["capabilityTags"] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is AgentProfile["capabilityTags"][number] => typeof entry === "string");
}

function sameAddress(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.toLowerCase() === right.toLowerCase();
}

function safeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeded Number.MAX_SAFE_INTEGER.`);
  }

  return Number(value);
}

function resolutionOutcomeIndex(outcome: "TRUE" | "FALSE" | "INVALID"): number {
  switch (outcome) {
    case "TRUE":
      return 1;
    case "FALSE":
      return 2;
    case "INVALID":
      return 3;
  }
}

function issueSeverityIndex(severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): number {
  switch (severity) {
    case "LOW":
      return 1;
    case "MEDIUM":
      return 2;
    case "HIGH":
      return 3;
    case "CRITICAL":
      return 4;
  }
}

function auditVerdictIndex(verdict: "VALID" | "QUESTIONABLE" | "INVALID" | "MALICIOUS"): number {
  switch (verdict) {
    case "VALID":
      return 1;
    case "QUESTIONABLE":
      return 2;
    case "INVALID":
      return 3;
    case "MALICIOUS":
      return 4;
  }
}

function encodedCallForRequest(request: AgenticWalletRequest, contractAddress: Address): EncodedAgentExecution {
  switch (request.action) {
    case "stakeForAgent":
      return {
        contractAddress,
        contractName: "agentStaking",
        functionName: "stakeForAgent",
        data: encodeFunctionData({
          abi: agentStakingAbi,
          functionName: "stakeForAgent",
          args: [BigInt(request.amount)]
        }),
        value: 0n
      };
    case "submitRuleDraft":
      return {
        contractAddress,
        contractName: "vaultFactory",
        functionName: "submitRuleDraft",
        data: encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "submitRuleDraft",
          args: [BigInt(request.vaultId), request.draftHash, request.payloadURI ?? ""]
        }),
        value: 0n
      };
    case "submitRuleIssue":
      return {
        contractAddress,
        contractName: "vaultFactory",
        functionName: "submitRuleIssue",
        data: encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "submitRuleIssue",
          args: [BigInt(request.vaultId), issueSeverityIndex(request.severity), request.issueHash, request.payloadURI ?? ""]
        }),
        value: 0n
      };
    case "commitResolution":
      return {
        contractAddress,
        contractName: "vaultFactory",
        functionName: "commitResolution",
        data: encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "commitResolution",
          args: [BigInt(request.vaultId), request.commitHash]
        }),
        value: 0n
      };
    case "revealResolution":
      return {
        contractAddress,
        contractName: "vaultFactory",
        functionName: "revealResolution",
        data: encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "revealResolution",
          args: [
            BigInt(request.vaultId),
            resolutionOutcomeIndex(request.outcome),
            request.proofHash,
            request.salt,
            request.payloadURI ?? ""
          ]
        }),
        value: 0n
      };
    case "submitAuditVerdict":
      return {
        contractAddress,
        contractName: "vaultFactory",
        functionName: "submitAuditVerdict",
        data: encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "submitAuditVerdict",
          args: [
            BigInt(request.vaultId),
            request.validator,
            auditVerdictIndex(request.verdict),
            request.verdictHash,
            request.payloadURI ?? ""
          ]
        }),
        value: 0n
      };
    case "openPublicChallenge":
      return {
        contractAddress,
        contractName: "vaultFactory",
        functionName: "openPublicChallenge",
        data: encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "openPublicChallenge",
          args: [BigInt(request.vaultId), request.target, request.challengeHash, request.payloadURI ?? ""]
        }),
        value: 0n
      };
    case "claimRewards":
      return {
        contractAddress,
        contractName: "vaultFactory",
        functionName: "claimRewards",
        data: encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "claimRewards"
        }),
        value: 0n
      };
  }
}

function toPreparedStep(input: {
  kind: "approval" | "transaction";
  chainId: number;
  to: Address;
  data: Hex;
  value?: bigint;
  description: string;
  contractAddress?: Address;
  contractName?: string;
  functionName?: string;
  metadata?: Record<string, unknown>;
}): PreparedExecutionStep {
  return {
    kind: input.kind,
    chainId: input.chainId,
    to: input.to,
    data: input.data,
    value: (input.value ?? 0n).toString(),
    description: input.description,
    contractAddress: input.contractAddress,
    contractName: input.contractName,
    functionName: input.functionName,
    metadata: input.metadata ?? {}
  };
}

export class OkxAgenticWalletProvider implements AgenticWalletProvider {
  readonly name = "okx-agentic-wallet";
  private readonly publicClient?: PublicClient;
  private linkedContractsPromise?: Promise<LinkedContracts>;

  constructor(
    private readonly options: {
      mode: "skills" | "mcp";
      accessKey?: string;
      secretKey?: string;
      passphrase?: string;
      endpoint?: string;
      rpcUrl?: string;
      targetEvmChainId?: number;
      okxChainIndex?: number;
      vaultFactoryAddress?: `0x${string}`;
      agentStakingAddress?: `0x${string}`;
      stakeTokenAddress?: `0x${string}`;
      transport?: OkxWalletTransport;
    }
  ) {
    if (!options.accessKey) {
      throw new Error("OKX Agentic Wallet integration is not configured. Set PROOF_OF_VAULT_OKX_ACCESS_KEY first.");
    }

    if ((options.secretKey && !options.passphrase) || (!options.secretKey && options.passphrase)) {
      throw new Error(
        "OKX Agentic Wallet integration requires both PROOF_OF_VAULT_OKX_SECRET_KEY and PROOF_OF_VAULT_OKX_PASSPHRASE."
      );
    }

    if (!options.endpoint) {
      throw new Error("OKX Agentic Wallet integration is not configured. Set PROOF_OF_VAULT_OKX_MCP_URL first.");
    }

    if (options.rpcUrl) {
      const chain = defineChain({
        id: options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
        name: "X Layer",
        nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
        rpcUrls: { default: { http: [options.rpcUrl] } }
      });
      this.publicClient = createPublicClient({
        chain,
        transport: http(options.rpcUrl)
      });
    }
  }

  async ensureWallet(agent: AgentProfile): Promise<AgentProfile> {
    const parsedWallet = addressSchema.parse(agent.walletAddress ?? agent.address);

    return {
      ...agent,
      walletAddress: parsedWallet as `0x${string}`,
      walletProvider: "okx-agentic-wallet",
      canUseAgenticWallet: true,
      walletProvisionedAt: agent.walletProvisionedAt ?? Date.now(),
      walletProviderEvidence: {
        ...agent.walletProviderEvidence,
        okxChainIndex: this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX,
        targetEvmChainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
        providerMode: this.options.mode,
        walletSource: "agent-signed"
      }
    };
  }

  async provisionWallet(request: AgentWalletProvisioningRequest): Promise<AgentProfile> {
    const response = await this.send({
      service: "proof-of-vault",
      providerMode: this.options.mode,
      action: "ensureAgenticWallet",
      chainIndex: this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX,
      targetChainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      agentAddress: request.agent?.address,
      walletAddress: request.agent?.walletAddress ?? request.agent?.address,
      email: request.email,
      otp: request.otp,
      metadata: {
        label: request.agent?.label,
        capabilityTags: request.agent?.capabilityTags,
        ...request.metadata
      }
    });
    const data = nested(response, "data") ?? nested(response, "result") ?? response;
    const walletAddress =
      readString(data, "walletAddress") ??
      readString(data, "executedByWallet") ??
      readString(data, "evmAddress") ??
      readString(data, "address") ??
      readString(response, "walletAddress");

    if (!walletAddress) {
      throw new Error("OKX Agentic Wallet response did not include walletAddress.");
    }

    const parsedWallet = addressSchema.parse(walletAddress);
    const provisionedAt = Date.now();
    const baseAgent: AgentProfile = request.agent ?? {
      address: parsedWallet as `0x${string}`,
      walletAddress: parsedWallet as `0x${string}`,
      label:
        typeof request.metadata?.label === "string"
          ? request.metadata.label
          : typeof request.metadata?.agentLabel === "string"
            ? request.metadata.agentLabel
            : `Agent ${parsedWallet.slice(0, 8)}`,
      capabilityTags: readCapabilityTags(request.metadata?.capabilityTags) ?? ["all-rounder"],
      reputationScore: 50,
      activeStake: "0",
      canUseAgenticWallet: true,
      status: "available",
      walletProvider: "okx-agentic-wallet"
    };

    return {
      ...baseAgent,
      walletAddress: parsedWallet as `0x${string}`,
      walletProvider: "okx-agentic-wallet",
      canUseAgenticWallet: true,
      walletProvisionedAt: provisionedAt,
      walletProviderEvidence: {
        ...request.agent?.walletProviderEvidence,
        okxChainIndex: this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX,
        targetEvmChainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
        providerMode: this.options.mode,
        provisioningMode: "operator-cli",
        provisionedAt
      }
    };
  }

  async prepareExecution(request: AgenticWalletRequest): Promise<PreparedExecution> {
    const contractCall = buildAgentStageContractCall(request);
    const contractAddress =
      contractCall.contract === "agentStaking" ? this.options.agentStakingAddress : this.options.vaultFactoryAddress;

    if (!contractAddress) {
      throw new Error(
        `Preparing ${request.action} requires the ${contractCall.contract} contract address to be configured.`
      );
    }

    const walletAddress = addressSchema.parse(request.agent.walletAddress ?? request.agent.address) as Address;
    const parsedContractAddress = addressSchema.parse(contractAddress) as Address;
    const approvals = await this.prepareApprovalSteps(request, walletAddress);
    const encoded = encodedCallForRequest(request, parsedContractAddress);

    return {
      sourceProvider: this.name,
      actorAddress: walletAddress,
      approvals,
      transaction: toPreparedStep({
        kind: "transaction",
        chainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
        to: encoded.contractAddress,
        data: encoded.data,
        value: encoded.value,
        description: `Execute ${request.action} on Proof of Vault`,
        contractAddress: encoded.contractAddress,
        contractName: encoded.contractName,
        functionName: encoded.functionName,
        metadata: {
          action: request.action
        }
      }),
      proofHash: request.proofHash,
      metadata: {
        okxChainIndex: this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX,
        targetEvmChainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
        contract: contractCall.contract
      }
    };
  }

  async verifyExecution(request: AgenticWalletRequest, txHash: `0x${string}`): Promise<ExecutionTrace> {
    const contractCall = buildAgentStageContractCall(request);
    const contractAddress =
      contractCall.contract === "agentStaking" ? this.options.agentStakingAddress : this.options.vaultFactoryAddress;

    if (!contractAddress) {
      throw new Error(
        `Verifying ${request.action} requires the ${contractCall.contract} contract address to be configured.`
      );
    }

    if (!this.publicClient) {
      throw new Error("Verifying an externally signed agent transaction requires PROOF_OF_VAULT_RPC_URL.");
    }

    const walletAddress = addressSchema.parse(request.agent.walletAddress ?? request.agent.address) as Address;
    const verification = await this.verifyExecutionOnchain(
      request,
      txHashSchema.parse(txHash) as `0x${string}`,
      walletAddress,
      addressSchema.parse(contractAddress) as Address
    );

    return {
      action: request.action,
      actorAddress: request.agent.address,
      executedByWallet: verification.executedByWallet,
      txHash: txHashSchema.parse(txHash) as `0x${string}`,
      chainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      sourceProvider: `${this.name}-verified`,
      payloadURI: request.payloadURI,
      proofHash: request.proofHash,
      callArgs: {
        contract: contractCall.contract,
        functionName: contractCall.functionName,
        ...contractCall.args
      },
      callResult: verification.callResult,
      recordedAt: Date.now()
    };
  }

  async execute(request: AgenticWalletRequest): Promise<ExecutionTrace> {
    const contractCall = buildAgentStageContractCall(request);
    const contractAddress =
      contractCall.contract === "agentStaking" ? this.options.agentStakingAddress : this.options.vaultFactoryAddress;

    if (!contractAddress) {
      throw new Error(
        `OKX Agentic Wallet ${request.action} requires the ${contractCall.contract} contract address to be configured.`
      );
    }

    if (!this.publicClient) {
      return this.executeWithoutVerification(request, contractAddress);
    }

    const walletAddress = addressSchema.parse(request.agent.walletAddress ?? request.agent.address) as Address;
    const approvalTxHash = await this.ensurePreApprovalIfRequired(request, walletAddress);
    const parsedContractAddress = addressSchema.parse(contractAddress) as Address;
    const parsedTxHash = await this.sendContractCall({
      action: request.action,
      walletAddress,
      payloadURI: request.payloadURI,
      proofHash: request.proofHash,
      metadata: request.metadata ?? {},
      contractCall: {
        ...contractCall,
        contractAddress: parsedContractAddress
      }
    });
    const verification = await this.verifyExecutionOnchain(request, parsedTxHash, walletAddress, parsedContractAddress);

    return {
      action: request.action,
      actorAddress: request.agent.address,
      executedByWallet: verification.executedByWallet,
      txHash: parsedTxHash as `0x${string}`,
      chainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      sourceProvider: this.name,
      payloadURI: request.payloadURI,
      proofHash: request.proofHash,
      callArgs: {
        contract: contractCall.contract,
        functionName: contractCall.functionName,
        ...contractCall.args
      },
      callResult: {
        ...(approvalTxHash ? { approvalTxHash } : {}),
        ...(verification.callResult ?? {})
      },
      recordedAt: Date.now()
    };
  }

  private async executeWithoutVerification(
    request: AgenticWalletRequest,
    contractAddress: `0x${string}`
  ): Promise<ExecutionTrace> {
    const contractCall = buildAgentStageContractCall(request);
    const response = await this.send({
      service: "proof-of-vault",
      providerMode: this.options.mode,
      action: request.action,
      chainIndex: this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX,
      targetChainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      agentAddress: request.agent.address,
      walletAddress: request.agent.walletAddress ?? request.agent.address,
      payloadURI: request.payloadURI,
      proofHash: request.proofHash,
      metadata: request.metadata ?? {},
      contractCall: {
        ...contractCall,
        contractAddress: addressSchema.parse(contractAddress)
      }
    });
    const data = nested(response, "data") ?? nested(response, "result") ?? response;
    const txHash = readString(data, "txHash") ?? readString(response, "txHash");
    const challengeIdRaw =
      readString(data, "challengeId") ??
      readString(response, "challengeId") ??
      ((data as Record<string, unknown> | undefined)?.challengeId as number | string | undefined) ??
      ((response as Record<string, unknown> | undefined)?.challengeId as number | string | undefined);
    const claimedAmountRaw = readString(data, "claimedAmount") ?? readString(response, "claimedAmount");
    const executedByWallet =
      readString(data, "executedByWallet") ??
      readString(data, "walletAddress") ??
      request.agent.walletAddress ??
      request.agent.address;

    if (!txHash) {
      throw new Error("OKX Agentic Wallet response did not include txHash.");
    }

    return {
      action: request.action,
      actorAddress: request.agent.address,
      executedByWallet: addressSchema.parse(executedByWallet) as `0x${string}`,
      txHash: txHashSchema.parse(txHash) as `0x${string}`,
      chainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      sourceProvider: this.name,
      payloadURI: request.payloadURI,
      proofHash: request.proofHash,
      callArgs: {
        contract: contractCall.contract,
        functionName: contractCall.functionName,
        ...contractCall.args
      },
      callResult: {
        ...(challengeIdRaw !== undefined
          ? { challengeId: typeof challengeIdRaw === "number" ? challengeIdRaw : Number(challengeIdRaw) }
          : {}),
        ...(claimedAmountRaw ? { claimedAmount: claimedAmountRaw } : {}),
        verification: "skipped-no-rpc"
      },
      recordedAt: Date.now()
    };
  }

  async signMessage(request: AgenticWalletSignatureRequest): Promise<WalletSignatureProof> {
    const response = await this.send({
      service: "proof-of-vault",
      providerMode: this.options.mode,
      action: request.action,
      chainIndex: this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX,
      targetChainId: request.chainId ?? this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      walletAddress: request.walletAddress,
      message: request.message,
      nonce: request.nonce,
      metadata: request.metadata ?? {}
    });
    const data = nested(response, "data") ?? nested(response, "result") ?? response;
    const signature = readString(data, "signature") ?? readString(response, "signature");
    const walletAddress =
      readString(data, "walletAddress") ??
      readString(data, "executedByWallet") ??
      readString(data, "evmAddress") ??
      readString(data, "address") ??
      request.walletAddress;

    if (!signature) {
      throw new Error("OKX Agentic Wallet response did not include signature.");
    }
    if (walletAddress.toLowerCase() !== request.walletAddress.toLowerCase()) {
      throw new Error("OKX Agentic Wallet signature response wallet did not match the requested wallet.");
    }

    return walletSignatureProofSchema.parse({
      action: request.action,
      walletAddress,
      chainId: request.chainId ?? this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      nonce: request.nonce,
      message: request.message,
      signature,
      sourceProvider: this.name,
      signedAt: Date.now()
    });
  }

  private async sendContractCall(input: {
    action: string;
    walletAddress: Address;
    payloadURI?: string;
    proofHash?: `0x${string}`;
    metadata: Record<string, unknown>;
    contractCall: Record<string, unknown>;
  }): Promise<`0x${string}`> {
    const response = await this.send({
      service: "proof-of-vault",
      providerMode: this.options.mode,
      action: input.action,
      chainIndex: this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX,
      targetChainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      walletAddress: input.walletAddress,
      agentAddress: input.walletAddress,
      payloadURI: input.payloadURI,
      proofHash: input.proofHash,
      metadata: input.metadata,
      contractCall: input.contractCall
    });
    const data = nested(response, "data") ?? nested(response, "result") ?? response;
    const txHash = readString(data, "txHash") ?? readString(response, "txHash");
    if (!txHash) {
      throw new Error(`OKX Agentic Wallet ${input.action} response did not include txHash.`);
    }

    return txHashSchema.parse(txHash) as `0x${string}`;
  }

  private async prepareApprovalSteps(
    request: AgenticWalletRequest,
    walletAddress: Address
  ): Promise<PreparedExecutionStep[]> {
    if (!this.options.stakeTokenAddress) {
      if (request.action === "stakeForAgent" || request.action === "openPublicChallenge") {
        throw new Error("OKX Agentic Wallet live execution requires PROOF_OF_VAULT_POV_TOKEN_ADDRESS.");
      }
      return [];
    }

    if (request.action === "stakeForAgent") {
      if (!this.options.agentStakingAddress) {
        throw new Error("stakeForAgent requires PROOF_OF_VAULT_AGENT_STAKING_ADDRESS.");
      }

      const approval = await this.prepareAllowanceApproval(
        this.options.stakeTokenAddress,
        walletAddress,
        this.options.agentStakingAddress,
        BigInt(request.amount)
      );
      return approval ? [approval] : [];
    }

    if (request.action === "openPublicChallenge") {
      const linked = await this.getLinkedContracts();
      const bondAmount = (await this.requirePublicClient().readContract({
        address: linked.feeManager,
        abi: feeManagerAbi,
        functionName: "previewChallengeBond"
      })) as bigint;

      const approval = await this.prepareAllowanceApproval(
        this.options.stakeTokenAddress,
        walletAddress,
        linked.rewardPool,
        bondAmount
      );
      return approval ? [approval] : [];
    }

    return [];
  }

  private async ensurePreApprovalIfRequired(
    request: AgenticWalletRequest,
    walletAddress: Address
  ): Promise<`0x${string}` | undefined> {
    const approvals = await this.prepareApprovalSteps(request, walletAddress);
    const nextApproval = approvals[0];
    if (!nextApproval) {
      return undefined;
    }

    const txHash = await this.sendContractCall({
      action: "erc20Approve",
      walletAddress,
      metadata: nextApproval.metadata,
      contractCall: {
        contract: "stakeToken",
        functionName: "approve",
        args: {
          spender: nextApproval.metadata.spender,
          amount: nextApproval.metadata.minimumAmount
        },
        contractAddress: nextApproval.to
      }
    });
    await this.verifyApproval(
      addressSchema.parse(String(nextApproval.metadata.tokenAddress)) as Address,
      walletAddress,
      addressSchema.parse(String(nextApproval.metadata.spender)) as Address,
      BigInt(String(nextApproval.metadata.minimumAmount)),
      txHash
    );
    return txHash;
  }

  private async prepareAllowanceApproval(
    tokenAddress: Address,
    owner: Address,
    spender: Address,
    minimumAmount: bigint
  ): Promise<PreparedExecutionStep | undefined> {
    if (this.publicClient) {
      const allowance = (await this.requirePublicClient().readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender]
      })) as bigint;
      if (allowance >= minimumAmount) {
        return undefined;
      }
    }

    return toPreparedStep({
      kind: "approval",
      chainId: this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
      to: tokenAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, minimumAmount]
      }),
      value: 0n,
      description: `Approve POV for ${spender}`,
      contractAddress: tokenAddress,
      contractName: "stakeToken",
      functionName: "approve",
      metadata: {
        tokenAddress,
        spender,
        minimumAmount: minimumAmount.toString()
      },
    });
  }

  private async verifyApproval(
    tokenAddress: Address,
    owner: Address,
    spender: Address,
    minimumAmount: bigint,
    txHash: `0x${string}`
  ): Promise<void> {
    const [receipt, transaction] = await Promise.all([
      this.requirePublicClient().waitForTransactionReceipt({ hash: txHash }),
      this.requirePublicClient().getTransaction({ hash: txHash })
    ]);

    if (receipt.status !== "success") {
      throw new Error(`Approval transaction ${txHash} failed.`);
    }
    if (!sameAddress(transaction.to ?? undefined, tokenAddress)) {
      throw new Error(`Approval transaction ${txHash} targeted the wrong token contract.`);
    }
    if (!sameAddress(transaction.from ?? undefined, owner)) {
      throw new Error(`Approval transaction ${txHash} was not sent by the requested wallet.`);
    }

    const expectedSelector = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, minimumAmount]
    }).slice(0, 10);
    if (!transaction.input.startsWith(expectedSelector)) {
      throw new Error(`Approval transaction ${txHash} did not call ERC20 approve.`);
    }

    const allowance = (await this.requirePublicClient().readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender]
    })) as bigint;
    if (allowance < minimumAmount) {
      throw new Error(`Approval transaction ${txHash} did not grant enough allowance.`);
    }
  }

  private async verifyExecutionOnchain(
    request: AgenticWalletRequest,
    txHash: `0x${string}`,
    walletAddress: Address,
    contractAddress: Address
  ): Promise<VerifiedExecution> {
    const receipt = await this.requirePublicClient().waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`Transaction ${txHash} failed.`);
    }

    switch (request.action) {
      case "stakeForAgent": {
        const event = this.findEvent(receipt.logs, contractAddress, agentStakingAbi, "AgentStaked");
        const executedByWallet = addressSchema.parse(event.args.agent) as Address;
        if (!sameAddress(executedByWallet, walletAddress) || event.args.amount.toString() !== request.amount) {
          throw new Error(`stakeForAgent transaction ${txHash} emitted unexpected AgentStaked data.`);
        }
        return { executedByWallet };
      }
      case "submitRuleDraft": {
        const event = this.findEvent(receipt.logs, contractAddress, vaultFactoryActionAbi, "RuleDraftSubmitted");
        const executedByWallet = addressSchema.parse(event.args.maker) as Address;
        if (
          safeNumber(event.args.vaultId, "RuleDraftSubmitted.vaultId") !== request.vaultId ||
          !sameAddress(executedByWallet, walletAddress) ||
          event.args.draftHash !== request.draftHash ||
          event.args.payloadURI !== (request.payloadURI ?? "")
        ) {
          throw new Error(`submitRuleDraft transaction ${txHash} emitted unexpected RuleDraftSubmitted data.`);
        }
        return { executedByWallet };
      }
      case "submitRuleIssue": {
        const event = this.findEvent(receipt.logs, contractAddress, vaultFactoryActionAbi, "RuleIssueSubmitted");
        const executedByWallet = addressSchema.parse(event.args.verifier) as Address;
        if (
          safeNumber(event.args.vaultId, "RuleIssueSubmitted.vaultId") !== request.vaultId ||
          !sameAddress(executedByWallet, walletAddress) ||
          event.args.issueHash !== request.issueHash ||
          event.args.payloadURI !== (request.payloadURI ?? "") ||
          Number(event.args.severity) !== issueSeverityIndex(request.severity)
        ) {
          throw new Error(`submitRuleIssue transaction ${txHash} emitted unexpected RuleIssueSubmitted data.`);
        }
        return { executedByWallet };
      }
      case "commitResolution": {
        const linked = await this.getLinkedContracts();
        const event = this.findEvent(
          receipt.logs,
          linked.resolutionRegistry,
          resolutionRegistryAbi,
          "ResolutionCommitRecorded"
        );
        const executedByWallet = addressSchema.parse(event.args.validator) as Address;
        if (
          safeNumber(event.args.vaultId, "ResolutionCommitRecorded.vaultId") !== request.vaultId ||
          !sameAddress(executedByWallet, walletAddress) ||
          event.args.commitHash !== request.commitHash
        ) {
          throw new Error(`commitResolution transaction ${txHash} emitted unexpected ResolutionCommitRecorded data.`);
        }
        return { executedByWallet };
      }
      case "revealResolution": {
        const linked = await this.getLinkedContracts();
        const event = this.findEvent(
          receipt.logs,
          linked.resolutionRegistry,
          resolutionRegistryAbi,
          "ResolutionRevealRecorded"
        );
        const executedByWallet = addressSchema.parse(event.args.validator) as Address;
        if (
          safeNumber(event.args.vaultId, "ResolutionRevealRecorded.vaultId") !== request.vaultId ||
          !sameAddress(executedByWallet, walletAddress) ||
          Number(event.args.outcome) !== resolutionOutcomeIndex(request.outcome) ||
          event.args.proofHash !== request.proofHash ||
          event.args.payloadURI !== (request.payloadURI ?? "") ||
          event.args.disqualified
        ) {
          throw new Error(`revealResolution transaction ${txHash} emitted unexpected ResolutionRevealRecorded data.`);
        }
        return { executedByWallet };
      }
      case "submitAuditVerdict": {
        const linked = await this.getLinkedContracts();
        const event = this.findEvent(
          receipt.logs,
          linked.resolutionRegistry,
          resolutionRegistryAbi,
          "AuditVerdictRecorded"
        );
        const executedByWallet = addressSchema.parse(event.args.auditor) as Address;
        if (
          safeNumber(event.args.vaultId, "AuditVerdictRecorded.vaultId") !== request.vaultId ||
          !sameAddress(event.args.validator, request.validator) ||
          !sameAddress(executedByWallet, walletAddress) ||
          Number(event.args.verdict) !== auditVerdictIndex(request.verdict) ||
          event.args.verdictHash !== request.verdictHash ||
          event.args.payloadURI !== (request.payloadURI ?? "")
        ) {
          throw new Error(`submitAuditVerdict transaction ${txHash} emitted unexpected AuditVerdictRecorded data.`);
        }
        return { executedByWallet };
      }
      case "openPublicChallenge": {
        const linked = await this.getLinkedContracts();
        const event = this.findEvent(receipt.logs, linked.resolutionRegistry, resolutionRegistryAbi, "ChallengeOpened");
        const executedByWallet = addressSchema.parse(event.args.challenger) as Address;
        if (
          safeNumber(event.args.vaultId, "ChallengeOpened.vaultId") !== request.vaultId ||
          !sameAddress(executedByWallet, walletAddress) ||
          !sameAddress(event.args.target, request.target) ||
          event.args.challengeHash !== request.challengeHash ||
          event.args.payloadURI !== (request.payloadURI ?? "")
        ) {
          throw new Error(`openPublicChallenge transaction ${txHash} emitted unexpected ChallengeOpened data.`);
        }
        return {
          executedByWallet,
          callResult: {
            challengeId: safeNumber(event.args.challengeId, "ChallengeOpened.challengeId"),
            bondAmount: event.args.bondAmount.toString()
          }
        };
      }
      case "claimRewards": {
        const linked = await this.getLinkedContracts();
        const rewardEvent = this.findEventOrUndefined(receipt.logs, linked.rewardPool, rewardPoolAbi, "RewardClaimed");
        const setupRewardEvent = this.findEventOrUndefined(
          receipt.logs,
          linked.rewardPool,
          rewardPoolAbi,
          "SetupRewardClaimed"
        );

        if (!rewardEvent && !setupRewardEvent) {
          throw new Error(`claimRewards transaction ${txHash} emitted no RewardClaimed or SetupRewardClaimed event.`);
        }
        const executedByWallet = addressSchema.parse(
          rewardEvent?.args.account ?? setupRewardEvent?.args.account ?? walletAddress
        ) as Address;
        if (!sameAddress(executedByWallet, walletAddress)) {
          throw new Error(`claimRewards transaction ${txHash} emitted rewards for a different account.`);
        }
        if (rewardEvent && !sameAddress(rewardEvent.args.account, executedByWallet)) {
          throw new Error(`claimRewards transaction ${txHash} emitted RewardClaimed for a different account.`);
        }
        if (setupRewardEvent && !sameAddress(setupRewardEvent.args.account, executedByWallet)) {
          throw new Error(`claimRewards transaction ${txHash} emitted SetupRewardClaimed for a different account.`);
        }
        return {
          executedByWallet,
          callResult: {
            claimedAmount: (rewardEvent?.args.amount ?? 0n).toString(),
            claimedPovAmount: (rewardEvent?.args.amount ?? 0n).toString(),
            claimedOkbAmount: (setupRewardEvent?.args.amount ?? 0n).toString()
          }
        };
      }
    }
  }

  private expectedSelectorForRequest(request: AgenticWalletRequest): Hex {
    switch (request.action) {
      case "stakeForAgent":
        return encodeFunctionData({
          abi: agentStakingAbi,
          functionName: "stakeForAgent",
          args: [BigInt(request.amount)]
        }).slice(0, 10) as Hex;
      case "submitRuleDraft":
        return encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "submitRuleDraft",
          args: [BigInt(request.vaultId), request.draftHash, request.payloadURI ?? ""]
        }).slice(0, 10) as Hex;
      case "submitRuleIssue":
        return encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "submitRuleIssue",
          args: [BigInt(request.vaultId), issueSeverityIndex(request.severity), request.issueHash, request.payloadURI ?? ""]
        }).slice(0, 10) as Hex;
      case "commitResolution":
        return encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "commitResolution",
          args: [BigInt(request.vaultId), request.commitHash]
        }).slice(0, 10) as Hex;
      case "revealResolution":
        return encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "revealResolution",
          args: [
            BigInt(request.vaultId),
            resolutionOutcomeIndex(request.outcome),
            request.proofHash,
            request.salt,
            request.payloadURI ?? ""
          ]
        }).slice(0, 10) as Hex;
      case "submitAuditVerdict":
        return encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "submitAuditVerdict",
          args: [
            BigInt(request.vaultId),
            request.validator,
            auditVerdictIndex(request.verdict),
            request.verdictHash,
            request.payloadURI ?? ""
          ]
        }).slice(0, 10) as Hex;
      case "openPublicChallenge":
        return encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "openPublicChallenge",
          args: [BigInt(request.vaultId), request.target, request.challengeHash, request.payloadURI ?? ""]
        }).slice(0, 10) as Hex;
      case "claimRewards":
        return encodeFunctionData({
          abi: vaultFactoryActionAbi,
          functionName: "claimRewards"
        }).slice(0, 10) as Hex;
    }
  }

  private async getLinkedContracts(): Promise<LinkedContracts> {
    if (!this.options.vaultFactoryAddress) {
      throw new Error("OKX Agentic Wallet live execution requires PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS.");
    }

    this.linkedContractsPromise ??= (async () => {
      const [rewardPool, feeManager, resolutionRegistry] = await Promise.all([
        this.requirePublicClient().readContract({
          address: this.options.vaultFactoryAddress!,
          abi: vaultFactoryGetterAbi,
          functionName: "rewardPool"
        }),
        this.requirePublicClient().readContract({
          address: this.options.vaultFactoryAddress!,
          abi: vaultFactoryGetterAbi,
          functionName: "feeManager"
        }),
        this.requirePublicClient().readContract({
          address: this.options.vaultFactoryAddress!,
          abi: vaultFactoryGetterAbi,
          functionName: "resolutionRegistry"
        })
      ]);

      return {
        rewardPool: rewardPool as Address,
        feeManager: feeManager as Address,
        resolutionRegistry: resolutionRegistry as Address
      };
    })();

    return this.linkedContractsPromise;
  }

  private requirePublicClient(): PublicClient {
    if (!this.publicClient) {
      throw new Error("OKX Agentic Wallet live execution requires PROOF_OF_VAULT_RPC_URL for receipt verification.");
    }

    return this.publicClient;
  }

  private findEvent(
    logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
    contractAddress: Address,
    abi: readonly unknown[],
    eventName: string
  ): { args: any; eventName: string } {
    for (const log of logs) {
      if (!sameAddress(log.address, contractAddress)) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics as [] | [Hex, ...Hex[]]
        });
        if (decoded.eventName === eventName) {
          return decoded;
        }
      } catch {
        continue;
      }
    }

    throw new Error(`${eventName} event was not found in the transaction receipt.`);
  }

  private findEventOrUndefined(
    logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
    contractAddress: Address,
    abi: readonly unknown[],
    eventName: string
  ): { args: any; eventName: string } | undefined {
    try {
      return this.findEvent(logs, contractAddress, abi, eventName);
    } catch {
      return undefined;
    }
  }

  private async send(body: Record<string, unknown>): Promise<unknown> {
    const transport = this.options.transport ?? defaultTransport;
    return transport({
      endpoint: this.options.endpoint!,
      accessKey: this.options.accessKey!,
      secretKey: this.options.secretKey,
      passphrase: this.options.passphrase,
      body
    });
  }
}
