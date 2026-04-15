import { afterEach, describe, expect, it } from "vitest";

import type { FastifyInstance } from "fastify";
import {
  MOCK_AGENTIC_WALLET_ADDRESS,
  MockAgenticWalletProvider,
  MockOnchainGateway
} from "@proof-of-vault/agent-runtime";
import { DEFAULT_OKX_CHAIN_INDEX, DEFAULT_TARGET_EVM_CHAIN_ID, type AgentProfile } from "@proof-of-vault/shared-types";

import { buildApp } from "../src/app.js";
import type { AppPersistence } from "../src/db/factory.js";
import { createPgMemPersistenceFactory } from "./pg-mem-persistence.js";

const POSTGRES_TEST_ENV = {
  PROOF_OF_VAULT_STORAGE: "postgres",
  DATABASE_URL: "https://proof-of-vault.test/postgres",
  PROOF_OF_VAULT_DEMO_MODE: false,
  PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
  PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
  PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
  PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
} as const;

const seededAgents: AgentProfile[] = [
  {
    address: "0x1111111111111111111111111111111111111111",
    walletAddress: "0x1111111111111111111111111111111111111111",
    label: "Maker Alpha",
    capabilityTags: ["rule-maker"],
    reputationScore: 88,
    activeStake: "2000",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  },
  {
    address: "0x3333333333333333333333333333333333333333",
    walletAddress: "0x3333333333333333333333333333333333333333",
    label: "Verifier Gamma",
    capabilityTags: ["rule-verifier"],
    reputationScore: 86,
    activeStake: "1800",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  },
  {
    address: "0x4444444444444444444444444444444444444444",
    walletAddress: "0x4444444444444444444444444444444444444444",
    label: "Validator Delta",
    capabilityTags: ["validator"],
    reputationScore: 92,
    activeStake: "3000",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  },
  {
    address: "0x7777777777777777777777777777777777777777",
    walletAddress: "0x7777777777777777777777777777777777777777",
    label: "Auditor Eta",
    capabilityTags: ["auditor"],
    reputationScore: 84,
    activeStake: "2400",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  }
];

async function buildPersistedApp(factory: {
  createPersistence: () => Promise<AppPersistence>;
}, options: Parameters<typeof buildApp>[0] = {}): Promise<{ app: FastifyInstance; persistence: AppPersistence }> {
  const persistence = await factory.createPersistence();
  const app = await buildApp({
    ...options,
    envOverrides: {
      ...POSTGRES_TEST_ENV,
      ...(options.envOverrides ?? {})
    },
    persistence
  });

  return { app, persistence };
}

async function seedJudgeListedAgents(persistence: AppPersistence, agents = seededAgents): Promise<void> {
  for (const agent of agents) {
    await persistence.workflowStore.seedJudgeListedAgent(agent);
  }
}

class SelectiveFailOnchainGateway extends MockOnchainGateway {
  constructor(private readonly failStage: "rule" | "resolution") {
    super(DEFAULT_TARGET_EVM_CHAIN_ID);
  }

  override async registerRuleCommittee(...args: Parameters<MockOnchainGateway["registerRuleCommittee"]>) {
    if (this.failStage === "rule") {
      throw new Error("forced rule committee registration failure");
    }

    return super.registerRuleCommittee(...args);
  }

  override async registerResolutionCommittee(...args: Parameters<MockOnchainGateway["registerResolutionCommittee"]>) {
    if (this.failStage === "resolution") {
      throw new Error("forced resolution committee registration failure");
    }

    return super.registerResolutionCommittee(...args);
  }
}

describe("Proof of Vault Postgres persistence", () => {
  const openApps = new Set<FastifyInstance>();

  afterEach(async () => {
    for (const app of openApps) {
      await app.close();
    }

    openApps.clear();
  });

  it("keeps vault data after app restart and reports postgres health", async () => {
    const factory = await createPgMemPersistenceFactory();

    const first = await buildPersistedApp(factory);
    openApps.add(first.app);

    const healthResponse = await first.app.inject({
      method: "GET",
      url: "/health"
    });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toMatchObject({
      ok: true,
      storageMode: "postgres",
      database: {
        ok: true,
        driver: "postgres",
        migrationsApplied: true,
        missingTables: []
      }
    });

    const createVaultResponse = await first.app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/persisted-vault",
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(createVaultResponse.statusCode).toBe(200);
    const vault = createVaultResponse.json();

    await first.app.close();
    openApps.delete(first.app);

    const second = await buildPersistedApp(factory);
    openApps.add(second.app);

    const detailResponse = await second.app.inject({
      method: "GET",
      url: `/vaults/${vault.id}`
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: vault.id,
      metadataURI: "ipfs://proof-of-vault/tests/persisted-vault",
      status: "DraftRequest"
    });
  });

  it("keeps registration and judge list state after app restart", async () => {
    const factory = await createPgMemPersistenceFactory();
    const signer = new MockAgenticWalletProvider();

    const first = await buildPersistedApp(factory);
    openApps.add(first.app);

    const challengeResponse = await first.app.inject({
      method: "POST",
      url: "/agent-registrations/challenge",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        agentLabel: "Persistent Agent",
        capabilityTags: ["validator"],
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(challengeResponse.statusCode).toBe(200);
    const challenge = challengeResponse.json();

    const proof = await signer.signMessage({
      action: "signPreRegistration",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: challenge.message,
      nonce: challenge.nonce,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    const registrationResponse = await first.app.inject({
      method: "POST",
      url: "/agent-registrations",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: challenge.nonce,
        signature: proof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(registrationResponse.statusCode).toBe(200);
    const registration = registrationResponse.json().registration;

    const judgeListResponse = await first.app.inject({
      method: "POST",
      url: "/judge-list",
      payload: {
        registrationId: registration.id
      }
    });
    expect(judgeListResponse.statusCode).toBe(200);

    await first.app.close();
    openApps.delete(first.app);

    const second = await buildPersistedApp(factory);
    openApps.add(second.app);

    const registrationDetailResponse = await second.app.inject({
      method: "GET",
      url: `/agent-registrations/${registration.id}`
    });
    expect(registrationDetailResponse.statusCode).toBe(200);
    expect(registrationDetailResponse.json()).toMatchObject({
      id: registration.id,
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS.toLowerCase(),
      status: "judge_listed"
    });

    const judgeListEntriesResponse = await second.app.inject({
      method: "GET",
      url: "/judge-list"
    });
    expect(judgeListEntriesResponse.statusCode).toBe(200);
    expect(
      judgeListEntriesResponse.json().some((entry: { registrationId: string }) => entry.registrationId === registration.id)
    ).toBe(true);
  });

  it("keeps submissions and proofs after restart", async () => {
    const factory = await createPgMemPersistenceFactory();

    const first = await buildPersistedApp(factory);
    openApps.add(first.app);

    for (const agent of seededAgents) {
      await first.persistence.workflowStore.seedJudgeListedAgent(agent);
    }

    const createVaultResponse = await first.app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/persisted-workflow",
        setterAddress: "0x9999999999999999999999999999999999999999",
        statement: "FDV must remain above 1000000 USD at settlement time.",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() - 1000,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(createVaultResponse.statusCode).toBe(200);
    const vault = createVaultResponse.json();

    const committeeResponse = await first.app.inject({
      method: "POST",
      url: `/vaults/${vault.id}/rule-committee`,
      payload: {
        makerCount: 1,
        verifierCount: 1,
        draftDeadlineAt: Date.now() - 500,
        issueDeadlineAt: Date.now() - 250,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });
    expect(committeeResponse.statusCode).toBe(200);
    const committeeVault = committeeResponse.json();

    const maker = committeeVault.ruleCommittee.makers[0];
    const verifier = committeeVault.ruleCommittee.verifiers[0];

    const draftResponse = await first.app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: {
        kind: "rule_draft",
        vaultId: Number(vault.id),
        round: 1,
        agentAddress: maker,
        payloadURI: "ipfs://proof-of-vault/tests/persisted-rule-draft",
        payload: {
          vaultId: Number(vault.id),
          round: 1,
          template: "fdv_above_at_time",
          statement: "FDV must remain above 1000000 USD at settlement time.",
          inputs: {
            tokenAddress: "0x8888888888888888888888888888888888888888",
            thresholdUsd: "1000000"
          },
          sources: [],
          version: 1
        }
      }
    });
    expect(draftResponse.statusCode).toBe(200);

    const issueResponse = await first.app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: {
        kind: "rule_issue",
        vaultId: Number(vault.id),
        round: 1,
        agentAddress: verifier,
        payloadURI: "ipfs://proof-of-vault/tests/persisted-rule-issue",
        payload: {
          vaultId: Number(vault.id),
          round: 1,
          severity: "HIGH",
          issueType: "ambiguous_source_policy",
          notes: "Clarify the source priority.",
          version: 1
        }
      }
    });
    expect(issueResponse.statusCode).toBe(200);

    await first.app.close();
    openApps.delete(first.app);

    const second = await buildPersistedApp(factory);
    openApps.add(second.app);

    const detailResponse = await second.app.inject({
      method: "GET",
      url: `/vaults/${vault.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().submissions).toHaveLength(2);
    expect(detailResponse.json().proofs).toHaveLength(2);
  });

  it("reports postgres readiness failure when migrations are missing", async () => {
    const factory = await createPgMemPersistenceFactory({ migrated: false });
    const { app } = await buildPersistedApp(factory);
    openApps.add(app);

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toMatchObject({
      ok: false,
      storageMode: "postgres",
      database: {
        ok: false,
        migrationsApplied: false
      }
    });
    expect(healthResponse.json().database.missingTables).toEqual(
      expect.arrayContaining(["vaults", "agent_profiles", "agent_submissions", "proof_records"])
    );
  });

  it("does not persist a rule committee locally when the on-chain registration fails", async () => {
    const factory = await createPgMemPersistenceFactory();
    const { app, persistence } = await buildPersistedApp(factory, {
      runtimeOverrides: {
        onchainGateway: new SelectiveFailOnchainGateway("rule")
      }
    });
    openApps.add(app);
    await seedJudgeListedAgents(persistence, seededAgents.slice(0, 2));

    const createVaultResponse = await app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/rule-committee-failure",
        setterAddress: "0x9999999999999999999999999999999999999999",
        statement: "FDV must remain above the agreed threshold.",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() + 3600_000,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(createVaultResponse.statusCode).toBe(200);
    const vault = createVaultResponse.json();

    const committeeResponse = await app.inject({
      method: "POST",
      url: `/vaults/${vault.id}/rule-committee`,
      payload: {
        makerCount: 1,
        verifierCount: 1,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    expect(committeeResponse.statusCode).toBe(500);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/vaults/${vault.id}`
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: vault.id,
      status: "DraftRequest"
    });
    expect(detailResponse.json().ruleCommittee).toBeUndefined();
  });

  it("does not persist a resolution committee locally when the on-chain registration fails", async () => {
    const factory = await createPgMemPersistenceFactory();
    const { app, persistence } = await buildPersistedApp(factory, {
      runtimeOverrides: {
        onchainGateway: new SelectiveFailOnchainGateway("resolution")
      }
    });
    openApps.add(app);
    await seedJudgeListedAgents(persistence, [seededAgents[2]!, seededAgents[3]!]);

    const createVaultResponse = await app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/resolution-committee-failure",
        setterAddress: "0x9999999999999999999999999999999999999999",
        statement: "FDV must remain above the agreed threshold.",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() + 3600_000,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(createVaultResponse.statusCode).toBe(200);
    const vault = createVaultResponse.json();
    const storedVault = await persistence.workflowStore.getVault(vault.id);
    await persistence.workflowStore.saveVault({
      ...storedVault!,
      status: "Active",
      updatedAt: Date.now()
    });

    const committeeResponse = await app.inject({
      method: "POST",
      url: `/vaults/${vault.id}/resolution-committee`,
      payload: {
        validatorCount: 1,
        auditorCount: 1,
        minValidCount: 1,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    expect(committeeResponse.statusCode).toBe(500);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/vaults/${vault.id}`
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: vault.id,
      status: "Active"
    });
    expect(detailResponse.json().resolutionCommittee).toBeUndefined();
  });

  it("allows only one successful use of the same pre-registration nonce", async () => {
    const factory = await createPgMemPersistenceFactory();
    const signer = new MockAgenticWalletProvider();
    const { app } = await buildPersistedApp(factory);
    openApps.add(app);

    const challengeResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/challenge",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        agentLabel: "Concurrent Agent",
        capabilityTags: ["validator"],
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(challengeResponse.statusCode).toBe(200);
    const challenge = challengeResponse.json();
    const proof = await signer.signMessage({
      action: "signPreRegistration",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: challenge.message,
      nonce: challenge.nonce,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: challenge.nonce,
        signature: proof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: challenge.nonce,
        signature: proof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });

    expect(firstResponse.statusCode).toBe(200);
    expect([404, 409]).toContain(secondResponse.statusCode);
  });

  it("allows only one successful use of the same login nonce", async () => {
    const factory = await createPgMemPersistenceFactory();
    const signer = new MockAgenticWalletProvider();
    const { app } = await buildPersistedApp(factory);
    openApps.add(app);

    const registrationChallengeResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/challenge",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        agentLabel: "Login Race Agent",
        capabilityTags: ["validator"],
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    const registrationChallenge = registrationChallengeResponse.json();
    const registrationProof = await signer.signMessage({
      action: "signPreRegistration",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: registrationChallenge.message,
      nonce: registrationChallenge.nonce,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
    const registrationResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: registrationChallenge.nonce,
        signature: registrationProof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(registrationResponse.statusCode).toBe(200);

    const loginChallengeResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/login-challenge",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(loginChallengeResponse.statusCode).toBe(200);
    const loginChallenge = loginChallengeResponse.json();
    const loginProof = await signer.signMessage({
      action: "signLogin",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: loginChallenge.message,
      nonce: loginChallenge.nonce,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/login",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: loginChallenge.nonce,
        signature: loginProof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/login",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: loginChallenge.nonce,
        signature: loginProof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });

    expect(firstResponse.statusCode).toBe(200);
    expect([404, 409]).toContain(secondResponse.statusCode);
  });

  it("returns 409 for duplicate submissions without leaving orphan proofs", async () => {
    const factory = await createPgMemPersistenceFactory();
    const { app, persistence } = await buildPersistedApp(factory);
    openApps.add(app);
    await seedJudgeListedAgents(persistence, seededAgents.slice(0, 2));

    const createVaultResponse = await app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/duplicate-submission",
        setterAddress: "0x9999999999999999999999999999999999999999",
        statement: "FDV must remain above 1000000 USD at settlement time.",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() - 1000,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(createVaultResponse.statusCode).toBe(200);
    const vault = createVaultResponse.json();

    const committeeResponse = await app.inject({
      method: "POST",
      url: `/vaults/${vault.id}/rule-committee`,
      payload: {
        makerCount: 1,
        verifierCount: 1,
        draftDeadlineAt: Date.now() - 500,
        issueDeadlineAt: Date.now() - 250,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });
    expect(committeeResponse.statusCode).toBe(200);
    const maker = committeeResponse.json().ruleCommittee.makers[0];

    const duplicatePayload = {
      kind: "rule_draft",
      vaultId: Number(vault.id),
      round: 1,
      agentAddress: maker,
      payloadURI: "ipfs://proof-of-vault/tests/duplicate-rule-draft",
      payload: {
        vaultId: Number(vault.id),
        round: 1,
        template: "fdv_above_at_time",
        statement: "FDV must remain above 1000000 USD at settlement time.",
        inputs: {
          tokenAddress: "0x8888888888888888888888888888888888888888",
          thresholdUsd: "1000000"
        },
        sources: [],
        version: 1
      }
    };

    const firstResponse = await app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: duplicatePayload
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: duplicatePayload
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(409);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/vaults/${vault.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().submissions).toHaveLength(1);
    expect(detailResponse.json().proofs).toHaveLength(1);
  });
});
