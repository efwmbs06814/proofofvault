import type {
  ChallengeResolution,
  ExecutionTrace,
  RegisterResolutionCommitteeRequest,
  RegisterRuleCommitteeRequest,
  RuleSetDecisionRequest,
  VaultSummary
} from "@proof-of-vault/shared-types";
import { DEFAULT_TARGET_EVM_CHAIN_ID as DEFAULT_CHAIN_ID } from "@proof-of-vault/shared-types";
import { keccak256, stringToHex, type Address, type WalletClient } from "viem";

function txHashFromSeed(seed: string): `0x${string}` {
  return keccak256(stringToHex(seed));
}

const vaultFactoryAbi = [
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
    name: "finalizeV2Vault",
    stateMutability: "nonpayable",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: []
  }
] as const;

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
  registerRuleCommittee(vault: VaultSummary, request: RegisterRuleCommitteeRequest): Promise<ExecutionTrace>;
  finalizeRuleSet(payload: FinalizeRuleSetWrite): Promise<ExecutionTrace>;
  decideRuleSet(vault: VaultSummary, request: RuleSetDecisionRequest): Promise<ExecutionTrace>;
  registerResolutionCommittee(
    vault: VaultSummary,
    request: RegisterResolutionCommitteeRequest
  ): Promise<ExecutionTrace>;
  resolveChallenge(vault: VaultSummary, resolution: ChallengeResolution): Promise<ExecutionTrace>;
  finalizeV2Vault(vault: VaultSummary, actorAddress?: Address): Promise<ExecutionTrace>;
}

export class MockOnchainGateway implements OnchainGateway {
  constructor(private readonly chainId = DEFAULT_CHAIN_ID) {}

  private trace(action: string, actorAddress?: string): ExecutionTrace {
    const txHash = txHashFromSeed([action, actorAddress ?? "system", Date.now()].join(":"));
    return {
      action,
      actorAddress,
      executedByWallet: (actorAddress ?? "0x0000000000000000000000000000000000000001") as Address,
      txHash,
      chainId: this.chainId,
      sourceProvider: "mock-onchain-gateway",
      recordedAt: Date.now()
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

  async resolveChallenge(_vault: VaultSummary, resolution: ChallengeResolution): Promise<ExecutionTrace> {
    return this.trace(`resolveChallenge:${resolution.submissionId}`);
  }

  async finalizeV2Vault(_vault: VaultSummary, actorAddress?: Address): Promise<ExecutionTrace> {
    return this.trace("finalizeV2Vault", actorAddress);
  }
}

export class ViemVaultFactoryGateway implements OnchainGateway {
  constructor(
    private readonly config: {
      contractAddress: Address;
      chainId: number;
      walletClient: WalletClient;
    }
  ) {}

  private async write(functionName: string, args: readonly unknown[], actorAddress?: Address): Promise<ExecutionTrace> {
    const account = (actorAddress ?? this.config.walletClient.account?.address) as Address | undefined;

    if (!account) {
      throw new Error(`No wallet account is configured for ${functionName}.`);
    }

    const txHash = (await this.config.walletClient.writeContract({
      account,
      address: this.config.contractAddress,
      abi: vaultFactoryAbi as never,
      functionName: functionName as never,
      args: args as never
    } as never)) as `0x${string}`;

    return {
      action: functionName,
      actorAddress: account,
      executedByWallet: account,
      txHash,
      chainId: this.config.chainId,
      sourceProvider: "viem-vault-factory-gateway",
      recordedAt: Date.now()
    };
  }

  async registerRuleCommittee(vault: VaultSummary, request: RegisterRuleCommitteeRequest): Promise<ExecutionTrace> {
    return this.write(
      "registerRuleCommittee",
      [
        requireExternalVaultId(vault, "registerRuleCommittee"),
        (vault.ruleCommittee?.makers ?? []) as Address[],
        (vault.ruleCommittee?.verifiers ?? []) as Address[],
        BigInt(request.draftDeadlineAt ?? 0),
        BigInt(request.issueDeadlineAt ?? 0)
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
        BigInt(request.commitDeadlineAt ?? 0),
        BigInt(request.revealDeadlineAt ?? 0),
        BigInt(request.auditDeadlineAt ?? 0),
        BigInt(request.challengeDeadlineAt ?? 0),
        request.minValidCount
      ],
      request.orchestratorAddress as Address | undefined
    );
  }

  async resolveChallenge(_vault: VaultSummary, resolution: ChallengeResolution): Promise<ExecutionTrace> {
    return {
      action: "resolveChallenge",
      actorAddress: undefined,
      executedByWallet: "0x0000000000000000000000000000000000000001",
      txHash: txHashFromSeed(`resolve:${resolution.submissionId}`),
      chainId: this.config.chainId,
      sourceProvider: "viem-vault-factory-gateway",
      recordedAt: Date.now()
    };
  }

  async finalizeV2Vault(vault: VaultSummary, actorAddress?: Address): Promise<ExecutionTrace> {
    return this.write("finalizeV2Vault", [requireExternalVaultId(vault, "finalizeV2Vault")], actorAddress);
  }
}
