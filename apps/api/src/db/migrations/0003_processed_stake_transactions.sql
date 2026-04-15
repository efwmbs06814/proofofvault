create table if not exists processed_stake_transactions (
  tx_hash text primary key,
  agent_address text not null,
  amount numeric not null,
  recorded_at_ms bigint not null
);

create index if not exists processed_stake_transactions_agent_idx
  on processed_stake_transactions (agent_address, recorded_at_ms);
