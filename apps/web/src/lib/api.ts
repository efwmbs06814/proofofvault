'use client';

// ============================================
// Proof of Vault — API Client
// ============================================

import type {
  Vault, VaultFilter, VaultSortField, SortOrder,
  AgentProfile, AgentSubmission, CriteriaPackage,
  TaskBond, SlashRecord, RewardRecord, ResolutionData,
  CompensationPool, PaginatedResponse, ApiResponse,
  FinalResult, RuleChallenge,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return { data, success: true, timestamp: Date.now() };
  } catch (err) {
    return {
      data: null as unknown as T,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp: Date.now(),
    };
  }
}

// ============================================
// Vault API
// ============================================

export const vaultApi = {
  list: async (
    filter?: VaultFilter,
    sort?: { field: VaultSortField; order: SortOrder },
    page = 1,
    pageSize = 20,
  ): Promise<ApiResponse<PaginatedResponse<Vault>>> => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (filter?.status?.length) params.set('status', filter.status.join(','));
    if (filter?.setterAddress) params.set('setter', filter.setterAddress);
    if (filter?.searchQuery) params.set('q', filter.searchQuery);
    if (sort) params.set('sort', `${sort.field}:${sort.order}`);
    return request<PaginatedResponse<Vault>>(`/vaults?${params}`);
  },

  get: async (id: string): Promise<ApiResponse<Vault>> =>
    request<Vault>(`/vaults/${id}`),

  create: async (payload: Partial<Vault>): Promise<ApiResponse<Vault>> =>
    request<Vault>('/vaults', { method: 'POST', body: JSON.stringify(payload) }),

  updateStatus: async (id: string, status: string): Promise<ApiResponse<Vault>> =>
    request<Vault>(`/vaults/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  submitCriteria: async (vaultId: string, pkg: Partial<CriteriaPackage>): Promise<ApiResponse<CriteriaPackage>> =>
    request<CriteriaPackage>(`/vaults/${vaultId}/criteria`, { method: 'POST', body: JSON.stringify(pkg) }),

  getCriteria: async (vaultId: string): Promise<ApiResponse<CriteriaPackage>> =>
    request<CriteriaPackage>(`/vaults/${vaultId}/criteria`),

  confirmCriteria: async (vaultId: string): Promise<ApiResponse<Vault>> =>
    request<Vault>(`/vaults/${vaultId}/criteria/confirm`, { method: 'POST' }),

  fundVault: async (vaultId: string): Promise<ApiResponse<Vault>> =>
    request<Vault>(`/vaults/${vaultId}/fund`, { method: 'POST' }),

  getResolution: async (vaultId: string): Promise<ApiResponse<ResolutionData>> =>
    request<ResolutionData>(`/vaults/${vaultId}/resolution`),
};

// ============================================
// Agent API
// ============================================

export const agentApi = {
  list: async (page = 1, pageSize = 20): Promise<ApiResponse<PaginatedResponse<AgentProfile>>> => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return request<PaginatedResponse<AgentProfile>>(`/agents?${params}`);
  },

  get: async (address: string): Promise<ApiResponse<AgentProfile>> =>
    request<AgentProfile>(`/agents/${address}`),

  register: async (payload: Partial<AgentProfile>): Promise<ApiResponse<AgentProfile>> =>
    request<AgentProfile>('/agents', { method: 'POST', body: JSON.stringify(payload) }),

  getSubmissions: async (address: string): Promise<ApiResponse<AgentSubmission[]>> =>
    request<AgentSubmission[]>(`/agents/${address}/submissions`),

  getBonds: async (address: string): Promise<ApiResponse<TaskBond[]>> =>
    request<TaskBond[]>(`/agents/${address}/bonds`),

  getSlashHistory: async (address: string): Promise<ApiResponse<SlashRecord[]>> =>
    request<SlashRecord[]>(`/agents/${address}/slashes`),

  getRewards: async (address: string): Promise<ApiResponse<RewardRecord[]>> =>
    request<RewardRecord[]>(`/agents/${address}/rewards`),
};

// ============================================
// Submission API
// ============================================

export const submissionApi = {
  // Rule Making
  submitRuleDraft: async (vaultId: string, payload: Partial<CriteriaPackage>): Promise<ApiResponse<AgentSubmission>> =>
    request<AgentSubmission>(`/vaults/${vaultId}/rule-draft`, { method: 'POST', body: JSON.stringify(payload) }),

  submitChallenge: async (vaultId: string, challenge: Partial<RuleChallenge>): Promise<ApiResponse<RuleChallenge>> =>
    request<RuleChallenge>(`/vaults/${vaultId}/challenge`, { method: 'POST', body: JSON.stringify(challenge) }),

  resolveChallenge: async (vaultId: string, challengeId: string, resolution: string): Promise<ApiResponse<void>> =>
    request<void>(`/vaults/${vaultId}/challenge/${challengeId}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) }),

  // Resolution — Commit Phase
  commit: async (vaultId: string, commitHash: string): Promise<ApiResponse<AgentSubmission>> =>
    request<AgentSubmission>(`/vaults/${vaultId}/commit`, { method: 'POST', body: JSON.stringify({ commitHash }) }),

  // Resolution — Reveal Phase
  reveal: async (vaultId: string, payload: {
    salt: string;
    result: FinalResult;
    reasoning: string;
    dataSources: string[];
    calculation: string;
    proofUri?: string;
  }): Promise<ApiResponse<AgentSubmission>> =>
    request<AgentSubmission>(`/vaults/${vaultId}/reveal`, { method: 'POST', body: JSON.stringify(payload) }),

  // Get submissions for a vault
  list: async (vaultId: string): Promise<ApiResponse<AgentSubmission[]>> =>
    request<AgentSubmission[]>(`/vaults/${vaultId}/submissions`),
};

// ============================================
// Pool API
// ============================================

export const poolApi = {
  get: async (): Promise<ApiResponse<CompensationPool>> =>
    request<CompensationPool>('/pool'),

  getContributors: async (): Promise<ApiResponse<{ vaultId: string; amount: number; contributedAt: number }[]>> =>
    request('/pool/contributors'),
};
