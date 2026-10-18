import { prisma } from "../../config/prisma.js";
import { cached } from "../../config/cache.js";

/** member counts walk the whole team: cached for a short while (config/cache.ts) */
const COUNT_CACHE_SECONDS = 120;

export const dashboardRepository = {
  findUserDashboard(walletAddress: string) {
    return prisma.user.findUnique({
      where: { walletAddress },
      include: {
        packages: { orderBy: { createdAt: "asc" } },
        powerBusinesses: { orderBy: { createdAt: "desc" } },
        upline: { select: { referralCode: true } },
        placement: { select: { referralCode: true } },
      },
    });
  },

  earningsByType(recipientId: string) {
    return prisma.earning.groupBy({
      by: ["type"],
      where: { recipientId },
      _sum: { amountUsd: true },
    });
  },

  earningsByLevel(recipientId: string) {
    return prisma.earning.groupBy({
      by: ["level"],
      where: { recipientId, type: "LEVEL_COMMISSION" },
      _sum: { amountUsd: true },
      _count: { _all: true },
    });
  },

  recentEarnings(recipientId: string) {
    return prisma.earning.findMany({
      where: { recipientId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        type: true,
        level: true,
        amountUsd: true,
        createdAt: true,
        source: { select: { walletAddress: true } },
      },
    });
  },

  /** when each paid direct (sponsor tree) activated: its first counted package (fast-start bonus progress) */
  async directActivations(userId: string) {
    const rows = await prisma.$queryRaw<Array<{ at: Date }>>`
      SELECT MIN(COALESCE(p.paid_at, p.created_at)) AS at FROM users d
        JOIN packages p ON p.user_id = d.id AND p.counted_at IS NOT NULL
       WHERE d.upline_id = ${userId}::uuid
       GROUP BY d.id`;
    return rows.map((r) => r.at.getTime());
  },

  /**
   * members on the member's LEFT and RIGHT side of the placement tree (everyone placed below, all
   * depths, paid or not)
   */
  async membersPerSide(userId: string) {
    const rows = await cached(
      `sides:${userId}`,
      COUNT_CACHE_SECONDS,
      () => prisma.$queryRaw<Array<{ side: string; members: number }>>`
      WITH RECURSIVE tree(id, side) AS (
        SELECT id, placement_side FROM users WHERE placement_id = ${userId}::uuid
        UNION ALL
        SELECT u.id, t.side FROM users u JOIN tree t ON u.placement_id = t.id
      )
      SELECT side::text AS side, COUNT(*)::int AS members FROM tree GROUP BY side`,
    );
    const of = (side: string) => Number(rows.find((r) => r.side === side)?.members ?? 0);
    return { left: of("LEFT"), right: of("RIGHT") };
  },

  /**
   * The members exactly `level` generations below the user in the SPONSOR tree (1 = directs), oldest
   * first: DV code, wallet, official rank + Left / Right business, who sponsored them, where they are
   * placed, and when they activated (null = registered, not paid yet: invite links build the tree
   * before payment, owner 2026-10-13).
   */
  async membersAtLevel(userId: string, level: number, limit: number, offset: number) {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        referral_code: string;
        wallet_address: string;
        sponsor_code: string | null;
        joined_at: Date | null;
        current_rank: number;
        left_volume: number;
        right_volume: number;
        placement_side: string | null;
        placed_under: string | null;
        total: bigint;
      }>
    >`
      WITH RECURSIVE tree(id, depth) AS (
        SELECT id, 1 FROM users WHERE upline_id = ${userId}::uuid
        UNION ALL
        SELECT u.id, t.depth + 1 FROM users u JOIN tree t ON u.upline_id = t.id WHERE t.depth < ${level}
      )
      SELECT u.id::text AS id, u.referral_code, u.wallet_address, s.referral_code AS sponsor_code, u.current_rank,
             u.left_volume, u.right_volume, u.placement_side::text AS placement_side, pl.referral_code AS placed_under,
             (SELECT MIN(p.created_at) FROM packages p WHERE p.user_id = u.id) AS joined_at,
             COUNT(*) OVER () AS total
        FROM tree t
        JOIN users u ON u.id = t.id
        LEFT JOIN users s ON s.id = u.upline_id
        LEFT JOIN users pl ON pl.id = u.placement_id
       WHERE t.depth = ${level}
       ORDER BY joined_at ASC NULLS LAST, u.referral_code
       LIMIT ${limit} OFFSET ${offset}`;
    return { total: rows.length ? Number(rows[0].total) : 0, rows };
  },

  /** members at each of the first 20 levels below the user in the SPONSOR tree (income levels) */
  async membersPerLevel(userId: string) {
    const rows = await cached(
      `levels:${userId}`,
      COUNT_CACHE_SECONDS,
      () => prisma.$queryRaw<Array<{ depth: number; members: number }>>`
      WITH RECURSIVE tree(id, depth) AS (
        SELECT id, 1 FROM users WHERE upline_id = ${userId}::uuid
        UNION ALL
        SELECT u.id, t.depth + 1 FROM users u JOIN tree t ON u.upline_id = t.id WHERE t.depth < 20
      )
      SELECT depth, COUNT(*)::int AS members FROM tree GROUP BY depth`,
    );
    return new Map(rows.map((r) => [Number(r.depth), Number(r.members)]));
  },
};
