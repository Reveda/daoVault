import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { isRootWallet } from "../../config/root.js";
import { isAdminWallet } from "../auth/auth.service.js";
import { DV_TOKENS_PER_PACKAGE, DV_TOKEN_LAUNCH, DV_TOKEN_LAUNCH_DATE, LEVELS, RANKS, fromCents, isLevelUnlocked, matchedVolume, rankForLegs, summarizeLegs, toCents, unlockedLevels } from "../plan/plan.js";
import { balanceOf } from "../withdrawals/withdrawals.service.js";
import { dashboardRepository } from "./dashboard.repository.js";

type PowerRecord = { amountUsd: { toString(): string }; legUserId: string | null };

/**
 * Power Business (owner, 2026-10-15) is VIRTUAL business: display only, never income, rank
 * rewards, withdrawals or DV tokens. Its rank uses the SAME rule as the official one (the DAO on
 * EACH side). It counts ONLY for the member it was given to (owner, 2026-10-15: never in an
 * upline's legs): each record goes WHOLE into the leg it was placed in (legUserId, one side only);
 * records without a valid leg (e.g. no directs yet) together form ONE extra side of their own, so
 * the member's real business fills the other side. 1 DAO = one $300 package.
 * `legVolumes` = the official DAO of each direct's leg, in the order of `legs`. The returned
 * volumes keep that order; the own side (no members) is last when present.
 */
function powerSides(legs: Array<{ id: string }>, legVolumes: number[], records: PowerRecord[]) {
  const daoCents = toCents(env.ACTIVATION_AMOUNT_USDT);
  const daoOf = (cents: number) => Math.floor(cents / daoCents);
  const directIds = new Set(legs.map((l) => l.id));
  const byLeg = new Map<string, number>();
  let totalCents = 0;
  let unplacedCents = 0;
  for (const entry of records) {
    const cents = toCents(entry.amountUsd.toString());
    totalCents += cents;
    if (entry.legUserId && directIds.has(entry.legUserId)) byLeg.set(entry.legUserId, (byLeg.get(entry.legUserId) ?? 0) + cents);
    else unplacedCents += cents;
  }
  const unplacedDao = daoOf(unplacedCents);
  const volumes = [
    ...legs.map((l, i) => legVolumes[i] + daoOf(byLeg.get(l.id) ?? 0)),
    ...(unplacedDao > 0 ? [unplacedDao] : []),
  ];
  return { totalCents, dao: daoOf(totalCents), volumes, legs: summarizeLegs(volumes) };
}

/** official DAO of each direct's leg (the direct's counted packages + its team volume) */
const officialVolumes = (legs: Array<{ teamVolume: number; _count: { packages: number } }>) =>
  legs.map((l) => l.teamVolume + l._count.packages);

export class DashboardService {
  async getDashboard(walletAddress: string) {
    const user = await dashboardRepository.findUserDashboard(walletAddress.toLowerCase());
    if (!user) {
      const error = new Error("User not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    const [byType, byLevel, recent, legs, perLevel, perLeg, balance] = await Promise.all([
      dashboardRepository.earningsByType(user.id),
      dashboardRepository.earningsByLevel(user.id),
      dashboardRepository.recentEarnings(user.id),
      dashboardRepository.directLegs(user.id),
      dashboardRepository.membersPerLevel(user.id),
      dashboardRepository.membersPerLeg(user.id),
      balanceOf(prisma, user.id),
    ]);

    // money: DECIMAL from Postgres -> exact integer cents -> dollars (never a float sum)
    const sumOf = (type: string) => fromCents(toCents(String(byType.find((t) => t.type === type)?._sum.amountUsd ?? 0)));
    const levelIncomeUsd = sumOf("LEVEL_COMMISSION");
    const rankRewardsUsd = sumOf("RANK_REWARD");
    const legVolumes = officialVolumes(legs); // official volume only
    const legSummary = summarizeLegs(legVolumes);
    // Power Business: display only, for this member alone (see powerSides)
    const pb = powerSides(legs, legVolumes, user.powerBusinesses);
    const ownPowerCents = pb.totalCents;
    const ownPowerDao = pb.dao;
    const virtualVolumes = pb.volumes;
    const virtual = pb.legs;
    const virtualRank = Math.max(user.currentRank, rankForLegs(virtual));
    const nextVirtual = RANKS[virtualRank];
    // members on each side (owner, 2026-10-11, All Ranks tree): the strong leg is the direct with the
    // most DAO (summarizeLegs), the other side is every other direct's leg together. With Power Business
    // the rings show the legs including it, so the counts follow that same split (its own side has no members).
    const sideVolumes = ownPowerCents > 0 ? virtualVolumes : legVolumes;
    const strongIndex = sideVolumes.length ? sideVolumes.indexOf(Math.max(...sideVolumes)) : -1;
    const teamMembers = [...perLeg.values()].reduce((s, n) => s + n, 0);
    const strongMembers = strongIndex >= 0 && strongIndex < legs.length ? perLeg.get(legs[strongIndex].id) ?? 0 : 0;
    // the package earning now: the oldest still ACTIVE (top-ups wait in line), else the latest
    const currentPackage = user.packages.find((p) => p.status === "ACTIVE") ?? user.packages[user.packages.length - 1] ?? null;
    const isRoot = isRootWallet(user.walletAddress);
    const next = RANKS[user.currentRank];

    return {
      walletAddress: user.walletAddress,
      referralCode: user.referralCode,
      sponsorCode: user.upline?.referralCode ?? null,
      // company root (treasury): activated without paying, sponsors anyone, earns nothing itself
      isRoot,
      // admin (ADMIN_WALLETS; the company wallet): its dashboard also shows the company overview
      isAdmin: isAdminWallet(user.walletAddress),
      // before payment: the latest invite code opened (users.savePendingSponsor)
      pendingSponsorCode: user.packages.length ? null : user.pendingSponsorCode ?? null,
      // pre-launch marketing (owner, 2026-10-13): "Pay & Activate" shows only from this moment (server clock)
      paymentsOpenAt: env.PAYMENTS_OPEN_AT.toISOString(),
      paymentsOpen: env.PAYMENTS_OPEN_AT.getTime() <= Date.now(),
      activeDirects: user.activeDirectsCount,
      levelsUnlocked: unlockedLevels(user.activeDirectsCount),
      currentRank: user.currentRank,
      rankName: RANKS[user.currentRank - 1]?.name ?? null,
      teamVolume: user.teamVolume,
      legs: {
        ...legSummary,
        count: legs.length,
        powerMembers: strongMembers,
        otherMembers: teamMembers - strongMembers,
      },
      nextRank: next
        ? {
          rank: next.rank,
          name: next.name,
          volume: next.volume,
          rewardUsd: next.rewardUsd,
          // matched DAO so far: the smaller side (power leg vs other legs combined)
          countedVolume: matchedVolume(legSummary),
        }
        : null,
      totalEarned: fromCents(toCents(levelIncomeUsd) + toCents(rankRewardsUsd)),
      levelIncomeUsd,
      rankRewardsUsd,
      // Power Business (see powerSides): display only, never earnings, balance, withdrawals or rank rewards.
      // Its internal references / notes are not sent to the browser.
      powerBusiness: {
        totalUsd: fromCents(ownPowerCents),
        dao: ownPowerDao,
        // both sides with the virtual business added (official volume included)
        legs: { power: virtual.power, other: virtual.other, matched: matchedVolume(virtual) },
        rank: virtualRank,
        rankName: RANKS[virtualRank - 1]?.name ?? null,
        nextRank: nextVirtual ? { rank: nextVirtual.rank, name: nextVirtual.name, volume: nextVirtual.volume } : null,
      },
      availableUsd: fromCents(balance.availableCents),
      pendingWithdrawalUsd: fromCents(balance.pendingCents),
      withdrawnUsd: fromCents(balance.withdrawnCents),
      packages: user.packages, // oldest first: [0] is the activation
      currentPackage,
      packageCount: user.packages.length,
      // DV token allocation (owner, 2026-10-15): 1,500 DV per package; the company root holds none
      dvToken: {
        perPackage: DV_TOKENS_PER_PACKAGE,
        allocated: isRoot ? 0 : user.packages.length * DV_TOKENS_PER_PACKAGE,
        launch: DV_TOKEN_LAUNCH,
        launchDate: DV_TOKEN_LAUNCH_DATE,
        network: "BNB Smart Chain",
      },
      // re-entry (owner, 2026-10-10): a new $300 package once every package has reached its cap
      canTopUp: !isRoot && user.packages.length > 0 && user.packages.every((p) => p.status !== "ACTIVE"),
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
    const user = await prisma.user.findUnique({ where: { walletAddress: walletAddress.toLowerCase() }, select: { id: true } });
    if (!user) {
      const error = new Error("User not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    const pageSize = 50;
    const { total, rows } = await dashboardRepository.membersAtLevel(user.id, level, pageSize, (page - 1) * pageSize);
    // rank shown for each member = the same rank their own dashboard shows: the official one, or the
    // higher one reached with their Power Business (owner, 2026-10-15). Only the few members that hold
    // Power Business need their legs read.
    const withPower = await prisma.powerBusiness.findMany({
      where: { userId: { in: rows.map((r) => r.id) } },
      select: { userId: true, amountUsd: true, legUserId: true },
    });
    const shownRank = new Map(rows.map((r) => [r.id, r.current_rank]));
    for (const memberId of new Set(withPower.map((p) => p.userId))) {
      const legs = await dashboardRepository.directLegs(memberId);
      const sides = powerSides(legs, officialVolumes(legs), withPower.filter((p) => p.userId === memberId));
      shownRank.set(memberId, Math.max(shownRank.get(memberId) ?? 0, rankForLegs(sides.legs)));
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
        joinedAt: r.joined_at ? r.joined_at.toISOString() : null,
        rank: shownRank.get(r.id) ?? 0,
        rankName: RANKS[(shownRank.get(r.id) ?? 0) - 1]?.name ?? null,
      })),
    };
  }
}

export const dashboardService = new DashboardService();
