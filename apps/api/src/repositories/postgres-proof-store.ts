import { asc, eq, isNull } from "drizzle-orm";
import { proofReferenceSchema, type ProofReference } from "@proof-of-vault/shared-types";
import type { ProofStore, StoredProof } from "@proof-of-vault/agent-runtime";

import type { AppDatabaseExecutor } from "../db/client.js";
import { proofRecordsTable } from "../db/schema.js";

const STANDALONE_PAYLOAD_VAULT_KEY = "__payloads__";

function mapProofRow(row: typeof proofRecordsTable.$inferSelect): StoredProof {
  const reference = proofReferenceSchema.parse({
    payloadHash: row.payloadHash,
    payloadURI: row.payloadUri,
    proofHash: row.proofHash ?? undefined,
    sourceProvider: row.sourceProvider,
    txHash: row.txHash ?? undefined,
    chainId: row.chainId,
    snapshot: Array.isArray(row.snapshot) ? row.snapshot : [],
    storedAt: Number(row.storedAtMs)
  });

  return {
    vaultKey: row.vaultKey ?? STANDALONE_PAYLOAD_VAULT_KEY,
    payload: row.payload,
    ...reference
  };
}

function mapProofToRow(input: StoredProof): typeof proofRecordsTable.$inferInsert {
  return {
    payloadHash: input.payloadHash,
    vaultKey: input.vaultKey === STANDALONE_PAYLOAD_VAULT_KEY ? null : input.vaultKey,
    payload: input.payload,
    payloadUri: input.payloadURI,
    proofHash: input.proofHash,
    sourceProvider: input.sourceProvider,
    txHash: input.txHash,
    chainId: input.chainId,
    snapshot: input.snapshot,
    storedAtMs: input.storedAt
  };
}

export class PostgresProofStore implements ProofStore {
  constructor(private readonly db: AppDatabaseExecutor) {}

  async put(input: StoredProof): Promise<StoredProof> {
    const row = mapProofToRow(input);
    await this.db
      .insert(proofRecordsTable)
      .values(row)
      .onConflictDoUpdate({
        target: proofRecordsTable.payloadHash,
        set: row
      });

    return input;
  }

  async get(payloadHash: string): Promise<StoredProof | undefined> {
    const [row] = await this.db
      .select()
      .from(proofRecordsTable)
      .where(eq(proofRecordsTable.payloadHash, payloadHash))
      .limit(1);
    return row ? mapProofRow(row) : undefined;
  }

  async listByVault(vaultKey: string): Promise<StoredProof[]> {
    const rows = await this.db
      .select()
      .from(proofRecordsTable)
      .where(
        vaultKey === STANDALONE_PAYLOAD_VAULT_KEY ? isNull(proofRecordsTable.vaultKey) : eq(proofRecordsTable.vaultKey, vaultKey)
      )
      .orderBy(asc(proofRecordsTable.storedAtMs));
    return rows.map(mapProofRow);
  }

  async all(): Promise<StoredProof[]> {
    const rows = await this.db.select().from(proofRecordsTable).orderBy(asc(proofRecordsTable.storedAtMs));
    return rows.map(mapProofRow);
  }
}
