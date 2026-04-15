import cors from "@fastify/cors";
import { type AgenticWalletProvider, type MarketDataProvider, type OnchainGateway } from "@proof-of-vault/agent-runtime";
import Fastify, { type FastifyInstance } from "fastify";

import { loadEnv } from "./config/env.js";
import { evaluateRuntimeReadiness } from "./config/runtime-readiness.js";
import { createPersistence, type AppPersistence } from "./db/factory.js";
import { AppError } from "./lib/errors.js";
import { requireAgentSession } from "./lib/agent-auth.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerAgentRegistrationRoutes } from "./routes/agent-registrations.js";
import { registerAgentSubmissionRoutes } from "./routes/agent-submissions.js";
import { registerMockRoutes } from "./routes/mock.js";
import { registerPayloadRoutes } from "./routes/payloads.js";
import { registerRuntimeRoutes } from "./routes/runtime.js";
import { registerVaultRoutes } from "./routes/vaults.js";
import { createRuntimeAdapters } from "./runtime.js";
import { AgentWalletService } from "./services/agent-wallet-service.js";
import { AgentRegistrationService } from "./services/agent-registration-service.js";
import { AgentSessionService } from "./services/agent-session-service.js";
import { AgentStakeSeedService } from "./services/agent-stake-seed-service.js";
import { ChainReconciliationService } from "./services/chain-reconciliation-service.js";
import { MockDataService } from "./services/mock-data-service.js";
import { PayloadStorageService } from "./services/payload-storage-service.js";
import { normalizePayloadUploadInput } from "./services/agent-workflow-normalizer.js";
import { SubmissionService } from "./services/submission-service.js";
import { VaultService } from "./services/vault-service.js";
import { WorkflowService } from "./services/workflow-service.js";

type BuildAppOptions = {
  envOverrides?: Record<string, unknown>;
  persistence?: AppPersistence;
  runtimeOverrides?: {
    onchainGateway?: OnchainGateway;
    walletProvider?: AgenticWalletProvider;
    marketDataProvider?: MarketDataProvider;
  };
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = loadEnv(options.envOverrides);
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  const persistence = options.persistence ?? createPersistence(env);
  const agentSessionService = new AgentSessionService(env.PROOF_OF_VAULT_AUTH_SECRET);
  const runtimeAdapters = createRuntimeAdapters(env);
  const onchainGateway = options.runtimeOverrides?.onchainGateway ?? runtimeAdapters.onchainGateway;
  const walletProvider = options.runtimeOverrides?.walletProvider ?? runtimeAdapters.walletProvider;
  const marketDataProvider = options.runtimeOverrides?.marketDataProvider ?? runtimeAdapters.marketDataProvider;

  const agentStakeSeedService = new AgentStakeSeedService(persistence.workflowStore, env);
  const vaultService = new VaultService(persistence.workflowStore, onchainGateway, env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID);
  const agentRegistrationService = new AgentRegistrationService(
    persistence.workflowStore,
    walletProvider,
    env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
    agentSessionService,
    agentStakeSeedService.isEnabled() ? agentStakeSeedService : undefined
  );
  const agentWalletService = new AgentWalletService(persistence.workflowStore, walletProvider);
  const submissionService = new SubmissionService(
    persistence,
    walletProvider,
    marketDataProvider,
    vaultService.bootstrapCommittee.bind(vaultService),
    {
      enforceRealDemo: env.PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO,
      targetEvmChainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: env.PROOF_OF_VAULT_OKX_CHAIN_INDEX,
      productionMode: env.NODE_ENV === "production"
    }
  );
  const workflowService = new WorkflowService(persistence.workflowStore, persistence.proofStore, onchainGateway);
  const payloadStorageService = new PayloadStorageService(env, persistence.proofStore);
  const mockDataService = new MockDataService(
    persistence.workflowStore,
    workflowService,
    env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID
  );
  const reconciliationService = new ChainReconciliationService(
    workflowService,
    vaultService,
    env.PROOF_OF_VAULT_RECONCILIATION_INTERVAL_MS
  );
  const requireLiveAgentSession =
    env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx"
      ? (request: import("fastify").FastifyRequest, address: string) =>
          requireAgentSession(request, agentSessionService, address)
      : () => undefined;

  if (env.PROOF_OF_VAULT_DEMO_MODE) {
    await mockDataService.ensureBaseAgents();
  }
  if (env.PROOF_OF_VAULT_ONCHAIN_GATEWAY === "viem") {
    reconciliationService.start();
  }
  if (env.NODE_ENV === "production" && agentStakeSeedService.isEnabled()) {
    const seedingIssues = await agentStakeSeedService.getRuntimeIssues();
    if (seedingIssues.length > 0) {
      throw new Error(`Automatic agent registration stake seeding is misconfigured: ${seedingIssues.join("; ")}`);
    }
  }

  app.get("/health", async () => {
    const database = await persistence.checkHealth();
    const readiness = evaluateRuntimeReadiness(env, database);
    const seedingIssues = agentStakeSeedService.isEnabled() ? await agentStakeSeedService.getRuntimeIssues() : [];
    const blockingReasons = [...readiness.blockingReasons, ...seedingIssues];

    return {
      ok: env.PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO
        ? database.ok && readiness.realDemoReady && seedingIssues.length === 0
        : database.ok && seedingIssues.length === 0,
      storageMode: env.PROOF_OF_VAULT_STORAGE,
      onchainGatewayMode: env.PROOF_OF_VAULT_ONCHAIN_GATEWAY,
      walletProviderMode: env.PROOF_OF_VAULT_WALLET_PROVIDER,
      marketProviderMode: env.PROOF_OF_VAULT_MARKET_PROVIDER,
      payloadProviderMode: env.PROOF_OF_VAULT_PAYLOAD_PROVIDER,
      chainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
      targetEvmChainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: env.PROOF_OF_VAULT_OKX_CHAIN_INDEX,
      realDemoReady: readiness.realDemoReady && seedingIssues.length === 0,
      requiredModesSatisfied: readiness.requiredModesSatisfied,
      blockingReasons,
      database: {
        ...database,
        driver: persistence.databaseDriver
      },
      realOnchainConfigured:
        env.PROOF_OF_VAULT_ONCHAIN_GATEWAY === "viem" &&
        Boolean(env.PROOF_OF_VAULT_RPC_URL) &&
        Boolean(env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS) &&
        Boolean(env.PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY),
      okxConfigured:
        (env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx" || env.PROOF_OF_VAULT_MARKET_PROVIDER === "okx") &&
        Boolean(env.PROOF_OF_VAULT_OKX_ACCESS_KEY) &&
        Boolean(env.PROOF_OF_VAULT_OKX_SECRET_KEY) &&
        Boolean(env.PROOF_OF_VAULT_OKX_PASSPHRASE),
      viemSignerModel:
        env.PROOF_OF_VAULT_ONCHAIN_GATEWAY === "viem" ? "server-configured-local-account" : "not-used",
      vaultFactoryAddress: env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS
    };
  });

  await registerRuntimeRoutes(app, env);
  await registerPayloadRoutes(app, {
    payloadStorageService,
    agentSessionService,
    normalizePayloadUploadInput: (input) =>
      normalizePayloadUploadInput(persistence.workflowStore, input, vaultService.bootstrapCommittee.bind(vaultService)),
    operatorApiToken: env.PROOF_OF_VAULT_OPERATOR_API_TOKEN,
    productionMode: env.NODE_ENV === "production"
  });
  await registerVaultRoutes(app, {
    vaultService,
    workflowService,
    operatorApiToken: env.PROOF_OF_VAULT_OPERATOR_API_TOKEN,
    productionMode: env.NODE_ENV === "production"
  });
  await registerAgentRegistrationRoutes(app, { agentRegistrationService });
  await registerAgentRoutes(app, {
    agentWalletService,
    workflowService,
    vaultService,
    requireAgentSession: requireLiveAgentSession
  });
  await registerAgentSubmissionRoutes(app, { submissionService, requireAgentSession: requireLiveAgentSession });
  if (env.PROOF_OF_VAULT_DEMO_MODE) {
    await registerMockRoutes(app, { mockDataService });
  }

  app.addHook("onClose", async () => {
    reconciliationService.stop();
    await persistence.close();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message
      });
    }

    const unknownError = error as { issues?: unknown; message?: string };

    if ("issues" in unknownError) {
      return reply.status(400).send({
        error: "SchemaValidationError",
        message: "Request validation failed.",
        details: unknownError.issues
      });
    }

    const databaseError = error as {
      code?: string;
      cause?: {
        code?: string;
        data?: {
          code?: string;
        };
      };
    };
    const databaseErrorCode = databaseError.code ?? databaseError.cause?.code ?? databaseError.cause?.data?.code;
    if (databaseErrorCode === "23505") {
      return reply.status(409).send({
        error: "UniqueConstraintViolation",
        message: unknownError.message ?? "Unique database constraint was violated."
      });
    }

    return reply.status(500).send({
      error: "InternalServerError",
      message: unknownError.message ?? "Unknown server error."
    });
  });

  return app;
}
