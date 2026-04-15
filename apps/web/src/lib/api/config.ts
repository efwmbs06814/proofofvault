export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/backend";

export const API_CONFIG = {
  baseUrl: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json"
  }
} as const;

export const API_ENDPOINTS = {
  vaults: "/vaults",
  vault: (id: string) => `/vaults/${id}`,
  vaultStatus: (id: string) => `/vaults/${id}/status`,
  vaultDeposit: (id: string) => `/vaults/${id}/deposit`,
  vaultProof: (id: string) => `/vaults/${id}/proof`,
  agents: "/agents",
  agent: (id: string) => `/agents/${id}`,
  agentRegister: "/agent-registrations",
  agentDashboard: (id: string) => `/agents/${id}/dashboard`,
  agentTasks: (id: string) => `/agents/${id}/tasks`,
  agentCommitteeRegistration: "/agents/committee-registration",
  agentStake: (_id: string) => "/agents/stake",
  agentUnstake: (id: string) => `/agents/${id}/unstake`,
  agentByWallet: (address: string) => `/agents/wallet/${address}`,
  agentTaskHistory: (id: string) => `/agents/${id}/task-history`,
  agentSlashRecords: (id: string) => `/agents/${id}/slash-records`,
  agentReputationHistory: (id: string) => `/agents/${id}/reputation-history`,
  agentBonds: (id: string) => `/agents/${id}/bonds`,
  agentRewards: (id: string) => `/agents/${id}/rewards`,
  judgeList: "/judge-list",
  submissionsCriteria: "/agent-submissions",
  submissionsResolution: "/agent-submissions",
  submissionsFinalize: "/vaults/finality",
  submissionsSlash: "/submissions/slash",
  submissionsReward: "/submissions/reward",
  health: "/health",
  runtimeConfig: "/runtime-config",
  agentManifest: "/agent-manifest.json",
  payloads: "/payloads",
  vaultRegisterTx: (id: string) => `/vaults/${id}/register-tx`
} as const;
