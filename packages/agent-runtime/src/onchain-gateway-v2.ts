import type {
  AuditVerdictLabel,
  ChallengeResolution,
  CreateVaultRequest,
  ExecutionTrace,
  FinalResolutionResult,
  IssueSeverityLabel,
  OnchainVaultSnapshot,
  RegisterResolutionCommitteeRequest,
  RegisterRuleCommitteeRequest,
  RuleSetDecisionRequest,
  VaultSummary
} from "@proof-of-vault/shared-types";
import { DEFAULT_TARGET_EVM_CHAIN_ID, slashReasonCodeValues, vaultStatusValues } from "@proof-of-vault/shared-types";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
  type WalletClient
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { AgenticWalletRequest } from "./providers/agentic-wallet-provider.js";

function txHashFromSeed(seed: string): `0x${string}` {
  return keccak256(stringToHex(seed));
}

function secondsFromMs(value?: number): bigint {
  if (!value) {
    return 0n;
  }

  return BigInt(value > 10_000_000_000 ? Math.floor(value / 1000) : value);
}

function msFromSeconds(value: bigint): number | undefined {
  if (value === 0n) {
    return undefined;
  }

  return Number(value) * 1000;
}

function safeNumberFromBigint(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER and must be migrated to bigint/string handling.`);
  }

  return Number(value);
}

function statusFromOnchain(statusIndex: number): OnchainVaultSnapshot["status"] {
  return vaultStatusValues[statusIndex] ?? "DraftRequest";
}

const committeeRoleValues = ["None", "RuleMaker", "RuleVerifier", "ResolutionValidator", "ResolutionAuditor"] as const;

function resolutionOutcomeIndex(outcome: FinalResolutionResult): number {
  switch (outcome) {
    case "TRUE":
      return 1;
    case "FALSE":
      return 2;
    case "INVALID":
      return 3;
  }

  throw new Error(`Unsupported resolution outcome: ${outcome as string}`);
}

function issueSeverityIndex(severity: IssueSeverityLabel): number {
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

  throw new Error(`Unsupported issue severity: ${severity as string}`);
}

function auditVerdictIndex(verdict: AuditVerdictLabel): number {
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

  throw new Error(`Unsupported audit verdict: ${verdict as string}`);
}

export type AgentStageContractCall = {
  contract: "vaultFactory" | "agentStaking";
  functionName: string;
  args: Record<string, string | number | boolean | string[]>;
};

export function buildAgentStageContractCall(request: AgenticWalletRequest): AgentStageContractCall {
  switch (request.action) {
    case "stakeForAgent":
      return {
        contract: "agentStaking",
        functionName: "stakeForAgent",
        args: {
          amount: request.amount
        }
      };
    case "submitRuleDraft":
      return {
        contract: "vaultFactory",
        functionName: "submitRuleDraft",
        args: {
          vaultId: request.vaultId,
          draftHash: request.draftHash,
          payloadURI: request.payloadURI ?? ""
        }
      };
    case "submitRuleIssue":
      return {
        contract: "vaultFactory",
        functionName: "submitRuleIssue",
        args: {
          vaultId: request.vaultId,
          severity: issueSeverityIndex(request.severity),
          severityLabel: request.severity,
          issueHash: request.issueHash,
          payloadURI: request.payloadURI ?? ""
        }
      };
    case "commitResolution":
      return {
        contract: "vaultFactory",
        functionName: "commitResolution",
        args: {
          vaultId: request.vaultId,
          commitHash: request.commitHash
        }
      };
    case "revealResolution":
      return {
        contract: "vaultFactory",
        functionName: "revealResolution",
        args: {
          vaultId: request.vaultId,
          outcome: resolutionOutcomeIndex(request.outcome),
          outcomeLabel: request.outcome,
          proofHash: request.proofHash,
          salt: request.salt,
          payloadURI: request.payloadURI ?? ""
        }
      };
    case "submitAuditVerdict":
      return {
        contract: "vaultFactory",
        functionName: "submitAuditVerdict",
        args: {
          vaultId: request.vaultId,
          validator: request.validator,
          verdict: auditVerdictIndex(request.verdict),
          verdictLabel: request.verdict,
          verdictHash: request.verdictHash,
          payloadURI: request.payloadURI ?? ""
        }
      };
    case "openPublicChallenge":
      return {
        contract: "vaultFactory",
        functionName: "openPublicChallenge",
        args: {
          vaultId: request.vaultId,
          target: request.target,
          challengeHash: request.challengeHash,
          payloadURI: request.payloadURI ?? ""
        }
      };
    case "claimRewards":
      return {
        contract: "vaultFactory",
        functionName: "claimRewards",
        args: {}
      };
  }
}

const vaultRequestCreatedEvent = {
  type: "event",
  name: "VaultRequestCreated",
  inputs: [
    { name: "vaultId", type: "uint256", indexed: true },
    { name: "setter", type: "address", indexed: true },
    { name: "collateralToken", type: "address", indexed: true },
    { name: "grossCollateralAmount", type: "uint256", indexed: false },
    { name: "settlementTime", type: "uint64", indexed: false },
    { name: "setupDepositAmount", type: "uint256", indexed: false },
    { name: "metadataURI", type: "string", indexed: false }
  ]
} as const;

const ruleSetAcceptedEvent = {
  type: "event",
  name: "RuleSetAccepted",
  inputs: [
    { name: "vaultId", type: "uint256", indexed: true },
    { name: "round", type: "uint8", indexed: true },
    { name: "resolutionRewardDeposit", type: "uint256", indexed: false },
    { name: "criteriaHash", type: "bytes32", indexed: false }
  ]
} as const;

const ruleSetRejectedEvent = {
  type: "event",
  name: "RuleSetRejected",
  inputs: [
    { name: "vaultId", type: "uint256", indexed: true },
    { name: "round", type: "uint8", indexed: true },
    { name: "rejectionCount", type: "uint8", indexed: false },
    { name: "reasonURI", type: "string", indexed: false }
  ]
} as const;

const vaultFinalizedEvent = {
  type: "event",
  name: "VaultFinalized",
  inputs: [
    { name: "vaultId", type: "uint256", indexed: true },
    { name: "outcome", type: "uint8", indexed: true },
    { name: "resolutionHash", type: "bytes32", indexed: false },
    { name: "submittedBy", type: "address", indexed: true },
    { name: "settlementFee", type: "uint256", indexed: false }
  ]
} as const;

const finalizerGetterAbi = [
  {
    type: "function",
    name: "authorizedFinalizers",
    stateMutability: "view",
    inputs: [{ name: "finalizer", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export const vaultFactoryAbiV2 = [
  vaultRequestCreatedEvent,
  {
    type: "function",
    name: "createVaultRequest",
    stateMutability: "payable",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "grossCollateralAmount", type: "uint256" },
      { name: "settlementTime", type: "uint64" },
      { name: "metadataURI", type: "string" }
    ],
    outputs: [{ name: "vaultId", type: "uint256" }]
  },
  {
    type: "function",
    name: "registerRuleCommittee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "makers", type: "address[]" },
      { name: "verifiers", type: "address[]" },
      { name: "draftDeadline", type: "uint64" },
      { name: "issueDeadline", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "finalizeRuleSet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "criteriaHash", type: "bytes32" },
      { name: "metadataURI", type: "string" },
      { name: "approvedMakers", type: "address[]" },
      { name: "acceptedVerifiers", type: "address[]" },
      { name: "maliciousMakers", type: "address[]" },
      { name: "maliciousVerifiers", type: "address[]" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "acceptRuleSetAndFund",
    stateMutability: "nonpayable",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "rejectRuleSet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "reasonURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "registerResolutionCommittee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "validators", type: "address[]" },
      { name: "auditors", type: "address[]" },
      { name: "commitDeadline", type: "uint64" },
      { name: "revealDeadline", type: "uint64" },
      { name: "auditDeadline", type: "uint64" },
      { name: "challengeDeadline", type: "uint64" },
      { name: "minValidCount", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "resolveChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "challengeId", type: "uint256" },
      { name: "successful", type: "bool" },
      { name: "targetRole", type: "uint8" },
      { name: "reasonCode", type: "uint8" },
      { name: "slashAmount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "finalizeV2Vault",
    stateMutability: "nonpayable",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "getVault",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "setter", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "grossCollateralAmount", type: "uint256" },
          { name: "lockedCollateralAmount", type: "uint256" },
          { name: "setupDepositAmount", type: "uint256" },
          { name: "resolutionRewardDepositAmount", type: "uint256" },
          { name: "settlementTime", type: "uint64" },
          { name: "createdAt", type: "uint64" },
          { name: "activatedAt", type: "uint64" },
          { name: "criteriaHash", type: "bytes32" },
          { name: "metadataURI", type: "string" },
          { name: "status", type: "uint8" },
          { name: "legacyMode", type: "bool" },
          { name: "ruleSetAccepted", type: "bool" },
          { name: "ruleRound", type: "uint8" },
          { name: "resolutionRound", type: "uint8" },
          { name: "rejectionCount", type: "uint8" }
        ]
      }
    ]
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
    name: "committeeRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const feeManagerAbi = [
  {
    type: "function",
    name: "previewSetupDeposit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

const committeeRegistryAbi = [
  {
    type: "function",
    name: "ruleCommitteeOf",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "round", type: "uint8" },
          { name: "draftDeadline", type: "uint64" },
          { name: "issueDeadline", type: "uint64" },
          { name: "active", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "resolutionCommitteeOf",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "round", type: "uint8" },
          { name: "commitDeadline", type: "uint64" },
          { name: "revealDeadline", type: "uint64" },
          { name: "auditDeadline", type: "uint64" },
          { name: "challengeDeadline", type: "uint64" },
          { name: "minValidCount", type: "uint8" },
          { name: "active", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "ruleMakersOf",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }]
  },
  {
    type: "function",
    name: "ruleVerifiersOf",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }]
  },
  {
    type: "function",
    name: "resolutionValidatorsOf",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }]
  },
  {
    type: "function",
    name: "resolutionAuditorsOf",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }]
  }
] as const;

export type CreateVaultOnchainResult = {
  vaultId: number;
  trace: ExecutionTrace;
};

export type VerifiedVaultRequest = {
  vaultId: number;
  setterAddress: Address;
  collateralToken: Address;
  grossCollateralAmount: string;
  settlementTime?: number;
  metadataURI: string;
  chainId: number;
  txHash: `0x${string}`;
};

export type VerifiedVaultAction = {
  action: "createVaultRequest" | "acceptRuleSetAndFund" | "rejectRuleSet" | "finalizeV2Vault";
  trace: ExecutionTrace;
  snapshot: OnchainVaultSnapshot;
};

export type FinalizeRuleSetWrite = {
  vaultId: number;
  criteriaHash: `0x${string}`;
  metadataURI: string;
  approvedMakers: Address[];
  acceptedVerifiers: Address[];
  maliciousMakers: Address[];
  maliciousVerifiers: Address[];
  actorAddress?: Address;
};

function requireExternalVaultId(vault: VaultSummary, action: string): bigint {
  if (vault.externalVaultId === undefined) {
    throw new Error(`${action} requires vault.externalVaultId to be set before writing to the on-chain contract.`);
  }

  return BigInt(vault.externalVaultId);
}

export interface OnchainGateway {
  createVaultRequest(request: CreateVaultRequest): Promise<CreateVaultOnchainResult>;
  verifyVaultRequest(
    vaultId: number,
    txHash: `0x${string}`
  ): Promise<VerifiedVaultRequest>;
  verifyVaultAction(
    vaultId: number,
    action: VerifiedVaultAction["action"],
    txHash: `0x${string}`
  ): Promise<VerifiedVaultAction>;
  registerRuleCommittee(vault: VaultSummary, request: RegisterRuleCommitteeRequest): Promise<ExecutionTrace>;
  finalizeRuleSet(payload: FinalizeRuleSetWrite): Promise<ExecutionTrace>;
  decideRuleSet(vault: VaultSummary, request: RuleSetDecisionRequest): Promise<ExecutionTrace>;
  registerResolutionCommittee(
    vault: VaultSummary,
    request: RegisterResolutionCommitteeRequest
  ): Promise<ExecutionTrace>;
  resolveChallenge(vault: VaultSummary, resolution: ChallengeResolution, actorAddress?: Address): Promise<ExecutionTrace>;
  finalizeV2Vault(vault: VaultSummary, actorAddress?: Address): Promise<ExecutionTrace>;
  readVaultSnapshot(vault: VaultSummary | number): Promise<OnchainVaultSnapshot>;
}

export class MockOnchainGateway implements OnchainGateway {
  private nextExternalVaultId = 1;

  constructor(private readonly chainId = DEFAULT_TARGET_EVM_CHAIN_ID) {}

  private trace(action: string, actorAddress?: string): ExecutionTrace {
    const txHash = txHashFromSeed([action, actorAddress ?? "system", Date.now()].join(":"));
    return {
      action,
      actorAddress: actorAddress as Address | undefined,
      executedByWallet: (actorAddress ?? "0x0000000000000000000000000000000000000001") as Address,
      txHash,
      chainId: this.chainId,
      sourceProvider: "mock-onchain-gateway",
      recordedAt: Date.now()
    };
  }

  async createVaultRequest(request: CreateVaultRequest): Promise<CreateVaultOnchainResult> {
    const vaultId = request.externalVaultId ?? this.nextExternalVaultId++;
    return {
      vaultId,
      trace: this.trace("createVaultRequest", request.setterAddress)
    };
  }

  async verifyVaultRequest(vaultId: number, txHash: `0x${string}`): Promise<VerifiedVaultRequest> {
    return {
      vaultId,
      setterAddress: "0x0000000000000000000000000000000000000001" as Address,
      collateralToken: "0x0000000000000000000000000000000000000002" as Address,
      grossCollateralAmount: "0",
      settlementTime: undefined,
      metadataURI: "ipfs://mock",
      chainId: this.chainId,
      txHash
    };
  }

  async verifyVaultAction(
    vaultId: number,
    action: VerifiedVaultAction["action"],
    txHash: `0x${string}`
  ): Promise<VerifiedVaultAction> {
    return {
      action,
      snapshot: await this.readVaultSnapshot(vaultId),
      trace: {
        action,
        txHash,
        chainId: this.chainId,
        executedByWallet: "0x0000000000000000000000000000000000000001" as Address,
        sourceProvider: "mock-onchain-gateway",
        recordedAt: Date.now()
      }
    };
  }

  async registerRuleCommittee(_vault: VaultSummary, request: RegisterRuleCommitteeRequest): Promise<ExecutionTrace> {
    return this.trace("registerRuleCommittee", request.orchestratorAddress);
  }

  async finalizeRuleSet(payload: FinalizeRuleSetWrite): Promise<ExecutionTrace> {
    return this.trace("finalizeRuleSet", payload.actorAddress);
  }

  async decideRuleSet(_vault: VaultSummary, request: RuleSetDecisionRequest): Promise<ExecutionTrace> {
    return this.trace(
      request.decision === "accept" ? "acceptRuleSetAndFund" : "rejectRuleSet",
      request.setterAddress
    );
  }

  async registerResolutionCommittee(
    _vault: VaultSummary,
    request: RegisterResolutionCommitteeRequest
  ): Promise<ExecutionTrace> {
    return this.trace("registerResolutionCommittee", request.orchestratorAddress);
  }

  async resolveChallenge(
    _vault: VaultSummary,
    resolution: ChallengeResolution,
    actorAddress?: Address
  ): Promise<ExecutionTrace> {
    return this.trace(`resolveChallenge:${resolution.submissionId}`, actorAddress);
  }

  async finalizeV2Vault(_vault: VaultSummary, actorAddress?: Address): Promise<ExecutionTrace> {
    return this.trace("finalizeV2Vault", actorAddress);
  }

  async readVaultSnapshot(vault: VaultSummary | number): Promise<OnchainVaultSnapshot> {
    const vaultId = typeof vault === "number" ? vault : vault.externalVaultId ?? Number(vault.id);
    const summary = typeof vault === "number" ? undefined : vault;
    return {
      vaultId,
      chainId: this.chainId,
      status: summary?.status ?? "RuleAuction",
      setterAddress: summary?.setterAddress,
      collateralToken: summary?.collateralToken,
      grossCollateralAmount: summary?.grossCollateralAmount ?? "0",
      lockedCollateralAmount: "0",
      setupDepositAmount: "0",
      resolutionRewardDepositAmount: "0",
      settlementTime: summary?.settlementTime,
      createdAt: summary?.createdAt,
      criteriaHash: summary?.criteriaHash,
      metadataURI: summary?.metadataURI,
      legacyMode: summary?.legacyMode ?? false,
      ruleSetAccepted: summary?.status === "Active",
      ruleRound: summary?.ruleRound ?? 0,
      resolutionRound: summary?.resolutionRound ?? 0,
      rejectionCount: summary?.rejectionCount ?? 0,
      ruleCommittee: summary?.ruleCommittee,
      resolutionCommittee: summary?.resolutionCommittee,
      syncedAt: Date.now()
    };
  }
}

export class ViemVaultFactoryGateway implements OnchainGateway {
  constructor(
    private readonly config: {
      contractAddress: Address;
      chainId: number;
      walletClient: WalletClient;
      publicClient: PublicClient;
      finalizerWalletClient?: WalletClient;
    }
  ) {}

  private walletFor(functionName: string): WalletClient {
    if ((functionName === "resolveChallenge" || functionName === "finalizeV2Vault") && this.config.finalizerWalletClient) {
      return this.config.finalizerWalletClient;
    }

    return this.config.walletClient;
  }

  private async write(
    functionName: string,
    args: readonly unknown[],
    actorAddress?: Address,
    value?: bigint
  ): Promise<ExecutionTrace> {
    const walletClient = this.walletFor(functionName);
    const configuredAccount = walletClient.account;
    const configuredAddress = configuredAccount?.address as Address | undefined;
    const account = configuredAccount ?? actorAddress;
    const traceAddress = configuredAddress ?? actorAddress;

    if (!account) {
      throw new Error(`No wallet account is configured for ${functionName}.`);
    }

    if (configuredAddress && actorAddress && configuredAddress.toLowerCase() !== actorAddress.toLowerCase()) {
      throw new Error(
        `${functionName} requested actor ${actorAddress}, but configured signer is ${configuredAddress}. Configure the matching demo private key or omit actorAddress.`
      );
    }

    const txHash = (await walletClient.writeContract({
      account,
      address: this.config.contractAddress,
      abi: vaultFactoryAbiV2 as never,
      functionName: functionName as never,
      args: args as never,
      value
    } as never)) as `0x${string}`;

    return {
      action: functionName,
      actorAddress: traceAddress,
      executedByWallet: traceAddress!,
      txHash,
      chainId: this.config.chainId,
      sourceProvider: "viem-vault-factory-gateway",
      recordedAt: Date.now()
    };
  }

  async createVaultRequest(request: CreateVaultRequest): Promise<CreateVaultOnchainResult> {
    if (!request.collateralToken) {
      throw new Error("collateralToken is required when creating an on-chain vault request.");
    }

    if (!request.settlementTime) {
      throw new Error("settlementTime is required when creating an on-chain vault request.");
    }

    const feeManagerAddress = await this.config.publicClient.readContract({
      address: this.config.contractAddress,
      abi: vaultFactoryAbiV2,
      functionName: "feeManager"
    });
    const minimumSetupDeposit = await this.config.publicClient.readContract({
      address: feeManagerAddress,
      abi: feeManagerAbi,
      functionName: "previewSetupDeposit"
    });
    const requestedSetupDeposit = (request as { setupDepositAmount?: string }).setupDepositAmount;
    const setupDeposit = requestedSetupDeposit ? BigInt(requestedSetupDeposit) : minimumSetupDeposit;
    if (setupDeposit < minimumSetupDeposit) {
      throw new Error(
        `createVaultRequest setupDepositAmount must be at least ${minimumSetupDeposit.toString()} wei.`
      );
    }

    const trace = await this.write(
      "createVaultRequest",
      [
        request.collateralToken as Address,
        BigInt(request.grossCollateralAmount),
        secondsFromMs(request.settlementTime),
        request.metadataURI
      ],
      request.setterAddress as Address | undefined,
      setupDeposit
    );
    const receipt = await this.config.publicClient.waitForTransactionReceipt({ hash: trace.txHash as `0x${string}` });

    return { vaultId: this.parseVaultRequestCreatedVaultId(receipt.logs), trace };
  }

  async verifyVaultRequest(vaultId: number, txHash: `0x${string}`): Promise<VerifiedVaultRequest> {
    const receipt = await this.config.publicClient.getTransactionReceipt({ hash: txHash });
    const event = this.parseVaultRequestCreated(receipt.logs);
    if (event.vaultId !== vaultId) {
      throw new Error(`Vault request tx ${txHash} emitted vaultId ${event.vaultId}, expected ${vaultId}.`);
    }

    return {
      ...event,
      chainId: this.config.chainId,
      txHash
    };
  }

  async verifyVaultAction(
    vaultId: number,
    action: VerifiedVaultAction["action"],
    txHash: `0x${string}`
  ): Promise<VerifiedVaultAction> {
    const receipt = await this.config.publicClient.getTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      throw new Error(`Transaction ${txHash} did not succeed.`);
    }

    let actorAddress: Address | undefined;

    if (action === "acceptRuleSetAndFund") {
      const event = this.findContractEvent(receipt.logs, [ruleSetAcceptedEvent], "RuleSetAccepted");
      if (safeNumberFromBigint(event.args.vaultId, "RuleSetAccepted.vaultId") !== vaultId) {
        throw new Error(`acceptRuleSetAndFund tx ${txHash} emitted a different vaultId.`);
      }
    }

    if (action === "rejectRuleSet") {
      const event = this.findContractEvent(receipt.logs, [ruleSetRejectedEvent], "RuleSetRejected");
      if (safeNumberFromBigint(event.args.vaultId, "RuleSetRejected.vaultId") !== vaultId) {
        throw new Error(`rejectRuleSet tx ${txHash} emitted a different vaultId.`);
      }
    }

    if (action === "finalizeV2Vault") {
      const event = this.findContractEvent(receipt.logs, [vaultFinalizedEvent], "VaultFinalized");
      if (safeNumberFromBigint(event.args.vaultId, "VaultFinalized.vaultId") !== vaultId) {
        throw new Error(`finalizeV2Vault tx ${txHash} emitted a different vaultId.`);
      }
      actorAddress = event.args.submittedBy;

      const isAuthorizedFinalizer = (await this.config.publicClient.readContract({
        address: this.config.contractAddress,
        abi: finalizerGetterAbi,
        functionName: "authorizedFinalizers",
        args: [actorAddress]
      })) as boolean;
      if (!isAuthorizedFinalizer) {
        throw new Error(`Transaction ${txHash} sender ${actorAddress} is not an authorized finalizer.`);
      }
    }

    const snapshot = await this.readVaultSnapshot(vaultId);
    if (action === "acceptRuleSetAndFund" && snapshot.status !== "Active") {
      throw new Error(`acceptRuleSetAndFund tx did not activate vault ${vaultId}.`);
    }
    if (action === "rejectRuleSet" && snapshot.status !== "RuleAuction" && snapshot.status !== "Cancelled") {
      throw new Error(`rejectRuleSet tx did not move vault ${vaultId} into RuleAuction or Cancelled.`);
    }
    if (action === "finalizeV2Vault" && !["ResolvedTrue", "ResolvedFalse", "ResolvedInvalid"].includes(snapshot.status)) {
      throw new Error(`finalizeV2Vault tx did not resolve vault ${vaultId}.`);
    }

    if (action === "acceptRuleSetAndFund" || action === "rejectRuleSet") {
      actorAddress = snapshot.setterAddress as Address | undefined;
      if (!actorAddress) {
        throw new Error(`Transaction ${txHash} completed ${action}, but vault ${vaultId} has no setter address on-chain.`);
      }
    }

    if (!actorAddress) {
      throw new Error(`Transaction ${txHash} completed ${action}, but no executing wallet could be derived from on-chain state.`);
    }

    return {
      action,
      snapshot,
      trace: {
        action,
        actorAddress,
        executedByWallet: actorAddress,
        txHash,
        chainId: this.config.chainId,
        sourceProvider: "browser-wallet-verified",
        recordedAt: Date.now()
      }
    };
  }

  async registerRuleCommittee(vault: VaultSummary, request: RegisterRuleCommitteeRequest): Promise<ExecutionTrace> {
    return this.write(
      "registerRuleCommittee",
      [
        requireExternalVaultId(vault, "registerRuleCommittee"),
        (vault.ruleCommittee?.makers ?? []) as Address[],
        (vault.ruleCommittee?.verifiers ?? []) as Address[],
        secondsFromMs(request.draftDeadlineAt ?? vault.ruleCommittee?.draftDeadlineAt),
        secondsFromMs(request.issueDeadlineAt ?? vault.ruleCommittee?.issueDeadlineAt)
      ],
      request.orchestratorAddress as Address | undefined
    );
  }

  async finalizeRuleSet(payload: FinalizeRuleSetWrite): Promise<ExecutionTrace> {
    return this.write(
      "finalizeRuleSet",
      [
        BigInt(payload.vaultId),
        payload.criteriaHash,
        payload.metadataURI,
        payload.approvedMakers,
        payload.acceptedVerifiers,
        payload.maliciousMakers,
        payload.maliciousVerifiers
      ],
      payload.actorAddress
    );
  }

  async decideRuleSet(vault: VaultSummary, request: RuleSetDecisionRequest): Promise<ExecutionTrace> {
    if (request.decision === "accept") {
      return this.write(
        "acceptRuleSetAndFund",
        [requireExternalVaultId(vault, "acceptRuleSetAndFund")],
        request.setterAddress as Address | undefined
      );
    }

    return this.write(
      "rejectRuleSet",
      [requireExternalVaultId(vault, "rejectRuleSet"), request.reasonURI ?? ""],
      request.setterAddress as Address | undefined
    );
  }

  async registerResolutionCommittee(
    vault: VaultSummary,
    request: RegisterResolutionCommitteeRequest
  ): Promise<ExecutionTrace> {
    return this.write(
      "registerResolutionCommittee",
      [
        requireExternalVaultId(vault, "registerResolutionCommittee"),
        (vault.resolutionCommittee?.validators ?? []) as Address[],
        (vault.resolutionCommittee?.auditors ?? []) as Address[],
        secondsFromMs(request.commitDeadlineAt ?? vault.resolutionCommittee?.commitDeadlineAt),
        secondsFromMs(request.revealDeadlineAt ?? vault.resolutionCommittee?.revealDeadlineAt),
        secondsFromMs(request.auditDeadlineAt ?? vault.resolutionCommittee?.auditDeadlineAt),
        secondsFromMs(request.challengeDeadlineAt ?? vault.resolutionCommittee?.challengeDeadlineAt),
        request.minValidCount
      ],
      request.orchestratorAddress as Address | undefined
    );
  }

  async resolveChallenge(
    vault: VaultSummary,
    resolution: ChallengeResolution,
    actorAddress?: Address
  ): Promise<ExecutionTrace> {
    const challengeId = Number(resolution.challengeId);
    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      throw new Error("resolveChallenge requires a persisted numeric on-chain challengeId.");
    }

    return this.write(
      "resolveChallenge",
      [
        requireExternalVaultId(vault, "resolveChallenge"),
        BigInt(challengeId),
        resolution.successful,
        committeeRoleValues.indexOf(resolution.targetRole),
        slashReasonCodeValues.indexOf(resolution.reasonCode),
        BigInt(resolution.slashAmount)
      ],
      actorAddress
    );
  }

  async finalizeV2Vault(vault: VaultSummary, actorAddress?: Address): Promise<ExecutionTrace> {
    return this.write("finalizeV2Vault", [requireExternalVaultId(vault, "finalizeV2Vault")], actorAddress);
  }

  async readVaultSnapshot(vault: VaultSummary | number): Promise<OnchainVaultSnapshot> {
    const vaultId = typeof vault === "number" ? vault : Number(requireExternalVaultId(vault, "readVaultSnapshot"));
    const vaultRecord = (await this.config.publicClient.readContract({
      address: this.config.contractAddress,
      abi: vaultFactoryAbiV2,
      functionName: "getVault",
      args: [BigInt(vaultId)]
    })) as {
      setter: Address;
      collateralToken: Address;
      grossCollateralAmount: bigint;
      lockedCollateralAmount: bigint;
      setupDepositAmount: bigint;
      resolutionRewardDepositAmount: bigint;
      settlementTime: bigint;
      createdAt: bigint;
      activatedAt: bigint;
      criteriaHash: Hex;
      metadataURI: string;
      status: number;
      legacyMode: boolean;
      ruleSetAccepted: boolean;
      ruleRound: number;
      resolutionRound: number;
      rejectionCount: number;
    };
    const committeeRegistry = (await this.config.publicClient.readContract({
      address: this.config.contractAddress,
      abi: vaultFactoryAbiV2,
      functionName: "committeeRegistry"
    })) as Address;
    const [ruleConfig, makers, verifiers, resolutionConfig, validators, auditors] = await Promise.all([
      this.config.publicClient.readContract({
        address: committeeRegistry,
        abi: committeeRegistryAbi,
        functionName: "ruleCommitteeOf",
        args: [BigInt(vaultId)]
      }),
      this.config.publicClient.readContract({
        address: committeeRegistry,
        abi: committeeRegistryAbi,
        functionName: "ruleMakersOf",
        args: [BigInt(vaultId)]
      }),
      this.config.publicClient.readContract({
        address: committeeRegistry,
        abi: committeeRegistryAbi,
        functionName: "ruleVerifiersOf",
        args: [BigInt(vaultId)]
      }),
      this.config.publicClient.readContract({
        address: committeeRegistry,
        abi: committeeRegistryAbi,
        functionName: "resolutionCommitteeOf",
        args: [BigInt(vaultId)]
      }),
      this.config.publicClient.readContract({
        address: committeeRegistry,
        abi: committeeRegistryAbi,
        functionName: "resolutionValidatorsOf",
        args: [BigInt(vaultId)]
      }),
      this.config.publicClient.readContract({
        address: committeeRegistry,
        abi: committeeRegistryAbi,
        functionName: "resolutionAuditorsOf",
        args: [BigInt(vaultId)]
      })
    ]);

    const normalizedRuleCommittee =
      (ruleConfig as { active: boolean }).active
        ? {
            makers: makers as Address[],
            verifiers: verifiers as Address[],
            draftDeadlineAt: msFromSeconds((ruleConfig as { draftDeadline: bigint }).draftDeadline),
            issueDeadlineAt: msFromSeconds((ruleConfig as { issueDeadline: bigint }).issueDeadline)
          }
        : undefined;

    const normalizedResolutionCommittee =
      (resolutionConfig as { active: boolean }).active
        ? {
            validators: validators as Address[],
            auditors: auditors as Address[],
            commitDeadlineAt: msFromSeconds((resolutionConfig as { commitDeadline: bigint }).commitDeadline),
            revealDeadlineAt: msFromSeconds((resolutionConfig as { revealDeadline: bigint }).revealDeadline),
            auditDeadlineAt: msFromSeconds((resolutionConfig as { auditDeadline: bigint }).auditDeadline),
            challengeDeadlineAt: msFromSeconds((resolutionConfig as { challengeDeadline: bigint }).challengeDeadline),
            minValidCount: Number((resolutionConfig as { minValidCount: number }).minValidCount)
          }
        : undefined;

    return {
      vaultId,
      chainId: this.config.chainId,
      status: statusFromOnchain(Number(vaultRecord.status)),
      setterAddress: vaultRecord.setter,
      collateralToken: vaultRecord.collateralToken,
      grossCollateralAmount: vaultRecord.grossCollateralAmount.toString(),
      lockedCollateralAmount: vaultRecord.lockedCollateralAmount.toString(),
      setupDepositAmount: vaultRecord.setupDepositAmount.toString(),
      resolutionRewardDepositAmount: vaultRecord.resolutionRewardDepositAmount.toString(),
      settlementTime: msFromSeconds(vaultRecord.settlementTime),
      createdAt: msFromSeconds(vaultRecord.createdAt),
      activatedAt: msFromSeconds(vaultRecord.activatedAt),
      criteriaHash: vaultRecord.criteriaHash,
      metadataURI: vaultRecord.metadataURI,
      legacyMode: vaultRecord.legacyMode,
      ruleSetAccepted: vaultRecord.ruleSetAccepted,
      ruleRound: Number(vaultRecord.ruleRound),
      resolutionRound: Number(vaultRecord.resolutionRound),
      rejectionCount: Number(vaultRecord.rejectionCount),
      ruleCommittee: normalizedRuleCommittee,
      resolutionCommittee: normalizedResolutionCommittee,
      syncedAt: Date.now()
    };
  }

  private parseVaultRequestCreated(logs: Log[]): {
    vaultId: number;
    setterAddress: Address;
    collateralToken: Address;
    grossCollateralAmount: string;
    settlementTime?: number;
    metadataURI: string;
  } {
    for (const log of logs) {
      if (log.address.toLowerCase() !== this.config.contractAddress.toLowerCase()) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi: [vaultRequestCreatedEvent],
          data: log.data,
          topics: log.topics
        });

        if (decoded.eventName === "VaultRequestCreated") {
          return {
            vaultId: safeNumberFromBigint(decoded.args.vaultId, "VaultRequestCreated.vaultId"),
            setterAddress: decoded.args.setter,
            collateralToken: decoded.args.collateralToken,
            grossCollateralAmount: decoded.args.grossCollateralAmount.toString(),
            settlementTime: msFromSeconds(decoded.args.settlementTime),
            metadataURI: decoded.args.metadataURI
          };
        }
      } catch {
        continue;
      }
    }

    throw new Error("VaultRequestCreated event was not found in the transaction receipt.");
  }

  private parseVaultRequestCreatedVaultId(logs: Log[]): number {
    return this.parseVaultRequestCreated(logs).vaultId;
  }

  private findContractEvent<TAbi extends readonly unknown[]>(
    logs: Log[],
    abi: TAbi,
    eventName: string
  ): ReturnType<typeof decodeEventLog<TAbi>> {
    for (const log of logs) {
      if (log.address.toLowerCase() !== this.config.contractAddress.toLowerCase()) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics
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
}

export function createViemVaultFactoryGateway(config: {
  rpcUrl: string;
  contractAddress: Address;
  chainId: number;
  orchestratorPrivateKey: Hex;
  finalizerPrivateKey?: Hex;
}): ViemVaultFactoryGateway {
  const chain = defineChain({
    id: config.chainId,
    name: "X Layer",
    nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
    rpcUrls: { default: { http: [config.rpcUrl] } }
  });
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({
    account: privateKeyToAccount(config.orchestratorPrivateKey),
    chain,
    transport
  });
  const finalizerWalletClient = config.finalizerPrivateKey
    ? createWalletClient({
        account: privateKeyToAccount(config.finalizerPrivateKey),
        chain,
        transport
      })
    : undefined;

  return new ViemVaultFactoryGateway({
    contractAddress: config.contractAddress,
    chainId: config.chainId,
    walletClient,
    publicClient,
    finalizerWalletClient
  });
}
