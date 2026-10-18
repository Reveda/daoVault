import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { isRootWallet, rootWallet } from "../../config/root.js";
import { isAdminWallet } from "../auth/auth.service.js";
import {
  DV_TOKENS_PER_PACKAGE,
  DV_TOKEN_LAUNCH,
  DV_TOKEN_LAUNCH_DATE,
  FAST_START,
  FAST_START_DIRECTS,
  LEVELS,
  RANKS,
  fromCents,
  isLevelUnlocked,
  matchedVolume,
  rankForLegs,
  summarizeLegs,
  toCents,
  unlockedLevels,
} from "../plan/plan.js";
import { balanceOf } from "../withdrawals/withdrawals.service.js";
import { dashboardRepository } from "./dashboard.repository.js";

type PowerRecord = { amountUsd: { toString(): string }; side: "LEFT" | "RIGHT" };
type Sides = { left: number; right: number };

/**
 * Power Business (owner, 2026-10-15) is VIRTUAL business: display only, never income, rank
 * rewards, withdrawals or DV tokens. Its rank uses the SAME rule as the official one (the DAO on
 * EACH side). It counts ONLY for the member it was given to (never in an upline's legs); each
 * record goes WHOLE into the member's LEFT or RIGHT side (binary placement, owner 2026-10-17).
 * 1 DAO = one $300 package. `official` = the member's own Left / Right business.
 */
function powerSides(official: Sides, records: PowerRecord[]) {
  const daoCents = toCents(env.ACTIVATION_AMOUNT_USDT);
  const daoOf = (cents: number) => Math.floor(cents / daoCents);
  let totalCents = 0,
    leftCents = 0,
    rightCents = 0;
  for (const entry of records) {
    const cents = toCents(entry.amountUsd.toString());
    totalCents += cents;
    if (entry.side === "RIGHT") rightCents += cents;
    else leftCents += cents;
  }
  const sides = {
    left: official.left + daoOf(leftCents),
    right: official.right + daoOf(rightCents),
  };
  return {
    totalCents,
    dao: daoOf(totalCents),
    sides,
    summary: summarizeLegs([sides.left, sides.right]),
  };
}

export class DashboardService {
  async getDashboard(walletAddress: string) {
    const user = await dashboardRepository.findUserDashboard(walletAddress.toLowerCase());
    if (!user) {
      const error = new Error("User not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    const root = rootWallet();
    const [
      byType,
      byLevel,
      recent,
      perLevel,
      perSide,
      balance,
      directsAt,
      fastStartEarned,
      company,
    ] = await Promise.all([
      dashboardRepository.earningsByType(user.id),
      dashboardRepository.earningsByLevel(user.id),
      dashboardRepository.recentEarnings(user.id),
      dashboardRepository.membersPerLevel(user.id),
      dashboardRepository.membersPerSide(user.id),
      balanceOf(prisma, user.id),
      dashboardRepository.directActivations(user.id),
      prisma.earning.findFirst({
        where: { recipientId: user.id, type: "FAST_START_BONUS" },
        select: { level: true },
      }),
      root
        ? prisma.user.findUnique({ where: { walletAddress: root }, select: { referralCode: true } })
        : null,
    ]);

    // money: DECIMAL from Postgres -> exact integer cents -> dollars (never a float sum)
    const sumOf = (type: string) =>
      fromCents(toCents(String(byType.find((t) => t.type === type)?._sum.amountUsd ?? 0)));
    const levelIncomeUsd = sumOf("LEVEL_COMMISSION");
    const rankRewardsUsd = sumOf("RANK_REWARD");
    const bonusUsd = sumOf("FAST_START_BONUS");
    // fast-start bonus (owner, 2026-10-18): always sent, so the dashboard shows both bonuses from the
    // first visit; the clock (deadlines + direct counts) starts at the member's own activation
    const joinedAt = user.packages[0] ? (user.packages[0].paidAt ?? user.packages[0].createdAt) : null;
    const fastStart = {
      // the company root earns nothing itself
      eligible: !isRootWallet(user.walletAddress),
      directsNeeded: FAST_START_DIRECTS,
      joinedAt: joinedAt?.toISOString() ?? null,
      earnedUsd: bonusUsd,
      earnedDays: fastStartEarned?.level ?? null,
      tiers: FAST_START.map((t) => {
        const deadline = joinedAt ? joinedAt.getTime() + t.days * 86_400_000 : null;
        return {
          name: t.name,
          days: t.days,
          rewardUsd: t.rewardUsd,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          directs: deadline ? directsAt.filter((at) => at <= deadline).length : 0,
        };
      }),
    };
    // binary placement (owner, 2026-10-17): the member's Left / Right business, official volume only
    const sides = { left: user.leftVolume, right: user.rightVolume };
    const legSummary = summarizeLegs([sides.left, sides.right]);
    // Power Business: display only, for this member alone (see powerSides)
    const pb = powerSides(sides, user.powerBusinesses);
    const virtualRank = Math.max(user.currentRank, rankForLegs(pb.summary));
    const nextVirtual = RANKS[virtualRank];
    // the package earning now: the oldest still ACTIVE (top-ups wait in line), else the latest
    const currentPackage =
      user.packages.find((p) => p.status === "ACTIVE") ??
      user.packages[user.packages.length - 1] ??
      null;
    const isRoot = isRootWallet(user.walletAddress);
    const next = RANKS[user.currentRank];
    // 25x cap (owner, 2026-10-18): every package adds its own $7,500 and the caps add up; all income
    // fills them oldest first. Totals over every package the member holds.
    const capTotalCents = user.packages.reduce((s, p) => s + toCents(p.maxCapLimit.toString()), 0);
    const capEarnedCents = user.packages.reduce((s, p) => s + toCents(p.totalEarned.toString()), 0);

    return {
      walletAddress: user.walletAddress,
      referralCode: user.referralCode,
      sponsorCode: user.upline?.referralCode ?? null,
      // the company root's invite code: a member who arrives without a referral joins under it (owner, 2026-10-18)
      companyCode: company?.referralCode ?? null,
      // company root (treasury): activated without paying, sponsors anyone, earns nothing itself
      isRoot,
      // admin (ADMIN_WALLETS; the company wallet): its dashboard also shows the company overview
      isAdmin: isAdminWallet(user.walletAddress),
      // the invite code the member joined with (users.joinTeam); before payment only
      pendingSponsorCode: user.packages.length ? null : (user.pendingSponsorCode ?? null),
      // binary placement (owner, 2026-10-17): where the member sits; null = has not joined a team yet
      placement: user.placementSide
        ? { side: user.placementSide, underCode: user.placement?.referralCode ?? null }
        : null,
      // pre-launch marketing (owner, 2026-10-13): "Pay & Activate" shows only from this moment (server clock)
      paymentsOpenAt: env.PAYMENTS_OPEN_AT.toISOString(),
      paymentsOpen: env.PAYMENTS_OPEN_AT.getTime() <= Date.now(),
      activeDirects: user.activeDirectsCount,
      levelsUnlocked: unlockedLevels(user.activeDirectsCount),
      currentRank: user.currentRank,
      rankName: RANKS[user.currentRank - 1]?.name ?? null,
      teamVolume: user.teamVolume,
      // Left / Right business (DAO) and members (paid or not, all depths) of the placement tree
      legs: {
        left: sides.left,
        right: sides.right,
        total: sides.left + sides.right,
        leftMembers: perSide.left,
        rightMembers: perSide.right,
      },
      nextRank: next
        ? {
            rank: next.rank,
            name: next.name,
            volume: next.volume,
            rewardUsd: next.rewardUsd,
            // matched DAO so far: the smaller of the Left and Right sides
            countedVolume: matchedVolume(legSummary),
          }
        : null,
      totalEarned: fromCents(toCents(levelIncomeUsd) + toCents(rankRewardsUsd) + toCents(bonusUsd)),
      levelIncomeUsd,
      rankRewardsUsd,
      // fast-start bonus (Rocket Start $100 in 3 days / Fast Start $50 in 7 days): paid + progress
      bonusUsd,
      fastStart,
      // Power Business (see powerSides): display only, never earnings, balance, withdrawals or rank rewards.
      // Its internal references / notes are not sent to the browser.
      powerBusiness: {
        totalUsd: fromCents(pb.totalCents),
        dao: pb.dao,
        // both sides with the virtual business added (official volume included)
        legs: { left: pb.sides.left, right: pb.sides.right, matched: matchedVolume(pb.summary) },
        rank: virtualRank,
        rankName: RANKS[virtualRank - 1]?.name ?? null,
        nextRank: nextVirtual
          ? { rank: nextVirtual.rank, name: nextVirtual.name, volume: nextVirtual.volume }
          : null,
      },
      availableUsd: fromCents(balance.availableCents),
      pendingWithdrawalUsd: fromCents(balance.pendingCents),
      withdrawnUsd: fromCents(balance.withdrawnCents),
      packages: user.packages, // oldest first: [0] is the activation
      currentPackage,
      packageCount: user.packages.length,
      // the member's whole cap: $7,500 per package, added up, and what all packages have earned so far
      capTotalUsd: fromCents(capTotalCents),
      capEarnedUsd: fromCents(capEarnedCents),
      // DV token allocation (owner, 2026-10-15): 1,500 DV per package; the company root holds none
      dvToken: {
        perPackage: DV_TOKENS_PER_PACKAGE,
        allocated: isRoot ? 0 : user.packages.length * DV_TOKENS_PER_PACKAGE,
        launch: DV_TOKEN_LAUNCH,
        launchDate: DV_TOKEN_LAUNCH_DATE,
        network: "BNB Smart Chain",
      },
      // another $300 package at any time (owner, 2026-10-18): each one adds $7,500 to the cap
      canTopUp: !isRoot && user.packages.length > 0,
      levels: LEVELS.map((l) => {
        const earned = byLevel.find((b) => b.level === l.level);
        return {
          level: l.level,
          pct: l.pct,
          reqDirects: l.reqDirects,
          unlocked: isLevelUnlocked(l.level, user.activeDirectsCount),
          members: perLevel.get(l.level) ?? 0,
          earnedUsd: fromCents(toCents(String(earned?._sum.amountUsd ?? 0))),
        };
      }),
      recentEarnings: recent.map((e) => ({
        type: e.type,
        level: e.level,
        amountUsd: fromCents(toCents(e.amountUsd.toString())),
        from: e.source.walletAddress,
        at: e.createdAt,
      })),
    };
  }

  /** Who joined at one level of the member's downline (dashboard level modal), 50 per page. */
  async getLevelMembers(walletAddress: string, level: number, page: number) {
    const user = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
      select: { id: true },
    });
    if (!user) {
      const error = new Error("User not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    const pageSize = 50;
    const { total, rows } = await dashboardRepository.membersAtLevel(
      user.id,
      level,
      pageSize,
      (page - 1) * pageSize,
    );
    // rank shown for each member = the same rank their own dashboard shows: the official one, or the
    // higher one reached with their Power Business (owner, 2026-10-15). Only the few members that hold
    // Power Business need their legs read.
    const withPower = await prisma.powerBusiness.findMany({
      where: { userId: { in: rows.map((r) => r.id) } },
      select: { userId: true, amountUsd: true, side: true },
    });
    const shownRank = new Map(rows.map((r) => [r.id, r.current_rank]));
    for (const r of rows) {
      const records = withPower.filter((p) => p.userId === r.id);
      if (!records.length) continue;
      const pb = powerSides({ left: r.left_volume, right: r.right_volume }, records);
      shownRank.set(r.id, Math.max(r.current_rank, rankForLegs(pb.summary)));
    }
    return {
      level,
      total,
      page,
      pageSize,
      members: rows.map((r) => ({
        referralCode: r.referral_code,
        wallet: `${r.wallet_address.slice(0, 6)}…${r.wallet_address.slice(-4)}`,
        sponsorCode: r.sponsor_code,
        // where this member sits in the placement tree (null = has not joined a side yet)
        placement: r.placement_side ? { side: r.placement_side, underCode: r.placed_under } : null,
        joinedAt: r.joined_at ? r.joined_at.toISOString() : null,
        rank: shownRank.get(r.id) ?? 0,
        rankName: RANKS[(shownRank.get(r.id) ?? 0) - 1]?.name ?? null,
      })),
    };
  }
}

export const dashboardService = new DashboardService();
