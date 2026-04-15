import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const webRoot = process.cwd();
const repoRoot = path.resolve(webRoot, "..", "..");
const sourcePath = path.join(repoRoot, "packages", "agent-runtime", "skills.md");
const outputDir = path.join(webRoot, "src", "generated");
const outputPath = path.join(outputDir, "agent-skill-content.ts");

const markdown = await readFile(sourcePath, "utf8");
const body = [
  "// This file is generated from packages/agent-runtime/skills.md.",
  "// Run `corepack pnpm --filter @proof-of-vault/web sync:skill` after editing the canonical skill.",
  `export const agentSkillMarkdown = ${JSON.stringify(markdown)};`,
  ""
].join("\n");

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, body, "utf8");
