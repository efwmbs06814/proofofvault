create sequence if not exists vault_local_id_seq start 1;

create table if not exists vaults (
  id text primary key,
  external_vault_id bigint unique,
  chain_id integer not null,
  legacy_mode boolean not null default false,
  setter_address text,
  status text not null,
  statement text,
  metadata_uri text not null,
  collateral_token text,
  gross_collateral_amount numeric not null,
  settlement_time_ms bigint,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  rule_round integer not null default 0,
  resolution_round integer not null default 0,
  rejection_count integer not null default 0,
  criteria_hash text,
  rule_committee jsonb,
  resolution_committee jsonb,
  final_resolution jsonb,
  onchain_snapshot jsonb,
  traces jsonb not null default '[]'::jsonb
);

create table if not exists agent_profiles (
  address text primary key,
  wallet_address text,
  label text not null,
  capability_tags jsonb not null,
  reputation_score integer not null,
  active_stake numeric not null,
  can_use_agentic_wallet boolean not null default true,
  status text not null,
  wallet_provider text not null,
  updated_at_ms bigint not null
);

create table if not exists agent_submissions (
  id text primary key,
  vault_key text not null references vaults(id) on delete cascade,
  vault_id bigint not null,
  kind text not null,
  round integer not null,
  agent_address text not null,
  payload_uri text not null,
  payload_hash text,
  proof_hash text,
  salt text,
  status text,
  bond_amount numeric,
  payload jsonb not null,
  proof jsonb,
  execution_trace jsonb,
  validation jsonb,
  created_at_ms bigint not null,
  submission_uniqueness_key text unique
);

create index if not exists agent_submissions_vault_key_created_at_idx
  on agent_submissions (vault_key, created_at_ms);

create table if not exists proof_records (
  payload_hash text primary key,
  vault_key text not null references vaults(id) on delete cascade,
  payload jsonb not null,
  payload_uri text not null,
  proof_hash text,
  source_provider text not null,
  tx_hash text,
  chain_id integer not null,
  snapshot jsonb not null default '[]'::jsonb,
  stored_at_ms bigint not null
);

create index if not exists proof_records_vault_key_stored_at_idx
  on proof_records (vault_key, stored_at_ms);

create table if not exists auth_challenges (
  nonce text primary key,
  kind text not null,
  wallet_address text not null,
  agent_label text,
  capability_tags jsonb,
  chain_id integer not null,
  message text not null,
  issued_at_ms bigint not null,
  expires_at_ms bigint not null,
  consumed_at_ms bigint,
  source_provider text not null
);

create index if not exists auth_challenges_wallet_kind_expiry_idx
  on auth_challenges (wallet_address, kind, expires_at_ms);

create table if not exists agent_registrations (
  id text primary key,
  wallet_address text not null unique,
  agent_label text not null,
  capability_tags jsonb not null,
  chain_id integer not null,
  registered_at_ms bigint not null,
  last_login_at_ms bigint,
  status text not null,
  source_provider text not null
);

create table if not exists judge_list_entries (
  registration_id text primary key references agent_registrations(id) on delete cascade,
  id text not null unique,
  wallet_address text not null unique,
  agent_label text not null,
  capability_tags jsonb not null,
  chain_id integer not null,
  listed_at_ms bigint not null,
  active_stake numeric not null,
  reputation_score integer not null,
  status text not null,
  source_provider text not null
);
