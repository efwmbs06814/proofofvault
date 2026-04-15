import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { agentStakeRequestSchema, claimRewardsRequestSchema } from "@proof-of-vault/shared-types";

const committeeRegistrationRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  vaultId: z.union([z.string().min(1), z.number().int().nonnegative()]).transform((value) => value.toString()),
  phase: z.enum(["rule", "resolution"]).optional()
});

type AgentRouteServices = {
  agentWalletService: {
    prepareStakeForAgent: typeof import("../services/agent-wallet-service.js").AgentWalletService.prototype.prepareStakeForAgent;
    stakeForAgent: typeof import("../services/agent-wallet-service.js").AgentWalletService.prototype.stakeForAgent;
    prepareClaimRewards: typeof import("../services/agent-wallet-service.js").AgentWalletService.prototype.prepareClaimRewards;
    claimRewards: typeof import("../services/agent-wallet-service.js").AgentWalletService.prototype.claimRewards;
  };
  workflowService: {
    listVaultSummaries: typeof import("../services/workflow-service.js").WorkflowService.prototype.listVaultSummaries;
    getVaultDetail: typeof import("../services/workflow-service.js").WorkflowService.prototype.getVaultDetail;
  };
  vaultService: {
    bootstrapCommittee: typeof import("../services/vault-service.js").VaultService.prototype.bootstrapCommittee;
  };
  requireAgentSession: (request: import("fastify").FastifyRequest, address: string) => void;
};

export async function registerAgentRoutes(app: FastifyInstance, services: AgentRouteServices): Promise<void> {
  app.get("/agents/:address/tasks", async (request) => {
    const params = request.params as { address: string };
    const agentAddress = params.address.toLowerCase();
    services.requireAgentSession(request, agentAddress);

    const vaults = await services.workflowService.listVaultSummaries();
    const details = await Promise.all(vaults.map((vault) => services.workflowService.getVaultDetail(vault.id)));
    const allTasks = details.flatMap((detail) =>
      detail.tasks.map((task) => ({
        ...task,
        vault: {
          id: detail.id,
          externalVaultId: detail.externalVaultId,
          status: detail.status,
          statement: detail.statement,
          metadataURI: detail.metadataURI,
          ruleRound: detail.ruleRound,
          resolutionRound: detail.resolutionRound
        }
      }))
    );
    const assignedTasks = allTasks.filter((task) => {
      if (task.assigneeAddress?.toLowerCase() === agentAddress) {
        return true;
      }

      return task.assigneeType === "challenger" && task.status === "pending";
    });

    return {
      agentAddress,
      tasks: assignedTasks,
      byRole: {
        committee_bootstrap: assignedTasks.filter(
          (task) =>
            task.stage === "rule_committee_registration" || task.stage === "resolution_committee_registration"
        ),
        rule_maker: assignedTasks.filter((task) => task.metadata.role === "RuleMaker"),
        rule_verifier: assignedTasks.filter((task) => task.metadata.role === "RuleVerifier"),
        resolution_validator: assignedTasks.filter((task) => task.metadata.role === "ResolutionValidator"),
        resolution_auditor: assignedTasks.filter((task) => task.metadata.role === "ResolutionAuditor"),
        challenger: assignedTasks.filter((task) => task.assigneeType === "challenger"),
        claimable: assignedTasks.filter((task) => task.stage === "reward_claim")
      }
    };
  });

  app.post("/agents/committee-registration", async (request) => {
    const body = committeeRegistrationRequestSchema.parse(request.body);
    services.requireAgentSession(request, body.agentAddress);
    await services.vaultService.bootstrapCommittee(body.vaultId, body.agentAddress, body.phase);
    return services.workflowService.getVaultDetail(body.vaultId);
  });

  app.post("/agents/stake", async (request) => {
    const body = agentStakeRequestSchema.parse(request.body);
    services.requireAgentSession(request, body.agentAddress);
    return services.agentWalletService.stakeForAgent(body);
  });

  app.post("/agents/stake/prepare", async (request) => {
    const body = agentStakeRequestSchema.parse(request.body);
    services.requireAgentSession(request, body.agentAddress);
    return services.agentWalletService.prepareStakeForAgent(body);
  });

  app.post("/agents/claim-rewards", async (request) => {
    const body = claimRewardsRequestSchema.parse(request.body);
    services.requireAgentSession(request, body.agentAddress);
    return services.agentWalletService.claimRewards(body);
  });

  app.post("/agents/claim-rewards/prepare", async (request) => {
    const body = claimRewardsRequestSchema.parse(request.body);
    services.requireAgentSession(request, body.agentAddress);
    return services.agentWalletService.prepareClaimRewards(body);
  });
}
