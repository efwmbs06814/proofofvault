import type { FastifyInstance } from "fastify";

import { agentSubmissionSchema } from "@proof-of-vault/shared-types";

type AgentSubmissionServices = {
  submissionService: {
    prepare: typeof import("../services/submission-service.js").SubmissionService.prototype.prepare;
    submit: typeof import("../services/submission-service.js").SubmissionService.prototype.submit;
  };
  requireAgentSession: (request: import("fastify").FastifyRequest, address: string) => void;
};

export async function registerAgentSubmissionRoutes(
  app: FastifyInstance,
  services: AgentSubmissionServices
): Promise<void> {
  app.post("/agent-submissions/prepare", async (request) => {
    const body = agentSubmissionSchema.parse(request.body);
    services.requireAgentSession(request, body.agentAddress);
    return services.submissionService.prepare(body);
  });

  app.post("/agent-submissions", async (request) => {
    const body = agentSubmissionSchema.parse(request.body);
    services.requireAgentSession(request, body.agentAddress);
    return services.submissionService.submit(body);
  });
}
