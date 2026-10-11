import { prisma } from "../config/prisma.js";

/** Background worker, daily: expired sign-in nonces and refresh tokens are of no use any more. */
export async function cleanupAuthTables(): Promise<{ nonces: number; refreshTokens: number }> {
  const now = new Date();
  const [nonces, refreshTokens] = await prisma.$transaction([
    prisma.authNonce.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { nonces: nonces.count, refreshTokens: refreshTokens.count };
}
