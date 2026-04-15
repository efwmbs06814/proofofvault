alter table agent_profiles
  add column if not exists wallet_provisioned_at_ms bigint;

alter table agent_profiles
  add column if not exists wallet_provider_evidence jsonb not null default '{}'::jsonb;
