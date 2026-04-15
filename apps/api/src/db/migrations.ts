import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type QueryExecutor = {
  query: (sql: string) => Promise<unknown>;
};

export async function applySqlMigrations(
  executor: QueryExecutor,
  migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations")
): Promise<string[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const statement = sql.trim();
    if (statement.length > 0) {
      await executor.query(statement);
    }
  }

  return files;
}
