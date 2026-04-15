import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
  type Log
} from "viem";

import { getRuntimeConfig, type RuntimeConfig } from "@/lib/api/runtime";
import { requireInjectedEthereumProvider } from "@/lib/wallet/injected";

const DEFAULT_X_LAYER_RPC = "https://rpc.xlayer.tech";
const DEFAULT_VAULT_FACTORY_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_STAKE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

export const X_LAYER_CHAIN_ID = Number(process.env.NEXT_PUBLIC_PROOF_OF_VAULT_TARGET_EVM_CHAIN_ID ?? 196);
export const OKX_ONCHAIN_OS_CHAIN_INDEX = Number(process.env.NEXT_PUBLIC_PROOF_OF_VAULT_OKX_CHAIN_INDEX ?? 196);
const DEFAULT_X_LAYER_EXPLORER =
  process.env.NEXT_PUBLIC_PROOF_OF_VAULT_EXPLORER_URL ??
  "https://www.oklink.com/xlayer";

function formatNetworkLabel(chainId: number): string {
  return chainId === 196 ? "X Layer mainnet" : `X Layer chain ${chainId}`;
}

export const xLayer = defineChain({
  id: X_LAYER_CHAIN_ID,
  name: "X Layer",
  nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_X_LAYER_RPC_URL ?? DEFAULT_X_LAYER_RPC]
    }
  },
  blockExplorers: {
    default: {
      name: "OKLink",
      url: DEFAULT_X_LAYER_EXPLORER
    }
  }
});

export const proofOfVaultContractConfig = {
  chainId: X_LAYER_CHAIN_ID,
  okxChainIndex: OKX_ONCHAIN_OS_CHAIN_INDEX,
  rpcUrl: process.env.NEXT_PUBLIC_X_LAYER_RPC_URL ?? DEFAULT_X_LAYER_RPC,
  vaultFactoryAddress: (process.env.NEXT_PUBLIC_PROOF_OF_VAULT_VAULT_FACTORY_ADDRESS ??
    DEFAULT_VAULT_FACTORY_ADDRESS) as Address,
  stakeTokenAddress: (process.env.NEXT_PUBLIC_PROOF_OF_VAULT_POV_TOKEN_ADDRESS ??
    process.env.NEXT_PUBLIC_PROOF_OF_VAULT_STAKE_TOKEN_ADDRESS ??
    DEFAULT_STAKE_TOKEN_ADDRESS) as Address
} as const;

type ResolvedRuntimeConfig = {
  chainId: number;
  okxChainIndex: number;
  rpcUrl: string;
  explorerUrl: string;
  vaultFactoryAddress: Address;
  stakeTokenAddress: Address;
  allowedCollateralTokens: RuntimeConfig["collateral"]["allowedTokens"];
  defaultCollateralToken?: RuntimeConfig["collateral"]["allowedTokens"][number];
};

function assertConfiguredAddress(value: string | undefined, label: string): Address {
  if (!value || value.toLowerCase() === DEFAULT_VAULT_FACTORY_ADDRESS) {
    throw new Error(`${label} is not configured. Load /runtime-config from a deployed API or set the public env address.`);
  }

  return value as Address;
}

export async function resolveProofOfVaultRuntimeConfig(): Promise<ResolvedRuntimeConfig> {
  try {
    const runtime = await getRuntimeConfig();
    return {
      chainId: runtime.chain.chainId,
      okxChainIndex: runtime.chain.okxChainIndex,
      rpcUrl: runtime.chain.rpcUrl ?? proofOfVaultContractConfig.rpcUrl,
      explorerUrl: runtime.chain.explorerUrl,
      vaultFactoryAddress: assertConfiguredAddress(runtime.contracts.vaultFactory, "VaultFactory"),
      stakeTokenAddress: assertConfiguredAddress(runtime.contracts.povToken, "POV token"),
      allowedCollateralTokens: runtime.collateral.allowedTokens,
      defaultCollateralToken: runtime.collateral.allowedTokens[0]
    };
  } catch (error) {
    if (proofOfVaultContractConfig.vaultFactoryAddress === DEFAULT_VAULT_FACTORY_ADDRESS) {
      throw error;
    }

    return {
      chainId: proofOfVaultContractConfig.chainId,
      okxChainIndex: proofOfVaultContractConfig.okxChainIndex,
      rpcUrl: proofOfVaultContractConfig.rpcUrl,
      explorerUrl: DEFAULT_X_LAYER_EXPLORER,
      vaultFactoryAddress: proofOfVaultContractConfig.vaultFactoryAddress,
      stakeTokenAddress: assertConfiguredAddress(proofOfVaultContractConfig.stakeTokenAddress, "POV token"),
      allowedCollateralTokens: []
    };
  }
}

export const vaultFactoryAbi = [
  {
    type: "event",
    name: "VaultRequestCreated",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "setter", type: "address", indexed: true },
      { name: "collateralToken", type: "address", indexed: true },
      { name: "grossCollateralAmount", type: "uint256", indexed: false },
      { name: "settlementTime", type: "uint64", indexed: false },
      { name: "setupDepositAmount", type: "uint256", indexed: false },
      { name: "metadataURI", type: "string", indexed: false }
    ]
  },
  {
    type: "function",
    name: "createVaultRequest",
    stateMutability: "payable",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "grossCollateralAmount", type: "uint256" },
      { name: "settlementTime", type: "uint64" },
      { name: "metadataURI", type: "string" }
    ],
    outputs: [{ name: "vaultId", type: "uint256" }]
  },
  {
    type: "function",
    name: "acceptRuleSetAndFund",
    stateMutability: "nonpayable",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "rejectRuleSet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vaultId", type: "uint256" },
      { name: "reasonURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getVault",
    stateMutability: "view",
    inputs: [{ name: "vaultId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "setter", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "grossCollateralAmount", type: "uint256" },
          { name: "lockedCollateralAmount", type: "uint256" },
          { name: "setupDepositAmount", type: "uint256" },
          { name: "resolutionRewardDepositAmount", type: "uint256" },
          { name: "settlementTime", type: "uint64" },
          { name: "createdAt", type: "uint64" },
          { name: "activatedAt", type: "uint64" },
          { name: "criteriaHash", type: "bytes32" },
          { name: "metadataURI", type: "string" },
          { name: "status", type: "uint8" },
          { name: "legacyMode", type: "bool" },
          { name: "ruleSetAccepted", type: "bool" },
          { name: "ruleRound", type: "uint8" },
          { name: "resolutionRound", type: "uint8" },
          { name: "rejectionCount", type: "uint8" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "feeManager",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "rewardPool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const feeManagerAbi = [
  {
    type: "function",
    name: "previewSetupDeposit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "previewResolutionRewardDeposit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "previewCreationFee",
    stateMutability: "view",
    inputs: [{ name: "grossCollateralAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  }
] as const;

export type CreateVaultRequestTxInput = {
  collateralToken: Address;
  collateralAmount: string;
  setupDepositAmount: string;
  settlementTimeMs: number;
  metadataURI: string;
  expectedSetter?: Address;
};

export type CreateVaultRequestTxResult = {
  vaultId: number;
  setter: Address;
  txHash: Hash;
  approvalTxHash?: Hash;
  grossCollateralAmount: string;
  setupDepositAmount: string;
  setupDepositDisplay: string;
  collateralDecimals: number;
  feeManagerAddress: Address;
  rewardPoolAddress: Address;
};

export type RuleSetDecisionTxResult = {
  txHash: Hash;
  approvalTxHashes: Hash[];
};

export type ProtocolTreasuryConfig = {
  feeManagerAddress: Address;
  treasuryAddress: Address;
};

function parseHexChainId(value: string): number {
  return Number.parseInt(value, 16);
}

function safeNumberFromBigInt(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER and must be migrated to bigint/string handling.`);
  }

  return Number(value);
}

function isSameAddress(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}

function parseVaultIdFromReceipt(logs: Log[], vaultFactoryAddress: Address): number {
  for (const log of logs) {
    if (log.address.toLowerCase() !== vaultFactoryAddress.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: vaultFactoryAbi,
        data: log.data,
        topics: log.topics as [] | [Hex, ...Hex[]]
      });

      if (decoded.eventName === "VaultRequestCreated") {
        return safeNumberFromBigInt(decoded.args.vaultId, "VaultRequestCreated.vaultId");
      }
    } catch {
      continue;
    }
  }

  throw new Error("VaultRequestCreated event was not found in the transaction receipt.");
}

export async function createVaultRequestOnchain(input: CreateVaultRequestTxInput): Promise<CreateVaultRequestTxResult> {
  const runtime = await resolveProofOfVaultRuntimeConfig();
  const ethereum = requireInjectedEthereumProvider();
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  const setter = accounts[0];
  if (!setter) {
    throw new Error("Wallet connection did not return an account.");
  }

  if (input.expectedSetter && input.expectedSetter.toLowerCase() !== setter.toLowerCase()) {
    throw new Error("Connected wallet changed before submission. Reconnect the setter wallet and try again.");
  }

  const chainId = parseHexChainId((await ethereum.request({ method: "eth_chainId" })) as string);
  if (chainId !== runtime.chainId) {
    throw new Error(`Switch wallet to ${formatNetworkLabel(runtime.chainId)} chainId ${runtime.chainId} before creating a vault.`);
  }

  const runtimeChain = defineChain({
    id: runtime.chainId,
    name: "X Layer",
    nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
    rpcUrls: { default: { http: [runtime.rpcUrl] } },
    blockExplorers: { default: { name: "OKLink", url: runtime.explorerUrl } }
  });

  const publicClient = createPublicClient({
    chain: runtimeChain,
    transport: http(runtime.rpcUrl)
  });
  const walletClient = createWalletClient({
    account: setter,
    chain: runtimeChain,
    transport: custom(ethereum)
  });

  const [feeManagerAddress, rewardPoolAddress, collateralDecimals] = await Promise.all([
    publicClient.readContract({
      address: runtime.vaultFactoryAddress,
      abi: vaultFactoryAbi,
      functionName: "feeManager"
    }),
    publicClient.readContract({
      address: runtime.vaultFactoryAddress,
      abi: vaultFactoryAbi,
      functionName: "rewardPool"
    }),
    publicClient
      .readContract({
        address: input.collateralToken,
        abi: erc20Abi,
        functionName: "decimals"
      })
      .then((value) => Number(value))
  ]);
  const treasuryAddress = await publicClient.readContract({
    address: feeManagerAddress,
    abi: feeManagerAbi,
    functionName: "treasury"
  });

  if (isSameAddress(setter, treasuryAddress)) {
    throw new Error(
      `Connected wallet ${setter} is also the protocol treasury ${treasuryAddress}. Use a different setter wallet before creating a vault request.`
    );
  }

  const minimumSetupDepositAmount = await publicClient.readContract({
    address: feeManagerAddress,
    abi: feeManagerAbi,
    functionName: "previewSetupDeposit"
  });
  const setupDepositAmount = parseUnits(input.setupDepositAmount, 18);
  if (setupDepositAmount < minimumSetupDepositAmount) {
    throw new Error(`Setup deposit must be at least ${formatUnits(minimumSetupDepositAmount, 18)} OKB.`);
  }

  const grossCollateralAmount = parseUnits(input.collateralAmount, collateralDecimals);
  const txHash = await walletClient.writeContract({
    address: runtime.vaultFactoryAddress,
    abi: vaultFactoryAbi,
    functionName: "createVaultRequest",
    args: [
      input.collateralToken,
      grossCollateralAmount,
      BigInt(Math.floor(input.settlementTimeMs / 1000)),
      input.metadataURI
    ],
    value: setupDepositAmount
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Vault request transaction failed.");
  }

  return {
    vaultId: parseVaultIdFromReceipt(receipt.logs, runtime.vaultFactoryAddress),
    setter,
    txHash,
    grossCollateralAmount: grossCollateralAmount.toString(),
    setupDepositAmount: setupDepositAmount.toString(),
    setupDepositDisplay: formatUnits(setupDepositAmount, 18),
    collateralDecimals,
    feeManagerAddress,
    rewardPoolAddress
  };
}

export async function readProtocolTreasuryConfig(): Promise<ProtocolTreasuryConfig> {
  const runtime = await resolveProofOfVaultRuntimeConfig();
  const runtimeChain = defineChain({
    id: runtime.chainId,
    name: "X Layer",
    nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
    rpcUrls: { default: { http: [runtime.rpcUrl] } },
    blockExplorers: { default: { name: "OKLink", url: runtime.explorerUrl } }
  });
  const publicClient = createPublicClient({
    chain: runtimeChain,
    transport: http(runtime.rpcUrl)
  });
  const feeManagerAddress = await publicClient.readContract({
    address: runtime.vaultFactoryAddress,
    abi: vaultFactoryAbi,
    functionName: "feeManager"
  });
  const treasuryAddress = await publicClient.readContract({
    address: feeManagerAddress,
    abi: feeManagerAbi,
    functionName: "treasury"
  });

  return {
    feeManagerAddress,
    treasuryAddress
  };
}

export async function decideRuleSetOnchain(input: {
  vaultId: string | number;
  decision: "accept" | "reject";
  reasonURI?: string;
  expectedSetter?: Address;
}): Promise<RuleSetDecisionTxResult> {
  const runtime = await resolveProofOfVaultRuntimeConfig();
  const ethereum = requireInjectedEthereumProvider();
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  const setter = accounts[0];
  if (!setter) {
    throw new Error("Wallet connection did not return an account.");
  }
  if (input.expectedSetter && input.expectedSetter.toLowerCase() !== setter.toLowerCase()) {
    throw new Error("Connected wallet is not the setter for this vault.");
  }

  const chainId = parseHexChainId((await ethereum.request({ method: "eth_chainId" })) as string);
  if (chainId !== runtime.chainId) {
    throw new Error(
      `Switch wallet to ${formatNetworkLabel(runtime.chainId)} chainId ${runtime.chainId} before deciding the rule set.`
    );
  }

  const runtimeChain = defineChain({
    id: runtime.chainId,
    name: "X Layer",
    nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
    rpcUrls: { default: { http: [runtime.rpcUrl] } },
    blockExplorers: { default: { name: "OKLink", url: runtime.explorerUrl } }
  });
  const publicClient = createPublicClient({ chain: runtimeChain, transport: http(runtime.rpcUrl) });
  const walletClient = createWalletClient({ account: setter, chain: runtimeChain, transport: custom(ethereum) });
  const vaultId = BigInt(input.vaultId);

  if (input.decision === "reject") {
    const txHash = await walletClient.writeContract({
      address: runtime.vaultFactoryAddress,
      abi: vaultFactoryAbi,
      functionName: "rejectRuleSet",
      args: [vaultId, input.reasonURI ?? "ipfs://proof-of-vault/reject-rule-set"]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error("Rule-set rejection transaction failed.");
    }
    return { txHash, approvalTxHashes: [] };
  }

  const [vaultRecord, feeManagerAddress, rewardPoolAddress] = await Promise.all([
    publicClient.readContract({
      address: runtime.vaultFactoryAddress,
      abi: vaultFactoryAbi,
      functionName: "getVault",
      args: [vaultId]
    }),
    publicClient.readContract({
      address: runtime.vaultFactoryAddress,
      abi: vaultFactoryAbi,
      functionName: "feeManager"
    }),
    publicClient.readContract({
      address: runtime.vaultFactoryAddress,
      abi: vaultFactoryAbi,
      functionName: "rewardPool"
    })
  ]);
  const grossCollateralAmount = vaultRecord.grossCollateralAmount;
  const collateralToken = vaultRecord.collateralToken;
  const [resolutionRewardDeposit, creationFee, treasuryAddress, collateralAllowance, stakeAllowance] = await Promise.all([
    publicClient.readContract({
      address: feeManagerAddress,
      abi: feeManagerAbi,
      functionName: "previewResolutionRewardDeposit"
    }),
    publicClient.readContract({
      address: feeManagerAddress,
      abi: feeManagerAbi,
      functionName: "previewCreationFee",
      args: [grossCollateralAmount]
    }),
    publicClient.readContract({
      address: feeManagerAddress,
      abi: feeManagerAbi,
      functionName: "treasury"
    }),
    publicClient.readContract({
      address: collateralToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [setter, runtime.vaultFactoryAddress]
    }),
    publicClient.readContract({
      address: runtime.stakeTokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [setter, rewardPoolAddress]
    })
  ]);

  if (creationFee > BigInt(0) && isSameAddress(setter, treasuryAddress)) {
    throw new Error(
      `Accept + fund is blocked because the connected setter wallet ${setter} is also the protocol treasury ${treasuryAddress}. Ask the protocol owner to call FeeManager.setTreasury(...) with a different address, then retry.`
    );
  }

  const approvalTxHashes: Hash[] = [];
  if (stakeAllowance < resolutionRewardDeposit) {
    const txHash = await walletClient.writeContract({
      address: runtime.stakeTokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [rewardPoolAddress, resolutionRewardDeposit]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error("Resolution reward deposit approval failed.");
    }
    approvalTxHashes.push(txHash);
  }

  if (collateralAllowance < grossCollateralAmount) {
    const txHash = await walletClient.writeContract({
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [runtime.vaultFactoryAddress, grossCollateralAmount]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error("Collateral approval failed.");
    }
    approvalTxHashes.push(txHash);
  }

  const txHash = await walletClient.writeContract({
    address: runtime.vaultFactoryAddress,
    abi: vaultFactoryAbi,
    functionName: "acceptRuleSetAndFund",
    args: [vaultId]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Rule-set acceptance and funding transaction failed.");
  }

  return { txHash, approvalTxHashes };
}
