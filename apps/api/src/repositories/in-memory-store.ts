import {
  DEFAULT_TARGET_EVM_CHAIN_ID,
  type AgentLoginChallenge,
  type AgentProfile,
  type AgentRegistration,
  type AgentSubmission,
  type JudgeListEntry,
  type PreRegistrationChallenge,
  type VaultSummary
} from "@proof-of-vault/shared-types";

import type { WorkflowStore } from "./workflow-store.js";

export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly vaults = new Map<string, VaultSummary>();
  private readonly submissions = new Map<string, AgentSubmission[]>();
  private readonly agents = new Map<string, AgentProfile>();
  private readonly preRegistrationChallenges = new Map<string, PreRegistrationChallenge>();
  private readonly loginChallenges = new Map<string, AgentLoginChallenge>();
  private readonly registrations = new Map<string, AgentRegistration>();
  private readonly registrationIdsByWallet = new Map<string, string>();
  private readonly judgeList = new Map<string, JudgeListEntry>();
  private readonly judgeListIdsByWallet = new Map<string, string>();
  private readonly processedStakeTxHashes = new Set<string>();
  private vaultSequence = 1;

  async createVaultId(): Promise<string> {
    const id = String(this.vaultSequence);
    this.vaultSequence += 1;
    return id;
  }

  async saveVault(vault: VaultSummary): Promise<VaultSummary> {
    this.vaults.set(vault.id, vault);
    const numericId = Number(vault.id);
    if (Number.isInteger(numericId) && numericId >= this.vaultSequence) {
      this.vaultSequence = numericId + 1;
    }
    return vault;
  }

  async getVault(vaultId: string): Promise<VaultSummary | undefined> {
    return this.vaults.get(vaultId);
  }

  async listVaults(): Promise<VaultSummary[]> {
    return [...this.vaults.values()].sort((left, right) => left.createdAt - right.createdAt);
  }

  async addSubmission(vaultId: string, submission: AgentSubmission): Promise<AgentSubmission> {
    const list = this.submissions.get(vaultId) ?? [];
    list.push(submission);
    this.submissions.set(vaultId, list);
    return submission;
  }

  async listSubmissions(vaultId: string): Promise<AgentSubmission[]> {
    return this.submissions.get(vaultId) ?? [];
  }

  async updateChallengeStatus(
    vaultId: string,
    submissionId: string,
    status: "resolved_success" | "resolved_failure"
  ): Promise<void> {
    const list = this.submissions.get(vaultId) ?? [];
    this.submissions.set(
      vaultId,
      list.map((submission) =>
        submission.kind === "public_challenge" && submission.id === submissionId ? { ...submission, status } : submission
      )
    );
  }

  async saveAgent(agent: AgentProfile): Promise<AgentProfile> {
    this.agents.set(agent.address.toLowerCase(), agent);
    return agent;
  }

  async saveAgents(agents: AgentProfile[]): Promise<AgentProfile[]> {
    return Promise.all(agents.map((agent) => this.saveAgent(agent)));
  }

  async getAgent(address: string): Promise<AgentProfile | undefined> {
    return this.agents.get(address.toLowerCase());
  }

  async lockAgent(address: string): Promise<AgentProfile | undefined> {
    return this.getAgent(address);
  }

  async listAgents(): Promise<AgentProfile[]> {
    return [...this.agents.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  async recordAgentStakeTransaction(
    _agentAddress: string,
    txHash: string,
    _amount: string,
    _recordedAt: number
  ): Promise<boolean> {
    const normalizedTxHash = txHash.toLowerCase();
    if (this.processedStakeTxHashes.has(normalizedTxHash)) {
      return false;
    }

    this.processedStakeTxHashes.add(normalizedTxHash);
    return true;
  }

  async savePreRegistrationChallenge(challenge: PreRegistrationChallenge): Promise<PreRegistrationChallenge> {
    this.preRegistrationChallenges.set(challenge.nonce, challenge);
    return challenge;
  }

  async getPreRegistrationChallenge(nonce: string): Promise<PreRegistrationChallenge | undefined> {
    return this.preRegistrationChallenges.get(nonce);
  }

  async lockPreRegistrationChallenge(nonce: string): Promise<PreRegistrationChallenge | undefined> {
    return this.preRegistrationChallenges.get(nonce);
  }

  async consumePreRegistrationChallenge(nonce: string, _consumedAt: number): Promise<boolean> {
    return this.preRegistrationChallenges.delete(nonce);
  }

  async saveLoginChallenge(challenge: AgentLoginChallenge): Promise<AgentLoginChallenge> {
    this.loginChallenges.set(challenge.nonce, challenge);
    return challenge;
  }

  async getLoginChallenge(nonce: string): Promise<AgentLoginChallenge | undefined> {
    return this.loginChallenges.get(nonce);
  }

  async lockLoginChallenge(nonce: string): Promise<AgentLoginChallenge | undefined> {
    return this.loginChallenges.get(nonce);
  }

  async consumeLoginChallenge(nonce: string, _consumedAt: number): Promise<boolean> {
    return this.loginChallenges.delete(nonce);
  }

  async saveRegistration(registration: AgentRegistration): Promise<AgentRegistration> {
    this.registrations.set(registration.id, registration);
    this.registrationIdsByWallet.set(registration.walletAddress.toLowerCase(), registration.id);
    return registration;
  }

  async getRegistration(id: string): Promise<AgentRegistration | undefined> {
    return this.registrations.get(id);
  }

  async getRegistrationByWallet(walletAddress: string): Promise<AgentRegistration | undefined> {
    const id = this.registrationIdsByWallet.get(walletAddress.toLowerCase());
    return id ? this.registrations.get(id) : undefined;
  }

  async listRegistrations(): Promise<AgentRegistration[]> {
    return [...this.registrations.values()].sort((left, right) => left.registeredAt - right.registeredAt);
  }

  async saveJudgeListEntry(entry: JudgeListEntry): Promise<JudgeListEntry> {
    this.judgeList.set(entry.registrationId, entry);
    this.judgeListIdsByWallet.set(entry.walletAddress.toLowerCase(), entry.registrationId);
    return entry;
  }

  async getJudgeListEntry(registrationId: string): Promise<JudgeListEntry | undefined> {
    return this.judgeList.get(registrationId);
  }

  async getJudgeListEntryByWallet(walletAddress: string): Promise<JudgeListEntry | undefined> {
    const id = this.judgeListIdsByWallet.get(walletAddress.toLowerCase());
    return id ? this.judgeList.get(id) : undefined;
  }

  async listJudgeListEntries(): Promise<JudgeListEntry[]> {
    return [...this.judgeList.values()].sort((left, right) => left.listedAt - right.listedAt);
  }

  async isJudgeListed(walletAddress: string): Promise<boolean> {
    const entry = await this.getJudgeListEntryByWallet(walletAddress);
    if (!entry || entry.status === "disabled") {
      return false;
    }

    const registration = await this.getRegistration(entry.registrationId);
    return registration?.status === "judge_listed";
  }

  async listJudgeListAgents(): Promise<AgentProfile[]> {
    const entries = await this.listJudgeListEntries();
    const registrations = await Promise.all(entries.map((entry) => this.getRegistration(entry.registrationId)));
    const agents = await Promise.all(entries.map((entry) => this.getAgent(entry.walletAddress)));

    return entries
      .filter((entry, index) => entry.status !== "disabled" && registrations[index]?.status === "judge_listed")
      .map((_, index) => agents[index])
      .filter((agent): agent is AgentProfile => Boolean(agent));
  }

  async seedJudgeListedAgent(agent: AgentProfile): Promise<AgentProfile> {
    const now = Date.now();
    const walletAddress = (agent.walletAddress ?? agent.address).toLowerCase();
    const existingRegistration = await this.getRegistrationByWallet(walletAddress);
    const registration =
      existingRegistration ??
      (await this.saveRegistration({
        id: `demo-${walletAddress.slice(2, 10)}`,
        walletAddress,
        agentLabel: agent.label,
        capabilityTags: agent.capabilityTags,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        registeredAt: now,
        status: "judge_listed",
        sourceProvider: agent.walletProvider,
        walletProvider: agent.walletProvider,
        walletProvisionedAt: agent.walletProvisionedAt,
        walletProviderEvidence: agent.walletProviderEvidence ?? {}
      }));

    if (registration.status !== "judge_listed") {
      await this.saveRegistration({
        ...registration,
        status: "judge_listed"
      });
    }

    await this.saveJudgeListEntry({
      id: `judge-${registration.id}`,
      registrationId: registration.id,
      walletAddress,
      agentLabel: agent.label,
      capabilityTags: agent.capabilityTags,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      listedAt: now,
      activeStake: agent.activeStake,
      reputationScore: agent.reputationScore,
      status: agent.status,
      sourceProvider: agent.walletProvider
    });

    return this.saveAgent({
      ...agent,
      address: walletAddress,
      walletAddress
    });
  }

  async runInTransaction<T>(fn: (store: WorkflowStore) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
