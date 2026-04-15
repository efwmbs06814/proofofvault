import {
  computeResolutionCommitHash,
  createProofReference,
  type AgenticWalletRequest,
  hashPayload,
  isChallengeEligible,
  type AgenticWalletProvider,
  type MarketDataProvider
} from "@proof-of-vault/agent-runtime";
import {
  DEFAULT_OKX_CHAIN_INDEX,
  DEFAULT_TARGET_EVM_CHAIN_ID,
  type AgentProfile,
  type AgentSubmission,
  type PreparedExecution,
  type PublicChallengeSubmission,
  type ResolutionCommitSubmission,
  type ResolutionRevealSubmission,
  type RuleDraftSubmission,
  type RuleIssueSubmission,
  type SourceSnapshot,
  type VaultSummary
} from "@proof-of-vault/shared-types";

import { ConflictError, ValidationError } from "../lib/errors.js";
import type { AppPersistence } from "../db/factory.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";
import {
  normalizeAgentSubmissionInput,
  resolveVaultByAnyId,
  type CommitteeBootstrapper
} from "./agent-workflow-normalizer.js";

type SubmissionRuntimePolicy = {
  enforceRealDemo: boolean;
  targetEvmChainId: number;
  okxChainIndex: number;
  productionMode?: boolean;
};

const OKX_MARKET_PROVIDER = "okx-market-mcp";
const OKX_AGENTIC_WALLET_PROVIDER = "okx-agentic-wallet";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

type PreparedSubmissionResult = {
  agent: AgentProfile;
  submissionBody: AgentSubmission;
  payload: AgentSubmission["payload"];
  payloadHash: `0x${string}`;
  storedPayloadHash: `0x${string}`;
  proofHash?: `0x${string}`;
  proofSnapshots: SourceSnapshot[];
  walletRequest: AgenticWalletRequest;
  preparedExecution: PreparedExecution;
};

function createFallbackAgent(address: string): AgentProfile {
  return {
    address: address.toLowerCase(),
    walletAddress: address.toLowerCase(),
    label: `Agent ${address.slice(0, 8)}`,
    capabilityTags: ["all-rounder"],
    reputationScore: 50,
    activeStake: "1000",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  };
}

function normalizeSnapshotProvider(snapshot: SourceSnapshot): string {
  return snapshot.provider.toLowerCase();
}

function isOkxMarketSnapshot(snapshot: SourceSnapshot, policy: SubmissionRuntimePolicy): boolean {
  return (
    normalizeSnapshotProvider(snapshot) === OKX_MARKET_PROVIDER &&
    snapshot.metadata?.providerCollected === true &&
    snapshot.metadata?.syntheticFallback !== true &&
    snapshot.metadata?.okxChainIndex === policy.okxChainIndex &&
    snapshot.metadata?.targetEvmChainId === policy.targetEvmChainId
  );
}

function hasOkxMarketSnapshot(snapshots: SourceSnapshot[], policy: SubmissionRuntimePolicy): boolean {
  return snapshots.some((snapshot) => isOkxMarketSnapshot(snapshot, policy));
}

function mergeSnapshots(existing: SourceSnapshot[], collected: SourceSnapshot[]): SourceSnapshot[] {
  const merged = [...existing];

  for (const snapshot of collected) {
    const key = `${snapshot.provider}:${snapshot.kind ?? ""}:${snapshot.timestamp ?? ""}:${snapshot.uri ?? ""}:${snapshot.value ?? ""}`;
    const duplicate = merged.some(
      (candidate) =>
        `${candidate.provider}:${candidate.kind ?? ""}:${candidate.timestamp ?? ""}:${candidate.uri ?? ""}:${candidate.value ?? ""}` ===
        key
    );

    if (!duplicate) {
      merged.push(snapshot);
    }
  }

  return merged;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function committeeIncludes(addresses: string[] | undefined, candidate: string): boolean {
  if (!addresses) {
    return false;
  }

  const normalizedCandidate = normalizeAddress(candidate);
  return addresses.some((address) => normalizeAddress(address) === normalizedCandidate);
}

function executionVaultId(vault: VaultSummary, requestedVaultId: number, walletProviderName: string): number {
  if (vault.externalVaultId === undefined) {
    if (walletProviderName !== "mock-agentic-wallet") {
      throw new ValidationError("Agent submissions require the vault to be registered on-chain first.");
    }

    return requestedVaultId;
  }

  return vault.externalVaultId;
}

function assertOkxResolutionRevealSources(snapshots: SourceSnapshot[], policy: SubmissionRuntimePolicy): void {
  if (!hasOkxMarketSnapshot(snapshots, policy)) {
    throw new ValidationError(
      `Real demo mode requires at least one ${OKX_MARKET_PROVIDER} snapshot annotated with okxChainIndex=${policy.okxChainIndex} and targetEvmChainId=${policy.targetEvmChainId}.`
    );
  }
}

export class SubmissionService {
  constructor(
    private readonly persistence: Pick<AppPersistence, "workflowStore" | "proofStore" | "runInTransaction">,
    private readonly walletProvider: AgenticWalletProvider,
    private readonly marketDataProvider: MarketDataProvider,
    private readonly bootstrapCommittee: CommitteeBootstrapper | undefined,
    private readonly policy: SubmissionRuntimePolicy = {
      enforceRealDemo: false,
      targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
      productionMode: false
    }
  ) {}

  async submit(input: AgentSubmission): Promise<AgentSubmission> {
    const normalizedPreview = await normalizeAgentSubmissionInput(
      this.persistence.workflowStore,
      input,
      this.bootstrapCommittee
    );
    const previewVault = normalizedPreview.vault;
    const previewInput = normalizedPreview.submission;
    await this.ensureSubmissionEligibility(this.persistence.workflowStore, previewVault, previewInput);

    const agent = await this.prepareAgent(previewInput.agentAddress);
    const prepared = await this.prepareSubmissionArtifacts(
      this.persistence.workflowStore,
      previewVault,
      previewInput,
      agent,
      executionVaultId(previewVault, previewInput.vaultId, this.walletProvider.name)
    );

    return this.persistence.runInTransaction(async ({ workflowStore, proofStore }) => {
      const vault = await resolveVaultByAnyId(workflowStore, previewInput.vaultId);
      await workflowStore.saveAgent(agent);
      await this.ensureSubmissionEligibility(workflowStore, vault, previewInput);

      const createdSubmission = await this.finalizeSubmissionRecord(workflowStore, vault.id, previewInput, prepared);
      await proofStore.put({
        vaultKey: vault.id,
        payload: createdSubmission.payload,
        ...(createdSubmission.proof as NonNullable<AgentSubmission["proof"]>)
      });
      await workflowStore.addSubmission(vault.id, createdSubmission);
      await this.progressVaultState(workflowStore, vault, createdSubmission);

      return createdSubmission;
    });
  }

  async prepare(input: AgentSubmission): Promise<PreparedSubmissionResult> {
    const normalized = await normalizeAgentSubmissionInput(
      this.persistence.workflowStore,
      input,
      this.bootstrapCommittee
    );
    const vault = normalized.vault;
    const normalizedInput = normalized.submission;
    await this.ensureSubmissionEligibility(this.persistence.workflowStore, vault, normalizedInput);
    const agent = await this.prepareAgent(normalizedInput.agentAddress);
    return this.prepareSubmissionArtifacts(
      this.persistence.workflowStore,
      vault,
      normalizedInput,
      agent,
      executionVaultId(vault, normalizedInput.vaultId, this.walletProvider.name)
    );
  }

  private async prepareAgent(address: string): Promise<AgentProfile> {
    const existing = await this.persistence.workflowStore.getAgent(address);
    return this.walletProvider.ensureWallet(existing ?? createFallbackAgent(address));
  }

  private async ensureSubmissionEligibility(
    store: WorkflowStore,
    vault: VaultSummary,
    submission: AgentSubmission
  ): Promise<void> {
    const existingSubmissions = await store.listSubmissions(vault.id);

    const hasDuplicate = existingSubmissions.some((item) => {
      if (item.kind !== submission.kind || item.round !== submission.round) {
        return false;
      }

      if (item.agentAddress.toLowerCase() !== submission.agentAddress.toLowerCase()) {
        return false;
      }

      if (submission.kind === "audit_verdict" && item.kind === "audit_verdict") {
        return item.payload.validator.toLowerCase() === submission.payload.validator.toLowerCase();
      }

      return ["rule_draft", "rule_issue", "resolution_commit", "resolution_reveal"].includes(submission.kind);
    });

    if (hasDuplicate) {
      throw new ConflictError(`Duplicate ${submission.kind} submission is not allowed for the same round.`);
    }

    if (submission.kind === "rule_draft") {
      if (!committeeIncludes(vault.ruleCommittee?.makers, submission.agentAddress)) {
        throw new ValidationError("Only the current rule makers can submit rule drafts.");
      }
    }

    if (submission.kind === "rule_issue") {
      if (!committeeIncludes(vault.ruleCommittee?.verifiers, submission.agentAddress)) {
        throw new ValidationError("Only the current rule verifiers can submit rule issues.");
      }
    }

    if (submission.kind === "resolution_commit" || submission.kind === "resolution_reveal") {
      if (!committeeIncludes(vault.resolutionCommittee?.validators, submission.agentAddress)) {
        throw new ValidationError("Only the current resolution validators can commit or reveal.");
      }
    }

    if (submission.kind === "audit_verdict") {
      if (!committeeIncludes(vault.resolutionCommittee?.auditors, submission.agentAddress)) {
        throw new ValidationError("Only the current resolution auditors can submit audit verdicts.");
      }

      if (!committeeIncludes(vault.resolutionCommittee?.validators, submission.payload.validator)) {
        throw new ValidationError("Audit verdict target must be a validator from the active resolution committee.");
      }
    }

    if (submission.kind === "public_challenge") {
      const validTargets = new Set(
        [...(vault.resolutionCommittee?.validators ?? []), ...(vault.resolutionCommittee?.auditors ?? [])].map(
          (address) => address.toLowerCase()
        )
      );
      const setterOrPrivilegedCaller = vault.setterAddress?.toLowerCase() === submission.agentAddress.toLowerCase();
      const normalizedCommittee = vault.resolutionCommittee
        ? {
            ...vault.resolutionCommittee,
            validators: vault.resolutionCommittee.validators.map((address) => normalizeAddress(address)),
            auditors: vault.resolutionCommittee.auditors.map((address) => normalizeAddress(address))
          }
        : undefined;
      const eligible = isChallengeEligible(
        normalizeAddress(submission.agentAddress),
        normalizedCommittee,
        Boolean(setterOrPrivilegedCaller)
      );

      if (!validTargets.has(submission.payload.target.toLowerCase())) {
        throw new ValidationError("Public challenge target must be a current resolution committee member.");
      }

      if (!eligible) {
        throw new ConflictError("Current resolution committee members cannot open a public challenge.");
      }
    }
  }

  private buildWalletExecutionRequest(
    input: AgentSubmission,
    agent: AgentProfile,
    vaultId: number,
    payloadHash: `0x${string}`,
    proofHash: `0x${string}` | undefined
  ): AgenticWalletRequest {
    switch (input.kind) {
      case "rule_draft":
        return {
          action: "submitRuleDraft",
          agent,
          vaultId,
          draftHash: payloadHash,
          payloadURI: input.payloadURI,
          proofHash,
          metadata: { round: input.round }
        };
      case "rule_issue":
        return {
          action: "submitRuleIssue",
          agent,
          vaultId,
          severity: input.payload.severity,
          issueHash: payloadHash,
          payloadURI: input.payloadURI,
          proofHash,
          metadata: { round: input.round }
        };
      case "resolution_commit":
        return {
          action: "commitResolution",
          agent,
          vaultId,
          commitHash: payloadHash,
          payloadURI: input.payloadURI,
          metadata: { round: input.round }
        };
      case "resolution_reveal":
        return {
          action: "revealResolution",
          agent,
          vaultId,
          outcome: input.payload.result,
          proofHash: proofHash ?? ZERO_HASH,
          salt: input.salt as `0x${string}`,
          payloadURI: input.payloadURI,
          metadata: { round: input.round, confidenceScore: input.payload.confidenceScore }
        };
      case "audit_verdict":
        return {
          action: "submitAuditVerdict",
          agent,
          vaultId,
          validator: input.payload.validator as `0x${string}`,
          verdict: input.payload.verdict,
          verdictHash: payloadHash,
          payloadURI: input.payloadURI,
          proofHash,
          metadata: { round: input.round }
        };
      case "public_challenge":
        return {
          action: "openPublicChallenge",
          agent,
          vaultId,
          target: input.payload.target as `0x${string}`,
          challengeHash: payloadHash,
          payloadURI: input.payloadURI,
          proofHash,
          metadata: { round: input.round, targetRole: input.payload.targetRole }
        };
    }
  }

  private async deriveMarketContext(
    store: WorkflowStore,
    vault: VaultSummary,
    input: AgentSubmission
  ): Promise<Pick<Parameters<MarketDataProvider["collectSnapshots"]>[0], "statement" | "tokenAddress" | "thresholdUsd">> {
    const directInputs =
      input.kind === "rule_draft"
        ? (input.payload.inputs as Record<string, unknown> | undefined)
        : undefined;

    const submissions = await store.listSubmissions(vault.id);
    const latestRuleDraft = submissions
      .filter((item): item is RuleDraftSubmission => item.kind === "rule_draft")
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0];
    const draftInputs = latestRuleDraft?.payload.inputs as Record<string, unknown> | undefined;

    const tokenAddressCandidates = [
      typeof directInputs?.tokenAddress === "string" ? directInputs.tokenAddress : undefined,
      typeof draftInputs?.tokenAddress === "string" ? draftInputs.tokenAddress : undefined,
      vault.collateralToken
    ];
    const thresholdCandidates = [
      typeof directInputs?.thresholdUsd === "string"
        ? directInputs.thresholdUsd
        : typeof directInputs?.threshold === "string"
          ? directInputs.threshold
          : undefined,
      typeof draftInputs?.thresholdUsd === "string"
        ? draftInputs.thresholdUsd
        : typeof draftInputs?.threshold === "string"
          ? draftInputs.threshold
          : undefined
    ];

    return {
      statement:
        "statement" in input.payload
          ? input.payload.statement
          : latestRuleDraft?.payload.statement ?? vault.statement,
      tokenAddress: tokenAddressCandidates.find((value): value is string => Boolean(value && value.length > 0)),
      thresholdUsd: thresholdCandidates.find((value): value is string => Boolean(value && value.length > 0))
    };
  }

  private async prepareSubmissionArtifacts(
    store: WorkflowStore,
    vault: VaultSummary,
    input: AgentSubmission,
    agent: AgentProfile,
    onchainVaultId: number
  ): Promise<PreparedSubmissionResult> {
    let snapshots = [] as Awaited<ReturnType<MarketDataProvider["collectSnapshots"]>>;

    if (input.kind !== "resolution_commit") {
      const marketContext = await this.deriveMarketContext(store, vault, input);
      snapshots = await this.marketDataProvider.collectSnapshots({
        kind:
          input.kind === "rule_draft"
            ? "rule"
            : input.kind === "rule_issue"
              ? "rule"
              : input.kind === "audit_verdict"
                ? "audit"
                : input.kind === "public_challenge"
                  ? "challenge"
                  : "resolution",
        vaultId: onchainVaultId,
        round: input.round,
        statement: marketContext.statement,
        tokenAddress: marketContext.tokenAddress,
        thresholdUsd: marketContext.thresholdUsd,
        metadata: {
          submissionKind: input.kind,
          tokenAddress: marketContext.tokenAddress,
          thresholdUsd: marketContext.thresholdUsd
        }
      });
    }

    let payload: AgentSubmission["payload"];
    let payloadHash: `0x${string}`;
    let storedPayloadHash: `0x${string}`;
    let proofHash: `0x${string}` | undefined;
    let proofSnapshots = snapshots;

    switch (input.kind) {
      case "rule_draft": {
        const nextPayload = structuredClone(input.payload) as RuleDraftSubmission["payload"];
        payload = nextPayload;
        payloadHash = hashPayload(nextPayload);
        storedPayloadHash = payloadHash;
        proofSnapshots = mergeSnapshots(nextPayload.sources, snapshots);
        proofHash = hashPayload({ payload: nextPayload, snapshots: proofSnapshots });
        break;
      }
      case "rule_issue": {
        const nextPayload = structuredClone(input.payload) as RuleIssueSubmission["payload"];
        payload = nextPayload;
        payloadHash = hashPayload(nextPayload);
        storedPayloadHash = payloadHash;
        proofHash = hashPayload({ payload: nextPayload, snapshots });
        break;
      }
      case "resolution_commit": {
        const nextPayload = structuredClone(input.payload) as ResolutionCommitSubmission["payload"];
        payload = nextPayload;
        storedPayloadHash = hashPayload(nextPayload);
        payloadHash = computeResolutionCommitHash(nextPayload);
        if (
          input.payloadHash &&
          input.payloadHash !== storedPayloadHash &&
          input.payloadHash !== payloadHash
        ) {
          throw new ValidationError(
            "resolution_commit payloadHash must match either the uploaded canonical payload hash or the derived commit hash."
          );
        }
        proofHash = undefined;
        break;
      }
      case "resolution_reveal": {
        const nextPayload = structuredClone(input.payload) as ResolutionRevealSubmission["payload"];
        const trustedOkxSnapshots = snapshots.filter((snapshot) => isOkxMarketSnapshot(snapshot, this.policy));

        if (this.policy.enforceRealDemo) {
          assertOkxResolutionRevealSources(trustedOkxSnapshots, this.policy);
        }
        payload = nextPayload;
        payloadHash = hashPayload(nextPayload);
        storedPayloadHash = payloadHash;
        proofSnapshots = mergeSnapshots(
          nextPayload.sources,
          this.policy.enforceRealDemo ? trustedOkxSnapshots : snapshots
        );
        proofHash =
          (input.proofHash as `0x${string}` | undefined) ?? hashPayload({ payload: nextPayload, snapshots: proofSnapshots });
        break;
      }
      case "audit_verdict": {
        payload = structuredClone(input.payload);
        payloadHash = hashPayload(payload);
        storedPayloadHash = payloadHash;
        proofHash = hashPayload({ payload, snapshots });
        break;
      }
      case "public_challenge": {
        const nextPayload = structuredClone(input.payload) as PublicChallengeSubmission["payload"];
        payload = nextPayload;
        payloadHash = hashPayload(nextPayload);
        storedPayloadHash = payloadHash;
        proofSnapshots = mergeSnapshots(nextPayload.evidence, snapshots);
        proofHash = hashPayload({ payload: nextPayload, snapshots: proofSnapshots });
        break;
      }
    }

    await this.validateStoredPayloadReference(input, storedPayloadHash);
    const walletRequest = this.buildWalletExecutionRequest(input, agent, onchainVaultId, payloadHash, proofHash);
    const preparedExecution = await this.walletProvider.prepareExecution(walletRequest);

    return {
      agent,
      submissionBody: {
        ...input,
        agentAddress: agent.address,
        payload,
        payloadHash,
        ...(input.kind === "resolution_reveal" ? { proofHash } : {})
      } as AgentSubmission,
      payload,
      payloadHash,
      storedPayloadHash,
      proofHash,
      proofSnapshots,
      walletRequest,
      preparedExecution
    };
  }

  private async validateStoredPayloadReference(
    input: AgentSubmission,
    payloadHash: `0x${string}`
  ): Promise<void> {
    if (!this.policy.productionMode) {
      return;
    }

    if (!input.payloadURI.startsWith("ipfs://")) {
      throw new ValidationError("Production agent submissions must reference immutable ipfs:// payload URIs.");
    }

    const storedPayload = await this.persistence.proofStore.get(payloadHash);
    if (!storedPayload) {
      throw new ValidationError("Submission payload must be stored through POST /payloads before it can be submitted.");
    }

    if (storedPayload.payloadURI !== input.payloadURI) {
      throw new ValidationError("Submission payloadURI did not match the stored canonical payload reference.");
    }

    const allowedVaultKeys = new Set([String(input.vaultId), "__payloads__"]);
    if (!allowedVaultKeys.has(storedPayload.vaultKey)) {
      throw new ValidationError("Stored payload reference belongs to a different vault context.");
    }
  }

  private async finalizeSubmissionRecord(
    store: WorkflowStore,
    vaultKey: string,
    input: AgentSubmission,
    prepared: PreparedSubmissionResult
  ): Promise<AgentSubmission> {
    if (!input.txHash && this.walletProvider.name === OKX_AGENTIC_WALLET_PROVIDER) {
      throw new ValidationError(
        "Real agent submissions require POST /agent-submissions/prepare, an agent wallet broadcast, and then a verified txHash."
      );
    }

    const executionTrace = input.txHash
      ? await this.walletProvider.verifyExecution(prepared.walletRequest, input.txHash as `0x${string}`)
      : await this.walletProvider.execute(prepared.walletRequest);

    if (input.kind === "public_challenge") {
      const challengeId = Number(executionTrace.callResult?.challengeId ?? 0);
      if (!Number.isInteger(challengeId) || challengeId <= 0) {
        throw new ValidationError(
          "Public challenge transactions must persist the on-chain challengeId in the execution trace."
        );
      }
    }

    const proof = createProofReference({
      payloadHash: prepared.storedPayloadHash,
      payloadURI: input.payloadURI,
      sourceProvider: this.marketDataProvider.name,
      proofHash: prepared.proofHash,
      txHash: executionTrace.txHash as `0x${string}`,
      chainId: executionTrace.chainId,
      snapshot: prepared.proofSnapshots
    });

    const baseSubmission: AgentSubmission = {
      ...input,
      id: input.id ?? `${input.kind}-${Date.now()}`,
      createdAt: input.createdAt ?? Date.now(),
      agentAddress: prepared.agent.address,
      payload: prepared.payload,
      payloadHash: prepared.payloadHash,
      proof,
      proofHash: input.kind === "resolution_reveal" ? prepared.proofHash : undefined,
      executionTrace
    } as AgentSubmission;

    return this.attachValidation(store, baseSubmission, vaultKey);
  }

  private async attachValidation(
    store: WorkflowStore,
    submission: AgentSubmission,
    vaultKey: string
  ): Promise<AgentSubmission> {
    if (submission.kind !== "resolution_reveal") {
      return submission;
    }

    const existingCommits = (await store.listSubmissions(vaultKey))
      .filter((item): item is ResolutionCommitSubmission => item.kind === "resolution_commit")
      .filter((item) => item.round === submission.round && item.agentAddress === submission.agentAddress);

    const commit = existingCommits[0];
    if (!commit) {
      return {
        ...submission,
        validation: {
          notes: ["No matching commit has been recorded yet."]
        }
      };
    }

    const expectedCommitHash = computeResolutionCommitHash({
      vaultId: submission.vaultId,
      round: submission.round,
      outcome: submission.payload.result,
      proofHash: submission.proofHash ?? submission.proof?.payloadHash ?? submission.payloadHash ?? ZERO_HASH,
      salt: submission.salt,
      submittedByAgent: submission.agentAddress,
      version: 1
    });

    return {
      ...submission,
      validation: {
        commitHash: commit.payloadHash,
        expectedCommitHash,
        commitMatchesReveal: commit.payloadHash === expectedCommitHash,
        notes:
          commit.payloadHash === expectedCommitHash
            ? []
            : ["Commit hash does not match the submitted reveal payload."]
      }
    };
  }

  private async progressVaultState(
    store: WorkflowStore,
    vault: VaultSummary,
    submission: AgentSubmission
  ): Promise<void> {
    let nextStatus = vault.status;

    if (submission.kind === "rule_draft" || submission.kind === "rule_issue") {
      nextStatus = "RuleDrafting";
    }

    if (submission.kind === "resolution_commit") {
      nextStatus = "CommitPhase";
    }

    if (submission.kind === "resolution_reveal") {
      nextStatus = "RevealPhase";
    }

    if (submission.kind === "audit_verdict") {
      nextStatus = "AuditPhase";
    }

    if (submission.kind === "public_challenge") {
      nextStatus = "PublicChallenge";
    }

    await store.saveVault({
      ...vault,
      status: nextStatus,
      updatedAt: Date.now()
    });
  }
}
