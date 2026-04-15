import type {
  AgentSubmission,
  ConsensusMetrics,
  PublicChallengeSubmission,
  ResolutionCommittee,
  ResolutionCommitSubmission,
  ResolutionRevealSubmission,
  SlashCandidate
} from "@proof-of-vault/shared-types";

import { computeResolutionCommitHash } from "./hash-payload.js";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function isCommit(submission: AgentSubmission): submission is ResolutionCommitSubmission {
  return submission.kind === "resolution_commit";
}

function isReveal(submission: AgentSubmission): submission is ResolutionRevealSubmission {
  return submission.kind === "resolution_reveal";
}

function isOpenChallenge(submission: AgentSubmission): submission is PublicChallengeSubmission {
  return submission.kind === "public_challenge" && submission.status === "open";
}

function effectiveVerdict(verdicts: string[]): "Valid" | "Questionable" | "Invalid" | "Malicious" | "Pending" {
  const consideredAuditors = verdicts.length;
  if (consideredAuditors === 0) {
    return "Pending";
  }

  const maliciousCount = verdicts.filter((verdict) => verdict === "MALICIOUS").length;
  if (maliciousCount * 3 > consideredAuditors * 2) {
    return "Malicious";
  }

  const invalidCount = verdicts.filter((verdict) => verdict === "INVALID").length;
  if (invalidCount * 3 > consideredAuditors * 2) {
    return "Invalid";
  }

  const validCount = verdicts.filter((verdict) => verdict === "VALID").length;
  if (validCount * 3 > consideredAuditors * 2) {
    return "Valid";
  }

  const questionableCount = verdicts.filter((verdict) => verdict === "QUESTIONABLE").length;
  if (questionableCount * 3 > consideredAuditors * 2) {
    return "Questionable";
  }

  return "Questionable";
}

export function evaluateResolutionConsensus(input: {
  round: number;
  minValidCount: number;
  submissions: AgentSubmission[];
  resolutionCommittee?: ResolutionCommittee;
}): ConsensusMetrics {
  const roundSubmissions = input.submissions.filter((submission) => submission.round === input.round);
  const validatorSet = new Set(input.resolutionCommittee?.validators.map((address) => address.toLowerCase()) ?? []);
  const auditorSet = new Set(input.resolutionCommittee?.auditors.map((address) => address.toLowerCase()) ?? []);
  const commits = roundSubmissions.filter(
    (submission): submission is ResolutionCommitSubmission =>
      isCommit(submission) &&
      (validatorSet.size === 0 || validatorSet.has(submission.agentAddress.toLowerCase()))
  );
  const reveals = roundSubmissions.filter(
    (submission): submission is ResolutionRevealSubmission =>
      isReveal(submission) &&
      (validatorSet.size === 0 || validatorSet.has(submission.agentAddress.toLowerCase()))
  );
  const audits = roundSubmissions.filter(
    (submission): submission is Extract<AgentSubmission, { kind: "audit_verdict" }> =>
      submission.kind === "audit_verdict" &&
      (auditorSet.size === 0 || auditorSet.has(submission.agentAddress.toLowerCase()))
  );
  const openChallenges = roundSubmissions.filter(isOpenChallenge);

  const commitByValidator = new Map(
    commits.map((submission) => [submission.agentAddress.toLowerCase(), submission])
  );
  const slashCandidates: SlashCandidate[] = [];

  let validCount = 0;
  let questionableCount = 0;
  let invalidCount = 0;
  let maliciousCount = 0;
  let missingAuditCount = 0;

  const validOutcomeCounts = new Map<"TRUE" | "FALSE" | "INVALID", number>();

  for (const reveal of reveals) {
    const matchingCommit = commitByValidator.get(reveal.agentAddress.toLowerCase());
    const expectedCommitHash = computeResolutionCommitHash({
      vaultId: reveal.payload.vaultId,
      round: reveal.payload.round,
      outcome: reveal.payload.result,
      proofHash: reveal.proofHash ?? reveal.proof?.payloadHash ?? reveal.payloadHash ?? ZERO_HASH,
      salt: reveal.salt,
      submittedByAgent: reveal.agentAddress,
      version: 1
    });

    if (!matchingCommit || matchingCommit.payloadHash !== expectedCommitHash) {
      slashCandidates.push({
        agentAddress: reveal.agentAddress,
        role: "ResolutionValidator",
        reasonCode: "CommitRevealMismatch",
        evidencePayloadHash: reveal.payloadHash,
        notes: ["Reveal payload did not match the previously recorded commit hash."]
      });
      invalidCount += 1;
      continue;
    }

    const verdicts = audits
      .filter(
        (submission) =>
          submission.payload.validator.toLowerCase() === reveal.agentAddress.toLowerCase()
      )
      .map((submission) => submission.payload.verdict);

    const verdict = effectiveVerdict(verdicts);

    if (verdict === "Pending") {
      missingAuditCount += 1;
      continue;
    }

    if (verdict === "Valid") {
      validCount += 1;
      validOutcomeCounts.set(reveal.payload.result, (validOutcomeCounts.get(reveal.payload.result) ?? 0) + 1);
      continue;
    }

    if (verdict === "Questionable") {
      questionableCount += 1;
      continue;
    }

    if (verdict === "Invalid") {
      invalidCount += 1;
      slashCandidates.push({
        agentAddress: reveal.agentAddress,
        role: "ResolutionValidator",
        reasonCode: "InvalidProof",
        evidencePayloadHash: reveal.payloadHash,
        notes: ["Auditors marked this reveal as objectively invalid."]
      });
      continue;
    }

    maliciousCount += 1;
    slashCandidates.push({
      agentAddress: reveal.agentAddress,
      role: "ResolutionValidator",
      reasonCode: "MaliciousResolution",
      evidencePayloadHash: reveal.payloadHash,
      notes: ["Auditors marked this reveal as malicious."]
    });
  }

  if (input.resolutionCommittee) {
    for (const auditor of input.resolutionCommittee.auditors) {
      const reviewedValidatorSet = new Set(
        audits
          .filter((submission) => submission.agentAddress.toLowerCase() === auditor.toLowerCase())
          .map((submission) => submission.payload.validator.toLowerCase())
      );

      const missingCoverage = reveals.filter(
        (reveal) => !reviewedValidatorSet.has(reveal.agentAddress.toLowerCase())
      );

      if (missingCoverage.length > 0) {
        slashCandidates.push({
          agentAddress: auditor,
          role: "ResolutionAuditor",
          reasonCode: "NonParticipation",
          evidencePayloadHash: missingCoverage[0]?.payloadHash,
          notes: [`Auditor skipped ${missingCoverage.length} revealed validator submissions.`]
        });
      }
    }
  }

  const trueCount = validOutcomeCounts.get("TRUE") ?? 0;
  const falseCount = validOutcomeCounts.get("FALSE") ?? 0;
  const invalidOutcomeCount = validOutcomeCounts.get("INVALID") ?? 0;
  const topCount = Math.max(trueCount, falseCount, invalidOutcomeCount);

  let decidedOutcome: "TRUE" | "FALSE" | "INVALID" | undefined;
  if (validCount >= input.minValidCount) {
    if (trueCount * 3 > validCount * 2) {
      decidedOutcome = "TRUE";
    } else if (falseCount * 3 > validCount * 2) {
      decidedOutcome = "FALSE";
    } else if (invalidOutcomeCount * 3 > validCount * 2) {
      decidedOutcome = "INVALID";
    }
  }

  // Finality can still proceed into an INVALID fallback or round reopen even when
  // no validator managed to reveal, as long as the challenge window has closed
  // and there are no unresolved challenges left.
  const readyForFinality = missingAuditCount === 0 && openChallenges.length === 0;
  const needsRoundReopen = readyForFinality && (validCount < input.minValidCount || !decidedOutcome);

  return {
    round: input.round,
    minValidCount: input.minValidCount,
    revealCount: reveals.length,
    validCount,
    questionableCount,
    invalidCount,
    maliciousCount,
    missingAuditCount,
    readyForFinality,
    needsRoundReopen,
    decidedOutcome,
    confidenceScore: validCount === 0 ? 0 : topCount / validCount,
    slashCandidates
  };
}
