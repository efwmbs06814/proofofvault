import type { AgentProfile, ResolutionCommittee, RuleCommittee } from "@proof-of-vault/shared-types";

type RoleHint = "rule-maker" | "rule-verifier" | "validator" | "auditor" | "challenger";

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function hasPositiveStake(agent: AgentProfile): boolean {
  try {
    return BigInt(agent.activeStake) > 0n;
  } catch {
    return false;
  }
}

export function canParticipateInCommittee(agent: AgentProfile): boolean {
  return agent.status === "available" && hasPositiveStake(agent);
}

export function recommendRuleCommitteeSizing(agentCount: number): {
  makerCount: number;
  verifierCount: number;
} {
  if (agentCount < 2) {
    throw new Error("At least 2 eligible agents are required to form a rule committee.");
  }

  if (agentCount === 2) {
    return { makerCount: 1, verifierCount: 1 };
  }

  if (agentCount === 3) {
    return { makerCount: 2, verifierCount: 1 };
  }

  return { makerCount: 2, verifierCount: 2 };
}

export function recommendResolutionCommitteeSizing(agentCount: number): {
  validatorCount: number;
  auditorCount: number;
  minValidCount: number;
} {
  if (agentCount < 2) {
    throw new Error("At least 2 eligible agents are required to form a resolution committee.");
  }

  if (agentCount === 2) {
    return { validatorCount: 1, auditorCount: 1, minValidCount: 1 };
  }

  if (agentCount === 3) {
    return { validatorCount: 2, auditorCount: 1, minValidCount: 2 };
  }

  if (agentCount === 4) {
    return { validatorCount: 3, auditorCount: 1, minValidCount: 2 };
  }

  return { validatorCount: 3, auditorCount: 2, minValidCount: 2 };
}

function isEligible(agent: AgentProfile, role: RoleHint): boolean {
  if (!canParticipateInCommittee(agent)) {
    return false;
  }

  return agent.capabilityTags.includes(role) || agent.capabilityTags.includes("all-rounder");
}

function canPrioritizeForRole(agent: AgentProfile, role: RoleHint): boolean {
  return isEligible(agent, role) || canParticipateInCommittee(agent);
}

function sortAgents(agents: AgentProfile[]): AgentProfile[] {
  return [...agents].sort((left, right) => {
    if (right.reputationScore !== left.reputationScore) {
      return right.reputationScore - left.reputationScore;
    }

    const leftStake = BigInt(left.activeStake);
    const rightStake = BigInt(right.activeStake);
    if (rightStake !== leftStake) {
      return rightStake > leftStake ? 1 : -1;
    }

    return left.address.localeCompare(right.address);
  });
}

function selectAgents(
  agents: AgentProfile[],
  role: RoleHint,
  count: number,
  excludedAddresses = new Set<string>()
): AgentProfile[] {
  const preferred = sortAgents(agents).filter(
    (agent) => !excludedAddresses.has(agent.address) && isEligible(agent, role)
  );

  if (preferred.length >= count) {
    return preferred.slice(0, count);
  }

  const fallback = sortAgents(agents).filter(
    (agent) => !excludedAddresses.has(agent.address) && canParticipateInCommittee(agent)
  );

  return fallback.slice(0, count);
}

function findPriorityAgent(agents: AgentProfile[], priorityAddress: string): AgentProfile {
  const normalizedPriorityAddress = normalizeAddress(priorityAddress);
  const priorityAgent = agents.find((agent) => normalizeAddress(agent.address) === normalizedPriorityAddress);
  if (!priorityAgent || !canParticipateInCommittee(priorityAgent)) {
    throw new Error("The prioritized agent is not eligible for committee selection.");
  }

  return priorityAgent;
}

function selectAgentsWithPriority(
  agents: AgentProfile[],
  role: RoleHint,
  count: number,
  priorityAgent: AgentProfile | undefined,
  excludedAddresses = new Set<string>()
): AgentProfile[] {
  if (count <= 0) {
    return [];
  }

  const normalizedExcluded = new Set([...excludedAddresses].map((address) => normalizeAddress(address)));
  const prioritizedSelection =
    priorityAgent &&
    !normalizedExcluded.has(normalizeAddress(priorityAgent.address)) &&
    canPrioritizeForRole(priorityAgent, role)
      ? [priorityAgent]
      : [];

  const remainingCount = count - prioritizedSelection.length;
  if (remainingCount <= 0) {
    return prioritizedSelection;
  }

  const nextExcluded = new Set(normalizedExcluded);
  for (const agent of prioritizedSelection) {
    nextExcluded.add(normalizeAddress(agent.address));
  }

  return [...prioritizedSelection, ...selectAgents(agents, role, remainingCount, nextExcluded)];
}

export function selectRuleCommittee(
  agents: AgentProfile[],
  makerCount = 2,
  verifierCount = 2
): { committee: RuleCommittee; selectedAgents: AgentProfile[] } {
  const makerAgents = selectAgents(agents, "rule-maker", makerCount);
  if (makerAgents.length < makerCount) {
    throw new Error("Not enough eligible rule makers to form a committee.");
  }

  const excluded = new Set(makerAgents.map((agent) => agent.address));
  const verifierAgents = selectAgents(agents, "rule-verifier", verifierCount, excluded);
  if (verifierAgents.length < verifierCount) {
    throw new Error("Not enough eligible rule verifiers to form a committee.");
  }

  return {
    committee: {
      makers: makerAgents.map((agent) => agent.address),
      verifiers: verifierAgents.map((agent) => agent.address)
    },
    selectedAgents: [...makerAgents, ...verifierAgents]
  };
}

export function selectRuleCommitteeWithPriority(
  agents: AgentProfile[],
  priorityAddress: string,
  makerCount = 2,
  verifierCount = 2
): { committee: RuleCommittee; selectedAgents: AgentProfile[] } {
  const priorityAgent = findPriorityAgent(agents, priorityAddress);
  const prefersMakerRole = isEligible(priorityAgent, "rule-maker") || !isEligible(priorityAgent, "rule-verifier");
  const makerPriorityAgent = prefersMakerRole && makerCount > 0 ? priorityAgent : undefined;

  const makerAgents = selectAgentsWithPriority(agents, "rule-maker", makerCount, makerPriorityAgent);
  if (makerAgents.length < makerCount) {
    throw new Error("Not enough eligible rule makers to form a committee.");
  }

  const excluded = new Set(makerAgents.map((agent) => normalizeAddress(agent.address)));
  const verifierPriorityAgent =
    excluded.has(normalizeAddress(priorityAgent.address)) || verifierCount <= 0 ? undefined : priorityAgent;
  const verifierAgents = selectAgentsWithPriority(
    agents,
    "rule-verifier",
    verifierCount,
    verifierPriorityAgent,
    excluded
  );
  if (verifierAgents.length < verifierCount) {
    throw new Error("Not enough eligible rule verifiers to form a committee.");
  }

  return {
    committee: {
      makers: makerAgents.map((agent) => agent.address),
      verifiers: verifierAgents.map((agent) => agent.address)
    },
    selectedAgents: [...makerAgents, ...verifierAgents]
  };
}

export function selectResolutionCommittee(
  agents: AgentProfile[],
  validatorCount = 3,
  auditorCount = 2,
  minValidCount = 2
): { committee: ResolutionCommittee; selectedAgents: AgentProfile[] } {
  const validatorAgents = selectAgents(agents, "validator", validatorCount);
  if (validatorAgents.length < validatorCount) {
    throw new Error("Not enough eligible validators to form a committee.");
  }

  const excluded = new Set(validatorAgents.map((agent) => agent.address));
  const auditorAgents = selectAgents(agents, "auditor", auditorCount, excluded);
  if (auditorAgents.length < auditorCount) {
    throw new Error("Not enough eligible auditors to form a committee.");
  }

  return {
    committee: {
      validators: validatorAgents.map((agent) => agent.address),
      auditors: auditorAgents.map((agent) => agent.address),
      minValidCount
    },
    selectedAgents: [...validatorAgents, ...auditorAgents]
  };
}

export function selectResolutionCommitteeWithPriority(
  agents: AgentProfile[],
  priorityAddress: string,
  validatorCount = 3,
  auditorCount = 2,
  minValidCount = 2
): { committee: ResolutionCommittee; selectedAgents: AgentProfile[] } {
  const priorityAgent = findPriorityAgent(agents, priorityAddress);
  const prefersValidatorRole = isEligible(priorityAgent, "validator") || !isEligible(priorityAgent, "auditor");
  const validatorPriorityAgent = prefersValidatorRole && validatorCount > 0 ? priorityAgent : undefined;

  const validatorAgents = selectAgentsWithPriority(
    agents,
    "validator",
    validatorCount,
    validatorPriorityAgent
  );
  if (validatorAgents.length < validatorCount) {
    throw new Error("Not enough eligible validators to form a committee.");
  }

  const excluded = new Set(validatorAgents.map((agent) => normalizeAddress(agent.address)));
  const auditorPriorityAgent =
    excluded.has(normalizeAddress(priorityAgent.address)) || auditorCount <= 0 ? undefined : priorityAgent;
  const auditorAgents = selectAgentsWithPriority(
    agents,
    "auditor",
    auditorCount,
    auditorPriorityAgent,
    excluded
  );
  if (auditorAgents.length < auditorCount) {
    throw new Error("Not enough eligible auditors to form a committee.");
  }

  return {
    committee: {
      validators: validatorAgents.map((agent) => agent.address),
      auditors: auditorAgents.map((agent) => agent.address),
      minValidCount
    },
    selectedAgents: [...validatorAgents, ...auditorAgents]
  };
}

export function isChallengeEligible(
  agentAddress: string,
  committee: ResolutionCommittee | undefined,
  isSetterOrSafetyCouncil = false
): boolean {
  if (isSetterOrSafetyCouncil) {
    return true;
  }

  if (!committee) {
    return true;
  }

  const normalizedAgent = normalizeAddress(agentAddress);
  return (
    !committee.validators.some((address) => normalizeAddress(address) === normalizedAgent) &&
    !committee.auditors.some((address) => normalizeAddress(address) === normalizedAgent)
  );
}
