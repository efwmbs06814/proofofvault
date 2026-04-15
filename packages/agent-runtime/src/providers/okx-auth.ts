import { createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";

export type OkxAuthRequest = {
  endpoint: string;
  accessKey: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  secretKey?: string;
  passphrase?: string;
};

type OkxMcpRequestInput = {
  endpoint: string;
  accessKey: string;
  secretKey?: string;
  passphrase?: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
};

type OkxMcpTextContent = {
  type?: string;
  text?: string;
};

type TransportFamilyPreference = 4 | 6 | undefined;

function requestPathFromEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.pathname}${url.search}`;
}

function stringifyBody(body: Record<string, unknown> | undefined): string {
  if (!body) {
    return "";
  }

  return JSON.stringify(body);
}

function ensureCredentialPair(secretKey?: string, passphrase?: string): void {
  if ((secretKey && !passphrase) || (!secretKey && passphrase)) {
    throw new Error(
      "OKX signed authentication requires both secretKey and passphrase. Set PROOF_OF_VAULT_OKX_SECRET_KEY and PROOF_OF_VAULT_OKX_PASSPHRASE together."
    );
  }
}

export function buildOkxAuthHeaders(request: OkxAuthRequest): Record<string, string> {
  ensureCredentialPair(request.secretKey, request.passphrase);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "OK-ACCESS-KEY": request.accessKey
  };

  if (!request.secretKey || !request.passphrase) {
    return headers;
  }

  const timestamp = new Date().toISOString();
  const method = (request.method ?? "POST").toUpperCase();
  const body = stringifyBody(request.body);
  const preHash = `${timestamp}${method}${requestPathFromEndpoint(request.endpoint)}${body}`;
  const signature = createHmac("sha256", request.secretKey).update(preHash).digest("base64");

  return {
    ...headers,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": request.passphrase,
    "OK-ACCESS-SIGN": signature
  };
}

function transportForProtocol(protocol: string): typeof http | typeof https {
  if (protocol === "http:") {
    return http;
  }

  if (protocol === "https:") {
    return https;
  }

  throw new Error(`Unsupported OKX endpoint protocol: ${protocol}`);
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.toLowerCase().includes("timed out") ||
    // Node/undici style timeout code interop.
    (error as NodeJS.ErrnoException).code === "ETIMEDOUT"
  );
}

async function postOkxJsonOnce(
  request: OkxAuthRequest,
  family: TransportFamilyPreference
): Promise<unknown> {
  const body = stringifyBody(request.body);
  const url = new URL(request.endpoint);
  const headers = buildOkxAuthHeaders(request);
  const transport = transportForProtocol(url.protocol);

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: request.method ?? "POST",
        headers: {
          ...headers,
          "content-length": Buffer.byteLength(body).toString()
        },
        family,
        timeout: 30_000
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            const suffix = raw.length > 0 ? ` Body: ${raw}` : "";
            reject(new Error(`OKX request failed with status ${statusCode}.${suffix}`));
            return;
          }

          try {
            resolve(raw.length > 0 ? JSON.parse(raw) : {});
          } catch (error) {
            reject(
              error instanceof Error ? error : new Error("OKX response was not valid JSON.")
            );
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("OKX request timed out."));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function postOkxJson(request: OkxAuthRequest): Promise<unknown> {
  try {
    return await postOkxJsonOnce(request, undefined);
  } catch (error) {
    if (!isTimeoutError(error)) {
      throw error;
    }

    return postOkxJsonOnce(request, 4);
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export async function postOkxMcpJson(request: OkxMcpRequestInput): Promise<Record<string, unknown>> {
  const response = await postOkxJson({
    endpoint: request.endpoint,
    accessKey: request.accessKey,
    secretKey: request.secretKey,
    passphrase: request.passphrase,
    body: {
      jsonrpc: "2.0",
      id: request.id ?? 1,
      method: request.method,
      params: request.params ?? {}
    }
  });
  const record = readRecord(response);
  const error = readRecord(record?.error);
  if (error) {
    throw new Error(
      `OKX MCP ${request.method} failed with code ${String(error.code ?? "unknown")}: ${String(error.message ?? "Unknown error")}`
    );
  }
  if (!record) {
    throw new Error(`OKX MCP ${request.method} returned a non-object response.`);
  }

  return record;
}

export async function initializeOkxMcpSession(request: Omit<OkxMcpRequestInput, "method" | "params">): Promise<void> {
  await postOkxMcpJson({
    ...request,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "proof-of-vault",
        version: "1.0.0"
      }
    }
  });
}

export async function listOkxMcpTools(request: Omit<OkxMcpRequestInput, "method" | "params">): Promise<unknown[]> {
  await initializeOkxMcpSession(request);
  const response = await postOkxMcpJson({
    ...request,
    id: 2,
    method: "tools/list",
    params: {}
  });
  const result = readRecord(response.result);
  const tools = result?.tools;
  return Array.isArray(tools) ? tools : [];
}

export async function callOkxMcpTool(
  request: Omit<OkxMcpRequestInput, "method" | "params"> & {
    toolName: string;
    arguments?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  await initializeOkxMcpSession(request);
  const response = await postOkxMcpJson({
    ...request,
    id: 3,
    method: "tools/call",
    params: {
      name: request.toolName,
      arguments: request.arguments ?? {}
    }
  });
  const result = readRecord(response.result);
  if (!result) {
    throw new Error(`OKX MCP tools/call for ${request.toolName} returned no result.`);
  }

  return result;
}

export function parseOkxMcpJsonContent(result: unknown): Record<string, unknown> {
  const record = readRecord(result);
  const content = Array.isArray(record?.content) ? (record.content as OkxMcpTextContent[]) : [];
  const textEntry = content.find((entry) => typeof entry?.text === "string");
  if (!textEntry?.text) {
    throw new Error("OKX MCP result did not include text content.");
  }

  try {
    const parsed = JSON.parse(textEntry.text) as unknown;
    const parsedRecord = readRecord(parsed);
    if (!parsedRecord) {
      throw new Error("Parsed content was not an object.");
    }

    return parsedRecord;
  } catch (error) {
    throw new Error(
      error instanceof Error ? `Failed to parse OKX MCP text content: ${error.message}` : "Failed to parse OKX MCP text content."
    );
  }
}
