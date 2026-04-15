import type { SourceSnapshot } from "@proof-of-vault/shared-types";

export type MarketDataRequest = {
  kind: "rule" | "resolution" | "audit" | "challenge";
  vaultId: number;
  round: number;
  statement?: string;
  tokenAddress?: string;
  thresholdUsd?: string;
  metadata?: Record<string, unknown>;
};

export interface MarketDataProvider {
  readonly name: string;
  collectSnapshots(request: MarketDataRequest): Promise<SourceSnapshot[]>;
}
