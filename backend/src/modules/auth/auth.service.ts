import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { getAddress, verifyMessage } from "ethers";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";

const NONCE_TTL_MS = 5 * 60_000;

export type AuthClaims = { sub: string; role: "member" | "admin" };

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

export const isAdminWallet = (wallet: string) => env.ADMIN_WALLETS.includes(wallet.toLowerCase());

export class AuthService {
  /** One-time message for the wallet to sign. Replaces any earlier unused challenge. */
  async createChallenge(walletInput: string) {
    const walletAddress = getAddress(walletInput).toLowerCase();
    const issuedAt = new Date();
    const message = [
      "DAOvault sign-in",
      "",
      `Wallet: ${walletAddress}`,
      `Nonce: ${randomBytes(16).toString("hex")}`,
      `Issued at: ${issuedAt.toISOString()}`,
      "",
      "Signing proves you own this wallet. It costs no gas and approves no transaction.",
    ].join("\n");
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
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
    const token = jwt.sign({ role } satisfies Omit<AuthClaims, "sub">, env.JWT_SECRET, {
      subject: walletAddress, expiresIn: expiresInSec, algorithm: "HS256",
    });
    return { token, role, walletAddress, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
  }

  verifyToken(token: string): AuthClaims {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (typeof decoded.sub !== "string" || (decoded.role !== "member" && decoded.role !== "admin")) {
      throw httpError("Invalid session.", 401);
    }
    return { sub: decoded.sub, role: decoded.role };
  }
}

export const authService = new AuthService();
