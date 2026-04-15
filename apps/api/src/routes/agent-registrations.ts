import type { FastifyInstance } from "fastify";

import {
  agentLoginChallengeRequestSchema,
  agentLoginRequestSchema,
  joinJudgeListRequestSchema,
  preRegistrationChallengeRequestSchema,
  preRegistrationRequestSchema
} from "@proof-of-vault/shared-types";

type AgentRegistrationRouteServices = {
  agentRegistrationService: {
    createPreRegistrationChallenge: typeof import("../services/agent-registration-service.js").AgentRegistrationService.prototype.createPreRegistrationChallenge;
    register: typeof import("../services/agent-registration-service.js").AgentRegistrationService.prototype.register;
    createLoginChallenge: typeof import("../services/agent-registration-service.js").AgentRegistrationService.prototype.createLoginChallenge;
    login: typeof import("../services/agent-registration-service.js").AgentRegistrationService.prototype.login;
    joinJudgeList: typeof import("../services/agent-registration-service.js").AgentRegistrationService.prototype.joinJudgeList;
    getRegistration: typeof import("../services/agent-registration-service.js").AgentRegistrationService.prototype.getRegistration;
    listJudgeList: typeof import("../services/agent-registration-service.js").AgentRegistrationService.prototype.listJudgeList;
  };
};

export async function registerAgentRegistrationRoutes(
  app: FastifyInstance,
  services: AgentRegistrationRouteServices
): Promise<void> {
  app.post("/agent-registrations/challenge", async (request) => {
    const body = preRegistrationChallengeRequestSchema.parse(request.body);
    return services.agentRegistrationService.createPreRegistrationChallenge(body);
  });

  app.post("/agent-registrations", async (request) => {
    const body = preRegistrationRequestSchema.parse(request.body);
    return services.agentRegistrationService.register(body);
  });

  app.post("/agent-registrations/login-challenge", async (request) => {
    const body = agentLoginChallengeRequestSchema.parse(request.body);
    return services.agentRegistrationService.createLoginChallenge(body);
  });

  app.post("/agent-registrations/login", async (request) => {
    const body = agentLoginRequestSchema.parse(request.body);
    return services.agentRegistrationService.login(body);
  });

  app.get("/agent-registrations/:id", async (request) => {
    const params = request.params as { id: string };
    return services.agentRegistrationService.getRegistration(params.id);
  });

  app.post("/judge-list", async (request) => {
    const body = joinJudgeListRequestSchema.parse(request.body);
    return services.agentRegistrationService.joinJudgeList(body);
  });

  app.get("/judge-list", async () => services.agentRegistrationService.listJudgeList());
}
