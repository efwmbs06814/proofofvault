import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { FastifyInstance } from "fastify";
import {
  computeResolutionCommitHash,
  type AgenticWalletProvider,
  MOCK_AGENTIC_WALLET_ADDRESS,
  MockAgenticWalletProvider,
  MockMarketDataProvider,
  MockOnchainGateway,
  hashPayload
} from "@proof-of-vault/agent-runtime";
import { buildPayloadUploadMessage, DEFAULT_OKX_CHAIN_INDEX, DEFAULT_TARGET_EVM_CHAIN_ID } from "@proof-of-vault/shared-types";
import { privateKeyToAccount } from "viem/accounts";

import { buildApp } from "../src/app.js";
import { createMemoryPersistence } from "../src/db/factory.js";
import { AgentWalletService } from "../src/services/agent-wallet-service.js";
import { SubmissionService } from "../src/services/submission-service.js";

class VerifiedRegisterGateway extends MockOnchainGateway {
  constructor(
    private readonly expected: {
      vaultId: number;
      txHash: `0x${string}`;
      setterAddress: `0x${string}`;
      collateralToken: `0x${string}`;
      grossCollateralAmount: string;
      settlementTime: number;
      metadataURI: string;
    }
  ) {
    super(DEFAULT_TARGET_EVM_CHAIN_ID);
  }

  override async verifyVaultRequest(vaultId: number, txHash: `0x${string}`) {
    expect(vaultId).toBe(this.expected.vaultId);
    expect(txHash).toBe(this.expected.txHash);

    return {
      ...this.expected,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      txHash
    };
  }

  override async readVaultSnapshot(vault: Parameters<MockOnchainGateway["readVaultSnapshot"]>[0]) {
    const snapshot = await super.readVaultSnapshot(vault);
    return {
      ...snapshot,
      vaultId: this.expected.vaultId,
      setterAddress: this.expected.setterAddress,
      collateralToken: this.expected.collateralToken,
      grossCollateralAmount: this.expected.grossCollateralAmount,
      settlementTime: this.expected.settlementTime,
      metadataURI: this.expected.metadataURI
    };
  }
}

const productionEnvOverrides = {
  NODE_ENV: "production",
  PROOF_OF_VAULT_STORAGE: "postgres",
  DATABASE_URL: "https://proof-of-vault.test/postgres",
  PROOF_OF_VAULT_DEMO_MODE: false,
  PROOF_OF_VAULT_ONCHAIN_GATEWAY: "viem",
  PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
  PROOF_OF_VAULT_MARKET_PROVIDER: "okx",
  PROOF_OF_VAULT_PAYLOAD_PROVIDER: "ipfs",
  PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false,
  PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
  PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
  PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
  PROOF_OF_VAULT_RPC_URL: "https://rpc.example.test",
  PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
  PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
  PROOF_OF_VAULT_POV_TOKEN_ADDRESS: "0x3333333333333333333333333333333333333333",
  PROOF_OF_VAULT_REWARD_POOL_ADDRESS: "0x4444444444444444444444444444444444444444",
  PROOF_OF_VAULT_WOKB_ADDRESS: "0x5555555555555555555555555555555555555555",
  PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890",
  PROOF_OF_VAULT_OPERATOR_API_TOKEN: "proof-of-vault-operator-token-for-tests",
  PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY: `0x${"1".repeat(64)}`,
  PROOF_OF_VAULT_IPFS_PINNING_URL: "https://ipfs.example.test/pin",
  PROOF_OF_VAULT_IPFS_PINNING_JWT: "test-ipfs-jwt",
  PROOF_OF_VAULT_WEB_BASE_URL: "https://app.proofofvault.test",
  PROOF_OF_VAULT_PUBLIC_API_BASE_URL: "https://api.proofofvault.test"
} as const;

async function authenticateMockAgent(
  targetApp: FastifyInstance,
  walletAddress = MOCK_AGENTIC_WALLET_ADDRESS,
  options?: {
    agentLabel?: string;
    capabilityTags?: string[];
    initialStake?: string;
  }
) {
  const signer = new MockAgenticWalletProvider();
  const registrationChallengeResponse = await targetApp.inject({
    method: "POST",
    url: "/agent-registrations/challenge",
    payload: {
      walletAddress,
      agentLabel: options?.agentLabel ?? "Authenticated Agent",
      capabilityTags: options?.capabilityTags ?? ["validator"],
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    }
  });
  expect(registrationChallengeResponse.statusCode).toBe(200);
  const registrationChallenge = registrationChallengeResponse.json();

  const registrationProof = await signer.signMessage({
    action: "signPreRegistration",
    walletAddress,
    message: registrationChallenge.message,
    nonce: registrationChallenge.nonce,
    chainId: DEFAULT_TARGET_EVM_CHAIN_ID
  });

  const registrationResponse = await targetApp.inject({
    method: "POST",
    url: "/agent-registrations",
    payload: {
      walletAddress,
      nonce: registrationChallenge.nonce,
      signature: registrationProof.signature,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    }
  });
  expect(registrationResponse.statusCode).toBe(200);

  const judgeListResponse = await targetApp.inject({
    method: "POST",
    url: "/judge-list",
    payload: {
      registrationId: registrationResponse.json().registration.id
    }
  });
  expect(judgeListResponse.statusCode).toBe(200);

  const loginChallengeResponse = await targetApp.inject({
    method: "POST",
    url: "/agent-registrations/login-challenge",
    payload: {
      walletAddress,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    }
  });
  expect(loginChallengeResponse.statusCode).toBe(200);
  const loginChallenge = loginChallengeResponse.json();

  const loginProof = await signer.signMessage({
    action: "signLogin",
    walletAddress,
    message: loginChallenge.message,
    nonce: loginChallenge.nonce,
    chainId: DEFAULT_TARGET_EVM_CHAIN_ID
  });
  const loginResponse = await targetApp.inject({
    method: "POST",
    url: "/agent-registrations/login",
    payload: {
      walletAddress,
      nonce: loginChallenge.nonce,
      signature: loginProof.signature,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    }
  });
  expect(loginResponse.statusCode).toBe(200);

  if (options?.initialStake) {
    const stakeResponse = await targetApp.inject({
      method: "POST",
      url: "/agents/stake",
      headers: {
        authorization: `Bearer ${loginResponse.json().sessionToken as string}`
      },
      payload: {
        agentAddress: walletAddress,
        amount: options.initialStake
      }
    });
    expect(stakeResponse.statusCode).toBe(200);
  }

  return loginResponse.json().sessionToken as string;
}

function createOkxNamedMockWalletProvider(): AgenticWalletProvider {
  const mock = new MockAgenticWalletProvider();
  return {
    name: "okx-agentic-wallet",
    ensureWallet: mock.ensureWallet.bind(mock),
    provisionWallet: mock.provisionWallet.bind(mock),
    prepareExecution: mock.prepareExecution.bind(mock),
    verifyExecution: mock.verifyExecution.bind(mock),
    execute: mock.execute.bind(mock),
    signMessage: mock.signMessage.bind(mock)
  };
}

describe("Proof of Vault API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: true,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns demo mock data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/demo/mock"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().agents.length).toBeGreaterThan(0);
  });

  it("returns runtime health with split provider modes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      onchainGatewayMode: "mock",
      walletProviderMode: "mock",
      marketProviderMode: "mock",
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
      realDemoReady: false
    });
  });

  it("exposes runtime config, agent manifest, and payload storage for skill-only agents", async () => {
    const runtimeResponse = await app.inject({
      method: "GET",
      url: "/runtime-config"
    });
    expect(runtimeResponse.statusCode).toBe(200);
    expect(runtimeResponse.json().chain.chainId).toBe(DEFAULT_TARGET_EVM_CHAIN_ID);

    const manifestResponse = await app.inject({
      method: "GET",
      url: "/agent-manifest.json"
    });
    expect(manifestResponse.statusCode).toBe(200);
    expect(manifestResponse.json().endpoints.discoverTasks).toBe("GET /agents/:address/tasks");
    expect(manifestResponse.json().endpoints.skill).toBe("/skill.md");

    const payloadResponse = await app.inject({
      method: "POST",
      url: "/payloads",
      payload: {
        vaultId: "1",
        kind: "rule_draft",
        payload: { hello: "vault" }
      }
    });
    expect(payloadResponse.statusCode).toBe(200);
    expect(payloadResponse.json().payloadHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("requires operator auth when an operator token is configured", async () => {
    const protectedApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: true,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_OPERATOR_API_TOKEN: "proof-of-vault-operator-token-for-tests",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
      }
    });

    try {
      const createVaultResponse = await protectedApp.inject({
        method: "POST",
        url: "/vaults",
        payload: {
          mode: "draft",
          metadataURI: "ipfs://proof-of-vault/tests/operator-auth",
          setterAddress: "0x9999999999999999999999999999999999999999",
          collateralToken: "0x8888888888888888888888888888888888888888",
          grossCollateralAmount: "1000000000000000000",
          settlementTime: Date.now() + 3_600_000,
          chainId: DEFAULT_TARGET_EVM_CHAIN_ID
        }
      });
      expect(createVaultResponse.statusCode).toBe(200);

      const unauthorizedResponse = await protectedApp.inject({
        method: "POST",
        url: `/vaults/${createVaultResponse.json().id}/rule-committee`,
        payload: { makerCount: 1, verifierCount: 1 }
      });
      expect(unauthorizedResponse.statusCode).toBe(401);

      const authorizedResponse = await protectedApp.inject({
        method: "POST",
        url: `/vaults/${createVaultResponse.json().id}/rule-committee`,
        headers: { authorization: "Bearer proof-of-vault-operator-token-for-tests" },
        payload: { makerCount: 1, verifierCount: 1 }
      });
      expect(authorizedResponse.statusCode).toBe(200);
    } finally {
      await protectedApp.close();
    }
  });

  it("fails production startup when mock or local providers are configured", async () => {
    await expect(
      buildApp({
        envOverrides: {
          NODE_ENV: "production",
          PROOF_OF_VAULT_STORAGE: "memory",
          PROOF_OF_VAULT_DEMO_MODE: true,
          PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
          PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
          PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
          PROOF_OF_VAULT_PAYLOAD_PROVIDER: "local",
          PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
        }
      })
    ).rejects.toThrow(/production must not use the mock/);
  });

  it("fails production startup when chain config is not X Layer mainnet", async () => {
    await expect(
      buildApp({
        envOverrides: {
          ...productionEnvOverrides,
          PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID: 1952
        },
        persistence: createMemoryPersistence(),
        runtimeOverrides: {
          onchainGateway: new MockOnchainGateway(DEFAULT_TARGET_EVM_CHAIN_ID),
          walletProvider: new MockAgenticWalletProvider(),
          marketDataProvider: new MockMarketDataProvider()
        }
      })
    ).rejects.toThrow(/production must use X Layer mainnet chainId 196/);
  });

  it("rejects invalid collateral cap configuration before exposing runtime config", async () => {
    await expect(
      buildApp({
        envOverrides: {
          PROOF_OF_VAULT_STORAGE: "memory",
          PROOF_OF_VAULT_DEMO_MODE: true,
          PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
          PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
          PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
          PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false,
          PROOF_OF_VAULT_WOKB_ADDRESS: "0x5555555555555555555555555555555555555555",
          PROOF_OF_VAULT_WOKB_CAP: "10.5"
        }
      })
    ).rejects.toThrow();
  });

  it("requires authenticated payload uploads in production and accepts wallet-signed uploads", async () => {
    const payload = { hello: "mainnet" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? {
                  IpfsHash: "bafybeigdyrpayloadsignedtest"
                }
              : payload
          ),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
      )
    );

    const payloadApp = await buildApp({
      envOverrides: productionEnvOverrides,
      persistence: createMemoryPersistence(),
      runtimeOverrides: {
        onchainGateway: new MockOnchainGateway(DEFAULT_TARGET_EVM_CHAIN_ID),
        walletProvider: new MockAgenticWalletProvider(),
        marketDataProvider: new MockMarketDataProvider()
      }
    });

    try {
      const unauthorizedResponse = await payloadApp.inject({
        method: "POST",
        url: "/payloads",
        payload: {
          vaultId: "1",
          kind: "rule_draft",
          payload
        }
      });
      expect(unauthorizedResponse.statusCode).toBe(400);

      const account = privateKeyToAccount(`0x${"2".repeat(64)}`);
      const message = buildPayloadUploadMessage({
        walletAddress: account.address,
        payloadHash: hashPayload(payload),
        vaultId: "1",
        kind: "rule_draft"
      });
      const signature = await account.signMessage({ message });
      const signedResponse = await payloadApp.inject({
        method: "POST",
        url: "/payloads",
        payload: {
          vaultId: "1",
          kind: "rule_draft",
          payload,
          walletAddress: account.address,
          message,
          signature
        }
      });
      expect(signedResponse.statusCode, signedResponse.body).toBe(200);
      expect(signedResponse.json().payloadURI).toMatch(/^ipfs:\/\//);
    } finally {
      vi.unstubAllGlobals();
      await payloadApp.close();
    }
  }, 10_000);

  it("rejects production server-side onchain vault creation requests", async () => {
    const productionApp = await buildApp({
      envOverrides: productionEnvOverrides,
      persistence: createMemoryPersistence(),
      runtimeOverrides: {
        onchainGateway: new MockOnchainGateway(DEFAULT_TARGET_EVM_CHAIN_ID),
        walletProvider: new MockAgenticWalletProvider(),
        marketDataProvider: new MockMarketDataProvider()
      }
    });

    try {
      const response = await productionApp.inject({
        method: "POST",
        url: "/vaults",
        payload: {
          mode: "register_onchain",
          metadataURI: "ipfs://proof-of-vault/tests/production-create-blocked",
          setterAddress: "0x9999999999999999999999999999999999999999",
          collateralToken: "0x8888888888888888888888888888888888888888",
          grossCollateralAmount: "1000000000000000000",
          settlementTime: Date.now() + 3_600_000,
          chainId: DEFAULT_TARGET_EVM_CHAIN_ID
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/browser wallet/i);
    } finally {
      await productionApp.close();
    }
  });

  it("rejects unsupported register-tx actions", async () => {
    const createVaultResponse = await app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/register-tx-action",
        setterAddress: "0x9999999999999999999999999999999999999999",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() + 3_600_000,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(createVaultResponse.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: `/vaults/${createVaultResponse.json().id}/register-tx`,
      payload: {
        action: "createVaultRequest",
        txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("runs agent stake and claim reward actions through the wallet provider", async () => {
    const stakeResponse = await app.inject({
      method: "POST",
      url: "/agents/stake",
      payload: {
        agentAddress: "0x1111111111111111111111111111111111111111",
        amount: "1000",
        payloadURI: "ipfs://proof-of-vault/tests/stake"
      }
    });

    expect(stakeResponse.statusCode).toBe(200);
    expect(stakeResponse.json().action).toBe("stakeForAgent");

    const claimResponse = await app.inject({
      method: "POST",
      url: "/agents/claim-rewards",
      payload: {
        agentAddress: "0x1111111111111111111111111111111111111111",
        payloadURI: "ipfs://proof-of-vault/tests/claim"
      }
    });

    expect(claimResponse.statusCode).toBe(200);
    expect(claimResponse.json().action).toBe("claimRewards");
  });

  it("prepares agent-signed stake and claim transactions", async () => {
    const preparedStake = await app.inject({
      method: "POST",
      url: "/agents/stake/prepare",
      payload: {
        agentAddress: "0x1111111111111111111111111111111111111111",
        amount: "1000",
        payloadURI: "ipfs://proof-of-vault/tests/stake-prepare"
      }
    });

    expect(preparedStake.statusCode).toBe(200);
    expect(preparedStake.json().transaction.functionName).toBe("stakeForAgent");

    const preparedClaim = await app.inject({
      method: "POST",
      url: "/agents/claim-rewards/prepare",
      payload: {
        agentAddress: "0x1111111111111111111111111111111111111111",
        payloadURI: "ipfs://proof-of-vault/tests/claim-prepare"
      }
    });

    expect(preparedClaim.statusCode).toBe(200);
    expect(preparedClaim.json().transaction.functionName).toBe("claimRewards");
  });

  it("accepts externally executed agent stake transactions via txHash verification", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/agents/stake",
      payload: {
        agentAddress: "0x1111111111111111111111111111111111111111",
        amount: "1000",
        txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().txHash).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(response.json().sourceProvider).toContain("verified");
  });

  it("does not double-count repeated verified stake transaction hashes", async () => {
    const persistence = createMemoryPersistence();
    const service = new AgentWalletService(persistence.workflowStore, new MockAgenticWalletProvider());
    const txHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    await service.stakeForAgent({
      agentAddress: "0x1111111111111111111111111111111111111111",
      amount: "1000",
      txHash,
      metadata: {}
    });
    await service.stakeForAgent({
      agentAddress: "0x1111111111111111111111111111111111111111",
      amount: "1000",
      txHash,
      metadata: {}
    });

    const agent = await persistence.workflowStore.getAgent("0x1111111111111111111111111111111111111111");
    expect(agent?.activeStake).toBe("1000");
    await expect(
      persistence.workflowStore.recordAgentStakeTransaction(
        "0x1111111111111111111111111111111111111111",
        txHash,
        "1000",
        Date.now()
      )
    ).resolves.toBe(false);
  });

  it("requires externally broadcast txHash in real agent wallet mode", async () => {
    const protectedApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: false,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
        PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
        PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
        PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
        PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
        PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890"
      },
      runtimeOverrides: {
        walletProvider: createOkxNamedMockWalletProvider()
      }
    });

    try {
      const sessionToken = await authenticateMockAgent(protectedApp);
      const headers = {
        authorization: `Bearer ${sessionToken}`
      };

      const preparedStake = await protectedApp.inject({
        method: "POST",
        url: "/agents/stake/prepare",
        headers,
        payload: {
          agentAddress: MOCK_AGENTIC_WALLET_ADDRESS,
          amount: "1000"
        }
      });
      expect(preparedStake.statusCode).toBe(200);

      const missingStakeTx = await protectedApp.inject({
        method: "POST",
        url: "/agents/stake",
        headers,
        payload: {
          agentAddress: MOCK_AGENTIC_WALLET_ADDRESS,
          amount: "1000"
        }
      });
      expect(missingStakeTx.statusCode).toBe(400);
      expect(missingStakeTx.json().message).toContain("/agents/stake/prepare");

      const missingClaimTx = await protectedApp.inject({
        method: "POST",
        url: "/agents/claim-rewards",
        headers,
        payload: {
          agentAddress: MOCK_AGENTIC_WALLET_ADDRESS
        }
      });
      expect(missingClaimTx.statusCode).toBe(400);
      expect(missingClaimTx.json().message).toContain("/agents/claim-rewards/prepare");
    } finally {
      await protectedApp.close();
    }
  });

  it("requires prepared wallet txHash for real agent submissions", async () => {
    const persistence = createMemoryPersistence();
    const submissionService = new SubmissionService(
      persistence,
      createOkxNamedMockWalletProvider(),
      new MockMarketDataProvider(),
      undefined
    );
    const now = Date.now();

    await persistence.workflowStore.saveVault({
      id: "123",
      externalVaultId: 123,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      legacyMode: false,
      setterAddress: "0x9999999999999999999999999999999999999999",
      status: "RuleDrafting",
      statement: "FDV must remain above 1000000 USD at settlement time.",
      metadataURI: "ipfs://proof-of-vault/tests/real-submission-vault",
      collateralToken: "0x8888888888888888888888888888888888888888",
      grossCollateralAmount: "1000000000000000000",
      settlementTime: now + 3_600_000,
      createdAt: now,
      updatedAt: now,
      ruleRound: 1,
      resolutionRound: 0,
      rejectionCount: 0,
      ruleCommittee: {
        makers: [MOCK_AGENTIC_WALLET_ADDRESS],
        verifiers: ["0x2222222222222222222222222222222222222222"],
        draftDeadlineAt: now + 60_000,
        issueDeadlineAt: now + 120_000
      },
      traces: []
    });

    const submissionInput = {
      kind: "rule_draft",
      vaultId: 123,
      round: 1,
      agentAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      payloadURI: "ipfs://proof-of-vault/tests/real-submission-rule-draft",
      payload: {
        vaultId: 123,
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
    } satisfies Parameters<SubmissionService["submit"]>[0];
    const prepared = await submissionService.prepare(submissionInput);

    expect(prepared.submissionBody.payloadHash).toBe(hashPayload(submissionInput.payload));
    expect(prepared.submissionBody.kind).toBe("rule_draft");
    if (prepared.submissionBody.kind !== "rule_draft") {
      throw new Error("Expected a prepared rule draft submission body.");
    }
    expect(prepared.submissionBody.payload.sources).toEqual([]);
    expect(prepared.proofSnapshots.length).toBeGreaterThan(0);

    await expect(
      submissionService.submit(submissionInput)
    ).rejects.toThrow(/agent-submissions\/prepare/);
  });

  it("prepares and submits resolution_commit without requiring a top-level payloadHash", async () => {
    const persistence = createMemoryPersistence();
    const productionApp = await buildApp({
      envOverrides: productionEnvOverrides,
      persistence,
      runtimeOverrides: {
        onchainGateway: new MockOnchainGateway(DEFAULT_TARGET_EVM_CHAIN_ID),
        walletProvider: createOkxNamedMockWalletProvider(),
        marketDataProvider: new MockMarketDataProvider()
      }
    });
    const agentAddress = MOCK_AGENTIC_WALLET_ADDRESS;
    const commitPayload = {
      vaultId: 42,
      round: 1,
      outcome: "TRUE" as const,
      proofHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      salt: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      submittedByAgent: agentAddress,
      version: 1
    };
    const expectedCommitHash = computeResolutionCommitHash(commitPayload);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? {
                  IpfsHash: "bafybeigresolutioncommitpayloadtest"
                }
              : commitPayload
          ),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
      )
    );

    try {
      const sessionToken = await authenticateMockAgent(productionApp, agentAddress, {
        agentLabel: "Resolution Commit Agent",
        capabilityTags: ["validator"]
      });
      const now = Date.now();

      await persistence.workflowStore.saveVault({
        id: "42",
        externalVaultId: 42,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        legacyMode: false,
        setterAddress: "0x9999999999999999999999999999999999999999",
        status: "CommitPhase",
        statement: "Resolve TRUE if the test statement is satisfied.",
        metadataURI: "ipfs://proof-of-vault/tests/commit-prepare",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: now - 1_000,
        createdAt: now - 5_000,
        updatedAt: now,
        ruleRound: 1,
        resolutionRound: 1,
        rejectionCount: 0,
        traces: [],
        resolutionCommittee: {
          validators: [agentAddress],
          auditors: ["0x7100000000000000000000000000000000000002"],
          minValidCount: 1
        }
      });

      const payloadResponse = await productionApp.inject({
        method: "POST",
        url: "/payloads",
        headers: {
          authorization: `Bearer ${sessionToken}`
        },
        payload: {
          walletAddress: agentAddress,
          vaultId: "42",
          kind: "resolution_commit",
          payload: commitPayload
        }
      });
      expect(payloadResponse.statusCode, payloadResponse.body).toBe(200);
      expect(payloadResponse.json().payloadHash).toBe(hashPayload(commitPayload));

      const prepareResponse = await productionApp.inject({
        method: "POST",
        url: "/agent-submissions/prepare",
        headers: {
          authorization: `Bearer ${sessionToken}`
        },
        payload: {
          kind: "resolution_commit",
          vaultId: 42,
          round: 1,
          agentAddress,
          payloadURI: payloadResponse.json().payloadURI,
          payload: commitPayload
        }
      });

      expect(prepareResponse.statusCode, prepareResponse.body).toBe(200);
      expect(prepareResponse.json().submissionBody.payloadHash).toBe(expectedCommitHash);
      expect(prepareResponse.json().preparedExecution.transaction.functionName).toBe("commitResolution");
      expect(prepareResponse.json().preparedExecution.transaction.metadata.commitHash).toBe(expectedCommitHash);

      const submitResponse = await productionApp.inject({
        method: "POST",
        url: "/agent-submissions",
        headers: {
          authorization: `Bearer ${sessionToken}`
        },
        payload: {
          ...prepareResponse.json().submissionBody,
          txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }
      });

      expect(submitResponse.statusCode, submitResponse.body).toBe(200);
      expect(submitResponse.json().payloadHash).toBe(expectedCommitHash);
      expect(submitResponse.json().proof.payloadHash).toBe(hashPayload(commitPayload));
      expect(submitResponse.json().executionTrace.callArgs.functionName).toBe("commitResolution");
      expect(submitResponse.json().executionTrace.callArgs.commitHash).toBe(expectedCommitHash);
    } finally {
      vi.unstubAllGlobals();
      await productionApp.close();
    }
  });

  it("requires a verified agent session in real wallet-provider mode", async () => {
    const protectedApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: false,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
        PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
        PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
        PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
        PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
        PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890"
      },
      runtimeOverrides: {
        walletProvider: new MockAgenticWalletProvider()
      }
    });

    try {
      const unauthorizedResponse = await protectedApp.inject({
        method: "POST",
        url: "/agents/stake",
        payload: {
          agentAddress: MOCK_AGENTIC_WALLET_ADDRESS,
          amount: "1000"
        }
      });
      expect(unauthorizedResponse.statusCode).toBe(400);

      const sessionToken = await authenticateMockAgent(protectedApp);
      const authorizedResponse = await protectedApp.inject({
        method: "POST",
        url: "/agents/stake",
        headers: {
          authorization: `Bearer ${sessionToken}`
        },
        payload: {
          agentAddress: MOCK_AGENTIC_WALLET_ADDRESS,
          amount: "1000"
        }
      });

      expect(authorizedResponse.statusCode).toBe(200);
      expect(authorizedResponse.json().action).toBe("stakeForAgent");
    } finally {
      await protectedApp.close();
    }
  });

  it("runs pre-registration, judge-list admission, and signature login", async () => {
    const signer = new MockAgenticWalletProvider();
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/challenge",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        agentLabel: "Registration Agent",
        capabilityTags: ["validator"],
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });

    expect(challengeResponse.statusCode).toBe(200);
    const challenge = challengeResponse.json();
    const preRegistrationProof = await signer.signMessage({
      action: "signPreRegistration",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: challenge.message,
      nonce: challenge.nonce,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
    const registrationResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: challenge.nonce,
        signature: preRegistrationProof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });

    expect(registrationResponse.statusCode).toBe(200);
    const registration = registrationResponse.json().registration;
    expect(registration.walletAddress.toLowerCase()).toBe(MOCK_AGENTIC_WALLET_ADDRESS.toLowerCase());
    expect(registration.status).toBe("pre_registered");

    const duplicateChallengeResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/challenge",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        agentLabel: "Registration Agent",
        capabilityTags: ["validator"],
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    expect(duplicateChallengeResponse.statusCode).toBe(409);

    const judgeListResponse = await app.inject({
      method: "POST",
      url: "/judge-list",
      payload: {
        registrationId: registration.id,
        activeStake: "1000",
        reputationScore: 70
      }
    });
    expect(judgeListResponse.statusCode).toBe(200);
    expect(judgeListResponse.json().registrationId).toBe(registration.id);
    expect(judgeListResponse.json().activeStake).toBe("0");
    expect(judgeListResponse.json().reputationScore).toBe(50);

    const listResponse = await app.inject({
      method: "GET",
      url: "/judge-list"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().some((entry: { registrationId: string }) => entry.registrationId === registration.id)).toBe(
      true
    );

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
    const loginResponse = await app.inject({
      method: "POST",
      url: "/agent-registrations/login",
      payload: {
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        nonce: loginChallenge.nonce,
        signature: loginProof.signature,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json().registration.lastLoginAt).toBeGreaterThan(0);
  });

  it("rejects committee candidates that are not in the judge list", async () => {
    const createVaultResponse = await app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/unlisted-candidate",
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });
    const vault = createVaultResponse.json();
    const response = await app.inject({
      method: "POST",
      url: `/vaults/${vault.id}/rule-committee`,
      payload: {
        makerCount: 1,
        verifierCount: 1,
        candidateAgents: [
          {
            address: "0xabababababababababababababababababababab",
            walletAddress: "0xabababababababababababababababababababab",
            label: "Unlisted Agent",
            capabilityTags: ["all-rounder"],
            reputationScore: 80,
            activeStake: "1000",
            canUseAgenticWallet: true,
            status: "available",
            walletProvider: "mock-agentic-wallet"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/judge list/);
  });

  it("registers an on-chain vault through the gateway fallback and syncs its snapshot", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "register_onchain",
        metadataURI: "ipfs://proof-of-vault/tests/onchain-vault",
        setterAddress: "0x9999999999999999999999999999999999999999",
        statement: "FDV must remain above 1000000 USD at settlement time.",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() + 3600_000,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().externalVaultId).toBe(1);
    expect(createResponse.json().traces[0].action).toBe("createVaultRequest");

    const syncResponse = await app.inject({
      method: "POST",
      url: `/vaults/${createResponse.json().id}/sync-onchain`
    });

    expect(syncResponse.statusCode).toBe(200);
    expect(syncResponse.json().onchainSnapshot.vaultId).toBe(1);
  });

  it("verifies externally created on-chain vault requests before registering workflow state", async () => {
    const settlementTime = Date.now() + 3_600_000;
    const metadataURI = "ipfs://proof-of-vault/tests/verified-onchain-register";
    const txHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
    const verifyingApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: false,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
      },
      runtimeOverrides: {
        onchainGateway: new VerifiedRegisterGateway({
          vaultId: 77,
          txHash,
          setterAddress: "0x9999999999999999999999999999999999999999",
          collateralToken: "0x8888888888888888888888888888888888888888",
          grossCollateralAmount: "1000000000000000000",
          settlementTime,
          metadataURI
        })
      }
    });

    try {
      const response = await verifyingApp.inject({
        method: "POST",
        url: "/vaults",
        payload: {
          mode: "register_onchain",
          externalVaultId: 77,
          metadataURI,
          statement: "FDV must remain above 1000000 USD at settlement time.",
          collateralToken: "0x8888888888888888888888888888888888888888",
          collateralDecimals: 18,
          grossCollateralAmount: "1000000000000000000",
          settlementTime,
          chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
          initialTrace: {
            action: "createVaultRequest",
            actorAddress: "0x9999999999999999999999999999999999999999",
            executedByWallet: "0x9999999999999999999999999999999999999999",
            txHash,
            chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
            sourceProvider: "browser-wallet",
            recordedAt: Date.now()
          }
        }
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().externalVaultId).toBe(77);
      expect(response.json().traces[0].txHash).toBe(txHash);
      expect(response.json().setterAddress).toBe("0x9999999999999999999999999999999999999999");
    } finally {
      await verifyingApp.close();
    }
  });

  it("lets a judge-listed agent bootstrap committee registration from the task feed", async () => {
    const persistence = createMemoryPersistence();
    const bootstrapApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: false,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890",
        PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
        PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
        PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
        PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
        PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
      },
      persistence,
      runtimeOverrides: {
        walletProvider: createOkxNamedMockWalletProvider()
      }
    });

    try {
      const agentA = MOCK_AGENTIC_WALLET_ADDRESS;
      const agentB = "0x7000000000000000000000000000000000000002";
      const agentC = "0x7000000000000000000000000000000000000003";
      const agentASession = await authenticateMockAgent(bootstrapApp, agentA, {
        agentLabel: "Bootstrap Agent A",
        capabilityTags: ["all-rounder"]
      });
      const agentAProfile = await persistence.workflowStore.getAgent(agentA);
      expect(agentAProfile).toBeDefined();
      await persistence.workflowStore.saveAgent({
        ...agentAProfile!,
        activeStake: "100"
      });

      await persistence.workflowStore.seedJudgeListedAgent({
        address: agentB,
        walletAddress: agentB,
        label: "Bootstrap Agent B",
        capabilityTags: ["all-rounder"],
        reputationScore: 75,
        activeStake: "100",
        canUseAgenticWallet: true,
        status: "available",
        walletProvider: "mock-agentic-wallet"
      });

      await persistence.workflowStore.seedJudgeListedAgent({
        address: agentC,
        walletAddress: agentC,
        label: "Bootstrap Agent C",
        capabilityTags: ["all-rounder"],
        reputationScore: 70,
        activeStake: "100",
        canUseAgenticWallet: true,
        status: "available",
        walletProvider: "mock-agentic-wallet"
      });

      const createVaultResponse = await bootstrapApp.inject({
        method: "POST",
        url: "/vaults",
        payload: {
          mode: "draft",
          metadataURI: "ipfs://proof-of-vault/tests/bootstrap-committee",
          setterAddress: "0x9999999999999999999999999999999999999999",
          statement: "Bootstrap a rule committee from live judge-listed agents.",
          collateralToken: "0x8888888888888888888888888888888888888888",
          grossCollateralAmount: "1000000000000000000",
          settlementTime: Date.now() + 3_600_000,
          chainId: DEFAULT_TARGET_EVM_CHAIN_ID
        }
      });
      expect(createVaultResponse.statusCode).toBe(200);
      const createdVault = createVaultResponse.json();

      const tasksResponse = await bootstrapApp.inject({
        method: "GET",
        url: `/agents/${agentA}/tasks`,
        headers: {
          authorization: `Bearer ${agentASession}`
        }
      });
      expect(tasksResponse.statusCode).toBe(200);
      expect(
        tasksResponse
          .json()
          .tasks.some(
            (task: { stage: string; metadata?: { action?: string } }) =>
              task.stage === "rule_committee_registration" &&
              task.metadata?.action === "bootstrap_rule_committee"
          )
      ).toBe(true);
      expect(tasksResponse.json().byRole.committee_bootstrap).toHaveLength(1);

      const bootstrapResponse = await bootstrapApp.inject({
        method: "POST",
        url: "/agents/committee-registration",
        headers: {
          authorization: `Bearer ${agentASession}`
        },
        payload: {
          agentAddress: agentA,
          vaultId: createdVault.id,
          phase: "rule"
        }
      });
      expect(bootstrapResponse.statusCode, bootstrapResponse.body).toBe(200);
      expect(bootstrapResponse.json().status).toBe("RuleDrafting");
      expect(bootstrapResponse.json().ruleCommittee.makers.length).toBeGreaterThanOrEqual(1);
      expect(bootstrapResponse.json().ruleCommittee.verifiers.length).toBeGreaterThanOrEqual(1);
      expect(
        [
          ...bootstrapResponse.json().ruleCommittee.makers,
          ...bootstrapResponse.json().ruleCommittee.verifiers
        ].map((address: string) => address.toLowerCase())
      ).toContain(agentA.toLowerCase());
    } finally {
      await bootstrapApp.close();
    }
  });

  it("auto-bootstraps the rule committee and normalizes round-zero payloads for direct maker submissions", async () => {
    const persistence = createMemoryPersistence();
    const bootstrapApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: false,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890",
        PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
        PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
        PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
        PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
        PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
      },
      persistence,
      runtimeOverrides: {
        walletProvider: createOkxNamedMockWalletProvider()
      }
    });

    try {
      const agentA = MOCK_AGENTIC_WALLET_ADDRESS;
      const agentB = "0x7200000000000000000000000000000000000002";
      const agentC = "0x7200000000000000000000000000000000000003";
      const agentASession = await authenticateMockAgent(bootstrapApp, agentA, {
        agentLabel: "Direct Draft Agent A",
        capabilityTags: ["all-rounder"]
      });

      const agentAProfile = await persistence.workflowStore.getAgent(agentA);
      expect(agentAProfile).toBeDefined();
      await persistence.workflowStore.saveAgent({
        ...agentAProfile!,
        activeStake: "100",
        reputationScore: 10
      });

      await persistence.workflowStore.seedJudgeListedAgent({
        address: agentB,
        walletAddress: agentB,
        label: "Direct Draft Agent B",
        capabilityTags: ["all-rounder"],
        reputationScore: 95,
        activeStake: "100",
        canUseAgenticWallet: true,
        status: "available",
        walletProvider: "mock-agentic-wallet"
      });

      await persistence.workflowStore.seedJudgeListedAgent({
        address: agentC,
        walletAddress: agentC,
        label: "Direct Draft Agent C",
        capabilityTags: ["all-rounder"],
        reputationScore: 90,
        activeStake: "100",
        canUseAgenticWallet: true,
        status: "available",
        walletProvider: "mock-agentic-wallet"
      });

      const createVaultResponse = await bootstrapApp.inject({
        method: "POST",
        url: "/vaults",
        payload: {
          mode: "draft",
          metadataURI: "ipfs://proof-of-vault/tests/direct-round-zero-rule-draft",
          setterAddress: "0x9999999999999999999999999999999999999999",
          statement: "Direct rule draft should auto-bootstrap and normalize the current round.",
          collateralToken: "0x8888888888888888888888888888888888888888",
          grossCollateralAmount: "1000000000000000000",
          settlementTime: Date.now() + 3_600_000,
          chainId: DEFAULT_TARGET_EVM_CHAIN_ID
        }
      });
      expect(createVaultResponse.statusCode).toBe(200);
      const createdVault = createVaultResponse.json();

      const storedPayloadResponse = await bootstrapApp.inject({
        method: "POST",
        url: "/payloads",
        headers: {
          authorization: `Bearer ${agentASession}`
        },
        payload: {
          vaultId: createdVault.id,
          kind: "rule_draft",
          walletAddress: agentA,
          payload: {
            vaultId: Number(createdVault.id),
            round: 0,
            template: "fdv_above_at_time",
            statement: "FDV must remain above 1000000 USD at settlement time.",
            inputs: {
              thresholdUsd: "1000000"
            },
            sources: [],
            version: 1
          }
        }
      });
      expect(storedPayloadResponse.statusCode, storedPayloadResponse.body).toBe(200);

      const prepareResponse = await bootstrapApp.inject({
        method: "POST",
        url: "/agent-submissions/prepare",
        headers: {
          authorization: `Bearer ${agentASession}`
        },
        payload: {
          kind: "rule_draft",
          vaultId: Number(createdVault.id),
          round: 0,
          agentAddress: agentA,
          payloadURI: storedPayloadResponse.json().payloadURI,
          payload: {
            vaultId: Number(createdVault.id),
            round: 0,
            template: "fdv_above_at_time",
            statement: "FDV must remain above 1000000 USD at settlement time.",
            inputs: {
              thresholdUsd: "1000000"
            },
            sources: [],
            version: 1
          }
        }
      });
      expect(prepareResponse.statusCode, prepareResponse.body).toBe(200);
      expect(prepareResponse.json().submissionBody.round).toBe(1);
      expect(prepareResponse.json().submissionBody.payload.round).toBe(1);

      const detailResponse = await bootstrapApp.inject({
        method: "GET",
        url: `/vaults/${createdVault.id}`
      });
      expect(detailResponse.statusCode).toBe(200);
      expect(
        [
          ...detailResponse.json().ruleCommittee.makers,
          ...detailResponse.json().ruleCommittee.verifiers
        ].map((address: string) => address.toLowerCase())
      ).toContain(agentA.toLowerCase());
    } finally {
      await bootstrapApp.close();
    }
  });

  it("lets a judge-listed agent bootstrap resolution committee registration from the task feed", async () => {
    const persistence = createMemoryPersistence();
    const bootstrapApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: false,
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890",
        PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
        PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
        PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
        PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
        PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: false
      },
      persistence,
      runtimeOverrides: {
        walletProvider: createOkxNamedMockWalletProvider()
      }
    });

    try {
      const agentA = MOCK_AGENTIC_WALLET_ADDRESS;
      const agentB = "0x7100000000000000000000000000000000000002";
      const agentC = "0x7100000000000000000000000000000000000003";
      const agentASession = await authenticateMockAgent(bootstrapApp, agentA, {
        agentLabel: "Resolution Agent A",
        capabilityTags: ["all-rounder"]
      });

      const agentAProfile = await persistence.workflowStore.getAgent(agentA);
      expect(agentAProfile).toBeDefined();
      await persistence.workflowStore.saveAgent({
        ...agentAProfile!,
        activeStake: "100"
      });

      await persistence.workflowStore.seedJudgeListedAgent({
        address: agentB,
        walletAddress: agentB,
        label: "Resolution Agent B",
        capabilityTags: ["all-rounder"],
        reputationScore: 72,
        activeStake: "100",
        canUseAgenticWallet: true,
        status: "available",
        walletProvider: "mock-agentic-wallet"
      });

      await persistence.workflowStore.seedJudgeListedAgent({
        address: agentC,
        walletAddress: agentC,
        label: "Resolution Agent C",
        capabilityTags: ["all-rounder"],
        reputationScore: 68,
        activeStake: "100",
        canUseAgenticWallet: true,
        status: "available",
        walletProvider: "mock-agentic-wallet"
      });

      const createVaultResponse = await bootstrapApp.inject({
        method: "POST",
        url: "/vaults",
        payload: {
          mode: "draft",
          metadataURI: "ipfs://proof-of-vault/tests/bootstrap-resolution-committee",
          setterAddress: "0x9999999999999999999999999999999999999999",
          statement: "Bootstrap a resolution committee from live judge-listed agents.",
          collateralToken: "0x8888888888888888888888888888888888888888",
          grossCollateralAmount: "1000000000000000000",
          settlementTime: Date.now() + 3_600_000,
          chainId: DEFAULT_TARGET_EVM_CHAIN_ID
        }
      });
      expect(createVaultResponse.statusCode).toBe(200);
      const createdVault = createVaultResponse.json();
      const persistedVault = await persistence.workflowStore.getVault(createdVault.id);
      expect(persistedVault).toBeDefined();
      await persistence.workflowStore.saveVault({
        ...persistedVault!,
        status: "Active",
        updatedAt: Date.now()
      });

      const tasksResponse = await bootstrapApp.inject({
        method: "GET",
        url: `/agents/${agentA}/tasks`,
        headers: {
          authorization: `Bearer ${agentASession}`
        }
      });
      expect(tasksResponse.statusCode).toBe(200);
      expect(
        tasksResponse
          .json()
          .tasks.some(
            (task: { stage: string; metadata?: { action?: string } }) =>
              task.stage === "resolution_committee_registration" &&
              task.metadata?.action === "bootstrap_resolution_committee"
          )
      ).toBe(true);

      const bootstrapResponse = await bootstrapApp.inject({
        method: "POST",
        url: "/agents/committee-registration",
        headers: {
          authorization: `Bearer ${agentASession}`
        },
        payload: {
          agentAddress: agentA,
          vaultId: createdVault.id,
          phase: "resolution"
        }
      });
      expect(bootstrapResponse.statusCode, bootstrapResponse.body).toBe(200);
      expect(bootstrapResponse.json().status).toBe("CommitPhase");
      expect(bootstrapResponse.json().resolutionCommittee.validators.length).toBeGreaterThanOrEqual(1);
      expect(bootstrapResponse.json().resolutionCommittee.auditors.length).toBeGreaterThanOrEqual(1);
      expect(
        [
          ...bootstrapResponse.json().resolutionCommittee.validators,
          ...bootstrapResponse.json().resolutionCommittee.auditors
        ].map((address: string) => address.toLowerCase())
      ).toContain(agentA.toLowerCase());
    } finally {
      await bootstrapApp.close();
    }
  });

  it("runs the minimal V2 workflow loop", async () => {
    const createVaultResponse = await app.inject({
      method: "POST",
      url: "/vaults",
      payload: {
        mode: "draft",
        metadataURI: "ipfs://proof-of-vault/tests/vault-1",
        setterAddress: "0x9999999999999999999999999999999999999999",
        statement: "FDV must remain above 1000000 USD at settlement time.",
        collateralToken: "0x8888888888888888888888888888888888888888",
        grossCollateralAmount: "1000000000000000000",
        settlementTime: Date.now() - 1000,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID
      }
    });

    expect(createVaultResponse.statusCode).toBe(200);
    const createdVault = createVaultResponse.json();
    expect(createdVault.status).toBe("DraftRequest");

    const registerRuleCommitteeResponse = await app.inject({
      method: "POST",
      url: `/vaults/${createdVault.id}/rule-committee`,
      payload: {
        makerCount: 1,
        verifierCount: 1,
        draftDeadlineAt: Date.now() - 500,
        issueDeadlineAt: Date.now() - 250,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    expect(registerRuleCommitteeResponse.statusCode).toBe(200);
    const ruleCommitteeVault = registerRuleCommitteeResponse.json();
    expect(ruleCommitteeVault.status).toBe("RuleDrafting");

    const maker = ruleCommitteeVault.ruleCommittee.makers[0];
    const verifier = ruleCommitteeVault.ruleCommittee.verifiers[0];

    await app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: {
        kind: "rule_draft",
        vaultId: Number(createdVault.id),
        round: 1,
        agentAddress: maker,
        payloadURI: "ipfs://proof-of-vault/tests/rule-draft",
        payload: {
          vaultId: Number(createdVault.id),
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

    await app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: {
        kind: "rule_issue",
        vaultId: Number(createdVault.id),
        round: 1,
        agentAddress: verifier,
        payloadURI: "ipfs://proof-of-vault/tests/rule-issue",
        payload: {
          vaultId: Number(createdVault.id),
          round: 1,
          severity: "HIGH",
          issueType: "ambiguous_source_policy",
          notes: "Clarify the source priority.",
          version: 1
        }
      }
    });

    const finalizedRuleSetResponse = await app.inject({
      method: "POST",
      url: `/vaults/${createdVault.id}/rule-set/finalize`,
      payload: {
        metadataURI: "ipfs://proof-of-vault/tests/criteria-final",
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        finalSourcePolicy: {
          primary: "okx-market-skill"
        }
      }
    });

    expect(finalizedRuleSetResponse.statusCode).toBe(200);
    expect(finalizedRuleSetResponse.json().status).toBe("UserRuleReview");

    const acceptedRuleSetResponse = await app.inject({
      method: "POST",
      url: `/vaults/${createdVault.id}/rule-set/decision`,
      payload: {
        decision: "accept",
        setterAddress: "0x9999999999999999999999999999999999999999"
      }
    });

    expect(acceptedRuleSetResponse.statusCode).toBe(200);
    expect(acceptedRuleSetResponse.json().status).toBe("Active");

    const registerResolutionCommitteeResponse = await app.inject({
      method: "POST",
      url: `/vaults/${createdVault.id}/resolution-committee`,
      payload: {
        validatorCount: 1,
        auditorCount: 1,
        minValidCount: 1,
        commitDeadlineAt: Date.now() - 1000,
        revealDeadlineAt: Date.now() - 800,
        auditDeadlineAt: Date.now() - 600,
        challengeDeadlineAt: Date.now() - 400,
        orchestratorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    });

    expect(registerResolutionCommitteeResponse.statusCode).toBe(200);
    const resolutionVault = registerResolutionCommitteeResponse.json();
    const validator = resolutionVault.resolutionCommittee.validators[0];
    const auditor = resolutionVault.resolutionCommittee.auditors[0];
    const proofHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const salt = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    await app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: {
        kind: "resolution_commit",
        vaultId: Number(createdVault.id),
        round: 1,
        agentAddress: validator,
        payloadURI: "ipfs://proof-of-vault/tests/commit",
        payload: {
          vaultId: Number(createdVault.id),
          round: 1,
          outcome: "TRUE",
          proofHash,
          salt,
          submittedByAgent: validator,
          version: 1
        }
      }
    });

    await app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: {
        kind: "resolution_reveal",
        vaultId: Number(createdVault.id),
        round: 1,
        agentAddress: validator,
        payloadURI: "ipfs://proof-of-vault/tests/reveal",
        proofHash,
        salt,
        payload: {
          vaultId: Number(createdVault.id),
          round: 1,
          result: "TRUE",
          confidenceScore: 0.98,
          sources: [],
          reasoning: "Evidence confirms the FDV threshold stayed above the target.",
          submittedByAgent: validator,
          version: 1
        }
      }
    });

    await app.inject({
      method: "POST",
      url: "/agent-submissions",
      payload: {
        kind: "audit_verdict",
        vaultId: Number(createdVault.id),
        round: 1,
        agentAddress: auditor,
        payloadURI: "ipfs://proof-of-vault/tests/audit",
        payload: {
          vaultId: Number(createdVault.id),
          round: 1,
          validator,
          verdict: "VALID",
          findings: [],
          reviewerAgent: auditor,
          version: 1
        }
      }
    });

    const finalizedResponse = await app.inject({
      method: "POST",
      url: `/vaults/${createdVault.id}/finality`,
      payload: {
        finalizerAddress: "0xffffffffffffffffffffffffffffffffffffffff",
        reopenOnInsufficientEvidence: false,
        challengeResolutions: []
      }
    });

    expect(finalizedResponse.statusCode).toBe(200);
    expect(finalizedResponse.json().ready).toBe(true);
    expect(finalizedResponse.json().vault.status).toBe("ResolvedTrue");

    const detailResponse = await app.inject({
      method: "GET",
      url: `/vaults/${createdVault.id}`
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().consensusMetrics.decidedOutcome).toBe("TRUE");
    expect(detailResponse.json().tasks.length).toBeGreaterThan(0);
  });

  it("reports blocking reasons instead of failing startup when real-demo enforcement is enabled", async () => {
    const demoApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: true
      }
    });

    try {
      const response = await demoApp.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: false,
        realDemoReady: false
      });
      expect(response.json().blockingReasons).toEqual(
        expect.arrayContaining([
          "storage must be postgres",
          "wallet provider must be okx",
          "market provider must be okx"
        ])
      );
    } finally {
      await demoApp.close();
    }
  });

  it("marks legacy chain alias usage as not demo-ready", async () => {
    const demoApp = await buildApp({
      envOverrides: {
        PROOF_OF_VAULT_STORAGE: "postgres",
        DATABASE_URL: "https://proof-of-vault.test/postgres",
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "viem",
        PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
        PROOF_OF_VAULT_MARKET_PROVIDER: "okx",
        PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: true,
        PROOF_OF_VAULT_CHAIN_ID: DEFAULT_TARGET_EVM_CHAIN_ID,
        PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
        PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
        PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
        PROOF_OF_VAULT_RPC_URL: "https://rpc.example.test",
        PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
        PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
        PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY: `0x${"1".repeat(64)}`
      },
      persistence: createMemoryPersistence()
    });

    try {
      const response = await demoApp.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().realDemoReady).toBe(false);
      expect(response.json().blockingReasons).toEqual(
        expect.arrayContaining([
          "real demo mode must use PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID explicitly, not the legacy alias"
        ])
      );
    } finally {
      await demoApp.close();
    }
  });
});
