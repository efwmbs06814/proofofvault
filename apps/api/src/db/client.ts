import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

const REQUIRED_POSTGRES_TABLES = [
  "vaults",
  "agent_profiles",
  "agent_submissions",
  "proof_records",
  "auth_challenges",
  "agent_registrations",
  "judge_list_entries",
  "processed_stake_transactions"
] as const;

function createDrizzle(pool: Pool) {
  return drizzle(pool, { schema });
}

export type AppDatabase = ReturnType<typeof createDrizzle>;
export type AppDatabaseExecutor = Omit<AppDatabase, "$client">;
export type DatabaseHealthStatus = {
  ok: boolean;
  migrationsApplied: boolean;
  missingTables: string[];
};

export function createPostgresDatabaseClient(config: { connectionString: string; max?: number }): {
  pool: Pool;
  db: AppDatabase;
  checkHealth: () => Promise<DatabaseHealthStatus>;
  close: () => Promise<void>;
} {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.max ?? 10
  });
  const db = createDrizzle(pool);

  return {
    pool,
    db,
    async checkHealth() {
      try {
        const result = await pool.query<{ table_name: string }>(
          "select table_name from information_schema.tables where table_schema = 'public'"
        );
        const existingTables = new Set(result.rows.map((row) => row.table_name));
        const missingTables = REQUIRED_POSTGRES_TABLES.filter((tableName) => !existingTables.has(tableName));

        return {
          ok: missingTables.length === 0,
          migrationsApplied: missingTables.length === 0,
          missingTables: [...missingTables]
        };
      } catch {
        return {
          ok: false,
          migrationsApplied: false,
          missingTables: [...REQUIRED_POSTGRES_TABLES]
        };
      }
    },
    async close() {
      await pool.end();
    }
  };
}

export function createDatabaseFromPool(pool: Pool): AppDatabase {
  return createDrizzle(pool);
}
