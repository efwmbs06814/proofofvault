import type {
  AgentLoginChallenge,
  AgentProfile,
  AgentRegistration,
  AgentSubmission,
  JudgeListEntry,
  PreRegistrationChallenge,
  VaultSummary
} from "@proof-of-vault/shared-types";

export interface WorkflowStore {
  createVaultId(): Promise<string>;
  saveVault(vault: VaultSummary): Promise<VaultSummary>;
  getVault(vaultId: string): Promise<VaultSummary | undefined>;
  listVaults(): Promise<VaultSummary[]>;
  addSubmission(vaultId: string, submission: AgentSubmission): Promise<AgentSubmission>;
  listSubmissions(vaultId: string): Promise<AgentSubmission[]>;
  updateChallengeStatus(vaultId: string, submissionId: string, status: "resolved_success" | "resolved_failure"): Promise<void>;
  saveAgent(agent: AgentProfile): Promise<AgentProfile>;
  saveAgents(agents: AgentProfile[]): Promise<AgentProfile[]>;
  getAgent(address: string): Promise<AgentProfile | undefined>;
  lockAgent(address: string): Promise<AgentProfile | undefined>;
  listAgents(): Promise<AgentProfile[]>;
  recordAgentStakeTransaction(agentAddress: string, txHash: string, amount: string, recordedAt: number): Promise<boolean>;
  savePreRegistrationChallenge(challenge: PreRegistrationChallenge): Promise<PreRegistrationChallenge>;
  getPreRegistrationChallenge(nonce: string): Promise<PreRegistrationChallenge | undefined>;
  lockPreRegistrationChallenge(nonce: string): Promise<PreRegistrationChallenge | undefined>;
  consumePreRegistrationChallenge(nonce: string, consumedAt: number): Promise<boolean>;
  saveLoginChallenge(challenge: AgentLoginChallenge): Promise<AgentLoginChallenge>;
  getLoginChallenge(nonce: string): Promise<AgentLoginChallenge | undefined>;
  lockLoginChallenge(nonce: string): Promise<AgentLoginChallenge | undefined>;
  consumeLoginChallenge(nonce: string, consumedAt: number): Promise<boolean>;
  saveRegistration(registration: AgentRegistration): Promise<AgentRegistration>;
  getRegistration(id: string): Promise<AgentRegistration | undefined>;
  getRegistrationByWallet(walletAddress: string): Promise<AgentRegistration | undefined>;
  listRegistrations(): Promise<AgentRegistration[]>;
  saveJudgeListEntry(entry: JudgeListEntry): Promise<JudgeListEntry>;
  getJudgeListEntry(registrationId: string): Promise<JudgeListEntry | undefined>;
  getJudgeListEntryByWallet(walletAddress: string): Promise<JudgeListEntry | undefined>;
  listJudgeListEntries(): Promise<JudgeListEntry[]>;
  isJudgeListed(walletAddress: string): Promise<boolean>;
  listJudgeListAgents(): Promise<AgentProfile[]>;
  seedJudgeListedAgent(agent: AgentProfile): Promise<AgentProfile>;
  runInTransaction<T>(fn: (store: WorkflowStore) => Promise<T>): Promise<T>;
}
