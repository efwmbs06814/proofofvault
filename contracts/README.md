# Proof of Vault Contracts

This directory contains the Solidity implementation for the member-1 deliverable of Proof of Vault.

## Modules

- `VaultFactory.sol`
- `VaultFactoryLite.sol`
- `VaultEscrow.sol`
- `AgentStaking.sol`
- `ResolutionRegistry.sol`
- `CommitteeRegistry.sol`
- `RewardPool.sol`
- `FeeManager.sol`
- `CompensationPool.sol`

## Supported Flows

### Legacy V1

- create a vault and lock collateral in one transaction
- collect creation fee and settlement fee
- require active agent stake before resolution submission
- finalize `TRUE`, `FALSE`, and `INVALID`
- route failed vault collateral into the compensation pool

### Hackathon V2

- create a vault request with setup deposit
- register rule makers and rule verifiers
- lock task-specific bonds for committee participation
- submit rule drafts and issues
- accept or reject the finalized rule set
- fund collateral and resolution reward deposit
- register validators and auditors
- commit and reveal resolution outputs
- audit each validator submission
- open and resolve public challenges with challenge bonds
- finalize with valid-only consensus or `INVALID` fallback
- claim agent rewards from the reward pool

## Design Boundaries

- reasoning stays off-chain
- only hashes, URIs, and final outcomes are stored on-chain
- Onchain OS Agentic Wallet is expected to drive agent transactions
- market data and payload generation are expected to come from member-2 services

## Commands

```bash
forge build
forge test -vv
forge coverage --ir-minimum
```

## Deploy

```bash
forge script script/DeployProofOfVault.s.sol:DeployProofOfVault --root contracts --rpc-url <RPC_URL> --broadcast
```

Use `DeployProofOfVault` for new full-protocol deployments. `VaultFactory` now uses linked external libraries for the
rule and resolution state-machine branches, keeping the complete V1 + V2 entrypoint below the EIP-170 size limit.
`DeployProofOfVaultLite` remains available for the existing lightweight X Layer demo deployment.

Required deploy env vars are documented in `contracts/.env.example`.

Latest local X Layer testnet deployment:

- `VaultFactoryLite`: `0x17Fc3aDe08629055D74d8A09Fdf8a0433ed60503`
- `VaultEscrow`: `0x070acb54e7675e41F16639b6Eabcc314F37847Bf`
- `ResolutionRegistry`: `0x6b9a390AE10faD4F9e32eB254dB0D5cd3E05a09d`
- `CommitteeRegistry`: `0x27f4d655BE1E26ed7b6e7F01487FC90aCe5A9aC7`
- `AgentStaking`: `0xF0C476763E14426f718a7115B3995ba0EC70e03E`
- `RewardPool`: `0xff4Aca14a0AF4f1D2439e69672658F561e786587`
- `FeeManager`: `0x5548c7c9Ac65BA3DF18FBeA3c27004CDd15076cd`
- `CompensationPool`: `0xD577b49de5ff56C9AC7d30e242329b817e2F7488`

## Handoff

- member-2 contract handoff: [../docs/Contract-Handoff.md](../docs/Contract-Handoff.md)
- member-2 implementation checklist: [../docs/Member-2-Implementation-Checklist.zh-CN.md](../docs/Member-2-Implementation-Checklist.zh-CN.md)
