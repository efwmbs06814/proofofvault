import { DEFAULT_OKX_CHAIN_INDEX, DEFAULT_TARGET_EVM_CHAIN_ID } from "@proof-of-vault/shared-types";

import type { AppEnv } from "./env.js";
import type { DatabaseHealthStatus } from "../db/client.js";

export type RuntimeReadiness = {
  realDemoReady: boolean;
  requiredModesSatisfied: boolean;
  blockingReasons: string[];
};

export function evaluateRuntimeReadiness(env: AppEnv, database: DatabaseHealthStatus): RuntimeReadiness {
  const blockingReasons: string[] = [];

  if (env.PROOF_OF_VAULT_STORAGE !== "postgres") {
    blockingReasons.push("storage must be postgres");
  }
  if (!database.ok) {
    blockingReasons.push("database is not ready");
  }
  if (env.PROOF_OF_VAULT_ONCHAIN_GATEWAY !== "viem") {
    blockingReasons.push("onchain gateway must be viem");
  }
  if (env.PROOF_OF_VAULT_WALLET_PROVIDER !== "okx") {
    blockingReasons.push("wallet provider must be okx");
  }
  if (env.PROOF_OF_VAULT_MARKET_PROVIDER !== "okx") {
    blockingReasons.push("market provider must be okx");
  }
  if (env.PROOF_OF_VAULT_PAYLOAD_PROVIDER !== "ipfs") {
    blockingReasons.push("payload provider must be ipfs");
  }
  if (env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID !== DEFAULT_TARGET_EVM_CHAIN_ID) {
    blockingReasons.push(`targetEvmChainId must be ${DEFAULT_TARGET_EVM_CHAIN_ID}`);
  }
  if (env.PROOF_OF_VAULT_OKX_CHAIN_INDEX !== DEFAULT_OKX_CHAIN_INDEX) {
    blockingReasons.push(`okxChainIndex must be ${DEFAULT_OKX_CHAIN_INDEX}`);
  }
  if (env.PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO && env.PROOF_OF_VAULT_USING_LEGACY_CHAIN_ALIAS) {
    blockingReasons.push("real demo mode must use PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID explicitly, not the legacy alias");
  }
  if (!env.PROOF_OF_VAULT_OKX_ACCESS_KEY) {
    blockingReasons.push("OKX access key is missing");
  }
  if (!env.PROOF_OF_VAULT_OKX_SECRET_KEY) {
    blockingReasons.push("OKX secret key is missing");
  }
  if (!env.PROOF_OF_VAULT_OKX_PASSPHRASE) {
    blockingReasons.push("OKX passphrase is missing");
  }
  if (!env.PROOF_OF_VAULT_RPC_URL) {
    blockingReasons.push("RPC URL is missing");
  }
  if (!env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS) {
    blockingReasons.push("VaultFactory address is missing");
  }
  if (!env.PROOF_OF_VAULT_AGENT_STAKING_ADDRESS) {
    blockingReasons.push("AgentStaking address is missing");
  }
  if (!env.PROOF_OF_VAULT_POV_TOKEN_ADDRESS) {
    blockingReasons.push("POV token address is missing");
  }
  if (!env.PROOF_OF_VAULT_AUTH_SECRET) {
    blockingReasons.push("auth secret is missing");
  }
  if (!env.PROOF_OF_VAULT_OPERATOR_API_TOKEN) {
    blockingReasons.push("operator API token is missing");
  }
  if (env.PROOF_OF_VAULT_PAYLOAD_PROVIDER === "ipfs" && !env.PROOF_OF_VAULT_IPFS_PINNING_URL) {
    blockingReasons.push("IPFS pinning URL is missing");
  }
  if (!env.PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY) {
    blockingReasons.push("orchestrator private key is missing");
  }
  if (env.PROOF_OF_VAULT_DEMO_MODE) {
    blockingReasons.push("demo mode must be disabled");
  }

  const requiredModesSatisfied =
    env.PROOF_OF_VAULT_STORAGE === "postgres" &&
    env.PROOF_OF_VAULT_ONCHAIN_GATEWAY === "viem" &&
    env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx" &&
    env.PROOF_OF_VAULT_MARKET_PROVIDER === "okx" &&
    env.PROOF_OF_VAULT_PAYLOAD_PROVIDER === "ipfs";

  return {
    realDemoReady: blockingReasons.length === 0,
    requiredModesSatisfied,
    blockingReasons
  };
}
