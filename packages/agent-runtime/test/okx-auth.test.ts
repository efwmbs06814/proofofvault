import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOkxAuthHeaders } from "../src/providers/okx-auth.js";

describe("OKX auth headers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns access-key-only headers when secret credentials are not configured", () => {
    expect(
      buildOkxAuthHeaders({
        endpoint: "https://web3.okx.com/api/v1/onchainos-mcp",
        accessKey: "demo-access-key",
        body: { hello: "vault" }
      })
    ).toEqual({
      "content-type": "application/json",
      "OK-ACCESS-KEY": "demo-access-key"
    });
  });

  it("builds signed headers with passphrase and HMAC signature when secret credentials are configured", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:34:56.000Z"));

    const body = {
      service: "proof-of-vault",
      action: "collectSnapshots"
    };
    const expectedTimestamp = "2026-04-13T12:34:56.000Z";
    const expectedBody = JSON.stringify(body);
    const expectedSignature = createHmac(
      "sha256",
      "demo-secret-key"
    )
      .update(`${expectedTimestamp}POST/api/v1/onchainos-mcp${expectedBody}`)
      .digest("base64");

    expect(
      buildOkxAuthHeaders({
        endpoint: "https://web3.okx.com/api/v1/onchainos-mcp",
        accessKey: "demo-access-key",
        secretKey: "demo-secret-key",
        passphrase: "demo-passphrase",
        body
      })
    ).toEqual({
      "content-type": "application/json",
      "OK-ACCESS-KEY": "demo-access-key",
      "OK-ACCESS-TIMESTAMP": expectedTimestamp,
      "OK-ACCESS-PASSPHRASE": "demo-passphrase",
      "OK-ACCESS-SIGN": expectedSignature
    });
  });
});
