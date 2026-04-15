import { describe, expect, it } from "vitest";

import { loadEnv } from "../src/config/env.js";

describe("env boolean parsing", () => {
  it("parses explicit false-like strings as false", () => {
    const env = loadEnv({
      PROOF_OF_VAULT_STORAGE: "memory",
      PROOF_OF_VAULT_DEMO_MODE: "false",
      PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
      PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
      PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
      PROOF_OF_VAULT_PAYLOAD_PROVIDER: "local",
      PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: "false"
    });

    expect(env.PROOF_OF_VAULT_DEMO_MODE).toBe(false);
    expect(env.PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO).toBe(false);
  });

  it("requires the full OKX credential set when an OKX provider is enabled", () => {
    expect(() =>
      loadEnv({
        PROOF_OF_VAULT_STORAGE: "memory",
        PROOF_OF_VAULT_DEMO_MODE: "false",
        PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
        PROOF_OF_VAULT_WALLET_PROVIDER: "okx",
        PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
        PROOF_OF_VAULT_PAYLOAD_PROVIDER: "local",
        PROOF_OF_VAULT_OKX_ACCESS_KEY: "access-key",
        PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: "0x1111111111111111111111111111111111111111",
        PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: "0x2222222222222222222222222222222222222222"
      })
    ).toThrow(/PROOF_OF_VAULT_OKX_SECRET_KEY/);
  });

  it("treats blank optional seed private keys as unset", () => {
    const env = loadEnv({
      PROOF_OF_VAULT_STORAGE: "memory",
      PROOF_OF_VAULT_DEMO_MODE: "false",
      PROOF_OF_VAULT_ONCHAIN_GATEWAY: "mock",
      PROOF_OF_VAULT_WALLET_PROVIDER: "mock",
      PROOF_OF_VAULT_MARKET_PROVIDER: "mock",
      PROOF_OF_VAULT_PAYLOAD_PROVIDER: "local",
      PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: "false",
      PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY: "",
      PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_FUNDER_PRIVATE_KEY: ""
    });

    expect(env.PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY).toBeUndefined();
    expect(env.PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_FUNDER_PRIVATE_KEY).toBeUndefined();
  });
});
