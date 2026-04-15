import {
  DEFAULT_OKX_CHAIN_INDEX,
  DEFAULT_TARGET_EVM_CHAIN_ID,
  type SourceSnapshot
} from "@proof-of-vault/shared-types";

import type { MarketDataProvider, MarketDataRequest } from "./market-data-provider.js";
import { callOkxMcpTool, parseOkxMcpJsonContent } from "./okx-auth.js";

type OkxMcpTransport = (request: {
  endpoint: string;
  accessKey: string;
  secretKey?: string;
  passphrase?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}) => Promise<Record<string, unknown>>;

type OkxTokenCandidate = {
  chainIndex: string;
  tokenContractAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
  price?: string;
};

type OkxMarketRow = Record<string, unknown>;

async function defaultTransport(request: {
  endpoint: string;
  accessKey: string;
  secretKey?: string;
  passphrase?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  return callOkxMcpTool(request);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function readRows(value: unknown): OkxMarketRow[] {
  const parsed = parseOkxMcpJsonContent(value);
  return Array.isArray(parsed.data) ? parsed.data.filter((item): item is OkxMarketRow => Boolean(readRecord(item))) : [];
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function lowerHexAddress(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : undefined;
}

function toIsoTimestamp(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return new Date().toISOString();
  }

  return new Date(numeric).toISOString();
}

function collectSearchTerms(request: MarketDataRequest): string[] {
  const metadata = readRecord(request.metadata);
  const terms = [
    request.tokenAddress,
    readString(metadata, "tokenAddress"),
    readString(metadata, "observationObject"),
    readString(metadata, "tokenSymbol"),
    readString(metadata, "search"),
    readString(metadata, "symbol"),
    request.statement
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .map((value) => value.trim());

  const statementAddress = request.statement?.match(/0x[a-fA-F0-9]{40}/)?.[0];
  if (statementAddress) {
    terms.unshift(statementAddress);
  }

  return [...new Set(terms)];
}

function resolveCandidateFromRows(
  rows: OkxMarketRow[],
  okxChainIndex: number,
  requestedTokenAddress?: string
): OkxTokenCandidate | undefined {
  const normalizedRequested = lowerHexAddress(requestedTokenAddress);
  if (normalizedRequested) {
    const exact = rows.find((row) => lowerHexAddress(readString(row, "tokenContractAddress")) === normalizedRequested);
    if (exact) {
      return {
        chainIndex: readString(exact, "chainIndex") ?? String(okxChainIndex),
        tokenContractAddress: normalizedRequested,
        tokenSymbol: readString(exact, "tokenSymbol"),
        tokenName: readString(exact, "tokenName"),
        price: readString(exact, "price")
      };
    }

    return {
      chainIndex: String(okxChainIndex),
      tokenContractAddress: normalizedRequested
    };
  }

  const first = rows[0];
  if (!first) {
    return undefined;
  }

  const tokenContractAddress = lowerHexAddress(readString(first, "tokenContractAddress"));
  if (!tokenContractAddress) {
    return undefined;
  }

  return {
    chainIndex: readString(first, "chainIndex") ?? String(okxChainIndex),
    tokenContractAddress,
    tokenSymbol: readString(first, "tokenSymbol"),
    tokenName: readString(first, "tokenName"),
    price: readString(first, "price")
  };
}

async function discoverTokenCandidate(
  transport: OkxMcpTransport,
  request: {
    endpoint: string;
    accessKey: string;
    secretKey?: string;
    passphrase?: string;
    okxChainIndex: number;
    marketRequest: MarketDataRequest;
  }
): Promise<OkxTokenCandidate | undefined> {
  const directTokenAddress = lowerHexAddress(request.marketRequest.tokenAddress);
  if (directTokenAddress) {
    return {
      chainIndex: String(request.okxChainIndex),
      tokenContractAddress: directTokenAddress
    };
  }

  for (const search of collectSearchTerms(request.marketRequest)) {
    const response = await transport({
      endpoint: request.endpoint,
      accessKey: request.accessKey,
      secretKey: request.secretKey,
      passphrase: request.passphrase,
      toolName: "dex-okx-market-token-search",
      arguments: {
        chains: String(request.okxChainIndex),
        search
      }
    });
    const rows = readRows(response).filter(
      (row) => (readString(row, "chainIndex") ?? String(request.okxChainIndex)) === String(request.okxChainIndex)
    );
    const candidate = resolveCandidateFromRows(rows, request.okxChainIndex, search);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function buildSnapshot(request: {
  providerName: string;
  marketRequest: MarketDataRequest;
  targetEvmChainId: number;
  okxChainIndex: number;
  row?: OkxMarketRow;
  candidate?: OkxTokenCandidate;
  fallback?: string;
}): SourceSnapshot {
  const row = request.row;
  const candidate = request.candidate;
  const rowPrice = readString(row, "price");
  const syntheticFallback = Boolean(request.fallback) || !rowPrice;
  const metadata = {
    ...(request.marketRequest.metadata ?? {}),
    providerCollected: !syntheticFallback,
    syntheticFallback,
    noPriceData: !request.fallback && !rowPrice,
    okxChainIndex: request.okxChainIndex,
    targetEvmChainId: request.targetEvmChainId,
    tokenContractAddress:
      lowerHexAddress(readString(row, "tokenContractAddress")) ?? candidate?.tokenContractAddress,
    tokenSymbol: readString(row, "tokenSymbol") ?? candidate?.tokenSymbol,
    tokenName: readString(row, "tokenName") ?? candidate?.tokenName,
    liquidity: readString(row, "liquidity"),
    marketCap: readString(row, "marketCap"),
    thresholdUsd: request.marketRequest.thresholdUsd,
    fallback: request.fallback
  };

  return {
    provider: request.providerName,
    kind: request.marketRequest.kind,
    value: rowPrice ?? candidate?.price ?? request.fallback,
    timestamp: toIsoTimestamp(readString(row, "time")),
    uri: undefined,
    chainId: request.targetEvmChainId,
    metadata
  };
}

export class OkxMarketDataProvider implements MarketDataProvider {
  readonly name = "okx-market-mcp";

  constructor(
    private readonly options: {
      accessKey?: string;
      secretKey?: string;
      passphrase?: string;
      endpoint?: string;
      targetEvmChainId?: number;
      okxChainIndex?: number;
      transport?: OkxMcpTransport;
    }
  ) {
    if (!options.accessKey) {
      throw new Error("OKX Market/MCP integration is not configured. Set PROOF_OF_VAULT_OKX_ACCESS_KEY first.");
    }

    if ((options.secretKey && !options.passphrase) || (!options.secretKey && options.passphrase)) {
      throw new Error(
        "OKX Market/MCP integration requires both PROOF_OF_VAULT_OKX_SECRET_KEY and PROOF_OF_VAULT_OKX_PASSPHRASE."
      );
    }

    if (!options.endpoint) {
      throw new Error("OKX Market/MCP integration is not configured. Set PROOF_OF_VAULT_OKX_MCP_URL first.");
    }
  }

  async collectSnapshots(request: MarketDataRequest): Promise<SourceSnapshot[]> {
    const transport = this.options.transport ?? defaultTransport;
    const okxChainIndex = this.options.okxChainIndex ?? DEFAULT_OKX_CHAIN_INDEX;
    const targetEvmChainId = this.options.targetEvmChainId ?? DEFAULT_TARGET_EVM_CHAIN_ID;
    const common = {
      endpoint: this.options.endpoint!,
      accessKey: this.options.accessKey!,
      secretKey: this.options.secretKey,
      passphrase: this.options.passphrase,
      okxChainIndex,
      marketRequest: request
    };

    const candidate = await discoverTokenCandidate(transport, common);

    if (candidate) {
      const response = await transport({
        endpoint: common.endpoint,
        accessKey: common.accessKey,
        secretKey: common.secretKey,
        passphrase: common.passphrase,
        toolName: "dex-okx-market-token-price-info",
        arguments: {
          items: [
            {
              chainIndex: candidate.chainIndex,
              tokenContractAddress: candidate.tokenContractAddress
            }
          ]
        }
      });
      const row = readRows(response)[0];

      return [
        buildSnapshot({
          providerName: this.name,
          marketRequest: request,
          targetEvmChainId,
          okxChainIndex,
          row,
          candidate
        })
      ];
    }

    const chainsResponse = await transport({
      endpoint: common.endpoint,
      accessKey: common.accessKey,
      secretKey: common.secretKey,
      passphrase: common.passphrase,
      toolName: "dex-okx-market-price-chains",
      arguments: {
        chainIndex: String(okxChainIndex)
      }
    });
    const chainRows = readRows(chainsResponse);

    return [
      buildSnapshot({
        providerName: this.name,
        marketRequest: request,
        targetEvmChainId,
        okxChainIndex,
        fallback: `supported_chains:${chainRows.length}`
      })
    ];
  }
}
