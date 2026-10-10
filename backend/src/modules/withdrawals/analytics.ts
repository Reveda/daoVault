import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { rootWallet } from "../../config/root.js";
import { RANKS } from "../plan/plan.js";

const DAYS = 30;

type DayRow = { day: Date; activations: bigint; topups: bigint };
type MoneyRow = { day: Date; level: string | null; rank: string | null };
type PaidRow = { day: Date; paid: string | null };
type RegRow = { day: Date; n: bigint };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Admin analytics (owner, 2026-10-10): the series and splits behind the admin dashboard's
 * charts. Last 30 days per day: payments (first package vs top-up) and money in, money
 * credited (level / rank), USDT paid out, new wallets. Plus commissions per level, members
 * per rank, the company tree per depth under the root, and the top earners.
 */
export async function adminAnalytics() {
  const since = new Date(Date.now() - (DAYS - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const root = rootWallet();

  const [joins, credited, paid, regs, byLevel, byRank, tree, top, packagesBefore, paidBefore] = await Promise.all([
    // a wallet's first package is its activation, any later one a top-up
    prisma.$queryRaw<DayRow[]>`
      WITH p AS (
        SELECT created_at, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS n FROM packages
      )
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*) FILTER (WHERE n = 1) AS activations,
             COUNT(*) FILTER (WHERE n > 1) AS topups
        FROM p WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<MoneyRow[]>`
      SELECT date_trunc('day', created_at) AS day,
             SUM(amount_usd) FILTER (WHERE type = 'LEVEL_COMMISSION')::text AS level,
             SUM(amount_usd) FILTER (WHERE type = 'RANK_REWARD')::text AS rank
        FROM earnings WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<PaidRow[]>`
      SELECT date_trunc('day', COALESCE(reviewed_at, created_at)) AS day, SUM(net_amount)::text AS paid
        FROM withdrawals WHERE status = 'COMPLETED' AND COALESCE(reviewed_at, created_at) >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<RegRow[]>`
      SELECT date_trunc('day', created_at) AS day, COUNT(*) AS n FROM users WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.earning.groupBy({ by: ["level"], where: { type: "LEVEL_COMMISSION" }, _sum: { amountUsd: true }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ["currentRank"], where: { packages: { some: {} } }, _count: { _all: true } }),
    // members per depth under the company root (level 1 = joined with the company link)
    root
      ? prisma.$queryRaw<Array<{ depth: number; n: bigint }>>`
        WITH RECURSIVE t(id, depth) AS (
          SELECT u.id, 1 FROM users u JOIN users r ON u.upline_id = r.id WHERE r.wallet_address = ${root}
          UNION ALL
          SELECT u.id, t.depth + 1 FROM users u JOIN t ON u.upline_id = t.id WHERE t.depth < 20
        )
        SELECT depth, COUNT(*) AS n FROM t GROUP BY depth ORDER BY depth`
      : Promise.resolve([] as Array<{ depth: number; n: bigint }>),
    prisma.earning.groupBy({ by: ["recipientId"], _sum: { amountUsd: true }, orderBy: { _sum: { amountUsd: "desc" } }, take: 50 }),
    // treasury before the window: every $300 received minus every payout made
    prisma.package.count({ where: { createdAt: { lt: since } } }),
    prisma.$queryRaw<Array<{ paid: string | null }>>`
      SELECT SUM(net_amount)::text AS paid FROM withdrawals WHERE status = 'COMPLETED' AND COALESCE(reviewed_at, created_at) < ${since}`,
  ]);

  // one point per day, zero-filled
  const days = Array.from({ length: DAYS }, (_, i) => dayKey(new Date(since.getTime() + i * 86_400_000)));
  const at = <T extends { day: Date }>(rows: T[]) => new Map(rows.map((r) => [dayKey(new Date(r.day)), r]));
  const j = at(joins), c = at(credited), p = at(paid), r = at(regs);
  const amount = Number(env.ACTIVATION_AMOUNT_USDT);
  const series = days.map((d) => {
    const activations = Number(j.get(d)?.activations ?? 0);
    const topups = Number(j.get(d)?.topups ?? 0);
    return {
      day: d,
      activations,
      topups,
      moneyInUsd: (activations + topups) * amount,
      levelUsd: Number(c.get(d)?.level ?? 0),
      rankUsd: Number(c.get(d)?.rank ?? 0),
      paidOutUsd: Number(p.get(d)?.paid ?? 0),
      newWallets: Number(r.get(d)?.n ?? 0),
    };
  });

  const topUsers = await prisma.user.findMany({
    where: { id: { in: top.map((t) => t.recipientId) } },
    select: { id: true, referralCode: true, currentRank: true, activeDirectsCount: true, teamVolume: true },
  });
  const userById = new Map(topUsers.map((u) => [u.id, u]));

  return {
    days: DAYS,
    // treasury on the first day of the window (money in minus payouts so far)
    openingTreasuryUsd: packagesBefore * amount - Number(paidBefore[0]?.paid ?? 0),
    series,
    commissionsByLevel: Array.from({ length: 20 }, (_, i) => {
      const row = byLevel.find((b) => b.level === i + 1);
      return { level: i + 1, usd: Number(row?._sum.amountUsd ?? 0), count: row?._count._all ?? 0 };
    }),
    membersByRank: [{ rank: 0, name: "Unranked" }, ...RANKS.map((t) => ({ rank: t.rank, name: t.name }))].map((t) => ({
      ...t, members: byRank.find((b) => b.currentRank === t.rank)?._count._all ?? 0,
    })),
    treeByDepth: tree.map((t) => ({ depth: Number(t.depth), members: Number(t.n) })),
    topEarners: top.map((t) => {
      const u = userById.get(t.recipientId);
      return { code: u?.referralCode ?? "—", earnedUsd: Number(t._sum.amountUsd ?? 0), rank: u?.currentRank ?? 0, directs: u?.activeDirectsCount ?? 0, team: u?.teamVolume ?? 0 };
    }),
  };
}
