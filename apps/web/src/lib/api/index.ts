/**
 * API 模块导出
 * 
 * 统一导出所有 API 相关的类型和函数
 */

// 配置
export { API_CONFIG, API_ENDPOINTS, API_BASE_URL } from './config';

// 客户端 - 函数
export { get, post, put, del, checkApiHealth } from './client';

// 客户端 - 类型和类
export type { ApiResponse, PaginatedResponse } from './client';
export { ApiError } from './client';

// Vault API
export { getVaults, getVault, createVault, updateVaultStatus, depositToVault, getVaultProof, submitProof } from './vault';
export type { VaultStatus, VaultSummary, VaultDetail, CreateVaultRequest, ListVaultsQuery, ResolutionProof, FinalResolution, VaultAgent, CriteriaResult } from './vault';

// Agent API
export { getAgents, getAgent, registerAgent, getAgentDashboard, getAgentTasks, bootstrapCommittee, agentStake, agentUnstake, getAgentByWallet } from './agent';
export type { Agent, AgentTask, AgentDashboard, AgentStatus, AgentTaskStatus, RegisterAgentRequest, StakeRequest } from './agent';

// Submission API
export {
  createBytes32,
  createResolutionProofHash,
  finalizeSubmission,
  finalizeVaultResolution,
  getRuleChallenges,
  getRuleDraft,
  getWorkflowVault,
  rewardSubmission,
  slashSubmission,
  submitCriteria,
  submitResolution,
  submitResolutionCommit,
  submitResolutionReveal
} from './submission';
export type {
  FinalizeResolutionResponse,
  RuleChallenge,
  RuleChallengeRequest,
  RuleDraft,
  ResolutionProofHashInput,
  SubmitCriteriaRequest,
  SubmitResolutionCommitRequest,
  SubmitResolutionRequest,
  SubmitResolutionRevealRequest,
  ValidatorSubmission
} from './submission';
