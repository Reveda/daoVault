/**
 * Who signs the payout vouchers (owner, 2026-10-13: Docker signer on mainnet).
 *  - PAYOUT_SIGNER_URL set: the separate signer service (src/signer/server.ts, Docker service `signer`
 *    on the internal network). The key never enters the API process; each request carries
 *    PAYOUT_SIGNER_TOKEN, and the signer applies its own limits.
 *  - otherwise PAYOUT_SIGNER_TESTNET_KEY (BSC Testnet only; env.ts refuses it on mainnet).
 */
import { Wallet, type TypedDataDomain } from "ethers";
import { env } from "../../config/env.js";

export const CLAIM_TYPES = {
  Claim: [
    { name: "member", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "id", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};
export type ClaimValue = { member: string; amount: bigint; id: string; deadline: number };

export const signerConfigured = () =>
  Boolean(env.PAYOUT_SIGNER_URL || env.PAYOUT_SIGNER_TESTNET_KEY);

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(new URL(path, env.PAYOUT_SIGNER_URL), {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.PAYOUT_SIGNER_TOKEN ?? ""}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(`signer ${path}: ${res.status} ${json.error ?? ""}`.trim());
  return json;
}

let remoteAddress: string | null = null;
/** The signer's wallet address (must equal the payout contract's signer()). */
export async function signerAddress(): Promise<string> {
  if (env.PAYOUT_SIGNER_URL)
    return (remoteAddress ??= (await call<{ address: string }>("/address")).address);
  return new Wallet(env.PAYOUT_SIGNER_TESTNET_KEY!).address;
}

export async function signClaim(domain: TypedDataDomain, value: ClaimValue): Promise<string> {
  if (env.PAYOUT_SIGNER_URL) {
    const { signature } = await call<{ signature: string }>("/sign", {
      member: value.member,
      amount: value.amount.toString(),
      id: value.id,
      deadline: value.deadline,
    });
    return signature;
  }
  return new Wallet(env.PAYOUT_SIGNER_TESTNET_KEY!).signTypedData(domain, CLAIM_TYPES, value);
}
