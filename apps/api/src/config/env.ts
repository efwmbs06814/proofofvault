import { z } from "zod";
import { DEFAULT_OKX_CHAIN_INDEX, DEFAULT_TARGET_EVM_CHAIN_ID } from "@proof-of-vault/shared-types";

const privateKeySchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const MAX_UINT256 = (1n << 256n) - 1n;
const optionalPrivateKeySchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  privateKeySchema.optional()
);
const envBooleanSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());
const uint256StringSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine((value) => BigInt(value) <= MAX_UINT256, "Value must fit in uint256.");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isZeroAddress(value?: string): boolean {
  return value?.toLowerCase() === ZERO_ADDRESS;
}

function isConfiguredAddress(value?: string): value is string {
  return Boolean(value) && !isZeroAddress(value);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  PROOF_OF_VAULT_STORAGE: z.enum(["memory", "postgres"]).default("postgres"),
  PROOF_OF_VAULT_DEMO_MODE: envBooleanSchema.default(false),
  PROOF_OF_VAULT_DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  PROOF_OF_VAULT_RECONCILIATION_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60_000),
  DATABASE_URL: z.string().url().optional(),
  PROOF_OF_VAULT_ONCHAIN_GATEWAY: z.enum(["mock", "viem"]).default("viem"),
  PROOF_OF_VAULT_WALLET_PROVIDER: z.enum(["mock", "okx"]).default("okx"),
  PROOF_OF_VAULT_MARKET_PROVIDER: z.enum(["mock", "okx"]).default("okx"),
  PROOF_OF_VAULT_PAYLOAD_PROVIDER: z.enum(["local", "ipfs"]).default("local"),
  PROOF_OF_VAULT_ENFORCE_REAL_OKX_DEMO: envBooleanSchema.default(true),
  PROOF_OF_VAULT_AUTH_SECRET: z.string().min(32).optional(),
  PROOF_OF_VAULT_OPERATOR_API_TOKEN: z.string().min(32).optional(),
  PROOF_OF_VAULT_USING_LEGACY_CHAIN_ALIAS: envBooleanSchema.default(false),
  PROOF_OF_VAULT_OKX_ACCESS_KEY: z.string().optional(),
  PROOF_OF_VAULT_OKX_SECRET_KEY: z.string().optional(),
  PROOF_OF_VAULT_OKX_PASSPHRASE: z.string().optional(),
  PROOF_OF_VAULT_OKX_MCP_URL: z.string().default("https://web3.okx.com/api/v1/onchainos-mcp"),
  PROOF_OF_VAULT_PUBLIC_API_BASE_URL: z.string().url().optional(),
  PROOF_OF_VAULT_WEB_BASE_URL: z.string().url().optional(),
  PROOF_OF_VAULT_CHAIN_ID: z.coerce.number().int().positive().optional(),
  PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID: z.coerce.number().int().positive().default(DEFAULT_TARGET_EVM_CHAIN_ID),
  PROOF_OF_VAULT_OKX_CHAIN_INDEX: z.coerce.number().int().positive().default(DEFAULT_OKX_CHAIN_INDEX),
  PROOF_OF_VAULT_RPC_URL: z.string().url().optional(),
  PROOF_OF_VAULT_EXPLORER_URL: z.string().url().default("https://www.oklink.com/xlayer"),
  PROOF_OF_VAULT_IPFS_PINNING_URL: z.string().url().optional(),
  PROOF_OF_VAULT_IPFS_PINNING_JWT: z.string().optional(),
  PROOF_OF_VAULT_IPFS_GATEWAY_URL: z.string().url().default("https://ipfs.io/ipfs"),
  PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY: optionalPrivateKeySchema,
  PROOF_OF_VAULT_FINALIZER_PRIVATE_KEY: optionalPrivateKeySchema,
  PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY: optionalPrivateKeySchema,
  PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_FUNDER_PRIVATE_KEY: optionalPrivateKeySchema,
  PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS: addressSchema.optional(),
  PROOF_OF_VAULT_AGENT_STAKING_ADDRESS: addressSchema.optional(),
  PROOF_OF_VAULT_POV_TOKEN_ADDRESS: addressSchema.optional(),
  PROOF_OF_VAULT_REWARD_POOL_ADDRESS: addressSchema.optional(),
  PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT: uint256StringSchema.default("0"),
  PROOF_OF_VAULT_WOKB_ADDRESS: addressSchema.optional(),
  PROOF_OF_VAULT_WOKB_CAP: uint256StringSchema.default("10000000000000000000"),
  PROOF_OF_VAULT_WOKB_DECIMALS: z.coerce.number().int().min(0).max(255).default(18),
  PROOF_OF_VAULT_USDCE_ADDRESS: addressSchema.optional(),
  PROOF_OF_VAULT_USDCE_CAP: uint256StringSchema.default("1000000000"),
  PROOF_OF_VAULT_USDCE_DECIMALS: z.coerce.number().int().min(0).max(255).default(6)
}).superRefine((env, ctx) => {
  const production = env.NODE_ENV === "production";

  if (env.PROOF_OF_VAULT_STORAGE === "postgres" && !env.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL is required when PROOF_OF_VAULT_STORAGE=postgres."
    });
  }

  if (env.PROOF_OF_VAULT_ONCHAIN_GATEWAY === "viem") {
    if (!env.PROOF_OF_VAULT_RPC_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_RPC_URL"],
        message: "PROOF_OF_VAULT_RPC_URL is required when PROOF_OF_VAULT_ONCHAIN_GATEWAY=viem."
      });
    }

    if (!env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS"],
        message: "PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS is required when PROOF_OF_VAULT_ONCHAIN_GATEWAY=viem."
      });
    }

    if (!env.PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY"],
        message: "PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY is required when PROOF_OF_VAULT_ONCHAIN_GATEWAY=viem."
      });
    }
  }

  if (
    (env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx" || env.PROOF_OF_VAULT_MARKET_PROVIDER === "okx") &&
    !env.PROOF_OF_VAULT_OKX_ACCESS_KEY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PROOF_OF_VAULT_OKX_ACCESS_KEY"],
      message: "PROOF_OF_VAULT_OKX_ACCESS_KEY is required when an OKX provider is enabled."
    });
  }

  if (
    (env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx" || env.PROOF_OF_VAULT_MARKET_PROVIDER === "okx") &&
    !env.PROOF_OF_VAULT_OKX_SECRET_KEY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PROOF_OF_VAULT_OKX_SECRET_KEY"],
      message: "PROOF_OF_VAULT_OKX_SECRET_KEY is required when an OKX provider is enabled."
    });
  }

  if (
    (env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx" || env.PROOF_OF_VAULT_MARKET_PROVIDER === "okx") &&
    !env.PROOF_OF_VAULT_OKX_PASSPHRASE
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PROOF_OF_VAULT_OKX_PASSPHRASE"],
      message: "PROOF_OF_VAULT_OKX_PASSPHRASE is required when an OKX provider is enabled."
    });
  }

  if (env.PROOF_OF_VAULT_WALLET_PROVIDER === "okx") {
    if (!env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS"],
        message: "PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS is required when PROOF_OF_VAULT_WALLET_PROVIDER=okx."
      });
    }

    if (!env.PROOF_OF_VAULT_AGENT_STAKING_ADDRESS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_AGENT_STAKING_ADDRESS"],
        message: "PROOF_OF_VAULT_AGENT_STAKING_ADDRESS is required when PROOF_OF_VAULT_WALLET_PROVIDER=okx."
      });
    }
  }

  if (env.PROOF_OF_VAULT_PAYLOAD_PROVIDER === "ipfs") {
    if (!env.PROOF_OF_VAULT_IPFS_PINNING_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_IPFS_PINNING_URL"],
        message: "PROOF_OF_VAULT_IPFS_PINNING_URL is required when PROOF_OF_VAULT_PAYLOAD_PROVIDER=ipfs."
      });
    }

    if (!env.PROOF_OF_VAULT_IPFS_PINNING_JWT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_IPFS_PINNING_JWT"],
        message: "PROOF_OF_VAULT_IPFS_PINNING_JWT is required when PROOF_OF_VAULT_PAYLOAD_PROVIDER=ipfs."
      });
    }
  }

  if (BigInt(env.PROOF_OF_VAULT_AGENT_REGISTRATION_STAKE_AMOUNT) > 0n) {
    if (!env.PROOF_OF_VAULT_RPC_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_RPC_URL"],
        message: "PROOF_OF_VAULT_RPC_URL is required when automatic agent registration stake seeding is enabled."
      });
    }

    if (!env.PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY && !env.PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY"],
        message:
          "Automatic agent registration stake seeding requires PROOF_OF_VAULT_AGENT_REGISTRATION_SEED_SIGNER_PRIVATE_KEY or PROOF_OF_VAULT_ORCHESTRATOR_PRIVATE_KEY."
      });
    }

    if (!env.PROOF_OF_VAULT_AGENT_STAKING_ADDRESS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_AGENT_STAKING_ADDRESS"],
        message:
          "PROOF_OF_VAULT_AGENT_STAKING_ADDRESS is required when automatic agent registration stake seeding is enabled."
      });
    }

    if (!env.PROOF_OF_VAULT_POV_TOKEN_ADDRESS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROOF_OF_VAULT_POV_TOKEN_ADDRESS"],
        message: "PROOF_OF_VAULT_POV_TOKEN_ADDRESS is required when automatic agent registration stake seeding is enabled."
      });
    }
  }

  if (isConfiguredAddress(env.PROOF_OF_VAULT_WOKB_ADDRESS) && BigInt(env.PROOF_OF_VAULT_WOKB_CAP) === 0n) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PROOF_OF_VAULT_WOKB_CAP"],
      message: "WOKB cap must be greater than zero when WOKB is configured."
    });
  }

  if (isConfiguredAddress(env.PROOF_OF_VAULT_USDCE_ADDRESS) && BigInt(env.PROOF_OF_VAULT_USDCE_CAP) === 0n) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PROOF_OF_VAULT_USDCE_CAP"],
      message: "USDC.e cap must be greater than zero when USDC.e is configured."
    });
  }

  if (production) {
    const productionIssues = [
      env.PROOF_OF_VAULT_STORAGE !== "postgres"
        ? ["PROOF_OF_VAULT_STORAGE", "production requires PROOF_OF_VAULT_STORAGE=postgres."]
        : undefined,
      env.PROOF_OF_VAULT_DEMO_MODE
        ? ["PROOF_OF_VAULT_DEMO_MODE", "production must not enable demo mode."]
        : undefined,
      env.PROOF_OF_VAULT_ONCHAIN_GATEWAY === "mock"
        ? ["PROOF_OF_VAULT_ONCHAIN_GATEWAY", "production must not use the mock on-chain gateway."]
        : undefined,
      env.PROOF_OF_VAULT_WALLET_PROVIDER === "mock"
        ? ["PROOF_OF_VAULT_WALLET_PROVIDER", "production must not use the mock wallet provider."]
        : undefined,
      env.PROOF_OF_VAULT_MARKET_PROVIDER === "mock"
        ? ["PROOF_OF_VAULT_MARKET_PROVIDER", "production must not use the mock market provider."]
        : undefined,
      env.PROOF_OF_VAULT_PAYLOAD_PROVIDER === "local"
        ? ["PROOF_OF_VAULT_PAYLOAD_PROVIDER", "production must not use local payload storage."]
        : undefined,
      env.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID !== DEFAULT_TARGET_EVM_CHAIN_ID
        ? [
            "PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID",
            `production must use X Layer mainnet chainId ${DEFAULT_TARGET_EVM_CHAIN_ID}.`
          ]
        : undefined,
      env.PROOF_OF_VAULT_OKX_CHAIN_INDEX !== DEFAULT_OKX_CHAIN_INDEX
        ? [
            "PROOF_OF_VAULT_OKX_CHAIN_INDEX",
            `production must use X Layer mainnet chainIndex ${DEFAULT_OKX_CHAIN_INDEX}.`
          ]
        : undefined,
      env.PROOF_OF_VAULT_USING_LEGACY_CHAIN_ALIAS
        ? [
            "PROOF_OF_VAULT_CHAIN_ID",
            "production must not rely on PROOF_OF_VAULT_CHAIN_ID; use PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID explicitly."
          ]
        : undefined,
      !env.PROOF_OF_VAULT_AUTH_SECRET
        ? ["PROOF_OF_VAULT_AUTH_SECRET", "production requires PROOF_OF_VAULT_AUTH_SECRET."]
        : undefined,
      !env.PROOF_OF_VAULT_OPERATOR_API_TOKEN
        ? ["PROOF_OF_VAULT_OPERATOR_API_TOKEN", "production requires PROOF_OF_VAULT_OPERATOR_API_TOKEN."]
        : undefined,
      !env.PROOF_OF_VAULT_PUBLIC_API_BASE_URL
        ? ["PROOF_OF_VAULT_PUBLIC_API_BASE_URL", "production requires PROOF_OF_VAULT_PUBLIC_API_BASE_URL."]
        : undefined,
      !env.PROOF_OF_VAULT_WEB_BASE_URL
        ? ["PROOF_OF_VAULT_WEB_BASE_URL", "production requires PROOF_OF_VAULT_WEB_BASE_URL."]
        : undefined,
      !env.PROOF_OF_VAULT_POV_TOKEN_ADDRESS
        ? ["PROOF_OF_VAULT_POV_TOKEN_ADDRESS", "production requires PROOF_OF_VAULT_POV_TOKEN_ADDRESS."]
        : undefined,
      !env.PROOF_OF_VAULT_OKX_SECRET_KEY
        ? ["PROOF_OF_VAULT_OKX_SECRET_KEY", "production requires PROOF_OF_VAULT_OKX_SECRET_KEY."]
        : undefined,
      !env.PROOF_OF_VAULT_OKX_PASSPHRASE
        ? ["PROOF_OF_VAULT_OKX_PASSPHRASE", "production requires PROOF_OF_VAULT_OKX_PASSPHRASE."]
        : undefined,
      isZeroAddress(env.PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS)
        ? ["PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS", "production VaultFactory address cannot be zero."]
        : undefined,
      isZeroAddress(env.PROOF_OF_VAULT_AGENT_STAKING_ADDRESS)
        ? ["PROOF_OF_VAULT_AGENT_STAKING_ADDRESS", "production AgentStaking address cannot be zero."]
        : undefined,
      isZeroAddress(env.PROOF_OF_VAULT_POV_TOKEN_ADDRESS)
        ? ["PROOF_OF_VAULT_POV_TOKEN_ADDRESS", "production POV token address cannot be zero."]
        : undefined,
      (!env.PROOF_OF_VAULT_WOKB_ADDRESS || isZeroAddress(env.PROOF_OF_VAULT_WOKB_ADDRESS)) &&
      (!env.PROOF_OF_VAULT_USDCE_ADDRESS || isZeroAddress(env.PROOF_OF_VAULT_USDCE_ADDRESS))
        ? ["PROOF_OF_VAULT_WOKB_ADDRESS", "production requires at least one allowed collateral token address."]
        : undefined
    ].filter((issue): issue is [string, string] => Boolean(issue));

    for (const [path, message] of productionIssues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message
      });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(overrides: Record<string, unknown> = {}): AppEnv {
  const raw = {
    ...process.env,
    ...overrides
  };
  const usedLegacyChainAlias =
    raw.PROOF_OF_VAULT_CHAIN_ID !== undefined && raw.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID === undefined;

  if (usedLegacyChainAlias) {
    raw.PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID = raw.PROOF_OF_VAULT_CHAIN_ID;
  }
  raw.PROOF_OF_VAULT_USING_LEGACY_CHAIN_ALIAS = usedLegacyChainAlias;

  return envSchema.parse(raw);
}
