import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_TARGET_EVM_CHAIN_ID,
  agentLoginChallengeSchema,
  agentProfileSchema,
  agentRegistrationSchema,
  agentSubmissionSchema,
  judgeListEntrySchema,
  preRegistrationChallengeSchema,
  vaultSummarySchema,
  type AgentLoginChallenge,
  type AgentProfile,
  type AgentRegistration,
  type AgentSubmission,
  type JudgeListEntry,
  type PreRegistrationChallenge,
  type VaultSummary
} from "@proof-of-vault/shared-types";

import type { AppDatabaseExecutor } from "../db/client.js";
import {
  agentProfilesTable,
  agentRegistrationsTable,
  agentSubmissionsTable,
  authChallengesTable,
  judgeListEntriesTable,
  processedStakeTransactionsTable,
  vaultsTable
} from "../db/schema.js";
import type { WorkflowStore } from "./workflow-store.js";

function textAmount(value: unknown): string {
  return value === null || value === undefined ? "0" : value.toString();
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return Number(value);
}

function normalizeResolutionCommittee(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const committee = value as {
    validators?: unknown;
    auditors?: unknown;
    minValidCount?: unknown;
  };
  const minValidCount = Number(committee.minValidCount ?? 0);
  const validators = Array.isArray(committee.validators) ? committee.validators : [];
  const auditors = Array.isArray(committee.auditors) ? committee.auditors : [];

  if (minValidCount <= 0 || validators.length === 0) {
    return undefined;
  }

  return {
    ...committee,
    validators,
    auditors,
    minValidCount
  };
}

function mapVaultRow(row: typeof vaultsTable.$inferSelect): VaultSummary {
  return vaultSummarySchema.parse({
    id: row.id,
    externalVaultId: optionalNumber(row.externalVaultId),
    chainId: row.chainId,
    legacyMode: row.legacyMode,
    setterAddress: row.setterAddress ?? undefined,
    status: row.status,
    statement: row.statement ?? undefined,
    metadataURI: row.metadataUri,
    collateralToken: row.collateralToken ?? undefined,
    grossCollateralAmount: textAmount(row.grossCollateralAmount),
    settlementTime: optionalNumber(row.settlementTimeMs),
    createdAt: Number(row.createdAtMs),
    updatedAt: Number(row.updatedAtMs),
    ruleRound: row.ruleRound,
    resolutionRound: row.resolutionRound,
    rejectionCount: row.rejectionCount,
    criteriaHash: row.criteriaHash ?? undefined,
    ruleCommittee: row.ruleCommittee ?? undefined,
    resolutionCommittee: normalizeResolutionCommittee(row.resolutionCommittee),
    finalResolution: row.finalResolution ?? undefined,
    onchainSnapshot: row.onchainSnapshot ?? undefined,
    traces: Array.isArray(row.traces) ? row.traces : []
  });
}

function mapVaultToRow(vault: VaultSummary): typeof vaultsTable.$inferInsert {
  return {
    id: vault.id,
    externalVaultId: vault.externalVaultId,
    chainId: vault.chainId,
    legacyMode: vault.legacyMode,
    setterAddress: vault.setterAddress,
    status: vault.status,
    statement: vault.statement,
    metadataUri: vault.metadataURI,
    collateralToken: vault.collateralToken,
    grossCollateralAmount: vault.grossCollateralAmount,
    settlementTimeMs: vault.settlementTime,
    createdAtMs: vault.createdAt,
    updatedAtMs: vault.updatedAt,
    ruleRound: vault.ruleRound,
    resolutionRound: vault.resolutionRound,
    rejectionCount: vault.rejectionCount,
    criteriaHash: vault.criteriaHash,
    ruleCommittee: vault.ruleCommittee,
    resolutionCommittee: vault.resolutionCommittee,
    finalResolution: vault.finalResolution,
    onchainSnapshot: vault.onchainSnapshot,
    traces: vault.traces
  };
}

function mapAgentRow(row: typeof agentProfilesTable.$inferSelect): AgentProfile {
  return agentProfileSchema.parse({
    address: row.address,
    walletAddress: row.walletAddress ?? undefined,
    label: row.label,
    capabilityTags: Array.isArray(row.capabilityTags) ? row.capabilityTags : [],
    reputationScore: row.reputationScore,
    activeStake: textAmount(row.activeStake),
    canUseAgenticWallet: row.canUseAgenticWallet,
    status: row.status,
    walletProvider: row.walletProvider,
    walletProvisionedAt: optionalNumber(row.walletProvisionedAtMs),
    walletProviderEvidence: row.walletProviderEvidence ?? {}
  });
}

function mapAgentToRow(agent: AgentProfile): typeof agentProfilesTable.$inferInsert {
  return {
    address: agent.address.toLowerCase(),
    walletAddress: agent.walletAddress?.toLowerCase() ?? agent.address.toLowerCase(),
    label: agent.label,
    capabilityTags: agent.capabilityTags,
    reputationScore: agent.reputationScore,
    activeStake: agent.activeStake,
    canUseAgenticWallet: agent.canUseAgenticWallet,
    status: agent.status,
    walletProvider: agent.walletProvider,
    walletProvisionedAtMs: agent.walletProvisionedAt,
    walletProviderEvidence: agent.walletProviderEvidence ?? {},
    updatedAtMs: Date.now()
  };
}

function submissionUniquenessKey(vaultKey: string, submission: AgentSubmission): string | null {
  const base = `${vaultKey}:${submission.round}:${submission.kind}:${submission.agentAddress.toLowerCase()}`;

  if (
    submission.kind === "rule_draft" ||
    submission.kind === "rule_issue" ||
    submission.kind === "resolution_commit" ||
    submission.kind === "resolution_reveal"
  ) {
    return base;
  }

  if (submission.kind === "audit_verdict") {
    return `${base}:${submission.payload.validator.toLowerCase()}`;
  }

  return null;
}

function mapSubmissionToRow(vaultKey: string, submission: AgentSubmission): typeof agentSubmissionsTable.$inferInsert {
  return {
    id: submission.id!,
    vaultKey,
    vaultId: submission.vaultId,
    kind: submission.kind,
    round: submission.round,
    agentAddress: submission.agentAddress.toLowerCase(),
    payloadUri: submission.payloadURI,
    payloadHash: submission.payloadHash,
    proofHash: "proofHash" in submission ? submission.proofHash : undefined,
    salt: "salt" in submission ? submission.salt : undefined,
    status: "status" in submission ? submission.status : undefined,
    bondAmount: "bondAmount" in submission ? submission.bondAmount : undefined,
    payload: submission.payload,
    proof: submission.proof,
    executionTrace: submission.executionTrace,
    validation: submission.validation,
    createdAtMs: submission.createdAt!,
    submissionUniquenessKey: submissionUniquenessKey(vaultKey, submission)
  };
}

function mapSubmissionRow(row: typeof agentSubmissionsTable.$inferSelect): AgentSubmission {
  const base = {
    id: row.id,
    vaultId: Number(row.vaultId),
    round: row.round,
    agentAddress: row.agentAddress,
    payloadURI: row.payloadUri,
    payloadHash: row.payloadHash ?? undefined,
    createdAt: Number(row.createdAtMs),
    proof: row.proof ?? undefined,
    executionTrace: row.executionTrace ?? undefined,
    validation: row.validation ?? undefined,
    payload: row.payload
  } as Record<string, unknown>;

  if (row.kind === "resolution_reveal") {
    base.proofHash = row.proofHash ?? undefined;
    base.salt = row.salt ?? undefined;
  }

  if (row.kind === "public_challenge") {
    base.status = row.status ?? "open";
    base.bondAmount = row.bondAmount ? textAmount(row.bondAmount) : undefined;
  }

  return agentSubmissionSchema.parse({
    kind: row.kind,
    ...base
  });
}

function mapChallengeRow(row: typeof authChallengesTable.$inferSelect): PreRegistrationChallenge | AgentLoginChallenge {
  const common = {
    nonce: row.nonce,
    walletAddress: row.walletAddress,
    chainId: row.chainId,
    message: row.message,
    issuedAt: Number(row.issuedAtMs),
    expiresAt: Number(row.expiresAtMs),
    sourceProvider: row.sourceProvider
  };

  if (row.kind === "pre_registration") {
    return preRegistrationChallengeSchema.parse({
      ...common,
      agentLabel: row.agentLabel,
      capabilityTags: Array.isArray(row.capabilityTags) ? row.capabilityTags : []
    });
  }

  return agentLoginChallengeSchema.parse(common);
}

type RawChallengeRow = {
  nonce: string;
  walletAddress: string;
  agentLabel: string | null;
  capabilityTags: unknown;
  chainId: number;
  message: string;
  issuedAt: number;
  expiresAt: number;
  sourceProvider: string;
};

function mapLockedChallengeRow(
  kind: "pre_registration" | "login",
  row: RawChallengeRow
): PreRegistrationChallenge | AgentLoginChallenge {
  const common = {
    nonce: row.nonce,
    walletAddress: row.walletAddress,
    chainId: row.chainId,
    message: row.message,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    sourceProvider: row.sourceProvider
  };

  if (kind === "pre_registration") {
    return preRegistrationChallengeSchema.parse({
      ...common,
      agentLabel: row.agentLabel,
      capabilityTags: Array.isArray(row.capabilityTags) ? row.capabilityTags : []
    });
  }

  return agentLoginChallengeSchema.parse(common);
}

function mapRegistrationRow(row: typeof agentRegistrationsTable.$inferSelect): AgentRegistration {
  return agentRegistrationSchema.parse({
    id: row.id,
    walletAddress: row.walletAddress,
    agentLabel: row.agentLabel,
    capabilityTags: Array.isArray(row.capabilityTags) ? row.capabilityTags : [],
    chainId: row.chainId,
    registeredAt: Number(row.registeredAtMs),
    lastLoginAt: optionalNumber(row.lastLoginAtMs),
    status: row.status,
    sourceProvider: row.sourceProvider
  });
}

function mapRegistrationToRow(registration: AgentRegistration): typeof agentRegistrationsTable.$inferInsert {
  return {
    id: registration.id,
    walletAddress: registration.walletAddress.toLowerCase(),
    agentLabel: registration.agentLabel,
    capabilityTags: registration.capabilityTags,
    chainId: registration.chainId,
    registeredAtMs: registration.registeredAt,
    lastLoginAtMs: registration.lastLoginAt,
    status: registration.status,
    sourceProvider: registration.sourceProvider
  };
}

function mapJudgeListEntryRow(row: typeof judgeListEntriesTable.$inferSelect): JudgeListEntry {
  return judgeListEntrySchema.parse({
    id: row.id,
    registrationId: row.registrationId,
    walletAddress: row.walletAddress,
    agentLabel: row.agentLabel,
    capabilityTags: Array.isArray(row.capabilityTags) ? row.capabilityTags : [],
    chainId: row.chainId,
    listedAt: Number(row.listedAtMs),
    activeStake: textAmount(row.activeStake),
    reputationScore: row.reputationScore,
    status: row.status,
    sourceProvider: row.sourceProvider
  });
}

function mapJudgeListEntryToRow(entry: JudgeListEntry): typeof judgeListEntriesTable.$inferInsert {
  return {
    registrationId: entry.registrationId,
    id: entry.id,
    walletAddress: entry.walletAddress.toLowerCase(),
    agentLabel: entry.agentLabel,
    capabilityTags: entry.capabilityTags,
    chainId: entry.chainId,
    listedAtMs: entry.listedAt,
    activeStake: entry.activeStake,
    reputationScore: entry.reputationScore,
    status: entry.status,
    sourceProvider: entry.sourceProvider
  };
}

export class PostgresWorkflowStore implements WorkflowStore {
  constructor(private readonly db: AppDatabaseExecutor) {}

  async createVaultId(): Promise<string> {
    const result = (await this.db.execute(sql`select nextval('vault_local_id_seq')::text as id`)) as {
      rows: Array<{ id: string }>;
    };
    return result.rows[0]?.id ?? String(Date.now());
  }

  async saveVault(vault: VaultSummary): Promise<VaultSummary> {
    const row = mapVaultToRow(vault);
    await this.db
      .insert(vaultsTable)
      .values(row)
      .onConflictDoUpdate({
        target: vaultsTable.id,
        set: row
      });

    return vault;
  }

  async getVault(vaultId: string): Promise<VaultSummary | undefined> {
    const [row] = await this.db.select().from(vaultsTable).where(eq(vaultsTable.id, vaultId)).limit(1);
    return row ? mapVaultRow(row) : undefined;
  }

  async listVaults(): Promise<VaultSummary[]> {
    const rows = await this.db.select().from(vaultsTable).orderBy(asc(vaultsTable.createdAtMs));
    return rows.map(mapVaultRow);
  }

  async addSubmission(vaultId: string, submission: AgentSubmission): Promise<AgentSubmission> {
    const row = mapSubmissionToRow(vaultId, submission);
    await this.db.insert(agentSubmissionsTable).values(row);

    return submission;
  }

  async listSubmissions(vaultId: string): Promise<AgentSubmission[]> {
    const rows = await this.db
      .select()
      .from(agentSubmissionsTable)
      .where(eq(agentSubmissionsTable.vaultKey, vaultId))
      .orderBy(asc(agentSubmissionsTable.createdAtMs));

    return rows.map(mapSubmissionRow);
  }

  async updateChallengeStatus(
    vaultId: string,
    submissionId: string,
    status: "resolved_success" | "resolved_failure"
  ): Promise<void> {
    await this.db
      .update(agentSubmissionsTable)
      .set({ status })
      .where(
        and(
          eq(agentSubmissionsTable.vaultKey, vaultId),
          eq(agentSubmissionsTable.id, submissionId),
          eq(agentSubmissionsTable.kind, "public_challenge")
        )
      );
  }

  async saveAgent(agent: AgentProfile): Promise<AgentProfile> {
    const row = mapAgentToRow(agent);
    await this.db
      .insert(agentProfilesTable)
      .values(row)
      .onConflictDoUpdate({
        target: agentProfilesTable.address,
        set: row
      });

    return agentProfileSchema.parse({
      ...agent,
      address: agent.address.toLowerCase(),
      walletAddress: agent.walletAddress?.toLowerCase() ?? agent.address.toLowerCase()
    });
  }

  async saveAgents(agents: AgentProfile[]): Promise<AgentProfile[]> {
    return Promise.all(agents.map((agent) => this.saveAgent(agent)));
  }

  async getAgent(address: string): Promise<AgentProfile | undefined> {
    const [row] = await this.db
      .select()
      .from(agentProfilesTable)
      .where(eq(agentProfilesTable.address, address.toLowerCase()))
      .limit(1);
    return row ? mapAgentRow(row) : undefined;
  }

  async lockAgent(address: string): Promise<AgentProfile | undefined> {
    const normalizedAddress = address.toLowerCase();
    const result = (await this.db.execute(sql`
      select address
      from agent_profiles
      where address = ${normalizedAddress}
      for update
    `)) as {
      rows: Array<{ address: string }>;
    };

    if (result.rows.length === 0) {
      return undefined;
    }

    return this.getAgent(normalizedAddress);
  }

  async listAgents(): Promise<AgentProfile[]> {
    const rows = await this.db.select().from(agentProfilesTable).orderBy(asc(agentProfilesTable.label));
    return rows.map(mapAgentRow);
  }

  async recordAgentStakeTransaction(
    agentAddress: string,
    txHash: string,
    amount: string,
    recordedAt: number
  ): Promise<boolean> {
    const rows = await this.db
      .insert(processedStakeTransactionsTable)
      .values({
        txHash: txHash.toLowerCase(),
        agentAddress: agentAddress.toLowerCase(),
        amount,
        recordedAtMs: recordedAt
      })
      .onConflictDoNothing({
        target: processedStakeTransactionsTable.txHash
      })
      .returning({
        txHash: processedStakeTransactionsTable.txHash
      });

    return rows.length > 0;
  }

  async savePreRegistrationChallenge(challenge: PreRegistrationChallenge): Promise<PreRegistrationChallenge> {
    await this.db
      .insert(authChallengesTable)
      .values({
        nonce: challenge.nonce,
        kind: "pre_registration",
        walletAddress: challenge.walletAddress.toLowerCase(),
        agentLabel: challenge.agentLabel,
        capabilityTags: challenge.capabilityTags,
        chainId: challenge.chainId,
        message: challenge.message,
        issuedAtMs: challenge.issuedAt,
        expiresAtMs: challenge.expiresAt,
        sourceProvider: challenge.sourceProvider
      })
      .onConflictDoUpdate({
        target: authChallengesTable.nonce,
        set: {
          walletAddress: challenge.walletAddress.toLowerCase(),
          agentLabel: challenge.agentLabel,
          capabilityTags: challenge.capabilityTags,
          chainId: challenge.chainId,
          message: challenge.message,
          issuedAtMs: challenge.issuedAt,
          expiresAtMs: challenge.expiresAt,
          consumedAtMs: null,
          sourceProvider: challenge.sourceProvider
        }
      });

    return challenge;
  }

  async getPreRegistrationChallenge(nonce: string): Promise<PreRegistrationChallenge | undefined> {
    const [row] = await this.db
      .select()
      .from(authChallengesTable)
      .where(
        and(
          eq(authChallengesTable.nonce, nonce),
          eq(authChallengesTable.kind, "pre_registration"),
          isNull(authChallengesTable.consumedAtMs)
        )
      )
      .limit(1);

    if (!row) {
      return undefined;
    }

    return mapChallengeRow(row) as PreRegistrationChallenge;
  }

  async lockPreRegistrationChallenge(nonce: string): Promise<PreRegistrationChallenge | undefined> {
    const result = (await this.db.execute(sql`
      select
        nonce,
        wallet_address as "walletAddress",
        agent_label as "agentLabel",
        capability_tags as "capabilityTags",
        chain_id as "chainId",
        message,
        issued_at_ms as "issuedAt",
        expires_at_ms as "expiresAt",
        source_provider as "sourceProvider"
      from auth_challenges
      where nonce = ${nonce}
        and kind = 'pre_registration'
        and consumed_at_ms is null
      for update
    `)) as {
      rows: RawChallengeRow[];
    };

    const row = result.rows[0];
    return row ? (mapLockedChallengeRow("pre_registration", row) as PreRegistrationChallenge) : undefined;
  }

  async consumePreRegistrationChallenge(nonce: string, consumedAt: number): Promise<boolean> {
    const result = (await this.db.execute(sql`
      update auth_challenges
      set consumed_at_ms = ${consumedAt}
      where nonce = ${nonce}
        and kind = 'pre_registration'
        and consumed_at_ms is null
      returning nonce
    `)) as {
      rows: Array<{ nonce: string }>;
    };

    return result.rows.length > 0;
  }

  async saveLoginChallenge(challenge: AgentLoginChallenge): Promise<AgentLoginChallenge> {
    await this.db
      .insert(authChallengesTable)
      .values({
        nonce: challenge.nonce,
        kind: "login",
        walletAddress: challenge.walletAddress.toLowerCase(),
        chainId: challenge.chainId,
        message: challenge.message,
        issuedAtMs: challenge.issuedAt,
        expiresAtMs: challenge.expiresAt,
        sourceProvider: challenge.sourceProvider
      })
      .onConflictDoUpdate({
        target: authChallengesTable.nonce,
        set: {
          walletAddress: challenge.walletAddress.toLowerCase(),
          chainId: challenge.chainId,
          message: challenge.message,
          issuedAtMs: challenge.issuedAt,
          expiresAtMs: challenge.expiresAt,
          consumedAtMs: null,
          sourceProvider: challenge.sourceProvider
        }
      });

    return challenge;
  }

  async getLoginChallenge(nonce: string): Promise<AgentLoginChallenge | undefined> {
    const [row] = await this.db
      .select()
      .from(authChallengesTable)
      .where(and(eq(authChallengesTable.nonce, nonce), eq(authChallengesTable.kind, "login"), isNull(authChallengesTable.consumedAtMs)))
      .limit(1);

    if (!row) {
      return undefined;
    }

    return mapChallengeRow(row) as AgentLoginChallenge;
  }

  async lockLoginChallenge(nonce: string): Promise<AgentLoginChallenge | undefined> {
    const result = (await this.db.execute(sql`
      select
        nonce,
        wallet_address as "walletAddress",
        agent_label as "agentLabel",
        capability_tags as "capabilityTags",
        chain_id as "chainId",
        message,
        issued_at_ms as "issuedAt",
        expires_at_ms as "expiresAt",
        source_provider as "sourceProvider"
      from auth_challenges
      where nonce = ${nonce}
        and kind = 'login'
        and consumed_at_ms is null
      for update
    `)) as {
      rows: RawChallengeRow[];
    };

    const row = result.rows[0];
    return row ? (mapLockedChallengeRow("login", row) as AgentLoginChallenge) : undefined;
  }

  async consumeLoginChallenge(nonce: string, consumedAt: number): Promise<boolean> {
    const result = (await this.db.execute(sql`
      update auth_challenges
      set consumed_at_ms = ${consumedAt}
      where nonce = ${nonce}
        and kind = 'login'
        and consumed_at_ms is null
      returning nonce
    `)) as {
      rows: Array<{ nonce: string }>;
    };

    return result.rows.length > 0;
  }

  async saveRegistration(registration: AgentRegistration): Promise<AgentRegistration> {
    const row = mapRegistrationToRow(registration);
    await this.db
      .insert(agentRegistrationsTable)
      .values(row)
      .onConflictDoUpdate({
        target: agentRegistrationsTable.id,
        set: row
      });
    return registration;
  }

  async getRegistration(id: string): Promise<AgentRegistration | undefined> {
    const [row] = await this.db.select().from(agentRegistrationsTable).where(eq(agentRegistrationsTable.id, id)).limit(1);
    return row ? mapRegistrationRow(row) : undefined;
  }

  async getRegistrationByWallet(walletAddress: string): Promise<AgentRegistration | undefined> {
    const [row] = await this.db
      .select()
      .from(agentRegistrationsTable)
      .where(eq(agentRegistrationsTable.walletAddress, walletAddress.toLowerCase()))
      .limit(1);
    return row ? mapRegistrationRow(row) : undefined;
  }

  async listRegistrations(): Promise<AgentRegistration[]> {
    const rows = await this.db
      .select()
      .from(agentRegistrationsTable)
      .orderBy(asc(agentRegistrationsTable.registeredAtMs));
    return rows.map(mapRegistrationRow);
  }

  async saveJudgeListEntry(entry: JudgeListEntry): Promise<JudgeListEntry> {
    const row = mapJudgeListEntryToRow(entry);
    await this.db
      .insert(judgeListEntriesTable)
      .values(row)
      .onConflictDoUpdate({
        target: judgeListEntriesTable.registrationId,
        set: row
      });
    return entry;
  }

  async getJudgeListEntry(registrationId: string): Promise<JudgeListEntry | undefined> {
    const [row] = await this.db
      .select()
      .from(judgeListEntriesTable)
      .where(eq(judgeListEntriesTable.registrationId, registrationId))
      .limit(1);
    return row ? mapJudgeListEntryRow(row) : undefined;
  }

  async getJudgeListEntryByWallet(walletAddress: string): Promise<JudgeListEntry | undefined> {
    const [row] = await this.db
      .select()
      .from(judgeListEntriesTable)
      .where(eq(judgeListEntriesTable.walletAddress, walletAddress.toLowerCase()))
      .limit(1);
    return row ? mapJudgeListEntryRow(row) : undefined;
  }

  async listJudgeListEntries(): Promise<JudgeListEntry[]> {
    const rows = await this.db.select().from(judgeListEntriesTable).orderBy(asc(judgeListEntriesTable.listedAtMs));
    return rows.map(mapJudgeListEntryRow);
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
    return this.runInTransaction(async (store) => {
      const now = Date.now();
      const normalizedAgent = agentProfileSchema.parse({
        ...agent,
        address: agent.address.toLowerCase(),
        walletAddress: agent.walletAddress?.toLowerCase() ?? agent.address.toLowerCase()
      });
      const existingRegistration = await store.getRegistrationByWallet(normalizedAgent.walletAddress!);
      const registration =
        existingRegistration ??
        (await store.saveRegistration({
          id: `demo-${normalizedAgent.walletAddress!.slice(2, 10)}`,
          walletAddress: normalizedAgent.walletAddress!,
          agentLabel: normalizedAgent.label,
          capabilityTags: normalizedAgent.capabilityTags,
          chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
          registeredAt: now,
          status: "judge_listed",
          sourceProvider: normalizedAgent.walletProvider
        }));

      await store.saveJudgeListEntry({
        id: `judge-${registration.id}`,
        registrationId: registration.id,
        walletAddress: normalizedAgent.walletAddress!,
        agentLabel: normalizedAgent.label,
        capabilityTags: normalizedAgent.capabilityTags,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        listedAt: now,
        activeStake: normalizedAgent.activeStake,
        reputationScore: normalizedAgent.reputationScore,
        status: normalizedAgent.status,
        sourceProvider: normalizedAgent.walletProvider
      });

      return store.saveAgent(normalizedAgent);
    });
  }

  async runInTransaction<T>(fn: (store: WorkflowStore) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(new PostgresWorkflowStore(tx)));
  }
}
