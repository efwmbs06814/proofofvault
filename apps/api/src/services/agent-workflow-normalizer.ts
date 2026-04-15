import type { AgentSubmission, VaultSummary } from "@proof-of-vault/shared-types";

import { NotFoundError, ValidationError } from "../lib/errors.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";

export type CommitteeBootstrapPhase = "rule" | "resolution";

export type CommitteeBootstrapper = (
  vaultId: string,
  agentAddress: string,
  phase: CommitteeBootstrapPhase
) => Promise<VaultSummary>;

type SubmissionKind = AgentSubmission["kind"];

type PayloadUploadContext = {
  vaultId?: string;
  kind?: string;
  payload: unknown;
  walletAddress?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function phaseForKind(kind: string | undefined): CommitteeBootstrapPhase | undefined {
  if (kind === "rule_draft" || kind === "rule_issue") {
    return "rule";
  }

  if (kind === "resolution_commit" || kind === "resolution_reveal" || kind === "audit_verdict") {
    return "resolution";
  }

  return undefined;
}

function currentRoundForKind(vault: VaultSummary, kind: SubmissionKind): number | undefined {
  const phase = phaseForKind(kind);
  if (!phase) {
    return undefined;
  }

  return phase === "rule" ? vault.ruleRound : vault.resolutionRound;
}

function committeeExistsForPhase(vault: VaultSummary, phase: CommitteeBootstrapPhase): boolean {
  return phase === "rule" ? Boolean(vault.ruleCommittee) : Boolean(vault.resolutionCommittee);
}

function normalizeNumericField(
  value: unknown,
  currentRound: number,
  fieldName: string,
  vaultId: string
): number {
  if (value === undefined) {
    return currentRound;
  }

  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue) || !Number.isInteger(nextValue) || nextValue < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative integer.`);
  }

  if (nextValue === 0) {
    return currentRound;
  }

  if (currentRound > 0 && nextValue !== currentRound) {
    throw new ValidationError(`Vault ${vaultId} current round is ${currentRound}, but ${fieldName} was ${nextValue}.`);
  }

  return nextValue;
}

function normalizePayloadRound(
  payload: AgentSubmission["payload"] | unknown,
  currentRound: number | undefined,
  vaultId: string
): AgentSubmission["payload"] | unknown {
  if (!currentRound || !isRecord(payload) || !("round" in payload)) {
    return payload;
  }

  return {
    ...payload,
    round: normalizeNumericField(payload.round, currentRound, "payload.round", vaultId)
  };
}

async function maybeBootstrapCommittee(
  vault: VaultSummary,
  agentAddress: string,
  kind: string | undefined,
  bootstrapCommittee?: CommitteeBootstrapper
): Promise<VaultSummary> {
  if (!bootstrapCommittee) {
    return vault;
  }

  const phase = phaseForKind(kind);
  if (!phase || committeeExistsForPhase(vault, phase)) {
    return vault;
  }

  return bootstrapCommittee(vault.id, agentAddress, phase);
}

export async function resolveVaultByAnyId(
  store: WorkflowStore,
  vaultId: number | string
): Promise<VaultSummary> {
  const normalizedVaultId = String(vaultId);
  const direct = await store.getVault(normalizedVaultId);
  if (direct) {
    return direct;
  }

  const numericVaultId = Number(normalizedVaultId);
  if (Number.isInteger(numericVaultId) && numericVaultId >= 0) {
    const matched = (await store.listVaults()).find((vault) => vault.externalVaultId === numericVaultId);
    if (matched) {
      return matched;
    }
  }

  throw new NotFoundError(`Vault ${normalizedVaultId} was not found.`);
}

export async function normalizeAgentSubmissionInput(
  store: WorkflowStore,
  input: AgentSubmission,
  bootstrapCommittee?: CommitteeBootstrapper
): Promise<{ vault: VaultSummary; submission: AgentSubmission }> {
  let vault = await resolveVaultByAnyId(store, input.vaultId);
  vault = await maybeBootstrapCommittee(vault, input.agentAddress, input.kind, bootstrapCommittee);

  const currentRound = currentRoundForKind(vault, input.kind);
  const nextRound = currentRound
    ? normalizeNumericField(input.round, currentRound, "round", vault.id)
    : input.round;
  const nextPayload = normalizePayloadRound(input.payload, currentRound, vault.id) as AgentSubmission["payload"];

  return {
    vault,
    submission: {
      ...input,
      round: nextRound,
      payload: nextPayload
    } as AgentSubmission
  };
}

export async function normalizePayloadUploadInput(
  store: WorkflowStore,
  input: PayloadUploadContext,
  bootstrapCommittee?: CommitteeBootstrapper
): Promise<PayloadUploadContext> {
  if (!input.vaultId || !input.kind || !input.walletAddress) {
    return input;
  }

  let vault = await resolveVaultByAnyId(store, input.vaultId);
  vault = await maybeBootstrapCommittee(vault, input.walletAddress, input.kind, bootstrapCommittee);
  const phase = phaseForKind(input.kind);
  const currentRound =
    phase === "rule" ? vault.ruleRound : phase === "resolution" ? vault.resolutionRound : undefined;

  return {
    ...input,
    vaultId: vault.id,
    payload: normalizePayloadRound(input.payload, currentRound, vault.id)
  };
}
