import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { getAddress, verifyMessage } from "ethers";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { serializable } from "../../config/transaction.js";
import { alert, shortWallet } from "../../config/alerts.js";

const NONCE_TTL_MS = 5 * 60_000;
/** two tabs refreshing at the same moment send the same token: not a theft */
const REUSE_GRACE_MS = 30_000;

export type AuthClaims = { sub: string; role: "member" | "admin" };
export type AccessSession = {
  token: string;
  role: AuthClaims["role"];
  walletAddress: string;
  expiresAt: Date;
};
export type RefreshCookie = { value: string; expiresAt: Date };

const httpError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { statusCode });
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const isAdminWallet = (wallet: string) => env.ADMIN_WALLETS.includes(wallet.toLowerCase());

const FRONTEND_ORIGINS = env.FRONTEND_URL.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const isLocalOrigin = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

/**
 * The site the member is signing in to, for the SIWE message. Taken from the browser's Origin
 * header only when it is one of our own frontends (FRONTEND_URL, or localhost in development),
 * so a phishing site can never get our server to issue a message naming its own domain.
 */
function signInOrigin(requestOrigin?: string): string {
  if (
    requestOrigin &&
    (FRONTEND_ORIGINS.includes(requestOrigin) ||
      (env.NODE_ENV === "development" && isLocalOrigin(requestOrigin)))
  ) {
    return requestOrigin;
  }
  return FRONTEND_ORIGINS[0] ?? "http://localhost:3000";
}

/** Current session version of a wallet: bumped when its refresh token was stolen. */
async function sessionVersion(walletAddress: string): Promise<number> {
  const row = await prisma.authSession.findUnique({ where: { walletAddress } });
  return row?.version ?? 0;
}

type Tx = Prisma.TransactionClient;

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

  /** Checks the signature against the stored challenge (single use): access token + refresh cookie. */
  async verifySignature(
    walletInput: string,
    signature: string,
  ): Promise<{ access: AccessSession; refresh: RefreshCookie }> {
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
    // security: the owner hears about every admin sign-in (a stranger signing in as admin = act at once)
    if (isAdminWallet(walletAddress))
      alert(
        "info",
        `admin-signin-${walletAddress}`,
        `Admin wallet ${shortWallet(walletAddress)} signed in.`,
      );
    return {
      access: await this.issueAccess(walletAddress),
      refresh: await this.issueRefresh(walletAddress, randomUUID()),
    };
  }

  /** Short-lived access token (the browser keeps it in memory only). Role is re-read each time. */
  private async issueAccess(walletAddress: string, version?: number): Promise<AccessSession> {
    const role: AuthClaims["role"] = isAdminWallet(walletAddress) ? "admin" : "member";
    const expiresInSec = env.ACCESS_TOKEN_MINUTES * 60;
    const token = jwt.sign({ role, ver: version ?? (await sessionVersion(walletAddress)) }, env.JWT_SECRET, {
      subject: walletAddress,
      expiresIn: expiresInSec,
      algorithm: "HS256",
    });
    return { token, role, walletAddress, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
  }

  /** New refresh token in a family; only its hash is stored. Old expired rows of the wallet are swept. */
  private async issueRefresh(walletAddress: string, familyId: string): Promise<RefreshCookie> {
    return prisma.$transaction((tx) => this.issueRefreshInTx(tx, walletAddress, familyId));
  }

  /**
   * Creates the replacement refresh token inside the SAME transaction that claimed the old one.
   * This is essential: if logout/theft-revoke deletes a family while a refresh is in flight, the
   * database serializes one operation and the loser retries against the new state. A late request
   * can therefore never recreate a family after it was revoked.
   */
  private async issueRefreshInTx(tx: Tx, walletAddress: string, familyId: string): Promise<RefreshCookie> {
    const value = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
    await tx.refreshToken.deleteMany({ where: { walletAddress, expiresAt: { lt: new Date() } } });
    await tx.refreshToken.create({
      data: { walletAddress, tokenHash: sha256(value), familyId, expiresAt },
    });
    return { value, expiresAt };
  }

  /**
   * Refresh: a valid unused cookie token is rotated (marked used, a new one issued in the same
   * family) and a new access token returned. A used token within the grace window (parallel
   * tabs) only gets an access token. A used token after that was copied: every session of the
   * wallet ends (refresh tokens deleted, access tokens voided by the version bump).
   */
  async refresh(
    cookieValue: string | undefined,
  ): Promise<{ access: AccessSession; refresh: RefreshCookie | null }> {
    if (!cookieValue) throw httpError("Not signed in.", 401);
    const tokenHash = sha256(cookieValue);
    const outcome = await serializable(async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!row || row.expiresAt.getTime() < Date.now())
        return { kind: "expired" as const };

      // Claim plus replacement creation live in this serializable transaction. Do not move the
      // replacement write after commit: that was the logout/revoke race.
      const claimed = row.usedAt
        ? 0
        : (
            await tx.refreshToken.updateMany({
              where: { id: row.id, usedAt: null },
              data: { usedAt: new Date() },
            })
          ).count;
      const version = (await tx.authSession.findUnique({ where: { walletAddress: row.walletAddress } }))?.version ?? 0;
      if (claimed === 1) {
        return {
          kind: "rotated" as const,
          access: await this.issueAccess(row.walletAddress, version),
          refresh: await this.issueRefreshInTx(tx, row.walletAddress, row.familyId),
        };
      }
      const fresh = await tx.refreshToken.findUnique({ where: { id: row.id } });
      if (fresh?.usedAt && Date.now() - fresh.usedAt.getTime() < REUSE_GRACE_MS) {
        return {
          kind: "grace" as const,
          access: await this.issueAccess(row.walletAddress, version),
          refresh: null,
        };
      }
      await this.revokeAllSessionsInTx(tx, row.walletAddress);
      return { kind: "theft" as const, walletAddress: row.walletAddress };
    });

    if (outcome.kind === "rotated" || outcome.kind === "grace") return outcome;
    if (outcome.kind === "expired") throw httpError("Session expired. Sign in again.", 401);

    const walletAddress = outcome.walletAddress;
    alert(
      isAdminWallet(walletAddress) ? "critical" : "warning",
      `session-theft-${walletAddress}`,
      `A copied sign-in token was used for ${shortWallet(walletAddress)}${isAdminWallet(walletAddress) ? " (ADMIN)" : ""}: every session of that wallet was ended.`,
    );
    throw httpError("Session ended for safety. Sign in again.", 401);
  }

  /** Log out this device: its refresh token family is deleted. */
  async logout(cookieValue: string | undefined) {
    if (!cookieValue) return;
    const tokenHash = sha256(cookieValue);
    await serializable(async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (row) await tx.refreshToken.deleteMany({ where: { familyId: row.familyId } });
    });
  }

  /** Valid signature + not expired + not voided by a stolen-token alarm. */
  async verifyToken(token: string): Promise<AuthClaims> {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (
      typeof decoded.sub !== "string" ||
      (decoded.role !== "member" && decoded.role !== "admin")
    ) {
      throw httpError("Invalid session.", 401);
    }
    if (
      (typeof decoded.ver === "number" ? decoded.ver : 0) !== (await sessionVersion(decoded.sub))
    ) {
      throw httpError("Session ended. Sign in again.", 401);
    }
    return { sub: decoded.sub, role: decoded.role };
  }

  /**
   * Admin page gate (owner, 2026-10-11): admin.html and its script exist only for admin wallets.
   * Nginx asks GET /auth/admin-gate before serving them; the browser proves it with this signed
   * cookie, given to admin wallets whenever they get an access token. It opens only the page:
   * every admin API call still needs the access token. It has no `role`, so it is never
   * accepted as an access token, and a stolen-token alarm (version bump) voids it too.
   */
  async issueAdminGate(walletAddress: string): Promise<RefreshCookie | null> {
    if (!isAdminWallet(walletAddress)) return null;
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
    const value = jwt.sign(
      { typ: "admin-gate", ver: await sessionVersion(walletAddress) },
      env.JWT_SECRET,
      {
        subject: walletAddress,
        expiresIn: env.REFRESH_TOKEN_DAYS * 86_400,
        algorithm: "HS256",
      },
    );
    return { value, expiresAt };
  }

  async checkAdminGate(value: string | undefined): Promise<boolean> {
    if (!value) return false;
    try {
      const decoded = jwt.verify(value, env.JWT_SECRET, {
        algorithms: ["HS256"],
      }) as jwt.JwtPayload;
      return (
        decoded.typ === "admin-gate" &&
        typeof decoded.sub === "string" &&
        isAdminWallet(decoded.sub) &&
        (typeof decoded.ver === "number" ? decoded.ver : 0) === (await sessionVersion(decoded.sub))
      );
    } catch {
      return false;
    }
  }

  /** Ends every session of a wallet: refresh tokens deleted, access tokens voided. */
  async revokeAllSessions(walletAddress: string) {
    await serializable((tx) => this.revokeAllSessionsInTx(tx, walletAddress));
  }

  private async revokeAllSessionsInTx(tx: Tx, walletAddress: string) {
    await tx.refreshToken.deleteMany({ where: { walletAddress } });
    await tx.authSession.upsert({
      where: { walletAddress },
      update: { version: { increment: 1 } },
      create: { walletAddress, version: 1 },
    });
  }
}

export const authService = new AuthService();
