import {
  DEFAULT_TARGET_EVM_CHAIN_ID,
  type ProofReference,
  type ResolutionCommitPayload,
  type SourceSnapshot
} from "@proof-of-vault/shared-types";
import { encodeAbiParameters, keccak256, stringToHex, type Address } from "viem";

import { stringifyCanonicalJson } from "./canonical-json.js";

export function hashPayload(payload: unknown): `0x${string}` {
  return keccak256(stringToHex(stringifyCanonicalJson(payload)));
}

function resolutionOutcomeToSolidityEnum(outcome: ResolutionCommitPayload["outcome"]): number {
  switch (outcome) {
    case "TRUE":
      return 1;
    case "FALSE":
      return 2;
    case "INVALID":
      return 3;
  }

  throw new Error(`Unsupported resolution outcome: ${outcome as string}`);
}

export function computeResolutionCommitHash(payload: ResolutionCommitPayload): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256", name: "vaultId" },
        { type: "address", name: "validator" },
        { type: "uint8", name: "outcome" },
        { type: "bytes32", name: "proofHash" },
        { type: "bytes32", name: "salt" }
      ],
      [
        BigInt(payload.vaultId),
        payload.submittedByAgent.toLowerCase() as Address,
        resolutionOutcomeToSolidityEnum(payload.outcome),
        payload.proofHash as `0x${string}`,
        payload.salt as `0x${string}`
      ]
    )
  );
}

export function createProofReference(input: {
  payloadHash: `0x${string}`;
  payloadURI: string;
  sourceProvider: string;
  proofHash?: `0x${string}`;
  txHash?: `0x${string}`;
  chainId?: number;
  snapshot?: SourceSnapshot[];
  storedAt?: number;
}): ProofReference {
  return {
    payloadHash: input.payloadHash,
    payloadURI: input.payloadURI,
    sourceProvider: input.sourceProvider,
    proofHash: input.proofHash,
    txHash: input.txHash,
    chainId: input.chainId ?? DEFAULT_TARGET_EVM_CHAIN_ID,
    snapshot: input.snapshot ?? [],
    storedAt: input.storedAt ?? Date.now()
  };
}
