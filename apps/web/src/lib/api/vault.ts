import type { VaultDetail as WorkflowVaultDetail, VaultSummary as WorkflowVaultSummary } from "@proof-of-vault/shared-types";

import { get, post, put, type ApiResponse, type PaginatedResponse } from "./client";
import { API_ENDPOINTS } from "./config";

export type { ApiResponse, PaginatedResponse };

export type VaultStatus =
  | "Draft"
  | "PendingReview"
  | "Active"
  | "Resolving"
  | "ResolvedTrue"
  | "ResolvedFalse"
  | "ResolvedInvalid";

export interface VaultSummary {
  id: string;
  title: string;
  description?: string;
  status: VaultStatus;
  stakeAmount: string;
  collateralDecimals?: number;
  agentCount: number;
  stakedCount?: number;
  criteriaCount: number;
  createdAt: string;
  transactionHash?: string;
}

export interface CriteriaResult {
  criterion: string;
  passed: boolean;
  reason: string;
}

export interface VaultAgent {
  id: string;
  name: string;
  walletAddress: string;
  status: string;
  stakeAmount: string;
  confidence: number;
  criteriaResults?: CriteriaResult[];
}

export interface ResolutionProof {
  vaultId: string;
  content: string;
  submittedAt: string;
  submitter: string;
}

export interface FinalResolution {
  result: "TRUE" | "FALSE" | "INVALID";
  reason: string;
  resolvedAt: string;
  resolver?: string;
}

export interface VaultDetail extends VaultSummary {
  setter: string;
  criteria: string[];
  agents: VaultAgent[];
  proof?: ResolutionProof;
  resolution?: FinalResolution;
  escrowAddress?: string;
  finalizedAt?: string;
}

export interface CreateVaultRequest {
  title: string;
  description?: string;
  stakeAmount: string;
  agentCount?: number;
  criteria: string[];
  setter: string;
  mode?: "draft" | "register_onchain";
  chainId?: number;
  externalVaultId?: number;
  collateralToken?: string;
  collateralDecimals?: number;
  grossCollateralAmount?: string;
  settlementTime?: number;
  metadataURI?: string;
  transactionHash?: `0x${string}`;
}

export interface ListVaultsQuery {
  status?: VaultStatus;
  setter?: string;
  page?: number;
  pageSize?: number;
}

function normalizeVaultStatus(status: string | undefined): VaultStatus {
  switch (status) {
    case "Draft":
    case "DraftRequest":
    case "RuleAuction":
    case "RuleDrafting":
    case "UserRuleReview":
    case "PendingFunding":
      return "PendingReview";
    case "Active":
    case "ResolutionAuction":
    case "CommitPhase":
    case "RevealPhase":
    case "AuditPhase":
    case "PublicChallenge":
      return "Active";
    case "Resolving":
      return "Resolving";
    case "ResolvedTrue":
      return "ResolvedTrue";
    case "ResolvedFalse":
      return "ResolvedFalse";
    case "ResolvedInvalid":
    case "Cancelled":
      return "ResolvedInvalid";
    default:
      return "Draft";
  }
}

function formatTokenAmount(value: string | undefined, decimals = 18): string {
  if (!value) {
    return "0";
  }

  try {
    const parsed = BigInt(value);
    const baseUnits = BigInt(decimals === 0 ? "1" : `1${"0".repeat(decimals)}`);
    const whole = parsed / baseUnits;
    const fraction = parsed % baseUnits;
    if (decimals === 0 || fraction === BigInt(0)) {
      return whole.toString();
    }

    const fractionText = fraction.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
    return fractionText ? `${whole}.${fractionText}` : whole.toString();
  } catch {
    return value;
  }
}

function statementToCriteria(statement: string | undefined): string[] {
  if (!statement) {
    return ["Criteria will be finalized by the rule committee."];
  }

  return statement
    .split(/\r?\n|[.;]\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function firstTraceTxHash(traces: Array<{ txHash?: string }> | undefined): string | undefined {
  return traces?.find((trace) => Boolean(trace.txHash))?.txHash;
}

function activeCommitteeAddresses(vault: WorkflowVaultSummary): Set<string> {
  const resolutionAddresses = [
    ...(vault.resolutionCommittee?.validators ?? []),
    ...(vault.resolutionCommittee?.auditors ?? [])
  ];
  if (resolutionAddresses.length > 0) {
    return new Set(resolutionAddresses.map((address) => address.toLowerCase()));
  }

  const ruleAddresses = [
    ...(vault.ruleCommittee?.makers ?? []),
    ...(vault.ruleCommittee?.verifiers ?? [])
  ];
  return new Set(ruleAddresses.map((address) => address.toLowerCase()));
}

function mapWorkflowSummary(vault: WorkflowVaultSummary): VaultSummary {
  const criteria = statementToCriteria(vault.statement);
  const agentCount = activeCommitteeAddresses(vault).size;

  return {
    id: vault.id,
    title: vault.statement || `Vault ${vault.id}`,
    description: vault.metadataURI,
    status: normalizeVaultStatus(vault.status),
    stakeAmount: formatTokenAmount(vault.grossCollateralAmount, vault.collateralDecimals ?? 18),
    collateralDecimals: vault.collateralDecimals,
    agentCount,
    stakedCount: agentCount,
    criteriaCount: criteria.length,
    createdAt: new Date(vault.createdAt).toISOString(),
    transactionHash: firstTraceTxHash(vault.traces)
  };
}

function mapWorkflowAgents(vault: WorkflowVaultDetail): VaultAgent[] {
  const committeeAddresses = activeCommitteeAddresses(vault);
  const relevantAgents =
    committeeAddresses.size > 0
      ? vault.agentProfiles.filter((agent) =>
          committeeAddresses.has((agent.walletAddress ?? agent.address).toLowerCase())
        )
      : vault.agentProfiles;

  return relevantAgents.slice(0, 8).map((agent, index) => ({
    id: `${vault.id}-agent-${index + 1}`,
    name: agent.label,
    walletAddress: agent.walletAddress ?? agent.address,
    status: agent.status,
    stakeAmount: formatTokenAmount(agent.activeStake),
    confidence: agent.reputationScore / 100
  }));
}

function mapResolutionProof(vault: WorkflowVaultDetail): ResolutionProof | undefined {
  const resolutionReveals = [...vault.submissions]
    .filter(
      (submission): submission is Extract<typeof vault.submissions[number], { kind: "resolution_reveal" }> =>
        submission.kind === "resolution_reveal" && submission.round === vault.resolutionRound
    );

  const resolutionReveal = [...resolutionReveals]
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    .find((submission) =>
      vault.finalResolution?.result ? submission.payload.result === vault.finalResolution.result : true
    ) ?? resolutionReveals.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0];

  if (!resolutionReveal) {
    return undefined;
  }

  const content = [resolutionReveal.payload.reasoning, resolutionReveal.payloadURI]
    .filter(Boolean)
    .join("\n\n");

  return {
    vaultId: vault.id,
    content,
    submittedAt: new Date(resolutionReveal.createdAt ?? vault.updatedAt).toISOString(),
    submitter: resolutionReveal.agentAddress
  };
}

function mapWorkflowDetail(vault: WorkflowVaultDetail): VaultDetail {
  const criteria = statementToCriteria(vault.statement);
  const summary = mapWorkflowSummary(vault);
  const result = vault.finalResolution?.result;
  const agents = mapWorkflowAgents(vault);

  return {
    ...summary,
    setter: vault.setterAddress ?? "0x0000000000000000000000000000000000000000",
    criteria,
    agents,
    agentCount: summary.agentCount || agents.length,
    stakedCount: agents.length,
    proof: mapResolutionProof(vault),
    resolution:
      result
        ? {
            result,
            reason: vault.finalResolution?.reason ?? "Resolution finalized.",
            resolvedAt: new Date(vault.finalResolution?.finalizedAt ?? vault.updatedAt).toISOString(),
            resolver: vault.resolutionCommittee?.orchestratorAddress
          }
        : undefined,
    escrowAddress: undefined,
    finalizedAt: vault.finalResolution ? new Date(vault.finalResolution.finalizedAt).toISOString() : undefined
  };
}

function isWorkflowVaultSummary(value: unknown): value is WorkflowVaultSummary {
  return Boolean(
    value &&
      typeof value === "object" &&
      "metadataURI" in value &&
      "grossCollateralAmount" in value &&
      "createdAt" in value
  );
}

function isWorkflowVaultDetail(value: unknown): value is WorkflowVaultDetail {
  return isWorkflowVaultSummary(value) && typeof value === "object" && "agentProfiles" in value && "proofs" in value;
}

function createPaginatedResponse(items: VaultSummary[], page = 1, pageSize = 20): PaginatedResponse<VaultSummary> {
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    items: pageItems,
    total: items.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    hasMore: start + pageSize < items.length
  };
}

export async function getVaults(query?: ListVaultsQuery): Promise<PaginatedResponse<VaultSummary>> {
  const response = await get<ApiResponse<PaginatedResponse<WorkflowVaultSummary> | WorkflowVaultSummary[]>>(
    API_ENDPOINTS.vaults,
    query as Record<string, string | number | undefined>
  );

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to fetch vaults");
  }

  const payload = response.data;
  const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
  const mappedItems = items.filter(isWorkflowVaultSummary).map(mapWorkflowSummary);

  const page = query?.page ?? (Array.isArray(payload) ? 1 : payload.page);
  const pageSize = query?.pageSize ?? (Array.isArray(payload) ? 20 : payload.pageSize);
  return createPaginatedResponse(mappedItems, page, pageSize);
}

export async function getVault(id: string): Promise<VaultDetail> {
  const response = await get<ApiResponse<WorkflowVaultDetail | VaultDetail>>(API_ENDPOINTS.vault(id));

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to fetch vault");
  }

  if (isWorkflowVaultDetail(response.data)) {
    return mapWorkflowDetail(response.data);
  }

  return response.data as VaultDetail;
}

export async function createVault(data: CreateVaultRequest): Promise<VaultDetail> {
  const response = await post<ApiResponse<WorkflowVaultDetail | WorkflowVaultSummary>>(API_ENDPOINTS.vaults, {
    mode: data.mode ?? (data.externalVaultId !== undefined ? "register_onchain" : "draft"),
    externalVaultId: data.externalVaultId,
    chainId: data.chainId ?? 196,
    setterAddress: data.setter,
    statement: [data.title, data.description, ...data.criteria].filter(Boolean).join(". "),
    metadataURI: data.metadataURI ?? "ipfs://missing-vault-metadata",
    collateralToken: data.collateralToken,
    collateralDecimals: data.collateralDecimals,
    grossCollateralAmount: data.grossCollateralAmount ?? data.stakeAmount,
    settlementTime: data.settlementTime,
    initialTrace: data.transactionHash
      ? {
          action: "createVaultRequest",
          actorAddress: data.setter,
          executedByWallet: data.setter,
          txHash: data.transactionHash,
          chainId: data.chainId ?? 196,
          sourceProvider: "browser-wallet",
          payloadURI: data.metadataURI,
          recordedAt: Date.now()
        }
      : undefined
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to create vault");
  }

  if (isWorkflowVaultDetail(response.data)) {
    return mapWorkflowDetail(response.data);
  }

  if (isWorkflowVaultSummary(response.data)) {
    return {
      ...mapWorkflowSummary(response.data),
      setter: data.setter,
      criteria: data.criteria,
      agents: []
    };
  }

  throw new Error("Unexpected vault payload returned by the API.");
}

export async function updateVaultStatus(id: string, status: VaultStatus, transactionHash?: string): Promise<VaultDetail> {
  await put<ApiResponse<unknown>>(API_ENDPOINTS.vaultStatus(id), { status, transactionHash });
  return getVault(id);
}

export async function depositToVault(id: string, transactionHash?: string): Promise<VaultDetail> {
  await post<ApiResponse<unknown>>(API_ENDPOINTS.vaultDeposit(id), { transactionHash });
  return getVault(id);
}

export async function registerVaultTx(id: string, action: "acceptRuleSetAndFund" | "rejectRuleSet" | "finalizeV2Vault", txHash: `0x${string}`): Promise<VaultDetail> {
  const response = await post<ApiResponse<WorkflowVaultDetail>>(API_ENDPOINTS.vaultRegisterTx(id), { action, txHash });
  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to register on-chain transaction.");
  }

  return mapWorkflowDetail(response.data);
}

export async function getVaultProof(id: string): Promise<ResolutionProof | null> {
  const detail = await getVault(id);
  return detail.proof ?? null;
}

export async function submitProof(id: string, proof: string, submitter: string): Promise<ResolutionProof> {
  await post<ApiResponse<unknown>>(API_ENDPOINTS.vaultProof(id), { proof, submitter });

  return {
    vaultId: id,
    content: proof,
    submittedAt: new Date().toISOString(),
    submitter
  };
}
