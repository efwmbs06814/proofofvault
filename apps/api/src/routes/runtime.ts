import type { FastifyInstance } from "fastify";
import { vaultFactoryAbiV2 } from "@proof-of-vault/agent-runtime";

import type { AppEnv } from "../config/env.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isConfiguredAddress(value?: string): value is string {
  return Boolean(value) && value!.toLowerCase() !== ZERO_ADDRESS;
}

function allowedCollateralTokens(env: AppEnv) {
  return [
    isConfiguredAddress(env.PROOF_OF_VAULT_WOKB_ADDRESS)
      ? {
          symbol: "WOKB",
          address: env.PROOF_OF_VAULT_WOKB_ADDRESS,
          decimals: env.PROOF_OF_VAULT_WOKB_DECIMALS,
          cap: env.PROOF_OF_VAULT_WOKB_CAP,
          enabled: true
        }
      : undefined,
    isConfiguredAddress(env.PROOF_OF_VAULT_USDCE_ADDRESS)
      ? {
          symbol: "USDC.e",
          address: env.PROOF_OF_VAULT_USDCE_ADDRESS,
          decimals: env.PROOF_OF_VAULT_USDCE_DECIMALS,
          cap: env.PROOF_OF_VAULT_USDCE_CAP,
          enabled: true
        }
      : undefined
  ].filter((token): token is NonNullable<typeof token> => Boolean(token));
}

function joinUrl(base: string | undefined, path: string): string {
  if (!base) {
    return path;
  }

  return `${base.replace(/\/+$/, "")}${path}`;
}

function runtimeConfig(env: AppEnv) {
  const automaticRegistrationStakeSeed = BigInt(env.PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT) > 0n;

  return {
    environment: env.NODE_ENV,
    publicApiBaseUrl: env.PROOF_OF_VAULT_PUBLIC_API_BASE_URL,
    webBaseUrl: env.PROOF_OF_VAULT_WEB_BASE_URL,
    chain: {
      name: "X Layer",
      chainId: env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID,
      okxChainIndex: env.PROOF_OF_VAULT_OKX_CHAIN_INDEX,
      rpcUrl: env.PROOF_OF_VAULT_RPC_URL,
      explorerUrl: env.PROOF_OF_VAULT_EXPLORER_URL
    },
    contracts: {
      vaultFactory: env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS,
      agentStaking: env.PROOF_OF_VAULT_AGENT_STAKING_ADDRESS,
      povToken: env.PROOF_OF_VAULT_POV_TOKEN_ADDRESS,
      rewardPool: env.PROOF_OF_VAULT_REWARD_POOL_ADDRESS
    },
    collateral: {
      allowedTokens: allowedCollateralTokens(env),
      policy: "capped_beta_allowlist",
      policySource: "api_env",
      chainEnforced: true
    },
    payloadStorage: {
      provider: env.PROOF_OF_VAULT_PAYLOAD_PROVIDER,
      productionRequiresIpfs: true
    },
    features: {
      demoMode: env.PROOF_OF_VAULT_DEMO_MODE,
      skillApiOnly: true,
      browserWalletSetterTxRequired: env.NODE_ENV === "production",
      nativeOkbSetupDeposit: true,
      rewardClaimsRestakePov: true,
      agentUnstakeDefaultDisabled: true,
      automaticRegistrationStakeSeed
    },
    tokenomics: {
      agentRegistrationStakeAmount: env.PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT,
      bootstrapStakeStrategy: automaticRegistrationStakeSeed ? "fixed_registration_bootstrap" : "disabled"
    }
  };
}

export async function registerRuntimeRoutes(app: FastifyInstance, env: AppEnv): Promise<void> {
  app.get("/runtime-config", async () => runtimeConfig(env));

  app.get("/agent-manifest.json", async () => ({
    protocol: "Proof of Vault",
    version: 2,
    ...runtimeConfig(env),
    endpoints: {
      health: joinUrl(env.PROOF_OF_VAULT_PUBLIC_API_BASE_URL, "/health"),
      runtimeConfig: joinUrl(env.PROOF_OF_VAULT_PUBLIC_API_BASE_URL, "/runtime-config"),
      skill: joinUrl(env.PROOF_OF_VAULT_WEB_BASE_URL, "/skill.md"),
      agentManifest: joinUrl(env.PROOF_OF_VAULT_PUBLIC_API_BASE_URL, "/agent-manifest.json"),
      createPayload: "POST /payloads",
      discoverTasks: "GET /agents/:address/tasks",
      bootstrapCommittee: "POST /agents/committee-registration",
      prepareStake: "POST /agents/stake/prepare",
      stake: "POST /agents/stake",
      prepareClaimRewards: "POST /agents/claim-rewards/prepare",
      claimRewards: "POST /agents/claim-rewards",
      prepareSubmission: "POST /agent-submissions/prepare",
      submit: "POST /agent-submissions",
      registerSetterTx: "POST /vaults/:id/register-tx"
    },
    auth: {
      agent: "Authorization: Bearer <sessionToken> from /agent-registrations/login",
      operator: "Authorization: Bearer <operatorToken> for committee/finality routes",
      setterPayloadUpload:
        "POST /payloads accepts either agent bearer auth, operator bearer auth, or a wallet signature over the canonical payload hash."
    },
    payloadRules: {
      canonicalJson: true,
      hash: "keccak256(utf8(canonicalJson(payload)))",
      uri: "Production payloads must be pinned and referenced as ipfs://..."
    },
    tokenomics: {
      setupDeposit:
        "Vault requests pay a user-selected native OKB setup deposit; current beta minimum is configured on-chain as previewSetupDeposit().",
      povSupply:
        "POV uses a 99% locked supply target. The remaining bootstrap allocation is reserved for judge-listed agent staking and rewards.",
      registrationStake:
        BigInt(env.PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT) > 0n
          ? `Judge-listed agents receive a protocol-seeded POV stake allocation of ${env.PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT} into AgentStaking on admission.`
          : "Automatic judge-list stake seeding is disabled in this runtime.",
      rewards:
        "Native OKB setup rewards are claimable, while POV rewards are claimed into the agent staking balance by default.",
      unstake: "Agent withdrawals are disabled by default during beta unless governance explicitly enables them."
    },
    roleToAction: {
      CommitteeBootstrap: [
        "GET /agents/:address/tasks",
        "POST /agents/committee-registration { vaultId, agentAddress, phase }"
      ],
      RuleMaker: ["POST /payloads", "POST /agent-submissions/prepare kind=rule_draft", "POST /agent-submissions kind=rule_draft"],
      RuleVerifier: ["POST /payloads", "POST /agent-submissions/prepare kind=rule_issue", "POST /agent-submissions kind=rule_issue"],
      ResolutionValidator: [
        "POST /payloads for commit payload",
        "POST /agent-submissions/prepare kind=resolution_commit",
        "POST /agent-submissions kind=resolution_commit",
        "POST /payloads for reveal payload",
        "POST /agent-submissions/prepare kind=resolution_reveal",
        "POST /agent-submissions kind=resolution_reveal"
      ],
      ResolutionAuditor: ["POST /payloads", "POST /agent-submissions/prepare kind=audit_verdict", "POST /agent-submissions kind=audit_verdict"],
      Challenger: ["POST /payloads", "POST /agent-submissions/prepare kind=public_challenge", "POST /agent-submissions kind=public_challenge"],
      Claimant: ["POST /agents/claim-rewards/prepare", "POST /agents/claim-rewards"]
    },
    abiFragments: {
      vaultFactory: vaultFactoryAbiV2
    }
  }));
}
