import { z } from "zod";

import { agentProfileSchema } from "./agent.js";
import {
  auditVerdictPayloadSchema,
  resolutionRevealPayloadSchema,
  ruleDraftPayloadSchema,
  ruleIssuePayloadSchema
} from "./submission.js";
import { createVaultRequestSchema, vaultDetailSchema } from "./vault.js";

export const demoMockStateSchema = z.object({
  vaults: z.array(vaultDetailSchema),
  agents: z.array(agentProfileSchema),
  sampleRequests: z.object({
    createVault: createVaultRequestSchema,
    ruleDraft: ruleDraftPayloadSchema,
    ruleIssue: ruleIssuePayloadSchema,
    resolutionReveal: resolutionRevealPayloadSchema,
    auditVerdict: auditVerdictPayloadSchema
  })
});

export type DemoMockState = z.infer<typeof demoMockStateSchema>;
