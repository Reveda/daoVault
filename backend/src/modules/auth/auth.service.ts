import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { getAddress, verifyMessage } from "ethers";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";

const NONCE_TTL_MS = 5 * 60_000;

export type AuthClaims = { sub: string; role: "member" | "admin" };

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

export const isAdminWallet = (wallet: string) => env.ADMIN_WALLETS.includes(wallet.toLowerCase());

const FRONTEND_ORIGINS = env.FRONTEND_URL.split(",").map((o) => o.trim()).filter(Boolean);
const isLocalOrigin = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

/**
 * The site the member is signing in to, for the SIWE message. Taken from the browser's Origin
 * header only when it is one of our own frontends (FRONTEND_URL, or localhost in development),
 * so a phishing site can never get our server to issue a message naming its own domain.
 */
function signInOrigin(requestOrigin?: string): string {
  if (requestOrigin && (FRONTEND_ORIGINS.includes(requestOrigin) || (env.NODE_ENV === "development" && isLocalOrigin(requestOrigin)))) {
    return requestOrigin;
  }
  return FRONTEND_ORIGINS[0] ?? "http://localhost:3000";
}

/** Current session version of a wallet (0 until it first logs out of all devices). */
async function sessionVersion(walletAddress: string): Promise<number> {
  const row = await prisma.authSession.findUnique({ where: { walletAddress } });
  return row?.version ?? 0;
}

export class AuthService {
  /**
   * One-time EIP-4361 (Sign-In with Ethereum) message for the wallet to sign. Wallets that
   * support SIWE check the domain line against the site asking for the signature and warn
   * the member on a mismatch (phishing). Replaces any earlier unused challenge.
   */
  async createChallenge(walletInput: string, requestOrigin?: string) {
    const checksummed = getAddress(walletInput);
    const walletAddress = checksummed.toLowerCase();
    const origin = signInOrigin(requestOrigin);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
    const message = [
      `${new URL(origin).host} wants you to sign in with your Ethereum account:`,
      checksummed,
      "",
      "Sign in to DAOvault. This proves you own this wallet. It costs no gas and approves no transaction.",
      "",
      `URI: ${origin}`,
      "Version: 1",
      `Chain ID: ${env.BSC_CHAIN_ID}`,
      `Nonce: ${randomBytes(16).toString("hex")}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expiration Time: ${expiresAt.toISOString()}`,
    ].join("\n");
    await prisma.authNonce.upsert({
      where: { walletAddress },
      update: { message, expiresAt },
      create: { walletAddress, message, expiresAt },
    });
    return { message, expiresAt };
  }

  /** Checks the signature against the stored challenge (single use) and issues a JWT. */
  async verifySignature(walletInput: string, signature: string) {
    const walletAddress = getAddress(walletInput).toLowerCase();
    // delete first so a challenge can never be used twice, even by parallel requests
    const challenge = await prisma.authNonce.delete({ where: { walletAddress } }).catch(() => null);
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      throw httpError("Sign-in request expired. Please try again.", 401);
    }
    let signer: string;
    try {
      signer = verifyMessage(challenge.message, signature).toLowerCase();
    } catch {
      throw httpError("Invalid signature.", 401);
    }
    if (signer !== walletAddress) throw httpError("Signature does not match this wallet.", 401);

    const role: AuthClaims["role"] = isAdminWallet(walletAddress) ? "admin" : "member";
    const expiresInSec = Math.round(env.JWT_EXPIRES_HOURS * 3600);
    const token = jwt.sign({ role, ver: await sessionVersion(walletAddress) }, env.JWT_SECRET, {
      subject: walletAddress, expiresIn: expiresInSec, algorithm: "HS256",
    });
    return { token, role, walletAddress, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
  }

  /** Valid signature + not expired + not voided by "log out all devices". */
  async verifyToken(token: string): Promise<AuthClaims> {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (typeof decoded.sub !== "string" || (decoded.role !== "member" && decoded.role !== "admin")) {
      throw httpError("Invalid session.", 401);
    }
    if ((typeof decoded.ver === "number" ? decoded.ver : 0) !== (await sessionVersion(decoded.sub))) {
      throw httpError("Session ended. Sign in again.", 401);
    }
    return { sub: decoded.sub, role: decoded.role };
  }

  /** "Log out all devices": every token issued so far for this wallet stops working at once. */
  async revokeAllSessions(walletAddress: string) {
    await prisma.authSession.upsert({
      where: { walletAddress },
      update: { version: { increment: 1 } },
      create: { walletAddress, version: 1 },
    });
  }
}

export const authService = new AuthService();
