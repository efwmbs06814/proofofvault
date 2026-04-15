import type {
  AuditVerdictLabel,
  AgentProfile,
  ExecutionTrace,
  FinalResolutionResult,
  IssueSeverityLabel,
  WalletSignatureAction,
  WalletSignatureProof
} from "@proof-of-vault/shared-types";
import type { PreparedExecution } from "../../../shared-types/src/runtime.js";

export type AgenticWalletAction =
  | "submitRuleDraft"
  | "submitRuleIssue"
  | "stakeForAgent"
  | "commitResolution"
  | "revealResolution"
  | "submitAuditVerdict"
  | "openPublicChallenge"
  | "claimRewards";

type AgenticWalletRequestBase = {
  agent: AgentProfile;
  payloadURI?: string;
  proofHash?: `0x${string}`;
  metadata?: Record<string, unknown>;
};

export type StakeForAgentRequest = AgenticWalletRequestBase & {
  action: "stakeForAgent";
  amount: string;
};

export type SubmitRuleDraftRequest = AgenticWalletRequestBase & {
  action: "submitRuleDraft";
  vaultId: number;
  draftHash: `0x${string}`;
};

export type SubmitRuleIssueRequest = AgenticWalletRequestBase & {
  action: "submitRuleIssue";
  vaultId: number;
  severity: IssueSeverityLabel;
  issueHash: `0x${string}`;
};

export type CommitResolutionRequest = AgenticWalletRequestBase & {
  action: "commitResolution";
  vaultId: number;
  commitHash: `0x${string}`;
};

export type RevealResolutionRequest = AgenticWalletRequestBase & {
  action: "revealResolution";
  vaultId: number;
  outcome: FinalResolutionResult;
  proofHash: `0x${string}`;
  salt: `0x${string}`;
};

export type SubmitAuditVerdictRequest = AgenticWalletRequestBase & {
  action: "submitAuditVerdict";
  vaultId: number;
  validator: `0x${string}`;
  verdict: AuditVerdictLabel;
  verdictHash: `0x${string}`;
};

export type OpenPublicChallengeRequest = AgenticWalletRequestBase & {
  action: "openPublicChallenge";
  vaultId: number;
  target: `0x${string}`;
  challengeHash: `0x${string}`;
};

export type ClaimRewardsWalletRequest = AgenticWalletRequestBase & {
  action: "claimRewards";
  vaultIds?: string[];
};

export type AgenticWalletRequest =
  | StakeForAgentRequest
  | SubmitRuleDraftRequest
  | SubmitRuleIssueRequest
  | CommitResolutionRequest
  | RevealResolutionRequest
  | SubmitAuditVerdictRequest
  | OpenPublicChallengeRequest
  | ClaimRewardsWalletRequest;

export type AgenticWalletSignatureRequest = {
  action: WalletSignatureAction;
  walletAddress: `0x${string}`;
  message: string;
  nonce: string;
  chainId?: number;
  metadata?: Record<string, unknown>;
};

export type AgentWalletProvisioningRequest = {
  agent?: AgentProfile;
  email: string;
  otp: string;
  metadata?: Record<string, unknown>;
};

export interface AgenticWalletProvider {
  readonly name: string;
  ensureWallet(agent: AgentProfile): Promise<AgentProfile>;
  provisionWallet(request: AgentWalletProvisioningRequest): Promise<AgentProfile>;
  prepareExecution(request: AgenticWalletRequest): Promise<PreparedExecution>;
  verifyExecution(request: AgenticWalletRequest, txHash: `0x${string}`): Promise<ExecutionTrace>;
  execute(request: AgenticWalletRequest): Promise<ExecutionTrace>;
  signMessage(request: AgenticWalletSignatureRequest): Promise<WalletSignatureProof>;
}
