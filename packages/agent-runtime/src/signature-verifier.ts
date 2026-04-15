import { getAddress, verifyMessage, type Hex } from "viem";

export async function verifyWalletSignature(input: {
  walletAddress: `0x${string}`;
  message: string;
  signature: `0x${string}`;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: getAddress(input.walletAddress),
      message: input.message,
      signature: input.signature as Hex
    });
  } catch {
    return false;
  }
}

export function addressesEqual(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
