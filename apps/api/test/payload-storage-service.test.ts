import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryProofStore } from "@proof-of-vault/agent-runtime";

import type { AppEnv } from "../src/config/env.js";
import { PayloadStorageService } from "../src/services/payload-storage-service.js";
import { createPgMemPersistenceFactory } from "./pg-mem-persistence.js";

function createPayloadEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: "production",
    PORT: 4000,
    HOST: "0.0.0.0",
    PROOF_OF_VAULT_STORAGE: "postgres",
    PROOF_OF_VAULT_DEMO_MODE: false,
    PROOF_OF_VAULT_DB_POOL_MAX: 10,
    PROOF_OF_VAULT_RECONCILIATION_INTERVAL_MS: 60_000,
    DATABASE_URL: "https://proof-of-vault.test/postgres",
    PROOF_OF_VAULT_ONCHAIN_GATEWAY: "viem",
    PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
    PROOF_OF_VAULT_MARKET_PROVIDER: "okx",
    PROOF_OF_VAULT_PAYLOAD_PROVIDER: "ipfs",
    PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: true,
    PROOF_OF_VAULT_AUTH_SECRET: "proof-of-vault-test-session-secret-1234567890",
    PROOF_OF_VAULT_OPERATOR_API_TOKEN: "proof-of-vault-operator-token-for-tests",
    PROOF_OF_VAULT_USING_LEGACY_CHAIN_ALIAS: false,
    PROOF_OF_VAULT_OKX_ACCESS_KEY: "test-key",
    PROOF_OF_VAULT_OKX_SECRET_KEY: "test-secret",
    PROOF_OF_VAULT_OKX_PASSPHRASE: "test-passphrase",
    PROOF_OF_VAULT_OKX_MCP_URL: "https://web3.okx.com/api/v1/onchainos-mcp",
    PROOF_OF_VAULT_PUBLIC_API_BASE_URL: "https://api.proofofvault.test",
    PROOF_OF_VAULT_WEB_BASE_URL: "https://app.proofofvault.test",
    PROOF_OF_VAULT_CHAIN_ID: undefined,
    PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID: 196,
    PROOF_OF_VAULT_OKX_CHAIN_INDEX: 196,
    PROOF_OF_VAULT_RPC_URL: "https://rpc.xlayer.tech",
    PROOF_OF_VAULT_EXPLORER_URL: "https://www.oklink.com/xlayer",
    PROOF_OF_VAULT_IPFS_PINNING_URL: "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    PROOF_OF_VAULT_IPFS_PINNING_JWT: "pinata-jwt",
    PROOF_OF_VAULT_IPFS_GATEWAY_URL: "https://ipfs.io/ipfs",
    PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY: `0x${"1".repeat(64)}`,
    PROOF_OF_VAULT_FINALIZER_PRIVATE_KEY: `0x${"2".repeat(64)}`,
    PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY: undefined,
    PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_FUNDER_PRIVATE_KEY: undefined,
    PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
    PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222",
    PROOF_OF_VAULT_POV_TOKEN_ADDRESS: "0x3333333333333333333333333333333333333333",
    PROOF_OF_VAULT_REWARD_POOL_ADDRESS: "0x4444444444444444444444444444444444444444",
    PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT: "0",
    PROOF_OF_VAULT_WOKB_ADDRESS: "0x5555555555555555555555555555555555555555",
    PROOF_OF_VAULT_WOKB_CAP: "10000000000000000000",
    PROOF_OF_VAULT_WOKB_DECIMALS: 18,
    PROOF_OF_VAULT_USDCE_ADDRESS: "0x6666666666666666666666666666666666666666",
    PROOF_OF_VAULT_USDCE_CAP: "1000000000",
    PROOF_OF_VAULT_USDCE_DECIMALS: 6,
    ...overrides
  };
}

describe("PayloadStorageService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the Pinata gateway when the configured gateway returns 504", async () => {
    const payload = {
      title: "payload verification fallback",
      version: 1
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);

        if (init?.method === "POST" && url === "https://api.pinata.cloud/pinning/pinJSONToIPFS") {
          return new Response(JSON.stringify({ IpfsHash: "bafyproofvaultpayloadfallback" }), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }

        if (url === "https://ipfs.io/ipfs/bafyproofvaultpayloadfallback") {
          return new Response("gateway timeout", { status: 504 });
        }

        if (url === "https://gateway.pinata.cloud/ipfs/bafyproofvaultpayloadfallback") {
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }

        return new Response("unexpected url", { status: 500 });
      })
    );

    const proofStore = new InMemoryProofStore();
    const service = new PayloadStorageService(createPayloadEnv(), proofStore);
    const result = await service.storePayload({
      vaultId: "1",
      kind: "vault_request",
      payload
    });

    expect(result.storageProvider).toBe("ipfs");
    expect(result.payloadURI).toBe("ipfs://bafyproofvaultpayloadfallback");
    await expect(proofStore.get(result.payloadHash)).resolves.toMatchObject({
      payloadURI: "ipfs://bafyproofvaultpayloadfallback",
      vaultKey: "1"
    });
  });

  it("reports a retry failure when every verification gateway returns 504", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);

        if (init?.method === "POST" && url === "https://api.pinata.cloud/pinning/pinJSONToIPFS") {
          return new Response(JSON.stringify({ IpfsHash: "bafyproofvaultpayloadfailure" }), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }

        return new Response("gateway timeout", { status: 504 });
      })
    );

    const service = new PayloadStorageService(createPayloadEnv(), new InMemoryProofStore());

    await expect(
      service.storePayload({
        vaultId: "1",
        kind: "vault_request",
        payload: {
          title: "payload verification failure",
          version: 1
        }
      })
    ).rejects.toThrow(/Pinned IPFS payload verification failed after retries/);
  }, 10_000);

  it("persists pre-vault payloads in postgres mode before a vault record exists", async () => {
    const payload = {
      title: "pre-vault payload",
      version: 1
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);

        if (init?.method === "POST" && url === "https://api.pinata.cloud/pinning/pinJSONToIPFS") {
          return new Response(JSON.stringify({ IpfsHash: "bafyprevaulpayloadpostgres" }), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }

        if (url === "https://ipfs.io/ipfs/bafyprevaulpayloadpostgres") {
          return new Response("gateway timeout", { status: 504 });
        }

        if (url === "https://gateway.pinata.cloud/ipfs/bafyprevaulpayloadpostgres") {
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          });
        }

        return new Response("unexpected url", { status: 500 });
      })
    );

    const factory = await createPgMemPersistenceFactory();
    const persistence = await factory.createPersistence();

    try {
      const service = new PayloadStorageService(createPayloadEnv(), persistence.proofStore);
      const result = await service.storePayload({
        kind: "vault_request",
        payload
      });

      await expect(persistence.proofStore.get(result.payloadHash)).resolves.toMatchObject({
        payloadURI: "ipfs://bafyprevaulpayloadpostgres",
        vaultKey: "__payloads__"
      });
      await expect(persistence.proofStore.listByVault("__payloads__")).resolves.toHaveLength(1);
    } finally {
      await persistence.close();
    }
  });
});
