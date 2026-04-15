import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { ValidationError } from "../lib/errors.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type AgentSessionPayload = {
  walletAddress: `0x${string}`;
  chainId: number;
  issuedAt: number;
  expiresAt: number;
};

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

export class AgentSessionService {
  private readonly secret: Buffer;

  constructor(secret?: string) {
    this.secret = secret ? Buffer.from(secret, "utf8") : randomBytes(32);
  }

  issue(walletAddress: string, chainId: number): { token: string; expiresAt: number } {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + SESSION_TTL_MS;
    const payload: AgentSessionPayload = {
      walletAddress: normalizeAddress(walletAddress),
      chainId,
      issuedAt,
      expiresAt
    };
    const payloadSegment = toBase64Url(JSON.stringify(payload));
    const signatureSegment = this.sign(payloadSegment);

    return {
      token: `${payloadSegment}.${signatureSegment}`,
      expiresAt
    };
  }

  verify(token: string, expectedWalletAddress: string): AgentSessionPayload {
    const [payloadSegment, signatureSegment] = token.split(".");
    if (!payloadSegment || !signatureSegment) {
      throw new ValidationError("Agent session token is malformed.");
    }

    const expectedSignature = this.sign(payloadSegment);
    const provided = Buffer.from(signatureSegment, "base64url");
    const expected = Buffer.from(expectedSignature, "base64url");

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new ValidationError("Agent session token signature is invalid.");
    }

    const payload = JSON.parse(fromBase64Url(payloadSegment)) as AgentSessionPayload;
    if (payload.expiresAt <= Date.now()) {
      throw new ValidationError("Agent session token has expired.");
    }

    if (normalizeAddress(payload.walletAddress) !== normalizeAddress(expectedWalletAddress)) {
      throw new ValidationError("Agent session token does not match the requested wallet address.");
    }

    return payload;
  }

  private sign(payloadSegment: string): string {
    return createHmac("sha256", this.secret).update(payloadSegment).digest("base64url");
  }
}
