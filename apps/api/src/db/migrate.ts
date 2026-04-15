import { createPostgresDatabaseClient } from "./client.js";
import { applySqlMigrations } from "./migrations.js";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run database migrations.");
  }

  const client = createPostgresDatabaseClient({
    connectionString: databaseUrl,
    max: Number(process.env.PROOF_OF_VAULT_DB_POOL_MAX ?? "10")
  });

  try {
    const applied = await applySqlMigrations(client.pool);
    console.log(`Applied ${applied.length} SQL migration(s).`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
