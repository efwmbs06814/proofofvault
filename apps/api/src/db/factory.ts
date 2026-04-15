import { InMemoryProofStore, type ProofStore } from "@proof-of-vault/agent-runtime";

import type { AppEnv } from "../config/env.js";
import { InMemoryWorkflowStore } from "../repositories/in-memory-store.js";
import { PostgresProofStore } from "../repositories/postgres-proof-store.js";
import { PostgresWorkflowStore } from "../repositories/postgres-workflow-store.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";
import { createPostgresDatabaseClient, type DatabaseHealthStatus } from "./client.js";

export type PersistenceStores = {
  workflowStore: WorkflowStore;
  proofStore: ProofStore;
};

export type AppPersistence = PersistenceStores & {
  storageMode: "memory" | "postgres";
  databaseDriver: "memory" | "postgres";
  checkHealth: () => Promise<DatabaseHealthStatus>;
  runInTransaction: <T>(fn: (stores: PersistenceStores) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export function createMemoryPersistence(): AppPersistence {
  const workflowStore = new InMemoryWorkflowStore();
  const proofStore = new InMemoryProofStore();

  return {
    workflowStore,
    proofStore,
    storageMode: "memory",
    databaseDriver: "memory",
    async checkHealth() {
      return {
        ok: true,
        migrationsApplied: true,
        missingTables: []
      };
    },
    async runInTransaction<T>(fn: (stores: PersistenceStores) => Promise<T>) {
      return fn({ workflowStore, proofStore });
    },
    async close() {}
  };
}

export function createPostgresPersistence(env: AppEnv): AppPersistence {
  const client = createPostgresDatabaseClient({
    connectionString: env.DATABASE_URL!,
    max: env.PROOF_OF_VAULT_DB_POOL_MAX
  });

  return {
    workflowStore: new PostgresWorkflowStore(client.db),
    proofStore: new PostgresProofStore(client.db),
    storageMode: "postgres",
    databaseDriver: "postgres",
    checkHealth: client.checkHealth,
    async runInTransaction<T>(fn: (stores: PersistenceStores) => Promise<T>) {
      return client.db.transaction(async (tx) =>
        fn({
          workflowStore: new PostgresWorkflowStore(tx),
          proofStore: new PostgresProofStore(tx)
        })
      );
    },
    close: client.close
  };
}

export function createPersistence(env: AppEnv): AppPersistence {
  return env.PROOF_OF_VAULT_STORAGE === "postgres" ? createPostgresPersistence(env) : createMemoryPersistence();
}
