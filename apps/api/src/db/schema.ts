import { bigint, boolean, integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";

export const vaultsTable = pgTable("vaults", {
  id: text("id").primaryKey(),
  externalVaultId: bigint("external_vault_id", { mode: "number" }),
  chainId: integer("chain_id").notNull(),
  legacyMode: boolean("legacy_mode").notNull().default(false),
  setterAddress: text("setter_address"),
  status: text("status").notNull(),
  statement: text("statement"),
  metadataUri: text("metadata_uri").notNull(),
  collateralToken: text("collateral_token"),
  grossCollateralAmount: numeric("gross_collateral_amount").notNull(),
  settlementTimeMs: bigint("settlement_time_ms", { mode: "number" }),
  createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  ruleRound: integer("rule_round").notNull().default(0),
  resolutionRound: integer("resolution_round").notNull().default(0),
  rejectionCount: integer("rejection_count").notNull().default(0),
  criteriaHash: text("criteria_hash"),
  ruleCommittee: jsonb("rule_committee"),
  resolutionCommittee: jsonb("resolution_committee"),
  finalResolution: jsonb("final_resolution"),
  onchainSnapshot: jsonb("onchain_snapshot"),
  traces: jsonb("traces").notNull().default([])
});

export const agentProfilesTable = pgTable("agent_profiles", {
  address: text("address").primaryKey(),
  walletAddress: text("wallet_address"),
  label: text("label").notNull(),
  capabilityTags: jsonb("capability_tags").notNull(),
  reputationScore: integer("reputation_score").notNull(),
  activeStake: numeric("active_stake").notNull(),
  canUseAgenticWallet: boolean("can_use_agentic_wallet").notNull().default(true),
  status: text("status").notNull(),
  walletProvider: text("wallet_provider").notNull(),
  walletProvisionedAtMs: bigint("wallet_provisioned_at_ms", { mode: "number" }),
  walletProviderEvidence: jsonb("wallet_provider_evidence").notNull().default({}),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull()
});

export const processedStakeTransactionsTable = pgTable("processed_stake_transactions", {
  txHash: text("tx_hash").primaryKey(),
  agentAddress: text("agent_address").notNull(),
  amount: numeric("amount").notNull(),
  recordedAtMs: bigint("recorded_at_ms", { mode: "number" }).notNull()
});

export const agentSubmissionsTable = pgTable("agent_submissions", {
  id: text("id").primaryKey(),
  vaultKey: text("vault_key").notNull().references(() => vaultsTable.id, { onDelete: "cascade" }),
  vaultId: bigint("vault_id", { mode: "number" }).notNull(),
  kind: text("kind").notNull(),
  round: integer("round").notNull(),
  agentAddress: text("agent_address").notNull(),
  payloadUri: text("payload_uri").notNull(),
  payloadHash: text("payload_hash"),
  proofHash: text("proof_hash"),
  salt: text("salt"),
  status: text("status"),
  bondAmount: numeric("bond_amount"),
  payload: jsonb("payload").notNull(),
  proof: jsonb("proof"),
  executionTrace: jsonb("execution_trace"),
  validation: jsonb("validation"),
  createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  submissionUniquenessKey: text("submission_uniqueness_key")
});

export const proofRecordsTable = pgTable("proof_records", {
  payloadHash: text("payload_hash").primaryKey(),
  vaultKey: text("vault_key").references(() => vaultsTable.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  payloadUri: text("payload_uri").notNull(),
  proofHash: text("proof_hash"),
  sourceProvider: text("source_provider").notNull(),
  txHash: text("tx_hash"),
  chainId: integer("chain_id").notNull(),
  snapshot: jsonb("snapshot").notNull().default([]),
  storedAtMs: bigint("stored_at_ms", { mode: "number" }).notNull()
});

export const authChallengesTable = pgTable("auth_challenges", {
  nonce: text("nonce").primaryKey(),
  kind: text("kind").notNull(),
  walletAddress: text("wallet_address").notNull(),
  agentLabel: text("agent_label"),
  capabilityTags: jsonb("capability_tags"),
  chainId: integer("chain_id").notNull(),
  message: text("message").notNull(),
  issuedAtMs: bigint("issued_at_ms", { mode: "number" }).notNull(),
  expiresAtMs: bigint("expires_at_ms", { mode: "number" }).notNull(),
  consumedAtMs: bigint("consumed_at_ms", { mode: "number" }),
  sourceProvider: text("source_provider").notNull()
});

export const agentRegistrationsTable = pgTable("agent_registrations", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  agentLabel: text("agent_label").notNull(),
  capabilityTags: jsonb("capability_tags").notNull(),
  chainId: integer("chain_id").notNull(),
  registeredAtMs: bigint("registered_at_ms", { mode: "number" }).notNull(),
  lastLoginAtMs: bigint("last_login_at_ms", { mode: "number" }),
  status: text("status").notNull(),
  sourceProvider: text("source_provider").notNull()
});

export const judgeListEntriesTable = pgTable("judge_list_entries", {
  registrationId: text("registration_id")
    .primaryKey()
    .references(() => agentRegistrationsTable.id, { onDelete: "cascade" }),
  id: text("id").notNull().unique(),
  walletAddress: text("wallet_address").notNull().unique(),
  agentLabel: text("agent_label").notNull(),
  capabilityTags: jsonb("capability_tags").notNull(),
  chainId: integer("chain_id").notNull(),
  listedAtMs: bigint("listed_at_ms", { mode: "number" }).notNull(),
  activeStake: numeric("active_stake").notNull(),
  reputationScore: integer("reputation_score").notNull(),
  status: text("status").notNull(),
  sourceProvider: text("source_provider").notNull()
});
