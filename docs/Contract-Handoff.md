# Proof of Vault Contract Handoff

This document is the member-1 to member-2 interface handoff for the current Solidity deliverable. It defines the stable contract surface for the X Layer demo, agent orchestration, frontend indexing, and Onchain OS wallet execution.

## Scope

The contract layer does not perform reasoning. It only enforces:

- collateral custody
- agent stake and task bonds
- committee registration and role separation
- reward-side deposits and reward claiming
- commit-reveal, audit, and challenge traces
- final outcome execution
- objective slash paths for hard faults

Reasoning, market-data retrieval, committee selection, payload generation, and reputation scoring stay off-chain.

## On-chain Modules

- `VaultFactory`
- `VaultFactoryLite`
- `VaultEscrow`
- `AgentStaking`
- `ResolutionRegistry`
- `CommitteeRegistry`
- `RewardPool`
- `FeeManager`
- `CompensationPool`

## Contract Addresses

Latest X Layer testnet deployment completed on April 12, 2026.

Network notes:

- X Layer testnet EVM chain id: `1952`
- OKX Onchain OS X Layer chain index: `196`
- Demo stake token used for current test deployment: `0x9FD0baFC570A00506974B6688d1C37F890ade5df`
- Demo deployer and current owner: `0xe779976E47E4c94B94b65f9903B7c2fa7d482e8B`

| Module | Address | Notes |
| --- | --- | --- |
| `VaultFactoryLite` | `0x17Fc3aDe08629055D74d8A09Fdf8a0433ed60503` | Deployable X Layer demo entrypoint for V2 flow |
| `VaultEscrow` | `0x070acb54e7675e41F16639b6Eabcc314F37847Bf` | Collateral lock and outcome execution |
| `AgentStaking` | `0xF0C476763E14426f718a7115B3995ba0EC70e03E` | Stake ledger and task-bond enforcement |
| `ResolutionRegistry` | `0x6b9a390AE10faD4F9e32eB254dB0D5cd3E05a09d` | Criteria, commit/reveal/audit/challenge records |
| `CommitteeRegistry` | `0x27f4d655BE1E26ed7b6e7F01487FC90aCe5A9aC7` | Rule and resolution committees |
| `RewardPool` | `0xff4Aca14a0AF4f1D2439e69672658F561e786587` | Setup deposit, resolution reward deposit, challenge bond, reward claims |
| `FeeManager` | `0x5548c7c9Ac65BA3DF18FBeA3c27004CDd15076cd` | Fees, V2 deposit config, bond config, reward config |
| `CompensationPool` | `0xD577b49de5ff56C9AC7d30e242329b817e2F7488` | Receives `FALSE` collateral |

### Smoke Transactions

- Mock stake token deployed: `0xbc7c50a4b03b2eb5b276af03c45d993deb333c89c433f1238b0be01f43fc11b5`
- Latest `createVaultRequest` on `VaultFactoryLite`: `0x4ab732d24a822e76c0ed5c07f68ce5bab4872d647f8ec39a5704c0be362368da`

### Deployment Caveat

The currently deployed X Layer demo still uses `VaultFactoryLite`. The full `VaultFactory` has since been reworked below
the EIP-170 runtime limit by moving the rule and resolution branches into linked external libraries, so member 2 can
switch to the full entrypoint after a fresh full-protocol X Layer deployment is recorded here.

## Stable Enums

Defined in [contracts/src/libraries/ProofOfVaultTypes.sol](/D:/proofofvault/contracts/src/libraries/ProofOfVaultTypes.sol).

### Vault status

| Name | Value | Meaning |
| --- | --- | --- |
| `DraftRequest` | `0` | Off-chain draft placeholder |
| `RuleAuction` | `1` | Waiting for rule committee registration |
| `RuleDrafting` | `2` | Makers and verifiers are submitting |
| `UserRuleReview` | `3` | Setter can accept or reject the rule set |
| `PendingFunding` | `4` | Reserved for future extension |
| `Active` | `5` | Funded and waiting for settlement time |
| `ResolutionAuction` | `6` | Waiting for resolution committee registration |
| `CommitPhase` | `7` | Validators can commit |
| `RevealPhase` | `8` | Validators can reveal |
| `AuditPhase` | `9` | Auditors can review |
| `PublicChallenge` | `10` | Eligible challengers can open challenges |
| `Resolving` | `11` | Legacy V1 resolving state |
| `ResolvedTrue` | `12` | Finalized `TRUE` |
| `ResolvedFalse` | `13` | Finalized `FALSE` |
| `ResolvedInvalid` | `14` | Finalized `INVALID` |
| `Disputed` | `15` | Legacy V1 disputed state |
| `Cancelled` | `16` | Request cancelled after repeated rejection |

### Resolution outcome

| Name | Value | Meaning |
| --- | --- | --- |
| `None` | `0` | Invalid sentinel |
| `True` | `1` | Claim succeeded |
| `False` | `2` | Claim failed |
| `Invalid` | `3` | Insufficient trustworthy evidence |

### Committee role

| Name | Value | Meaning |
| --- | --- | --- |
| `None` | `0` | Not a committee member |
| `RuleMaker` | `1` | Drafts criteria |
| `RuleVerifier` | `2` | Reviews rule drafts |
| `ResolutionValidator` | `3` | Commits and reveals outcomes |
| `ResolutionAuditor` | `4` | Reviews validator reveals |

### Issue severity

| Name | Value | Meaning |
| --- | --- | --- |
| `None` | `0` | Invalid sentinel |
| `Low` | `1` | Minor issue |
| `Medium` | `2` | Moderate issue |
| `High` | `3` | Serious issue |
| `Critical` | `4` | Must-fix issue |

### Audit verdict

| Name | Value | Meaning |
| --- | --- | --- |
| `None` | `0` | Invalid sentinel |
| `Valid` | `1` | Counts toward consensus |
| `Questionable` | `2` | Does not count, no automatic slash |
| `Invalid` | `3` | Does not count, slash candidate |
| `Malicious` | `4` | Does not count, full slash candidate |

### Challenge status

| Name | Value | Meaning |
| --- | --- | --- |
| `None` | `0` | Invalid sentinel |
| `Open` | `1` | Challenge unresolved |
| `ResolvedSuccess` | `2` | Challenger succeeded |
| `ResolvedFailure` | `3` | Challenger failed |

### Slash reason

| Name | Value | Meaning |
| --- | --- | --- |
| `None` | `0` | Invalid sentinel |
| `CommitRevealMismatch` | `1` | Reveal did not match commit |
| `ForbiddenSource` | `2` | Reserved for off-chain source policy violation |
| `InvalidProof` | `3` | Objectively invalid proof |
| `MaliciousResolution` | `4` | Deliberately malicious resolution |
| `InvalidRuleSet` | `5` | Bad or self-contradictory rule draft |
| `VerifierMisconduct` | `6` | False or abusive issue submission |
| `ChallengeAbuse` | `7` | Failed or abusive challenge path |
| `NonParticipation` | `8` | Committee member failed to participate |
| `ManualReview` | `9` | Manual governance action |

## Roles And Expected Callers

### Setter

- calls `createVaultRequest`
- calls `acceptRuleSetAndFund`
- calls `rejectRuleSet`
- can open a public challenge without being an active agent
- can still use legacy `createVaultAndDeposit` in demo fallback mode

### Agent wallet

Expected to be an Onchain OS Agentic Wallet address.

- calls `stakeForAgent`
- if selected as rule maker:
  - calls `submitRuleDraft`
- if selected as rule verifier:
  - calls `submitRuleIssue`
- if selected as validator:
  - calls `commitResolution`
  - calls `revealResolution`
- if selected as auditor:
  - calls `submitAuditVerdict`
- if eligible challenger:
  - calls `openPublicChallenge`
- any rewarded agent:
  - calls `claimRewards`

### Orchestrator

This is the off-chain service role. It should not be a broad admin wallet. It should be the member-2 workflow service or a tightly scoped ops wallet.

- calls `registerRuleCommittee`
- calls `finalizeRuleSet`
- calls `registerResolutionCommittee`

### Finalizer

- calls `finalizeVault` for legacy V1
- calls `resolveChallenge` for V2
- calls `finalizeV2Vault` for V2

### Safety council

- calls `markVaultDisputed` in the legacy V1 path
- can open a public challenge in V2 even if not an active agent

### Slasher

- calls `slashAgent`
- this is the generic non-task slash path
- on the current X Layer testnet deployment, task-bond slashes are executed by `VaultFactoryLite` through controller authority
- the full reference `VaultFactory` retains the same responsibility in the non-lite implementation

## Stable Public Functions

### Legacy V1 reference-only functions

These functions belong to the full `VaultFactory` implementation. They are not part of the currently deployed
`VaultFactoryLite` testnet entrypoint, but they are available after a fresh full-protocol deployment.

```solidity
function createVaultAndDeposit(
    address collateralToken,
    uint256 grossCollateralAmount,
    uint64 settlementTime,
    bytes32 criteriaHash,
    string calldata metadataURI
) external returns (uint256 vaultId);

function submitResolutionHash(
    uint256 vaultId,
    ProofOfVaultTypes.ResolutionOutcome outcome,
    bytes32 resolutionHash,
    string calldata payloadURI
) external;

function markVaultDisputed(uint256 vaultId, string calldata reasonURI) external;

function finalizeVault(uint256 vaultId) external;
```

### V2 request and rule flow

These functions are part of both the deployed `VaultFactoryLite` surface and the full `VaultFactory` surface. Member 2
should keep binding to the current Lite address until a fresh full `VaultFactory` address is deployed and handed off.

```solidity
function createVaultRequest(
    address collateralToken,
    uint256 grossCollateralAmount,
    uint64 settlementTime,
    string calldata metadataURI
) external returns (uint256 vaultId);

function registerRuleCommittee(
    uint256 vaultId,
    address[] calldata makers,
    address[] calldata verifiers,
    uint64 draftDeadline,
    uint64 issueDeadline
) external;

function submitRuleDraft(uint256 vaultId, bytes32 draftHash, string calldata payloadURI) external;

function submitRuleIssue(
    uint256 vaultId,
    ProofOfVaultTypes.IssueSeverity severity,
    bytes32 issueHash,
    string calldata payloadURI
) external;

function finalizeRuleSet(
    uint256 vaultId,
    bytes32 criteriaHash,
    string calldata metadataURI,
    address[] calldata approvedMakers,
    address[] calldata acceptedVerifiers,
    address[] calldata maliciousMakers,
    address[] calldata maliciousVerifiers
) external;

function rejectRuleSet(uint256 vaultId, string calldata reasonURI) external;

function acceptRuleSetAndFund(uint256 vaultId) external;
```

### V2 resolution flow

```solidity
function registerResolutionCommittee(
    uint256 vaultId,
    address[] calldata validators,
    address[] calldata auditors,
    uint64 commitDeadline,
    uint64 revealDeadline,
    uint64 auditDeadline,
    uint64 challengeDeadline,
    uint8 minValidCount
) external;

function commitResolution(uint256 vaultId, bytes32 commitHash) external;

function revealResolution(
    uint256 vaultId,
    ProofOfVaultTypes.ResolutionOutcome outcome,
    bytes32 proofHash,
    bytes32 salt,
    string calldata payloadURI
) external;

function submitAuditVerdict(
    uint256 vaultId,
    address validator,
    ProofOfVaultTypes.AuditVerdict verdict,
    bytes32 verdictHash,
    string calldata payloadURI
) external;

function openPublicChallenge(
    uint256 vaultId,
    address target,
    bytes32 challengeHash,
    string calldata payloadURI
) external returns (uint256 challengeId);

function resolveChallenge(
    uint256 vaultId,
    uint256 challengeId,
    bool successful,
    ProofOfVaultTypes.CommitteeRole targetRole,
    ProofOfVaultTypes.SlashReasonCode reasonCode,
    uint256 slashAmount
) external;

function finalizeV2Vault(uint256 vaultId) external;

function claimRewards() external returns (uint256 amount);
```

### Read helpers

Current `VaultFactoryLite` deployment exposes:

```solidity
function getVault(uint256 vaultId) external view returns (ProofOfVaultTypes.VaultRecord memory);
```

Reference-only helper reads on the full `VaultFactory`:

```solidity
function ruleDraftOf(uint256 vaultId, uint8 round, address maker)
    external
    view
    returns (ProofOfVaultTypes.RuleDraftRecord memory);
function ruleIssueOf(uint256 vaultId, uint8 round, address verifier)
    external
    view
    returns (ProofOfVaultTypes.RuleIssueRecord memory);
function pendingRuleMetadataURIOf(uint256 vaultId) external view returns (string memory);
```

### Agent stake and task bond

```solidity
function stakeForAgent(uint256 amount) external;
function requestWithdrawal(uint256 amount) external;
function completeWithdrawal() external;
function activeStakeOf(address agent) external view returns (uint256);
function freeStakeOf(address agent) external view returns (uint256);
function pendingWithdrawalOf(address agent) external view returns (uint256 amount, uint64 readyAt);
function taskBondOf(address agent, uint256 vaultId, ProofOfVaultTypes.CommitteeRole role)
    external
    view
    returns (ProofOfVaultTypes.TaskBondRecord memory);
function isActiveAgent(address agent) external view returns (bool);
```

### Resolution registry reads

```solidity
function criteriaOf(uint256 vaultId) external view returns (ProofOfVaultTypes.CriteriaRecord memory);
function resolutionOf(uint256 vaultId) external view returns (ProofOfVaultTypes.ResolutionRecord memory);
function commitOf(uint256 vaultId, uint8 round, address validator)
    external
    view
    returns (ProofOfVaultTypes.CommitRecord memory);
function revealOf(uint256 vaultId, uint8 round, address validator)
    external
    view
    returns (ProofOfVaultTypes.RevealRecord memory);
function auditVerdictOf(uint256 vaultId, uint8 round, address validator, address auditor)
    external
    view
    returns (ProofOfVaultTypes.AuditVerdictRecord memory);
function challengeOf(uint256 vaultId, uint8 round, uint256 challengeId)
    external
    view
    returns (ProofOfVaultTypes.ChallengeRecord memory);
function challengeCountOf(uint256 vaultId, uint8 round) external view returns (uint256);
```

### Committee registry reads

```solidity
function ruleCommitteeOf(uint256 vaultId) external view returns (RuleCommitteeConfig memory);
function resolutionCommitteeOf(uint256 vaultId) external view returns (ResolutionCommitteeConfig memory);
function ruleRoleOf(uint256 vaultId, address member) external view returns (ProofOfVaultTypes.CommitteeRole);
function resolutionRoleOf(uint256 vaultId, address member) external view returns (ProofOfVaultTypes.CommitteeRole);
function ruleMakersOf(uint256 vaultId) external view returns (address[] memory);
function ruleVerifiersOf(uint256 vaultId) external view returns (address[] memory);
function resolutionValidatorsOf(uint256 vaultId) external view returns (address[] memory);
function resolutionAuditorsOf(uint256 vaultId) external view returns (address[] memory);
```

### Fee and reward configuration reads

```solidity
function previewCreationFee(uint256 collateralAmount) external view returns (uint256);
function previewSettlementFee(uint256 collateralAmount) external view returns (uint256);
function previewSetupDeposit() external view returns (uint256);
function previewResolutionRewardDeposit() external view returns (uint256);
function previewChallengeBond() external view returns (uint256);
function proofSubmissionFee() external view returns (uint256);
function bondForRole(ProofOfVaultTypes.CommitteeRole role) external view returns (uint256);
function ruleVerifierReward(ProofOfVaultTypes.IssueSeverity severity) external view returns (uint256);
function validatorBaseReward() external view returns (uint256);
function validatorQualityReward() external view returns (uint256);
function validatorConsensusReward() external view returns (uint256);
function validatorQuestionableReward() external view returns (uint256);
function auditorBaseReward() external view returns (uint256);
function auditorHighValueReward() external view returns (uint256);
function challengerSuccessReward() external view returns (uint256);
function challengeFailureSlashBps() external view returns (uint16);
```

## Event Schema To Index

Member 2 should index these events first.

Treat this list as the repo-wide superset. The deployed `VaultFactoryLite` testnet entrypoint emits the V2 event subset
and does not emit the legacy V1-only factory events.

### VaultFactory / VaultFactoryLite

- `VaultCreated`
- `VaultRequestCreated`
- `RuleCommitteeRegistered`
- `RuleDraftSubmitted`
- `RuleIssueSubmitted`
- `RuleSetFinalized`
- `RuleSetRejected`
- `RuleSetAccepted`
- `ResolutionCommitteeRegistered`
- `ResolutionCommitted`
- `ResolutionRevealed`
- `AuditVerdictSubmitted`
- `PublicChallengeOpened`
- `PublicChallengeResolved`
- `ResolutionRoundReopened`
- `ResolutionSubmitted`
- `VaultDisputed`
- `VaultFinalized`

### AgentStaking

- `AgentStaked`
- `WithdrawalRequested`
- `WithdrawalCompleted`
- `TaskBondLocked`
- `TaskBondReleased`
- `TaskBondSlashed`
- `AgentSlashed`

### ResolutionRegistry

- `CriteriaRegistered`
- `ResolutionSubmitted`
- `ResolutionDisputed`
- `ResolutionFinalized`
- `ResolutionCommitRecorded`
- `ResolutionRevealRecorded`
- `AuditVerdictRecorded`
- `ChallengeOpened`
- `ChallengeResolved`

### RewardPool

- `SetupDepositCollected`
- `ResolutionRewardDepositCollected`
- `ChallengeBondCollected`
- `SetupRewardAllocated`
- `ResolutionRewardAllocated`
- `ChallengeBondAllocated`
- `ChallengeBondRefunded`
- `ChallengeBondTreasurySweep`
- `RewardClaimed`

### VaultEscrow and CompensationPool

- `CollateralLocked`
- `CollateralReleased`
- `CollateralRefunded`
- `CollateralSlashed`
- `SlashDepositRecorded`

## Off-chain Payload Conventions

Only hashes and URIs are committed on-chain. Member 2 must keep the payloads stable now.

### Canonical hashing rule

- serialize JSON with deterministic key order
- normalize enums as uppercase strings
- normalize addresses as lowercase hex
- normalize numbers as strings
- hash the UTF-8 bytes with `keccak256`

### Rule draft payload

Suggested fields:

```json
{
  "vaultId": 12,
  "round": 1,
  "template": "fdv_above_at_time",
  "statement": "FDV must be above 1000000 USD 24 hours after public sale",
  "inputs": {
    "tokenAddress": "0x...",
    "thresholdUsd": "1000000",
    "observationTime": "2026-04-15T12:00:00Z"
  },
  "sources": [
    {
      "provider": "okx-market-skill",
      "kind": "market-data"
    }
  ],
  "version": 1
}
```

### Rule issue payload

Suggested fields:

```json
{
  "vaultId": 12,
  "round": 1,
  "severity": "HIGH",
  "issueType": "ambiguous_source_policy",
  "notes": "Primary and fallback source priorities are underspecified.",
  "version": 1
}
```

### Resolution reveal payload

Suggested fields:

```json
{
  "vaultId": 12,
  "round": 1,
  "result": "TRUE",
  "confidenceScore": 0.93,
  "sources": [
    {
      "provider": "okx-market-skill",
      "value": "1340000",
      "timestamp": "2026-04-15T12:00:03Z"
    }
  ],
  "reasoning": "FDV remained above threshold at observation time.",
  "submittedByAgent": "0x...",
  "version": 1
}
```

### Audit verdict payload

Suggested fields:

```json
{
  "vaultId": 12,
  "round": 1,
  "validator": "0x...",
  "verdict": "VALID",
  "findings": [],
  "reviewerAgent": "0x...",
  "version": 1
}
```

### Public challenge payload

Suggested fields:

```json
{
  "vaultId": 12,
  "round": 1,
  "target": "0x...",
  "targetRole": "ResolutionValidator",
  "reason": "proof_hash_payload_mismatch",
  "evidence": [
    {
      "uri": "ipfs://..."
    }
  ],
  "challenger": "0x...",
  "version": 1
}
```

## Integration Rules

- never write directly to `ResolutionRegistry`, `RewardPool`, `CommitteeRegistry`, or `VaultEscrow` from the frontend
- setter and agent wallets should always go through the current live factory entrypoint for workflow actions
- on the current X Layer testnet deployment, that live entrypoint is `VaultFactoryLite`
- after a fresh full deployment, switch the factory address to `VaultFactory` to access both V1 and full V2 in one entrypoint
- treat `Invalid` as a first-class business outcome
- treat `ResolutionRoundReopened` as a signal to regenerate committee tasks for the next round
- do not show a validator as slash-worthy only because they disagreed with the majority; hard slash only follows objective faults or resolved challenge outcomes

## Recommended Demo Path

### Preferred V2 demo

1. Setter calls `createVaultRequest`.
2. Orchestrator registers rule committee.
3. Rule makers and verifiers submit payload hashes.
4. Orchestrator finalizes the rule set.
5. Setter accepts and funds.
6. Orchestrator registers resolution committee.
7. Validators commit and reveal via Agentic Wallet.
8. Auditors submit verdicts.
9. Optional challenger opens a challenge bond.
10. Finalizer resolves challenge and finalizes the vault.
11. Agents claim rewards.

### Fallback V1 demo

This fallback path belongs to the full `VaultFactory` and is not part of the current `VaultFactoryLite` testnet entrypoint.

1. Setter calls `createVaultAndDeposit`.
2. Agent stakes and submits a resolution hash.
3. Safety council can dispute if needed.
4. Finalizer finalizes the vault.

## Current Test Coverage Snapshot

The current Foundry suite covers:

- legacy create and finalize flows
- compensation-pool safety boundaries
- V2 request, committee, accept, and reject flows
- duplicate committee-role prevention
- task-bond locking and objective slash boundaries
- commit-reveal mismatch
- challenge success and challenge failure handling
- idle auditor and missing-participation slashes
- round retry and invalid-consensus fallback
- reward claiming
