import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { capabilityTagSchema, type CapabilityTag } from "@proof-of-vault/shared-types";

import { loadEnv } from "../config/env.js";
import { createPersistence } from "../db/factory.js";
import { createRuntimeAdapters } from "../runtime.js";
import { AgentRegistrationService } from "../services/agent-registration-service.js";
import { AgentStakeSeedService } from "../services/agent-stake-seed-service.js";
import { OperatorWalletBootstrapService } from "../services/operator-wallet-bootstrap-service.js";

function parseCapabilityTags(value: string): CapabilityTag[] {
  const tags = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (tags.length === 0) {
    throw new Error("At least one capability tag is required.");
  }

  return tags.map((tag) => capabilityTagSchema.parse(tag));
}

async function promptSecret(question: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Interactive TTY is required to enter secrets safely.");
  }

  output.write(question);
  input.setRawMode?.(true);
  input.resume();
  input.setEncoding("utf8");

  return new Promise<string>((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      input.removeListener("data", onData);
      input.setRawMode?.(false);
      output.write("\n");
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Bootstrap cancelled by operator."));
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(buffer.trim());
          return;
        }

        if (char === "\u0008" || char === "\u007f") {
          buffer = buffer.slice(0, -1);
          continue;
        }

        buffer += char;
      }
    };

    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.PROOF_OF_VAULT_WALLET_PROVIDER !== "okx") {
    throw new Error("bootstrap-okx-agent-wallet requires PROOF_OF_VAULT_WALLET_PROVIDER=okx.");
  }

  const persistence = createPersistence(env);
  const adapters = createRuntimeAdapters(env);
  const agentStakeSeedService = new AgentStakeSeedService(persistence.workflowStore, env);
  const registrationService = new AgentRegistrationService(
    persistence.workflowStore,
    adapters.walletProvider,
    env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
    undefined,
    agentStakeSeedService.isEnabled() ? agentStakeSeedService : undefined
  );
  const bootstrapService = new OperatorWalletBootstrapService(
    persistence.workflowStore,
    adapters.walletProvider,
    registrationService,
    env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID
  );
  const rl = createInterface({ input, output });

  try {
    const agentLabel = (await rl.question("Agent label: ")).trim();
    const capabilityTags = parseCapabilityTags(
      await rl.question("Capability tags (comma-separated, e.g. validator,auditor): ")
    );
    const joinJudgeListAnswer = (await rl.question("Join judge list now? (Y/n): ")).trim().toLowerCase();
    const email = (await promptSecret("OKX account email: ")).trim();
    const otp = await promptSecret("One-time OTP code: ");

    if (!agentLabel) {
      throw new Error("Agent label is required.");
    }
    if (!email) {
      throw new Error("Email is required.");
    }
    if (!otp) {
      throw new Error("OTP is required.");
    }

    const result = await bootstrapService.bootstrap({
      agentLabel,
      capabilityTags,
      email,
      otp,
      joinJudgeList: joinJudgeListAnswer !== "n"
    });

    output.write(
      JSON.stringify(
        {
          agentAddress: result.agentAddress,
          walletAddress: result.walletAddress,
          registrationId: result.registration.id,
          judgeListEntryId: result.judgeListEntry?.id,
          targetEvmChainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
          okxChainIndex: env.PROOF_OF_VAULT_OKX_CHAIN_INDEX
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    rl.close();
    await persistence.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown bootstrap failure.";
  console.error(message);
  process.exitCode = 1;
});
