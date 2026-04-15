import type { AgentProfile } from "@proof-of-vault/shared-types";

export type SeedEvidence = {
  strategy: "fixed_registration_bootstrap";
  amount: string;
  txHash: string;
  seededAt: number;
  signer: string;
};

export type PendingSeedEvidence = {
  strategy: "fixed_registration_bootstrap";
  amount: string;
  startedAt: number;
  signer: string;
  stage: "awaiting_tx_hash" | "broadcasted" | "failed";
  txHash?: string;
  error?: string;
  attemptedAt?: number;
};

export function readSeedEvidence(agent?: AgentProfile): SeedEvidence | undefined {
  const candidate = agent?.walletProviderEvidence?.registrationStakeSeed;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const value = candidate as Partial<SeedEvidence>;
  if (
    value.strategy !== "fixed_registration_bootstrap" ||
    typeof value.amount !== "string" ||
    typeof value.txHash !== "string" ||
    typeof value.seededAt !== "number" ||
    typeof value.signer !== "string"
  ) {
    return undefined;
  }

  return value as SeedEvidence;
}

export function readPendingSeedEvidence(agent?: AgentProfile): PendingSeedEvidence | undefined {
  const candidate = agent?.walletProviderEvidence?.registrationStakeSeedPending;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const value = candidate as Partial<PendingSeedEvidence>;
  const normalizedStage =
    value.stage === "broadcasted" && typeof value.txHash !== "string" ? "awaiting_tx_hash" : value.stage;
  if (
    value.strategy !== "fixed_registration_bootstrap" ||
    typeof value.amount !== "string" ||
    typeof value.startedAt !== "number" ||
    typeof value.signer !== "string" ||
    (normalizedStage !== "awaiting_tx_hash" && normalizedStage !== "broadcasted" && normalizedStage !== "failed")
  ) {
    return undefined;
  }

  if (value.txHash !== undefined && typeof value.txHash !== "string") {
    return undefined;
  }

  if (value.error !== undefined && typeof value.error !== "string") {
    return undefined;
  }

  if (value.attemptedAt !== undefined && typeof value.attemptedAt !== "number") {
    return undefined;
  }

  return {
    ...value,
    stage: normalizedStage
  } as PendingSeedEvidence;
}

export function buildPendingSeedEvidence(input: {
  amount: bigint | string;
  signer: string;
  stage: PendingSeedEvidence["stage"];
  txHash?: string;
  error?: string;
  startedAt?: number;
  attemptedAt?: number;
}): PendingSeedEvidence {
  return {
    strategy: "fixed_registration_bootstrap",
    amount: typeof input.amount === "bigint" ? input.amount.toString() : input.amount,
    startedAt: input.startedAt ?? Date.now(),
    signer: input.signer,
    stage: input.stage,
    txHash: input.txHash,
    error: input.error,
    attemptedAt: input.attemptedAt
  };
}
