import { prisma } from "../../config/prisma.js";

export const dashboardRepository = {
  findUserDashboard(walletAddress: string) {
    return prisma.user.findUnique({
      where: { walletAddress },
      include: { packages: true, upline: { select: { referralCode: true } } },
    });
  },

  earningsByType(recipientId: string) {
    return prisma.earning.groupBy({ by: ["type"], where: { recipientId }, _sum: { amountUsd: true } });
  },

  earningsByLevel(recipientId: string) {
    return prisma.earning.groupBy({
      by: ["level"], where: { recipientId, type: "LEVEL_COMMISSION" }, _sum: { amountUsd: true }, _count: { _all: true },
    });
  },

  recentEarnings(recipientId: string) {
    return prisma.earning.findMany({
      where: { recipientId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { type: true, level: true, amountUsd: true, createdAt: true, source: { select: { walletAddress: true } } },
    });
  },

  /** each direct's leg volume (their own package + everything below them) */
  directLegs(userId: string) {
    return prisma.user.findMany({
      where: { uplineId: userId },
      select: { teamVolume: true, _count: { select: { packages: true } } },
    });
  },

  /** members at each of the first 20 levels below the user */
  async membersPerLevel(userId: string) {
    const rows = await prisma.$queryRaw<Array<{ depth: number; members: bigint }>>`
      WITH RECURSIVE tree(id, depth) AS (
        SELECT id, 1 FROM users WHERE upline_id = ${userId}::uuid
        UNION ALL
        SELECT u.id, t.depth + 1 FROM users u JOIN tree t ON u.upline_id = t.id WHERE t.depth < 20
      )
      SELECT depth, COUNT(*)::bigint AS members FROM tree GROUP BY depth`;
    return new Map(rows.map((r) => [Number(r.depth), Number(r.members)]));
  },
};
