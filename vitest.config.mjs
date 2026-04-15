import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      "@proof-of-vault/agent-runtime": resolve(rootDir, "packages/agent-runtime/src/index.ts"),
      "@proof-of-vault/shared-types": resolve(rootDir, "packages/shared-types/src/index.ts")
    }
  },
  test: {
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  }
};
