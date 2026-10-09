import { prisma } from "../../config/prisma.js";
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

    const [byType, byLevel, recent, legs, perLevel, balance] = await Promise.all([
      dashboardRepository.earningsByType(user.id),
      dashboardRepository.earningsByLevel(user.id),
      dashboardRepository.recentEarnings(user.id),
      dashboardRepository.directLegs(user.id),
      dashboardRepository.membersPerLevel(user.id),
      balanceOf(prisma, user.id),
    ]);

    const sumOf = (type: string) => Number(byType.find((t) => t.type === type)?._sum.amountUsd ?? 0);
    const levelIncomeUsd = sumOf("LEVEL_COMMISSION");
    const rankRewardsUsd = sumOf("RANK_REWARD");
    const legSummary = summarizeLegs(legs.map((l) => l.teamVolume + (l._count.packages > 0 ? 1 : 0)));
    const next = RANKS[user.currentRank];

    return {
      walletAddress: user.walletAddress,
      referralCode: user.referralCode,
      sponsorCode: user.upline?.referralCode ?? null,
      // before payment: the latest invite code opened (users.savePendingSponsor)
      pendingSponsorCode: user.packages.length ? null : user.pendingSponsorCode ?? null,
      activeDirects: user.activeDirectsCount,
      levelsUnlocked: unlockedLevels(user.activeDirectsCount),
      currentRank: user.currentRank,
      rankName: RANKS[user.currentRank - 1]?.name ?? null,
      teamVolume: user.teamVolume,
      legs: { ...legSummary, count: legs.length },
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
      packages: user.packages,
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
