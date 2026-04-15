import { keccak256, stringToHex } from "viem";

import { get, post, type ApiResponse } from "./client";
import { API_ENDPOINTS } from "./config";
import { requireInjectedEthereumProvider } from "@/lib/wallet/injected";

export type RuntimeCollateralToken = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  cap: string;
  enabled: boolean;
};

export type RuntimeConfig = {
  environment: string;
  chain: {
    name: string;
    chainId: number;
    okxChainIndex: number;
    rpcUrl?: string;
    explorerUrl: string;
  };
  contracts: {
    vaultFactory?: `0x${string}`;
    agentStaking?: `0x${string}`;
    povToken?: `0x${string}`;
    rewardPool?: `0x${string}`;
  };
  collateral: {
    allowedTokens: RuntimeCollateralToken[];
    policy: string;
    policySource?: string;
    chainEnforced?: boolean;
  };
  features: {
    demoMode: boolean;
    skillApiOnly: boolean;
    browserWalletSetterTxRequired: boolean;
    automaticRegistrationStakeSeed?: boolean;
  };
  tokenomics?: {
    agentRegistrationStakeAmount?: string;
    bootstrapStakeStrategy?: string;
  };
};

export type StoredPayload = {
  payloadHash: `0x${string}`;
  payloadURI: string;
  storageProvider: "local" | "ipfs";
};

function normalizeScalar(key: string | undefined, value: unknown): unknown {
  if (typeof value === "bigint" || typeof value === "number") {
    return value.toString();
  }

  if (typeof value === "string" && key && ["severity", "result", "outcome", "verdict", "targetRole", "reasonCode"].includes(key)) {
    return value.toUpperCase();
  }

  if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value.toLowerCase();
  }

  return value;
}

function normalizeCanonical(value: unknown, key?: string): unknown {
  const scalar = normalizeScalar(key, value);

  if (Array.isArray(scalar)) {
    return scalar.map((entry) => normalizeCanonical(entry));
  }

  if (scalar && typeof scalar === "object" && Object.prototype.toString.call(scalar) === "[object Object]") {
    return Object.fromEntries(
      Object.keys(scalar as Record<string, unknown>)
        .sort((left, right) => left.localeCompare(right))
        .map((entryKey) => [entryKey, normalizeCanonical((scalar as Record<string, unknown>)[entryKey], entryKey)])
    );
  }

  return scalar;
}

function hashCanonicalPayload(payload: unknown): `0x${string}` {
  return keccak256(stringToHex(JSON.stringify(normalizeCanonical(payload))));
}

function buildPayloadUploadMessage(input: {
  walletAddress: string;
  payloadHash: string;
  vaultId?: string;
  kind?: string;
}): string {
  return [
    "Proof of Vault payload upload",
    `wallet:${input.walletAddress.toLowerCase()}`,
    `payloadHash:${input.payloadHash}`,
    `vaultId:${input.vaultId ?? "none"}`,
    `kind:${input.kind ?? "generic"}`
  ].join("\n");
}

async function signPayloadUploadMessage(walletAddress: string, message: string): Promise<`0x${string}`> {
  const ethereum = requireInjectedEthereumProvider();

  try {
    return (await ethereum.request({
      method: "personal_sign",
      params: [message, walletAddress]
    })) as `0x${string}`;
  } catch {
    const hexMessage = `0x${Array.from(new TextEncoder().encode(message), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    return (await ethereum.request({
      method: "personal_sign",
      params: [hexMessage, walletAddress]
    })) as `0x${string}`;
  }
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await get<ApiResponse<RuntimeConfig>>(API_ENDPOINTS.runtimeConfig);
  if (!response.data) {
    throw new Error("Runtime config response did not include data.");
  }

  return response.data;
}

export async function storePayload(input: {
  vaultId?: string;
  kind?: string;
  payload: unknown;
  walletAddress?: `0x${string}` | string;
  sessionToken?: string;
}): Promise<StoredPayload> {
  const payloadHash = hashCanonicalPayload(input.payload);
  const message =
    input.walletAddress && !input.sessionToken
      ? buildPayloadUploadMessage({
          walletAddress: input.walletAddress,
          payloadHash,
          vaultId: input.vaultId,
          kind: input.kind
        })
      : undefined;
  const signature =
    input.walletAddress && !input.sessionToken ? await signPayloadUploadMessage(input.walletAddress, message!) : undefined;
  const response = await post<ApiResponse<StoredPayload>>(
    API_ENDPOINTS.payloads,
    {
      vaultId: input.vaultId,
      kind: input.kind,
      payload: input.payload,
      walletAddress: input.walletAddress,
      message,
      signature
    },
    {
      headers: input.sessionToken
        ? {
            Authorization: `Bearer ${input.sessionToken}`
          }
        : undefined
    }
  );
  if (!response.data) {
    throw new Error("Payload storage response did not include data.");
  }

  return response.data;
}
