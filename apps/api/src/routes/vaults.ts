import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  createVaultRequestSchema,
  finalizeResolutionRequestSchema,
  finalizeRuleSetRequestSchema,
  registerResolutionCommitteeRequestSchema,
  registerRuleCommitteeRequestSchema,
  ruleSetDecisionRequestSchema
} from "@proof-of-vault/shared-types";
import { requireOperatorToken } from "../lib/operator-auth.js";
import { ValidationError } from "../lib/errors.js";

type VaultRouteServices = {
  vaultService: {
    createVault: typeof import("../services/vault-service.js").VaultService.prototype.createVault;
    registerRuleCommittee: typeof import("../services/vault-service.js").VaultService.prototype.registerRuleCommittee;
    registerResolutionCommittee: typeof import("../services/vault-service.js").VaultService.prototype.registerResolutionCommittee;
    registerTx: typeof import("../services/vault-service.js").VaultService.prototype.registerTx;
    syncOnchainSnapshot: typeof import("../services/vault-service.js").VaultService.prototype.syncOnchainSnapshot;
  };
  workflowService: {
    listVaultSummaries: typeof import("../services/workflow-service.js").WorkflowService.prototype.listVaultSummaries;
    getVaultDetail: typeof import("../services/workflow-service.js").WorkflowService.prototype.getVaultDetail;
    finalizeRuleSet: typeof import("../services/workflow-service.js").WorkflowService.prototype.finalizeRuleSet;
    decideRuleSet: typeof import("../services/workflow-service.js").WorkflowService.prototype.decideRuleSet;
    finalizeResolution: typeof import("../services/workflow-service.js").WorkflowService.prototype.finalizeResolution;
  };
  operatorApiToken?: string;
  productionMode: boolean;
};

const registerTxRequestSchema = z.object({
  action: z.enum(["acceptRuleSetAndFund", "rejectRuleSet", "finalizeV2Vault"]),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/)
});

function requireOperatorForProtectedRoute(
  request: Parameters<typeof requireOperatorToken>[0],
  services: Pick<VaultRouteServices, "operatorApiToken" | "productionMode">
) {
  if (!services.productionMode && !services.operatorApiToken) {
    return;
  }

  requireOperatorToken(request, services.operatorApiToken);
}

export async function registerVaultRoutes(app: FastifyInstance, services: VaultRouteServices): Promise<void> {
  app.get("/vaults", async (request) => {
    const query = (request.query ?? {}) as {
      status?: string;
      setter?: string;
      page?: string | number;
      pageSize?: string | number;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20)));
    const allVaults = await services.workflowService.listVaultSummaries();
    const filteredVaults = allVaults.filter((vault) => {
      if (query.status && vault.status !== query.status) {
        return false;
      }

      if (query.setter && vault.setterAddress?.toLowerCase() !== query.setter.toLowerCase()) {
        return false;
      }

      return true;
    });
    const start = (page - 1) * pageSize;
    const items = filteredVaults.slice(start, start + pageSize);

    return {
      items,
      total: filteredVaults.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filteredVaults.length / pageSize)),
      hasMore: start + pageSize < filteredVaults.length
    };
  });

  app.post("/vaults", async (request) => {
    const body = createVaultRequestSchema.parse(request.body);
    if (services.productionMode && body.mode === "register_onchain" && body.externalVaultId === undefined) {
      throw new ValidationError(
        "Production vault creation must be sent by browser wallet, then registered through verified on-chain sync."
      );
    }
    const vault = await services.vaultService.createVault(body);
    return services.workflowService.getVaultDetail(vault.id);
  });

  app.get("/vaults/:id", async (request) => {
    const params = request.params as { id: string };
    return services.workflowService.getVaultDetail(params.id);
  });

  app.post("/vaults/:id/rule-committee", async (request) => {
    requireOperatorForProtectedRoute(request, services);
    const params = request.params as { id: string };
    const body = registerRuleCommitteeRequestSchema.parse(request.body);
    await services.vaultService.registerRuleCommittee(params.id, body);
    return services.workflowService.getVaultDetail(params.id);
  });

  app.post("/vaults/:id/rule-set/finalize", async (request) => {
    requireOperatorForProtectedRoute(request, services);
    const params = request.params as { id: string };
    const body = finalizeRuleSetRequestSchema.parse(request.body);
    return services.workflowService.finalizeRuleSet(params.id, body);
  });

  app.post("/vaults/:id/rule-set/decision", async (request) => {
    const params = request.params as { id: string };
    const body = ruleSetDecisionRequestSchema.parse(request.body);
    if (services.productionMode) {
      throw new ValidationError("Production setter decisions must be sent by browser wallet, then registered via POST /vaults/:id/register-tx.");
    }
    return services.workflowService.decideRuleSet(params.id, body);
  });

  app.post("/vaults/:id/resolution-committee", async (request) => {
    requireOperatorForProtectedRoute(request, services);
    const params = request.params as { id: string };
    const body = registerResolutionCommitteeRequestSchema.parse(request.body);
    await services.vaultService.registerResolutionCommittee(params.id, body);
    return services.workflowService.getVaultDetail(params.id);
  });

  app.post("/vaults/:id/sync-onchain", async (request) => {
    requireOperatorForProtectedRoute(request, services);
    const params = request.params as { id: string };
    await services.vaultService.syncOnchainSnapshot(params.id);
    return services.workflowService.getVaultDetail(params.id);
  });

  app.post("/vaults/:id/finality", async (request) => {
    requireOperatorForProtectedRoute(request, services);
    const params = request.params as { id: string };
    const body = finalizeResolutionRequestSchema.parse(request.body);
    return services.workflowService.finalizeResolution(params.id, body);
  });

  app.post("/vaults/:id/register-tx", async (request) => {
    const params = request.params as { id: string };
    const body = registerTxRequestSchema.parse(request.body);
    await services.vaultService.registerTx(params.id, { ...body, txHash: body.txHash as `0x${string}` });
    return services.workflowService.getVaultDetail(params.id);
  });
}
