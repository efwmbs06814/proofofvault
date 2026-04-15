import type { AgentSubmission, VaultDetail, WorkflowTask } from "@proof-of-vault/shared-types";

import {
  canParticipateInCommittee,
  recommendResolutionCommitteeSizing,
  recommendRuleCommitteeSizing
} from "./committee-selector.js";

function buildTaskId(vaultId: string, stage: WorkflowTask["stage"], assigneeAddress?: string): string {
  return [vaultId, stage, assigneeAddress ?? "system"].join(":");
}

function hasSubmission(
  submissions: AgentSubmission[],
  kind: AgentSubmission["kind"],
  agentAddress: string,
  round: number
): boolean {
  return submissions.some(
    (submission) =>
      submission.kind === kind &&
      submission.round === round &&
      submission.agentAddress.toLowerCase() === agentAddress.toLowerCase()
  );
}

function isTerminalStatus(status: VaultDetail["status"]): boolean {
  return status === "ResolvedTrue" || status === "ResolvedFalse" || status === "ResolvedInvalid" || status === "Cancelled";
}

function hasRewardClaim(vault: VaultDetail, agentAddress: string): boolean {
  return vault.traces.some(
    (trace) =>
      trace.action === "claimRewards" &&
      trace.actorAddress?.toLowerCase() === agentAddress.toLowerCase()
  );
}

function committeeEligibleAgents(vault: VaultDetail): typeof vault.agentProfiles {
  return vault.agentProfiles.filter(canParticipateInCommittee);
}

export function buildWorkflowTasks(vault: VaultDetail, now = Date.now()): WorkflowTask[] {
  const tasks: WorkflowTask[] = [];
  const { submissions, ruleCommittee, resolutionCommittee } = vault;
  const terminal = isTerminalStatus(vault.status);

  if (!terminal && (vault.status === "DraftRequest" || vault.status === "RuleAuction")) {
    const eligibleAgents = committeeEligibleAgents(vault);
    tasks.push({
      id: buildTaskId(vault.id, "rule_committee_registration"),
      vaultId: vault.id,
      stage: "rule_committee_registration",
      assigneeType: "orchestrator",
      title: "Register the rule committee for the current vault round.",
      status: ruleCommittee ? "completed" : "pending",
      metadata: { round: vault.ruleRound, candidatePoolSize: eligibleAgents.length }
    });

    if (!ruleCommittee) {
      for (const agent of eligibleAgents) {
        const recommended =
          eligibleAgents.length >= 2 ? recommendRuleCommitteeSizing(eligibleAgents.length) : undefined;
        tasks.push({
          id: buildTaskId(vault.id, "rule_committee_registration", agent.address),
          vaultId: vault.id,
          stage: "rule_committee_registration",
          assigneeType: "agent",
          assigneeAddress: agent.address,
          title: "Bootstrap the rule committee from the live judge-listed agent pool.",
          status: "pending",
          metadata: {
            round: vault.ruleRound,
            action: "bootstrap_rule_committee",
            candidatePoolSize: eligibleAgents.length,
            recommendedMakerCount: recommended?.makerCount,
            recommendedVerifierCount: recommended?.verifierCount
          }
        });
      }
    }
  }

  if (!terminal && ruleCommittee && (vault.status === "RuleDrafting" || vault.status === "RuleAuction")) {
    for (const maker of ruleCommittee.makers) {
      tasks.push({
        id: buildTaskId(vault.id, "rule_drafting", maker),
        vaultId: vault.id,
        stage: "rule_drafting",
        assigneeType: "agent",
        assigneeAddress: maker,
        title: "Submit the rule draft payload for this round.",
        status: hasSubmission(submissions, "rule_draft", maker, vault.ruleRound) ? "completed" : "pending",
        metadata: { role: "RuleMaker", round: vault.ruleRound }
      });
    }

    for (const verifier of ruleCommittee.verifiers) {
      tasks.push({
        id: buildTaskId(vault.id, "rule_drafting", verifier),
        vaultId: vault.id,
        stage: "rule_drafting",
        assigneeType: "agent",
        assigneeAddress: verifier,
        title: "Submit rule issues or confirm the draft quality for this round.",
        status: hasSubmission(submissions, "rule_issue", verifier, vault.ruleRound) ? "completed" : "pending",
        metadata: { role: "RuleVerifier", round: vault.ruleRound }
      });
    }
  }

  if (!terminal && vault.status === "UserRuleReview") {
    tasks.push({
      id: buildTaskId(vault.id, "rule_review", vault.setterAddress),
      vaultId: vault.id,
      stage: "rule_review",
      assigneeType: "setter",
      assigneeAddress: vault.setterAddress,
      title: "Accept or reject the finalized rule set.",
      status: "pending",
      metadata: { round: vault.ruleRound }
    });
  }

  if (
    !terminal &&
    (vault.status === "Active" ||
    vault.status === "ResolutionAuction" ||
    (vault.settlementTime !== undefined && now >= vault.settlementTime && !resolutionCommittee)
    )
  ) {
    const eligibleAgents = committeeEligibleAgents(vault);
    tasks.push({
      id: buildTaskId(vault.id, "resolution_committee_registration"),
      vaultId: vault.id,
      stage: "resolution_committee_registration",
      assigneeType: "orchestrator",
      title: "Register the resolution committee after settlement time.",
      status: resolutionCommittee ? "completed" : "pending",
      metadata: { round: vault.resolutionRound, candidatePoolSize: eligibleAgents.length }
    });

    if (!resolutionCommittee) {
      for (const agent of eligibleAgents) {
        const recommended =
          eligibleAgents.length >= 2 ? recommendResolutionCommitteeSizing(eligibleAgents.length) : undefined;
        tasks.push({
          id: buildTaskId(vault.id, "resolution_committee_registration", agent.address),
          vaultId: vault.id,
          stage: "resolution_committee_registration",
          assigneeType: "agent",
          assigneeAddress: agent.address,
          title: "Bootstrap the resolution committee from the live judge-listed agent pool.",
          status: "pending",
          metadata: {
            round: vault.resolutionRound,
            action: "bootstrap_resolution_committee",
            candidatePoolSize: eligibleAgents.length,
            recommendedValidatorCount: recommended?.validatorCount,
            recommendedAuditorCount: recommended?.auditorCount,
            recommendedMinValidCount: recommended?.minValidCount
          }
        });
      }
    }
  }

  if (!terminal && resolutionCommittee) {
    for (const validator of resolutionCommittee.validators) {
      tasks.push({
        id: buildTaskId(vault.id, "resolution_commit", validator),
        vaultId: vault.id,
        stage: "resolution_commit",
        assigneeType: "agent",
        assigneeAddress: validator,
        title: "Commit a resolution hash via Agentic Wallet.",
        status: hasSubmission(submissions, "resolution_commit", validator, vault.resolutionRound)
          ? "completed"
          : "pending",
        metadata: { role: "ResolutionValidator", round: vault.resolutionRound }
      });

      tasks.push({
        id: buildTaskId(vault.id, "resolution_reveal", validator),
        vaultId: vault.id,
        stage: "resolution_reveal",
        assigneeType: "agent",
        assigneeAddress: validator,
        title: "Reveal the resolution payload and proof.",
        status: hasSubmission(submissions, "resolution_reveal", validator, vault.resolutionRound)
          ? "completed"
          : "pending",
        metadata: { role: "ResolutionValidator", round: vault.resolutionRound }
      });
    }

    const revealedValidators = submissions
      .filter(
        (submission) =>
          submission.kind === "resolution_reveal" && submission.round === vault.resolutionRound
      )
      .map((submission) => submission.agentAddress.toLowerCase());

    for (const auditor of resolutionCommittee.auditors) {
      tasks.push({
        id: buildTaskId(vault.id, "audit_review", auditor),
        vaultId: vault.id,
        stage: "audit_review",
        assigneeType: "agent",
        assigneeAddress: auditor,
        title: "Review every revealed validator submission.",
        status:
          revealedValidators.length > 0 &&
          revealedValidators.every((validator) =>
            submissions.some(
              (submission) =>
                submission.kind === "audit_verdict" &&
                submission.round === vault.resolutionRound &&
                submission.agentAddress.toLowerCase() === auditor.toLowerCase() &&
                submission.payload.validator.toLowerCase() === validator
            )
          )
            ? "completed"
            : "pending",
        metadata: { role: "ResolutionAuditor", round: vault.resolutionRound }
      });
    }

    tasks.push({
      id: buildTaskId(vault.id, "public_challenge"),
      vaultId: vault.id,
      stage: "public_challenge",
      assigneeType: "challenger",
      title: "Open a public challenge if a reveal is objectively invalid.",
      status: submissions.some(
        (submission) =>
          submission.kind === "public_challenge" &&
          submission.round === vault.resolutionRound
      )
        ? "completed"
        : "pending",
      metadata: { round: vault.resolutionRound }
    });

    tasks.push({
      id: buildTaskId(vault.id, "finalization"),
      vaultId: vault.id,
      stage: "finalization",
      assigneeType: "finalizer",
      title: "Resolve challenges and finalize the vault outcome.",
      status:
        vault.status === "ResolvedTrue" ||
        vault.status === "ResolvedFalse" ||
        vault.status === "ResolvedInvalid"
          ? "completed"
          : "pending",
      metadata: { round: vault.resolutionRound }
    });
  }

  if (
    vault.status === "ResolvedTrue" ||
    vault.status === "ResolvedFalse" ||
    vault.status === "ResolvedInvalid"
  ) {
    const rewardClaimAddresses = new Set(
      submissions
        .filter((submission) =>
          ["resolution_reveal", "audit_verdict", "rule_draft", "rule_issue", "public_challenge"].includes(submission.kind)
        )
        .map((submission) => submission.agentAddress)
    );

    for (const agentAddress of rewardClaimAddresses) {
      tasks.push({
        id: buildTaskId(vault.id, "reward_claim", agentAddress),
        vaultId: vault.id,
        stage: "reward_claim",
        assigneeType: "agent",
        assigneeAddress: agentAddress,
        title: "Claim rewards earned from committee participation.",
        status: hasRewardClaim(vault, agentAddress) ? "completed" : "pending",
        metadata: {}
      });
    }
  }

  return tasks;
}
