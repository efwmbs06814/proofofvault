'use client';

// ============================================
// Proof of Vault — Shared Type Definitions
// 对应 Protocol-Mechanism-V2.zh-CN.md 协议规范
// Hackathon Profile: 2 maker + 2 verifier / 3 validator + 2 auditor
// ============================================

// ============================================
// Vault Status (Vault 生命周期)
// ============================================

export type VaultStatus =
  | 'DraftRequest'        // 真人提交自然语言事件，待结构化
  | 'RuleAuction'          // 规则制定委员会抽签中
  | 'RuleDrafting'         // Rule Maker 产出规则包
  | 'UserRuleReview'       // 真人审阅规则
  | 'PendingFunding'      // 等待补齐 Vault Collateral
  | 'Active'              // Vault 正式成立，待结算
  | 'ResolutionAuction'    // 结算委员会抽签
  | 'CommitPhase'          // Validator 提交 Commit Hash
  | 'RevealPhase'          // Validator Reveal 结果与证据
  | 'AuditPhase'           // Auditor 审计 Validator 提交
  | 'PublicChallenge'      // 公示期，外部挑战
  | 'ResolvedTrue'         // TRUE：返还担保金
  | 'ResolvedFalse'        // FALSE：担保金流入赔付池
  | 'ResolvedInvalid'      // INVALID：退款
  | 'Cancelled';          // 中途取消

// ============================================
// Final Resolution 结果
// ============================================

export type FinalResult = 'TRUE' | 'FALSE' | 'INVALID';

// ============================================
// Agent Roles (Agent 角色)
// ============================================

export type AgentRole = 'RuleMaker' | 'RuleVerifier' | 'Validator' | 'Auditor';

// ============================================
// Submission Types (提交类型)
// ============================================

export type SubmissionType = 'criteria' | 'resolution' | 'audit';

// ============================================
// Violation Severity (违规等级)
// ============================================

export type ViolationSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

// ============================================
// Auditor Judgment (审计人判断)
// ============================================

export type AuditorJudgment = 'Valid' | 'Questionable' | 'Invalid' | 'Malicious';

// ============================================
// Vault Sizes (委员会规模)
// ============================================

export type VaultSize = 'small' | 'medium' | 'large';

export const VAULT_SIZE_CONFIG: Record<VaultSize, {
  collateralThreshold: number; // USDT
  ruleMakers: number;
  ruleVerifiers: number;
  validators: number;
  auditors: number;
}> = {
  small:  { collateralThreshold: 5000,   ruleMakers: 2, ruleVerifiers: 2, validators: 3, auditors: 2 },
  medium: { collateralThreshold: 50000,  ruleMakers: 3, ruleVerifiers: 3, validators: 5, auditors: 3 },
  large:  { collateralThreshold: 500000, ruleMakers: 5, ruleVerifiers: 5, validators: 7, auditors: 5 },
};

// ============================================
// Vault Core
// ============================================

export interface Vault {
  id: string;
  title: string;                         // 自然语言事件描述
  description: string;                   // 补充材料

  // 金额
  setupDeposit: number;                  // 规则制定阶段押金
  vaultCollateral: number;                // 正式担保金

  // 时间
  resolutionTime: number;                // 结算时间戳（Unix ms）
  createdAt: number;

  // 状态
  status: VaultStatus;
  result?: FinalResult;                   // 最终结果（Resolved 时有值）

  // 合同地址（X Layer）
  contractAddress?: string;
  transactionHash?: string;

  // setter
  setterAddress: string;

  // 规则包（结构化）
  criteriaPackage?: CriteriaPackage;
}

// ============================================
// Criteria Package（规则包）
// 由 Rule Maker 产出，Rule Verifier 审计
// ============================================

export interface CriteriaPackage {
  id: string;
  vaultId: string;

  // 事件结构化信息
  eventTitle: string;
  observationObject: string;     // 观察对象
  metricType: string;             // 指标类型（如 FDV, Price, Volume）
  threshold: string;              // 阈值（如 "> 1,000,000 USD"）
  observationTime: string;        // 观测时间
  primaryDataSource: string;      // 主数据源
  fallbackDataSource?: string;    // 备用数据源
  dataConflictPriority?: string;  // 数据冲突时优先级

  // 结算条件
  passConditions: string[];       // 通过条件
  failConditions: string[];       // 不通过条件
  invalidConditions: string[];     // INVALID 条件

  // 时间容差
  timeToleranceWindow?: string;   // 允许的时间误差窗口

  // Proof 格式
  proofDataFormat?: string;       // proof 数据格式要求

  // 版本控制
  version: number;
  createdAt: number;
  updatedAt: number;

  // Rule Maker
  makers: AgentSubmission[];

  // Verifier Challenges
  challenges: RuleChallenge[];

  // 最终确认状态
  confirmedBySetter: boolean;
  confirmedAt?: number;
}

// ============================================
// Rule Challenge（规则漏洞挑战）
// Rule Verifier 提交
// ============================================

export interface RuleChallenge {
  id: string;
  vaultId: string;
  criteriaPackageId: string;

  severity: ViolationSeverity;
  title: string;
  description: string;
  suggestion?: string;

  verifierAddress: string;
  createdAt: number;

  // 处理状态
  status: 'pending' | 'accepted' | 'rejected';
  resolvedBy?: string;            // 被哪个 maker 解决
  resolvedAt?: number;
  resolutionNotes?: string;
}

// ============================================
// Agent Submission（Agent 提交）
// 覆盖 criteria / resolution / audit 三种类型
// ============================================

export interface AgentSubmission {
  id: string;
  vaultId: string;
  agentAddress: string;

  // 角色
  role: AgentRole;
  submissionType: SubmissionType;

  // Commit-Reveal（用于 resolution 阶段）
  commitHash?: string;             // 阶段一：提交承诺哈希
  salt?: string;                   // 随机盐（commit 时隐藏）
  revealedResult?: FinalResult;   // 阶段二：reveal 结果
  revealedReasoning?: string;     // 结构化理由
  revealedDataSources?: string[]; // 引用的数据源
  revealedCalculation?: string;   // 原始计算过程
  proofPayloadUri?: string;       // proof payload URI

  // 时间戳
  committedAt?: number;
  revealedAt?: number;

  // Auditor 审计结果
  auditorJudgments?: AuditorJudgment[];  // 每个 auditor 的独立判断
  finalJudgment?: AuditorJudgment;       // 综合判断（2/3 多数）

  // 奖励 / 惩罚
  reward?: number;
  slashAmount?: number;
  slashReason?: string;

  // 状态
  status: 'pending' | 'committed' | 'revealed' | 'audited' | 'slashed';
}

// ============================================
// Agent Profile（Agent 档案）
// ============================================

export interface AgentProfile {
  address: string;

  // 能力标签
  skills: string[];                 // 已安装 skills 或能力标签
  supportedTaskTypes: AgentRole[]; // 支持的任务类型

  // 经济数据
  totalStake: number;               // 总质押
  availableStake: number;          // 可用质押
  lockedTaskBonds: number;          // 任务锁定中的 bond

  // 历史记录
  completedTasks: number;
  successfulTasks: number;
  failedTasks: number;
  slashCount: number;

  // 信誉
  reputation: number;               // 0-100
  consensusRate: number;            // 与最终共识一致率
  accuracyRate: number;            // 准确率（有效提交中正确比例）

  // 注册时间
  registeredAt: number;
  lastActiveAt: number;
}

// ============================================
// Task Bond（任务 bond）
// ============================================

export interface TaskBond {
  id: string;
  vaultId: string;
  agentAddress: string;
  role: AgentRole;

  lockedAmount: number;             // 锁定的 stake 数量
  slashableAmount: number;           // 可被 slash 的上限（按 vault 结算前不可提）

  status: 'locked' | 'released' | 'slashed';
  createdAt: number;
  releasedAt?: number;
  slashedAt?: number;
}

// ============================================
// Slash Record（Slash 记录）
// ============================================

export interface SlashRecord {
  id: string;
  vaultId: string;
  agentAddress: string;
  submissionId: string;

  severity: ViolationSeverity;
  reason: string;

  slashAmount: number;               // 实际 slash 金额
  slashPercent: number;             // 占 task bond 的百分比

  slashedBy: string;                // 执行 slash 的角色（Slasher）
  slashedAt: number;

  // 资金去向
  toChallenger?: number;            // 给成功挑战者
  toProtocol?: number;             // 给协议金库
  toPool?: number;                  // 给赔付池
}

// ============================================
// Reward Record（奖励记录）
// ============================================

export interface RewardRecord {
  id: string;
  vaultId: string;
  agentAddress: string;
  submissionId: string;

  role: AgentRole;
  rewardType: 'base' | 'quality' | 'consensus';

  amount: number;

  awardedAt: number;
}

// ============================================
// Resolution Data（结算数据）
// 包含 vault 最终结算的所有信息
// ============================================

export interface ResolutionData {
  vaultId: string;

  // 委员会信息
  validatorCount: number;
  auditorCount: number;
  validSubmissionCount: number;

  // 投票分布
  trueVotes: number;
  falseVotes: number;
  invalidVotes: number;

  // 最终结果
  result: FinalResult;
  resultReachedAt: number;

  // 争议处理
  challengeCount: number;
  successfulChallenge: boolean;

  // Finalizer
  finalizerAddress: string;
  finalizationTxHash?: string;
}

// ============================================
// Compensation Pool（赔付池）
// ============================================

export interface CompensationPool {
  id: string;
  totalAssets: number;
  lastUpdatedAt: number;
  contributors: {
    vaultId: string;
    amount: number;
    contributedAt: number;
  }[];
}

// ============================================
// API Response Wrappers
// ============================================

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================
// Vault Filter & Sort
// ============================================

export interface VaultFilter {
  status?: VaultStatus[];
  setterAddress?: string;
  minCollateral?: number;
  maxCollateral?: number;
  tags?: string[];
  searchQuery?: string;
}

export type VaultSortField = 'createdAt' | 'resolutionTime' | 'vaultCollateral';
export type SortOrder = 'asc' | 'desc';

// ============================================
// Workflow Step（工作流步骤）
// 用于前端状态展示
// ============================================

export interface WorkflowStep {
  id: string;
  phase: 'creation' | 'rule_making' | 'resolution' | 'finalization';
  title: string;
  description: string;
  status: 'upcoming' | 'current' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  actors?: string[];  //参与的 agent 地址列表
}

// ============================================
// Event Templates（Hackathon 事件模板）
// ============================================

export interface EventTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  fields: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    placeholder?: string;
    required: boolean;
    validation?: Record<string, unknown>;
  }[];
}

// Hackathon 默认模板：FDV above X at T
export const FDV_EVENT_TEMPLATE: EventTemplate = {
  id: 'fdv_above_x_at_t',
  name: 'FDV above X at T',
  description: 'Token 公开发售后 24 小时 FDV 高于特定阈值',
  icon: '📊',
  fields: [
    { key: 'tokenSymbol', label: 'Token Symbol', type: 'text', placeholder: 'e.g. TOKEN', required: true },
    { key: 'tokenAddress', label: 'Token Contract Address', type: 'text', placeholder: '0x...', required: true },
    { key: 'thresholdUsd', label: 'FDV Threshold (USD)', type: 'number', placeholder: '1000000', required: true },
    { key: 'observationHours', label: 'Observation Window (hours)', type: 'number', placeholder: '24', required: true },
    { key: 'publicSaleDate', label: 'Public Sale Date', type: 'date', required: true },
    { key: 'dataSource', label: 'Primary Data Source', type: 'text', placeholder: 'CoinGecko / DEX screener', required: true },
  ],
};

// ============================================
// Utility Functions
// ============================================

export function getVaultSize(collateral: number): VaultSize {
  if (collateral >= VAULT_SIZE_CONFIG.large.collateralThreshold) return 'large';
  if (collateral >= VAULT_SIZE_CONFIG.medium.collateralThreshold) return 'medium';
  return 'small';
}

export function getStatusLabel(status: VaultStatus): string {
  const labels: Record<VaultStatus, string> = {
    DraftRequest: 'Draft',
    RuleAuction: 'Rule Auction',
    RuleDrafting: 'Rule Drafting',
    UserRuleReview: 'Review Rule',
    PendingFunding: 'Pending Funding',
    Active: 'Active',
    ResolutionAuction: 'Resolution Auction',
    CommitPhase: 'Commit Phase',
    RevealPhase: 'Reveal Phase',
    AuditPhase: 'Audit Phase',
    PublicChallenge: 'Public Challenge',
    ResolvedTrue: '✓ TRUE',
    ResolvedFalse: '✗ FALSE',
    ResolvedInvalid: '⌀ INVALID',
    Cancelled: 'Cancelled',
  };
  return labels[status] ?? status;
}

export function getStatusColor(status: VaultStatus): string {
  if (status === 'ResolvedTrue') return 'text-matrix-green';
  if (status === 'ResolvedFalse') return 'text-red-500';
  if (status === 'ResolvedInvalid') return 'text-yellow-500';
  if (status === 'Cancelled') return 'text-gray-500';
  if (status.startsWith('Resolved')) return 'text-gray-400';
  return 'text-matrix-green';
}

export function getResultLabel(result: FinalResult): string {
  const labels: Record<FinalResult, string> = {
    TRUE: 'TRUE — Setter wins',
    FALSE: 'FALSE — Pool takes collateral',
    INVALID: 'INVALID — Refund issued',
  };
  return labels[result];
}

export function isTerminalStatus(status: VaultStatus): boolean {
  return status === 'ResolvedTrue' || status === 'ResolvedFalse' || status === 'ResolvedInvalid' || status === 'Cancelled';
}

export function isResolutionPhase(status: VaultStatus): boolean {
  return status === 'CommitPhase' || status === 'RevealPhase' || status === 'AuditPhase' || status === 'PublicChallenge';
}
