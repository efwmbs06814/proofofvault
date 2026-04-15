import type { FastifyInstance } from "fastify";
import { hashPayload, verifyWalletSignature } from "@proof-of-vault/agent-runtime";
import { buildPayloadUploadMessage } from "@proof-of-vault/shared-types";
import { z } from "zod";

import { requireAgentSession } from "../lib/agent-auth.js";
import { ValidationError } from "../lib/errors.js";
import { requireOperatorToken } from "../lib/operator-auth.js";

const payloadStoreRequestSchema = z.object({
  vaultId: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  payload: z.any(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/).optional(),
  message: z.string().min(1).optional()
});

type PayloadRouteServices = {
  payloadStorageService: {
    storePayload: typeof import("../services/payload-storage-service.js").PayloadStorageService.prototype.storePayload;
  };
  agentSessionService: import("../services/agent-session-service.js").AgentSessionService;
  normalizePayloadUploadInput: (input: {
    vaultId?: string;
    kind?: string;
    payload: unknown;
    walletAddress?: string;
  }) => Promise<{
    vaultId?: string;
    kind?: string;
    payload: unknown;
    walletAddress?: string;
  }>;
  operatorApiToken?: string;
  productionMode: boolean;
};

export async function registerPayloadRoutes(app: FastifyInstance, services: PayloadRouteServices): Promise<void> {
  app.post("/payloads", async (request) => {
    const body = payloadStoreRequestSchema.parse(request.body) as {
      vaultId?: string;
      kind?: string;
      payload: unknown;
      walletAddress?: `0x${string}`;
      signature?: `0x${string}`;
      message?: string;
    };

    let authorized = false;
    let agentSessionAuthorized = false;

    if (body.walletAddress) {
      try {
        requireAgentSession(request, services.agentSessionService, body.walletAddress);
        authorized = true;
        agentSessionAuthorized = true;
      } catch {
        authorized = false;
      }
    }

    if (services.productionMode) {
      const initialPayloadHash = hashPayload(body.payload);
      const initialExpectedMessage =
        body.walletAddress !== undefined
          ? buildPayloadUploadMessage({
              walletAddress: body.walletAddress,
              payloadHash: initialPayloadHash,
              vaultId: body.vaultId,
              kind: body.kind
            })
          : undefined;

      if (!authorized) {
        try {
          requireOperatorToken(request, services.operatorApiToken);
          authorized = true;
        } catch {
          authorized = false;
        }
      }

      if (!authorized && body.walletAddress && body.signature && body.message) {
        if (body.message !== initialExpectedMessage) {
          throw new ValidationError("Payload upload signature message did not match the canonical payload hash.");
        }

        authorized = await verifyWalletSignature({
          walletAddress: body.walletAddress,
          message: body.message,
          signature: body.signature
        });
      }

      if (!authorized) {
        throw new ValidationError(
          "Production payload uploads require agent bearer auth, operator bearer auth, or a wallet signature."
        );
      }
    }

    const normalizedBody =
      agentSessionAuthorized && body.walletAddress
        ? await services.normalizePayloadUploadInput({
            vaultId: body.vaultId,
            kind: body.kind,
            payload: body.payload,
            walletAddress: body.walletAddress
          })
        : body;

    return services.payloadStorageService.storePayload(normalizedBody);
  });
}
