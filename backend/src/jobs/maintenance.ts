import { prisma } from "../config/prisma.js";
import { cleanupNotifications } from "../modules/notifications/notifications.service.js";

/** Background worker, daily: expired sign-in nonces and refresh tokens are of no use any more. */
/** ... and old notifications (read ones after 30 days, any after 90; owner 2026-10-19). */
export async function cleanupAuthTables(): Promise<{
  nonces: number;
  refreshTokens: number;
  notifications: number;
}> {
  const now = new Date();
  const [nonces, refreshTokens] = await prisma.$transaction([
    prisma.authNonce.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  const notifications = await cleanupNotifications();
  return { nonces: nonces.count, refreshTokens: refreshTokens.count, notifications };
}
