export type PayloadUploadMessageInput = {
  walletAddress: string;
  payloadHash: string;
  vaultId?: string;
  kind?: string;
};

export function buildPayloadUploadMessage(input: PayloadUploadMessageInput): string {
  return [
    "Proof of Vault payload upload",
    `wallet:${input.walletAddress.toLowerCase()}`,
    `payloadHash:${input.payloadHash}`,
    `vaultId:${input.vaultId ?? "none"}`,
    `kind:${input.kind ?? "generic"}`
  ].join("\n");
}
