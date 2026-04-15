import type { AgentLoginChallenge, AgentLoginResponse } from "@proof-of-vault/shared-types";

import { post, type ApiResponse } from "./client";
import { requireInjectedEthereumProvider } from "@/lib/wallet/injected";

const SESSION_STORAGE_KEY = "proof-of-vault.agent-session";
const XLAYER_CHAIN_ID = 196;

type StoredAgentSession = {
  walletAddress: string;
  sessionToken: string;
  sessionExpiresAt: number;
};

function toHexMessage(value: string): `0x${string}` {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function loadStoredSession(): StoredAgentSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredAgentSession;
  } catch {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function saveStoredSession(session: StoredAgentSession): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function signLoginChallenge(walletAddress: string, message: string): Promise<`0x${string}`> {
  const ethereum = requireInjectedEthereumProvider();

  try {
    return (await ethereum.request({
      method: "personal_sign",
      params: [message, walletAddress]
    })) as `0x${string}`;
  } catch {
    return (await ethereum.request({
      method: "personal_sign",
      params: [toHexMessage(message), walletAddress]
    })) as `0x${string}`;
  }
}

export async function ensureAgentSession(walletAddress: string): Promise<string> {
  const normalizedWalletAddress = walletAddress.toLowerCase();
  const storedSession = loadStoredSession();
  if (
    storedSession &&
    storedSession.walletAddress.toLowerCase() === normalizedWalletAddress &&
    storedSession.sessionExpiresAt > Date.now() + 60_000
  ) {
    return storedSession.sessionToken;
  }

  const challengeResponse = await post<ApiResponse<AgentLoginChallenge>>("/agent-registrations/login-challenge", {
    walletAddress,
    chainId: XLAYER_CHAIN_ID
  });
  if (!challengeResponse.success || !challengeResponse.data) {
    throw new Error(challengeResponse.error?.message || "Failed to create agent login challenge.");
  }

  const signature = await signLoginChallenge(walletAddress, challengeResponse.data.message);
  const loginResponse = await post<ApiResponse<AgentLoginResponse>>("/agent-registrations/login", {
    walletAddress,
    chainId: XLAYER_CHAIN_ID,
    nonce: challengeResponse.data.nonce,
    signature
  });

  if (!loginResponse.success || !loginResponse.data) {
    throw new Error(loginResponse.error?.message || "Failed to verify agent login signature.");
  }

  const session = {
    walletAddress,
    sessionToken: loginResponse.data.sessionToken,
    sessionExpiresAt: loginResponse.data.sessionExpiresAt
  };
  saveStoredSession(session);
  return session.sessionToken;
}
