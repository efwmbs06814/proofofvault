import type { JudgeListEntry } from "@proof-of-vault/shared-types";

import { get, post, type ApiResponse } from "./client";
import { ensureAgentSession } from "./agent-session";
import { API_ENDPOINTS } from "./config";
import { storePayload } from "./runtime";

export type { ApiResponse };

export type AgentStatus = "idle" | "reviewing" | "staking" | "slash";
export type AgentTaskStatus = "pending" | "reviewing" | "approved" | "rejected";
export type AgentRole = "maker" | "verifier" | "validator" | "auditor";

export interface CriteriaResult {
  criterion: string;
  passed: boolean;
  reason: string;
}

export interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  totalStake: string;
  availableBalance: string;
  slashCount: number;
  successCount: number;
  reputation: number;
  status: AgentStatus;
  registeredAt: string;
  lastActiveAt: string;
}

export interface AgentTask {
  id: string;
  vaultId: string;
  vaultTitle: string;
  status: AgentTaskStatus;
  confidence: number;
  criteriaResults?: CriteriaResult[];
  receivedAt: string;
  completedAt?: string;
  proof?: string;
  role?: string;
  bond?: string;
  deadline?: string;
}

export interface AgentDashboard {
  agent: Agent;
  tasks: AgentTask[];
  stats: {
    pendingTasks: number;
    completedTasks: number;
    totalEarnings: string;
  };
}

interface AgentWorkflowTaskApi {
  id: string;
  vaultId: string;
  stage: string;
  assigneeType: string;
  assigneeAddress?: string;
  title: string;
  status: "pending" | "completed" | "blocked";
  metadata: Record<string, unknown>;
  vault: {
    id: string;
    externalVaultId?: number;
    status: string;
    statement?: string;
    metadataURI?: string;
    ruleRound?: number;
    resolutionRound?: number;
  };
}

interface AgentTaskFeedResponse {
  agentAddress: string;
  tasks: AgentWorkflowTaskApi[];
  byRole: Record<string, AgentWorkflowTaskApi[]>;
}

export interface RegisterAgentRequest {
  name: string;
  walletAddress: string;
  initialStake: string;
}

export interface StakeRequest {
  vaultId: string;
  amount: string;
}

export interface TaskHistoryEntry {
  id: string;
  vaultId: string;
  vaultTitle: string;
  role: AgentRole;
  result: "TRUE" | "FALSE" | "INVALID" | null;
  reward: string;
  slashAmount: string;
  completedAt: string;
  confidence: number;
}

export interface SlashRecord {
  id: string;
  vaultId: string;
  agentAddress: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  reason: string;
  slashAmount: string;
  slashPercent: number;
  slashedAt: string;
}

export interface ReputationHistoryPoint {
  timestamp: string;
  reputation: number;
  totalTasks: number;
  successRate: number;
}

function mapJudgeListEntry(entry: JudgeListEntry): Agent {
  return {
    id: entry.walletAddress,
    name: entry.agentLabel,
    walletAddress: entry.walletAddress,
    totalStake: entry.activeStake,
    availableBalance: entry.activeStake,
    slashCount: 0,
    successCount: 0,
    reputation: entry.reputationScore,
    status: entry.status === "available" ? "idle" : "reviewing",
    registeredAt: new Date(entry.listedAt).toISOString(),
    lastActiveAt: new Date(entry.listedAt).toISOString()
  };
}

function mapTaskStatus(status: AgentWorkflowTaskApi["status"]): AgentTaskStatus {
  if (status === "completed") {
    return "approved";
  }

  if (status === "blocked") {
    return "rejected";
  }

  return "pending";
}

function inferTaskRole(task: AgentWorkflowTaskApi): string | undefined {
  const explicitRole = typeof task.metadata.role === "string" ? task.metadata.role : undefined;
  if (explicitRole) {
    return explicitRole;
  }

  if (task.stage === "rule_committee_registration") {
    return "CommitteeBootstrap";
  }

  if (task.stage === "resolution_committee_registration") {
    return "CommitteeBootstrap";
  }

  return undefined;
}

function mapWorkflowTask(task: AgentWorkflowTaskApi): AgentTask {
  const deadline =
    typeof task.metadata.deadlineAt === "number"
      ? new Date(task.metadata.deadlineAt).toISOString()
      : undefined;

  return {
    id: task.id,
    vaultId: task.vaultId,
    vaultTitle: task.vault.statement || `Vault ${task.vault.id}`,
    status: mapTaskStatus(task.status),
    confidence: 0,
    receivedAt: new Date().toISOString(),
    role: inferTaskRole(task),
    deadline
  };
}

async function fetchAgentTaskFeed(walletAddress: string): Promise<AgentTaskFeedResponse> {
  const sessionToken = await ensureAgentSession(walletAddress);
  const response = await get<ApiResponse<AgentTaskFeedResponse>>(API_ENDPOINTS.agentTasks(walletAddress), undefined, {
    headers: {
      Authorization: `Bearer ${sessionToken}`
    }
  });
  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to fetch live agent tasks.");
  }

  return response.data;
}

async function findAgent(idOrAddress: string): Promise<Agent | undefined> {
  const normalized = idOrAddress.toLowerCase();
  return (await getAgents()).find(
    (agent) => agent.id.toLowerCase() === normalized || agent.walletAddress.toLowerCase() === normalized
  );
}

export async function getAgents(): Promise<Agent[]> {
  const response = await get<ApiResponse<JudgeListEntry[]>>(API_ENDPOINTS.judgeList);
  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to fetch live judge list.");
  }

  return response.data.map(mapJudgeListEntry);
}

export async function getAgent(id: string): Promise<Agent & { tasks: AgentTask[] }> {
  const agent = await findAgent(id);
  if (!agent) {
    throw new Error("Agent is not on the live judge list.");
  }

  const taskFeed = await fetchAgentTaskFeed(agent.walletAddress);
  return {
    ...agent,
    tasks: taskFeed.tasks.map(mapWorkflowTask)
  };
}

export async function getAgentDashboard(id: string): Promise<AgentDashboard> {
  const agent = await findAgent(id);
  if (!agent) {
    throw new Error("Connect or register a live judge-listed agent wallet first.");
  }

  const taskFeed = await fetchAgentTaskFeed(agent.walletAddress);
  const tasks = taskFeed.tasks.map(mapWorkflowTask);
  return {
    agent,
    tasks,
    stats: {
      pendingTasks: tasks.filter((task) => task.status === "pending").length,
      completedTasks: tasks.filter((task) => task.status === "approved").length,
      totalEarnings: "0"
    }
  };
}

export async function getAgentTasks(id: string): Promise<AgentTask[]> {
  const dashboard = await getAgentDashboard(id);
  return dashboard.tasks;
}

export async function bootstrapCommittee(
  agentAddress: string,
  vaultId: string,
  phase?: "rule" | "resolution"
): Promise<{ vaultId: string; status: string }> {
  const sessionToken = await ensureAgentSession(agentAddress);
  const response = await post<ApiResponse<{ id: string; status: string }>>(
    API_ENDPOINTS.agentCommitteeRegistration,
    {
      agentAddress,
      vaultId,
      phase
    },
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`
      }
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to bootstrap committee registration.");
  }

  return {
    vaultId: response.data.id,
    status: response.data.status
  };
}

export async function registerAgent(_data: RegisterAgentRequest): Promise<Agent> {
  throw new Error("Real agent registration uses the wallet-signature challenge flow through /agent-registrations.");
}

export async function agentStake(agentId: string, data: StakeRequest): Promise<{ task: AgentTask; agent: Agent }> {
  const sessionToken = await ensureAgentSession(agentId);
  const payloadURI = (
    await storePayload({
      vaultId: data.vaultId,
      kind: "agent_stake",
      walletAddress: agentId,
      sessionToken,
      payload: {
        agentAddress: agentId,
        amount: data.amount,
        vaultId: data.vaultId,
        createdAt: new Date().toISOString(),
        version: 1
      }
    })
  ).payloadURI;
  const trace = await post<ApiResponse<{ txHash?: string }>>(API_ENDPOINTS.agentStake(agentId), {
    agentAddress: agentId,
    amount: data.amount,
    payloadURI
  }, {
    headers: {
      Authorization: `Bearer ${sessionToken}`
    }
  });
  if (!trace.success) {
    throw new Error(trace.error?.message || "Failed to stake agent through the live API.");
  }

  const agent = (await findAgent(agentId)) ?? {
    id: agentId,
    name: `Agent ${agentId.slice(0, 8)}`,
    walletAddress: agentId,
    totalStake: data.amount,
    availableBalance: "0",
    slashCount: 0,
    successCount: 0,
    reputation: 50,
    status: "staking" as const,
    registeredAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString()
  };

  return {
    task: {
      id: `stake-${data.vaultId}-${Date.now()}`,
      vaultId: data.vaultId,
      vaultTitle: `Vault ${data.vaultId}`,
      status: "reviewing",
      confidence: 0,
      receivedAt: new Date().toISOString(),
      bond: data.amount
    },
    agent
  };
}

export async function agentUnstake(agentId: string, _vaultId: string): Promise<{ agent: Agent }> {
  const agent = await findAgent(agentId);
  if (!agent) {
    throw new Error("Agent is not on the live judge list.");
  }

  return { agent };
}

export async function getAgentByWallet(address: string): Promise<AgentDashboard> {
  return getAgentDashboard(address);
}

export async function getAgentTaskHistory(_agentId: string): Promise<TaskHistoryEntry[]> {
  return [];
}

export async function getSlashRecords(_agentId: string): Promise<SlashRecord[]> {
  return [];
}

export async function getAgentReputationHistory(agentId: string): Promise<ReputationHistoryPoint[]> {
  const agent = await findAgent(agentId);
  if (!agent) {
    return [];
  }

  return [
    {
      timestamp: agent.lastActiveAt,
      reputation: agent.reputation,
      totalTasks: agent.successCount + agent.slashCount,
      successRate: agent.slashCount === 0 ? 100 : 0
    }
  ];
}
