import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, parseAbiParameters } from "viem";
import {
  DEFAULT_OKX_CHAIN_INDEX,
  DEFAULT_TARGET_EVM_CHAIN_ID,
  type AgentProfile
} from "@proof-of-vault/shared-types";

import { evaluateResolutionConsensus } from "../src/consensus-engine.js";
import { stringifyCanonicalJson } from "../src/canonical-json.js";
import { selectResolutionCommittee, selectRuleCommittee } from "../src/committee-selector.js";
import { computeResolutionCommitHash } from "../src/hash-payload.js";
import { MockOnchainGateway, ViemVaultFactoryGateway } from "../src/onchain-gateway-v2.js";
import {
  MOCK_AGENTIC_WALLET_ADDRESS,
  MockAgenticWalletProvider
} from "../src/providers/mock-agentic-wallet-provider.js";
import { OkxAgenticWalletProvider } from "../src/providers/okx-agentic-wallet-provider.js";
import { OkxMarketDataProvider } from "../src/providers/okx-market-data-provider.js";
import { verifyWalletSignature } from "../src/signature-verifier.js";

describe("canonical json", () => {
  it("stabilizes key ordering and normalizes addresses, enums, and numbers", () => {
    const left = stringifyCanonicalJson({
      amount: 42,
      source: {
        actorAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        result: "true"
      }
    });
    const right = stringifyCanonicalJson({
      source: {
        result: "TRUE",
        actorAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      amount: "42"
    });

    expect(left).toBe(right);
  });
});

describe("committee selection", () => {
  const agents: AgentProfile[] = [
    {
      address: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
      label: "Alpha",
      capabilityTags: ["rule-maker", "validator"],
      reputationScore: 90,
      activeStake: "1000",
      canUseAgenticWallet: true,
      status: "available" as const,
      walletProvider: "mock-agentic-wallet" as const
    },
    {
      address: "0x2222222222222222222222222222222222222222",
      walletAddress: "0x2222222222222222222222222222222222222222",
      label: "Beta",
      capabilityTags: ["rule-verifier", "auditor"],
      reputationScore: 80,
      activeStake: "1000",
      canUseAgenticWallet: true,
      status: "available" as const,
      walletProvider: "mock-agentic-wallet" as const
    },
    {
      address: "0x3333333333333333333333333333333333333333",
      walletAddress: "0x3333333333333333333333333333333333333333",
      label: "Gamma",
      capabilityTags: ["validator", "all-rounder"],
      reputationScore: 85,
      activeStake: "1000",
      canUseAgenticWallet: true,
      status: "available" as const,
      walletProvider: "mock-agentic-wallet" as const
    }
  ];

  it("keeps rule committee roles disjoint", () => {
    const { committee } = selectRuleCommittee(agents, 1, 1);
    expect(committee.makers[0]).not.toBe(committee.verifiers[0]);
  });

  it("keeps resolution committee roles disjoint", () => {
    const { committee } = selectResolutionCommittee(agents, 2, 1, 1);
    expect(committee.validators).not.toContain(committee.auditors[0]);
  });
});

describe("resolution consensus", () => {
  it("counts only audited valid reveals and flags commit mismatch", () => {
    const commitPayload = {
      vaultId: 1,
      round: 1,
      outcome: "TRUE" as const,
      proofHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      salt: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      submittedByAgent: "0x1111111111111111111111111111111111111111",
      version: 1
    };
    const commitHash = computeResolutionCommitHash(commitPayload);

    const metrics = evaluateResolutionConsensus({
      round: 1,
      minValidCount: 1,
      resolutionCommittee: {
        validators: ["0x1111111111111111111111111111111111111111"],
        auditors: ["0x2222222222222222222222222222222222222222"],
        minValidCount: 1
      },
      submissions: [
        {
          kind: "resolution_commit",
          vaultId: 1,
          round: 1,
          agentAddress: "0x1111111111111111111111111111111111111111",
          payloadURI: "ipfs://commit",
          payloadHash: commitHash,
          payload: commitPayload
        },
        {
          kind: "resolution_reveal",
          vaultId: 1,
          round: 1,
          agentAddress: "0x1111111111111111111111111111111111111111",
          payloadURI: "ipfs://reveal",
          payloadHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          proofHash: commitPayload.proofHash,
          salt: commitPayload.salt,
          payload: {
            vaultId: 1,
            round: 1,
            result: "TRUE",
            confidenceScore: 0.95,
            sources: [],
            reasoning: "demo",
            submittedByAgent: "0x1111111111111111111111111111111111111111",
            version: 1
          }
        },
        {
          kind: "audit_verdict",
          vaultId: 1,
          round: 1,
          agentAddress: "0x2222222222222222222222222222222222222222",
          payloadURI: "ipfs://audit",
          payloadHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          payload: {
            vaultId: 1,
            round: 1,
            validator: "0x1111111111111111111111111111111111111111",
            verdict: "VALID",
            findings: [],
            reviewerAgent: "0x2222222222222222222222222222222222222222",
            version: 1
          }
        }
      ]
    });

    expect(metrics.validCount).toBe(1);
    expect(metrics.decidedOutcome).toBe("TRUE");
    expect(metrics.slashCandidates).toHaveLength(0);
  });

  it("recommends reopening when valid quorum is not reached", () => {
    const metrics = evaluateResolutionConsensus({
      round: 1,
      minValidCount: 2,
      resolutionCommittee: {
        validators: ["0x1111111111111111111111111111111111111111"],
        auditors: ["0x2222222222222222222222222222222222222222"],
        minValidCount: 2
      },
      submissions: []
    });

    expect(metrics.readyForFinality).toBe(true);
    expect(metrics.needsRoundReopen).toBe(true);
  });
});

describe("real-link providers", () => {
  const agent: AgentProfile = {
    address: "0x1111111111111111111111111111111111111111",
    walletAddress: "0x1111111111111111111111111111111111111111",
    label: "Agent One",
    capabilityTags: ["validator"],
    reputationScore: 80,
    activeStake: "1000",
    canUseAgenticWallet: true,
    status: "available",
    walletProvider: "mock-agentic-wallet"
  };

  it("fails fast when OKX wallet provider is missing configuration", () => {
    expect(() => new OkxAgenticWalletProvider({ mode: "mcp" })).toThrow(/OKX Agentic Wallet/);
  });

  it("adapts OKX wallet transport responses into execution traces", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const provider = new OkxAgenticWalletProvider({
      mode: "mcp",
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      vaultFactoryAddress: "0x2222222222222222222222222222222222222222",
      agentStakingAddress: "0x3333333333333333333333333333333333333333",
      transport: async ({ body }) => {
        requests.push(body);
        return {
          data: {
            txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            executedByWallet: agent.walletAddress,
            chainId: DEFAULT_OKX_CHAIN_INDEX
          }
        };
      }
    });
    const trace = await provider.execute({
      action: "claimRewards",
      agent
    });

    expect(trace.txHash).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(trace.sourceProvider).toBe("okx-agentic-wallet");
    expect(trace.chainId).toBe(DEFAULT_TARGET_EVM_CHAIN_ID);
    expect(requests[0]).toMatchObject({
      chainIndex: DEFAULT_OKX_CHAIN_INDEX,
      targetChainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
  });

  it("verifies AA-forwarded rule draft transactions from receipt logs", async () => {
    const vaultFactoryAddress = "0x2222222222222222222222222222222222222222" as const;
    const draftHash = `0x${"b".repeat(64)}` as const;
    const payloadURI = "ipfs://proof-of-vault/tests/aa-forwarded-rule-draft";
    const provider = new OkxAgenticWalletProvider({
      mode: "mcp",
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      vaultFactoryAddress
    });

    const ruleDraftSubmittedEvent = parseAbiItem(
      "event RuleDraftSubmitted(uint256 indexed vaultId, uint8 indexed round, address indexed maker, bytes32 draftHash, string payloadURI)"
    );

    Object.defineProperty(provider, "publicClient", {
      value: {
        waitForTransactionReceipt: async () => ({
          status: "success",
          logs: [
            {
              address: vaultFactoryAddress,
              topics: encodeEventTopics({
                abi: [ruleDraftSubmittedEvent],
                eventName: "RuleDraftSubmitted",
                args: {
                  vaultId: 1n,
                  round: 1,
                  maker: agent.walletAddress as `0x${string}`
                }
              }) as `0x${string}`[],
              data: encodeAbiParameters(parseAbiParameters("bytes32 draftHash, string payloadURI"), [draftHash, payloadURI])
            }
          ]
        })
      },
      configurable: true
    });

    const trace = await provider.verifyExecution(
      {
        action: "submitRuleDraft",
        agent,
        vaultId: 1,
        draftHash,
        payloadURI,
        metadata: { round: 1 }
      },
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );

    expect(trace.executedByWallet).toBe(agent.walletAddress);
    expect(trace.sourceProvider).toBe("okx-agentic-wallet-verified");
    expect(trace.callArgs?.functionName).toBe("submitRuleDraft");
  });

  it("signs and verifies pre-registration messages with the mock Agentic Wallet", async () => {
    const provider = new MockAgenticWalletProvider();
    const proof = await provider.signMessage({
      action: "signPreRegistration",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: "Proof of Vault registration test",
      nonce: "nonce-for-registration",
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    await expect(
      verifyWalletSignature({
        walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
        message: proof.message,
        signature: proof.signature as `0x${string}`
      })
    ).resolves.toBe(true);
  });

  it("adapts OKX wallet transport responses into signature proofs", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const provider = new OkxAgenticWalletProvider({
      mode: "mcp",
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      transport: async ({ body }) => {
        requests.push(body);
        return {
          data: {
            walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
            signature: `0x${"a".repeat(130)}`
          }
        };
      }
    });
    const proof = await provider.signMessage({
      action: "signLogin",
      walletAddress: MOCK_AGENTIC_WALLET_ADDRESS,
      message: "Proof of Vault login test",
      nonce: "nonce-for-login",
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });

    expect(proof.walletAddress).toBe(MOCK_AGENTIC_WALLET_ADDRESS);
    expect(proof.sourceProvider).toBe("okx-agentic-wallet");
    expect(proof.chainId).toBe(DEFAULT_TARGET_EVM_CHAIN_ID);
    expect(requests[0]).toMatchObject({
      chainIndex: DEFAULT_OKX_CHAIN_INDEX,
      targetChainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
  });

  it("adapts OKX market transport snapshots", async () => {
    const requests: Array<{ toolName: string; arguments?: Record<string, unknown> }> = [];
    const provider = new OkxMarketDataProvider({
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      transport: async ({ toolName, arguments: args }) => {
        requests.push({ toolName, arguments: args });
        if (toolName === "dex-okx-market-token-price-info") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  code: "0",
                  data: [
                    {
                      chainIndex: String(DEFAULT_OKX_CHAIN_INDEX),
                      tokenContractAddress: "0x8888888888888888888888888888888888888888",
                      tokenSymbol: "POV",
                      price: "123",
                      time: "1764806400000"
                    }
                  ],
                  msg: ""
                })
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                code: "0",
                data: [
                  {
                    chainIndex: String(DEFAULT_OKX_CHAIN_INDEX),
                    tokenContractAddress: "0x8888888888888888888888888888888888888888",
                    tokenSymbol: "POV",
                    tokenName: "Proof of Vault"
                  }
                ],
                msg: ""
              })
            }
          ]
        };
      }
    });
    const snapshots = await provider.collectSnapshots({
      kind: "resolution",
      vaultId: 1,
      round: 1,
      tokenAddress: "0x8888888888888888888888888888888888888888"
    });

    expect(snapshots.at(0)?.value).toBe("123");
    expect(snapshots.at(0)?.chainId).toBe(DEFAULT_TARGET_EVM_CHAIN_ID);
    expect(snapshots.at(0)?.metadata).toMatchObject({
      tokenContractAddress: "0x8888888888888888888888888888888888888888",
      okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
      targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
    expect(requests[0]?.toolName).toBe("dex-okx-market-token-price-info");
  });

  it("marks OKX market supported-chain fallback snapshots as synthetic", async () => {
    const requests: Array<{ toolName: string; arguments?: Record<string, unknown> }> = [];
    const provider = new OkxMarketDataProvider({
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      transport: async ({ toolName, arguments: args }) => {
        requests.push({ toolName, arguments: args });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                code: "0",
                data: toolName === "dex-okx-market-price-chains" ? [{ chainIndex: String(DEFAULT_OKX_CHAIN_INDEX) }] : [],
                msg: ""
              })
            }
          ]
        };
      }
    });

    const snapshots = await provider.collectSnapshots({
      kind: "resolution",
      vaultId: 1,
      round: 1,
      statement: "unknown token"
    });

    expect(snapshots.at(0)?.value).toBe("supported_chains:1");
    expect(snapshots.at(0)?.metadata).toMatchObject({
      providerCollected: false,
      syntheticFallback: true
    });
    expect(requests.map((request) => request.toolName)).toEqual([
      "dex-okx-market-token-search",
      "dex-okx-market-price-chains"
    ]);
  });

  it("marks OKX token candidates without price-info rows as synthetic", async () => {
    const provider = new OkxMarketDataProvider({
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      transport: async ({ toolName }) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              code: "0",
              data:
                toolName === "dex-okx-market-token-search"
                  ? [
                      {
                        chainIndex: String(DEFAULT_OKX_CHAIN_INDEX),
                        tokenContractAddress: "0x8888888888888888888888888888888888888888",
                        tokenSymbol: "POV"
                      }
                    ]
                  : [],
              msg: ""
            })
          }
        ]
      })
    });

    const snapshots = await provider.collectSnapshots({
      kind: "resolution",
      vaultId: 1,
      round: 1,
      statement: "POV"
    });

    expect(snapshots.at(0)?.metadata).toMatchObject({
      providerCollected: false,
      syntheticFallback: true,
      noPriceData: true
    });
  });

  it("prepares agent-signed transactions for external Agentic Wallet execution", async () => {
    const provider = new OkxAgenticWalletProvider({
      mode: "mcp",
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      vaultFactoryAddress: "0x2222222222222222222222222222222222222222",
      agentStakingAddress: "0x3333333333333333333333333333333333333333",
      stakeTokenAddress: "0x4444444444444444444444444444444444444444"
    });

    const prepared = await provider.prepareExecution({
      action: "submitRuleDraft",
      agent,
      vaultId: 7,
      draftHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      payloadURI: "ipfs://proof-of-vault/rule-draft"
    });

    expect(prepared.actorAddress).toBe(agent.walletAddress);
    expect(prepared.transaction.to).toBe("0x2222222222222222222222222222222222222222");
    expect(prepared.transaction.functionName).toBe("submitRuleDraft");
  });

  it("mocks on-chain create and snapshot reads for local fallback", async () => {
    const gateway = new MockOnchainGateway(DEFAULT_TARGET_EVM_CHAIN_ID);
    const created = await gateway.createVaultRequest({
      mode: "register_onchain",
      metadataURI: "ipfs://proof-of-vault/test",
      setterAddress: "0x1111111111111111111111111111111111111111",
      collateralToken: "0x2222222222222222222222222222222222222222",
      grossCollateralAmount: "1000",
      settlementTime: Date.now() + 60_000,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      legacyMode: false
    });
    const snapshot = await gateway.readVaultSnapshot(created.vaultId);

    expect(created.trace.action).toBe("createVaultRequest");
    expect(snapshot.vaultId).toBe(created.vaultId);
  });

  it("verifies AA-forwarded acceptRuleSetAndFund from receipt logs", async () => {
    const vaultFactoryAddress = "0x2222222222222222222222222222222222222222" as const;
    const setterAddress = "0x5555555555555555555555555555555555555555" as const;
    const ruleSetAcceptedEvent = parseAbiItem(
      "event RuleSetAccepted(uint256 indexed vaultId, uint8 indexed round, uint256 resolutionRewardDeposit, bytes32 criteriaHash)"
    );
    const gateway = new ViemVaultFactoryGateway({
      contractAddress: vaultFactoryAddress,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      walletClient: {} as never,
      publicClient: {
        getTransactionReceipt: async () => ({
          status: "success",
          logs: [
            {
              address: vaultFactoryAddress,
              topics: encodeEventTopics({
                abi: [ruleSetAcceptedEvent],
                eventName: "RuleSetAccepted",
                args: {
                  vaultId: 1n,
                  round: 1
                }
              }) as `0x${string}`[],
              data: encodeAbiParameters(parseAbiParameters("uint256 resolutionRewardDeposit, bytes32 criteriaHash"), [
                100n,
                `0x${"a".repeat(64)}`
              ])
            }
          ]
        })
      } as never
    });

    Object.defineProperty(gateway, "readVaultSnapshot", {
      value: async () => ({
        vaultId: 1,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        status: "Active",
        setterAddress,
        collateralToken: vaultFactoryAddress,
        grossCollateralAmount: "100",
        lockedCollateralAmount: "100",
        setupDepositAmount: "0.01",
        resolutionRewardDepositAmount: "100",
        legacyMode: false,
        ruleSetAccepted: true,
        ruleRound: 1,
        resolutionRound: 0,
        rejectionCount: 0,
        syncedAt: Date.now()
      })
    });

    const verified = await gateway.verifyVaultAction(
      1,
      "acceptRuleSetAndFund",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );

    expect(verified.trace.executedByWallet).toBe(setterAddress);
    expect(verified.trace.sourceProvider).toBe("browser-wallet-verified");
    expect(verified.snapshot.status).toBe("Active");
  });

  it("verifies AA-forwarded rejectRuleSet from receipt logs", async () => {
    const vaultFactoryAddress = "0x2222222222222222222222222222222222222222" as const;
    const setterAddress = "0x5555555555555555555555555555555555555555" as const;
    const ruleSetRejectedEvent = parseAbiItem(
      "event RuleSetRejected(uint256 indexed vaultId, uint8 indexed round, uint8 rejectionCount, string reasonURI)"
    );
    const gateway = new ViemVaultFactoryGateway({
      contractAddress: vaultFactoryAddress,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      walletClient: {} as never,
      publicClient: {
        getTransactionReceipt: async () => ({
          status: "success",
          logs: [
            {
              address: vaultFactoryAddress,
              topics: encodeEventTopics({
                abi: [ruleSetRejectedEvent],
                eventName: "RuleSetRejected",
                args: {
                  vaultId: 1n,
                  round: 1
                }
              }) as `0x${string}`[],
              data: encodeAbiParameters(parseAbiParameters("uint8 rejectionCount, string reasonURI"), [1, "ipfs://reject"])
            }
          ]
        })
      } as never
    });

    Object.defineProperty(gateway, "readVaultSnapshot", {
      value: async () => ({
        vaultId: 1,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        status: "RuleAuction",
        setterAddress,
        collateralToken: vaultFactoryAddress,
        grossCollateralAmount: "100",
        lockedCollateralAmount: "0",
        setupDepositAmount: "0.01",
        resolutionRewardDepositAmount: "0",
        legacyMode: false,
        ruleSetAccepted: false,
        ruleRound: 2,
        resolutionRound: 0,
        rejectionCount: 1,
        syncedAt: Date.now()
      })
    });

    const verified = await gateway.verifyVaultAction(
      1,
      "rejectRuleSet",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    );

    expect(verified.trace.executedByWallet).toBe(setterAddress);
    expect(verified.snapshot.rejectionCount).toBe(1);
  });

  it("verifies AA-forwarded finalizeV2Vault from receipt logs", async () => {
    const vaultFactoryAddress = "0x2222222222222222222222222222222222222222" as const;
    const finalizerAddress = "0x6666666666666666666666666666666666666666" as const;
    const vaultFinalizedEvent = parseAbiItem(
      "event VaultFinalized(uint256 indexed vaultId, uint8 indexed outcome, bytes32 resolutionHash, address indexed submittedBy, uint256 settlementFee)"
    );
    const gateway = new ViemVaultFactoryGateway({
      contractAddress: vaultFactoryAddress,
      chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      walletClient: {} as never,
      publicClient: {
        getTransactionReceipt: async () => ({
          status: "success",
          logs: [
            {
              address: vaultFactoryAddress,
              topics: encodeEventTopics({
                abi: [vaultFinalizedEvent],
                eventName: "VaultFinalized",
                args: {
                  vaultId: 1n,
                  outcome: 1,
                  submittedBy: finalizerAddress
                }
              }) as `0x${string}`[],
              data: encodeAbiParameters(parseAbiParameters("bytes32 resolutionHash, uint256 settlementFee"), [
                `0x${"c".repeat(64)}`,
                0n
              ])
            }
          ]
        }),
        readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
          if (functionName === "authorizedFinalizers" && args?.[0] === finalizerAddress) {
            return true;
          }

          throw new Error(`Unexpected readContract call: ${functionName}`);
        }
      } as never
    });

    Object.defineProperty(gateway, "readVaultSnapshot", {
      value: async () => ({
        vaultId: 1,
        chainId: DEFAULT_TARGET_EVM_CHAIN_ID,
        status: "ResolvedTrue",
        setterAddress: "0x5555555555555555555555555555555555555555",
        collateralToken: vaultFactoryAddress,
        grossCollateralAmount: "100",
        lockedCollateralAmount: "0",
        setupDepositAmount: "0.01",
        resolutionRewardDepositAmount: "100",
        legacyMode: false,
        ruleSetAccepted: true,
        ruleRound: 1,
        resolutionRound: 1,
        rejectionCount: 0,
        syncedAt: Date.now()
      })
    });

    const verified = await gateway.verifyVaultAction(
      1,
      "finalizeV2Vault",
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    );

    expect(verified.trace.executedByWallet).toBe(finalizerAddress);
    expect(verified.snapshot.status).toBe("ResolvedTrue");
  });

  it("provisions a wallet through the OKX transport with split network identifiers", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const provider = new OkxAgenticWalletProvider({
      mode: "mcp",
      accessKey: "test-key",
      endpoint: "https://example.test/onchainos-mcp",
      transport: async ({ body }) => {
        requests.push(body);
        return {
          data: {
            walletAddress: "0x9999999999999999999999999999999999999999"
          }
        };
      }
    });

    const provisioned = await provider.provisionWallet({
      agent,
      email: "operator@example.test",
      otp: "123456"
    });

    expect(provisioned.walletAddress).toBe("0x9999999999999999999999999999999999999999");
    expect(provisioned.walletProviderEvidence).toMatchObject({
      okxChainIndex: DEFAULT_OKX_CHAIN_INDEX,
      targetEvmChainId: DEFAULT_TARGET_EVM_CHAIN_ID,
      provisioningMode: "operator-cli"
    });
    expect(requests[0]).toMatchObject({
      chainIndex: DEFAULT_OKX_CHAIN_INDEX,
      targetChainId: DEFAULT_TARGET_EVM_CHAIN_ID
    });
  });
});
