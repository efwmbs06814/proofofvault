import {
  canParticipateInCommittee,
  recommendResolutionCommitteeSizing,
  recommendRuleCommitteeSizing,
  selectResolutionCommittee,
  selectResolutionCommitteeWithPriority,
  selectRuleCommittee,
  selectRuleCommitteeWithPriority,
  type OnchainGateway,
  type VerifiedVaultAction,
  type VerifiedVaultRequest
} from "@proof-of-vault/agent-runtime";
import type {
  AgentProfile,
  CreateVaultRequest,
  ExecutionTrace,
  OnchainVaultSnapshot,
  RegisterResolutionCommitteeRequest,
  RegisterRuleCommitteeRequest,
  VaultSummary
} from "@proof-of-vault/shared-types";
import { DEFAULT_TARGET_EVM_CHAIN_ID as DEFAULT_CHAIN_ID } from "@proof-of-vault/shared-types";

import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";

function defaultDeadline(offsetMs: number): number {
  return Date.now() + offsetMs;
}

function parsePositiveAmount(value: string): bigint | undefined {
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function sameOptionalAddress(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return left === right;
  }

  return normalizeAddress(left) === normalizeAddress(right);
}

type VerifiedRegisteredOnchainVault = {
  verifiedRequest: VerifiedVaultRequest;
  snapshot: OnchainVaultSnapshot;
};

type RegisterTxRequest = {
  action: VerifiedVaultAction["action"];
  txHash: `0x${string}`;
};

type CommitteeBootstrapPhase = "rule" | "resolution";

function isRuleCommitteeBootstrapStatus(status: VaultSummary["status"]): boolean {
  return status === "DraftRequest" || status === "RuleAuction";
}

function isResolutionCommitteeBootstrapStatus(status: VaultSummary["status"]): boolean {
  return status === "Active" || status === "ResolutionAuction";
}

export class VaultService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly onchainGateway: OnchainGateway,
    private readonly chainId = DEFAULT_CHAIN_ID
  ) {}

  async createVault(request: CreateVaultRequest): Promise<VaultSummary> {
    const now = Date.now();
    if (request.mode === "register_onchain" && request.legacyMode) {
      throw new ValidationError(
        "Legacy on-chain creation is not wired in the member-2 runtime yet. Use the V2 path or register a pre-existing legacy vault by externalVaultId."
      );
    }

    const verifiedOnchainRegistration =
      request.mode === "register_onchain" && request.externalVaultId !== undefined
        ? await this.validateRegisteredOnchainVault(request)
        : undefined;

    const onchainResult =
      request.mode === "register_onchain" && request.externalVaultId === undefined
        ? await this.onchainGateway.createVaultRequest(request)
        : undefined;
    const verifiedInitialTrace = verifiedOnchainRegistration
      ? this.buildVerifiedInitialTrace(verifiedOnchainRegistration.verifiedRequest, now)
      : request.initialTrace;
    const externalVaultId = request.externalVaultId ?? onchainResult?.vaultId;
    const id = externalVaultId !== undefined ? String(externalVaultId) : await this.store.createVaultId();

    const vault: VaultSummary = {
      id,
      externalVaultId,
      chainId: verifiedOnchainRegistration?.snapshot.chainId ?? request.chainId ?? this.chainId,
      legacyMode: request.legacyMode,
      setterAddress: request.setterAddress ?? verifiedOnchainRegistration?.verifiedRequest.setterAddress,
      status: request.mode === "register_onchain" ? (request.legacyMode ? "Active" : "RuleAuction") : "DraftRequest",
      statement: request.statement,
      metadataURI: verifiedOnchainRegistration?.verifiedRequest.metadataURI ?? request.metadataURI,
      collateralToken: request.collateralToken ?? verifiedOnchainRegistration?.verifiedRequest.collateralToken,
      collateralDecimals: request.collateralDecimals ?? verifiedOnchainRegistration?.snapshot.collateralDecimals,
      grossCollateralAmount:
        verifiedOnchainRegistration?.verifiedRequest.grossCollateralAmount ?? request.grossCollateralAmount,
      settlementTime: request.settlementTime ?? verifiedOnchainRegistration?.verifiedRequest.settlementTime,
      createdAt: now,
      updatedAt: now,
      ruleRound: 0,
      resolutionRound: 0,
      rejectionCount: 0,
      onchainSnapshot: verifiedOnchainRegistration?.snapshot,
      traces: [onchainResult?.trace, verifiedInitialTrace].filter((trace): trace is NonNullable<typeof trace> =>
        Boolean(trace)
      )
    };

    return this.store.saveVault(vault);
  }

  async getVaultOrThrow(vaultId: string): Promise<VaultSummary> {
    const vault = await this.store.getVault(vaultId);
    if (!vault) {
      throw new NotFoundError(`Vault ${vaultId} was not found.`);
    }

    return vault;
  }

  async registerRuleCommittee(vaultId: string, request: RegisterRuleCommitteeRequest): Promise<VaultSummary> {
    const vault = await this.getVaultOrThrow(vaultId);
    const agents = await this.resolveCandidateAgents(request.candidateAgents);
    const ruleCommitteeRequest = this.normalizeRuleCommitteeRequest(request, agents);
    const { committee } = selectRuleCommittee(
      agents,
      ruleCommitteeRequest.makerCount,
      ruleCommitteeRequest.verifierCount
    );
    const registeredVault = await this.ensureOnchainRegistration(vault);
    const nextVault: VaultSummary = {
      ...registeredVault,
      status: "RuleDrafting",
      ruleRound: registeredVault.ruleRound + 1,
      ruleCommittee: {
        ...committee,
        draftDeadlineAt: ruleCommitteeRequest.draftDeadlineAt ?? defaultDeadline(15 * 60 * 1000),
        issueDeadlineAt: ruleCommitteeRequest.issueDeadlineAt ?? defaultDeadline(30 * 60 * 1000),
        orchestratorAddress: ruleCommitteeRequest.orchestratorAddress
      },
      updatedAt: Date.now()
    };
    const trace = await this.onchainGateway.registerRuleCommittee(nextVault, ruleCommitteeRequest);

    return this.store.saveVault({
      ...nextVault,
      traces: [...registeredVault.traces, trace],
      updatedAt: Date.now()
    });
  }

  async registerResolutionCommittee(
    vaultId: string,
    request: RegisterResolutionCommitteeRequest
  ): Promise<VaultSummary> {
    const vault = await this.getVaultOrThrow(vaultId);
    const agents = await this.resolveCandidateAgents(request.candidateAgents);
    const resolutionCommitteeRequest = this.normalizeResolutionCommitteeRequest(request, agents);
    const registeredVault = await this.ensureOnchainRegistration(vault);

    const { committee } = selectResolutionCommittee(
      agents,
      resolutionCommitteeRequest.validatorCount,
      resolutionCommitteeRequest.auditorCount,
      resolutionCommitteeRequest.minValidCount
    );
    const nextVault: VaultSummary = {
      ...registeredVault,
      status: "CommitPhase",
      resolutionRound: registeredVault.resolutionRound + 1,
      resolutionCommittee: {
        ...committee,
        commitDeadlineAt: resolutionCommitteeRequest.commitDeadlineAt ?? defaultDeadline(20 * 60 * 1000),
        revealDeadlineAt: resolutionCommitteeRequest.revealDeadlineAt ?? defaultDeadline(40 * 60 * 1000),
        auditDeadlineAt: resolutionCommitteeRequest.auditDeadlineAt ?? defaultDeadline(60 * 60 * 1000),
        challengeDeadlineAt: resolutionCommitteeRequest.challengeDeadlineAt ?? defaultDeadline(90 * 60 * 1000),
        orchestratorAddress: resolutionCommitteeRequest.orchestratorAddress
      },
      updatedAt: Date.now()
    };
    const trace = await this.onchainGateway.registerResolutionCommittee(nextVault, resolutionCommitteeRequest);

    return this.store.saveVault({
      ...nextVault,
      traces: [...registeredVault.traces, trace],
      updatedAt: Date.now()
    });
  }

  async bootstrapCommittee(
    vaultId: string,
    agentAddress: string,
    requestedPhase?: CommitteeBootstrapPhase
  ): Promise<VaultSummary> {
    const vault = await this.getVaultOrThrow(vaultId);
    const candidateAgents = (await this.resolveCandidateAgents([])).filter(canParticipateInCommittee);
    const normalizedAgentAddress = normalizeAddress(agentAddress);
    const triggeringAgent = candidateAgents.find(
      (candidate) => normalizeAddress(candidate.walletAddress ?? candidate.address) === normalizedAgentAddress
    );

    if (!triggeringAgent) {
      throw new ValidationError(
        "Only judge-listed agents with positive active stake can bootstrap committee registration."
      );
    }

    const phase = requestedPhase ?? this.resolveBootstrapPhase(vault);
    if (phase === "rule") {
      if (vault.ruleCommittee) {
        return vault;
      }

      if (!isRuleCommitteeBootstrapStatus(vault.status)) {
        throw new ValidationError(`Vault ${vault.id} is not currently accepting rule committee bootstrap.`);
      }

      const sizing = recommendRuleCommitteeSizing(candidateAgents.length);
      const { committee } = selectRuleCommitteeWithPriority(
        candidateAgents,
        normalizedAgentAddress,
        sizing.makerCount,
        sizing.verifierCount
      );
      const registeredVault = await this.ensureOnchainRegistration(vault);
      const nextVault: VaultSummary = {
        ...registeredVault,
        status: "RuleDrafting",
        ruleRound: registeredVault.ruleRound + 1,
        ruleCommittee: {
          ...committee,
          draftDeadlineAt: defaultDeadline(15 * 60 * 1000),
          issueDeadlineAt: defaultDeadline(30 * 60 * 1000)
        },
        updatedAt: Date.now()
      };
      const trace = await this.onchainGateway.registerRuleCommittee(nextVault, {
        candidateAgents,
        makerCount: sizing.makerCount,
        verifierCount: sizing.verifierCount
      });

      return this.store.saveVault({
        ...nextVault,
        traces: [...registeredVault.traces, trace],
        updatedAt: Date.now()
      });
    }

    if (vault.resolutionCommittee) {
      return vault;
    }

    if (!isResolutionCommitteeBootstrapStatus(vault.status)) {
      throw new ValidationError(`Vault ${vault.id} is not currently accepting resolution committee bootstrap.`);
    }

    const sizing = recommendResolutionCommitteeSizing(candidateAgents.length);
    const { committee } = selectResolutionCommitteeWithPriority(
      candidateAgents,
      normalizedAgentAddress,
      sizing.validatorCount,
      sizing.auditorCount,
      sizing.minValidCount
    );
    const registeredVault = await this.ensureOnchainRegistration(vault);
    const nextVault: VaultSummary = {
      ...registeredVault,
      status: "CommitPhase",
      resolutionRound: registeredVault.resolutionRound + 1,
      resolutionCommittee: {
        ...committee,
        commitDeadlineAt: defaultDeadline(20 * 60 * 1000),
        revealDeadlineAt: defaultDeadline(40 * 60 * 1000),
        auditDeadlineAt: defaultDeadline(60 * 60 * 1000),
        challengeDeadlineAt: defaultDeadline(90 * 60 * 1000)
      },
      updatedAt: Date.now()
    };
    const trace = await this.onchainGateway.registerResolutionCommittee(nextVault, {
      candidateAgents,
      validatorCount: sizing.validatorCount,
      auditorCount: sizing.auditorCount,
      minValidCount: sizing.minValidCount
    });

    return this.store.saveVault({
      ...nextVault,
      traces: [...registeredVault.traces, trace],
      updatedAt: Date.now()
    });
  }

  async syncOnchainSnapshot(vaultId: string): Promise<VaultSummary> {
    const vault = await this.getVaultOrThrow(vaultId);
    if (vault.externalVaultId === undefined) {
      throw new ValidationError("Vault must be registered on-chain before its on-chain snapshot can be synced.");
    }

    const snapshot = await this.onchainGateway.readVaultSnapshot(vault);
    return this.store.saveVault({
      ...vault,
      externalVaultId: snapshot.vaultId,
      status: snapshot.status,
      setterAddress: snapshot.setterAddress ?? vault.setterAddress,
      collateralToken: snapshot.collateralToken ?? vault.collateralToken,
      collateralDecimals: snapshot.collateralDecimals ?? vault.collateralDecimals,
      grossCollateralAmount: snapshot.grossCollateralAmount,
      settlementTime: snapshot.settlementTime ?? vault.settlementTime,
      metadataURI: snapshot.metadataURI ?? vault.metadataURI,
      criteriaHash: snapshot.criteriaHash,
      ruleRound: snapshot.ruleRound,
      resolutionRound: snapshot.resolutionRound,
      rejectionCount: snapshot.rejectionCount,
      ruleCommittee: snapshot.ruleCommittee,
      resolutionCommittee: snapshot.resolutionCommittee,
      onchainSnapshot: snapshot,
      updatedAt: Date.now()
    });
  }

  private async ensureOnchainRegistration(vault: VaultSummary): Promise<VaultSummary> {
    if (vault.externalVaultId !== undefined) {
      return vault;
    }

    if (vault.legacyMode) {
      throw new ValidationError("Legacy vaults must provide an existing externalVaultId before committee registration.");
    }

    if (!vault.setterAddress) {
      throw new ValidationError("setterAddress is required before registering the vault on-chain.");
    }

    if (!vault.collateralToken) {
      throw new ValidationError("collateralToken is required before registering the vault on-chain.");
    }

    if (!vault.settlementTime) {
      throw new ValidationError("settlementTime is required before registering the vault on-chain.");
    }

    const collateralAmount = parsePositiveAmount(vault.grossCollateralAmount);
    if (collateralAmount === undefined || collateralAmount <= 0n) {
      throw new ValidationError("grossCollateralAmount must be a positive integer before registering the vault on-chain.");
    }

    const onchainResult = await this.onchainGateway.createVaultRequest({
      mode: "register_onchain",
      chainId: vault.chainId,
      legacyMode: false,
      setterAddress: vault.setterAddress,
      statement: vault.statement,
      metadataURI: vault.metadataURI,
      collateralToken: vault.collateralToken,
      collateralDecimals: vault.collateralDecimals,
      grossCollateralAmount: vault.grossCollateralAmount,
      settlementTime: vault.settlementTime
    });

    return this.store.saveVault({
      ...vault,
      externalVaultId: onchainResult.vaultId,
      traces: [...vault.traces, onchainResult.trace],
      updatedAt: Date.now()
    });
  }

  async registerTx(vaultId: string, request: RegisterTxRequest): Promise<VaultSummary> {
    const vault = await this.getVaultOrThrow(vaultId);
    if (vault.externalVaultId === undefined) {
      throw new ValidationError("register-tx requires the vault to be registered on-chain first.");
    }

    const verified = await this.onchainGateway.verifyVaultAction(
      vault.externalVaultId,
      request.action,
      request.txHash
    );

    return this.store.saveVault({
      ...vault,
      status: verified.snapshot.status,
      setterAddress: verified.snapshot.setterAddress ?? vault.setterAddress,
      collateralToken: verified.snapshot.collateralToken ?? vault.collateralToken,
      grossCollateralAmount: verified.snapshot.grossCollateralAmount,
      settlementTime: verified.snapshot.settlementTime ?? vault.settlementTime,
      metadataURI: verified.snapshot.metadataURI ?? vault.metadataURI,
      criteriaHash: verified.snapshot.criteriaHash,
      ruleRound: verified.snapshot.ruleRound,
      resolutionRound: verified.snapshot.resolutionRound,
      rejectionCount: verified.snapshot.rejectionCount,
      onchainSnapshot: verified.snapshot,
      traces: [...vault.traces, verified.trace],
      updatedAt: Date.now()
    });
  }

  private async validateRegisteredOnchainVault(request: CreateVaultRequest): Promise<VerifiedRegisteredOnchainVault> {
    if (request.externalVaultId === undefined) {
      throw new ValidationError("externalVaultId is required for on-chain verification.");
    }

    const txHash = request.initialTrace?.txHash;
    if (!txHash) {
      throw new ValidationError("register_onchain requests must include initialTrace.txHash for on-chain verification.");
    }

    const [verifiedRequest, snapshot] = await Promise.all([
      this.onchainGateway.verifyVaultRequest(request.externalVaultId, txHash as `0x${string}`),
      this.onchainGateway.readVaultSnapshot(request.externalVaultId)
    ]);

    if (request.setterAddress && !sameOptionalAddress(request.setterAddress, verifiedRequest.setterAddress)) {
      throw new ValidationError("register_onchain setterAddress does not match the verified on-chain event.");
    }

    if (
      request.collateralToken &&
      !sameOptionalAddress(request.collateralToken, verifiedRequest.collateralToken)
    ) {
      throw new ValidationError("register_onchain collateralToken does not match the verified on-chain event.");
    }

    if (request.grossCollateralAmount !== verifiedRequest.grossCollateralAmount) {
      throw new ValidationError("register_onchain grossCollateralAmount does not match the verified on-chain event.");
    }

    if ((request.settlementTime ?? undefined) !== (verifiedRequest.settlementTime ?? undefined)) {
      throw new ValidationError("register_onchain settlementTime does not match the verified on-chain event.");
    }

    if (request.metadataURI !== verifiedRequest.metadataURI) {
      throw new ValidationError("register_onchain metadataURI does not match the verified on-chain event.");
    }

    const requestedChainId = request.chainId ?? this.chainId;
    if (
      requestedChainId !== verifiedRequest.chainId ||
      verifiedRequest.chainId !== snapshot.chainId ||
      snapshot.vaultId !== request.externalVaultId
    ) {
      throw new ValidationError("register_onchain chain or vault snapshot does not match the requested vault.");
    }

    return { verifiedRequest, snapshot };
  }

  private buildVerifiedInitialTrace(verifiedRequest: VerifiedVaultRequest, recordedAt: number): ExecutionTrace {
    return {
      action: "createVaultRequest",
      actorAddress: verifiedRequest.setterAddress,
      executedByWallet: verifiedRequest.setterAddress,
      txHash: verifiedRequest.txHash,
      chainId: verifiedRequest.chainId,
      sourceProvider: "browser-wallet",
      payloadURI: verifiedRequest.metadataURI,
      callResult: {
        vaultId: verifiedRequest.vaultId.toString()
      },
      recordedAt
    };
  }

  private async resolveCandidateAgents(requestAgents: AgentProfile[]): Promise<AgentProfile[]> {
    const candidateAgents = requestAgents.length > 0 ? requestAgents : await this.store.listJudgeListAgents();
    const eligibility = await Promise.all(
      candidateAgents.map((agent) => this.store.isJudgeListed(agent.walletAddress ?? agent.address))
    );
    const unlistedAgents = candidateAgents.filter((_agent, index) => !eligibility[index]);

    if (unlistedAgents.length > 0) {
      throw new ValidationError(
        `Agents must complete pre-registration and join the judge list before committee selection: ${unlistedAgents
          .map((agent) => agent.address)
          .join(", ")}`
      );
    }

    const uniqueAgents = new Map<string, AgentProfile>();

    for (const agent of candidateAgents) {
      const walletAddress = (agent.walletAddress ?? agent.address).toLowerCase();
      uniqueAgents.set(walletAddress, {
        ...agent,
        address: walletAddress,
        walletAddress
      });
    }

    const finalAgents = [...uniqueAgents.values()];
    if (finalAgents.length === 0) {
      throw new ValidationError("No judge-listed candidate agents are available for committee selection.");
    }

    await this.store.saveAgents(finalAgents);
    return finalAgents;
  }

  private normalizeRuleCommitteeRequest(
    request: RegisterRuleCommitteeRequest,
    agents: AgentProfile[]
  ): RegisterRuleCommitteeRequest {
    const eligibleAgents = agents.filter(canParticipateInCommittee);
    const requestedSeats = request.makerCount + request.verifierCount;

    if (requestedSeats <= eligibleAgents.length) {
      return request;
    }

    const sizing = recommendRuleCommitteeSizing(eligibleAgents.length);
    return {
      ...request,
      candidateAgents: eligibleAgents,
      makerCount: sizing.makerCount,
      verifierCount: sizing.verifierCount
    };
  }

  private normalizeResolutionCommitteeRequest(
    request: RegisterResolutionCommitteeRequest,
    agents: AgentProfile[]
  ): RegisterResolutionCommitteeRequest {
    const eligibleAgents = agents.filter(canParticipateInCommittee);
    const requestedSeats = request.validatorCount + request.auditorCount;

    if (requestedSeats <= eligibleAgents.length && request.minValidCount <= request.validatorCount) {
      return request;
    }

    const sizing = recommendResolutionCommitteeSizing(eligibleAgents.length);
    return {
      ...request,
      candidateAgents: eligibleAgents,
      validatorCount: sizing.validatorCount,
      auditorCount: sizing.auditorCount,
      minValidCount: sizing.minValidCount
    };
  }

  private resolveBootstrapPhase(vault: VaultSummary): CommitteeBootstrapPhase {
    if (!vault.ruleCommittee && isRuleCommitteeBootstrapStatus(vault.status)) {
      return "rule";
    }

    if (!vault.resolutionCommittee && isResolutionCommitteeBootstrapStatus(vault.status)) {
      return "resolution";
    }

    throw new ValidationError(
      `Vault ${vault.id} is in status ${vault.status} and is not ready for committee bootstrap.`
    );
  }
}
