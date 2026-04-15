import type { ConsensusMetrics, ResolutionCommittee, VaultSummary } from "@proof-of-vault/shared-types";

export type FinalityReadiness = {
  ready: boolean;
  blockers: string[];
  reopenRecommended: boolean;
};

export function evaluateFinalityReadiness(input: {
  vault: VaultSummary;
  consensusMetrics?: ConsensusMetrics;
  openChallengeCount: number;
  now?: number;
}): FinalityReadiness {
  const blockers: string[] = [];
  const now = input.now ?? Date.now();
  const committee = input.vault.resolutionCommittee as ResolutionCommittee | undefined;

  if (!committee) {
    blockers.push("Resolution committee has not been registered.");
  }

  if (committee?.challengeDeadlineAt && now < committee.challengeDeadlineAt) {
    blockers.push("Challenge window is still open.");
  }

  if (input.openChallengeCount > 0) {
    blockers.push("Open challenges must be resolved before finalization.");
  }

  if (!input.consensusMetrics) {
    blockers.push("Consensus has not been evaluated yet.");
  } else {
    if (!input.consensusMetrics.readyForFinality) {
      blockers.push("Audits or reveals are still incomplete.");
    }

    if (!input.consensusMetrics.decidedOutcome && !input.consensusMetrics.needsRoundReopen) {
      blockers.push("No valid final outcome is available yet.");
    }
  }

  return {
    ready: blockers.length === 0 && !input.consensusMetrics?.needsRoundReopen,
    blockers,
    reopenRecommended: input.consensusMetrics?.needsRoundReopen ?? false
  };
}
