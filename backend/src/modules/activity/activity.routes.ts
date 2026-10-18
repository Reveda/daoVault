import { Router } from "express";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { RANKS } from "../plan/plan.js";

/**
 * Landing "Live on-chain pulse" card (owner, 2026-10-12): the latest REAL events from the database,
 * never invented ones: activations / top-ups (each has its BSC transaction), rank rewards and paid
 * withdrawals. Public and anonymous: wallets are cut to 0x1234...abcd (they are public on BscScan
 * anyway); no names, codes or balances. Cached for 30 s so the landing page cannot load the DB.
 */
type Activity = {
  type: "activation" | "topup" | "rank" | "withdrawal";
  wallet: string;
  detail: string;
  amountUsd: number;
  at: string;
  txHash: string | null;
};

const short = (w: string) => `${w.slice(0, 6)}...${w.slice(-4)}`;
let cache: { at: number; items: Activity[] } | null = null;

async function recentActivity(): Promise<Activity[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.items;
  const [packages, ranks, paid] = await Promise.all([
    prisma.package.findMany({
      // Public activity is reserved for verifiable on-chain business. Future system-assigned
      // packages (for example POWER_BUSINESS) must never appear as activations/top-ups here.
      where: { source: "ON_CHAIN" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        createdAt: true,
        packageAmount: true,
        activationTxHash: true,
        userId: true,
        user: { select: { walletAddress: true } },
      },
    }),
    prisma.earning.findMany({
      where: { type: "RANK_REWARD" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { createdAt: true, amountUsd: true, recipient: { select: { walletAddress: true } } },
    }),
    prisma.withdrawal.findMany({
      where: { status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        updatedAt: true,
        netAmount: true,
        payoutTxHash: true,
        user: { select: { walletAddress: true } },
      },
    }),
  ]);
  // a package is a top-up when the same member already had an older one
  const firsts = await prisma.package.groupBy({
    by: ["userId"],
    where: { userId: { in: packages.map((p) => p.userId) } },
    _min: { createdAt: true },
  });
  const firstAt = new Map(firsts.map((f) => [f.userId, f._min.createdAt?.getTime()]));

  const items: Activity[] = [
    ...packages.map((p) => {
      const topup = firstAt.get(p.userId) !== p.createdAt.getTime();
      return {
        type: topup ? ("topup" as const) : ("activation" as const),
        wallet: short(p.user.walletAddress),
        detail: topup ? "Topped up a package" : "Activated an ID",
        amountUsd: Number(p.packageAmount),
        at: p.createdAt.toISOString(),
        txHash: p.activationTxHash,
      };
    }),
    ...ranks.map((r) => {
      const rank = RANKS.find((k) => Number(k.rewardUsd) === Number(r.amountUsd));
      return {
        type: "rank" as const,
        wallet: short(r.recipient.walletAddress),
        detail: rank ? `Reached ${rank.name}` : "Reached a new rank",
        amountUsd: Number(r.amountUsd),
        at: r.createdAt.toISOString(),
        txHash: null,
      };
    }),
    ...paid.map((w) => ({
      type: "withdrawal" as const,
      wallet: short(w.user.walletAddress),
      detail: "Withdrew to wallet",
      amountUsd: Number(w.netAmount),
      at: w.updatedAt.toISOString(),
      txHash: w.payoutTxHash,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  cache = { at: Date.now(), items };
  return items;
}

export const activityRouter = Router();

/**
 * ?v=2 (owner, 2026-10-15: "everything real at launch"): { items, live }. live = payments are open
 * (PAYMENTS_OPEN_AT, server clock): from then on the landing never shows sample events, only real
 * ones or "waiting for the first activation". Without ?v=2 the plain list (an older cached page).
 */
activityRouter.get("/recent", async (req, res, next) => {
  try {
    const items = await recentActivity();
    if (req.query.v === "2") {
      res.json({
        success: true,
        data: { items, live: env.PAYMENTS_OPEN_AT.getTime() <= Date.now() },
      });
    } else {
      res.json({ success: true, data: items });
    }
  } catch (error) {
    next(error);
  }
});
