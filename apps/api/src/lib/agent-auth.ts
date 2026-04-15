import type { FastifyRequest } from "fastify";

import type { AgentSessionService } from "../services/agent-session-service.js";

import { ValidationError } from "./errors.js";

function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization) {
    throw new ValidationError("Authorization bearer token is required for agent actions.");
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ValidationError("Authorization header must use Bearer <token>.");
  }

  return token;
}

export function requireAgentSession(
  request: FastifyRequest,
  sessions: AgentSessionService,
  expectedWalletAddress: string
): void {
  sessions.verify(readBearerToken(request), expectedWalletAddress);
}
