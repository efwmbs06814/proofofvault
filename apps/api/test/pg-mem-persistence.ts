import { createDatabaseFromPool } from "../src/db/client.js";
import type { AppPersistence, PersistenceStores } from "../src/db/factory.js";
import { applySqlMigrations } from "../src/db/migrations.js";
import { PostgresProofStore } from "../src/repositories/postgres-proof-store.js";
import { PostgresWorkflowStore } from "../src/repositories/postgres-workflow-store.js";

type PgMemPool = {
  query: (...args: unknown[]) => Promise<unknown>;
  end: () => Promise<void>;
};

type PgMemQuery = {
  rowMode?: string;
  types?: unknown;
};

type PgMemResult = {
  rows: Record<string, unknown>[];
  fields: Array<{ name: string }>;
};

type PgMemPrototype = {
  query: (...args: unknown[]) => Promise<unknown>;
  adaptQuery?: (...args: unknown[]) => unknown;
  adaptResults?: (query: PgMemQuery, result: PgMemResult) => unknown;
};

type PgMemAdapter = {
  Pool: {
    new (): PgMemPool;
    prototype: PgMemPrototype;
  };
  Client: {
    prototype: PgMemPrototype;
  };
};

function sanitizePgQueryArgs(args: unknown[]): unknown[] {
  if (args.length === 0) {
    return args;
  }

  const [query, ...rest] = args;
  if (!query || typeof query !== "object" || !("types" in query)) {
    return args;
  }

  const sanitizedQuery = { ...(query as Record<string, unknown>) };
  delete sanitizedQuery.types;
  return [sanitizedQuery, ...rest];
}

function patchPgMemAdapter(adapter: PgMemAdapter): void {
  const poolAdaptQuery = adapter.Pool.prototype.adaptQuery;
  if (poolAdaptQuery) {
    adapter.Pool.prototype.adaptQuery = function patchedPoolAdaptQuery(...args: unknown[]) {
      return poolAdaptQuery.apply(this, sanitizePgQueryArgs(args));
    };
  }

  const clientAdaptQuery = adapter.Client.prototype.adaptQuery;
  if (clientAdaptQuery) {
    adapter.Client.prototype.adaptQuery = function patchedClientAdaptQuery(...args: unknown[]) {
      return clientAdaptQuery.apply(this, sanitizePgQueryArgs(args));
    };
  }

  const poolAdaptResults = adapter.Pool.prototype.adaptResults;
  if (poolAdaptResults) {
    adapter.Pool.prototype.adaptResults = function patchedPoolAdaptResults(query, result) {
      if (query?.rowMode === "array") {
        return {
          ...result,
          rows: result.rows.map((row) => result.fields.map((field) => row[field.name]))
        };
      }

      return poolAdaptResults.call(this, query, result);
    };
  }

  const clientAdaptResults = adapter.Client.prototype.adaptResults;
  if (clientAdaptResults) {
    adapter.Client.prototype.adaptResults = function patchedClientAdaptResults(query, result) {
      if (query?.rowMode === "array") {
        return {
          ...result,
          rows: result.rows.map((row) => result.fields.map((field) => row[field.name]))
        };
      }

      return clientAdaptResults.call(this, query, result);
    };
  }

  const poolQuery = adapter.Pool.prototype.query;
  adapter.Pool.prototype.query = function patchedPoolQuery(...args: unknown[]) {
    return poolQuery.apply(this, sanitizePgQueryArgs(args));
  };

  const clientQuery = adapter.Client.prototype.query;
  adapter.Client.prototype.query = function patchedClientQuery(...args: unknown[]) {
    return clientQuery.apply(this, sanitizePgQueryArgs(args));
  };
}

export async function createPgMemPersistenceFactory(): Promise<{
  createPersistence: () => Promise<AppPersistence>;
}>;
export async function createPgMemPersistenceFactory(options: { migrated?: boolean }): Promise<{
  createPersistence: () => Promise<AppPersistence>;
}>;
export async function createPgMemPersistenceFactory(options: { migrated?: boolean } = {}): Promise<{
  createPersistence: () => Promise<AppPersistence>;
}> {
  const { newDb } = await import("pg-mem");
  const memoryDb = newDb({
    autoCreateForeignKeyIndices: true
  });
  const adapter = memoryDb.adapters.createPg() as PgMemAdapter;
  patchPgMemAdapter(adapter);
  const migrated = options.migrated ?? true;

  if (migrated) {
    const migratorPool = new adapter.Pool();

    try {
      await applySqlMigrations(migratorPool as never);
    } finally {
      await migratorPool.end();
    }
  }

  return {
    async createPersistence() {
      const pool = new adapter.Pool();
      const db = createDatabaseFromPool(pool as never);
      const workflowStore = new PostgresWorkflowStore(db);
      const proofStore = new PostgresProofStore(db);

      return {
        workflowStore,
        proofStore,
        storageMode: "postgres",
        databaseDriver: "postgres",
        async checkHealth() {
          const result = await pool.query({
            text: "select table_name from information_schema.tables where table_schema = 'public'"
          });
          const expectedTables = [
            "vaults",
            "agent_profiles",
            "agent_submissions",
            "proof_records",
            "auth_challenges",
            "agent_registrations",
            "judge_list_entries"
          ];
          const existingTables = new Set(
            ((result as { rows: Array<{ table_name?: string; table_name_?: string }> }).rows ?? [])
              .map((row) => row.table_name ?? row.table_name_)
              .filter((value): value is string => Boolean(value))
          );
          const missingTables = expectedTables.filter((tableName) => !existingTables.has(tableName));

          return {
            ok: missingTables.length === 0,
            migrationsApplied: missingTables.length === 0,
            missingTables
          };
        },
        async runInTransaction<T>(fn: (stores: PersistenceStores) => Promise<T>) {
          try {
            return db.transaction(async (tx) =>
              fn({
                workflowStore: new PostgresWorkflowStore(tx),
                proofStore: new PostgresProofStore(tx)
              })
            );
          } catch (error) {
            throw error;
          }
        },
        async close() {
          await pool.end();
        }
      } satisfies AppPersistence;
    }
  };
}
