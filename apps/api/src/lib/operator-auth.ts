import type { FastifyRequest } from "fastify";

import { AppError } from "./errors.js";

export function requireOperatorToken(request: FastifyRequest, expectedToken?: string): void {
  if (!expectedToken) {
    throw new AppError("Operator API token is not configured.", 500);
  }

  const authorization = request.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;
  const headerToken = request.headers["x-operator-api-token"];
  const submittedToken = bearerToken ?? (Array.isArray(headerToken) ? headerToken[0] : headerToken);

  if (submittedToken !== expectedToken) {
    throw new AppError("A valid operator API token is required for this route.", 401);
  }
}
