import { randomUUID } from "node:crypto";

import { verifyWalletSignature } from "@proof-of-vault/agent-runtime";
import type { AgenticWalletProvider } from "@proof-of-vault/agent-runtime";
import type {
  AgentProfile,
  AgentLoginChallenge,
  AgentLoginChallengeRequest,
  AgentLoginRequest,
  AgentLoginResponse,
  AgentRegistration,
  JoinJudgeListRequest,
  JudgeListEntry,
  PreRegistrationChallenge,
  PreRegistrationChallengeRequest,
  PreRegistrationRequest,
  PreRegistrationResponse,
  WalletSignatureProof
} from "@proof-of-vault/shared-types";
import { DEFAULT_TARGET_EVM_CHAIN_ID as DEFAULT_CHAIN_ID } from "@proof-of-vault/shared-types";

import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";
import { buildPendingSeedEvidence, type PendingSeedEvidence } from "./agent-stake-seed-evidence.js";
import { AgentSessionService } from "./agent-session-service.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type RegistrationStakeSeeder = {
  seedRegisteredAgent(registration: AgentRegistration): Promise<AgentProfile>;
};

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function assertSameAddress(left: string, right: string, message: string): void {
  if (left.toLowerCase() !== right.toLowerCase()) {
    throw new ValidationError(message);
  }
}

function buildPreRegistrationMessage(input: {
  walletAddress: string;
  agentLabel: string;
  capabilityTags: string[];
  chainId: number;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}): string {
  return [
    "Proof of Vault Agent Pre-Registration",
    "version: 1",
    `chainId: ${input.chainId}`,
    `walletAddress: ${input.walletAddress.toLowerCase()}`,
    `agentLabel: ${input.agentLabel}`,
    `capabilityTags: ${[...input.capabilityTags].sort().join(",")}`,
    `nonce: ${input.nonce}`,
    `issuedAt: ${input.issuedAt}`,
    `expiresAt: ${input.expiresAt}`
  ].join("\n");
}

function buildLoginMessage(input: {
  walletAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}): string {
  return [
    "Proof of Vault Agent Login",
    "version: 1",
    `chainId: ${input.chainId}`,
    `walletAddress: ${input.walletAddress.toLowerCase()}`,
    `nonce: ${input.nonce}`,
    `issuedAt: ${input.issuedAt}`,
    `expiresAt: ${input.expiresAt}`
  ].join("\n");
}

function assertChallengeUsable<T extends { expiresAt: number }>(
  challenge: T | undefined,
  nonce: string
): asserts challenge is T {
  if (!challenge) {
    throw new NotFoundError(`Challenge ${nonce} was not found.`);
  }

  if (challenge.expiresAt < Date.now()) {
    throw new ValidationError("Challenge has expired.");
  }
}

export class AgentRegistrationService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly walletProvider: AgenticWalletProvider,
    private readonly chainId = DEFAULT_CHAIN_ID,
    private readonly sessionService = new AgentSessionService(),
    private readonly registrationStakeSeeder?: RegistrationStakeSeeder
  ) {}

  async createPreRegistrationChallenge(request: PreRegistrationChallengeRequest): Promise<PreRegistrationChallenge> {
    if (request.chainId !== this.chainId) {
      throw new ValidationError(`Agent pre-registration must use X Layer chainId ${this.chainId}.`);
    }

    const walletAddress = normalizeAddress(request.walletAddress);
    if (await this.store.getRegistrationByWallet(walletAddress)) {
      throw new ConflictError("This agent wallet is already registered.");
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + CHALLENGE_TTL_MS;
    const nonce = randomUUID();
    const challenge: PreRegistrationChallenge = {
      nonce,
      walletAddress,
      agentLabel: request.agentLabel,
      capabilityTags: request.capabilityTags,
      chainId: request.chainId,
      message: buildPreRegistrationMessage({
        walletAddress,
        agentLabel: request.agentLabel,
        capabilityTags: request.capabilityTags,
        chainId: request.chainId,
        nonce,
        issuedAt,
        expiresAt
      }),
      issuedAt,
      expiresAt,
      sourceProvider: this.walletProvider.name
    };

    return this.store.savePreRegistrationChallenge(challenge);
  }

  async register(request: PreRegistrationRequest): Promise<PreRegistrationResponse> {
    const result = await this.store.runInTransaction(async (transactionStore) => {
      const challenge = await transactionStore.lockPreRegistrationChallenge(request.nonce);
      assertChallengeUsable(challenge, request.nonce);

      const walletAddress = normalizeAddress(request.walletAddress);
      assertSameAddress(walletAddress, challenge.walletAddress, "Registration wallet does not match the challenge.");

      if (request.chainId !== challenge.chainId) {
        throw new ValidationError("Registration chainId does not match the challenge.");
      }

      if (await transactionStore.getRegistrationByWallet(walletAddress)) {
        throw new ConflictError("This agent wallet is already registered.");
      }

      const signatureValid = await verifyWalletSignature({
        walletAddress,
        message: challenge.message,
        signature: request.signature as `0x${string}`
      });
      if (!signatureValid) {
        throw new ValidationError("Pre-registration signature is invalid.");
      }

      const now = Date.now();
      const existingAgent = await transactionStore.lockAgent(walletAddress);
      const registration: AgentRegistration = {
        id: `agent-reg-${randomUUID()}`,
        walletAddress,
        agentLabel: challenge.agentLabel,
        capabilityTags: challenge.capabilityTags,
        chainId: challenge.chainId,
        registeredAt: now,
        status: "pre_registered",
        sourceProvider: this.walletProvider.name as AgentRegistration["sourceProvider"]
      };
      const proof: WalletSignatureProof = {
        action: "signPreRegistration",
        walletAddress,
        chainId: challenge.chainId,
        nonce: request.nonce,
        message: challenge.message,
        signature: request.signature,
        sourceProvider: this.walletProvider.name,
        signedAt: now,
        verifiedAt: now
      };

      await transactionStore.saveRegistration(registration);
      await transactionStore.saveAgent({
        address: walletAddress,
        walletAddress,
        label: challenge.agentLabel,
        capabilityTags: challenge.capabilityTags,
        reputationScore: existingAgent?.reputationScore ?? 50,
        activeStake: existingAgent?.activeStake ?? "0",
        canUseAgenticWallet: true,
        status: existingAgent?.status ?? "available",
        walletProvider: registration.sourceProvider,
        walletProvisionedAt: existingAgent?.walletProvisionedAt,
        walletProviderEvidence: existingAgent?.walletProviderEvidence ?? {}
      });
      const consumed = await transactionStore.consumePreRegistrationChallenge(request.nonce, now);
      if (!consumed) {
        throw new ConflictError("This pre-registration challenge has already been consumed.");
      }

      return { registration, proof };
    });

    if (this.registrationStakeSeeder) {
      try {
        await this.registrationStakeSeeder.seedRegisteredAgent(result.registration);
      } catch (error) {
        await this.markStakeSeedPending(result.registration.walletAddress, error);
      }
    }

    return {
      registration: await this.decorateRegistration(this.store, result.registration),
      proof: result.proof
    };
  }

  async createLoginChallenge(request: AgentLoginChallengeRequest): Promise<AgentLoginChallenge> {
    if (request.chainId !== this.chainId) {
      throw new ValidationError(`Agent login must use X Layer chainId ${this.chainId}.`);
    }

    const walletAddress = normalizeAddress(request.walletAddress);
    const registration = await this.store.getRegistrationByWallet(walletAddress);
    if (!registration || registration.status === "disabled") {
      throw new NotFoundError("Agent registration was not found.");
    }
    if (registration.chainId !== request.chainId) {
      throw new ValidationError("Agent login chainId does not match the registered chain.");
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + CHALLENGE_TTL_MS;
    const nonce = randomUUID();
    const challenge: AgentLoginChallenge = {
      nonce,
      walletAddress,
      chainId: request.chainId,
      message: buildLoginMessage({
        walletAddress,
        chainId: request.chainId,
        nonce,
        issuedAt,
        expiresAt
      }),
      issuedAt,
      expiresAt,
      sourceProvider: this.walletProvider.name
    };

    return this.store.saveLoginChallenge(challenge);
  }

  async login(request: AgentLoginRequest): Promise<AgentLoginResponse> {
    return this.store.runInTransaction(async (transactionStore) => {
      const challenge = await transactionStore.lockLoginChallenge(request.nonce);
      assertChallengeUsable(challenge, request.nonce);

      const walletAddress = normalizeAddress(request.walletAddress);
      assertSameAddress(walletAddress, challenge.walletAddress, "Login wallet does not match the challenge.");

      if (request.chainId !== challenge.chainId) {
        throw new ValidationError("Login chainId does not match the challenge.");
      }

      const registration = await transactionStore.getRegistrationByWallet(walletAddress);
      if (!registration || registration.status === "disabled") {
        throw new NotFoundError("Agent registration was not found.");
      }

      const signatureValid = await verifyWalletSignature({
        walletAddress,
        message: challenge.message,
        signature: request.signature as `0x${string}`
      });
      if (!signatureValid) {
        throw new ValidationError("Login signature is invalid.");
      }

      const now = Date.now();
      const updatedRegistration = await transactionStore.saveRegistration({
        ...registration,
        lastLoginAt: now
      });
      const proof: WalletSignatureProof = {
        action: "signLogin",
        walletAddress,
        chainId: challenge.chainId,
        nonce: request.nonce,
        message: challenge.message,
        signature: request.signature,
        sourceProvider: this.walletProvider.name,
        signedAt: now,
        verifiedAt: now
      };

      const consumed = await transactionStore.consumeLoginChallenge(request.nonce, now);
      if (!consumed) {
        throw new ConflictError("This login challenge has already been consumed.");
      }

      const session = this.sessionService.issue(walletAddress, challenge.chainId);

      return {
        registration: await this.decorateRegistration(transactionStore, updatedRegistration),
        proof,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt
      };
    });
  }

  async joinJudgeList(request: JoinJudgeListRequest): Promise<JudgeListEntry> {
    const entry = await this.store.runInTransaction(async (transactionStore) => {
      const registration = await transactionStore.getRegistration(request.registrationId);
      if (!registration) {
        throw new NotFoundError(`Registration ${request.registrationId} was not found.`);
      }

      if (registration.status === "disabled") {
        throw new ValidationError("Disabled registrations cannot join the judge list.");
      }

      const existingEntry = await transactionStore.getJudgeListEntry(registration.id);
      if (existingEntry) {
        return existingEntry;
      }

      if (registration.status !== "pre_registered") {
        throw new ValidationError("Agent must complete pre-registration before joining the judge list.");
      }

      const now = Date.now();
      const existingAgent = await transactionStore.lockAgent(registration.walletAddress);
      const activeStake = existingAgent?.activeStake ?? "0";
      const reputationScore = existingAgent?.reputationScore ?? 50;
      const status = existingAgent?.status ?? "available";
      const entry: JudgeListEntry = {
        id: `judge-${registration.id}`,
        registrationId: registration.id,
        walletAddress: registration.walletAddress,
        agentLabel: registration.agentLabel,
        capabilityTags: registration.capabilityTags,
        chainId: registration.chainId,
        listedAt: now,
        activeStake,
        reputationScore,
        status,
        sourceProvider: registration.sourceProvider
      };

      await transactionStore.saveRegistration({
        ...registration,
        status: "judge_listed"
      });
      await transactionStore.saveAgent({
        address: registration.walletAddress,
        walletAddress: registration.walletAddress,
        label: registration.agentLabel,
        capabilityTags: registration.capabilityTags,
        reputationScore,
        activeStake,
        canUseAgenticWallet: true,
        status,
        walletProvider: registration.sourceProvider,
        walletProvisionedAt: existingAgent?.walletProvisionedAt,
        walletProviderEvidence: existingAgent?.walletProviderEvidence ?? {}
      });

      return transactionStore.saveJudgeListEntry(entry);
    });

    return this.decorateJudgeListEntry(this.store, entry);
  }

  async ensureRegistrationStakeSeed(registrationId: string): Promise<AgentRegistration> {
    const registration = await this.store.getRegistration(registrationId);
    if (!registration) {
      throw new NotFoundError(`Registration ${registrationId} was not found.`);
    }

    if (this.registrationStakeSeeder) {
      try {
        await this.registrationStakeSeeder.seedRegisteredAgent(registration);
      } catch (error) {
        await this.markStakeSeedPending(registration.walletAddress, error);
      }
    }

    return this.decorateRegistration(this.store, registration);
  }

  async getRegistration(id: string): Promise<AgentRegistration> {
    const registration = await this.store.getRegistration(id);
    if (!registration) {
      throw new NotFoundError(`Registration ${id} was not found.`);
    }

    return this.decorateRegistration(this.store, registration);
  }

  async listJudgeList(): Promise<JudgeListEntry[]> {
    const entries = await this.store.listJudgeListEntries();
    return Promise.all(entries.map((entry) => this.decorateJudgeListEntry(this.store, entry)));
  }

  private async decorateRegistration(store: WorkflowStore, registration: AgentRegistration): Promise<AgentRegistration> {
    const agent = await store.getAgent(registration.walletAddress);
    if (!agent) {
      return registration;
    }

    return {
      ...registration,
      walletProvider: agent.walletProvider,
      walletProvisionedAt: agent.walletProvisionedAt,
      walletProviderEvidence: agent.walletProviderEvidence ?? {}
    };
  }

  private async markStakeSeedPending(walletAddress: string, error: unknown): Promise<void> {
    await this.store.runInTransaction(async (transactionStore) => {
      const existingAgent = await transactionStore.lockAgent(walletAddress);
      if (!existingAgent) {
        return;
      }

      const currentSeedEvidence = existingAgent.walletProviderEvidence?.registrationStakeSeed;
      if (currentSeedEvidence) {
        return;
      }

      const currentPendingEvidence = existingAgent.walletProviderEvidence?.registrationStakeSeedPending;
      const mergedPendingEvidence: PendingSeedEvidence =
        currentPendingEvidence && typeof currentPendingEvidence === "object"
          ? {
              ...(currentPendingEvidence as Record<string, unknown>),
              strategy:
                typeof (currentPendingEvidence as { strategy?: unknown }).strategy === "string"
                  ? ((currentPendingEvidence as { strategy?: PendingSeedEvidence["strategy"] }).strategy ??
                    "fixed_registration_bootstrap")
                  : "fixed_registration_bootstrap",
              amount:
                typeof (currentPendingEvidence as { amount?: unknown }).amount === "string"
                  ? ((currentPendingEvidence as { amount?: string }).amount ?? "0")
                  : "0",
              startedAt:
                typeof (currentPendingEvidence as { startedAt?: unknown }).startedAt === "number"
                  ? ((currentPendingEvidence as { startedAt?: number }).startedAt ?? Date.now())
                  : Date.now(),
              signer:
                typeof (currentPendingEvidence as { signer?: unknown }).signer === "string"
                  ? ((currentPendingEvidence as { signer?: string }).signer ?? "registration-service")
                  : "registration-service",
              stage:
                (currentPendingEvidence as { stage?: unknown }).stage === "broadcasted" ||
                (currentPendingEvidence as { stage?: unknown }).stage === "failed"
                  ? ((currentPendingEvidence as { stage?: PendingSeedEvidence["stage"] }).stage ?? "failed")
                  : "failed",
              txHash:
                typeof (currentPendingEvidence as { txHash?: unknown }).txHash === "string"
                  ? ((currentPendingEvidence as { txHash?: string }).txHash ?? undefined)
                  : undefined,
              attemptedAt: Date.now(),
              error: error instanceof Error ? error.message : "unknown stake seed failure"
            }
          : buildPendingSeedEvidence({
              amount: "0",
              signer: "registration-service",
              stage: "failed",
              attemptedAt: Date.now(),
              error: error instanceof Error ? error.message : "unknown stake seed failure"
            });

      await transactionStore.saveAgent({
        ...existingAgent,
        walletProviderEvidence: {
          ...(existingAgent.walletProviderEvidence ?? {}),
          registrationStakeSeedPending: mergedPendingEvidence
        }
      });
    });
  }

  private async decorateJudgeListEntry(store: WorkflowStore, entry: JudgeListEntry): Promise<JudgeListEntry> {
    const agent = await store.getAgent(entry.walletAddress);
    if (!agent) {
      return entry;
    }

    const seedEvidence = agent.walletProviderEvidence?.registrationStakeSeed;
    const pendingEvidence = agent.walletProviderEvidence?.registrationStakeSeedPending;

    if (seedEvidence && typeof seedEvidence === "object") {
      return {
        ...entry,
        activeStake: agent.activeStake,
        stakeSeedStatus: "seeded",
        stakeSeedError: undefined
      };
    }

    if (pendingEvidence && typeof pendingEvidence === "object") {
      return {
        ...entry,
        activeStake: agent.activeStake,
        stakeSeedStatus: "pending",
        stakeSeedError:
          typeof (pendingEvidence as { error?: unknown }).error === "string"
            ? ((pendingEvidence as { error?: string }).error ?? undefined)
            : undefined
      };
    }

    return {
      ...entry,
      activeStake: agent.activeStake
    };
  }
}
