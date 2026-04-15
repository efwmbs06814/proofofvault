import {
  buildWorkflowTasks,
  createProofReference,
  evaluateFinalityReadiness,
  evaluateResolutionConsensus,
  hashPayload,
  type ProofStore,
  type FinalizeRuleSetWrite,
  type OnchainGateway
} from "@proof-of-vault/agent-runtime";
import type {
  AgentSubmission,
  CriteriaFinalPayload,
  FinalizeResolutionRequest,
  FinalizeRuleSetRequest,
  RuleSetDecisionRequest,
  VaultDetail,
  VaultSummary
} from "@proof-of-vault/shared-types";
import type { StoredProof } from "@proof-of-vault/agent-runtime";

import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";

function isRuleDraftSubmission(submission: AgentSubmission): submission is Extract<AgentSubmission, { kind: "rule_draft" }> {
  return submission.kind === "rule_draft";
}

function isRuleIssueSubmission(submission: AgentSubmission): submission is Extract<AgentSubmission, { kind: "rule_issue" }> {
  return submission.kind === "rule_issue";
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
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

function requireExternalVaultId(vault: VaultSummary, action: string): number {
  if (vault.externalVaultId === undefined) {
    throw new ValidationError(`${action} requires the vault to be registered on-chain first.`);
  }

  return vault.externalVaultId;
}

function isMaliciousRuleIssue(
  submission: Extract<AgentSubmission, { kind: "rule_issue" }>
): boolean {
  return submission.payload.issueType.toLowerCase().includes("malicious");
}

export class WorkflowService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly proofStore: ProofStore,
    private readonly onchainGateway: OnchainGateway
  ) {}

  async getVaultDetail(vaultId: string): Promise<VaultDetail> {
    const vault = await this.store.getVault(vaultId);
    if (!vault) {
      throw new NotFoundError(`Vault ${vaultId} was not found.`);
    }

    return this.buildDetail(vault);
  }

  async listVaultSummaries(): Promise<VaultSummary[]> {
    const vaults = await this.store.listVaults();
    return vaults
      .map((vault) => ({ ...vault, traces: [...vault.traces] }))
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  async finalizeRuleSet(vaultId: string, request: FinalizeRuleSetRequest): Promise<VaultDetail> {
    const vault = await this.getVaultSummary(vaultId);
    if (!vault.ruleCommittee) {
      throw new ValidationError("Rule committee must be registered before finalizing the rule set.");
    }

    const submissions = await this.store.listSubmissions(vault.id);
    const ruleDrafts = submissions.filter(
      (submission): submission is Extract<AgentSubmission, { kind: "rule_draft" }> =>
        isRuleDraftSubmission(submission) &&
        submission.round === vault.ruleRound &&
        committeeIncludes(vault.ruleCommittee?.makers, submission.agentAddress)
    );
    const ruleIssues = submissions.filter(
      (submission): submission is Extract<AgentSubmission, { kind: "rule_issue" }> =>
        isRuleIssueSubmission(submission) &&
        submission.round === vault.ruleRound &&
        committeeIncludes(vault.ruleCommittee?.verifiers, submission.agentAddress)
    );

    if (ruleDrafts.length === 0) {
      throw new ValidationError("At least one rule draft is required before finalization.");
    }

    const acceptedRuleIssues = ruleIssues.filter((submission) => !isMaliciousRuleIssue(submission));
    const maliciousRuleIssues = ruleIssues.filter((submission) => isMaliciousRuleIssue(submission));
    const approvedDraftHashes = ruleDrafts.map((submission) => submission.payloadHash).filter(isDefined);
    const acceptedIssueHashes = acceptedRuleIssues.map((submission) => submission.payloadHash).filter(isDefined);
    const criteriaHash = hashPayload({
      vaultId: Number(vault.id),
      round: vault.ruleRound,
      approvedDrafts: approvedDraftHashes,
      acceptedIssues: acceptedIssueHashes,
      finalSourcePolicy: request.finalSourcePolicy
    });

    const finalPayload: CriteriaFinalPayload = {
      vaultId: Number(vault.id),
      round: vault.ruleRound,
      criteriaHash,
      approvedDrafts: approvedDraftHashes,
      acceptedIssues: acceptedIssueHashes,
      finalSourcePolicy: request.finalSourcePolicy,
      version: 1
    };
    const payloadHash = hashPayload(finalPayload);

    await this.proofStore.put({
      vaultKey: vault.id,
      payload: finalPayload,
      ...createProofReference({
        payloadHash,
        payloadURI: request.metadataURI,
        sourceProvider: "criteria-finalizer"
      })
    });

    const onchainWrite: FinalizeRuleSetWrite = {
      vaultId: requireExternalVaultId(vault, "finalizeRuleSet"),
      criteriaHash,
      metadataURI: request.metadataURI,
      approvedMakers: [...new Set(ruleDrafts.map((submission) => submission.agentAddress))] as `0x${string}`[],
      acceptedVerifiers: [...new Set(acceptedRuleIssues.map((submission) => submission.agentAddress))] as `0x${string}`[],
      maliciousMakers: [],
      maliciousVerifiers: maliciousRuleIssues.map((submission) => submission.agentAddress) as `0x${string}`[],
      actorAddress: request.orchestratorAddress as `0x${string}` | undefined
    };
    const trace = await this.onchainGateway.finalizeRuleSet(onchainWrite);

    await this.store.saveVault({
      ...vault,
      criteriaHash,
      status: "UserRuleReview",
      traces: [...vault.traces, trace],
      updatedAt: Date.now()
    });

    return this.getVaultDetail(vault.id);
  }

  async decideRuleSet(vaultId: string, request: RuleSetDecisionRequest): Promise<VaultDetail> {
    const vault = await this.getVaultSummary(vaultId);
    const trace = await this.onchainGateway.decideRuleSet(vault, request);

    const updatedVault: VaultSummary =
      request.decision === "accept"
        ? {
            ...vault,
            status: "Active",
            traces: [...vault.traces, trace],
            updatedAt: Date.now()
          }
        : {
            ...vault,
            rejectionCount: vault.rejectionCount + 1,
            status: vault.rejectionCount + 1 >= 2 ? "Cancelled" : "RuleAuction",
            criteriaHash: undefined,
            ruleCommittee: vault.rejectionCount + 1 >= 2 ? vault.ruleCommittee : undefined,
            traces: [...vault.traces, trace],
            updatedAt: Date.now()
          };

    await this.store.saveVault(updatedVault);
    return this.getVaultDetail(updatedVault.id);
  }

  async finalizeResolution(vaultId: string, request: FinalizeResolutionRequest): Promise<{
    ready: boolean;
    reopened: boolean;
    blockers: string[];
    vault: VaultDetail;
  }> {
    const vault = await this.getVaultSummary(vaultId);
    const submissions = await this.store.listSubmissions(vault.id);

    for (const resolution of request.challengeResolutions) {
      const challengeSubmission = submissions.find(
        (submission) => submission.kind === "public_challenge" && submission.id === resolution.submissionId
      );
      const persistedChallengeId =
        resolution.challengeId ??
        (challengeSubmission?.executionTrace?.callResult?.challengeId as number | undefined);

      if (!Number.isInteger(persistedChallengeId) || Number(persistedChallengeId) <= 0) {
        throw new ValidationError(
          `Challenge ${resolution.submissionId} is missing a persisted on-chain challengeId.`
        );
      }

      await this.store.updateChallengeStatus(
        vault.id,
        resolution.submissionId,
        resolution.successful ? "resolved_success" : "resolved_failure"
      );
      const trace = await this.onchainGateway.resolveChallenge(
        vault,
        {
          ...resolution,
          challengeId: Number(persistedChallengeId)
        },
        request.finalizerAddress as `0x${string}` | undefined
      );
      vault.traces.push(trace);
    }

    const refreshedSubmissions = await this.store.listSubmissions(vault.id);
    const openChallengeCount = refreshedSubmissions.filter(
      (submission) => submission.kind === "public_challenge" && submission.status === "open"
    ).length;
    const metrics = vault.resolutionCommittee
      ? evaluateResolutionConsensus({
          round: vault.resolutionRound,
          minValidCount: vault.resolutionCommittee.minValidCount,
          submissions: refreshedSubmissions,
          resolutionCommittee: vault.resolutionCommittee
        })
      : undefined;

    const readiness = evaluateFinalityReadiness({
      vault,
      consensusMetrics: metrics,
      openChallengeCount
    });

    if (metrics?.needsRoundReopen && request.reopenOnInsufficientEvidence) {
      const trace = await this.onchainGateway.finalizeV2Vault(
        vault,
        request.finalizerAddress as `0x${string}` | undefined
      );
      const snapshot = await this.onchainGateway.readVaultSnapshot(vault);
      const reopened = snapshot.status === "ResolutionAuction";
      const finalResult = metrics.decidedOutcome ?? "INVALID";

      await this.store.saveVault({
        ...vault,
        status: snapshot.status,
        resolutionRound: snapshot.resolutionRound,
        resolutionCommittee: snapshot.resolutionCommittee,
        onchainSnapshot: snapshot,
        finalResolution: reopened
          ? vault.finalResolution
          : {
              result: finalResult,
              confidenceScore: metrics.confidenceScore,
              finalizedAt: Date.now(),
              reason:
                finalResult === "INVALID"
                  ? "Insufficient valid evidence reached the quorum threshold."
                  : `Consensus resolved to ${finalResult}.`,
              slashCandidates: metrics.slashCandidates
            },
        traces: [...vault.traces, trace],
        updatedAt: Date.now()
      });

      return {
        ready: !reopened,
        reopened,
        blockers: [],
        vault: await this.getVaultDetail(vault.id)
      };
    }

    if (!metrics) {
      return {
        ready: false,
        reopened: false,
        blockers: ["Resolution committee is not registered."],
        vault: await this.getVaultDetail(vault.id)
      };
    }

    if (!readiness.ready && !(metrics.needsRoundReopen && !request.reopenOnInsufficientEvidence)) {
      return {
        ready: false,
        reopened: false,
        blockers: readiness.blockers,
        vault: await this.getVaultDetail(vault.id)
      };
    }

    const result = metrics.needsRoundReopen && !request.reopenOnInsufficientEvidence ? "INVALID" : metrics.decidedOutcome;
    if (!result) {
      throw new ValidationError("Unable to finalize without a decided outcome or explicit INVALID fallback.");
    }

    const trace = await this.onchainGateway.finalizeV2Vault(
      vault,
      request.finalizerAddress as `0x${string}` | undefined
    );
    const snapshot = await this.onchainGateway.readVaultSnapshot(vault);
    await this.store.saveVault({
      ...vault,
      status: snapshot.status,
      resolutionCommittee: snapshot.resolutionCommittee,
      onchainSnapshot: snapshot,
      finalResolution: {
        result,
        confidenceScore: metrics.confidenceScore,
        finalizedAt: Date.now(),
        reason:
          result === "INVALID" && metrics.needsRoundReopen
            ? "Insufficient valid evidence reached the quorum threshold."
            : `Consensus resolved to ${result}.`,
        slashCandidates: metrics.slashCandidates
      },
      traces: [...vault.traces, trace],
      updatedAt: Date.now()
    });

    return {
      ready: true,
      reopened: false,
      blockers: [],
      vault: await this.getVaultDetail(vault.id)
    };
  }

  private async getVaultSummary(vaultId: string): Promise<VaultSummary> {
    const vault = await this.store.getVault(vaultId);
    if (!vault) {
      throw new NotFoundError(`Vault ${vaultId} was not found.`);
    }

    return { ...vault, traces: [...vault.traces] };
  }

  private async buildDetail(vault: VaultSummary): Promise<VaultDetail> {
    const submissions = await this.store.listSubmissions(vault.id);
    const proofs = (await this.proofStore.listByVault(vault.id)).map((proof: StoredProof) => {
      const { payload, vaultKey, ...reference } = proof;
      return reference;
    });

    const consensusMetrics = vault.resolutionCommittee
      ? evaluateResolutionConsensus({
          round: vault.resolutionRound,
          minValidCount: vault.resolutionCommittee.minValidCount,
          submissions,
          resolutionCommittee: vault.resolutionCommittee
        })
      : undefined;

    const baseDetail: VaultDetail = {
      ...vault,
      submissions,
      proofs,
      consensusMetrics,
      agentProfiles: await this.store.listAgents(),
      tasks: []
    };

    return {
      ...baseDetail,
      tasks: buildWorkflowTasks(baseDetail)
    };
  }
}
