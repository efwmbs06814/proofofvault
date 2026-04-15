import type { AgenticWalletProvider } from "@proof-of-vault/agent-runtime";
import type {
  AgentProfile,
  AgentRegistration,
  CapabilityTag,
  JudgeListEntry
} from "@proof-of-vault/shared-types";

import { ValidationError } from "../lib/errors.js";
import type { WorkflowStore } from "../repositories/workflow-store.js";
import { AgentRegistrationService } from "./agent-registration-service.js";

export type OperatorWalletBootstrapRequest = {
  agentLabel: string;
  capabilityTags: CapabilityTag[];
  email: string;
  otp: string;
  joinJudgeList?: boolean;
};

export type OperatorWalletBootstrapResponse = {
  agentAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  registration: AgentRegistration;
  judgeListEntry?: JudgeListEntry;
};

export class OperatorWalletBootstrapService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly walletProvider: AgenticWalletProvider,
    private readonly registrationService: AgentRegistrationService,
    private readonly chainId: number
  ) {}

  async bootstrap(request: OperatorWalletBootstrapRequest): Promise<OperatorWalletBootstrapResponse> {
    const provisioned = await this.walletProvider.provisionWallet({
      email: request.email,
      otp: request.otp,
      metadata: {
        label: request.agentLabel,
        requestedCapabilities: request.capabilityTags,
        capabilityTags: request.capabilityTags,
        bootstrapMode: "operator-cli"
      }
    });
    const walletAddress = provisioned.walletAddress ?? provisioned.address;
    if (!walletAddress) {
      throw new ValidationError("Wallet provisioning completed without a wallet address.");
    }
    const canonicalWalletAddress = walletAddress.toLowerCase() as `0x${string}`;

    const existingRegistration = await this.store.getRegistrationByWallet(canonicalWalletAddress);
    const existingAgent = await this.store.getAgent(canonicalWalletAddress);
    const canonicalAgent: AgentProfile = {
      ...provisioned,
      address: canonicalWalletAddress,
      walletAddress: canonicalWalletAddress,
      label: existingRegistration?.agentLabel ?? existingAgent?.label ?? request.agentLabel,
      capabilityTags: existingRegistration?.capabilityTags ?? existingAgent?.capabilityTags ?? request.capabilityTags,
      reputationScore: existingAgent?.reputationScore ?? provisioned.reputationScore,
      activeStake: existingAgent?.activeStake ?? provisioned.activeStake,
      status: existingAgent?.status ?? provisioned.status
    };

    let registration =
      existingRegistration ??
      (await this.createRegistration(canonicalAgent, canonicalAgent.capabilityTags));
    if (existingRegistration) {
      registration = await this.registrationService.ensureRegistrationStakeSeed(existingRegistration.id);
    }
    const latestAgent = await this.store.getAgent(canonicalWalletAddress);
    await this.store.saveAgent({
      ...(latestAgent ?? canonicalAgent),
      ...canonicalAgent,
      activeStake: latestAgent?.activeStake ?? canonicalAgent.activeStake,
      reputationScore: latestAgent?.reputationScore ?? canonicalAgent.reputationScore,
      status: latestAgent?.status ?? canonicalAgent.status,
      walletProviderEvidence: {
        ...(latestAgent?.walletProviderEvidence ?? {}),
        ...(canonicalAgent.walletProviderEvidence ?? {})
      }
    });

    let judgeListEntry: JudgeListEntry | undefined;
    if (request.joinJudgeList ?? true) {
      const existingJudgeListEntry = await this.store.getJudgeListEntryByWallet(canonicalWalletAddress);
      if (existingJudgeListEntry) {
        const refreshedAgent = await this.store.getAgent(canonicalWalletAddress);
        judgeListEntry = await this.store.saveJudgeListEntry({
          ...existingJudgeListEntry,
          activeStake: refreshedAgent?.activeStake ?? existingJudgeListEntry.activeStake,
          reputationScore: refreshedAgent?.reputationScore ?? existingJudgeListEntry.reputationScore,
          status: refreshedAgent?.status ?? existingJudgeListEntry.status
        });
      } else {
        judgeListEntry = await this.registrationService.joinJudgeList({ registrationId: registration.id });
      }
    }
    registration = await this.registrationService.getRegistration(registration.id);

    return {
      agentAddress: canonicalWalletAddress,
      walletAddress: canonicalWalletAddress,
      registration,
      judgeListEntry
    };
  }

  private async createRegistration(agent: AgentProfile, capabilityTags: CapabilityTag[]): Promise<AgentRegistration> {
    const walletAddress = (agent.walletAddress ?? agent.address) as `0x${string}`;
    const challenge = await this.registrationService.createPreRegistrationChallenge({
      walletAddress,
      agentLabel: agent.label,
      capabilityTags,
      chainId: this.chainId
    });
    const proof = await this.walletProvider.signMessage({
      action: "signPreRegistration",
      walletAddress,
      message: challenge.message,
      nonce: challenge.nonce,
      chainId: this.chainId,
      metadata: {
        bootstrapMode: "operator-cli"
      }
    });
    const result = await this.registrationService.register({
      walletAddress,
      nonce: challenge.nonce,
      signature: proof.signature,
      chainId: this.chainId
    });

    return result.registration;
  }
}
