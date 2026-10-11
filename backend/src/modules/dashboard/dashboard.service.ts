import { prisma } from "../../config/prisma.js";
import { isRootWallet } from "../../config/root.js";
import { isAdminWallet } from "../auth/auth.service.js";
import { LEVELS, RANKS, fromCents, isLevelUnlocked, matchedVolume, summarizeLegs, toCents, unlockedLevels } from "../plan/plan.js";
import { balanceOf } from "../withdrawals/withdrawals.service.js";
import { dashboardRepository } from "./dashboard.repository.js";

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

    const sumOf = (type: string) => Number(byType.find((t) => t.type === type)?._sum.amountUsd ?? 0);
    const levelIncomeUsd = sumOf("LEVEL_COMMISSION");
    const rankRewardsUsd = sumOf("RANK_REWARD");
    const legVolumes = legs.map((l) => l.teamVolume + l._count.packages); // 1 DAO per package, top-ups included
    const legSummary = summarizeLegs(legVolumes);
    // members on each side (owner, 2026-10-11, All Ranks tree): the strong leg is the direct with the
    // most DAO (summarizeLegs), the other side is every other direct's leg together
    const strongIndex = legVolumes.length ? legVolumes.indexOf(Math.max(...legVolumes)) : -1;
    const teamMembers = [...perLeg.values()].reduce((s, n) => s + n, 0);
    const strongMembers = strongIndex >= 0 ? perLeg.get(legs[strongIndex].id) ?? 0 : 0;
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
      activeDirects: user.activeDirectsCount,
      levelsUnlocked: unlockedLevels(user.activeDirectsCount),
      currentRank: user.currentRank,
      rankName: RANKS[user.currentRank - 1]?.name ?? null,
      teamVolume: user.teamVolume,
      legs: { ...legSummary, count: legs.length, powerMembers: strongMembers, otherMembers: teamMembers - strongMembers },
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
      availableUsd: fromCents(balance.availableCents),
      pendingWithdrawalUsd: fromCents(balance.pendingCents),
      withdrawnUsd: fromCents(balance.withdrawnCents),
      packages: user.packages, // oldest first: [0] is the activation
      currentPackage,
      packageCount: user.packages.length,
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
          earnedUsd: Number(earned?._sum.amountUsd ?? 0),
        };
      }),
      recentEarnings: recent.map((e) => ({
        type: e.type,
        level: e.level,
        amountUsd: Number(e.amountUsd),
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
      })),
    };
  }
}

export const dashboardService = new DashboardService();
