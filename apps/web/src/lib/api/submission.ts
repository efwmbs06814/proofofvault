import type { AgentSubmission, VaultDetail as WorkflowVaultDetail } from "@proof-of-vault/shared-types";

import { get, post, type ApiResponse } from "./client";
import { ensureAgentSession } from "./agent-session";
import { API_ENDPOINTS } from "./config";
import { storePayload } from "./runtime";

export type { ApiResponse };

export interface CriteriaResult {
  criterion: string;
  passed: boolean;
  reason: string;
}

export interface SubmitCriteriaRequest {
  agentAddress: string;
  vaultId: string;
  results: CriteriaResult[];
  round?: number;
  payloadURI?: string;
}

export interface SubmitResolutionRequest {
  agentAddress: string;
  vaultId: string;
  result: "TRUE" | "FALSE" | "INVALID";
  reasoning: string;
  proofUri?: string;
  round?: number;
  payloadURI?: string;
}

export interface SubmitResolutionCommitRequest {
  agentAddress: string;
  vaultId: string;
  result: "TRUE" | "FALSE" | "INVALID";
  proofHash: `0x${string}`;
  salt: `0x${string}`;
  round?: number;
  payloadURI?: string;
}

export interface SubmitResolutionRevealRequest extends SubmitResolutionRequest {
  proofHash: `0x${string}`;
  salt: `0x${string}`;
}

export interface ResolutionProofHashInput {
  agentAddress: string;
  vaultId: string;
  result: "TRUE" | "FALSE" | "INVALID";
  reasoning: string;
  proofUri?: string;
  round?: number;
}

export interface FinalizeResolutionResponse {
  ready: boolean;
  reopened: boolean;
  blockers: string[];
  vault: WorkflowVaultDetail;
}

export interface RuleDraft {
  id: string;
  vaultId: string;
  eventTitle: string;
  observationObject: string;
  metricType: string;
  threshold: string;
  observationTime: string;
  primaryDataSource: string;
  fallbackDataSource?: string;
  passConditions: string[];
  failConditions: string[];
  invalidConditions: string[];
  proofDataFormat?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleChallenge {
  id: string;
  vaultId: string;
  criteriaPackageId: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  title: string;
  description: string;
  suggestion?: string;
  verifierAddress: string;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export interface RuleChallengeRequest {
  severity: "Low" | "Medium" | "High" | "Critical";
  title: string;
  description: string;
  suggestion?: string;
}

export interface ValidatorSubmission {
  id: string;
  vaultId: string;
  validatorId: string;
  result: string;
  reason: string;
  proofHash?: string;
  dataSources?: string[];
  calculations?: string;
  phase?: string;
  status?: string;
}

function toVaultNumber(vaultId: string): number {
  return Number.parseInt(vaultId.replace(/\D+/g, ""), 10) || 1;
}

async function resolvePayloadUri(
  kind: string,
  vaultId: string,
  providedURI: string | undefined,
  payload: unknown,
  options?: {
    walletAddress?: string;
    sessionToken?: string;
  }
): Promise<string> {
  if (providedURI?.trim()) {
    return providedURI.trim();
  }

  return (
    await storePayload({
      vaultId,
      kind,
      payload,
      walletAddress: options?.walletAddress,
      sessionToken: options?.sessionToken
    })
  ).payloadURI;
}

export function createBytes32(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCanonicalJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForCanonicalJson(entry)])
    );
  }

  return value;
}

function buildResolutionRevealPayload(data: ResolutionProofHashInput) {
  const proofUri = data.proofUri?.trim();

  return {
    vaultId: toVaultNumber(data.vaultId),
    round: data.round ?? 1,
    result: data.result,
    confidenceScore: 0.9,
    sources: proofUri ? [{ provider: "web-ui", uri: proofUri, metadata: {} }] : [],
    reasoning: data.reasoning.trim(),
    submittedByAgent: data.agentAddress,
    version: 1
  };
}

export async function createResolutionProofHash(data: ResolutionProofHashInput): Promise<`0x${string}`> {
  const canonicalPayload = JSON.stringify(normalizeForCanonicalJson(buildResolutionRevealPayload(data)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPayload));
  return `0x${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function upperSeverity(value: RuleChallengeRequest["severity"]): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  return value.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

function titleSeverity(value: string): RuleChallenge["severity"] {
  switch (value.toUpperCase()) {
    case "LOW":
      return "Low";
    case "HIGH":
      return "High";
    case "CRITICAL":
      return "Critical";
    case "MEDIUM":
    default:
      return "Medium";
  }
}

function issueTypeFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "web_rule_challenge";
}

function latestSubmission<T extends AgentSubmission["kind"]>(
  submissions: AgentSubmission[],
  kind: T,
  round: number
): Extract<AgentSubmission, { kind: T }> | undefined {
  return submissions
    .filter(
      (submission): submission is Extract<AgentSubmission, { kind: T }> =>
        submission.kind === kind && submission.round === round
    )
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0];
}

export async function getWorkflowVault(vaultId: string): Promise<WorkflowVaultDetail> {
  const response = await get<ApiResponse<WorkflowVaultDetail>>(API_ENDPOINTS.vault(vaultId));
  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to fetch workflow vault.");
  }

  return response.data;
}

export async function submitCriteria(data: SubmitCriteriaRequest): Promise<void> {
  const vaultNumber = toVaultNumber(data.vaultId);
  const round = data.round ?? 1;
  const sessionToken = await ensureAgentSession(data.agentAddress);
  const payload = {
    vaultId: vaultNumber,
    round,
    template: "web-ui-criteria-review",
    statement: data.results.map((result) => `${result.criterion}: ${result.reason}`).join("; ") || "Criteria review submitted from the web UI.",
    inputs: {
      criteriaResults: data.results
    },
    sources: [],
    version: 1,
  };
  await post<ApiResponse<unknown>>(API_ENDPOINTS.submissionsCriteria, {
    kind: "rule_draft",
    vaultId: vaultNumber,
    round,
    agentAddress: data.agentAddress,
    payloadURI: await resolvePayloadUri("rule-draft", data.vaultId, data.payloadURI, payload, {
      walletAddress: data.agentAddress,
      sessionToken
    }),
    payload
  }, {
    headers: {
      Authorization: `Bearer ${sessionToken}`
    }
  });
}

export async function submitResolution(data: SubmitResolutionRequest): Promise<void> {
  const vaultNumber = toVaultNumber(data.vaultId);
  const round = data.round ?? 1;
  const salt = createBytes32();
  const sessionToken = await ensureAgentSession(data.agentAddress);
  const payload = {
    vaultId: vaultNumber,
    round,
    result: data.result,
    confidenceScore: 0.5,
    sources: data.proofUri ? [{ provider: "web-ui", uri: data.proofUri, metadata: {} }] : [],
    reasoning: data.reasoning,
    submittedByAgent: data.agentAddress,
    version: 1
  };
  await post<ApiResponse<unknown>>(API_ENDPOINTS.submissionsResolution, {
    kind: "resolution_reveal",
    vaultId: vaultNumber,
    round,
    agentAddress: data.agentAddress,
    payloadURI: await resolvePayloadUri("resolution-reveal", data.vaultId, data.payloadURI, payload, {
      walletAddress: data.agentAddress,
      sessionToken
    }),
    salt,
    payload
  }, {
    headers: {
      Authorization: `Bearer ${sessionToken}`
    }
  });
}

export async function submitResolutionCommit(data: SubmitResolutionCommitRequest): Promise<AgentSubmission> {
  const vaultNumber = toVaultNumber(data.vaultId);
  const round = data.round ?? 1;
  const sessionToken = await ensureAgentSession(data.agentAddress);
  const payload = {
    vaultId: vaultNumber,
    round,
    outcome: data.result,
    proofHash: data.proofHash,
    salt: data.salt,
    submittedByAgent: data.agentAddress,
    version: 1
  };
  const response = await post<ApiResponse<AgentSubmission>>(API_ENDPOINTS.submissionsResolution, {
    kind: "resolution_commit",
    vaultId: vaultNumber,
    round,
    agentAddress: data.agentAddress,
    payloadURI: await resolvePayloadUri("resolution-commit", data.vaultId, data.payloadURI, payload, {
      walletAddress: data.agentAddress,
      sessionToken
    }),
    payload
  }, {
    headers: {
      Authorization: `Bearer ${sessionToken}`
    }
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to submit resolution commit.");
  }

  return response.data;
}

export async function submitResolutionReveal(data: SubmitResolutionRevealRequest): Promise<AgentSubmission> {
  const vaultNumber = toVaultNumber(data.vaultId);
  const round = data.round ?? 1;
  const sessionToken = await ensureAgentSession(data.agentAddress);
  const payload = buildResolutionRevealPayload(data);
  const response = await post<ApiResponse<AgentSubmission>>(API_ENDPOINTS.submissionsResolution, {
    kind: "resolution_reveal",
    vaultId: vaultNumber,
    round,
    agentAddress: data.agentAddress,
    payloadURI: await resolvePayloadUri("resolution-reveal", data.vaultId, data.payloadURI, payload, {
      walletAddress: data.agentAddress,
      sessionToken
    }),
    proofHash: data.proofHash,
    salt: data.salt,
    payload
  }, {
    headers: {
      Authorization: `Bearer ${sessionToken}`
    }
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to submit resolution reveal.");
  }

  return response.data;
}

export async function finalizeSubmission(vaultId: string): Promise<FinalizeResolutionResponse> {
  return finalizeVaultResolution(vaultId);
}

export async function finalizeVaultResolution(
  vaultId: string,
  options?: {
    finalizerAddress?: string;
    reopenOnInsufficientEvidence?: boolean;
  }
): Promise<FinalizeResolutionResponse> {
  const response = await post<ApiResponse<FinalizeResolutionResponse>>(`/vaults/${vaultId}/finality`, {
    finalizerAddress: options?.finalizerAddress,
    reopenOnInsufficientEvidence: options?.reopenOnInsufficientEvidence ?? false,
    challengeResolutions: []
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to finalize vault resolution.");
  }

  return response.data;
}

export async function slashSubmission(submissionId: string, reason: string): Promise<void> {
  void submissionId;
  void reason;
}

export async function rewardSubmission(submissionId: string, amount: string): Promise<void> {
  void submissionId;
  void amount;
}

export async function getRuleDraft(vaultId: string): Promise<RuleDraft | null> {
  const vault = await getWorkflowVault(vaultId);
  const draft = latestSubmission(vault.submissions, "rule_draft", vault.ruleRound);
  if (!draft) {
    return null;
  }

  const inputs = draft.payload.inputs ?? {};
  const threshold = String(inputs.thresholdUsd ?? inputs.threshold ?? "Not specified in rule draft");
  const tokenAddress = String(inputs.tokenAddress ?? vault.collateralToken ?? "Not specified in rule draft");
  const observationTime = String(inputs.observationTime ?? vault.settlementTime ?? draft.createdAt ?? vault.updatedAt);

  return {
    id: draft.id ?? `draft-${vaultId}`,
    vaultId,
    eventTitle: vault.statement ?? `Vault ${vault.id}`,
    observationObject: tokenAddress,
    metricType: draft.payload.template,
    threshold,
    observationTime: Number.isFinite(Number(observationTime))
      ? new Date(Number(observationTime)).toISOString()
      : observationTime,
    primaryDataSource: draft.payload.sources[0]?.provider ?? "Not specified in rule draft",
    fallbackDataSource: "Not specified in rule draft",
    passConditions: [draft.payload.statement],
    failConditions: ["See rule draft payload for explicit fail conditions."],
    invalidConditions: ["See rule draft payload for explicit invalid conditions."],
    version: draft.payload.version,
    createdAt: new Date(draft.createdAt ?? vault.createdAt).toISOString(),
    updatedAt: new Date(vault.updatedAt).toISOString()
  };
}

export async function getRuleChallenges(vaultId: string): Promise<RuleChallenge[]> {
  const vault = await getWorkflowVault(vaultId);
  return vault.submissions
    .filter(
      (submission): submission is Extract<AgentSubmission, { kind: "rule_issue" }> =>
        submission.kind === "rule_issue" && submission.round === vault.ruleRound
    )
    .map((submission) => ({
      id: submission.id ?? `${submission.kind}-${submission.payloadHash ?? submission.createdAt}`,
      vaultId,
      criteriaPackageId: vault.criteriaHash ?? `criteria-${vaultId}`,
      severity: titleSeverity(submission.payload.severity),
      title: submission.payload.issueType,
      description: submission.payload.notes,
      verifierAddress: submission.agentAddress,
      createdAt: new Date(submission.createdAt ?? vault.updatedAt).toISOString(),
      status: "pending"
    }));
}

export async function submitRuleChallenge(
  vaultId: string,
  challenge: RuleChallengeRequest,
  verifierAddress: string
): Promise<RuleChallenge> {
  const vault = await getWorkflowVault(vaultId);
  const isVerifier = vault.ruleCommittee?.verifiers.some(
    (address) => address.toLowerCase() === verifierAddress.toLowerCase()
  );
  if (!isVerifier) {
    throw new Error("Connected wallet must be a current rule verifier before submitting a rule challenge.");
  }

  const round = vault.ruleRound || 1;
  const sessionToken = await ensureAgentSession(verifierAddress);
  const payload = {
    vaultId: toVaultNumber(vaultId),
    round,
    severity: upperSeverity(challenge.severity),
    issueType: issueTypeFromTitle(challenge.title),
    notes: [challenge.description, challenge.suggestion].filter(Boolean).join("\n\nSuggested fix: "),
    version: 1
  };
  const response = await post<ApiResponse<Extract<AgentSubmission, { kind: "rule_issue" }>>>(API_ENDPOINTS.submissionsCriteria, {
    kind: "rule_issue",
    vaultId: toVaultNumber(vaultId),
    round,
    agentAddress: verifierAddress,
    payloadURI: await resolvePayloadUri("rule-issue", vaultId, undefined, payload, {
      walletAddress: verifierAddress,
      sessionToken
    }),
    payload
  }, {
    headers: {
      Authorization: `Bearer ${sessionToken}`
    }
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to submit rule challenge.");
  }

  return {
    id: response.data.id ?? `challenge-${Date.now()}`,
    vaultId,
    criteriaPackageId: vault.criteriaHash ?? `criteria-${vaultId}`,
    severity: challenge.severity,
    title: challenge.title,
    description: challenge.description,
    suggestion: challenge.suggestion,
    verifierAddress,
    createdAt: new Date(response.data.createdAt ?? Date.now()).toISOString(),
    status: "pending"
  };
}
