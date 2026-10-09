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

  /**
   * The members exactly `level` generations below the user (1 = directs), oldest first:
   * DV code, wallet, who sponsored them and when they activated. Everyone in the tree is
   * activated (an upline is only set at activation).
   */
  async membersAtLevel(userId: string, level: number, limit: number, offset: number) {
    const rows = await prisma.$queryRaw<Array<{ referral_code: string; wallet_address: string; sponsor_code: string | null; joined_at: Date | null; total: bigint }>>`
      WITH RECURSIVE tree(id, depth) AS (
        SELECT id, 1 FROM users WHERE upline_id = ${userId}::uuid
        UNION ALL
        SELECT u.id, t.depth + 1 FROM users u JOIN tree t ON u.upline_id = t.id WHERE t.depth < ${level}
      )
      SELECT u.referral_code, u.wallet_address, s.referral_code AS sponsor_code,
             (SELECT MIN(p.created_at) FROM packages p WHERE p.user_id = u.id) AS joined_at,
             COUNT(*) OVER () AS total
        FROM tree t
        JOIN users u ON u.id = t.id
        LEFT JOIN users s ON s.id = u.upline_id
       WHERE t.depth = ${level}
       ORDER BY joined_at ASC NULLS LAST, u.referral_code
       LIMIT ${limit} OFFSET ${offset}`;
    return { total: rows.length ? Number(rows[0].total) : 0, rows };
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
