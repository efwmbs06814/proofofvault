import {
  DEFAULT_OKX_CHAIN_INDEX,
  DEFAULT_TARGET_EVM_CHAIN_ID,
  type SourceSnapshot
} from "@proof-of-vault/shared-types";

import type { MarketDataProvider, MarketDataRequest } from "./market-data-provider.js";

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "mock-okx-market-skill";

  async collectSnapshots(request: MarketDataRequest): Promise<SourceSnapshot[]> {
    const now = new Date().toISOString();
    const baseValue = request.vaultId * 111_111 + request.round * 1_000;

    return [
      {
        provider: this.name,
        kind: request.kind,
        value: String(baseValue),
        timestamp: now,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        metadata: {
          statement: request.statement,
          tokenAddress: request.tokenAddress,
          thresholdUsd: request.thresholdUsd,
          providerCollected: true,
          syntheticFallback: true,
          targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
          okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
          mockSnapshot: true
        }
      }
    ];
  }
}
