import {
  createViemVaultFactoryGateway,
  MockAgenticWalletProvider,
  MockMarketDataProvider,
  MockOnchainGateway,
  OkxAgenticWalletProvider,
  OkxMarketDataProvider,
  type AgenticWalletProvider,
  type MarketDataProvider,
  type OnchainGateway
} from "@proof-of-vault/agent-runtime";

import type { AppEnv } from "./config/env.js";

export type RuntimeAdapters = {
  onchainGateway: OnchainGateway;
  walletProvider: AgenticWalletProvider;
  marketDataProvider: MarketDataProvider;
};

export function createRuntimeAdapters(env: AppEnv): RuntimeAdapters {
  const onchainGateway =
    env.PROOF_OF_VAULT_ONCHAIN_GATEWAY === "viem"
      ? createViemVaultFactoryGateway({
          rpcUrl: env.PROOF_OF_VAULT_RPC_URL!,
          contractAddress: env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS! as `0x${string}`,
          chainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
          orchestratorPrivateKey: env.PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY! as `0x${string}`,
          finalizerPrivateKey: env.PROOF_OF_VAULT_FINALIZER_PRIVATE_KEY as `0x${string}` | undefined
        })
      : new MockOnchainGateway(env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID);

  const walletProvider =
    env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx"
      ? new OkxAgenticWalletProvider({
          mode: "mcp",
          accessKey: env.PROOF_OF_VAULT_OKX_ACCESS_KEY,
          secretKey: env.PROOF_OF_VAULT_OKX_SECRET_KEY,
          passphrase: env.PROOF_OF_VAULT_OKX_PASSPHRASE,
          endpoint: env.PROOF_OF_VAULT_OKX_MCP_URL,
          rpcUrl: env.PROOF_OF_VAULT_RPC_URL,
          targetEvmChainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
          okxChainIndex: env.PROOF_OF_VAULT_OKX_CHAIN_INDEX,
          vaultFactoryAddress: env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS as `0x${string}`,
          agentStakingAddress: env.PROOF_OF_VAULT_AGENT_STAKING_ADDRESS as `0x${string}`,
          stakeTokenAddress: env.PROOF_OF_VAULT_POV_TOKEN_ADDRESS as `0x${string}`
        })
      : new MockAgenticWalletProvider();

  const marketDataProvider =
    env.PROOF_OF_VAULT_MARKET_PROVIDER === "okx"
      ? new OkxMarketDataProvider({
          accessKey: env.PROOF_OF_VAULT_OKX_ACCESS_KEY,
          secretKey: env.PROOF_OF_VAULT_OKX_SECRET_KEY,
          passphrase: env.PROOF_OF_VAULT_OKX_PASSPHRASE,
          endpoint: env.PROOF_OF_VAULT_OKX_MCP_URL,
          targetEvmChainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
          okxChainIndex: env.PROOF_OF_VAULT_OKX_CHAIN_INDEX
        })
      : new MockMarketDataProvider();

  return {
    onchainGateway,
    walletProvider,
    marketDataProvider
  };
}
