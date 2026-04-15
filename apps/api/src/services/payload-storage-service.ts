import { createProofReference, hashPayload, type ProofStore } from "@proof-of-vault/agent-runtime";

import type { AppEnv } from "../config/env.js";
import { ValidationError } from "../lib/errors.js";

type StorePayloadInput = {
  vaultId?: string;
  kind?: string;
  payload: unknown;
};

type StorePayloadResult = {
  payloadHash: `0x${string}`;
  payloadURI: string;
  storageProvider: "local" | "ipfs";
};

const DEFAULT_IPFS_GATEWAY_CANDIDATES = [
  "https://gateway.pinata.cloud/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
  "https://dweb.link/ipfs",
  "https://ipfs.io/ipfs"
] as const;
const IPFS_VERIFICATION_MAX_ATTEMPTS = 3;
const IPFS_VERIFICATION_TIMEOUT_MS = 8_000;
const IPFS_VERIFICATION_RETRY_DELAYS_MS = [750, 1_500] as const;

function extractIpfsUri(response: unknown): string | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const record = response as Record<string, unknown>;
  const nestedData = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : undefined;
  const ipfsHash =
    record.IpfsHash ??
    record.ipfsHash ??
    record.cid ??
    record.Hash ??
    record.hash ??
    nestedData?.IpfsHash ??
    nestedData?.ipfsHash ??
    nestedData?.cid ??
    nestedData?.Hash ??
    nestedData?.hash;
  const uri = record.uri ?? nestedData?.uri;

  if (typeof uri === "string" && uri.startsWith("ipfs://")) {
    return uri;
  }

  return typeof ipfsHash === "string" && ipfsHash.length > 0 ? `ipfs://${ipfsHash}` : undefined;
}

function ipfsGatewayUrl(baseUrl: string, uri: string): string {
  const cid = uri.replace(/^ipfs:\/\//, "");
  return `${baseUrl.replace(/\/+$/, "")}/${cid}`;
}

function normalizeGatewayUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export class PayloadStorageService {
  constructor(
    private readonly env: AppEnv,
    private readonly proofStore: ProofStore
  ) {}

  async storePayload(input: StorePayloadInput): Promise<StorePayloadResult> {
    const payloadHash = hashPayload(input.payload);
    const payloadURI =
      this.env.PROOF_OF_VAULT_PAYLOAD_PROVIDER === "ipfs"
        ? await this.pinToIpfs(input, payloadHash)
        : `pov://payloads/${payloadHash}`;

    if (this.env.NODE_ENV === "production" && !payloadURI.startsWith("ipfs://")) {
      throw new ValidationError("Production payload storage must return immutable ipfs:// URIs.");
    }

    await this.proofStore.put({
      vaultKey: input.vaultId ?? "__payloads__",
      payload: input.payload,
      ...createProofReference({
        payloadHash,
        payloadURI,
        sourceProvider: this.env.PROOF_OF_VAULT_PAYLOAD_PROVIDER,
        chainId: this.env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID
      })
    });

    return {
      payloadHash,
      payloadURI,
      storageProvider: this.env.PROOF_OF_VAULT_PAYLOAD_PROVIDER
    };
  }

  private async pinToIpfs(input: StorePayloadInput, payloadHash: `0x${string}`): Promise<string> {
    if (!this.env.PROOF_OF_VAULT_IPFS_PINNING_URL || !this.env.PROOF_OF_VAULT_IPFS_PINNING_JWT) {
      throw new ValidationError("IPFS pinning provider is not configured.");
    }

    const response = await fetch(this.env.PROOF_OF_VAULT_IPFS_PINNING_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.env.PROOF_OF_VAULT_IPFS_PINNING_JWT}`
      },
      body: JSON.stringify({
        pinataMetadata: {
          name: `proof-of-vault-${input.kind ?? "payload"}-${payloadHash.slice(2, 10)}`
        },
        pinataContent: input.payload
      })
    });

    if (!response.ok) {
      throw new ValidationError(`IPFS pinning failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    const uri = extractIpfsUri(payload);
    if (!uri) {
      throw new ValidationError("IPFS pinning provider response did not include a CID.");
    }

    await this.verifyPinnedPayload(uri, payloadHash);

    return uri;
  }

  private async verifyPinnedPayload(uri: string, expectedPayloadHash: `0x${string}`): Promise<void> {
    const gateways = this.resolveVerificationGateways();
    const failures: string[] = [];

    for (let attempt = 0; attempt < IPFS_VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
      for (const gateway of gateways) {
        const result = await this.fetchPinnedPayload(gateway, uri);

        if (result.ok) {
          if (hashPayload(result.payload) === expectedPayloadHash) {
            return;
          }

          failures.push(`${gateway} returned a payload hash mismatch.`);
          continue;
        }

        failures.push(`${gateway} ${result.error}`);
      }

      const retryDelayMs = IPFS_VERIFICATION_RETRY_DELAYS_MS[attempt];
      if (retryDelayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw new ValidationError(
      `Pinned IPFS payload verification failed after retries. ${failures.slice(-6).join(" | ")}`
    );
  }

  private resolveVerificationGateways(): string[] {
    const gateways: string[] = [];

    if ((this.env.PROOF_OF_VAULT_IPFS_PINNING_URL ?? "").includes("pinata")) {
      gateways.push("https://gateway.pinata.cloud/ipfs");
    }

    gateways.push(this.env.PROOF_OF_VAULT_IPFS_GATEWAY_URL);
    gateways.push(...DEFAULT_IPFS_GATEWAY_CANDIDATES);

    return [...new Set(gateways.map(normalizeGatewayUrl))];
  }

  private async fetchPinnedPayload(
    gateway: string,
    uri: string
  ): Promise<{ ok: true; payload: unknown } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IPFS_VERIFICATION_TIMEOUT_MS);

    try {
      const response = await fetch(ipfsGatewayUrl(gateway, uri), {
        method: "GET",
        headers: {
          accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `returned status ${response.status}`
        };
      }

      try {
        return {
          ok: true,
          payload: (await response.json()) as unknown
        };
      } catch {
        return {
          ok: false,
          error: "returned non-JSON content"
        };
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          error: `timed out after ${IPFS_VERIFICATION_TIMEOUT_MS}ms`
        };
      }

      return {
        ok: false,
        error: error instanceof Error ? error.message : "request failed"
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
