import type { ProofReference } from "@proof-of-vault/shared-types";

export type StoredProof = ProofReference & {
  vaultKey: string;
  payload: unknown;
};

export interface ProofStore {
  put(input: StoredProof): Promise<StoredProof>;
  get(payloadHash: string): Promise<StoredProof | undefined>;
  listByVault(vaultKey: string): Promise<StoredProof[]>;
  all(): Promise<StoredProof[]>;
}

export class InMemoryProofStore implements ProofStore {
  private readonly proofs = new Map<string, StoredProof>();

  async put(input: StoredProof): Promise<StoredProof> {
    this.proofs.set(input.payloadHash, input);
    return input;
  }

  async get(payloadHash: string): Promise<StoredProof | undefined> {
    return this.proofs.get(payloadHash);
  }

  async listByVault(vaultKey: string): Promise<StoredProof[]> {
    return [...this.proofs.values()].filter((proof) => proof.vaultKey === vaultKey);
  }

  async all(): Promise<StoredProof[]> {
    return [...this.proofs.values()];
  }
}
